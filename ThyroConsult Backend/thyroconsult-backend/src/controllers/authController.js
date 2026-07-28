const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/database');
const { encryptPHI, decryptPHI, hmacHash, generateToken } = require('../utils/encryption');
const { sendOTP, verifyOTP } = require('../services/notificationService');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

// ─── Token Generation ──────────────────────────────────────
const generateTokenPair = async (userId, role, ip, userAgent) => {
  const sessionId = uuidv4();
  const accessToken = jwt.sign(
    { sub: userId, role, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m', issuer: 'thyroconsult' }
  );

  const refreshToken = generateToken(64);
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO refresh_tokens(user_id, user_role, token_hash, expires_at, ip_address, user_agent)
     VALUES($1, $2, $3, $4, $5, $6)`,
    [userId, role, refreshTokenHash, expiresAt, ip, userAgent]
  );

  return { accessToken, refreshToken, sessionId };
};

// ─── Patient Registration - Step 1: Personal Info ──────────
const registerPatientStep1 = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    firstName, middleName, lastName,
    guardianName, guardianRelation,
    dob, dobAutoCalculated,
    gender, bloodGroup,
    addressLine1, addressLine2, city, state, pincode,
    mobile, whatsapp, email,
    password,
  } = req.body;

  try {
    // Check uniqueness using HMAC hashes
    const mobileHash = hmacHash(mobile);
    const emailHash = hmacHash(email.toLowerCase());

    const existing = await query(
      'SELECT id FROM patients WHERE mobile_hash = $1 OR email_hash = $2',
      [mobileHash, emailHash]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Mobile or email already registered', code: 'DUPLICATE' });
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    const whatsappHash = whatsapp ? hmacHash(whatsapp) : null;

    // Encrypt all PHI
    const patientData = {
      mobile: encryptPHI(mobile),
      mobile_hash: mobileHash,
      whatsapp: whatsapp ? encryptPHI(whatsapp) : null,
      whatsapp_hash: whatsappHash,
      email: encryptPHI(email.toLowerCase()),
      email_hash: emailHash,
      password_hash: passwordHash,
      first_name: encryptPHI(firstName),
      middle_name: middleName ? encryptPHI(middleName) : null,
      last_name: encryptPHI(lastName),
      guardian_name: guardianName ? encryptPHI(guardianName) : null,
      guardian_relation: guardianRelation || null,
      dob: dob ? encryptPHI(dob) : null,
      dob_auto_calculated: dobAutoCalculated || false,
      gender,
      blood_group: bloodGroup || null,
      address_line1: addressLine1 ? encryptPHI(addressLine1) : null,
      address_line2: addressLine2 ? encryptPHI(addressLine2) : null,
      city: city ? encryptPHI(city) : null,
      state: state ? encryptPHI(state) : null,
      pincode: pincode ? encryptPHI(pincode) : null,
      registration_step: 1,
    };

    const result = await query(
      `INSERT INTO patients
       (mobile, mobile_hash, whatsapp, whatsapp_hash, email, email_hash,
        password_hash, first_name, middle_name, last_name, guardian_name,
        guardian_relation, dob, dob_auto_calculated, gender, blood_group,
        address_line1, address_line2, city, state, pincode, registration_step)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING id, patient_code`,
      Object.values(patientData)
    );

    const patient = result.rows[0];

    logger.audit('PATIENT_REGISTERED_STEP1', {
      patientId: patient.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Auto-save: return patientId for subsequent steps
    res.status(201).json({
      message: 'Step 1 saved successfully',
      patientId: patient.id,
      patientCode: patient.patient_code,
      nextStep: 2,
    });
  } catch (err) {
    logger.error('Patient registration step 1 error', { error: err.message });
    res.status(500).json({ error: 'Registration failed' });
  }
};

// ─── Step 2: Send OTPs ─────────────────────────────────────
const sendVerificationOTPs = async (req, res) => {
  const { patientId, channel } = req.body;
  // channel: 'mobile' | 'whatsapp' | 'email'

  try {
    const result = await query(
      'SELECT mobile, whatsapp, email FROM patients WHERE id = $1',
      [patientId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = result.rows[0];
    let destination, purpose, notifChannel;

    if (channel === 'mobile') {
      destination = decryptPHI(patient.mobile);
      purpose = 'mobile_verify';
      notifChannel = 'sms';
    } else if (channel === 'whatsapp') {
      destination = decryptPHI(patient.whatsapp || patient.mobile);
      purpose = 'whatsapp_verify';
      notifChannel = 'whatsapp';
    } else if (channel === 'email') {
      destination = decryptPHI(patient.email);
      purpose = 'email_verify';
      notifChannel = 'email';
    } else {
      return res.status(400).json({ error: 'Invalid channel' });
    }

    await sendOTP(notifChannel, destination, purpose, req.ip);

    logger.audit('OTP_SENT', {
      patientId,
      ip: req.ip,
      resource: channel,
      detail: `OTP sent via ${channel}`,
    });

    res.json({ message: `OTP sent via ${channel}`, channel });
  } catch (err) {
    logger.error('Send OTP error', { error: err.message });
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

// ─── Step 2: Verify OTPs ───────────────────────────────────
const verifyContactOTP = async (req, res) => {
  const { patientId, channel, otp } = req.body;

  try {
    const result = await query(
      'SELECT mobile, whatsapp, email FROM patients WHERE id = $1',
      [patientId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Patient not found' });

    const patient = result.rows[0];
    let identifier, purpose, updateField;

    if (channel === 'mobile') {
      identifier = decryptPHI(patient.mobile);
      purpose = 'mobile_verify';
      updateField = 'mobile_verified';
    } else if (channel === 'whatsapp') {
      identifier = decryptPHI(patient.whatsapp || patient.mobile);
      purpose = 'whatsapp_verify';
      updateField = 'whatsapp_verified';
    } else if (channel === 'email') {
      identifier = decryptPHI(patient.email);
      purpose = 'email_verify';
      updateField = 'email_verified';
    } else {
      return res.status(400).json({ error: 'Invalid channel' });
    }

    const { valid, reason } = await verifyOTP(identifier, purpose, otp);
    if (!valid) {
      logger.audit('OTP_VERIFICATION_FAILED', { patientId, ip: req.ip, detail: reason });
      return res.status(400).json({ error: reason, code: 'OTP_INVALID' });
    }

    await query(`UPDATE patients SET ${updateField} = TRUE WHERE id = $1`, [patientId]);

    // Check if all 3 verified
    const updated = await query(
      'SELECT mobile_verified, whatsapp_verified, email_verified FROM patients WHERE id = $1',
      [patientId]
    );
    const p = updated.rows[0];
    const allVerified = p.mobile_verified && p.whatsapp_verified && p.email_verified;

    if (allVerified) {
      await query('UPDATE patients SET registration_step = 2 WHERE id = $1', [patientId]);
    }

    logger.audit('OTP_VERIFIED', { patientId, ip: req.ip, resource: channel });

    res.json({ message: 'Verified', channel, allVerified });
  } catch (err) {
    logger.error('Verify OTP error', { error: err.message });
    res.status(500).json({ error: 'Verification failed' });
  }
};

// ─── Step 3: Save Consent ──────────────────────────────────
const saveConsent = async (req, res) => {
  const { patientId, consentType, agreed, signatureData } = req.body;

  try {
    const docHash = crypto.createHash('sha256')
      .update(`${consentType}-v1.0`).digest('hex');
    const auditHash = crypto.createHash('sha256')
      .update(`${patientId}:${consentType}:${new Date().toISOString()}:${req.ip}`)
      .digest('hex');

    await query(
      `INSERT INTO consents(patient_id, consent_type, agreed, agreed_at, ip_address, user_agent, signature_data, document_hash, audit_hash)
       VALUES($1,$2,$3,NOW(),$4,$5,$6,$7,$8)
       ON CONFLICT(patient_id, consent_type) DO UPDATE
       SET agreed=$3, agreed_at=NOW(), ip_address=$4, signature_data=$6, audit_hash=$8`,
      [patientId, consentType, agreed, req.ip, req.get('user-agent'), signatureData, docHash, auditHash]
    );

    // Check if all required consents done
    const consents = await query(
      `SELECT consent_type FROM consents WHERE patient_id = $1 AND agreed = TRUE`,
      [patientId]
    );
    const consentTypes = consents.rows.map(r => r.consent_type);
    const required = ['treatment', 'data_privacy', 'telemedicine'];
    const allConsented = required.every(t => consentTypes.includes(t));

    if (allConsented) {
      await query('UPDATE patients SET registration_step = 3 WHERE id = $1', [patientId]);
    }

    logger.audit('CONSENT_SIGNED', {
      patientId,
      ip: req.ip,
      resource: 'consent',
      detail: consentType,
      phiAccessed: false,
    });

    res.json({ message: 'Consent saved', consentType, allConsented });
  } catch (err) {
    logger.error('Save consent error', { error: err.message });
    res.status(500).json({ error: 'Failed to save consent' });
  }
};

// ─── Step 4: Save Photo ────────────────────────────────────
const savePhoto = async (req, res) => {
  const { patientId, photoBase64 } = req.body;
  // photoBase64: base64 image from live camera, JPEG only

  try {
    if (!photoBase64) return res.status(400).json({ error: 'Photo is required' });

    const buffer = Buffer.from(photoBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Photo exceeds 5MB limit' });
    }

    const sharp = require('sharp');
    // Process and validate image
    const metadata = await sharp(buffer).metadata();
    if (!['jpeg', 'png'].includes(metadata.format)) {
      return res.status(400).json({ error: 'Only JPEG/PNG photos accepted' });
    }

    // Resize and compress for storage
    const processed = await sharp(buffer)
      .resize(400, 400, { fit: 'cover', position: 'face' })
      .jpeg({ quality: 85 })
      .toBuffer();

    const { encryptPhoto } = require('../utils/encryption');
    const encrypted = encryptPhoto(processed);
    const photoHash = crypto.createHash('sha256').update(processed).digest('hex');

    // Save encrypted photo to disk
    const fs = require('fs');
    const photoDir = require('path').join(process.env.UPLOAD_PATH || './uploads', 'photos');
    if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

    const photoFilename = `${patientId}_${Date.now()}.enc`;
    const photoPath = require('path').join(photoDir, photoFilename);
    fs.writeFileSync(photoPath, JSON.stringify(encrypted));

    const { encryptPHI } = require('../utils/encryption');
    await query(
      `UPDATE patients SET
       photo_path = $1, photo_captured_at = NOW(), photo_hash = $2,
       registration_step = 4
       WHERE id = $3`,
      [encryptPHI(photoPath), photoHash, patientId]
    );

    // Save photo consent
    const auditHash = crypto.createHash('sha256')
      .update(`${patientId}:photo:${new Date().toISOString()}:${req.ip}`)
      .digest('hex');
    await query(
      `INSERT INTO consents(patient_id, consent_type, agreed, agreed_at, ip_address, user_agent, audit_hash)
       VALUES($1,'photo',TRUE,NOW(),$2,$3,$4)
       ON CONFLICT(patient_id, consent_type) DO UPDATE
       SET agreed=TRUE, agreed_at=NOW(), audit_hash=$4`,
      [patientId, req.ip, req.get('user-agent'), auditHash]
    );

    logger.audit('PHOTO_CAPTURED', {
      patientId,
      ip: req.ip,
      phiAccessed: true,
      detail: 'Live camera photo saved',
    });

    res.json({ message: 'Photo saved', nextStep: 5 });
  } catch (err) {
    logger.error('Save photo error', { error: err.message });
    res.status(500).json({ error: 'Failed to save photo' });
  }
};

// ─── Step 5: Select Doctor ─────────────────────────────────
const selectDoctor = async (req, res) => {
  const { patientId, doctorId } = req.body;
  try {
    const doctor = await query(
      'SELECT id FROM doctors WHERE id = $1 AND is_active = TRUE AND is_verified = TRUE',
      [doctorId]
    );
    if (!doctor.rows.length) return res.status(404).json({ error: 'Doctor not found or unavailable' });

    await query(
      'UPDATE patients SET primary_doctor_id = $1, registration_step = 5 WHERE id = $2',
      [doctorId, patientId]
    );

    res.json({ message: 'Doctor selected', doctorId });
  } catch (err) {
    logger.error('Select doctor error', { error: err.message });
    res.status(500).json({ error: 'Failed to select doctor' });
  }
};

// ─── Login ─────────────────────────────────────────────────
const login = async (req, res) => {
  const { identifier, password, role } = req.body;
  // identifier: mobile or email

  try {
    const identifierHash = hmacHash(identifier.toLowerCase());
    let userResult, table;

    if (role === 'patient') {
      table = 'patients';
      userResult = await query(
        `SELECT id, password_hash, mobile_verified, email_verified, whatsapp_verified,
                registration_complete, failed_login_count, locked_until
         FROM patients WHERE mobile_hash = $1 OR email_hash = $1`,
        [identifierHash]
      );
    } else if (role === 'doctor') {
      table = 'doctors';
      userResult = await query(
        'SELECT id, password_hash, is_active, failed_login_count, locked_until FROM doctors WHERE email_hash = $1 OR mobile_hash = $1',
        [identifierHash]
      );
    } else if (['admin', 'super_admin'].includes(role)) {
      table = 'admins';
      userResult = await query(
        'SELECT id, password_hash, role, is_active, failed_login_count, locked_until FROM admins WHERE email_hash = $1',
        [identifierHash]
      );
    } else {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = userResult.rows[0];

    // Always hash to prevent timing attacks
    const dummyHash = '$2b$12$dummyhashtopreventtimingattacks/invalid';
    const passwordToCheck = user ? user.password_hash : dummyHash;
    const isValid = await bcrypt.compare(password, passwordToCheck);

    if (!user || !isValid) {
      if (user) {
        await query(
          `UPDATE ${table} SET failed_login_count = failed_login_count + 1,
           locked_until = CASE WHEN failed_login_count >= $1
           THEN NOW() + INTERVAL '${process.env.BRUTE_FORCE_LOCKOUT_MINUTES || 30} minutes'
           ELSE locked_until END WHERE id = $2`,
          [parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS) - 1 || 4, user.id]
        );
      }
      logger.audit('LOGIN_FAILED', { ip: req.ip, detail: `Failed login for ${identifier}`, result: 'failure' });
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      logger.audit('LOGIN_BLOCKED', { userId: user.id, ip: req.ip, result: 'blocked' });
      return res.status(423).json({ error: 'Account temporarily locked', code: 'ACCOUNT_LOCKED' });
    }

    // Reset failed attempts
    await query(`UPDATE ${table} SET failed_login_count = 0, last_login_at = NOW(), last_login_ip = $1 WHERE id = $2`,
      [req.ip, user.id]);

    const userRole = user.role || role;
    const tokens = await generateTokenPair(user.id, userRole, req.ip, req.get('user-agent'));

    logger.audit('LOGIN_SUCCESS', {
      userId: user.id,
      userRole,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      role: userRole,
      userId: user.id,
    });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({ error: 'Login failed' });
  }
};

// ─── Refresh Token ─────────────────────────────────────────
const refreshToken = async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) return res.status(401).json({ error: 'Refresh token required' });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await query(
      `SELECT user_id, user_role FROM refresh_tokens
       WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()`,
      [tokenHash]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid or expired refresh token', code: 'INVALID_REFRESH' });
    }

    const { user_id, user_role } = result.rows[0];
    await query('UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);

    const tokens = await generateTokenPair(user_id, user_role, req.ip, req.get('user-agent'));

    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (err) {
    logger.error('Refresh token error', { error: err.message });
    res.status(500).json({ error: 'Token refresh failed' });
  }
};

// ─── Logout ────────────────────────────────────────────────
const logout = async (req, res) => {
  const { refreshToken: token } = req.body;
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query('UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
  }
  logger.audit('LOGOUT', { userId: req.user?.id, userRole: req.user?.role, ip: req.ip });
  res.json({ message: 'Logged out successfully' });
};

module.exports = {
  registerPatientStep1,
  sendVerificationOTPs,
  verifyContactOTP,
  saveConsent,
  savePhoto,
  selectDoctor,
  login,
  refreshToken,
  logout,
};
