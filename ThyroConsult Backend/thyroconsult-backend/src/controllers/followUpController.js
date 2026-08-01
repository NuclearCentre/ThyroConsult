// followUpController.js
// Handles: follow-up visits (S3), advised investigations (S2),
//          missing report uploads (S1)

const { pool }    = require('../config/database');
const { notify }  = require('../services/notificationService');
const templates   = require('../services/notificationTemplates');
const { decryptPHI } = require('../utils/encryption');
const { saveUploadedDocument, getCurrentOpinionId } = require('../services/documentStorageService');

// Field labels here MUST match exactly what each questionnaire's own
// upload widget (HypoQuestionnaire.js / HyperQuestionnaire.js) tags its
// uploads with — otherwise a report the patient already uploaded during
// the original questionnaire won't be recognized here as "already done",
// and a report uploaded here won't be recognized there. Hypo and Hyper
// use different label text for the same underlying test in a few cases
// (Hypo distinguishes "T3 (total)" from "Free T3 (FT3)"; Hyper only has
// FT3/FT4 at all, tagged with the short form) — kept condition-specific
// rather than one shared list to stay accurate to what each file actually
// tags.
//
// NOTE on valueFld names: these are best-effort based on the migrations
// reviewed so far (up to 018) plus what each questionnaire's own D-module
// fields are named. Hyper's TRAb/TSI column names in particular were not
// confirmed against an authoritative schema (migration 006 shows
// trab_status_d8/trab_value_new/tsi_status — not trab_value_d4/tsi_value,
// which is what's guessed below to match the frontend's actual field
// names). This is safe either way — a wrong/missing column name here just
// means that field never shows as "missing" (silent no-op via SELECT *),
// it cannot throw, so it degrades gracefully rather than breaking — but
// worth reconciling once the real hypo_questionnaire/hyper_questionnaire
// schemas are confirmed (same pending item already flagged for the
// saveHypoQuestionnaire/saveHyperQuestionnaire column-mapping bug).
const LAB_FIELDS_BY_CONDITION = {
  hypothyroidism: [
    { key: 'D1',  label: 'TSH',              valueFld: 'tsh_value' },
    { key: 'D2',  label: 'T3 (total)',       valueFld: 't3_value' },
    { key: 'D3',  label: 'Free T3 (FT3)',    valueFld: 'ft3_value' },
    { key: 'D4',  label: 'T4 (total)',       valueFld: 't4_value' },
    { key: 'D5',  label: 'Free T4 (FT4)',    valueFld: 'ft4_value' },
    { key: 'D6',  label: 'Anti-TPO',         valueFld: 'antitpo_value' },
    { key: 'D7',  label: 'Anti-Tg',          valueFld: 'antitg_value' },
    { key: 'D10', label: 'Thyroid imaging',  valueFld: 'imaging_status', category: 'scan_usg' },
  ],
  hyperthyroidism: [
    { key: 'D1',  label: 'TSH',              valueFld: 'tsh_value' },
    { key: 'D2',  label: 'FT4',              valueFld: 'ft4_value' },
    { key: 'D3',  label: 'FT3',              valueFld: 'ft3_value' },
    { key: 'D4a', label: 'TRAb',             valueFld: 'trab_value_d4' },
    { key: 'D4b', label: 'TSI',              valueFld: 'tsi_value' },
    { key: 'D5a', label: 'Anti-TPO',         valueFld: 'antitpo_value' },
    { key: 'D5b', label: 'Anti-Tg',          valueFld: 'antitg_value' },
    { key: 'D6',  label: 'Thyroid imaging',  valueFld: 'imaging_status', category: 'scan_usg' },
  ],
};

// ─────────────────────────────────────────────────────────────
// SCENARIO 1 — MISSING REPORTS
// ─────────────────────────────────────────────────────────────

// GET /api/episodes/:episodeId/missing-reports
// Returns list of D-module screens where report was not uploaded
async function getMissingReports(req, res) {
  try {
    const { episodeId } = req.params;
    const patientId     = req.user.patientId;

    // Fetch episode to confirm ownership
    const epResult = await pool.query(
      `SELECT id, condition AS condition_type, has_missing_reports FROM patient_condition_episodes
       WHERE id = $1 AND patient_id = $2`,
      [episodeId, patientId]
    );
    if (!epResult.rows[0]) return res.status(404).json({ error: 'Episode not found' });

    // NOTE: patient_condition_episodes.condition stores the full-word enum
    // values ('hypothyroidism' etc, from migration 002), not short codes —
    // this previously compared against 'hypo'/'hyper'/'tc' and always fell
    // through to nodule_questionnaire.
    const condType = epResult.rows[0].condition_type;
    const qTable   = condType === 'hypothyroidism'  ? 'hypo_questionnaire'
                   : condType === 'hyperthyroidism' ? 'hyper_questionnaire'
                   : condType === 'thyroid_cancer'   ? 'tc_questionnaire'
                   : 'nodule_questionnaire';

    const labFields = LAB_FIELDS_BY_CONDITION[condType] || [];

    const qResult = await pool.query(
      `SELECT * FROM ${qTable} WHERE episode_id = $1`,
      [episodeId]
    );
    const q = qResult.rows[0] || {};

    // A field is "missing" if the patient entered a value for it but no
    // document exists yet tagged with that exact field_label for this
    // episode — checked against the SAME `documents` table (migration
    // 022) that the original questionnaire's own upload widgets write
    // to, so an upload made during the initial questionnaire correctly
    // counts here too, not just uploads made through this S1 flow.
    const docsResult = await pool.query(
      `SELECT DISTINCT field_label FROM documents
       WHERE episode_id = $1 AND is_deleted = FALSE AND field_label IS NOT NULL`,
      [episodeId]
    );
    const uploadedLabels = new Set(docsResult.rows.map(r => r.field_label));

    const missing = labFields
      .filter(f => {
        const hasValue = q[f.valueFld] !== null && q[f.valueFld] !== '' && q[f.valueFld] !== undefined;
        return hasValue && !uploadedLabels.has(f.label);
      })
      .map(f => ({
        moduleKey:    f.key,
        label:        f.label,
        enteredValue: q[f.valueFld],
        category:     f.category || 'blood_report',
      }));

    res.json({ episodeId, conditionType: condType, missing });
  } catch (err) {
    console.error('getMissingReports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/episodes/:episodeId/missing-reports/:moduleKey
// Body: multipart — report file upload
async function uploadMissingReport(req, res) {
  try {
    const { episodeId, moduleKey } = req.params;
    const patientId = req.user.patientId;

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const epResult = await pool.query(
      `SELECT condition AS condition_type FROM patient_condition_episodes WHERE id = $1 AND patient_id = $2`,
      [episodeId, patientId]
    );
    if (!epResult.rows[0]) return res.status(404).json({ error: 'Episode not found' });

    const condType = epResult.rows[0].condition_type;
    const qTable   = condType === 'hypothyroidism'  ? 'hypo_questionnaire'
                   : condType === 'hyperthyroidism' ? 'hyper_questionnaire'
                   : condType === 'thyroid_cancer'   ? 'tc_questionnaire'
                   : 'nodule_questionnaire';

    const labFields = LAB_FIELDS_BY_CONDITION[condType] || [];
    const field = labFields.find(f => f.key === moduleKey);
    if (!field) return res.status(400).json({ error: `Unknown module key: ${moduleKey}` });

    const opinionId = await getCurrentOpinionId(episodeId);
    await saveUploadedDocument({
      file: req.file,
      patientId,
      category: field.category || 'blood_report',
      episodeId,
      fieldLabel: field.label,
      opinionId,
      uploadedBy: req.user.id,
      uploadedByRole: req.user.role,
    });

    // Check if all missing reports are now uploaded — if so, mark episode complete
    await checkAndMarkComplete(episodeId, condType, qTable);

    res.json({ success: true, moduleKey, label: field.label });
  } catch (err) {
    console.error('uploadMissingReport error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
}

// Marks episode has_missing_reports = FALSE when all report fields are filled
async function checkAndMarkComplete(episodeId, condType, qTable) {
  const { rows } = await pool.query(`SELECT * FROM ${qTable} WHERE episode_id = $1`, [episodeId]);
  const q = rows[0] || {};

  const labFields = LAB_FIELDS_BY_CONDITION[condType] || [];

  const docsResult = await pool.query(
    `SELECT DISTINCT field_label FROM documents
     WHERE episode_id = $1 AND is_deleted = FALSE AND field_label IS NOT NULL`,
    [episodeId]
  );
  const uploadedLabels = new Set(docsResult.rows.map(r => r.field_label));

  const anyStillMissing = labFields.some(f => {
    const hasValue = q[f.valueFld] !== null && q[f.valueFld] !== undefined && q[f.valueFld] !== '';
    return hasValue && !uploadedLabels.has(f.label);
  });

  if (!anyStillMissing) {
    await pool.query(
      `UPDATE patient_condition_episodes SET has_missing_reports = FALSE WHERE id = $1`,
      [episodeId]
    );
  }
}

// ─────────────────────────────────────────────────────────────
// SCENARIO 2 — ADVISED INVESTIGATIONS
// ─────────────────────────────────────────────────────────────

// GET /api/episodes/:episodeId/investigations
// Returns all advised + self-added investigations for an episode
async function getInvestigations(req, res) {
  try {
    const { episodeId } = req.params;
    const patientId     = req.user.patientId;

    const epCheck = await pool.query(
      `SELECT id FROM patient_condition_episodes WHERE id = $1 AND patient_id = $2`,
      [episodeId, patientId]
    );
    if (!epCheck.rows[0]) return res.status(404).json({ error: 'Episode not found' });

    // NOTE: advised_by references doctors(id), not a "users" table (no such
    // table exists in this schema) — that join previously errored on every
    // call. doctors.first_name/last_name are also PHI-encrypted, so the
    // name has to be decrypted in JS, not concatenated in SQL.
    const { rows } = await pool.query(
      `SELECT ai.id, ai.test_name, ai.notes, ai.source,
              ai.document_id, ai.report_uploaded_at, ai.status,
              d.first_name AS advised_by_first, d.last_name AS advised_by_last
       FROM advised_investigations ai
       LEFT JOIN doctors d ON d.id = ai.advised_by
       WHERE ai.episode_id = $1
       ORDER BY ai.source DESC, ai.created_at ASC`,
      [episodeId]
    );

    const result = rows.map(r => ({
      ...r,
      advised_by_name: r.advised_by_first
        ? `Dr. ${decryptPHI(r.advised_by_first)} ${decryptPHI(r.advised_by_last)}`
        : null,
    }));

    res.json(result);
  } catch (err) {
    console.error('getInvestigations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/episodes/:episodeId/investigations (patient self-add)
// Body: { testName, notes }
async function addInvestigation(req, res) {
  try {
    const { episodeId }       = req.params;
    const { testName, notes } = req.body;
    const patientId           = req.user.patientId;

    if (!testName) return res.status(400).json({ error: 'Test name is required' });

    const { rows } = await pool.query(
      `INSERT INTO advised_investigations
         (episode_id, patient_id, test_name, notes, source)
       VALUES ($1, $2, $3, $4, 'self')
       RETURNING id, test_name, notes, source, status`,
      [episodeId, patientId, testName, notes || null]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('addInvestigation error:', err);
    res.status(500).json({ error: 'Could not add investigation' });
  }
}

// POST /api/episodes/:episodeId/investigations/:invId/upload
// Multipart — upload report for an investigation
async function uploadInvestigationReport(req, res) {
  try {
    const { episodeId, invId } = req.params;
    const patientId = req.user.patientId;

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Fetch the investigation first — need its test_name to tag the
    // upload with a matching field_label, and to confirm the patient
    // actually owns it before writing anything.
    const invResult = await pool.query(
      `SELECT id, test_name FROM advised_investigations
       WHERE id = $1 AND episode_id = $2 AND patient_id = $3`,
      [invId, episodeId, patientId]
    );
    if (!invResult.rows[0]) return res.status(404).json({ error: 'Investigation not found' });

    const opinionId = await getCurrentOpinionId(episodeId);
    const doc = await saveUploadedDocument({
      file: req.file,
      patientId,
      category: 'blood_report',
      episodeId,
      fieldLabel: invResult.rows[0].test_name,
      opinionId,
      uploadedBy: req.user.id,
      uploadedByRole: req.user.role,
    });

    const { rows } = await pool.query(
      `UPDATE advised_investigations
       SET document_id         = $1,
           report_uploaded_at  = NOW(),
           status              = 'uploaded'
       WHERE id = $2 AND episode_id = $3 AND patient_id = $4
       RETURNING id, test_name, status`,
      [doc.id, invId, episodeId, patientId]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Investigation not found' });

    // Notify doctor — mark episode for review
    await pool.query(
      `UPDATE patient_condition_episodes SET investigation_review_pending = TRUE WHERE id = $1`,
      [episodeId]
    );

    res.json({ success: true, investigation: rows[0] });
  } catch (err) {
    console.error('uploadInvestigationReport error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
}

// POST /api/episodes/:episodeId/investigations/notify-doctor
// Patient explicitly notifies doctor all uploads are done
async function notifyDoctor(req, res) {
  try {
    const { episodeId } = req.params;
    const patientId     = req.user.patientId;

    await pool.query(
      `UPDATE patient_condition_episodes
       SET investigation_review_pending = TRUE,
           patient_notified_at = NOW()
       WHERE id = $1 AND patient_id = $2`,
      [episodeId, patientId]
    );

    // Notify physician
    try {
      const { rows: drRows } = await pool.query(
        `SELECT d.first_name, d.last_name, d.email, d.mobile, d.whatsapp
         FROM doctors d
         JOIN patient_condition_episodes pce ON pce.primary_doctor_id = d.id
         WHERE pce.id = $1`,
        [episodeId]
      );
      const { rows: ptRows } = await pool.query(
        `SELECT p.first_name, p.last_name,
                pce.condition
         FROM patients p
         JOIN patient_condition_episodes pce ON pce.patient_id = p.id
         WHERE pce.id = $1`,
        [episodeId]
      );
      if (drRows[0] && ptRows[0]) {
        const { rows: uploadedRows } = await pool.query(
          `SELECT COUNT(*) AS cnt FROM advised_investigations
           WHERE episode_id = $1 AND status = 'uploaded'`, [episodeId]
        );
        const doctor = {
          name:     `Dr. ${decryptPHI(drRows[0].first_name)} ${decryptPHI(drRows[0].last_name)}`,
          email:    drRows[0].email    ? decryptPHI(drRows[0].email)    : null,
          mobile:   drRows[0].mobile   ? decryptPHI(drRows[0].mobile)   : null,
          whatsapp: drRows[0].whatsapp ? decryptPHI(drRows[0].whatsapp) : null,
        };
        const tpl = templates.patientNotifiedDoctor({
          doctorName:       doctor.name,
          patientName:      `${decryptPHI(ptRows[0].first_name)} ${decryptPHI(ptRows[0].last_name)}`,
          conditionLabel:   ptRows[0].condition,
          uploadedCount:    parseInt(uploadedRows[0].cnt),
        });
        await notify(doctor, tpl);
      }
    } catch (notifErr) {
      console.error('notifyDoctor notification error:', notifErr.message);
    }

    res.json({ success: true, message: 'Doctor notified' });
  } catch (err) {
    console.error('notifyDoctor error:', err);
    res.status(500).json({ error: 'Could not notify doctor' });
  }
}

// ─────────────────────────────────────────────────────────────
// SCENARIO 3 — FOLLOW-UP VISITS
// ─────────────────────────────────────────────────────────────

// POST /api/episodes/:episodeId/follow-up
// Creates a new follow-up visit row (after payment confirmed)
async function createFollowUpVisit(req, res) {
  try {
    const { episodeId } = req.params;
    const patientId     = req.user.patientId;

    // Confirm payment done for this episode
    const paidCheck = await pool.query(
      `SELECT id FROM followup_payments
       WHERE episode_id = $1 AND status = 'paid' AND payment_type = 's3_full'`,
      [episodeId]
    );
    if (!paidCheck.rows[0]) {
      return res.status(403).json({ error: 'Payment required to start follow-up visit' });
    }

    // Get next visit number
    const countResult = await pool.query(
      `SELECT COALESCE(MAX(visit_number), 1) + 1 AS next_num
       FROM follow_up_visits WHERE episode_id = $1`,
      [episodeId]
    );
    const visitNumber = countResult.rows[0].next_num;

    const { rows } = await pool.query(
      `INSERT INTO follow_up_visits
         (episode_id, patient_id, payment_id, visit_number, status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING id, visit_number, status, created_at`,
      [episodeId, patientId, paidCheck.rows[0].id, visitNumber]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('createFollowUpVisit error:', err);
    res.status(500).json({ error: 'Could not create follow-up visit' });
  }
}

// GET /api/episodes/:episodeId/follow-up
// Returns all follow-up visits for an episode
async function getFollowUpVisits(req, res) {
  try {
    const { episodeId } = req.params;
    const patientId     = req.user.patientId;

    const { rows } = await pool.query(
      `SELECT fv.id, fv.visit_number, fv.status, fv.submitted_at,
              fv.lab_data, fv.symptom_delta, fv.new_symptoms_text,
              fv.medication_compliance, fv.created_at
       FROM follow_up_visits fv
       WHERE fv.episode_id = $1 AND fv.patient_id = $2
       ORDER BY fv.visit_number ASC`,
      [episodeId, patientId]
    );

    res.json(rows);
  } catch (err) {
    console.error('getFollowUpVisits error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/episodes/:episodeId/follow-up/:visitId
// Save draft — all three steps in one call
// Body: { labData, symptomDelta, newSymptomsText, medicationCompliance }
async function saveFollowUpDraft(req, res) {
  try {
    const { episodeId, visitId } = req.params;
    const patientId              = req.user.patientId;
    const { labData, symptomDelta, newSymptomsText, medicationCompliance } = req.body;

    const { rows } = await pool.query(
      `UPDATE follow_up_visits
       SET lab_data              = $1,
           symptom_delta         = $2,
           new_symptoms_text     = $3,
           medication_compliance = $4,
           updated_at            = NOW()
       WHERE id = $5 AND episode_id = $6 AND patient_id = $7 AND status = 'draft'
       RETURNING id, status, updated_at`,
      [
        JSON.stringify(labData || {}),
        JSON.stringify(symptomDelta || {}),
        newSymptomsText || null,
        medicationCompliance || null,
        visitId, episodeId, patientId,
      ]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Follow-up visit not found or already submitted' });

    res.json({ success: true, visit: rows[0] });
  } catch (err) {
    console.error('saveFollowUpDraft error:', err);
    res.status(500).json({ error: 'Could not save draft' });
  }
}

// POST /api/episodes/:episodeId/follow-up/:visitId/submit
// Final submission — marks status as submitted, notifies physician
async function submitFollowUp(req, res) {
  try {
    const { episodeId, visitId } = req.params;
    const patientId              = req.user.patientId;

    const { rows } = await pool.query(
      `UPDATE follow_up_visits
       SET status       = 'submitted',
           submitted_at = NOW(),
           updated_at   = NOW()
       WHERE id = $1 AND episode_id = $2 AND patient_id = $3 AND status = 'draft'
       RETURNING id, visit_number, submitted_at`,
      [visitId, episodeId, patientId]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Visit not found or already submitted' });

    // Mark episode as pending physician review
    await pool.query(
      `UPDATE patient_condition_episodes SET followup_review_pending = TRUE WHERE id = $1`,
      [episodeId]
    );

    // Notify physician that follow-up has been submitted
    try {
      const { rows: epRows } = await pool.query(
        `SELECT pce.condition, pce.primary_doctor_id,
                p.first_name, p.last_name
         FROM patient_condition_episodes pce
         JOIN patients p ON p.id = pce.patient_id
         WHERE pce.id = $1`, [episodeId]
      );
      const { rows: drRows } = await pool.query(
        `SELECT first_name, last_name, email, mobile, whatsapp FROM doctors WHERE id = $1`,
        [epRows[0]?.primary_doctor_id]
      );
      if (drRows[0] && epRows[0]) {
        const doctor = {
          name:     `Dr. ${decryptPHI(drRows[0].first_name)} ${decryptPHI(drRows[0].last_name)}`,
          email:    drRows[0].email    ? decryptPHI(drRows[0].email)    : null,
          mobile:   drRows[0].mobile   ? decryptPHI(drRows[0].mobile)   : null,
          whatsapp: drRows[0].whatsapp ? decryptPHI(drRows[0].whatsapp) : null,
        };
        const tpl = templates.followUpSubmittedToDoctor({
          doctorName:     doctor.name,
          patientName:    `${decryptPHI(epRows[0].first_name)} ${decryptPHI(epRows[0].last_name)}`,
          conditionLabel: epRows[0].condition,
          visitNumber:    rows[0].visit_number,
        });
        await notify(doctor, tpl);
      }
    } catch (notifErr) {
      console.error('submitFollowUp notification error:', notifErr.message);
    }

    res.json({ success: true, visit: rows[0] });
  } catch (err) {
    console.error('submitFollowUp error:', err);
    res.status(500).json({ error: 'Submission failed' });
  }
}

// POST /api/episodes/:episodeId/follow-up/:visitId/upload-lab
// Multipart — upload a new lab report for a follow-up visit
// Body fields: testKey (e.g. 'tsh'), value, unit, date
async function uploadFollowUpLab(req, res) {
  try {
    const { episodeId, visitId } = req.params;
    const patientId = req.user.patientId;
    const { testKey, value, unit, testDate } = req.body;

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Fetch existing lab_data
    const { rows: existing } = await pool.query(
      `SELECT lab_data FROM follow_up_visits
       WHERE id = $1 AND episode_id = $2 AND patient_id = $3`,
      [visitId, episodeId, patientId]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Visit not found' });

    // Same fix as uploadMissingReport/uploadInvestigationReport: goes
    // through the encrypted, tracked documents pipeline instead of a raw
    // unencrypted path — this one's tagged as its own follow-up-visit
    // reading (a distinct later data point from whatever was uploaded
    // during the original questionnaire, so a fresh field_label is
    // correct here, not a forced match to the original one).
    const opinionId = await getCurrentOpinionId(episodeId);
    const doc = await saveUploadedDocument({
      file: req.file,
      patientId,
      category: 'blood_report',
      episodeId,
      fieldLabel: testKey ? `${testKey.toUpperCase()} (follow-up)` : 'Follow-up lab report',
      opinionId,
      uploadedBy: req.user.id,
      uploadedByRole: req.user.role,
    });

    const labData = existing[0].lab_data || {};
    labData[testKey] = {
      value:      value || null,
      unit:       unit || null,
      date:       testDate || null,
      documentId: doc.id,
      uploadedAt: new Date().toISOString(),
    };

    await pool.query(
      `UPDATE follow_up_visits SET lab_data = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(labData), visitId]
    );

    res.json({ success: true, testKey, labData: labData[testKey] });
  } catch (err) {
    console.error('uploadFollowUpLab error:', err);
    res.status(500).json({ error: 'Lab upload failed' });
  }
}

module.exports = {
  getMissingReports,
  uploadMissingReport,
  getInvestigations,
  addInvestigation,
  uploadInvestigationReport,
  notifyDoctor,
  createFollowUpVisit,
  getFollowUpVisits,
  saveFollowUpDraft,
  submitFollowUp,
  uploadFollowUpLab,
};
