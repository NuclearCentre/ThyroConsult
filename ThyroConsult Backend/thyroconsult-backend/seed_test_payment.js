/**
 * seed_test_payment.js
 * ThyroConsult — Creates a test patient + payment record for receipt testing
 *
 * Run once from your backend root:
 *   node seed_test_payment.js
 *
 * It will print the patient ID and payment ID at the end.
 * Use those to test the receipt download endpoint.
 *
 * Place this file at:
 *   thyroconsult-backend\seed_test_payment.js
 */

require('dotenv').config();
const { query } = require('./src/config/database');
const { encryptPHI, hmacHash } = require('./src/utils/encryption');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('\n ThyroConsult — Creating test payment record...\n');

  try {
    // ── Step 1: Get the first available doctor ──────────────────────────────
    const doctorResult = await query(
      `SELECT id, first_name, last_name, consultation_fee, registration_number
       FROM doctors WHERE is_active = TRUE LIMIT 1`
    );

    if (!doctorResult.rows.length) {
      console.error(' No active doctor found. Run the seed.js first.');
      process.exit(1);
    }

    const doctor = doctorResult.rows[0];
    console.log(` Using doctor ID: ${doctor.id}`);

    // ── Step 2: Check if test patient already exists ────────────────────────
    const testMobile = '+919876543210';
    const mobileHash = hmacHash(testMobile);

    const existingPatient = await query(
      'SELECT id FROM patients WHERE mobile_hash = $1',
      [mobileHash]
    );

    let patientId;

    if (existingPatient.rows.length) {
      patientId = existingPatient.rows[0].id;
      console.log(` Test patient already exists. ID: ${patientId}`);
    } else {
      // ── Step 3: Create test patient ───────────────────────────────────────
      const passwordHash = await bcrypt.hash('Test@1234!', 12);

      const patientResult = await query(
        `INSERT INTO patients (
          mobile, mobile_hash,
          whatsapp, whatsapp_hash,
          email, email_hash,
          password_hash,
          first_name, last_name,
          guardian_name, guardian_relation,
          gender,
          address_line1, city, state, pincode,
          mobile_verified, whatsapp_verified, email_verified,
          registration_step, registration_complete,
          primary_doctor_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
          TRUE, TRUE, TRUE,
          7, TRUE,
          $17
        ) RETURNING id`,
        [
          encryptPHI(testMobile),          // mobile
          mobileHash,                       // mobile_hash
          encryptPHI(testMobile),           // whatsapp
          hmacHash(testMobile),             // whatsapp_hash
          encryptPHI('testpatient@thyroconsult.in'), // email
          hmacHash('testpatient@thyroconsult.in'),   // email_hash
          passwordHash,
          encryptPHI('Arun'),               // first_name
          encryptPHI('Sharma'),             // last_name
          null,                             // guardian_name
          null,                             // guardian_relation
          'male',                           // gender
          encryptPHI('Flat 4B, Shivaji Nagar'), // address_line1
          encryptPHI('Pune'),               // city
          encryptPHI('Maharashtra'),        // state
          encryptPHI('411005'),             // pincode
          doctor.id,                        // primary_doctor_id
        ]
      );

      patientId = patientResult.rows[0].id;
      console.log(` Test patient created. ID: ${patientId}`);
    }

    // ── Step 4: Create appointment ──────────────────────────────────────────
    const apptResult = await query(
      `INSERT INTO appointments (patient_id, doctor_id, scheduled_at, consultation_type, status)
       VALUES ($1, $2, NOW(), 'video', 'completed')
       RETURNING id`,
      [patientId, doctor.id]
    );
    const appointmentId = apptResult.rows[0].id;
    console.log(` Appointment created. ID: ${appointmentId}`);

    // ── Step 5: Create payment record ──────────────────────────────────────
    const consultFee  = parseFloat(doctor.consultation_fee) || 1200.00;
    const platformFee = 50.00;
    const gst         = parseFloat(((consultFee + platformFee) * 0.18).toFixed(2));
    const total       = parseFloat((consultFee + platformFee + gst).toFixed(2));

    const paymentResult = await query(
      `INSERT INTO payments (
        appointment_id, patient_id, doctor_id,
        razorpay_order_id, razorpay_payment_id, razorpay_signature,
        consultation_fee, platform_fee, gst_amount, total_amount,
        status, payment_method, paid_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        'paid', 'upi', NOW()
      ) RETURNING id, invoice_number`,
      [
        appointmentId,
        patientId,
        doctor.id,
        'order_TEST' + Date.now(),
        'pay_TEST' + Date.now(),
        'sig_TEST_signature',
        consultFee,
        platformFee,
        gst,
        total,
      ]
    );

    const payment = paymentResult.rows[0];
    console.log(` Payment created. ID: ${payment.id}`);
    console.log(` Invoice number: ${payment.invoice_number}`);

    // ── Done — print test URL ───────────────────────────────────────────────
    console.log('\n =====================================================');
    console.log('  TEST RECEIPT ENDPOINT:');
    console.log(`  GET http://localhost:7000/api/patients/${patientId}/invoices/${payment.id}/receipt`);
    console.log('\n  Patient login credentials:');
    console.log('  Mobile : +919876543210');
    console.log('  Password: Test@1234!');
    console.log(' =====================================================\n');

    process.exit(0);
  } catch (err) {
    console.error(' Seed failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

seed();
