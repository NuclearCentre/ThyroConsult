const { query, transaction } = require('../config/database');
const { encryptPHI, decryptPHI, hmacHash, hashFile } = require('../utils/encryption');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
// generateReceipt/invoiceService import removed — its only caller,
// downloadReceipt, was removed as confirmed dead code (see below).

// ─── Decrypt patient profile for response ─────────────────
const decryptPatient = (row) => ({
  id: row.id,
  patientCode: row.patient_code,
  firstName: decryptPHI(row.first_name),
  middleName: row.middle_name ? decryptPHI(row.middle_name) : null,
  lastName: decryptPHI(row.last_name),
  guardianName: row.guardian_name ? decryptPHI(row.guardian_name) : null,
  guardianRelation: row.guardian_relation,
  dob: row.dob ? decryptPHI(row.dob) : null,
  dobAutoCalculated: row.dob_auto_calculated,
  gender: row.gender,
  bloodGroup: row.blood_group,
  mobile: row.mobile ? decryptPHI(row.mobile) : null,
  whatsapp: row.whatsapp ? decryptPHI(row.whatsapp) : null,
  email: row.email ? decryptPHI(row.email) : null,
  address: {
    line1: row.address_line1 ? decryptPHI(row.address_line1) : null,
    line2: row.address_line2 ? decryptPHI(row.address_line2) : null,
    city: row.city ? decryptPHI(row.city) : null,
    state: row.state ? decryptPHI(row.state) : null,
    pincode: row.pincode ? decryptPHI(row.pincode) : null,
  },
  mobileVerified: row.mobile_verified,
  whatsappVerified: row.whatsapp_verified,
  emailVerified: row.email_verified,
  registrationStep: row.registration_step,
  registrationComplete: row.registration_complete,
  primaryDoctorId: row.primary_doctor_id,
  createdAt: row.created_at,
});

// ─── GET /patients/:id ─────────────────────────────────────
const getPatient = async (req, res) => {
  try {
    const patientId = req.params.id || req.user.id; // self-service (/patient/profile) has no :id param — falls back to the logged-in patient's own id
    const result = await query('SELECT * FROM patients WHERE id = $1', [patientId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Patient not found' });

    logger.audit('PHI_VIEWED', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip, phiAccessed: true,
    });

    res.json(decryptPatient(result.rows[0]));
  } catch (err) {
    logger.error('Get patient error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
};

// ─── PATCH /patients/:id ───────────────────────────────────
const updatePatient = async (req, res) => {
  const {
    firstName, middleName, lastName, guardianName, guardianRelation,
    dob, dobAutoCalculated, gender, bloodGroup,
    addressLine1, addressLine2, city, state, pincode,
  } = req.body;
  const patientId = req.params.id || req.user.id; // self-service (/patient/profile) has no :id param

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    const addField = (col, val, encrypt = false) => {
      if (val !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(encrypt ? encryptPHI(val) : val);
      }
    };

    addField('first_name', firstName, true);
    addField('middle_name', middleName, true);
    addField('last_name', lastName, true);
    addField('guardian_name', guardianName, true);
    addField('guardian_relation', guardianRelation);
    addField('dob', dob, true);
    addField('dob_auto_calculated', dobAutoCalculated);
    addField('gender', gender);
    addField('blood_group', bloodGroup);
    addField('address_line1', addressLine1, true);
    addField('address_line2', addressLine2, true);
    addField('city', city, true);
    addField('state', state, true);
    addField('pincode', pincode, true);

    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    values.push(patientId);
    await query(`UPDATE patients SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    logger.audit('PHI_UPDATED', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip, phiAccessed: true,
      changes: { fields: Object.keys(req.body) },
    });

    res.json({ message: 'Profile updated' });
  } catch (err) {
    logger.error('Update patient error', { error: err.message });
    res.status(500).json({ error: 'Update failed' });
  }
};

// ─── GET patient photo ─────────────────────────────────────
const getPatientPhoto = async (req, res) => {
  try {
    const result = await query(
      'SELECT photo_path, photo_captured_at FROM patients WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length || !result.rows[0].photo_path) {
      return res.status(404).json({ error: 'No photo on record' });
    }

    const photoPath = decryptPHI(result.rows[0].photo_path);
    if (!fs.existsSync(photoPath)) {
      return res.status(404).json({ error: 'Photo file not found' });
    }

    const { decryptPhoto } = require('../utils/encryption');
    const encryptedData = JSON.parse(fs.readFileSync(photoPath, 'utf8'));
    const photoBuffer = decryptPhoto(encryptedData);

    logger.audit('PHOTO_VIEWED', {
      userId: req.user.id, userRole: req.user.role,
      patientId: req.params.id, ip: req.ip, phiAccessed: true,
    });

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, no-store');
    res.send(photoBuffer);
  } catch (err) {
    logger.error('Get photo error', { error: err.message });
    res.status(500).json({ error: 'Failed to retrieve photo' });
  }
};

// ─── GET /patients/:id/documents ──────────────────────────
const getDocuments = async (req, res) => {
  const { category } = req.query;
  try {
    let sql = `SELECT id, category, original_name, mime_type, file_size_bytes,
               opinion_id, report_date, uploaded_by_role, created_at
               FROM documents WHERE patient_id = $1 AND is_deleted = FALSE`;
    const params = [req.params.id];

    if (category) {
      sql += ` AND category = $2`;
      params.push(category);
    }
    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);

    const docs = result.rows.map(d => ({
      ...d,
      originalName: decryptPHI(d.original_name),
      original_name: undefined,
    }));

    logger.audit('DOCUMENTS_LISTED', {
      userId: req.user.id, userRole: req.user.role,
      patientId: req.params.id, ip: req.ip, phiAccessed: true,
    });

    res.json({ documents: docs, total: docs.length });
  } catch (err) {
    logger.error('Get documents error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

// ─── POST /patients/:id/documents ─────────────────────────
const uploadDocument = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { category } = req.body;
  const validCategories = ['blood_report', 'scan_usg', 'prescription', 'biopsy', 'other'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: 'Invalid document category' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const fileHash = hashFile(fileBuffer);

    // Move to patient folder
    const patientDir = path.join(process.env.UPLOAD_PATH || './uploads', 'documents', req.params.id);
    if (!fs.existsSync(patientDir)) fs.mkdirSync(patientDir, { recursive: true });
    const finalPath = path.join(patientDir, path.basename(req.file.path));
    fs.renameSync(req.file.path, finalPath);

    const result = await query(
      `INSERT INTO documents(patient_id, category, original_name, storage_path, mime_type, file_size_bytes, file_hash, uploaded_by, uploaded_by_role)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        req.params.id, category,
        encryptPHI(req.file.originalname),
        encryptPHI(finalPath),
        req.file.mimetype,
        req.file.size,
        fileHash,
        req.user.id,
        req.user.role,
      ]
    );

    logger.audit('DOCUMENT_UPLOADED', {
      userId: req.user.id, userRole: req.user.role,
      patientId: req.params.id, ip: req.ip,
      resource: 'document', resourceId: result.rows[0].id,
      detail: `${category} uploaded`,
    });

    // Auto-advance registration step if in step 6
    const patient = await query('SELECT registration_step FROM patients WHERE id = $1', [req.params.id]);
    if (patient.rows[0]?.registration_step === 5) {
      await query('UPDATE patients SET registration_step = 6 WHERE id = $1', [req.params.id]);
    }

    res.status(201).json({ message: 'Document uploaded', documentId: result.rows[0].id });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    logger.error('Upload document error', { error: err.message });
    res.status(500).json({ error: 'Upload failed' });
  }
};

// ─── GET document download ─────────────────────────────────
const downloadDocument = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM documents WHERE id = $1 AND patient_id = $2 AND is_deleted = FALSE',
      [req.params.docId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    const filePath = decryptPHI(doc.storage_path);
    const originalName = decryptPHI(doc.original_name);

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    // Verify file integrity
    const fileBuffer = fs.readFileSync(filePath);
    const currentHash = hashFile(fileBuffer);
    if (currentHash !== doc.file_hash) {
      logger.error('FILE_INTEGRITY_MISMATCH', { docId: doc.id, patientId: req.params.id });
      return res.status(500).json({ error: 'File integrity check failed', code: 'INTEGRITY_ERROR' });
    }

    logger.audit('DOCUMENT_DOWNLOADED', {
      userId: req.user.id, userRole: req.user.role,
      patientId: req.params.id, ip: req.ip,
      resource: 'document', resourceId: doc.id,
      phiAccessed: true,
    });

    res.set('Content-Disposition', `attachment; filename="${originalName}"`);
    res.set('Content-Type', doc.mime_type);
    res.set('Cache-Control', 'private, no-store');
    res.send(fileBuffer);
  } catch (err) {
    logger.error('Download document error', { error: err.message });
    res.status(500).json({ error: 'Download failed' });
  }
};

// ─── GET blood report values (for graphs) ─────────────────
const getBloodReportValues = async (req, res) => {
  const { testName, from, to } = req.query;
  try {
    let sql = `SELECT test_name, value, unit, reference_low, reference_high, is_abnormal, report_date
               FROM blood_report_values
               WHERE patient_id = $1`;
    const params = [req.params.id];
    let idx = 2;

    if (testName) { sql += ` AND test_name_lower = $${idx++}`; params.push(testName.toLowerCase()); }
    if (from) { sql += ` AND report_date >= $${idx++}`; params.push(from); }
    if (to) { sql += ` AND report_date <= $${idx++}`; params.push(to); }
    sql += ' ORDER BY report_date ASC';

    const result = await query(sql, params);

    logger.audit('REPORT_TRENDS_VIEWED', {
      userId: req.user.id, userRole: req.user.role,
      patientId: req.params.id, ip: req.ip, phiAccessed: true,
    });

    res.json({ values: result.rows, total: result.rows.length });
  } catch (err) {
    logger.error('Get blood values error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch report values' });
  }
};

// ─── POST blood report value (manual entry or parsed) ─────
const addBloodReportValue = async (req, res) => {
  const { documentId, testName, value, unit, referenceLow, referenceHigh, reportDate, labName } = req.body;
  try {
    const isAbnormal = (referenceLow != null && value < referenceLow) ||
                       (referenceHigh != null && value > referenceHigh);

    await query(
      `INSERT INTO blood_report_values
       (document_id, patient_id, test_name, test_name_lower, value, unit, reference_low, reference_high, is_abnormal, report_date)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [documentId, req.params.id, testName, testName.toLowerCase(), value, unit,
       referenceLow, referenceHigh, isAbnormal, reportDate]
    );

    res.status(201).json({ message: 'Report value saved', isAbnormal });
  } catch (err) {
    logger.error('Add blood value error', { error: err.message });
    res.status(500).json({ error: 'Failed to save report value' });
  }
};

// ─── GET previous opinions ───────────────────────────
// NOTE: still reads the underlying `consultations` table as-is — that
// table/its columns were NOT renamed in this pass. It looks like it may
// be the legacy video-consultation table flagged in the 27 Jul summary
// as "unconfirmed whether dead" (there's a separate opinionController.js
// in the folder listing, which may already be the live replacement for
// this). Confirm live/dead before renaming the schema itself. Only the
// JS-facing names below (function name, output keys, log strings) have
// been purged of "consultation" wording so nothing leaks out via the API.
const getPatientOpinions = async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id, c.opinion_number, c.status,
              c.started_at, c.completed_at, c.duration_minutes,
              c.chief_complaint, c.diagnosis, c.doctor_notes, c.follow_up_notes,
              d.first_name AS doctor_first, d.last_name AS doctor_last
       FROM consultations c
       JOIN doctors d ON c.doctor_id = d.id
       WHERE c.patient_id = $1
       ORDER BY c.created_at DESC`,
      [req.params.id]
    );

    const opinions = result.rows.map(r => ({
      id: r.id,
      opinionNumber: r.opinion_number,
      status: r.status,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      durationMinutes: r.duration_minutes,
      chiefComplaint: r.chief_complaint ? decryptPHI(r.chief_complaint) : null,
      diagnosis: r.diagnosis ? decryptPHI(r.diagnosis) : null,
      doctorNotes: r.doctor_notes ? decryptPHI(r.doctor_notes) : null,
      followUpNotes: r.follow_up_notes ? decryptPHI(r.follow_up_notes) : null,
      doctorName: `Dr. ${decryptPHI(r.doctor_first)} ${decryptPHI(r.doctor_last)}`,
    }));

    logger.audit('OPINIONS_VIEWED', {
      userId: req.user.id, userRole: req.user.role,
      patientId: req.params.id, ip: req.ip, phiAccessed: true,
    });

    res.json({ opinions, total: opinions.length });
  } catch (err) {
    logger.error('Get opinions error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch opinions' });
  }
};

// ─── GET invoices ──────────────────────────────────────────
const getInvoices = async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id, p.invoice_number, p.opinion_fee, p.platform_fee,
              p.total_amount, p.status, p.payment_method, p.paid_at,
              d.first_name AS doctor_first, d.last_name AS doctor_last
       FROM payments p
       JOIN doctors d ON p.doctor_id = d.id
       LEFT JOIN appointments a ON p.appointment_id = a.id
       LEFT JOIN consultations c ON c.appointment_id = a.id
       WHERE p.patient_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.id]
    );

    const invoices = result.rows.map(r => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      opinionFee: parseFloat(r.opinion_fee),
      platformFee: parseFloat(r.platform_fee),
      totalAmount: parseFloat(r.total_amount),
      status: r.status,
      paymentMethod: r.payment_method,
      paidAt: r.paid_at,
      doctorName: `Dr. ${decryptPHI(r.doctor_first)} ${decryptPHI(r.doctor_last)}`,
    }));

    res.json({ invoices, total: invoices.length });
  } catch (err) {
    logger.error('Get invoices error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

// downloadReceipt REMOVED — confirmed dead code. No route in
// src/routes/index.js references patientController.downloadReceipt;
// receiptController.downloadOpinionReceipt is the only live receipt
// handler (registered at GET /receipt/opinion/:paymentId).
// ─── GET /patient/consents — list all consents for the logged-in patient ──
const getConsents = async (req, res) => {
  try {
    const result = await query(
      `SELECT consent_type, agreed, agreed_at, document_hash
       FROM consents WHERE patient_id = $1 ORDER BY agreed_at DESC`,
      [req.user.id]
    );
    res.json({ consents: result.rows });
  } catch (err) {
    logger.error('Get consents error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch consents' });
  }
};

// ─── POST /patient/consents — save/amend a consent post-registration ──────
// Same consents table + audit-hash pattern as authController.saveConsent
// (used during the registration wizard) — this is the post-registration
// equivalent, e.g. re-consenting after a policy update.
const saveConsents = async (req, res) => {
  const { consentType, agreed, signatureData } = req.body;
  const patientId = req.user.id;

  try {
    const crypto = require('crypto');
    const docHash = crypto.createHash('sha256').update(`${consentType}-v1.0`).digest('hex');
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

    logger.audit('CONSENT_SIGNED', {
      userId: patientId, userRole: 'patient', ip: req.ip,
      resource: 'consent', detail: consentType, phiAccessed: false,
    });

    res.json({ message: 'Consent saved', consentType });
  } catch (err) {
    logger.error('Save consents error', { error: err.message });
    res.status(500).json({ error: 'Failed to save consent' });
  }
};

// ─── POST /patient/photo — re-capture/update photo post-registration ──────
// Multipart (req.file), unlike authController.savePhoto which is base64
// JSON during registration — same processing pipeline (resize/compress/
// encrypt/hash), different input mechanism. Essential for patient
// identification: this is the photo doctors and admin see against the
// patient's record, and for minors it's one of two mandatory live photos
// per the platform's minor-patient rules.
const uploadPhoto = async (req, res) => {
  const patientId = req.user.id;

  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Photo is required' });
    }

    const sharp = require('sharp');
    const crypto = require('crypto');
    const metadata = await sharp(req.file.buffer).metadata();
    if (!['jpeg', 'png'].includes(metadata.format)) {
      return res.status(400).json({ error: 'Only JPEG/PNG photos accepted' });
    }

    const processed = await sharp(req.file.buffer)
      .resize(400, 400, { fit: 'cover', position: 'face' })
      .jpeg({ quality: 85 })
      .toBuffer();

    const { encryptPhoto } = require('../utils/encryption');
    const encrypted = encryptPhoto(processed);
    const photoHash = crypto.createHash('sha256').update(processed).digest('hex');

    const photoDir = path.join(process.env.UPLOAD_PATH || './uploads', 'photos');
    if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

    const photoFilename = `${patientId}_${Date.now()}.enc`;
    const photoPath = path.join(photoDir, photoFilename);
    fs.writeFileSync(photoPath, JSON.stringify(encrypted));

    await query(
      `UPDATE patients SET photo_path = $1, photo_captured_at = NOW(), photo_hash = $2 WHERE id = $3`,
      [encryptPHI(photoPath), photoHash, patientId]
    );

    logger.audit('PHOTO_UPDATED', {
      userId: patientId, userRole: 'patient', ip: req.ip,
      phiAccessed: true, detail: 'Patient photo re-captured post-registration',
    });

    res.json({ message: 'Photo updated' });
  } catch (err) {
    logger.error('Upload photo error', { error: err.message });
    res.status(500).json({ error: 'Failed to upload photo' });
  }
};

module.exports = {
  getPatient,
  updatePatient,
  getPatientPhoto,
  getConsents,
  saveConsents,
  uploadPhoto,
  getDocuments,
  uploadDocument,
  downloadDocument,
  getBloodReportValues,
  addBloodReportValue,
  getPatientOpinions,
  getInvoices,
};
