// ============================================================
// Full path:
//   thyroconsult-backend\src\controllers\physicianController.js
//
// Physician portal — English only, always.
// Handles:
//   Investigation advising (S2 — doctor marks tests for patient)
//   Follow-up visit review (doctor reviews patient follow-up submission)
//   Pending work queue (dashboard data)
// ============================================================

const { pool }    = require('../config/database');
const { notify }  = require('../services/notificationService');
const templates   = require('../services/notificationTemplates');
const { decryptPHI } = require('../utils/encryption');
const { calculateAge } = require('../utils/calculateAge');

// patients.first_name/last_name/dob/mobile/email/whatsapp are application-layer
// AES-256-GCM encrypted (see utils/encryption.js) — they can never be
// concatenated, pattern-matched, or passed to date functions in SQL. Every
// query below now selects the raw encrypted columns and this helper decrypts
// them (and computes age) in JS before the data is used or returned.
function decryptPatientFields(row) {
  return {
    ...row,
    patient_name: row.first_name != null && row.last_name != null
      ? `${decryptPHI(row.first_name)} ${decryptPHI(row.last_name)}`
      : row.patient_name,
    dob:          row.dob ? decryptPHI(row.dob) : null,
    patient_age:  row.dob ? calculateAge(decryptPHI(row.dob)) : null,
    mobile:       row.mobile ? decryptPHI(row.mobile) : row.mobile,
    email:        row.email ? decryptPHI(row.email) : row.email,
    whatsapp:     row.whatsapp ? decryptPHI(row.whatsapp) : row.whatsapp,
  };
}

const CONDITION_LABELS = {
  hypo:   'Hypothyroidism',
  hyper:  'Hyperthyroidism',
  tc:     'CA Thyroid',
  nodule: 'Thyroid Nodule',
};

// ─────────────────────────────────────────────────────────────
// GET /api/physician/pending
// Returns all episodes pending physician action, grouped by type:
//   - investigation_review_pending = TRUE  → S2 review queue
//   - followup_review_pending = TRUE       → S3 review queue
//   - has_missing_reports = TRUE           → S1 incomplete (info only)
// ─────────────────────────────────────────────────────────────
async function getPendingWork(req, res) {
  try {
    const doctorId = req.user.id;

    const { rows: rawRows } = await pool.query(
      `SELECT
         pce.id                            AS episode_id,
         pce.patient_id,
         pce.condition                     AS condition_type,
         pce.status,
         pce.questionnaire_completed_at    AS submitted_at,
         pce.has_missing_reports,
         pce.has_advised_investigations,
         pce.investigation_review_pending,
         pce.investigation_payment_done,
         pce.followup_review_pending,
         pce.followup_payment_done,
         pce.patient_notified_at,
         p.first_name,
         p.last_name,
         p.dob,
         p.gender,
         (SELECT COUNT(*) FROM follow_up_visits fv
          WHERE fv.episode_id = pce.id AND fv.status = 'submitted')
                                           AS pending_followup_count,
         (SELECT COUNT(*) FROM advised_investigations ai
          WHERE ai.episode_id = pce.id AND ai.status = 'uploaded')
                                           AS uploaded_investigation_count
       FROM patient_condition_episodes pce
       JOIN patients p ON p.id = pce.patient_id
       WHERE pce.primary_doctor_id = $1
         AND (
           pce.investigation_review_pending = TRUE
           OR pce.followup_review_pending = TRUE
           OR pce.has_missing_reports = TRUE
         )
       ORDER BY pce.patient_notified_at DESC NULLS LAST, pce.questionnaire_completed_at DESC`,
      [doctorId]
    );

    const rows = rawRows.map(decryptPatientFields);

    // Group into queues
    const investigationQueue = rows.filter(r => r.investigation_review_pending);
    const followupQueue      = rows.filter(r => r.followup_review_pending && !r.investigation_review_pending);
    const missingReportsInfo = rows.filter(r => r.has_missing_reports && !r.investigation_review_pending && !r.followup_review_pending);

    res.json({
      investigationQueue,
      followupQueue,
      missingReportsInfo,
      totalPending: investigationQueue.length + followupQueue.length,
    });
  } catch (err) {
    console.error('getPendingWork error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/physician/episodes/:episodeId/patient-summary
// Returns questionnaire summary for an episode — for physician
// to review before advising investigations or reviewing follow-up
// ─────────────────────────────────────────────────────────────
async function getEpisodeSummary(req, res) {
  try {
    const { episodeId } = req.params;
    const doctorId = req.user.id;

    // Confirm doctor has access to this episode
    const { rows: epRowsRaw } = await pool.query(
      `SELECT pce.*, p.first_name, p.last_name,
              p.dob, p.gender, p.mobile
       FROM patient_condition_episodes pce
       JOIN patients p ON p.id = pce.patient_id
       WHERE pce.id = $1 AND pce.primary_doctor_id = $2`,
      [episodeId, doctorId]
    );

    if (!epRowsRaw[0]) return res.status(404).json({ error: 'Episode not found or access denied' });
    const episode = decryptPatientFields(epRowsRaw[0]);

    // Get the questionnaire data
    // NOTE: patient_condition_episodes.condition stores the full-word enum
    // values ('hypothyroidism' etc) — not the short codes this map used to
    // use, which meant questionnaire was always null.
    const condType = episode.condition;
    const qTable = {
      hypothyroidism:  'hypo_questionnaire',
      hyperthyroidism: 'hyper_questionnaire',
      thyroid_cancer:  'tc_questionnaire',
      nodule:          'nodule_questionnaire',
    }[condType];

    let questionnaire = null;
    if (qTable) {
      const { rows: qRows } = await pool.query(
        `SELECT * FROM ${qTable} WHERE episode_id = $1`,
        [episodeId]
      );
      questionnaire = qRows[0] || null;
    }

    // Get existing advised investigations
    const { rows: invRows } = await pool.query(
      `SELECT * FROM advised_investigations WHERE episode_id = $1 ORDER BY created_at ASC`,
      [episodeId]
    );

    // Get follow-up visits
    const { rows: fvRows } = await pool.query(
      `SELECT * FROM follow_up_visits WHERE episode_id = $1 ORDER BY visit_number ASC`,
      [episodeId]
    );

    res.json({
      episode,
      questionnaire,
      advisedInvestigations: invRows,
      followUpVisits: fvRows,
    });
  } catch (err) {
    console.error('getEpisodeSummary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/physician/episodes/:episodeId/advise-investigations
// Doctor advises one or more investigations for the patient.
// Body: { investigations: [{ testName, notes }] }
// Sets has_advised_investigations = TRUE on the episode.
// ─────────────────────────────────────────────────────────────
async function adviseInvestigations(req, res) {
  try {
    const { episodeId }    = req.params;
    const { investigations } = req.body;
    const doctorId = req.user.id;

    if (!Array.isArray(investigations) || investigations.length === 0) {
      return res.status(400).json({ error: 'investigations array is required and must not be empty' });
    }

    // Confirm doctor access
    const { rows: epRows } = await pool.query(
      `SELECT id, patient_id FROM patient_condition_episodes
       WHERE id = $1 AND primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epRows[0]) return res.status(404).json({ error: 'Episode not found or access denied' });
    const { patient_id } = epRows[0];

    // Insert each investigation
    const inserted = [];
    for (const inv of investigations) {
      if (!inv.testName || !inv.testName.trim()) continue;
      const { rows } = await pool.query(
        `INSERT INTO advised_investigations
           (episode_id, patient_id, test_name, notes, source, advised_by)
         VALUES ($1, $2, $3, $4, 'doctor', $5)
         RETURNING id, test_name, notes, source, status, created_at`,
        [episodeId, patient_id, inv.testName.trim(), inv.notes?.trim() || null, doctorId]
      );
      inserted.push(rows[0]);
    }

    // Mark episode as having advised investigations
    await pool.query(
      `UPDATE patient_condition_episodes
       SET has_advised_investigations = TRUE,
           investigation_review_pending = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [episodeId]
    );

    // Notify patient that investigations have been advised
    try {
      const { rows: ptRowsRaw } = await pool.query(
        `SELECT p.first_name, p.last_name,
                p.email, p.mobile, p.whatsapp,
                pce.condition
         FROM patients p
         JOIN patient_condition_episodes pce ON pce.patient_id = p.id
         WHERE pce.id = $1`,
        [episodeId]
      );
      if (ptRowsRaw[0]) {
        const patient = decryptPatientFields(ptRowsRaw[0]);
        const tpl = templates.investigationsAdvised({
          patientName:        patient.patient_name,
          conditionLabel:     patient.condition,
          investigationNames: inserted.map(i => i.test_name),
          episodeId,
        });
        await notify(patient, tpl);
      }
    } catch (notifErr) {
      console.error('adviseInvestigations notification error:', notifErr.message);
    }

    res.json({
      success: true,
      message: `${inserted.length} investigation(s) advised. Patient will be notified.`,
      investigations: inserted,
    });
  } catch (err) {
    console.error('adviseInvestigations error:', err);
    res.status(500).json({ error: 'Could not save investigations' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/physician/episodes/:episodeId/investigations
// Returns all investigations for an episode (doctor view)
// ─────────────────────────────────────────────────────────────
async function getEpisodeInvestigations(req, res) {
  try {
    const { episodeId } = req.params;
    const doctorId = req.user.id;

    const { rows: epRows } = await pool.query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epRows[0]) return res.status(404).json({ error: 'Episode not found or access denied' });

    const { rows } = await pool.query(
      `SELECT ai.*,
              u.name AS advised_by_name
       FROM advised_investigations ai
       LEFT JOIN doctors u ON u.id = ai.advised_by
       WHERE ai.episode_id = $1
       ORDER BY ai.source DESC, ai.created_at ASC`,
      [episodeId]
    );

    res.json(rows);
  } catch (err) {
    console.error('getEpisodeInvestigations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/physician/episodes/:episodeId/investigations/:invId
// Doctor updates an investigation (e.g. changes test name or notes)
// Body: { testName, notes }
// ─────────────────────────────────────────────────────────────
async function updateInvestigation(req, res) {
  try {
    const { episodeId, invId } = req.params;
    const { testName, notes } = req.body;
    const doctorId = req.user.id;

    const { rows: epRows } = await pool.query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epRows[0]) return res.status(404).json({ error: 'Episode not found or access denied' });

    const { rows } = await pool.query(
      `UPDATE advised_investigations
       SET test_name = COALESCE($1, test_name),
           notes     = COALESCE($2, notes)
       WHERE id = $3 AND episode_id = $4
       RETURNING id, test_name, notes, status`,
      [testName?.trim() || null, notes?.trim() || null, invId, episodeId]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Investigation not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('updateInvestigation error:', err);
    res.status(500).json({ error: 'Could not update investigation' });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/physician/episodes/:episodeId/investigations/:invId
// Doctor removes an investigation they advised (before patient uploads)
// ─────────────────────────────────────────────────────────────
async function deleteInvestigation(req, res) {
  try {
    const { episodeId, invId } = req.params;
    const doctorId = req.user.id;

    const { rows: epRows } = await pool.query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epRows[0]) return res.status(404).json({ error: 'Episode not found or access denied' });

    const { rows } = await pool.query(
      `DELETE FROM advised_investigations
       WHERE id = $1 AND episode_id = $2
         AND source = 'doctor' AND status = 'pending'
       RETURNING id`,
      [invId, episodeId]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Investigation not found or already uploaded — cannot delete' });

    // If no more doctor-advised investigations remain, clear the flag
    const { rows: remaining } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM advised_investigations
       WHERE episode_id = $1 AND source = 'doctor'`,
      [episodeId]
    );
    if (parseInt(remaining[0].cnt) === 0) {
      await pool.query(
        `UPDATE patient_condition_episodes
         SET has_advised_investigations = FALSE WHERE id = $1`,
        [episodeId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('deleteInvestigation error:', err);
    res.status(500).json({ error: 'Could not delete investigation' });
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/physician/episodes/:episodeId/investigations/:invId/mark-reviewed
// Doctor marks an uploaded investigation report as reviewed
// ─────────────────────────────────────────────────────────────
async function markInvestigationReviewed(req, res) {
  try {
    const { episodeId, invId } = req.params;
    const doctorId = req.user.id;

    const { rows: epRows } = await pool.query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epRows[0]) return res.status(404).json({ error: 'Episode not found or access denied' });

    await pool.query(
      `UPDATE advised_investigations SET status = 'reviewed' WHERE id = $1 AND episode_id = $2`,
      [invId, episodeId]
    );

    // Check if all uploaded investigations are now reviewed
    const { rows: pending } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM advised_investigations
       WHERE episode_id = $1 AND status = 'uploaded'`,
      [episodeId]
    );
    if (parseInt(pending[0].cnt) === 0) {
      await pool.query(
        `UPDATE patient_condition_episodes
         SET investigation_review_pending = FALSE, updated_at = NOW()
         WHERE id = $1`,
        [episodeId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('markInvestigationReviewed error:', err);
    res.status(500).json({ error: 'Could not mark as reviewed' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/physician/episodes/:episodeId/follow-up/:visitId
// Returns a specific follow-up visit for physician review
// ─────────────────────────────────────────────────────────────
async function getFollowUpVisit(req, res) {
  try {
    const { episodeId, visitId } = req.params;
    const doctorId = req.user.id;

    const { rows: epRowsRaw } = await pool.query(
      `SELECT pce.*, p.first_name, p.last_name, p.dob, p.gender
       FROM patient_condition_episodes pce
       JOIN patients p ON p.id = pce.patient_id
       WHERE pce.id = $1 AND pce.primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epRowsRaw[0]) return res.status(404).json({ error: 'Episode not found or access denied' });
    const episode = decryptPatientFields(epRowsRaw[0]);

    const { rows: fvRows } = await pool.query(
      `SELECT * FROM follow_up_visits WHERE id = $1 AND episode_id = $2`,
      [visitId, episodeId]
    );
    if (!fvRows[0]) return res.status(404).json({ error: 'Follow-up visit not found' });

    res.json({
      episode,
      visit:   fvRows[0],
    });
  } catch (err) {
    console.error('getFollowUpVisit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/physician/episodes/:episodeId/follow-up/:visitId/review
// Doctor reviews a follow-up visit and records their assessment.
// Body: {
//   assessmentNotes,         — free text physician assessment
//   medicationAction,        — 'continue' | 'increase' | 'decrease' | 'change' | 'stop'
//   newDoseMcg,              — numeric (optional, if dose changing)
//   newMedName,              — string (optional, if changing medication)
//   adviseInvestigations,    — array of { testName, notes } (optional)
//   followUpInMonths,        — numeric — when to follow up again
//   additionalNotes,         — string (optional)
// }
// ─────────────────────────────────────────────────────────────
async function reviewFollowUpVisit(req, res) {
  try {
    const { episodeId, visitId } = req.params;
    const doctorId = req.user.id;
    const {
      assessmentNotes,
      medicationAction,
      newDoseMcg,
      newMedName,
      adviseInvestigations: newInvestigations,
      followUpInMonths,
      additionalNotes,
    } = req.body;

    // Confirm access
    const { rows: epRows } = await pool.query(
      `SELECT id, patient_id FROM patient_condition_episodes
       WHERE id = $1 AND primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epRows[0]) return res.status(404).json({ error: 'Episode not found or access denied' });
    const { patient_id } = epRows[0];

    // Confirm visit exists and is submitted
    const { rows: fvRows } = await pool.query(
      `SELECT id, status FROM follow_up_visits
       WHERE id = $1 AND episode_id = $2`,
      [visitId, episodeId]
    );
    if (!fvRows[0]) return res.status(404).json({ error: 'Follow-up visit not found' });
    if (fvRows[0].status !== 'submitted') {
      return res.status(400).json({ error: 'Visit has not been submitted by patient yet' });
    }

    // Save review to follow_up_visits
    await pool.query(
      `UPDATE follow_up_visits
       SET status               = 'reviewed',
           updated_at           = NOW()
       WHERE id = $1`,
      [visitId]
    );

    // Save physician assessment as a consultation note
    const followUpDate = followUpInMonths
      ? new Date(Date.now() + followUpInMonths * 30 * 86400000).toISOString().split('T')[0]
      : null;

    await pool.query(
      `INSERT INTO consultations
         (patient_id, doctor_id, episode_id, visit_id,
          assessment_notes, medication_action, new_dose_mcg, new_med_name,
          follow_up_in_months, follow_up_date, additional_notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT DO NOTHING`,
      [
        patient_id, doctorId, episodeId, visitId,
        assessmentNotes || null,
        medicationAction || null,
        newDoseMcg      || null,
        newMedName      || null,
        followUpInMonths || null,
        followUpDate,
        additionalNotes || null,
      ]
    );

    // If doctor wants to advise new investigations as part of review
    if (Array.isArray(newInvestigations) && newInvestigations.length > 0) {
      for (const inv of newInvestigations) {
        if (!inv.testName?.trim()) continue;
        await pool.query(
          `INSERT INTO advised_investigations
             (episode_id, patient_id, test_name, notes, source, advised_by)
           VALUES ($1,$2,$3,$4,'doctor',$5)`,
          [episodeId, patient_id, inv.testName.trim(), inv.notes?.trim() || null, doctorId]
        );
      }
      await pool.query(
        `UPDATE patient_condition_episodes
         SET has_advised_investigations = TRUE WHERE id = $1`,
        [episodeId]
      );
    }

    // Clear follow-up review pending flag
    await pool.query(
      `UPDATE patient_condition_episodes
       SET followup_review_pending = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [episodeId]
    );

    // Notify patient that review is complete
    try {
      const { rows: ptRowsRaw } = await pool.query(
        `SELECT p.first_name, p.last_name,
                p.email, p.mobile, p.whatsapp,
                pce.condition
         FROM patients p
         JOIN patient_condition_episodes pce ON pce.patient_id = p.id
         WHERE pce.id = $1`,
        [episodeId]
      );
      if (ptRowsRaw[0]) {
        const patient = decryptPatientFields(ptRowsRaw[0]);
        const tpl = templates.followUpReviewedByDoctor({
          patientName:     patient.patient_name,
          conditionLabel:  patient.condition,
          medicationAction,
          followUpDate:    followUpDate || null,
          assessmentNotes: assessmentNotes || null,
        });
        await notify(patient, tpl);
      }
    } catch (notifErr) {
      console.error('reviewFollowUpVisit notification error:', notifErr.message);
    }

    res.json({
      success: true,
      message: 'Follow-up visit reviewed successfully.',
      followUpDate,
    });
  } catch (err) {
    console.error('reviewFollowUpVisit error:', err);
    res.status(500).json({ error: 'Could not save review' });
  }
}

module.exports = {
  getPendingWork,
  getEpisodeSummary,
  adviseInvestigations,
  getEpisodeInvestigations,
  updateInvestigation,
  deleteInvestigation,
  markInvestigationReviewed,
  getFollowUpVisit,
  reviewFollowUpVisit,
};
