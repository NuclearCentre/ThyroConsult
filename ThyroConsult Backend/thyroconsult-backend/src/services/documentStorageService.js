// src/services/documentStorageService.js
//
// Shared helper for saving an uploaded file into the `documents` table —
// encrypted, hashed, tagged with episode/field/opinion context. Used by
// patientController.uploadDocument (the questionnaire's own upload
// widgets) and, as of this fix, followUpController's S1 (missing
// reports) and S2 (advised investigations) upload paths — both of which
// previously wrote raw, UNENCRYPTED file paths directly into other
// tables, bypassing `documents` entirely (no encryption, no original
// filename/mime type/hash, invisible to the patient's "My Documents"
// view). This is now the one place that logic lives.

const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const { encryptPHI, hashFile } = require('../utils/encryption');
const logger = require('../utils/logger');

const VALID_CATEGORIES = ['blood_report', 'scan_usg', 'prescription', 'biopsy', 'other'];

/**
 * @param {object} params
 * @param {object} params.file           multer file object (req.file) — needs .path, .originalname, .mimetype, .size
 * @param {string} params.patientId
 * @param {string} params.category       one of VALID_CATEGORIES — defaults to 'other' if omitted/invalid
 * @param {string} [params.episodeId]
 * @param {string} [params.fieldLabel]   e.g. "TSH", "Anti-TPO" — must match the same label the
 *                                       original questionnaire uses for that test, so uploads from
 *                                       either path are recognized as the same field
 * @param {string} [params.opinionId]    caller resolves this (most recent opinion for the episode,
 *                                       or null) — kept as a param rather than looked up here so
 *                                       callers that already know it (or deliberately don't want it)
 *                                       don't pay for an extra query
 * @param {string} params.uploadedBy       req.user.id
 * @param {string} params.uploadedByRole   req.user.role
 * @returns {Promise<{id: string, originalName: string}>}
 */
async function saveUploadedDocument({
  file, patientId, category, episodeId, fieldLabel, opinionId,
  uploadedBy, uploadedByRole,
}) {
  if (!file) throw new Error('No file provided');
  const safeCategory = VALID_CATEGORIES.includes(category) ? category : 'other';

  const fileBuffer = fs.readFileSync(file.path);
  const fileHash = hashFile(fileBuffer);

  const patientDir = path.join(process.env.UPLOAD_PATH || './uploads', 'documents', patientId);
  if (!fs.existsSync(patientDir)) fs.mkdirSync(patientDir, { recursive: true });
  const finalPath = path.join(patientDir, path.basename(file.path));
  fs.renameSync(file.path, finalPath);

  const result = await query(
    `INSERT INTO documents(patient_id, category, original_name, storage_path, mime_type, file_size_bytes, file_hash, uploaded_by, uploaded_by_role, episode_id, field_label, opinion_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      patientId, safeCategory,
      encryptPHI(file.originalname),
      encryptPHI(finalPath),
      file.mimetype,
      file.size,
      fileHash,
      uploadedBy,
      uploadedByRole,
      episodeId || null,
      fieldLabel || null,
      opinionId || null,
    ]
  );

  logger.audit('DOCUMENT_UPLOADED', {
    userId: uploadedBy, userRole: uploadedByRole,
    patientId, resource: 'document', resourceId: result.rows[0].id,
    detail: `${safeCategory} uploaded${fieldLabel ? ` (${fieldLabel})` : ''}`,
  });

  return { id: result.rows[0].id, originalName: file.originalname };
}

/** Looks up the most recent opinion for an episode, or null if none yet. */
async function getCurrentOpinionId(episodeId) {
  if (!episodeId) return null;
  const res = await query(
    'SELECT id FROM opinions WHERE episode_id = $1 ORDER BY created_at DESC LIMIT 1',
    [episodeId]
  );
  return res.rows[0]?.id || null;
}

module.exports = { saveUploadedDocument, getCurrentOpinionId, VALID_CATEGORIES };
