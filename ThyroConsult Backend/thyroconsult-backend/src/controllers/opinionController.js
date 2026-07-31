// src/controllers/opinionController.js
// Opinion workflow — doctor writes opinion, patient acknowledges
// All routes require JWT auth (verifyToken middleware applied in routes/index.js)

const db = require('../config/database');
const { notificationService } = require('../services/notificationService');
const { notificationTemplates } = require('../services/notificationTemplates');
const { decryptPHI } = require('../utils/encryption');
const { calculateAge } = require('../utils/calculateAge');
const { translateOpinionToPatientLanguage } = require('../services/translationService');

/**
 * Translate a just-submitted/amended opinion into the patient's
 * preferred_language and persist the result. Never throws — on failure
 * the opinion row is left with translation_status='failed' and the
 * English fields already saved are NOT affected. Per product decision:
 * the physician's submission is never blocked by this; the patient
 * portal is responsible for holding off display until status='success'.
 */
async function translateOpinionAsync(opinionId, patientId, fields) {
  try {
    const patRow = await db.query('SELECT preferred_language FROM patients WHERE id = $1', [patientId]);
    const lang = patRow.rows[0]?.preferred_language || 'en';

    if (lang === 'en') {
      await db.query(
        `UPDATE opinions SET translation_status = 'not_required', translated_lang = 'en' WHERE id = $1`,
        [opinionId]
      );
      return;
    }

    await db.query(
      `UPDATE opinions SET translation_status = 'pending', translation_attempted_at = NOW() WHERE id = $1`,
      [opinionId]
    );

    const translated = await translateOpinionToPatientLanguage(fields, lang);

    await db.query(
      `UPDATE opinions SET
         clinical_summary_translated = $1,
         impression_translated       = $2,
         advice_translated           = $3,
         remarks_translated          = $4,
         translated_lang              = $5,
         translation_status           = 'success',
         translation_completed_at     = NOW()
       WHERE id = $6`,
      [translated.clinicalSummary, translated.impression, translated.advice, translated.remarks, lang, opinionId]
    );
  } catch (err) {
    console.error('translateOpinionAsync error:', err);
    await db.query(
      `UPDATE opinions SET translation_status = 'failed' WHERE id = $1`,
      [opinionId]
    ).catch((e) => console.error('translateOpinionAsync: failed to mark status failed', e));
  }
}

// patients.first_name/last_name/dob/mobile/email/whatsapp are application-layer
// AES-256-GCM encrypted (see utils/encryption.js) — never usable directly in
// SQL (concatenation, AGE(), etc). Decrypt raw columns in JS instead.
function decryptPatientFields(row) {
  return {
    ...row,
    patient_name: row.first_name != null && row.last_name != null
      ? `${decryptPHI(row.first_name)} ${decryptPHI(row.last_name)}`
      : row.patient_name,
    dob:          row.dob ? decryptPHI(row.dob) : row.dob,
    age:          row.dob ? calculateAge(decryptPHI(row.dob)) : (row.age ?? null),
    mobile:       row.mobile ? decryptPHI(row.mobile) : row.mobile,
    email:        row.email ? decryptPHI(row.email) : row.email,
    whatsapp:     row.whatsapp ? decryptPHI(row.whatsapp) : row.whatsapp,
  };
}

// ─── Helper ────────────────────────────────────────────────────────────────

function toIST(date) {
  // Returns a Date adjusted to IST (UTC+5:30) for time-window checks
  const ist = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
  return ist;
}

function isWithinAllowedWindow(nowUtc) {
  // 9 am – 9 pm IST
  const ist = toIST(nowUtc);
  const hour = ist.getUTCHours(); // after adding 5.5h offset, getUTCHours = IST hour
  return hour >= 9 && hour < 21;
}

// ─── 1. Investigation master list ──────────────────────────────────────────

exports.getInvestigationMaster = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, category, test_name, display_order
       FROM investigation_master
       WHERE is_active = TRUE
       ORDER BY category, display_order`,
      []
    );

    // Group by category
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push({ id: row.id, name: row.test_name, display_order: row.display_order });
    }

    res.json({ success: true, data: grouped });
  } catch (err) {
    console.error('getInvestigationMaster error:', err);
    res.status(500).json({ success: false, message: 'Failed to load investigation list' });
  }
};

// ─── 2. Doctor: get pending queue ──────────────────────────────────────────

exports.getPhysicianQueue = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const now = new Date();

    const result = await db.query(
      `SELECT
         pce.id              AS episode_id,
         pce.patient_id,
         pce.condition       AS condition_type,
         pce.questionnaire_completed_at AS submitted_at,
         pce.opinion_submitted_at,
         pce.opinion_id,
         pce.episode_closed_at,
         p.first_name,
         p.last_name,
         p.dob,
         p.gender,
         EXTRACT(EPOCH FROM (NOW() - pce.questionnaire_completed_at)) / 3600 AS hours_since_submission,
         o.status            AS opinion_status
       FROM patient_condition_episodes pce
       JOIN patients p ON p.id = pce.patient_id
       LEFT JOIN opinions o ON o.id = pce.opinion_id
       WHERE pce.primary_doctor_id = $1
         AND pce.questionnaire_completed_at IS NOT NULL
         AND pce.episode_closed_at IS NULL
       ORDER BY pce.questionnaire_completed_at ASC`,
      [doctorId]
    );

    const queue = result.rows.map(decryptPatientFields).map(row => ({
      episodeId:            row.episode_id,
      patientId:            row.patient_id,
      patientName:          row.patient_name,
      age:                  row.age,
      sex:                  row.gender,
      conditionType:        row.condition_type,
      submittedAt:          row.submitted_at,
      opinionStatus:        row.opinion_status || 'pending',
      opinionSubmittedAt:   row.opinion_submitted_at,
      hoursSinceSubmission: parseFloat(row.hours_since_submission || 0).toFixed(1),
      isOverdue:            parseFloat(row.hours_since_submission || 0) >= 48,
      isCritical:           parseFloat(row.hours_since_submission || 0) >= 72,
    }));

    res.json({ success: true, data: queue });
  } catch (err) {
    console.error('getPhysicianQueue error:', err);
    res.status(500).json({ success: false, message: 'Failed to load queue' });
  }
};

// ─── 3. Doctor: get full episode for review ────────────────────────────────

exports.getEpisodeForReview = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const doctorId = req.user.id;

    // Episode + patient basics
    // NOTE: marital_status is not a patients column — it's captured per
    // condition inside hypo/hyper/tc/nodule/core_questionnaire (migrations
    // 008-011). It comes back below via questionnaireData once qTable is
    // resolved, not from this query.
    const epResult = await db.query(
      `SELECT
         pce.*,
         p.first_name, p.last_name, p.dob, p.gender, p.mobile, p.email,
         p.address_line1, p.address_line2, p.city, p.state, p.pincode,
         p.preferred_language
       FROM patient_condition_episodes pce
       JOIN patients p ON p.id = pce.patient_id
       WHERE pce.id = $1 AND pce.primary_doctor_id = $2`,
      [episodeId, doctorId]
    );

    if (!epResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Episode not found or not assigned to you' });
    }

    const episode = decryptPatientFields(epResult.rows[0]);
    episode.address_line1 = episode.address_line1 ? decryptPHI(episode.address_line1) : null;
    episode.address_line2 = episode.address_line2 ? decryptPHI(episode.address_line2) : null;
    episode.city          = episode.city  ? decryptPHI(episode.city)  : null;
    episode.state         = episode.state ? decryptPHI(episode.state) : null;

    // Questionnaire answers (pick correct table by condition)
    // NOTE: patient_condition_episodes.condition stores the full-word enum
    // values ('hypothyroidism' etc) — episode.condition_type didn't exist
    // (the real column is `condition`), so this lookup always missed and
    // questionnaireData was always null.
    let questionnaireData = null;
    const conditionTableMap = {
      hypothyroidism:  'hypo_questionnaire',
      hyperthyroidism: 'hyper_questionnaire',
      thyroid_cancer:  'tc_questionnaire',
      nodule:          'nodule_questionnaire',
    };
    const qTable = conditionTableMap[episode.condition];
    if (qTable) {
      const qResult = await db.query(
        `SELECT * FROM ${qTable} WHERE episode_id = $1`,
        [episodeId]
      );
      questionnaireData = qResult.rows[0] || null;

      // Physician portal is English-only, always. If the patient's
      // language isn't English, overwrite each free-text field with its
      // English translation (physician's own correction takes priority
      // over the AI's translation) before this reaches the response.
      // field_translations itself (raw map) stays on the object too, so
      // a "correct this translation" UI can diff against the AI output.
      if (questionnaireData && episode.preferred_language && episode.preferred_language !== 'en') {
        const translations = questionnaireData.field_translations || {};
        for (const [field, entry] of Object.entries(translations)) {
          if (!entry) continue;
          const english = entry.en_corrected ?? entry.en_ai;
          if (english !== undefined && english !== null) {
            questionnaireData[field] = english;
          }
        }
      }
    }

    // Uploaded documents
    // NOTE: documents has no episode_id column at all — it's associated by
    // patient_id, not episode. This query previously filtered on a column
    // that doesn't exist and used four more wrong column names on top of
    // that (doc_type/file_name/file_url/uploaded_at vs the real
    // category/original_name/storage_path/mime_type/created_at) —
    // every single call to this endpoint would have thrown a hard SQL
    // error ("column episode_id does not exist"). original_name is also
    // PHI-encrypted and needs decrypting in JS, not read raw.
    const docsResult = await db.query(
      `SELECT id, category, original_name, mime_type, created_at
       FROM documents
       WHERE patient_id = $1 AND is_deleted = FALSE
       ORDER BY created_at DESC`,
      [episode.patient_id]
    );
    const documents = docsResult.rows.map(d => ({
      ...d,
      original_name: d.original_name ? decryptPHI(d.original_name) : null,
    }));

    // Existing draft opinion if any
    const opinionResult = await db.query(
      `SELECT * FROM opinions WHERE episode_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [episodeId]
    );

    res.json({
      success: true,
      data: {
        episode,
        questionnaire: questionnaireData,
        documents,
        opinion: opinionResult.rows[0] || null,
      }
    });
  } catch (err) {
    console.error('getEpisodeForReview error:', err);
    res.status(500).json({ success: false, message: 'Failed to load episode' });
  }
};

// ─── 4. Doctor: save draft opinion ─────────────────────────────────────────

exports.saveDraftOpinion = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const doctorId = req.user.id;
    const { clinicalSummary, impression, advice, investigations, remarks } = req.body;

    // Verify episode belongs to this doctor
    const epCheck = await db.query(
      `SELECT id, patient_id FROM patient_condition_episodes
       WHERE id = $1 AND primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epCheck.rows.length) {
      return res.status(403).json({ success: false, message: 'Episode not assigned to you' });
    }
    const { patient_id: patientId } = epCheck.rows[0];

    // Upsert draft (one opinion per episode)
    const existing = await db.query(
      `SELECT id, status FROM opinions WHERE episode_id = $1`,
      [episodeId]
    );

    if (existing.rows.length) {
      if (existing.rows[0].status === 'acknowledged') {
        return res.status(400).json({ success: false, message: 'Opinion already acknowledged by patient — cannot edit' });
      }
      await db.query(
        `UPDATE opinions SET
           clinical_summary  = $1,
           impression        = $2,
           advice            = $3,
           investigations    = $4,
           remarks           = $5,
           last_amended_at   = NOW()
         WHERE id = $6`,
        [clinicalSummary, impression, advice, JSON.stringify(investigations || []), remarks, existing.rows[0].id]
      );
      return res.json({ success: true, message: 'Draft saved', opinionId: existing.rows[0].id });
    }

    // Create new draft
    const insert = await db.query(
      `INSERT INTO opinions
         (episode_id, patient_id, doctor_id, clinical_summary, impression, advice, investigations, remarks, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
       RETURNING id`,
      [episodeId, patientId, doctorId, clinicalSummary, impression, advice, JSON.stringify(investigations || []), remarks]
    );

    res.json({ success: true, message: 'Draft saved', opinionId: insert.rows[0].id });
  } catch (err) {
    console.error('saveDraftOpinion error:', err);
    res.status(500).json({ success: false, message: 'Failed to save draft' });
  }
};

// ─── 5. Doctor: submit opinion (final) ─────────────────────────────────────

exports.submitOpinion = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const doctorId = req.user.id;
    const { clinicalSummary, impression, advice, investigations, remarks } = req.body;

    if (!clinicalSummary || !impression || !advice) {
      return res.status(400).json({
        success: false,
        message: 'Clinical Summary, Impression, and Advice are required before submitting'
      });
    }

    // Verify episode
    const epCheck = await db.query(
      `SELECT pce.id, pce.patient_id, p.first_name, p.last_name, p.mobile, p.email
       FROM patient_condition_episodes pce
       JOIN patients p ON p.id = pce.patient_id
       WHERE pce.id = $1 AND pce.primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epCheck.rows.length) {
      return res.status(403).json({ success: false, message: 'Episode not assigned to you' });
    }

    const ep = epCheck.rows[0];
    const now = new Date();

    // Upsert + mark submitted
    const existing = await db.query(
      `SELECT id, status FROM opinions WHERE episode_id = $1`,
      [episodeId]
    );

    let opinionId;
    if (existing.rows.length) {
      if (existing.rows[0].status === 'acknowledged') {
        return res.status(400).json({ success: false, message: 'Opinion already acknowledged by patient' });
      }
      await db.query(
        `UPDATE opinions SET
           clinical_summary = $1, impression = $2, advice = $3,
           investigations   = $4, remarks    = $5,
           status           = 'submitted', submitted_at = NOW(), last_amended_at = NOW()
         WHERE id = $6`,
        [clinicalSummary, impression, advice, JSON.stringify(investigations || []), remarks, existing.rows[0].id]
      );
      opinionId = existing.rows[0].id;
    } else {
      const insert = await db.query(
        `INSERT INTO opinions
           (episode_id, patient_id, doctor_id, clinical_summary, impression, advice, investigations, remarks, status, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'submitted', NOW())
         RETURNING id`,
        [episodeId, ep.patient_id, doctorId, clinicalSummary, impression, advice, JSON.stringify(investigations || []), remarks]
      );
      opinionId = insert.rows[0].id;
    }

    // Update episode
    await db.query(
      `UPDATE patient_condition_episodes SET
         opinion_id           = $1,
         opinion_submitted_at = NOW(),
         alert_stopped        = TRUE
       WHERE id = $2`,
      [opinionId, episodeId]
    );

    // Notify patient — WhatsApp + email
    const decryptedPatient = decryptPatientFields(ep);
    const patient = { ...decryptedPatient, name: decryptedPatient.patient_name };
    const template = notificationTemplates.opinionReady(patient);
    await notificationService.notify(patient, template).catch(e =>
      console.error('Opinion notify patient error:', e)
    );

    res.json({ success: true, message: 'Online opinion submitted successfully', opinionId });

    // Fire-and-forget — physician's submission is never blocked on this.
    // Patient portal holds off showing the opinion until translation_status
    // is 'success' (or 'not_required' if the patient's language is English).
    translateOpinionAsync(opinionId, ep.patient_id, { clinicalSummary, impression, advice, remarks });
  } catch (err) {
    console.error('submitOpinion error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit opinion' });
  }
};

// ─── 6. Doctor: amend opinion (only if not yet acknowledged) ───────────────

exports.amendOpinion = async (req, res) => {
  try {
    const { opinionId } = req.params;
    const doctorId = req.user.id;
    const { clinicalSummary, impression, advice, investigations, remarks } = req.body;

    const opResult = await db.query(
      `SELECT o.*, pce.primary_doctor_id
       FROM opinions o
       JOIN patient_condition_episodes pce ON pce.id = o.episode_id
       WHERE o.id = $1`,
      [opinionId]
    );

    if (!opResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Opinion not found' });
    }

    const op = opResult.rows[0];

    if (op.doctor_id !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not your opinion' });
    }
    if (op.status === 'acknowledged') {
      return res.status(400).json({ success: false, message: 'Patient has already acknowledged — no further amendments allowed' });
    }

    await db.query(
      `UPDATE opinions SET
         clinical_summary = $1, impression = $2, advice = $3,
         investigations   = $4, remarks    = $5,
         last_amended_at  = NOW()
       WHERE id = $6`,
      [clinicalSummary, impression, advice, JSON.stringify(investigations || []), remarks, opinionId]
    );

    res.json({ success: true, message: 'Opinion amended successfully' });

    // Content changed — re-translate. Patient portal will hold off showing
    // the (now stale) previous translation while this completes, same as
    // on first submission.
    translateOpinionAsync(opinionId, op.patient_id, { clinicalSummary, impression, advice, remarks });
  } catch (err) {
    console.error('amendOpinion error:', err);
    res.status(500).json({ success: false, message: 'Failed to amend opinion' });
  }
};

// ─── 7. Doctor: close episode ──────────────────────────────────────────────

exports.closeEpisode = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const doctorId = req.user.id;

    const epCheck = await db.query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epCheck.rows.length) {
      return res.status(403).json({ success: false, message: 'Episode not found or not assigned to you' });
    }

    await db.query(
      `UPDATE patient_condition_episodes SET episode_closed_at = NOW() WHERE id = $1`,
      [episodeId]
    );

    res.json({ success: true, message: 'Episode closed' });
  } catch (err) {
    console.error('closeEpisode error:', err);
    res.status(500).json({ success: false, message: 'Failed to close episode' });
  }
};

// ─── 7b. Doctor: correct a free-text field's AI translation ───────────────
// PATCH /api/physician/episode/:episodeId/questionnaire-translation
// Body: { table: 'core_questionnaire'|'hypo_questionnaire'|'hyper_questionnaire'
//              |'tc_questionnaire'|'nodule_questionnaire', field: string, correctedText: string }
//
// Stores the correction in field_translations[field].en_corrected — the
// AI's original en_ai is left untouched for audit (migration 019). The
// original patient-language text in the plain column is never touched by
// this — the patient portal keeps showing exactly what the patient typed.

const TRANSLATABLE_TABLES = new Set([
  'core_questionnaire', 'hypo_questionnaire', 'hyper_questionnaire',
  'tc_questionnaire', 'nodule_questionnaire',
]);

exports.correctFieldTranslation = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const doctorId = req.user.id;
    const { table, field, correctedText } = req.body;

    if (!TRANSLATABLE_TABLES.has(table)) {
      return res.status(400).json({ success: false, message: 'Invalid table' });
    }
    if (!field || typeof correctedText !== 'string') {
      return res.status(400).json({ success: false, message: 'field and correctedText are required' });
    }

    const epCheck = await db.query(
      `SELECT id FROM patient_condition_episodes WHERE id = $1 AND primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epCheck.rows.length) {
      return res.status(403).json({ success: false, message: 'Episode not assigned to you' });
    }

    // table is validated against TRANSLATABLE_TABLES above (not user-controlled
    // SQL) — safe to interpolate.
    const existing = await db.query(
      `SELECT field_translations FROM ${table} WHERE episode_id = $1`,
      [episodeId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Questionnaire not found for this episode' });
    }

    const translations = existing.rows[0].field_translations || {};
    if (!translations[field]) {
      // No AI translation exists yet for this field (e.g. patient's language
      // is English, so it was never translated) — still allow the physician
      // to record a correction, with en_ai left null.
      translations[field] = { en_ai: null, en_corrected: null, translated_at: null };
    }
    translations[field].en_corrected = correctedText;

    await db.query(
      `UPDATE ${table} SET field_translations = $1::jsonb WHERE episode_id = $2`,
      [JSON.stringify(translations), episodeId]
    );

    res.json({ success: true, message: 'Translation correction saved' });
  } catch (err) {
    console.error('correctFieldTranslation error:', err);
    res.status(500).json({ success: false, message: 'Failed to save correction' });
  }
};

// ─── 8. Patient: get opinion ───────────────────────────────────────────────

exports.getPatientOpinion = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const patientId = req.user.id;

    const result = await db.query(
      `SELECT o.*, d.first_name AS doctor_first, d.last_name AS doctor_last, d.qualifications AS qualification
       FROM opinions o
       JOIN doctors d ON d.id = o.doctor_id
       WHERE o.episode_id = $1 AND o.patient_id = $2
         AND o.status IN ('submitted', 'acknowledged')`,
      [episodeId, patientId]
    );

    if (!result.rows.length) {
      return res.json({ success: true, data: null, message: 'Opinion not yet available' });
    }

    const op = result.rows[0];

    // Gate on translation status (migration 019). 'not_required' means the
    // patient's language is English — nothing to wait for. 'success' means
    // the translated_* columns are ready. 'pending'/'failed' means we must
    // NOT show untranslated English to a patient on a non-English portal —
    // hold the opinion back with a status the frontend can poll on, rather
    // than an error or a silent English fallback.
    if (op.translation_status === 'pending' || op.translation_status === 'failed') {
      return res.json({
        success: true,
        data: null,
        translationPending: true,
        message: 'Your doctor\'s opinion is ready and is being translated into your language — please check back shortly.',
      });
    }

    const useTranslated = op.translation_status === 'success';
    res.json({
      success: true,
      data: {
        opinionId:       op.id,
        doctorName:      `Dr. ${decryptPHI(op.doctor_first)} ${decryptPHI(op.doctor_last)}`,
        qualification:   op.qualification,
        clinicalSummary: useTranslated ? op.clinical_summary_translated : op.clinical_summary,
        impression:      useTranslated ? op.impression_translated      : op.impression,
        advice:          useTranslated ? op.advice_translated          : op.advice,
        investigations:  op.investigations || [],
        remarks:         useTranslated ? op.remarks_translated         : op.remarks,
        language:        useTranslated ? op.translated_lang : 'en',
        status:          op.status,
        submittedAt:     op.submitted_at,
        acknowledgedAt:  op.acknowledged_at,
        lastAmendedAt:   op.last_amended_at,
      }
    });
  } catch (err) {
    console.error('getPatientOpinion error:', err);
    res.status(500).json({ success: false, message: 'Failed to load opinion' });
  }
};

// ─── 9. Patient: acknowledge opinion ──────────────────────────────────────

exports.acknowledgeOpinion = async (req, res) => {
  try {
    const { opinionId } = req.params;
    const patientId = req.user.id;

    const opResult = await db.query(
      `SELECT * FROM opinions WHERE id = $1 AND patient_id = $2`,
      [opinionId, patientId]
    );

    if (!opResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Opinion not found' });
    }

    const op = opResult.rows[0];

    if (op.status === 'acknowledged') {
      return res.json({ success: true, message: 'Already acknowledged' });
    }
    if (op.status !== 'submitted') {
      return res.status(400).json({ success: false, message: 'Opinion is not ready for acknowledgement' });
    }

    const ip        = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    // Mark acknowledged
    await db.query(
      `UPDATE opinions SET status = 'acknowledged', acknowledged_at = NOW() WHERE id = $1`,
      [opinionId]
    );

    // Log acknowledgement
    await db.query(
      `INSERT INTO patient_acknowledgements (opinion_id, patient_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [opinionId, patientId, ip, userAgent]
    );

    // Update episode
    await db.query(
      `UPDATE patient_condition_episodes SET opinion_acknowledged_at = NOW() WHERE id = $1`,
      [op.episode_id]
    );

    res.json({ success: true, message: 'Opinion acknowledged' });
  } catch (err) {
    console.error('acknowledgeOpinion error:', err);
    res.status(500).json({ success: false, message: 'Failed to acknowledge opinion' });
  }
};

// ─── 10. Patient: get episode timeline ────────────────────────────────────

exports.getEpisodeTimeline = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const patientId = req.user.id;

    const result = await db.query(
      `SELECT
         pce.id, pce.condition AS condition_type, pce.created_at AS paid_at,
         pce.questionnaire_completed_at AS submitted_at, pce.opinion_submitted_at,
         pce.opinion_acknowledged_at, pce.episode_closed_at,
         pce.has_missing_reports, pce.has_advised_investigations,
         o.status AS opinion_status
       FROM patient_condition_episodes pce
       LEFT JOIN opinions o ON o.id = pce.opinion_id
       WHERE pce.id = $1 AND pce.patient_id = $2`,
      [episodeId, patientId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Episode not found' });
    }

    const ep = result.rows[0];

    const steps = [
      {
        key:       'paid',
        label:     'Payment Received',
        detail:    'Your online opinion fee has been received.',
        completed: !!ep.paid_at,
        timestamp: ep.paid_at,
      },
      {
        key:       'submitted',
        label:     'Details Submitted',
        detail:    'Your medical information and reports have been submitted.',
        completed: !!ep.submitted_at,
        timestamp: ep.submitted_at,
      },
      {
        key:       'reviewing',
        label:     'Doctor Reviewing',
        detail:    ep.opinion_submitted_at
                     ? 'Our panel doctor has completed the review.'
                     : 'Our panel doctor is reviewing your details. You will be notified within 48–72 hours.',
        completed: !!ep.opinion_submitted_at,
        timestamp: null,
        inProgress: !!ep.submitted_at && !ep.opinion_submitted_at,
      },
      {
        key:       'opinion_ready',
        label:     'Online Opinion Ready',
        detail:    'Your online opinion is ready. Please review and acknowledge.',
        completed: !!ep.opinion_submitted_at,
        timestamp: ep.opinion_submitted_at,
      },
      {
        key:       'closed',
        label:     'Visit Closed',
        detail:    'This visit has been completed.',
        completed: !!ep.episode_closed_at,
        timestamp: ep.episode_closed_at,
      },
    ];

    res.json({ success: true, data: { steps, conditionType: ep.condition_type } });
  } catch (err) {
    console.error('getEpisodeTimeline error:', err);
    res.status(500).json({ success: false, message: 'Failed to load timeline' });
  }
};
