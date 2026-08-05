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
    country: row.country || 'IN',
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
  preferredLanguage: row.preferred_language, // migration 019 — drives both UI display language and opinion translation target
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
    addressLine1, addressLine2, city, state, pincode, country,
    preferredLanguage,
  } = req.body;

  const VALID_LANGUAGES = ['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn', 'ml', 'bn', 'pa', 'or', 'as', 'ne', 'mnib', 'mnim'];
  if (preferredLanguage !== undefined && !VALID_LANGUAGES.includes(preferredLanguage)) {
    return res.status(400).json({ error: `preferredLanguage must be one of: ${VALID_LANGUAGES.join(', ')}` });
  }
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
    addField('country', country);
    addField('address_line2', addressLine2, true);
    addField('city', city, true);
    addField('state', state, true);
    addField('pincode', pincode, true);
    addField('preferred_language', preferredLanguage); // not PHI — plain, drives translation pipeline

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
// SECURITY: this used to accept req.params.id unconditionally (falling
// back to req.user.id only if absent) — meaning a logged-in patient
// could view ANY other patient's photo just by passing a different id
// in the URL, and any doctor could view any patient's photo regardless
// of assignment. Fixed here rather than left as when this was dead code
// with no route pointing at it: a patient can only ever get their own
// (req.user.id, :id ignored even if present); a doctor must be assigned
// to at least one of that patient's episodes.
const getPatientPhoto = async (req, res) => {
  try {
    const requestedId = req.params.id;
    let patientId;
    if (req.user.role === 'patient') {
      patientId = req.user.id;
    } else if (req.user.role === 'doctor') {
      if (!requestedId) return res.status(400).json({ error: 'Patient id required' });
      const assigned = await query(
        `SELECT 1 FROM patient_condition_episodes WHERE patient_id = $1 AND primary_doctor_id = $2 LIMIT 1`,
        [requestedId, req.user.id]
      );
      if (!assigned.rows.length) {
        return res.status(403).json({ error: 'Not authorised to view this patient\'s photo' });
      }
      patientId = requestedId;
    } else {
      return res.status(403).json({ error: 'Not authorised' });
    }

    const result = await query(
      'SELECT photo_path, photo_captured_at FROM patients WHERE id = $1',
      [patientId]
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
      patientId, ip: req.ip, phiAccessed: true,
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
// Now accepts an optional episodeId filter alongside category — used by
// the questionnaire's "already uploaded for this question" check on
// resume, and by the physician episode-review screen.
const getDocuments = async (req, res) => {
  const { category, episodeId } = req.query;
  const patientId = req.params.id || req.user.id;
  try {
    // LEFT JOINs added so the frontend can group documents into folders
    // by condition episode, then by which opinion cycle (if any) they
    // were submitted under — a document uploaded before any opinion
    // exists yet (op.id IS NULL) belongs to "pending first opinion";
    // one uploaded later against a specific follow-up opinion groups
    // under that opinion's own date/status instead.
    let sql = `SELECT d.id, d.category, d.original_name, d.mime_type, d.file_size_bytes,
               d.episode_id, d.field_label, d.opinion_id, d.report_date, d.uploaded_by_role, d.created_at,
               pce.condition AS episode_condition,
               op.status AS opinion_status, op.submitted_at AS opinion_submitted_at
               FROM documents d
               LEFT JOIN patient_condition_episodes pce ON pce.id = d.episode_id
               LEFT JOIN opinions op ON op.id = d.opinion_id
               WHERE d.patient_id = $1 AND d.is_deleted = FALSE`;
    const params = [patientId];

    if (category) {
      params.push(category);
      sql += ` AND d.category = $${params.length}`;
    }
    if (episodeId) {
      params.push(episodeId);
      sql += ` AND d.episode_id = $${params.length}`;
    }
    sql += ' ORDER BY d.created_at DESC';

    const result = await query(sql, params);

    const docs = result.rows.map(d => ({
      ...d,
      originalName: decryptPHI(d.original_name),
      original_name: undefined,
      fieldLabel: d.field_label,
      field_label: undefined,
      episodeId: d.episode_id,
      episode_id: undefined,
      episodeCondition: d.episode_condition,
      episode_condition: undefined,
      opinionStatus: d.opinion_status,
      opinion_status: undefined,
      opinionSubmittedAt: d.opinion_submitted_at,
      opinion_submitted_at: undefined,
    }));

    logger.audit('DOCUMENTS_LISTED', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip, phiAccessed: true,
    });

    res.json({ documents: docs, total: docs.length });
  } catch (err) {
    logger.error('Get documents error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

// ─── POST /patients/:id/documents ─────────────────────────
// Now accepts optional episodeId + fieldLabel in the body, tagging the
// upload to a specific condition episode and a specific question
// ("TSH", "USG neck", "Anti-TPO", etc.) instead of only the coarse
// category bucket. Both stay optional so general/legacy uploads with
// neither still work unchanged.
const uploadDocument = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { category, episodeId, fieldLabel } = req.body;
  const patientId = req.params.id || req.user.id;
  const validCategories = ['blood_report', 'scan_usg', 'prescription', 'biopsy', 'other'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: 'Invalid document category' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const fileHash = hashFile(fileBuffer);

    // Tag this upload to the episode's current opinion cycle, if one
    // exists yet. Most uploads happen either (a) during the very first
    // questionnaire pass, before any opinion has ever been generated —
    // opinion_id stays NULL, nothing to group under yet — or (b) later,
    // when the doctor has requested something missing/additional against
    // an existing opinion, in which case this ties the new upload to
    // that specific opinion cycle so the patient dashboard can eventually
    // group "what did I submit for opinion X" as its own folder.
    let opinionId = null;
    if (episodeId) {
      const opRes = await query(
        'SELECT id FROM opinions WHERE episode_id = $1 ORDER BY created_at DESC LIMIT 1',
        [episodeId]
      );
      opinionId = opRes.rows[0]?.id || null;
    }

    // Move to patient folder
    const patientDir = path.join(process.env.UPLOAD_PATH || './uploads', 'documents', patientId);
    if (!fs.existsSync(patientDir)) fs.mkdirSync(patientDir, { recursive: true });
    const finalPath = path.join(patientDir, path.basename(req.file.path));
    fs.renameSync(req.file.path, finalPath);

    const result = await query(
      `INSERT INTO documents(patient_id, category, original_name, storage_path, mime_type, file_size_bytes, file_hash, uploaded_by, uploaded_by_role, episode_id, field_label, opinion_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        patientId, category,
        encryptPHI(req.file.originalname),
        encryptPHI(finalPath),
        req.file.mimetype,
        req.file.size,
        fileHash,
        req.user.id,
        req.user.role,
        episodeId || null,
        fieldLabel || null,
        opinionId,
      ]
    );

    logger.audit('DOCUMENT_UPLOADED', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip,
      resource: 'document', resourceId: result.rows[0].id,
      detail: `${category} uploaded${fieldLabel ? ` (${fieldLabel})` : ''}`,
    });

    // registration_step auto-advance REMOVED — was checking for step 5
    // and bumping to 6 under the old "Upload Reports = step 6" meaning.
    // That step no longer exists (Payment reorder: 6 is now Payment, and
    // document upload only ever happens post-registration via the Add
    // Condition flow, by which point registration_complete is already
    // TRUE). Same class of stale step-machine bug already found and
    // removed in conditionController.js's selectCondition.

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
    const patientId = req.params.id || req.user.id;
    const result = await query(
      'SELECT * FROM documents WHERE id = $1 AND patient_id = $2 AND is_deleted = FALSE',
      [req.params.docId, patientId]
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
      logger.error('FILE_INTEGRITY_MISMATCH', { docId: doc.id, patientId });
      return res.status(500).json({ error: 'File integrity check failed', code: 'INTEGRITY_ERROR' });
    }

    logger.audit('DOCUMENT_DOWNLOADED', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip,
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

// ─── POST /patients/:id/documents/:docId/extract ───────────
// Powers the "🤖 Auto-fill from this report" button next to lab-value
// questions. Runs the already-uploaded document through
// documentExtractionService (Anthropic API, vision) with the specific
// test name being asked about, and returns structured fields
// (value/unit/date/refLow/refHigh/labName) for the frontend to drop
// straight into the matching inputs. Does NOT write anything to the
// database itself — extraction is a suggestion the patient can accept,
// edit, or ignore; the normal questionnaire save (_draft/submit) is what
// actually persists whatever ends up in those fields.
const extractDocumentFields = async (req, res) => {
  const patientId = req.params.id || req.user.id;
  const { docId } = req.params;
  const { testLabel } = req.body;

  if (!testLabel || !testLabel.trim()) {
    return res.status(400).json({ error: 'testLabel is required' });
  }

  try {
    const result = await query(
      'SELECT * FROM documents WHERE id = $1 AND patient_id = $2 AND is_deleted = FALSE',
      [docId, patientId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    const filePath = decryptPHI(doc.storage_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    const { extractLabValue } = require('../services/documentExtractionService');
    const extracted = await extractLabValue(filePath, doc.mime_type, testLabel.trim());

    logger.audit('DOCUMENT_EXTRACTION_RUN', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip,
      resource: 'document', resourceId: doc.id,
      detail: `Extraction attempted for "${testLabel}" — found: ${extracted.found}`,
      phiAccessed: true,
    });

    res.json(extracted);
  } catch (err) {
    logger.error('Extract document fields error', { error: err.message });
    res.status(500).json({ error: 'Extraction failed — please enter values manually' });
  }
};

// ─── GET blood report values (for graphs) ─────────────────
const getBloodReportValues = async (req, res) => {
  const { testName, from, to } = req.query;
  const patientId = req.params.id || req.user.id;
  try {
    let sql = `SELECT test_name, value, unit, reference_low, reference_high, is_abnormal, report_date
               FROM blood_report_values
               WHERE patient_id = $1`;
    const params = [patientId];
    let idx = 2;

    if (testName) { sql += ` AND test_name_lower = $${idx++}`; params.push(testName.toLowerCase()); }
    if (from) { sql += ` AND report_date >= $${idx++}`; params.push(from); }
    if (to) { sql += ` AND report_date <= $${idx++}`; params.push(to); }
    sql += ' ORDER BY report_date ASC';

    const result = await query(sql, params);

    logger.audit('REPORT_TRENDS_VIEWED', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip, phiAccessed: true,
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
  const patientId = req.params.id || req.user.id;
  try {
    const isAbnormal = (referenceLow != null && value < referenceLow) ||
                       (referenceHigh != null && value > referenceHigh);

    await query(
      `INSERT INTO blood_report_values
       (document_id, patient_id, test_name, test_name_lower, value, unit, reference_low, reference_high, is_abnormal, report_date)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [documentId, patientId, testName, testName.toLowerCase(), value, unit,
       referenceLow, referenceHigh, isAbnormal, reportDate]
    );

    res.status(201).json({ message: 'Report value saved', isAbnormal });
  } catch (err) {
    logger.error('Add blood value error', { error: err.message });
    res.status(500).json({ error: 'Failed to save report value' });
  }
};

// ─── GET previous opinions ───────────────────────────
// FIXED this pass — confirmed dead. This was still reading the legacy
// `consultations` table (flagged as "unconfirmed whether dead" in the
// 27 Jul summary; confirmed dead now — it throws "column c.opinion_number
// does not exist" on every call, which is what caused the patient
// dashboard's "MY CONDITIONS" spinner to hang forever). The real, live
// opinion data has always been in the `opinions` table (migration 016),
// which opinionController.js's own endpoints already use correctly —
// this was simply never repointed at it.
//
// Field mapping (old legacy column -> new opinions-table equivalent):
//   opinion_number  -> dropped; opinions has no equivalent, id is unique
//   started_at      -> dropped; opinions has no equivalent
//   completed_at    -> submitted_at (closest available "when ready" timestamp)
//   duration_minutes -> dropped; not meaningful for async opinions
//   chief_complaint -> dropped from here; lives on the questionnaire, not the opinion
//   diagnosis       -> impression (closest semantic equivalent in the new model)
//   doctor_notes    -> clinical_summary
//   follow_up_notes -> remarks
//   (new) type      -> condition, from patient_condition_episodes — the
//                       patient dashboard's opinion history table displays this
//
// Only 'submitted'/'acknowledged' opinions are returned — a doctor's
// in-progress draft should never be visible to the patient.
const getPatientOpinions = async (req, res) => {
  try {
    const patientId = req.params.id || req.user.id;
    const result = await query(
      `SELECT o.id, o.status, o.submitted_at, o.acknowledged_at,
              o.clinical_summary, o.impression, o.advice, o.remarks,
              pce.condition AS condition_type,
              d.first_name AS doctor_first, d.last_name AS doctor_last
       FROM opinions o
       JOIN patient_condition_episodes pce ON pce.id = o.episode_id
       JOIN doctors d ON d.id = o.doctor_id
       WHERE o.patient_id = $1
         AND o.status IN ('submitted', 'acknowledged')
       ORDER BY o.submitted_at DESC`,
      [patientId]
    );

    const opinions = result.rows.map(r => ({
      id: r.id,
      status: r.status,
      completedAt: r.submitted_at,
      acknowledgedAt: r.acknowledged_at,
      type: r.condition_type,
      diagnosis: r.impression,
      doctorNotes: r.clinical_summary,
      followUpNotes: r.remarks,
      doctorName: `Dr. ${decryptPHI(r.doctor_first)} ${decryptPHI(r.doctor_last)}`,
    }));

    logger.audit('OPINIONS_VIEWED', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip, phiAccessed: true,
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
    const patientId = req.params.id || req.user.id;
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
      [patientId]
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
      .resize(400, 400, { fit: 'cover', position: 'center' }) // sharp has no 'face' position/gravity value — that was never a real option, it just silently threw "Expected valid position/gravity/strategy... but received face of type string" on every single call. 'center' is the right fix here (not 'attention'/entropy-based smart cropping): the capture UI already guides the user to "Centre your face within the frame" before the shot is taken, so a plain center-crop matches what's already framed.
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

// ─── POST /patient/guardian-photo — guardian's photo for a minor ──────────
// New requirement (not part of the original minor-patient rules this
// codebase already had wired up) — a SEPARATE photo from the minor
// patient's own (photo_path above, which stays the mainstay field shown
// throughout the dashboard). This one is for documentation purposes
// only: same capture/processing/encryption pipeline as uploadPhoto,
// deliberately duplicated rather than parameterized, so the two can
// never accidentally cross-write each other's column if one is edited
// later. See migration 039.
const uploadGuardianPhoto = async (req, res) => {
  const patientId = req.user.id;

  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Guardian photo is required' });
    }

    const sharp = require('sharp');
    const crypto = require('crypto');
    const metadata = await sharp(req.file.buffer).metadata();
    if (!['jpeg', 'png'].includes(metadata.format)) {
      return res.status(400).json({ error: 'Only JPEG/PNG photos accepted' });
    }

    const processed = await sharp(req.file.buffer)
      .resize(400, 400, { fit: 'cover', position: 'center' }) // sharp has no 'face' position/gravity value — that was never a real option, it just silently threw "Expected valid position/gravity/strategy... but received face of type string" on every single call. 'center' is the right fix here (not 'attention'/entropy-based smart cropping): the capture UI already guides the user to "Centre your face within the frame" before the shot is taken, so a plain center-crop matches what's already framed.
      .jpeg({ quality: 85 })
      .toBuffer();

    const { encryptPhoto } = require('../utils/encryption');
    const encrypted = encryptPhoto(processed);
    const photoHash = crypto.createHash('sha256').update(processed).digest('hex');

    const photoDir = path.join(process.env.UPLOAD_PATH || './uploads', 'photos');
    if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

    const photoFilename = `${patientId}_guardian_${Date.now()}.enc`;
    const photoPath = path.join(photoDir, photoFilename);
    fs.writeFileSync(photoPath, JSON.stringify(encrypted));

    await query(
      `UPDATE patients SET guardian_photo_path = $1, guardian_photo_captured_at = NOW(), guardian_photo_hash = $2 WHERE id = $3`,
      [encryptPHI(photoPath), photoHash, patientId]
    );

    logger.audit('GUARDIAN_PHOTO_UPDATED', {
      userId: patientId, userRole: 'patient', ip: req.ip,
      phiAccessed: true, detail: 'Guardian photo captured (documentation only)',
    });

    res.json({ message: 'Guardian photo saved' });
  } catch (err) {
    logger.error('Upload guardian photo error', { error: err.message });
    res.status(500).json({ error: 'Failed to upload guardian photo' });
  }
};

module.exports = {
  getPatient,
  updatePatient,
  getPatientPhoto,
  getConsents,
  saveConsents,
  uploadPhoto,
  uploadGuardianPhoto,
  getDocuments,
  uploadDocument,
  downloadDocument,
  extractDocumentFields,
  getBloodReportValues,
  addBloodReportValue,
  getPatientOpinions,
  getInvoices,
};
