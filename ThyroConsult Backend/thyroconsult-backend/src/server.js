require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const morgan = require('morgan');
const { testConnection } = require('./config/database');
const logger = require('./utils/logger');
const {
  helmetConfig, corsConfig, generalLimiter, requestId, sanitise,
} = require('./middleware/security');
const routes = require('./routes/index');
const { startNotificationScheduler } = require('./services/notificationScheduler');

// ─── Ensure upload directories exist ────────────────────────
// multer's diskStorage.destination (middleware/security.js) and the
// document-move logic in patientController.js/authController.js all
// write into these folders but never create them — if they don't
// already exist on disk, every upload silently fails with ENOENT. This
// is easy to miss locally since a dev might create ./uploads by hand
// once and forget it's not part of the actual deploy/setup process.
const uploadRoot = process.env.UPLOAD_PATH || './uploads';
for (const sub of ['temp', 'documents', 'photos']) {
  const dir = path.join(uploadRoot, sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created missing upload directory: ${dir}`);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Trust proxy (for correct IP behind reverse proxy) ─────
app.set('trust proxy', 1);

// ─── HTTPS enforcement (production only) ───────────────────
// Redirects HTTP → HTTPS at application level
// Also handled by Nginx in production, but defence-in-depth
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ─── Core middleware ───────────────────────────────────────
app.use(requestId);
app.use(helmetConfig);
app.use(corsConfig);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitise);
app.use(generalLimiter);

// ─── Request logging ───────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
  skip: (req) => req.path === '/api/health',
}));

// ─── Razorpay webhook — raw body needed for signature check
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  if (Buffer.isBuffer(req.body)) req.body = JSON.parse(req.body.toString());
  next();
});

// ─── API Routes ────────────────────────────────────────────
app.use('/api', routes);

// ─── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// ─── Global error handler ──────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || 500;
  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
  });

  const message = process.env.NODE_ENV === 'production'
    ? 'An internal error occurred'
    : err.message;

  res.status(status).json({ error: message, requestId: req.requestId });
});

// ─── Startup checks ────────────────────────────────────────

function checkJwtSecretStrength(secret, name) {
  if (!secret) {
    logger.error(`${name} is not set`);
    return false;
  }
  if (secret.length < 32) {
    logger.error(`${name} is too short — minimum 32 characters required`);
    return false;
  }
  // Must not be a placeholder value
  const weakValues = ['secret', 'changeme', 'password', 'thyroconsult', '12345'];
  if (weakValues.some(w => secret.toLowerCase().includes(w))) {
    logger.error(`${name} appears to be a weak placeholder value — use a strong random secret`);
    return false;
  }
  return true;
}

function checkEncryptionKeyStrength(key, name) {
  if (!key) {
    logger.error(`${name} is not set`);
    return false;
  }
  // AES-256-GCM requires exactly 32 bytes — stored as 64-char hex
  if (key.length !== 64) {
    logger.error(`${name} must be exactly 64 hex characters (32 bytes for AES-256-GCM). Current length: ${key.length}`);
    return false;
  }
  if (!/^[0-9a-fA-F]+$/.test(key)) {
    logger.error(`${name} must be a hex string`);
    return false;
  }
  return true;
}

// ─── Start server ──────────────────────────────────────────
const startServer = async () => {

  // 1. Required env vars
  const required = ['DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'JWT_REFRESH_SECRET',
                    'ENCRYPTION_KEY', 'PHI_ENCRYPTION_KEY', 'PHOTO_ENCRYPTION_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 2. JWT secret strength check
  const jwtOk = checkJwtSecretStrength(process.env.JWT_SECRET, 'JWT_SECRET')
             && checkJwtSecretStrength(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET');
  if (!jwtOk) {
    logger.error('JWT secret validation failed — server will not start');
    process.exit(1);
  }

  // 3. AES-256-GCM encryption key strength check
  const encOk = checkEncryptionKeyStrength(process.env.ENCRYPTION_KEY,       'ENCRYPTION_KEY')
             && checkEncryptionKeyStrength(process.env.PHI_ENCRYPTION_KEY,    'PHI_ENCRYPTION_KEY')
             && checkEncryptionKeyStrength(process.env.PHOTO_ENCRYPTION_KEY,  'PHOTO_ENCRYPTION_KEY');
  if (!encOk) {
    logger.error('Encryption key validation failed — server will not start');
    process.exit(1);
  }

  // 4. Database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.error('Cannot connect to database. Exiting.');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`ThyroConsult API running on port ${PORT}`, {
      env:   process.env.NODE_ENV,
      port:  PORT,
      https: process.env.NODE_ENV === 'production' ? 'enforced' : 'dev-only',
    });

    // Start doctor alert escalation scheduler
    startNotificationScheduler();
  });

  // ─── Graceful shutdown ─────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      const { pool } = require('./config/database');
      await pool.end();
      logger.info('Database pool closed. Goodbye.');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { error: err.message });
    process.exit(1);
  });
};

startServer();

module.exports = app;
