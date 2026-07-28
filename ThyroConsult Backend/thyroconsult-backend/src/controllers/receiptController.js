// ============================================================
// Full path:
//   thyroconsult-backend\src\controllers\receiptController.js
//
// Handles:
//   GET /receipt/opinion/:paymentId
//       → Initial online-opinion receipt (existing payments table)
//       NOTE: route paths below updated to match src/api/index.js's
//       receiptAPI this pass — previously assumed /api/patients/:id/...
//       but the real frontend calls have no :id segment at all;
//       patientId now sourced from req.user.id (the authenticated
//       patient) instead of a URL param. Still needs confirming against
//       the actual routes file once available.
//
//   GET /receipt/followup/:fpId
//       → Follow-up payment receipt (followup_payments table)
//
//   GET /receipt/invoices
//       → List all payments for the authenticated patient
//
// Both PDF routes: streams PDF directly to client — no disk write needed
// unless SAVE_RECEIPTS_TO_DISK=true in .env
// ============================================================

const path = require('path');
const { pool } = require('../config/database');
const { generateOpinionReceipt, generateFollowupReceipt } = require('../services/receiptService');

// ─── Helper: Check if patient is a minor ─────────────────────────────────────
function isMinorPatient(dob) {
  if (!dob) return false;
  const ageMs  = Date.now() - new Date(dob).getTime();
  const ageYrs = ageMs / (365.25 * 24 * 3600 * 1000);
  return ageYrs < 18;
}

// ─── Helper: Stream PDF to response ──────────────────────────────────────────
function streamPdf(res, pdfBuffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.end(pdfBuffer);
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /receipt/opinion/:paymentId
// Initial online-opinion receipt — from existing payments table (UUID pk)
// ══════════════════════════════════════════════════════════════════════════════
async function downloadOpinionReceipt(req, res) {
  try {
    const { paymentId } = req.params;
    const patientId = req.user.id;

    // Fetch payment row (existing payments table — appointment-based, UUID pk)
    // NOTE: a.consultation_type was dropped from this SELECT — it was
    // unused (condition label below comes from pce.condition instead)
    // and its name violates the platform-language rule.
    const { rows: payRows } = await pool.query(
      `SELECT p.*, a.scheduled_at,
              pce.condition AS condition_type
       FROM payments p
       LEFT JOIN appointments a ON a.id = p.appointment_id
       LEFT JOIN patient_condition_episodes pce ON pce.patient_id = p.patient_id
       WHERE p.id = $1 AND p.patient_id = $2 AND p.status = 'paid'
       LIMIT 1`,
      [paymentId, patientId]
    );

    if (!payRows[0]) {
      return res.status(404).json({ error: 'Payment not found or not yet paid' });
    }

    const payment = payRows[0];

    // Fetch patient details
    const { rows: patRows } = await pool.query(
      `SELECT id, first_name || ' ' || last_name AS name,
              date_of_birth, address_line1, city, state, pincode,
              guardian_name, guardian_relationship
       FROM patients WHERE id = $1`,
      [patientId]
    );
    if (!patRows[0]) return res.status(404).json({ error: 'Patient not found' });
    const patient = patRows[0];

    // Fetch doctor details
    const { rows: drRows } = await pool.query(
      `SELECT name, specialisation FROM doctors WHERE id = $1`,
      [payment.doctor_id]
    );
    const doctor = drRows[0] || null;

    const isMinor = isMinorPatient(patient.date_of_birth);

    // Generate PDF
    const pdfBuffer = await generateOpinionReceipt({
      payment,
      patient,
      doctor,
      appointment: { scheduled_at: payment.scheduled_at, condition_type: payment.condition_type },
      isMinor,
      outputPath: null, // stream only — no disk write
    });

    const filename = `ThyroConsult_Receipt_${String(paymentId).slice(0, 8).toUpperCase()}.pdf`;
    streamPdf(res, pdfBuffer, filename);

  } catch (err) {
    console.error('downloadOpinionReceipt error:', err);
    res.status(500).json({ error: 'Could not generate receipt' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /receipt/followup/:fpId
// Follow-up payment receipt — from followup_payments table
// ══════════════════════════════════════════════════════════════════════════════
async function downloadFollowupReceipt(req, res) {
  try {
    const { fpId } = req.params;
    const patientId = req.user.id;

    // Fetch followup_payment row
    const { rows: fpRows } = await pool.query(
      `SELECT fp.*, pce.condition AS condition_type
       FROM followup_payments fp
       JOIN patient_condition_episodes pce ON pce.id = fp.episode_id
       WHERE fp.id = $1 AND fp.patient_id = $2 AND fp.status = 'paid'`,
      [fpId, patientId]
    );

    if (!fpRows[0]) {
      return res.status(404).json({ error: 'Follow-up payment not found or not yet paid' });
    }

    const payment = fpRows[0];

    // Fetch episode
    const { rows: epRows } = await pool.query(
      `SELECT * FROM patient_condition_episodes WHERE id = $1`,
      [payment.episode_id]
    );
    const episode = epRows[0] || {};

    // Fetch patient details
    const { rows: patRows } = await pool.query(
      `SELECT id, first_name || ' ' || last_name AS name,
              date_of_birth, guardian_name, guardian_relationship
       FROM patients WHERE id = $1`,
      [patientId]
    );
    if (!patRows[0]) return res.status(404).json({ error: 'Patient not found' });
    const patient = patRows[0];

    const isMinor = isMinorPatient(patient.date_of_birth);

    // Generate PDF
    const pdfBuffer = await generateFollowupReceipt({
      payment,
      patient,
      episode,
      isMinor,
      outputPath: null,
    });

    const filename = `ThyroConsult_FollowupReceipt_${String(fpId).slice(0, 8).toUpperCase()}.pdf`;
    streamPdf(res, pdfBuffer, filename);

  } catch (err) {
    console.error('downloadFollowupReceipt error:', err);
    res.status(500).json({ error: 'Could not generate receipt' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /receipt/invoices
// List all payments (both initial opinion and follow-up) for a patient
// ══════════════════════════════════════════════════════════════════════════════
async function getPatientInvoices(req, res) {
  try {
    const patientId = req.user.id;

    // Initial opinion payments (from existing payments table)
    // NOTE: payment_category value changed from 'consultation' to 'opinion'
    // — any frontend code filtering/switching on this string needs updating.
    const { rows: opinionRows } = await pool.query(
      `SELECT p.id, p.total_amount AS amount, p.paid_at, p.status,
              p.invoice_number, p.payment_method,
              'opinion' AS payment_category,
              a.scheduled_at, pce.condition AS condition_type
       FROM payments p
       LEFT JOIN appointments a ON a.id = p.appointment_id
       LEFT JOIN patient_condition_episodes pce ON pce.patient_id = p.patient_id
       WHERE p.patient_id = $1
       ORDER BY p.paid_at DESC NULLS LAST`,
      [patientId]
    );

    // Follow-up payments
    const { rows: followupRows } = await pool.query(
      `SELECT fp.id, fp.amount_paise / 100.0 AS amount, fp.paid_at, fp.status,
              fp.payment_type, fp.condition_type, fp.discount_pct,
              'followup' AS payment_category,
              pce.id AS episode_id
       FROM followup_payments fp
       JOIN patient_condition_episodes pce ON pce.id = fp.episode_id
       WHERE fp.patient_id = $1
       ORDER BY fp.paid_at DESC NULLS LAST`,
      [patientId]
    );

    res.json({
      opinion:  opinionRows,
      followup: followupRows,
    });
  } catch (err) {
    console.error('getPatientInvoices error:', err);
    res.status(500).json({ error: 'Could not fetch invoices' });
  }
}

module.exports = {
  downloadOpinionReceipt,
  downloadFollowupReceipt,
  getPatientInvoices,
};
