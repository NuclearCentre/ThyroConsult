// followUpController.js
// Handles: follow-up visits (S3), advised investigations (S2),
//          missing report uploads (S1)

const { pool }    = require('../config/database');
const { notify }  = require('../services/notificationService');
const templates   = require('../services/notificationTemplates');

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
      `SELECT id, condition_type, has_missing_reports FROM patient_condition_episodes
       WHERE id = $1 AND patient_id = $2`,
      [episodeId, patientId]
    );
    if (!epResult.rows[0]) return res.status(404).json({ error: 'Episode not found' });

    // Fetch questionnaire data to find which D fields have values but no report
    // Each condition stores reports in its own table
    const condType = epResult.rows[0].condition_type;
    const qTable   = condType === 'hypo'   ? 'hypo_questionnaire'
                   : condType === 'hyper'  ? 'hyper_questionnaire'
                   : condType === 'tc'     ? 'tc_questionnaire'
                   : 'nodule_questionnaire';

    const qResult = await pool.query(
      `SELECT * FROM ${qTable} WHERE episode_id = $1`,
      [episodeId]
    );
    const q = qResult.rows[0] || {};

    // Build missing report list — value entered but report_path is null/empty
    const missing = [];

    const labFields = [
      { key: 'D1',  label: 'TSH',              valueFld: 'tsh_value',      reportFld: 'tsh_report_path' },
      { key: 'D2',  label: 'T3 (total)',        valueFld: 't3_value',       reportFld: 't3_report_path' },
      { key: 'D3',  label: 'Free T3 (FT3)',     valueFld: 'ft3_value',      reportFld: 'ft3_report_path' },
      { key: 'D4',  label: 'T4 (total)',        valueFld: 't4_value',       reportFld: 't4_report_path' },
      { key: 'D5',  label: 'Free T4 (FT4)',     valueFld: 'ft4_value',      reportFld: 'ft4_report_path' },
      { key: 'D6',  label: 'Anti-TPO',          valueFld: 'antitpo_value',  reportFld: 'antitpo_report_path' },
      { key: 'D7',  label: 'Anti-Tg',           valueFld: 'antitg_value',   reportFld: 'antitg_report_path' },
      { key: 'D10', label: 'Thyroid imaging',   valueFld: 'imaging_status', reportFld: 'imaging_report_path' },
    ];

    // Hyper-specific
    if (condType === 'hyper') {
      labFields.push(
        { key: 'D8', label: 'TRAb', valueFld: 'trab_value', reportFld: 'trab_report_path' },
        { key: 'D9', label: 'TSI',  valueFld: 'tsi_value',  reportFld: 'tsi_report_path' }
      );
    }

    labFields.forEach(f => {
      const hasValue  = q[f.valueFld] !== null && q[f.valueFld] !== '' && q[f.valueFld] !== undefined;
      const hasReport = q[f.reportFld] !== null && q[f.reportFld] !== '' && q[f.reportFld] !== undefined;
      if (hasValue && !hasReport) {
        missing.push({
          moduleKey:    f.key,
          label:        f.label,
          enteredValue: q[f.valueFld],
          reportField:  f.reportFld,
        });
      }
    });

    res.json({ episodeId, conditionType: condType, missing });
  } catch (err) {
    console.error('getMissingReports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/episodes/:episodeId/missing-reports/:moduleKey
// Body: multipart — report file upload
// Updates the report_path field for that specific D-module screen
async function uploadMissingReport(req, res) {
  try {
    const { episodeId, moduleKey } = req.params;
    const patientId = req.user.patientId;

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const reportPath = req.file.path; // set by multer

    // Map moduleKey to the correct table + column
    const epResult = await pool.query(
      `SELECT condition_type FROM patient_condition_episodes WHERE id = $1 AND patient_id = $2`,
      [episodeId, patientId]
    );
    if (!epResult.rows[0]) return res.status(404).json({ error: 'Episode not found' });

    const condType = epResult.rows[0].condition_type;
    const qTable   = condType === 'hypo'   ? 'hypo_questionnaire'
                   : condType === 'hyper'  ? 'hyper_questionnaire'
                   : condType === 'tc'     ? 'tc_questionnaire'
                   : 'nodule_questionnaire';

    const reportFieldMap = {
      D1:  'tsh_report_path',
      D2:  't3_report_path',
      D3:  'ft3_report_path',
      D4:  't4_report_path',
      D5:  'ft4_report_path',
      D6:  'antitpo_report_path',
      D7:  'antitg_report_path',
      D8:  'trab_report_path',
      D9:  'tsi_report_path',
      D10: 'imaging_report_path',
    };

    const col = reportFieldMap[moduleKey];
    if (!col) return res.status(400).json({ error: `Unknown module key: ${moduleKey}` });

    await pool.query(
      `UPDATE ${qTable} SET ${col} = $1 WHERE episode_id = $2`,
      [reportPath, episodeId]
    );

    // Check if all missing reports are now uploaded — if so, mark episode complete
    await checkAndMarkComplete(episodeId, condType, qTable);

    res.json({ success: true, moduleKey, reportPath });
  } catch (err) {
    console.error('uploadMissingReport error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
}

// Marks episode has_missing_reports = FALSE when all report fields are filled
async function checkAndMarkComplete(episodeId, condType, qTable) {
  const { rows } = await pool.query(`SELECT * FROM ${qTable} WHERE episode_id = $1`, [episodeId]);
  const q = rows[0] || {};

  // Check only fields that had a value entered — if they all now have reports, mark complete
  const valueToReportMap = {
    tsh_value:      'tsh_report_path',
    t3_value:       't3_report_path',
    ft3_value:      'ft3_report_path',
    t4_value:       't4_report_path',
    ft4_value:      'ft4_report_path',
    antitpo_value:  'antitpo_report_path',
    antitg_value:   'antitg_report_path',
    trab_value:     'trab_report_path',
    tsi_value:      'tsi_report_path',
    imaging_status: 'imaging_report_path',
  };

  const anyStillMissing = Object.entries(valueToReportMap).some(([valFld, repFld]) => {
    const hasValue  = q[valFld] !== null && q[valFld] !== undefined && q[valFld] !== '';
    const hasReport = q[repFld] !== null && q[repFld] !== undefined && q[repFld] !== '';
    return hasValue && !hasReport;
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

    const { rows } = await pool.query(
      `SELECT ai.id, ai.test_name, ai.notes, ai.source,
              ai.report_path, ai.report_uploaded_at, ai.status,
              u.name AS advised_by_name
       FROM advised_investigations ai
       LEFT JOIN users u ON u.id = ai.advised_by
       WHERE ai.episode_id = $1
       ORDER BY ai.source DESC, ai.created_at ASC`,
      [episodeId]
    );

    res.json(rows);
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

    const { rows } = await pool.query(
      `UPDATE advised_investigations
       SET report_path        = $1,
           report_uploaded_at = NOW(),
           status             = 'uploaded'
       WHERE id = $2 AND episode_id = $3 AND patient_id = $4
       RETURNING id, test_name, status`,
      [req.file.path, invId, episodeId, patientId]
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
        `SELECT d.name, d.email, d.mobile, d.whatsapp
         FROM doctors d
         JOIN patient_condition_episodes pce ON pce.primary_doctor_id = d.id
         WHERE pce.id = $1`,
        [episodeId]
      );
      const { rows: ptRows } = await pool.query(
        `SELECT p.first_name || ' ' || p.last_name AS name,
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
        const tpl = templates.patientNotifiedDoctor({
          doctorName:       drRows[0].name,
          patientName:      ptRows[0].name,
          conditionLabel:   ptRows[0].condition,
          uploadedCount:    parseInt(uploadedRows[0].cnt),
        });
        await notify(drRows[0], tpl);
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
                p.first_name || ' ' || p.last_name AS patient_name
         FROM patient_condition_episodes pce
         JOIN patients p ON p.id = pce.patient_id
         WHERE pce.id = $1`, [episodeId]
      );
      const { rows: drRows } = await pool.query(
        `SELECT name, email, mobile, whatsapp FROM doctors WHERE id = $1`,
        [epRows[0]?.primary_doctor_id]
      );
      if (drRows[0] && epRows[0]) {
        const tpl = templates.followUpSubmittedToDoctor({
          doctorName:     drRows[0].name,
          patientName:    epRows[0].patient_name,
          conditionLabel: epRows[0].condition,
          visitNumber:    rows[0].visit_number,
        });
        await notify(drRows[0], tpl);
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

    const labData = existing[0].lab_data || {};
    labData[testKey] = {
      value:      value || null,
      unit:       unit || null,
      date:       testDate || null,
      reportPath: req.file.path,
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
