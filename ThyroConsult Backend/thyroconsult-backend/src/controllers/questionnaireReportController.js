// ============================================================
// Full path:
//   thyroconsult-backend\src\controllers\questionnaireReportController.js
//
// PILOT (item 3): GET /physician/episode/:episodeId/questionnaire-report
// Doctor-only. Streams a PDF compiling every question the patient
// answered for this episode, in questionnaire page order.
//
// Currently wired for Hypo only — same condition-table lookup and
// ownership-check pattern as opinionController.getEpisodeForReview,
// reused deliberately rather than reinvented.
// ============================================================

const db = require('../config/database');
const { decryptPHI } = require('../utils/encryption');
const { calculateAge } = require('../utils/calculateAge');
const { generateQuestionnaireReport } = require('../services/questionnaireReportService');

const CONDITION_TABLE_MAP = {
  hypothyroidism: 'hypo_questionnaire',
  // hyperthyroidism / thyroid_cancer / nodule added once their
  // formatters are built (see hypoReportFormatter.js header comment).
};

function streamPdf(res, pdfBuffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.end(pdfBuffer);
}

async function downloadQuestionnaireReport(req, res) {
  try {
    const { episodeId } = req.params;
    const doctorId = req.user.id;

    // Same ownership check as opinionController.getEpisodeForReview —
    // a doctor may only pull this for episodes assigned to them.
    const epResult = await db.query(
      `SELECT pce.id, pce.condition, p.first_name, p.last_name, p.dob, p.gender
       FROM patient_condition_episodes pce
       JOIN patients p ON p.id = pce.patient_id
       WHERE pce.id = $1 AND pce.primary_doctor_id = $2`,
      [episodeId, doctorId]
    );
    if (!epResult.rows.length) {
      return res.status(404).json({ error: 'Episode not found or not assigned to you' });
    }
    const episode = epResult.rows[0];

    const qTable = CONDITION_TABLE_MAP[episode.condition];
    let row = null;
    if (qTable) {
      const qResult = await db.query(`SELECT * FROM ${qTable} WHERE episode_id = $1`, [episodeId]);
      row = qResult.rows[0] || null;
    }

    const patient = {
      name: `${decryptPHI(episode.first_name)} ${decryptPHI(episode.last_name)}`,
      age: episode.dob ? calculateAge(decryptPHI(episode.dob)) : null,
      gender: episode.gender,
    };

    const pdfBuffer = await generateQuestionnaireReport({
      episode,
      patient,
      row,
      outputPath: null, // stream only, same as receiptController
    });

    const filename = `ThyroConsult_QuestionnaireSummary_${String(episodeId).slice(0, 8).toUpperCase()}.pdf`;
    streamPdf(res, pdfBuffer, filename);
  } catch (err) {
    console.error('downloadQuestionnaireReport error:', err);
    res.status(500).json({ error: 'Could not generate questionnaire report' });
  }
}

module.exports = { downloadQuestionnaireReport };
