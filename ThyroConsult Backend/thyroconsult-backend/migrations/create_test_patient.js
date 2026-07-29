// ============================================================
// Create a dummy, fully-registered patient for questionnaire testing
// Full path: thyroconsult-backend\migrations\create_test_patient.js
//
// This is NOT a numbered migration — it doesn't touch schema, it just
// inserts one row so you can log straight into the patient portal and
// walk the Hypo/Hyper/Nodule/TC questionnaires without re-doing all 8
// registration steps (OTP, consent, photo, payment) every time.
//
// Run once:
//   cd thyroconsult-backend
//   node migrations/create_test_patient.js
//
// Safe to re-run — uses ON CONFLICT on mobile_hash, so it won't create
// duplicates; re-running just confirms the same credentials still work
// and prints them again.
// ============================================================
require('dotenv').config();
const bcrypt = require('bcryptjs');

// Minimal stubs to run standalone, same pattern as seed.js
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0'.repeat(64);
process.env.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY || '1'.repeat(64);
process.env.PHOTO_ENCRYPTION_KEY = process.env.PHOTO_ENCRYPTION_KEY || '2'.repeat(64);

const { query, pool } = require('../src/config/database');
const { encryptPHI, hmacHash } = require('../src/utils/encryption');

const TEST_MOBILE = '+919800000099';
const TEST_EMAIL = 'testpatient@thyroidcare.in';
const TEST_PASSWORD = 'TestPatient@123';

const run = async () => {
  console.log('Creating dummy test patient...\n');

  const mobileHash = hmacHash(TEST_MOBILE);
  const emailHash = hmacHash(TEST_EMAIL.toLowerCase());
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  // Attach to whichever seeded doctor exists (Dr. Rohini Saxena from
  // seed.js) so the doctor-selection step is already done. Falls back to
  // NULL if seed.js hasn't been run — the patient can still select a
  // doctor manually inside the app if so.
  const doctorResult = await query(
    `SELECT id FROM doctors WHERE email_hash = $1 LIMIT 1`,
    [hmacHash('rsaxena@thyroidcare.in')]
  );
  const primaryDoctorId = doctorResult.rows[0]?.id || null;

  const existing = await query(
    'SELECT id FROM patients WHERE mobile_hash = $1 OR email_hash = $2',
    [mobileHash, emailHash]
  );

  if (existing.rows.length) {
    // A row already exists under this mobile and/or email (possibly from
    // a partial/earlier run, or created with different field values) —
    // reset it to the known test credentials/state rather than failing,
    // so the credentials printed below are always guaranteed to work.
    await query(
      `UPDATE patients SET
         mobile = $1, mobile_hash = $2, email = $3, email_hash = $4,
         password_hash = $5, registration_step = 7, registration_complete = TRUE,
         mobile_verified = TRUE, email_verified = TRUE,
         primary_doctor_id = COALESCE(primary_doctor_id, $6),
         locked_until = NULL, failed_login_count = 0
       WHERE id = $7`,
      [
        encryptPHI(TEST_MOBILE), mobileHash,
        encryptPHI(TEST_EMAIL.toLowerCase()), emailHash,
        passwordHash, primaryDoctorId,
        existing.rows[0].id,
      ]
    );
    console.log(`✓ Test patient already existed — reset to known credentials (id: ${existing.rows[0].id})`);
  } else {
    const result = await query(
      `INSERT INTO patients
       (mobile, mobile_hash, email, email_hash, password_hash,
        first_name, last_name, gender, dob, dob_auto_calculated,
        address_line1, city, state, pincode,
        mobile_verified, email_verified, whatsapp_verified,
        registration_step, registration_complete, primary_doctor_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
              TRUE, TRUE, FALSE, 7, TRUE, $15)
       RETURNING id, patient_code`,
      [
        encryptPHI(TEST_MOBILE), mobileHash,
        encryptPHI(TEST_EMAIL.toLowerCase()), emailHash,
        passwordHash,
        encryptPHI('Test'), encryptPHI('Patient'),
        'female', encryptPHI('1990-01-15'), false,
        encryptPHI('123 Test Street'), encryptPHI('Pune'), encryptPHI('Maharashtra'), encryptPHI('411001'),
        primaryDoctorId,
      ]
    );
    console.log(`✓ Test patient created: ${result.rows[0].patient_code} (id: ${result.rows[0].id})`);
  }

  console.log('\n─────────────────────────────────────────');
  console.log('  LOGIN AT /login → Patient tab');
  console.log(`  Mobile or email : ${TEST_MOBILE}  (or ${TEST_EMAIL})`);
  console.log(`  Password        : ${TEST_PASSWORD}`);
  console.log('─────────────────────────────────────────');
  console.log('\nGender is set to "female", unmarried, no hysterectomy on');
  console.log('file — so Module B reproductive questions will show in full.');
  console.log('Registration is marked complete, so you\'ll land straight on');
  console.log('the patient dashboard → condition selection → questionnaires.');

  await pool.end();
};

run().catch(err => {
  console.error('Failed to create test patient:', err.message);
  process.exit(1);
});
