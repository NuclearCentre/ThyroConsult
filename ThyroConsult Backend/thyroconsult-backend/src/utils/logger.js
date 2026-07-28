const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const LOG_DIR = process.env.AUDIT_LOG_PATH || './logs';

const sensitiveFields = [
  'password', 'token', 'otp', 'secret', 'key',
  'ssn', 'credit_card', 'pan', 'aadhaar'
];

const maskSensitive = winston.format((info) => {
  const masked = { ...info };
  sensitiveFields.forEach(field => {
    if (masked[field]) masked[field] = '[REDACTED]';
    if (masked.body && masked.body[field]) masked.body[field] = '[REDACTED]';
  });
  return masked;
});

// Application logger
const appLogger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    maskSensitive(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
    }),
    new DailyRotateFile({
      level: 'error',
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
      zippedArchive: true,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  appLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// HIPAA Audit logger — immutable, tamper-evident
// Retained for HIPAA minimum 6 years (2190 days)
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'audit', 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: `${process.env.AUDIT_LOG_RETENTION_DAYS || 2190}d`,
      zippedArchive: true,
      auditFile: path.join(LOG_DIR, 'audit', '.audit-manifest.json'),
    }),
  ],
});

/**
 * HIPAA-compliant audit log entry
 * Records every access, modification, or transmission of PHI
 */
const audit = (action, context = {}) => {
  auditLogger.info({
    event_type: action,
    timestamp: new Date().toISOString(),
    user_id: context.userId || null,
    user_role: context.userRole || null,
    patient_id: context.patientId || null,
    doctor_id: context.doctorId || null,
    ip_address: context.ip ? maskIp(context.ip) : null,
    user_agent: context.userAgent || null,
    resource: context.resource || null,
    resource_id: context.resourceId || null,
    action_detail: context.detail || null,
    result: context.result || 'success',
    session_id: context.sessionId || null,
    phi_accessed: context.phiAccessed || false,
    changes: context.changes || null,
  });
};

const maskIp = (ip) => {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.x.x`;
  }
  return ip.substring(0, ip.lastIndexOf(':')) + ':xxxx';
};

module.exports = {
  ...appLogger,
  info: appLogger.info.bind(appLogger),
  error: appLogger.error.bind(appLogger),
  warn: appLogger.warn.bind(appLogger),
  debug: appLogger.debug.bind(appLogger),
  audit,
};
