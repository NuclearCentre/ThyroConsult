// src/middleware/auth.js
// JWT verification + RBAC middleware for ThyroConsult

const jwt    = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../utils/logger');
const crypto = require('crypto');

// ─── Core JWT verification ────────────────────────────────────────────────
// Named both `authenticate` (original) and `verifyToken` (used in routes)

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    // Attach user context
    req.user = {
      id:        decoded.sub,
      role:      decoded.role,
      sessionId: decoded.sessionId,
      iat:       decoded.iat,
    };

    // Patient — verify not locked
    if (decoded.role === 'patient') {
      const result = await query(
        'SELECT id, locked_until, registration_complete FROM patients WHERE id = $1',
        [decoded.sub]
      );
      if (!result.rows.length) {
        return res.status(401).json({ error: 'Account not found', code: 'USER_NOT_FOUND' });
      }
      const patient = result.rows[0];
      if (patient.locked_until && new Date(patient.locked_until) > new Date()) {
        return res.status(423).json({ error: 'Account temporarily locked', code: 'ACCOUNT_LOCKED' });
      }
      req.user.registrationComplete = patient.registration_complete;
      req.user.patientId = decoded.sub; // convenience alias used in paymentController
    }

    // Doctor — verify active + not locked
    if (decoded.role === 'doctor') {
      const result = await query(
        'SELECT id, is_active, locked_until FROM doctors WHERE id = $1',
        [decoded.sub]
      );
      if (!result.rows.length || !result.rows[0].is_active) {
        return res.status(401).json({ error: 'Doctor account inactive', code: 'INACTIVE' });
      }
      if (result.rows[0].locked_until && new Date(result.rows[0].locked_until) > new Date()) {
        return res.status(423).json({ error: 'Account temporarily locked', code: 'ACCOUNT_LOCKED' });
      }
    }

    next();
  } catch (err) {
    logger.error('Authentication middleware error', { error: err.message });
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Alias — routes/index.js uses verifyToken
const verifyToken = authenticate;

// ─── Role-based access control ────────────────────────────────────────────
// Original: authorize('admin', 'doctor')
// Alias:    requireRole('admin') — used in routes/index.js

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!roles.includes(req.user.role)) {
    logger.audit('UNAUTHORIZED_ACCESS', {
      userId:   req.user.id,
      userRole: req.user.role,
      ip:       req.ip,
      resource: req.path,
      result:   'failure',
    });
    return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
  }
  next();
};

// Alias — routes/index.js uses requireRole('patient') etc.
const requireRole = (...roles) => authorize(...roles);

// ─── Patient-level data access control ───────────────────────────────────
// Patient: can only access their own data
// Doctor:  can only access patients assigned to them via patient_condition_episodes
// Admin:   passes through

const authorizePatientAccess = async (req, res, next) => {
  const { role, id } = req.user;
  const patientId = req.params.patientId || req.body.patientId;

  if (!patientId) return next();

  if (role === 'patient') {
    if (id !== patientId) {
      logger.audit('UNAUTHORIZED_PHI_ACCESS', {
        userId: id, userRole: role, patientId, ip: req.ip, result: 'blocked',
      });
      return res.status(403).json({ error: 'Access denied', code: 'PATIENT_ACCESS_DENIED' });
    }
  } else if (role === 'doctor') {
    // Check via patient_condition_episodes (the actual workflow table)
    const result = await query(
      `SELECT id FROM patient_condition_episodes
       WHERE primary_doctor_id = $1 AND patient_id = $2
       LIMIT 1`,
      [id, patientId]
    );
    if (!result.rows.length) {
      logger.audit('UNAUTHORIZED_PHI_ACCESS', {
        userId: id, userRole: role, patientId, ip: req.ip, result: 'blocked',
      });
      return res.status(403).json({ error: 'Access denied — not your patient', code: 'NOT_YOUR_PATIENT' });
    }
  }
  // Admins pass through
  next();
};

// ─── HIPAA PHI access audit logger ───────────────────────────────────────

const auditPhiAccess = (resource) => (req, res, next) => {
  const patientId = req.params.patientId || req.body.patientId || req.query.patientId;
  logger.audit('PHI_ACCESS', {
    userId:      req.user?.id,
    userRole:    req.user?.role,
    patientId,
    ip:          req.ip,
    userAgent:   req.get('user-agent'),
    resource,
    resourceId:  req.params.id,
    sessionId:   req.user?.sessionId,
    phiAccessed: true,
  });
  next();
};

// ─── Razorpay webhook signature verifier ─────────────────────────────────

const verifyRazorpayWebhook = (req, res, next) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing webhook signature' });
  }
  const body = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  if (signature !== expectedSignature) {
    logger.warn('Invalid Razorpay webhook signature', { ip: req.ip });
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }
  next();
};

// ─── HIPAA session timeout ────────────────────────────────────────────────
// Rejects requests where the JWT is older than SESSION_TIMEOUT_MINUTES
// Applied per-route on sensitive PHI endpoints (not globally — would break
// long questionnaire sessions where the user is actively typing)

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

module.exports = {
  // Primary names
  authenticate,
  authorize,
  authorizePatientAccess,
  auditPhiAccess,
  verifyRazorpayWebhook,
  sessionTimeout,
  // Aliases used in routes/index.js
  verifyToken,
  requireRole,
};
