const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

// ─── Helmet Security Headers ───────────────────────────────
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
});

// ─── CORS ──────────────────────────────────────────────────
const corsConfig = cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 600,
});

// ─── Rate Limiters ─────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message: { error: 'Too many authentication attempts. Please wait 15 minutes.', code: 'AUTH_RATE_LIMITED' },
  handler: (req, res, next, options) => {
    logger.audit('AUTH_RATE_LIMIT_HIT', {
      ip: req.ip,
      path: req.path,
      result: 'blocked',
    });
    res.status(429).json(options.message);
  },
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  message: { error: 'Too many OTP requests. Please wait 1 minute.', code: 'OTP_RATE_LIMITED' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many upload requests.', code: 'UPLOAD_RATE_LIMITED' },
});

// ─── File Upload Validation ────────────────────────────────
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.env.UPLOAD_PATH || './uploads', 'temp'));
  },
  filename: (req, file, cb) => {
    // Use random name to prevent path traversal
    const randomName = crypto.randomBytes(32).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomName}${ext}`);
  },
});

const documentFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
  }
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Invalid file type detected'));
  }
  cb(null, true);
};

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter: documentFilter,
});

// Photo is captured live — stored as base64 from camera
// Only JPEG from camera stream is accepted
const photoStorage = multer.memoryStorage();
const photoFilter = (req, file, cb) => {
  if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
    return cb(new Error('Only JPEG/PNG images allowed for photo'));
  }
  cb(null, true);
};

const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: photoFilter,
});

// ─── Request ID Middleware ─────────────────────────────────
const requestId = (req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

// ─── HIPAA Session Timeout ─────────────────────────────────
// NOTE: this appears to be dead code — routes/index.js imports
// sessionTimeout from ../middleware/auth (auth.js has an identical copy),
// not from here. Kept in sync anyway rather than left stale, but worth
// confirming nothing else actually requires this one before deleting it.
const sessionTimeout = (req, res, next) => {
  const timeoutMs = (parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 15) * 60 * 1000;
  if (req.user && req.user.iat) {
    const tokenAge = Date.now() - req.user.iat * 1000;
    if (tokenAge > timeoutMs) {
      return res.status(401).json({ error: 'Session timed out', code: 'SESSION_TIMEOUT' });
    }
  }
  next();
};

// ─── Sanitise request body ─────────────────────────────────
const sanitise = (req, res, next) => {
  const sanitiseValue = (val) => {
    if (typeof val === 'string') {
      return val
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .trim();
    }
    // NOTE: arrays are typeof 'object' in JS — without this check they fell
    // into the object branch below, which builds a plain {} keyed by index
    // ('0','1',...) instead of an array. Every array field in every
    // request body (investigations, symptom checklists, medication lists,
    // any JSONB array column) was silently corrupted from [a,b] to
    // {0:a,1:b} on the way in.
    if (Array.isArray(val)) {
      return val.map(sanitiseValue);
    }
    if (typeof val === 'object' && val !== null) {
      const cleaned = {};
      for (const key of Object.keys(val)) {
        cleaned[key] = sanitiseValue(val[key]);
      }
      return cleaned;
    }
    return val;
  };
  if (req.body) req.body = sanitiseValue(req.body);
  next();
};

// ─── Error handler for multer ──────────────────────────────
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File too large. Maximum size is ${parseInt(process.env.MAX_FILE_SIZE_MB) || 5}MB.`, code: 'FILE_TOO_LARGE' });
    }
    return res.status(400).json({ error: err.message, code: 'UPLOAD_ERROR' });
  }
  if (err) {
    return res.status(400).json({ error: err.message, code: 'INVALID_FILE' });
  }
  next();
};

module.exports = {
  helmetConfig,
  corsConfig,
  generalLimiter,
  authLimiter,
  otpLimiter,
  uploadLimiter,
  uploadDocument,
  uploadPhoto,
  requestId,
  sessionTimeout,
  sanitise,
  handleUploadError,
};
