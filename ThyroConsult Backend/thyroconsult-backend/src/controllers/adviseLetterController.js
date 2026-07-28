// src/controllers/adviseLetterController.js
// Advise Letter — doctor generates, both doctor and patient can download

const db = require('../config/database');
const { generateAdviseLetter }  = require('../services/adviseLetterService');
const { notificationService }   = require('../services/notificationService');
const { notificationTemplates } = require('../services/notificationTemplates');

// ─── Helper: fetch all data needed to build the PDF ───────────────────────

async function fetchLetterData(episodeId, doctorId) {
  // Opinion
  const opResult = await db.query(
    `SELECT o.*,
            d.first_name  AS doc_first,
            d.last_name   AS doc_last,
            d.qualification,
            d.registration_number,
            p.first_name  AS pat_first,
            p.last_name   AS pat_last,
            p.age, p.sex,
            p.phone       AS pat_phone,
            p.email       AS pat_email,
            pg.first_name AS guard_first,
            pg.last_name  AS guard_last,
            pce.condition_type,
            pce.id        AS episode_id,
            pce.patient_id
     FROM opinions o
     JOIN doctors  d   ON d.id   = o.doctor_id
     JOIN patients p   ON p.id   = o.patient_id
     LEFT JOIN patients pg ON pg.id = p.guardian_patient_id   -- if minor
     JOIN patient_condition_episodes pce ON pce.id = o.episode_id
     WHERE o.episode_id = $1
       AND o.status IN ('submitted', 'acknowledged')`,
    [episodeId]
  );

  if (!opResult.rows.length) return null;
  const row = opResult.rows[0];

  // Verify doctor owns this episode
  if (doctorId && row.doctor_id !== doctorId) return null;

  return {
    patient: {
      name:         `${row.pat_first} ${row.pat_last}`,
      age:          row.age,
      sex:          row.sex,
      phone:        row.pat_phone,
      email:        row.pat_email,
      guardianName: row.guard_first ? `${row.guard_first} ${row.guard_last}` : null,
    },
    doctor: {
      name:               `${row.doc_first} ${row.doc_last}`,
      qualification:      row.qualification,
      registrationNumber: row.registration_number,
    },
    opinion: {
      opinionId:       row.id,
      clinicalSummary: row.clinical_summary,
      impression:      row.impression,
      advice:          row.advice,
      investigations:  row.investigations || [],
      remarks:         row.remarks,
      submittedAt:     row.submitted_at,
    },
    episode: {
      conditionType: row.condition_type,
      episodeId:     row.episode_id,
    },
    patientContact: {
      name:  `${row.pat_first} ${row.pat_last}`,
      phone: row.pat_phone,
      email: row.pat_email,
    },
    patientId: row.patient_id,
  };
}

// ─── 1. Doctor: Generate Advise Letter ────────────────────────────────────
// POST /api/physician/episode/:episodeId/advise-letter/generate

exports.generateLetter = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const doctorId      = req.user.id;

    const data = await fetchLetterData(episodeId, doctorId);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Opinion not found, not submitted yet, or not assigned to you',
      });
    }

    // Generate PDF buffer
    const pdfBuffer = await generateAdviseLetter(data);

    // Store in DB
    await db.query(
      `UPDATE opinions SET
         advise_letter_pdf           = $1,
         advise_letter_generated_at  = NOW(),
         advise_letter_generated_by  = $2
       WHERE episode_id = $3`,
      [pdfBuffer, doctorId, episodeId]
    );

    // Mark episode — patient dashboard now shows download button
    await db.query(
      `UPDATE patient_condition_episodes SET advise_letter_ready = TRUE WHERE id = $1`,
      [episodeId]
    );

    // Notify patient — WhatsApp + email
    const template = notificationTemplates.adviseLetterReady(data.patientContact);
    await notificationService.notify(
      { phone: data.patientContact.phone, email: data.patientContact.email },
      template
    ).catch(e => console.error('Advise letter notify error (non-fatal):', e.message));

    res.json({ success: true, message: 'Advise Letter generated successfully' });
  } catch (err) {
    console.error('generateLetter error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate Advise Letter' });
  }
};

// ─── 2. Doctor: Download Advise Letter ───────────────────────────────────
// GET /api/physician/episode/:episodeId/advise-letter/download

exports.doctorDownloadLetter = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const doctorId      = req.user.id;

    const result = await db.query(
      `SELECT o.advise_letter_pdf, o.advise_letter_generated_at,
              p.first_name, p.last_name
       FROM opinions o
       JOIN patients p ON p.id = o.patient_id
       JOIN patient_condition_episodes pce ON pce.id = o.episode_id
       WHERE o.episode_id = $1 AND pce.primary_doctor_id = $2
         AND o.advise_letter_pdf IS NOT NULL`,
      [episodeId, doctorId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Advise Letter not yet generated for this episode',
      });
    }

    const row      = result.rows[0];
    const filename = `AdviseLetter_${row.first_name}_${row.last_name}_${
      new Date(row.advise_letter_generated_at).toISOString().slice(0, 10)
    }.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', row.advise_letter_pdf.length);
    res.end(row.advise_letter_pdf);
  } catch (err) {
    console.error('doctorDownloadLetter error:', err);
    res.status(500).json({ success: false, message: 'Failed to download Advise Letter' });
  }
};

// ─── 3. Patient / Guardian: Download Advise Letter ───────────────────────
// GET /api/patient/episode/:episodeId/advise-letter/download

exports.patientDownloadLetter = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const patientId     = req.user.id;

    const result = await db.query(
      `SELECT o.advise_letter_pdf, o.advise_letter_generated_at,
              p.first_name, p.last_name,
              pce.advise_letter_ready
       FROM opinions o
       JOIN patients p ON p.id = o.patient_id
       JOIN patient_condition_episodes pce ON pce.id = o.episode_id
       WHERE o.episode_id = $1
         AND o.patient_id = $2
         AND pce.advise_letter_ready = TRUE
         AND o.advise_letter_pdf IS NOT NULL`,
      [episodeId, patientId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Advise Letter is not yet available for download',
      });
    }

    const row      = result.rows[0];
    const filename = `ThyroConsult_AdviseLetter_${row.first_name}_${row.last_name}_${
      new Date(row.advise_letter_generated_at).toISOString().slice(0, 10)
    }.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', row.advise_letter_pdf.length);
    res.end(row.advise_letter_pdf);
  } catch (err) {
    console.error('patientDownloadLetter error:', err);
    res.status(500).json({ success: false, message: 'Failed to download Advise Letter' });
  }
};

// ─── 4. Check if letter is ready (patient dashboard poll) ────────────────
// GET /api/patient/episode/:episodeId/advise-letter/status

exports.getLetterStatus = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const patientId     = req.user.id;

    const result = await db.query(
      `SELECT pce.advise_letter_ready, o.advise_letter_generated_at
       FROM patient_condition_episodes pce
       LEFT JOIN opinions o ON o.episode_id = pce.id
       WHERE pce.id = $1 AND pce.patient_id = $2`,
      [episodeId, patientId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Episode not found' });
    }

    const row = result.rows[0];
    res.json({
      success:     true,
      ready:       row.advise_letter_ready,
      generatedAt: row.advise_letter_generated_at || null,
    });
  } catch (err) {
    console.error('getLetterStatus error:', err);
    res.status(500).json({ success: false, message: 'Failed to check letter status' });
  }
};
