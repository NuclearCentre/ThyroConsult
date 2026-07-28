const { query } = require('../config/database');
const { encryptPHI, decryptPHI, hmacHash } = require('../utils/encryption');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// ─── Platform stats dashboard ─────────────────────────────
const getPlatformStats = async (req, res) => {
  try {
    const stats = await query('SELECT * FROM v_platform_stats');
    const alerts = await query(
      `SELECT event_type, timestamp, user_id, action_detail, result
       FROM audit_logs
       WHERE result IN ('failure','blocked')
         AND timestamp > NOW() - INTERVAL '24 hours'
       ORDER BY timestamp DESC LIMIT 20`
    );
    const doctorStats = await query(
      `SELECT d.id,
              COUNT(a.id) FILTER (WHERE DATE(a.scheduled_at) = CURRENT_DATE) AS today_count,
              COUNT(a.id) FILTER (WHERE a.status = 'completed' AND DATE(a.scheduled_at) = CURRENT_DATE) AS completed_today
       FROM doctors d
       LEFT JOIN appointments a ON a.doctor_id = d.id
       WHERE d.is_active = TRUE
       GROUP BY d.id`
    );

    logger.audit('ADMIN_STATS_VIEWED', {
      userId: req.user.id, userRole: req.user.role, ip: req.ip,
    });

    res.json({
      platform: stats.rows[0],
      recentAlerts: alerts.rows,
      doctorStats: doctorStats.rows,
    });
  } catch (err) {
    logger.error('Get platform stats error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

// ─── List all patients (admin) ────────────────────────────
const listPatients = async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const offset = (page - 1) * limit;

  try {
    let sql = `SELECT id, patient_code, gender, registration_step, registration_complete,
               mobile_verified, email_verified, whatsapp_verified, created_at,
               first_name, last_name
               FROM patients`;
    const params = [];

    if (search) {
      const searchHash = hmacHash(search);
      sql += ' WHERE mobile_hash = $1 OR email_hash = $1';
      params.push(searchHash);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    const countResult = await query('SELECT COUNT(*) FROM patients');

    const patients = result.rows.map(p => ({
      id: p.id,
      patientCode: p.patient_code,
      name: `${decryptPHI(p.first_name)} ${decryptPHI(p.last_name)}`,
      gender: p.gender,
      registrationStep: p.registration_step,
      registrationComplete: p.registration_complete,
      mobileVerified: p.mobile_verified,
      emailVerified: p.email_verified,
      createdAt: p.created_at,
    }));

    res.json({ patients, total: parseInt(countResult.rows[0].count), page, limit });
  } catch (err) {
    logger.error('List patients error', { error: err.message });
    res.status(500).json({ error: 'Failed to list patients' });
  }
};

// ─── List all doctors (admin) ─────────────────────────────
const listDoctors = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, first_name, last_name, specialisation, is_active, is_verified,
              consultation_fee, last_login_at, created_at
       FROM doctors ORDER BY created_at DESC`
    );
    const doctors = result.rows.map(d => ({
      id: d.id,
      name: `Dr. ${decryptPHI(d.first_name)} ${decryptPHI(d.last_name)}`,
      specialisation: d.specialisation,
      isActive: d.is_active,
      isVerified: d.is_verified,
      consultationFee: parseFloat(d.consultation_fee),
      lastLoginAt: d.last_login_at,
      createdAt: d.created_at,
    }));
    res.json({ doctors });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list doctors' });
  }
};

// ─── Create doctor (admin) ────────────────────────────────
const createDoctor = async (req, res) => {
  const {
    firstName, middleName, lastName, email, mobile, password,
    specialisation, qualifications, experienceYears, bio, consultationFee,
  } = req.body;

  try {
    const emailHash = hmacHash(email.toLowerCase());
    const mobileHash = hmacHash(mobile);

    const exists = await query(
      'SELECT id FROM doctors WHERE email_hash = $1 OR mobile_hash = $2',
      [emailHash, mobileHash]
    );
    if (exists.rows.length) {
      return res.status(409).json({ error: 'Doctor email or mobile already registered' });
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    const result = await query(
      `INSERT INTO doctors(
         first_name, middle_name, last_name, email, email_hash, mobile, mobile_hash,
         password_hash, specialisation, qualifications, experience_years, bio,
         consultation_fee, is_verified, created_by
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,$14)
       RETURNING id`,
      [
        encryptPHI(firstName),
        middleName ? encryptPHI(middleName) : null,
        encryptPHI(lastName),
        encryptPHI(email.toLowerCase()),
        emailHash,
        encryptPHI(mobile),
        mobileHash,
        passwordHash,
        specialisation,
        qualifications,
        experienceYears,
        bio,
        consultationFee || process.env.DEFAULT_CONSULTATION_FEE || 1200,
        req.user.id,
      ]
    );

    logger.audit('DOCTOR_CREATED', {
      userId: req.user.id, userRole: req.user.role,
      ip: req.ip, resourceId: result.rows[0].id,
    });

    res.status(201).json({ message: 'Doctor created', doctorId: result.rows[0].id });
  } catch (err) {
    logger.error('Create doctor error', { error: err.message });
    res.status(500).json({ error: 'Failed to create doctor' });
  }
};

// ─── Toggle doctor active/suspended ──────────────────────
const setDoctorStatus = async (req, res) => {
  const { isActive } = req.body;
  try {
    await query('UPDATE doctors SET is_active = $1 WHERE id = $2', [isActive, req.params.id]);
    logger.audit(isActive ? 'DOCTOR_ACTIVATED' : 'DOCTOR_SUSPENDED', {
      userId: req.user.id, userRole: req.user.role,
      ip: req.ip, resourceId: req.params.id,
    });
    res.json({ message: `Doctor ${isActive ? 'activated' : 'suspended'}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update doctor status' });
  }
};

// ─── HIPAA Audit log ──────────────────────────────────────
const getAuditLog = async (req, res) => {
  const { page = 1, limit = 50, eventType, result: resultFilter, from, to, userId } = req.query;
  const offset = (page - 1) * limit;

  try {
    const conditions = ['1=1'];
    const params = [];
    let idx = 1;

    if (eventType) { conditions.push(`event_type = $${idx++}`); params.push(eventType); }
    if (resultFilter) { conditions.push(`result = $${idx++}`); params.push(resultFilter); }
    if (userId) { conditions.push(`user_id = $${idx++}`); params.push(userId); }
    if (from) { conditions.push(`timestamp >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`timestamp <= $${idx++}`); params.push(to); }

    const where = conditions.join(' AND ');

    const logs = await query(
      `SELECT id, event_type, timestamp, user_id, user_role, patient_id,
              ip_address, resource, action_detail, result, phi_accessed
       FROM audit_logs WHERE ${where}
       ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );

    const count = await query(`SELECT COUNT(*) FROM audit_logs WHERE ${where}`, params);

    logger.audit('AUDIT_LOG_VIEWED', {
      userId: req.user.id, userRole: req.user.role, ip: req.ip,
    });

    res.json({ logs: logs.rows, total: parseInt(count.rows[0].count), page, limit });
  } catch (err) {
    logger.error('Get audit log error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
};

// ─── Export audit log as CSV ──────────────────────────────
const exportAuditLog = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, event_type, timestamp, user_id, user_role, patient_id,
              ip_address, resource, action_detail, result, phi_accessed
       FROM audit_logs WHERE timestamp >= NOW() - INTERVAL '30 days'
       ORDER BY timestamp DESC`
    );

    const headers = Object.keys(result.rows[0] || {}).join(',');
    const rows = result.rows.map(r =>
      Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers, ...rows].join('\n');

    logger.audit('AUDIT_LOG_EXPORTED', {
      userId: req.user.id, userRole: req.user.role, ip: req.ip,
    });

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export audit log' });
  }
};

// ─── Payment reports ──────────────────────────────────────
const getPaymentReport = async (req, res) => {
  const { month, year } = req.query;
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  try {
    const result = await query(
      `SELECT p.id, p.invoice_number, p.total_amount, p.status, p.paid_at,
              p.payment_method, p.razorpay_payment_id,
              pt.patient_code,
              pt.first_name AS pt_first, pt.last_name AS pt_last,
              d.first_name AS doc_first, d.last_name AS doc_last
       FROM payments p
       JOIN patients pt ON p.patient_id = pt.id
       JOIN doctors d ON p.doctor_id = d.id
       WHERE EXTRACT(MONTH FROM p.created_at) = $1
         AND EXTRACT(YEAR FROM p.created_at) = $2
       ORDER BY p.created_at DESC`,
      [targetMonth, targetYear]
    );

    const payments = result.rows.map(r => ({
      id: r.id, invoiceNumber: r.invoice_number,
      amount: parseFloat(r.total_amount), status: r.status,
      paidAt: r.paid_at, method: r.payment_method,
      transactionId: r.razorpay_payment_id,
      patientCode: r.patient_code,
      patientName: `${decryptPHI(r.pt_first)} ${decryptPHI(r.pt_last)}`,
      doctorName: `Dr. ${decryptPHI(r.doc_first)} ${decryptPHI(r.doc_last)}`,
    }));

    const summary = {
      total: payments.reduce((s, p) => s + (p.status === 'confirmed' ? p.amount : 0), 0),
      count: payments.filter(p => p.status === 'confirmed').length,
      pending: payments.filter(p => p.status === 'pending').length,
    };

    res.json({ payments, summary });
  } catch (err) {
    logger.error('Get payment report error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch payment report' });
  }
};

// ─── Encryption status (read-only) ───────────────────────
const getEncryptionStatus = async (req, res) => {
  res.json({
    dataAtRest: { algorithm: 'AES-256-GCM', status: 'active', scope: 'All PHI fields' },
    dataInTransit: { algorithm: 'TLS 1.3', status: 'active', scope: 'All endpoints' },
    phiFieldLevel: { algorithm: 'AES-256-GCM + HMAC-SHA256', status: 'active', phiFields: 24 },
    photoVault: { algorithm: 'AES-256-GCM', status: 'active', storage: 'isolated' },
    documentStorage: { algorithm: 'AES-256 + SHA-256 integrity', status: 'active' },
    authTokens: { algorithm: 'RS256 JWT', status: 'active', expiry: '15 minutes' },
    keyRotation: {
      jwtKey: '30 days',
      photoVaultKey: '90 days',
      dbMasterKey: 'AWS KMS auto-rotate',
    },
  });
};

module.exports = {
  getPlatformStats, listPatients, listDoctors,
  createDoctor, setDoctorStatus,
  getAuditLog, exportAuditLog,
  getPaymentReport, getEncryptionStatus,
};
