/**
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRATION GUIDE — PDF Receipt Generation
 * ThyroConsult Backend
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * STEP 1 — Install pdfkit
 * ───────────────────────
 * Run this once in your backend root:
 *   npm install pdfkit
 *
 *
 * STEP 2 — Place invoiceService.js
 * ─────────────────────────────────
 * Copy invoiceService.js to:
 *   thyroconsult-backend/src/services/invoiceService.js
 *
 *
 * STEP 3 — Add the receipt route to routes/index.js
 * ──────────────────────────────────────────────────
 * Add this line with your other patient routes:
 *
 *   router.get('/appointments/:appointmentId/receipt', auth, downloadReceipt);
 *
 *
 * STEP 4 — Add the controller function to patientController.js
 * ─────────────────────────────────────────────────────────────
 * Add the import at the top of patientController.js:
 *
 *   const { generateReceipt } = require('../services/invoiceService');
 *
 * Then add the controller function below:
 */

// ─── PASTE THIS FUNCTION INTO patientController.js ───────────────────────────

const downloadReceipt = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    // Fetch appointment + patient + doctor from DB
    const apptResult = await db.query(
      `SELECT
         a.id,
         a.scheduled_at,
         a.razorpay_payment_id,
         a.razorpay_order_id,
         a.amount,
         a.platform_fee,
         a.gst_amount,
         a.doctor_fee,
         a.created_at,
         -- Patient fields (decrypted by your existing decrypt utility)
         p.id           AS patient_id,
         p.salutation   AS patient_salutation,
         p.first_name_enc,
         p.last_name_enc,
         p.is_minor,
         p.address_line1_enc,
         p.address_line2_enc,
         p.village_enc,
         p.taluka_enc,
         p.city_enc,
         p.district_enc,
         p.state_enc,
         p.pincode_enc,
         -- Guardian (if minor)
         g.salutation   AS guardian_salutation,
         g.first_name_enc  AS guardian_first_name_enc,
         g.last_name_enc   AS guardian_last_name_enc,
         g.relation        AS guardian_relation,
         -- Doctor
         d.salutation   AS doctor_salutation,
         d.first_name   AS doctor_first_name,
         d.last_name    AS doctor_last_name,
         d.registration_no AS doctor_reg_no
       FROM appointments a
       JOIN patients p      ON p.id = a.patient_id
       LEFT JOIN guardians g ON g.patient_id = p.id
       JOIN doctors d       ON d.id = a.doctor_id
       WHERE a.id = $1 AND a.patient_id = $2`,
      [appointmentId, req.user.patientId]
    );

    if (!apptResult.rows.length) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const row = apptResult.rows[0];

    // Decrypt PHI fields using your existing decrypt() utility
    const { decrypt } = require('../utils/encryption');
    const patientFirstName  = decrypt(row.first_name_enc);
    const patientLastName   = decrypt(row.last_name_enc);
    const addressLine1      = decrypt(row.address_line1_enc);
    const city              = decrypt(row.city_enc);
    const state             = decrypt(row.state_enc);
    const pincode           = decrypt(row.pincode_enc);

    // Build address display (Doctor portal reading order)
    const patientAddress = [addressLine1, city, state, pincode].filter(Boolean).join(', ');
    const patientName    = `${row.patient_salutation} ${patientFirstName} ${patientLastName}`.trim();

    // Guardian name (minor only)
    let guardianName     = null;
    let guardianRelation = null;
    if (row.is_minor && row.guardian_first_name_enc) {
      const gFirst = decrypt(row.guardian_first_name_enc);
      const gLast  = decrypt(row.guardian_last_name_enc);
      guardianName     = `${row.guardian_salutation} ${gFirst} ${gLast}`.trim();
      guardianRelation = row.guardian_relation || 'Guardian';
    }

    // Receipt number — zero-padded appointment ID
    const receiptNo   = `TC-${new Date().getFullYear()}-${String(row.id).padStart(6, '0')}`;
    const receiptDate = new Date(row.created_at).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });

    // Generate PDF
    const pdfBuffer = await generateReceipt({
      receiptNo,
      receiptDate,
      isMinor:         row.is_minor,
      patientName,
      patientAddress,
      guardianName,
      guardianRelation,
      doctorName:      `${row.doctor_salutation || 'Dr.'} ${row.doctor_first_name} ${row.doctor_last_name}`.trim(),
      doctorRegNo:     row.doctor_reg_no,
      opinionFee:      row.doctor_fee,
      platformFee:     row.platform_fee,
      gst:             row.gst_amount,
      total:           row.amount,
      razorpayTxnId:   row.razorpay_payment_id,
    });

    // Stream PDF to browser — triggers instant download
    res.set({
      'Content-Type'        : 'application/pdf',
      'Content-Disposition' : `attachment; filename="ThyroConsult-Receipt-${receiptNo}.pdf"`,
      'Content-Length'      : pdfBuffer.length,
    });
    res.send(pdfBuffer);

  } catch (err) {
    logger.error('Receipt generation failed', { error: err.message });
    res.status(500).json({ error: 'Failed to generate receipt' });
  }
};

// Don't forget to export it:
// module.exports = { ..., downloadReceipt };


/**
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 5 — Trigger download from the frontend (RegisterPage.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * In your Razorpay handler success callback (already in RegisterPage.js),
 * after verifyPayment succeeds, add this before navigate():
 *
 *   // Trigger instant PDF download
 *   const receiptUrl = `${process.env.REACT_APP_API_URL}/appointments/${appointmentId}/receipt`;
 *   const link = document.createElement('a');
 *   link.href = receiptUrl;
 *   link.setAttribute('download', '');
 *   // Pass JWT so the backend can auth the request
 *   // Simplest approach — open in new tab (browser handles download):
 *   window.open(receiptUrl + `?token=${localStorage.getItem('accessToken')}`, '_blank');
 *
 * OR use fetch + blob for a cleaner in-page download:
 *
 *   const resp = await fetch(receiptUrl, {
 *     headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
 *   });
 *   const blob = await resp.blob();
 *   const url  = URL.createObjectURL(blob);
 *   const a    = document.createElement('a');
 *   a.href     = url;
 *   a.download = `ThyroConsult-Receipt.pdf`;
 *   a.click();
 *   URL.revokeObjectURL(url);
 *   navigate('/patient/dashboard');
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
