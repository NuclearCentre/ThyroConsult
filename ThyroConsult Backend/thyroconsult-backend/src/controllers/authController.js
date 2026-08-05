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
// managedBy: null for a normal account's own token. When set, this token
// represents a parent having switched into a relative/dependent profile
// (see switchProfile below) — carried in the JWT so a subsequent switch
// (e.g. from one child to another, or back to the parent) can be
// authorized against the true root account without requiring the
// parent to re-enter their password each time.
const generateTokenPair = async (userId, role, ip, userAgent, managedBy = null) => {
  const sessionId = uuidv4();
  const accessToken = jwt.sign(
    { sub: userId, role, sessionId, ...(managedBy ? { managedBy } : {}) },
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
    preferredLanguage,
    firstName, middleName, lastName,
    guardianName, guardianRelation,
    dob, dobAutoCalculated,
    gender, bloodGroup,
    country, addressLine1, addressLine2, city, state, pincode,
    mobile, whatsapp, email,
    password,
  } = req.body;

  try {
    // Same whitelist as patientController.updatePatient — kept in sync
    // manually since there's no shared constants module between
    // controllers yet. Matches the DB CHECK constraint (migrations 019 + 024).
    const VALID_LANGUAGES = ['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn', 'ml', 'bn', 'pa', 'or', 'as', 'ne', 'mnib', 'mnim'];
    if (preferredLanguage !== undefined && preferredLanguage !== null && !VALID_LANGUAGES.includes(preferredLanguage)) {
      return res.status(400).json({ error: `preferredLanguage must be one of: ${VALID_LANGUAGES.join(', ')}` });
    }

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
      country: country || 'IN', // not PHI — plain, like gender
      address_line1: addressLine1 ? encryptPHI(addressLine1) : null,
      address_line2: addressLine2 ? encryptPHI(addressLine2) : null,
      city: city ? encryptPHI(city) : null,
      state: state ? encryptPHI(state) : null,
      pincode: pincode ? encryptPHI(pincode) : null,
      registration_step: 1,
      // Migration 019 added this column with DEFAULT 'en' and a CHECK
      // constraint (expanded in migration 024 to include the 5 newly
      // added languages) — falls back to 'en' here too, matching the
      // column default, since this INSERT lists every column explicitly
      // and can't rely on the DEFAULT clause firing.
      preferred_language: preferredLanguage || 'en',
    };

    const result = await query(
      `INSERT INTO patients
       (mobile, mobile_hash, whatsapp, whatsapp_hash, email, email_hash,
        password_hash, first_name, middle_name, last_name, guardian_name,
        guardian_relation, dob, dob_auto_calculated, gender, blood_group,
        country, address_line1, address_line2, city, state, pincode, registration_step,
        preferred_language)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING id, patient_code`,
      Object.values(patientData)
    );

    const patient = result.rows[0];

    logger.audit('PATIENT_REGISTERED_STEP1', {
      patientId: patient.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Issue a token pair immediately. Steps 2-5 of the wizard still take
    // patientId directly in the body (kept as-is), but Step 6 (booking/
    // payment — moved up from step 8 as part of the payment reorder;
    // document upload is no longer a wizard step at all, it now happens
    // post-registration via the Add Condition flow) hits routes protected
    // by verifyToken/requireRole('patient') — without a token issued here,
    // that call would 401 with no refresh token to fall back on.
    const tokens = await generateTokenPair(patient.id, 'patient', req.ip, req.get('user-agent'));

    // Auto-save: return patientId for subsequent steps
    res.status(201).json({
      message: 'Step 1 saved successfully',
      patientId: patient.id,
      patientCode: patient.patient_code,
      nextStep: 2,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
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

// ─── Step 2: Edit a contact value before (re-)verifying ────
// Only usable pre-registration-complete (registration_step is still in
// the early steps) — a fully registered patient changing a verified
// mobile/email later is a different, higher-stakes operation (identity
// change on an active account) and should go through a proper flow, not
// this one. Resets that channel's verified flag, hash, and attempt
// counter, since the value just changed and the old verification no
// longer applies to it.
const updateRegistrationContact = async (req, res) => {
  const { patientId, channel, value } = req.body;

  const CHANNEL_MAP = {
    mobile:   { col: 'mobile',   hashCol: 'mobile_hash',   verifiedCol: 'mobile_verified',   attemptsCol: 'mobile_otp_attempts',   lockedCol: 'mobile_otp_locked_until' },
    whatsapp: { col: 'whatsapp', hashCol: 'whatsapp_hash', verifiedCol: 'whatsapp_verified', attemptsCol: 'whatsapp_otp_attempts', lockedCol: 'whatsapp_otp_locked_until' },
    email:    { col: 'email',    hashCol: 'email_hash',    verifiedCol: 'email_verified',    attemptsCol: 'email_otp_attempts',    lockedCol: 'email_otp_locked_until' },
  };
  const map = CHANNEL_MAP[channel];
  if (!map) return res.status(400).json({ error: 'Invalid channel' });
  if (!value || !value.trim()) return res.status(400).json({ error: 'Value is required' });

  try {
    const patRow = await query('SELECT registration_step, registration_complete FROM patients WHERE id = $1', [patientId]);
    if (!patRow.rows.length) return res.status(404).json({ error: 'Patient not found' });
    if (patRow.rows[0].registration_complete) {
      return res.status(403).json({ error: 'Cannot edit a verified contact after registration is complete' });
    }

    const normalized = channel === 'email' ? value.trim().toLowerCase() : value.trim();
    await query(
      `UPDATE patients SET
         ${map.col} = $1, ${map.hashCol} = $2, ${map.verifiedCol} = FALSE,
         ${map.attemptsCol} = 0, ${map.lockedCol} = NULL
       WHERE id = $3`,
      [encryptPHI(normalized), hmacHash(normalized), patientId]
    );

    logger.audit('REGISTRATION_CONTACT_EDITED', { patientId, ip: req.ip, resource: channel });
    res.json({ message: 'Updated — please verify again', channel });
  } catch (err) {
    logger.error('Update registration contact error', { error: err.message });
    res.status(500).json({ error: 'Failed to update contact' });
  }
};

// ─── Step 2: Verify OTPs ───────────────────────────────────
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCKOUT_MINUTES = 15;

const verifyContactOTP = async (req, res) => {
  const { patientId, channel, otp } = req.body;

  try {
    const result = await query(
      `SELECT mobile, whatsapp, email,
              mobile_otp_attempts, mobile_otp_locked_until,
              whatsapp_otp_attempts, whatsapp_otp_locked_until,
              email_otp_attempts, email_otp_locked_until
       FROM patients WHERE id = $1`,
      [patientId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Patient not found' });

    const patient = result.rows[0];
    let identifier, purpose, updateField, attemptsField, lockedField;

    if (channel === 'mobile') {
      identifier = decryptPHI(patient.mobile);
      purpose = 'mobile_verify';
      updateField = 'mobile_verified';
      attemptsField = 'mobile_otp_attempts'; lockedField = 'mobile_otp_locked_until';
    } else if (channel === 'whatsapp') {
      identifier = decryptPHI(patient.whatsapp || patient.mobile);
      purpose = 'whatsapp_verify';
      updateField = 'whatsapp_verified';
      attemptsField = 'whatsapp_otp_attempts'; lockedField = 'whatsapp_otp_locked_until';
    } else if (channel === 'email') {
      identifier = decryptPHI(patient.email);
      purpose = 'email_verify';
      updateField = 'email_verified';
      attemptsField = 'email_otp_attempts'; lockedField = 'email_otp_locked_until';
    } else {
      return res.status(400).json({ error: 'Invalid channel' });
    }

    // migration 020 — 5 attempts, then a 15-minute lockout, enforced here
    // (not just client-side, which is trivially bypassed by refreshing).
    const lockedUntil = patient[lockedField];
    if (lockedUntil && new Date(lockedUntil) > new Date()) {
      logger.audit('OTP_VERIFICATION_LOCKED', { patientId, ip: req.ip, resource: channel });
      return res.status(429).json({
        error: 'Too many authentication attempts. Please retry after 15 mins.',
        code: 'OTP_LOCKED',
        lockedUntil,
      });
    }

    const { valid, reason } = await verifyOTP(identifier, purpose, otp);
    if (!valid) {
      const newAttempts = (patient[attemptsField] || 0) + 1;
      const lockingNow = newAttempts >= OTP_MAX_ATTEMPTS;
      await query(
        `UPDATE patients SET ${attemptsField} = $1, ${lockedField} = $2 WHERE id = $3`,
        [
          lockingNow ? 0 : newAttempts, // reset the counter once locked, so the next window starts clean
          lockingNow ? new Date(Date.now() + OTP_LOCKOUT_MINUTES * 60 * 1000) : null,
          patientId,
        ]
      );
      logger.audit('OTP_VERIFICATION_FAILED', { patientId, ip: req.ip, detail: reason });

      if (lockingNow) {
        return res.status(429).json({
          error: 'Too many authentication attempts. Please retry after 15 mins.',
          code: 'OTP_LOCKED',
        });
      }
      return res.status(400).json({
        error: reason,
        code: 'OTP_INVALID',
        attemptsRemaining: OTP_MAX_ATTEMPTS - newAttempts,
      });
    }

    // Correct OTP — reset this channel's attempt counter.
    await query(`UPDATE patients SET ${attemptsField} = 0, ${lockedField} = NULL WHERE id = $1`, [patientId]);

    await query(`UPDATE patients SET ${updateField} = TRUE WHERE id = $1`, [patientId]);

    // Check if all 3 verified
    const updated = await query(
      'SELECT mobile_verified, whatsapp_verified, email_verified FROM patients WHERE id = $1',
      [patientId]
    );
    const p = updated.rows[0];
    // WhatsApp downgraded from required to optional/unverified — patient
    // can add a number if they want, but only mobile + email actually
    // gate registration progress now.
    const allVerified = p.mobile_verified && p.email_verified;

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
      .resize(400, 400, { fit: 'cover', position: 'center' }) // sharp has no 'face' position/gravity value — that was never a real option, it just silently threw "Expected valid position/gravity/strategy... but received face of type string" on every single call. 'center' is the right fix here (not 'attention'/entropy-based smart cropping): the capture UI already guides the user to "Centre your face within the frame" before the shot is taken, so a plain center-crop matches what's already framed.
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

    // The original access token's `managedBy` claim (set by switchProfile
    // when this session switched into a relative) only ever lived in that
    // JWT — refresh_tokens has no column for it, so a plain
    // generateTokenPair(user_id, user_role, ...) here would silently drop
    // it on every refresh, 15 minutes into any relative-profile session.
    // Re-derive it from the authoritative source instead: patients.
    // managed_by_patient_id for whichever patient this refresh token
    // actually belongs to. null for a root account's own session, exactly
    // matching generateTokenPair's default.
    let managedBy = null;
    if (user_role === 'patient') {
      const patientCheck = await query('SELECT managed_by_patient_id FROM patients WHERE id = $1', [user_id]);
      managedBy = patientCheck.rows[0]?.managed_by_patient_id || null;
    }

    const tokens = await generateTokenPair(user_id, user_role, req.ip, req.get('user-agent'), managedBy);

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

// ═══════════════════════════════════════════════════════════
// "Opinion for relative" — Option A (relative shares the parent's
// login; no separate userid/password). See migration 038.
// ═══════════════════════════════════════════════════════════

// ─── Create a relative/dependent profile under the logged-in account ──────
const registerRelative = async (req, res) => {
  const parentId = req.user.id;
  const { firstName, middleName, lastName, relation, dob, gender, bloodGroup, bloodGroupOther, preferredLanguage } = req.body;

  try {
    // A managed profile cannot itself add further relatives — keeps the
    // hierarchy exactly two levels (root account → dependents), matching
    // how the switchProfile/managedBy JWT claim below is designed.
    const parentCheck = await query(
      'SELECT id, managed_by_patient_id, first_name, last_name FROM patients WHERE id = $1',
      [parentId]
    );
    if (!parentCheck.rows.length) return res.status(404).json({ error: 'Account not found' });
    if (parentCheck.rows[0].managed_by_patient_id) {
      return res.status(403).json({ error: 'A relative profile cannot add further relatives — switch back to your own profile first' });
    }

    if (!firstName || !lastName || !relation || !dob || !gender) {
      return res.status(400).json({ error: 'firstName, lastName, relation, dob and gender are required' });
    }

    const ageYears = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000);
    const isMinor = ageYears < 18;

    // Deliberately NO mobile/email/password — not even the parent's own.
    // Sharing the same mobile_hash/email_hash across two rows would make
    // login()'s `WHERE mobile_hash = $1 OR email_hash = $1` match
    // ambiguously (it takes rows[0] with no tiebreak). This profile is
    // reachable ONLY via switchProfile below, never direct login —
    // matching "no separate userid/password" from the request.
    const patientData = {
      first_name: encryptPHI(firstName),
      middle_name: middleName ? encryptPHI(middleName) : null,
      last_name: encryptPHI(lastName),
      dob: encryptPHI(dob),
      dob_auto_calculated: false,
      gender,
      blood_group: bloodGroup || null,
      // 'other' is a short flag in blood_group itself (fits the existing
      // VARCHAR(5) column); the actual free-text name the patient typed
      // (e.g. "Bombay blood group") lives here instead — see migration
      // 044.
      blood_group_other: bloodGroup === 'other' ? (bloodGroupOther || null) : null,
      country: 'IN',
      managed_by_patient_id: parentId,
      relation_to_manager: relation,
      // Same guardian-consent model as any minor patient registered
      // directly — reused, not reinvented. Adult relatives (e.g. a
      // spouse) get no guardian fields, matching how an adult self-
      // registering today has none either.
      guardian_name: isMinor
        ? encryptPHI(`${decryptPHI(parentCheck.rows[0].first_name)} ${decryptPHI(parentCheck.rows[0].last_name)}`)
        : null,
      guardian_relation: isMinor ? relation : null,
      // Skips straight past the OTP/verification steps (2-3) of the
      // normal wizard — nothing to verify since there's no independent
      // contact info on this row at all.
      registration_step: 5,
      registration_complete: true,
      preferred_language: preferredLanguage || 'en',
    };

    const cols = Object.keys(patientData);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const result = await query(
      `INSERT INTO patients(${cols.join(', ')}) VALUES(${placeholders.join(', ')}) RETURNING id, patient_code`,
      Object.values(patientData)
    );

    logger.audit('RELATIVE_PROFILE_CREATED', {
      userId: parentId, ip: req.ip, resourceId: result.rows[0].id,
      detail: `relation=${relation}, isMinor=${isMinor}`,
    });

    res.status(201).json({
      message: 'Relative profile created',
      patientId: result.rows[0].id,
      patientCode: result.rows[0].patient_code,
      isMinor,
      // Consent + photo are still mandatory — same rule as any minor/
      // adult registration — but reuse the existing saveConsent/
      // savePhoto endpoints directly against this new patientId rather
      // than a parallel flow.
      nextSteps: ['consent', 'photo'],
    });
  } catch (err) {
    logger.error('registerRelative error', { error: err.message });
    res.status(500).json({ error: 'Failed to create relative profile' });
  }
};

// ─── List relatives managed by the logged-in account ───────────────────────
const getMyRelatives = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, patient_code, first_name, last_name, dob, gender, relation_to_manager
       FROM patients WHERE managed_by_patient_id = $1 ORDER BY created_at ASC`,
      [req.user.id]
    );
    const relatives = result.rows.map(r => ({
      id: r.id,
      patientCode: r.patient_code,
      name: `${decryptPHI(r.first_name)} ${decryptPHI(r.last_name)}`,
      dob: r.dob ? decryptPHI(r.dob) : null,
      gender: r.gender,
      relation: r.relation_to_manager,
    }));
    res.json({ relatives });
  } catch (err) {
    logger.error('getMyRelatives error', { error: err.message });
    res.status(500).json({ error: 'Failed to list relatives' });
  }
};

// ─── Switch the active session to a relative's profile (or back) ──────────
// NOTE: depends on verifyToken populating req.user.managedBy from the JWT
// payload — flagged for confirmation once that middleware is available;
// most JWT-decode middleware assigns the full decoded payload to req.user,
// which would already carry this through without any change there, but
// this hasn't been confirmed against the real file yet.
const switchProfile = async (req, res) => {
  const { targetPatientId } = req.body;
  if (!targetPatientId) return res.status(400).json({ error: 'targetPatientId is required' });

  // The TRUE root account this session ultimately belongs to — either
  // the currently logged-in id (if this is already the root's own
  // token) or the managedBy claim (if already switched into a relative
  // and now switching to a different one, or back to the root).
  const rootPatientId = req.user.managedBy || req.user.id;

  try {
    if (targetPatientId === rootPatientId) {
      const tokens = await generateTokenPair(rootPatientId, 'patient', req.ip, req.get('user-agent'));
      return res.json({ ...tokens, patientId: rootPatientId, managedBy: null });
    }

    const target = await query(
      'SELECT id, managed_by_patient_id FROM patients WHERE id = $1',
      [targetPatientId]
    );
    if (!target.rows.length || target.rows[0].managed_by_patient_id !== rootPatientId) {
      return res.status(403).json({ error: 'Not authorized to switch to this profile' });
    }

    const tokens = await generateTokenPair(targetPatientId, 'patient', req.ip, req.get('user-agent'), rootPatientId);

    logger.audit('PROFILE_SWITCHED', {
      userId: rootPatientId, ip: req.ip, resourceId: targetPatientId,
    });

    res.json({ ...tokens, patientId: targetPatientId, managedBy: rootPatientId });
  } catch (err) {
    logger.error('switchProfile error', { error: err.message });
    res.status(500).json({ error: 'Failed to switch profile' });
  }
};

module.exports = {
  registerPatientStep1,
  sendVerificationOTPs,
  updateRegistrationContact,
  verifyContactOTP,
  saveConsent,
  savePhoto,
  selectDoctor,
  login,
  refreshToken,
  logout,
  registerRelative,
  getMyRelatives,
  switchProfile,
};
