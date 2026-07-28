const { query, transaction } = require('../config/database');
const { encryptPHI, decryptPHI, hmacHash } = require('../utils/encryption');
const logger = require('../utils/logger');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// ============================================================
// DOCTOR CONTROLLER
// ============================================================

const decryptDoctor = (row) => ({
  id: row.id,
  firstName: decryptPHI(row.first_name),
  middleName: row.middle_name ? decryptPHI(row.middle_name) : null,
  lastName: decryptPHI(row.last_name),
  email: row.email ? decryptPHI(row.email) : null,
  mobile: row.mobile ? decryptPHI(row.mobile) : null,
  specialisation: row.specialisation,
  qualifications: row.qualifications,
  experienceYears: row.experience_years,
  bio: row.bio,
  isAvailableToday: row.is_available_today,
  opinionFee: parseFloat(row.opinion_fee),
  isVerified: row.is_verified,
});

// GET /doctors — public list for patient doctor selection
const listDoctors = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, first_name, last_name, specialisation, qualifications,
              experience_years, bio, is_available_today, opinion_fee, is_verified
       FROM doctors WHERE is_active = TRUE AND is_verified = TRUE
       ORDER BY is_available_today DESC, experience_years DESC`
    );
    const doctors = result.rows.map(d => ({
      id: d.id,
      name: `Dr. ${decryptPHI(d.first_name)} ${decryptPHI(d.last_name)}`,
      specialisation: d.specialisation,
      qualifications: d.qualifications,
      experienceYears: d.experience_years,
      bio: d.bio,
      isAvailableToday: d.is_available_today,
      opinionFee: parseFloat(d.opinion_fee),
    }));
    res.json({ doctors });
  } catch (err) {
    logger.error('List doctors error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
};

// GET /doctor/profile (self-service, no :id — uses req.user.id)
const getDoctorProfile = async (req, res) => {
  try {
    const doctorId = req.params.id || req.user.id;
    const result = await query('SELECT * FROM doctors WHERE id = $1 AND is_active = TRUE', [doctorId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Doctor not found' });
    res.json(decryptDoctor(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch doctor' });
  }
};

// GET /doctors/:id/appointments — today's queue
const getDoctorAppointments = async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const doctorId = req.params.id || req.user.id;

  try {
    const result = await query(
      `SELECT a.id, a.scheduled_at, a.status, a.opinion_appointment_type,
              p.id AS patient_id, p.patient_code,
              p.first_name, p.last_name, p.gender,
              pay.status AS payment_status, pay.total_amount, pay.razorpay_payment_id
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN payments pay ON pay.appointment_id = a.id
       WHERE a.doctor_id = $1
         AND DATE(a.scheduled_at AT TIME ZONE 'Asia/Kolkata') = $2
       ORDER BY a.scheduled_at ASC`,
      [doctorId, targetDate]
    );

    const appointments = result.rows.map(r => ({
      id: r.id,
      scheduledAt: r.scheduled_at,
      status: r.status,
      opinionAppointmentType: r.opinion_appointment_type,
      patient: {
        id: r.patient_id,
        code: r.patient_code,
        name: `${decryptPHI(r.first_name)} ${decryptPHI(r.last_name)}`,
        gender: r.gender,
      },
      payment: {
        status: r.payment_status,
        amount: r.total_amount ? parseFloat(r.total_amount) : null,
        transactionId: r.razorpay_payment_id,
      },
    }));

    logger.audit('APPOINTMENT_QUEUE_VIEWED', {
      userId: req.user.id, userRole: req.user.role,
      ip: req.ip, detail: `Date: ${targetDate}`,
    });

    res.json({ appointments, date: targetDate, total: appointments.length });
  } catch (err) {
    logger.error('Get doctor appointments error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
};

// GET /doctors/:id/patients/:patientId — full patient view
const getDoctorPatientView = async (req, res) => {
  const { patientId } = req.params;
  try {
    const result = await query('SELECT * FROM patients WHERE id = $1', [patientId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Patient not found' });
    const p = result.rows[0];

    logger.audit('DOCTOR_PHI_ACCESS', {
      userId: req.user.id, userRole: 'doctor',
      patientId, ip: req.ip, phiAccessed: true,
    });

    res.json({
      id: p.id, patientCode: p.patient_code,
      firstName: decryptPHI(p.first_name),
      middleName: p.middle_name ? decryptPHI(p.middle_name) : null,
      lastName: decryptPHI(p.last_name),
      dob: p.dob ? decryptPHI(p.dob) : null,
      gender: p.gender, bloodGroup: p.blood_group,
      mobile: decryptPHI(p.mobile),
      whatsapp: p.whatsapp ? decryptPHI(p.whatsapp) : null,
      email: decryptPHI(p.email),
      address: {
        line1: p.address_line1 ? decryptPHI(p.address_line1) : null,
        city: p.city ? decryptPHI(p.city) : null,
        state: p.state ? decryptPHI(p.state) : null,
        pincode: p.pincode ? decryptPHI(p.pincode) : null,
      },
    });
  } catch (err) {
    logger.error('Get doctor patient view error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
};

// POST /consultations/:id/notes — save doctor notes
// NOTE: route path and `consultations` table name left unchanged here —
// same flagged-as-possibly-legacy table as elsewhere this session.
// Renaming the URL is a breaking API change needing a matching frontend
// update; only the JS-facing names below were purged.
const saveOpinionNotes = async (req, res) => {
  const {
    chiefComplaint, history, examinationNotes,
    diagnosis, treatmentPlan, doctorNotes, followUpNotes,
  } = req.body;

  try {
    await query(
      `UPDATE consultations SET
       chief_complaint = $1, history = $2, examination_notes = $3,
       diagnosis = $4, treatment_plan = $5, doctor_notes = $6, follow_up_notes = $7,
       status = 'completed', completed_at = NOW()
       WHERE id = $8 AND doctor_id = $9`,
      [
        chiefComplaint ? encryptPHI(chiefComplaint) : null,
        history ? encryptPHI(history) : null,
        examinationNotes ? encryptPHI(examinationNotes) : null,
        diagnosis ? encryptPHI(diagnosis) : null,
        treatmentPlan ? encryptPHI(treatmentPlan) : null,
        doctorNotes ? encryptPHI(doctorNotes) : null,
        followUpNotes ? encryptPHI(followUpNotes) : null,
        req.params.id,
        req.user.id,
      ]
    );

    logger.audit('OPINION_NOTES_SAVED', {
      userId: req.user.id, userRole: 'doctor',
      ip: req.ip, resourceId: req.params.id, phiAccessed: true,
    });

    res.json({ message: 'Opinion notes saved' });
  } catch (err) {
    logger.error('Save notes error', { error: err.message });
    res.status(500).json({ error: 'Failed to save notes' });
  }
};

// ============================================================
// APPOINTMENT CONTROLLER
// ============================================================

// POST /appointments — book appointment
const bookAppointment = async (req, res) => {
  const { patientId, doctorId, scheduledAt, opinionAppointmentType, patientNotes } = req.body;

  try {
    const doctorResult = await query(
      'SELECT id, opinion_fee FROM doctors WHERE id = $1 AND is_active = TRUE',
      [doctorId]
    );
    if (!doctorResult.rows.length) return res.status(404).json({ error: 'Doctor not available' });

    const result = await transaction(async (client) => {
      // Create appointment
      const appt = await client.query(
        `INSERT INTO appointments(patient_id, doctor_id, scheduled_at, opinion_appointment_type, patient_notes)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [patientId, doctorId, scheduledAt, opinionAppointmentType || 'video',
         patientNotes ? encryptPHI(patientNotes) : null]
      );
      const appointmentId = appt.rows[0].id;

      // Create opinion record
      const opinionNum = `OPN-${new Date().getFullYear()}-${String(await getNextOpinionNum(client)).padStart(4, '0')}`;
      await client.query(
        `INSERT INTO consultations(appointment_id, patient_id, doctor_id, opinion_number, opinion_appointment_type)
         VALUES($1,$2,$3,$4,$5)`,
        [appointmentId, patientId, doctorId, opinionNum, opinionAppointmentType || 'video']
      );

      // Razorpay order — GST intentionally not charged: doctors are exempt
      // from charging GST on online-opinion services.
      const fee = parseFloat(doctorResult.rows[0].opinion_fee);
      const platformFee = parseFloat(process.env.PLATFORM_FEE) || 50;
      const total = fee + platformFee;

      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      let razorpayOrder;
      try {
        razorpayOrder = await razorpay.orders.create({
          amount: Math.round(total * 100), // paise
          currency: 'INR',
          receipt: appointmentId,
          notes: { appointmentId, patientId, doctorId },
        });
      } catch (rzpErr) {
        if (process.env.NODE_ENV === 'development') {
          razorpayOrder = { id: `DEV_ORDER_${Date.now()}` };
        } else throw rzpErr;
      }

      const payment = await client.query(
        `INSERT INTO payments(appointment_id, patient_id, doctor_id, razorpay_order_id,
         opinion_fee, platform_fee, gst_amount, total_amount)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, invoice_number`,
        [appointmentId, patientId, doctorId, razorpayOrder.id, fee, platformFee, 0, total]
      );

      return {
        appointmentId,
        paymentId: payment.rows[0].id,
        razorpayOrderId: razorpayOrder.id,
        amount: total,
        currency: 'INR',
      };
    });

    logger.audit('APPOINTMENT_BOOKED', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip,
      detail: `Booked with doctor ${doctorId}`,
    });

    res.status(201).json({ message: 'Appointment booked', ...result });
  } catch (err) {
    logger.error('Book appointment error', { error: err.message });
    res.status(500).json({ error: 'Booking failed' });
  }
};

const getNextOpinionNum = async (client) => {
  const r = await client.query("SELECT nextval('opinion_seq') AS n");
  return r.rows[0].n;
};

// ============================================================
// PAYMENT CONTROLLER
// ============================================================

const razorpayWebhook = async (req, res) => {
  const { payload } = req.body;
  const event = req.body.event;

  try {
    if (event === 'payment.captured') {
      const payment = payload.payment.entity;
      const orderId = payment.order_id;

      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${payment.id}`)
        .digest('hex');

      await query(
        `UPDATE payments SET
         status = 'confirmed', razorpay_payment_id = $1, razorpay_signature = $2,
         payment_method = $3, paid_at = NOW()
         WHERE razorpay_order_id = $4`,
        [payment.id, signature, payment.method, orderId]
      );

      // Update appointment to confirmed
      await query(
        `UPDATE appointments a SET status = 'scheduled'
         FROM payments p WHERE p.appointment_id = a.id AND p.razorpay_order_id = $1`,
        [orderId]
      );

      // Update registration step
      await query(
        `UPDATE patients SET registration_step = 7, registration_complete = TRUE
         FROM payments p WHERE p.patient_id = patients.id AND p.razorpay_order_id = $1
         AND patients.registration_step = 6`,
        [orderId]
      );

      logger.audit('PAYMENT_CONFIRMED', {
        ip: req.ip,
        detail: `Razorpay order ${orderId} confirmed`,
        resource: 'payment',
      });
    } else if (event === 'payment.failed') {
      const orderId = payload.payment.entity.order_id;
      await query("UPDATE payments SET status = 'failed' WHERE razorpay_order_id = $1", [orderId]);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    logger.error('Razorpay webhook error', { error: err.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

const verifyPayment = async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  try {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      logger.audit('PAYMENT_SIGNATURE_INVALID', {
        userId: req.user?.id, ip: req.ip, result: 'failure',
      });
      return res.status(400).json({ error: 'Payment verification failed', code: 'INVALID_SIGNATURE' });
    }

    await query(
      `UPDATE payments SET status = 'confirmed', razorpay_payment_id = $1,
       razorpay_signature = $2, paid_at = NOW()
       WHERE razorpay_order_id = $3`,
      [razorpayPaymentId, razorpaySignature, razorpayOrderId]
    );

    logger.audit('PAYMENT_VERIFIED', { userId: req.user?.id, ip: req.ip });
    res.json({ message: 'Payment verified successfully' });
  } catch (err) {
    logger.error('Verify payment error', { error: err.message });
    res.status(500).json({ error: 'Verification failed' });
  }
};

// downloadInvoice REMOVED — confirmed dead code. No route in
// src/routes/index.js references doctorController.downloadInvoice;
// receiptController.downloadOpinionReceipt is the only live receipt/
// invoice handler.


// PUT /doctor/profile — doctor edits their own bio/specialisation/etc.
// (self-service only — deliberately does not allow editing verification-
// sensitive fields like registration_number, is_verified, is_active;
// those stay admin-only via adminController.setDoctorStatus.)
const updateProfile = async (req, res) => {
  const { bio, specialisation, qualifications, experienceYears, opinionFee, isAvailableToday } = req.body;
  const doctorId = req.user.id;

  try {
    const fields = [];
    const values = [];
    let idx = 1;
    const addField = (col, val) => {
      if (val !== undefined) { fields.push(`${col} = $${idx++}`); values.push(val); }
    };

    addField('bio', bio);
    addField('specialisation', specialisation);
    addField('qualifications', qualifications);
    addField('experience_years', experienceYears);
    addField('opinion_fee', opinionFee);
    addField('is_available_today', isAvailableToday);

    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    values.push(doctorId);
    await query(`UPDATE doctors SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    logger.audit('DOCTOR_PROFILE_UPDATED', {
      userId: doctorId, userRole: 'doctor', ip: req.ip,
      changes: { fields: Object.keys(req.body) },
    });

    res.json({ message: 'Profile updated' });
  } catch (err) {
    logger.error('Update doctor profile error', { error: err.message });
    res.status(500).json({ error: 'Update failed' });
  }
};

// GET /doctor/appointment/:appointmentId — single appointment detail
const getAppointmentDetail = async (req, res) => {
  try {
    const result = await query(
      `SELECT a.id, a.scheduled_at, a.status, a.opinion_appointment_type, a.session_link,
              p.id AS patient_id, p.patient_code, p.first_name, p.last_name, p.gender,
              pay.status AS payment_status, pay.total_amount
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN payments pay ON pay.appointment_id = a.id
       WHERE a.id = $1 AND a.doctor_id = $2`,
      [req.params.appointmentId, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Appointment not found' });

    const a = result.rows[0];
    res.json({
      id: a.id,
      scheduledAt: a.scheduled_at,
      status: a.status,
      opinionAppointmentType: a.opinion_appointment_type,
      sessionLink: a.session_link,
      patient: {
        id: a.patient_id, code: a.patient_code,
        name: `${decryptPHI(a.first_name)} ${decryptPHI(a.last_name)}`,
        gender: a.gender,
      },
      payment: { status: a.payment_status, amount: a.total_amount ? parseFloat(a.total_amount) : null },
    });
  } catch (err) {
    logger.error('Get appointment detail error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
};

// PUT /doctor/appointment/:appointmentId — reschedule / change status
const updateAppointment = async (req, res) => {
  const { status, scheduledAt } = req.body;

  try {
    const fields = [];
    const values = [];
    let idx = 1;
    const addField = (col, val) => {
      if (val !== undefined) { fields.push(`${col} = $${idx++}`); values.push(val); }
    };
    addField('status', status);
    addField('scheduled_at', scheduledAt);

    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.appointmentId, req.user.id);
    const result = await query(
      `UPDATE appointments SET ${fields.join(', ')} WHERE id = $${idx++} AND doctor_id = $${idx} RETURNING id`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Appointment not found' });

    logger.audit('APPOINTMENT_UPDATED', {
      userId: req.user.id, userRole: 'doctor', ip: req.ip,
      resourceId: req.params.appointmentId, changes: { fields: Object.keys(req.body) },
    });

    res.json({ message: 'Appointment updated' });
  } catch (err) {
    logger.error('Update appointment error', { error: err.message });
    res.status(500).json({ error: 'Failed to update appointment' });
  }
};

module.exports = {
  listDoctors, getDoctorProfile, getDoctorAppointments,
  getDoctorPatientView, saveOpinionNotes,
  bookAppointment,
  updateProfile, getAppointmentDetail, updateAppointment,
  razorpayWebhook, verifyPayment,
};
