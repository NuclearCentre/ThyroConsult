/**
 * seed_test_patient.js
 * Creates a fully verified, fully registered test patient
 * No OTP needed — use this to test the dashboard and questionnaire flows directly
 *
 * Usage (from backend root):
 *   node seed_test_patient.js
 *
 * Login credentials after running:
 *   Mobile : +919800000001
 *   Email  : testpatient@thyroidcare.in
 *   Password: Test@1234!
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Stub encryption keys if not set (matches seed.js pattern)
process.env.ENCRYPTION_KEY      = process.env.ENCRYPTION_KEY      || '0'.repeat(64);
process.env.PHI_ENCRYPTION_KEY  = process.env.PHI_ENCRYPTION_KEY  || '1'.repeat(64);
process.env.PHOTO_ENCRYPTION_KEY = process.env.PHOTO_ENCRYPTION_KEY || '2'.repeat(64);

const { query, pool } = require('./src/config/database');
const { encryptPHI, hmacHash } = require('./src/utils/encryption');

// ─── CONFIG — edit these if you want different test patients ──────────────────
const PATIENTS = [
  {
    firstName:   'Test',
    middleName:  null,
    lastName:    'Patient',
    mobile:      '+919800000001',
    whatsapp:    '+919800000001',
    email:       'testpatient@thyroidcare.in',
    password:    'Test@1234!',
    dob:         '1985-06-15',          // Adult male — 40 yrs
    gender:      'male',
    bloodGroup:  'O+',
    addressLine1:'12 Shivaji Nagar',
    addressLine2:'Near Civil Hospital',
    city:        'Pune',
    state:       'Maharashtra',
    pincode:     '411005',
    guardianName: null,
    guardianRelation: null,
    dobAutoCalculated: false,
    label:       'Adult Male (40 yrs)',
  },
  {
    firstName:   'Priya',
    middleName:  null,
    lastName:    'TestFemale',
    mobile:      '+919800000002',
    whatsapp:    '+919800000002',
    email:       'testfemale@thyroidcare.in',
    password:    'Test@1234!',
    dob:         '1992-03-20',          // Adult female — 34 yrs
    gender:      'female',
    bloodGroup:  'B+',
    addressLine1:'45 MG Road',
    addressLine2:null,
    city:        'Mumbai',
    state:       'Maharashtra',
    pincode:     '400001',
    guardianName: null,
    guardianRelation: null,
    dobAutoCalculated: false,
    label:       'Adult Female (34 yrs)',
  },
  {
    firstName:   'Arjun',
    middleName:  null,
    lastName:    'TestMinor',
    mobile:      '+919800000003',
    whatsapp:    '+919800000003',
    email:       'testminor@thyroidcare.in',
    password:    'Test@1234!',
    dob:         '2012-09-10',          // Minor — 13 yrs
    gender:      'male',
    bloodGroup:  'A+',
    addressLine1:'7 Gandhi Street',
    addressLine2:null,
    city:        'Nagpur',
    state:       'Maharashtra',
    pincode:     '440001',
    guardianName: 'Rajesh TestGuardian',
    guardianRelation: 'father',
    dobAutoCalculated: false,
    label:       'Minor Male (13 yrs) with guardian',
  },
];
// ─────────────────────────────────────────────────────────────────────────────

const run = async () => {
  console.log('\n🌱  Seeding fully-verified test patients...\n');

  // Get the first active+verified doctor to assign
  const docResult = await query(
    `SELECT id, first_name, last_name FROM doctors
     WHERE is_active = TRUE AND is_verified = TRUE
     ORDER BY created_at LIMIT 1`
  );

  if (!docResult.rows.length) {
    console.error('❌  No active verified doctor found. Run npm run seed first.');
    process.exit(1);
  }

  const doctor = docResult.rows[0];
  console.log(`   Using doctor: ${doctor.id}\n`);

  for (const p of PATIENTS) {
    try {
      const mobileHash   = hmacHash(p.mobile);
      const emailHash    = hmacHash(p.email.toLowerCase());
      const whatsappHash = hmacHash(p.whatsapp);
      const passwordHash = await bcrypt.hash(p.password, 12);

      // Skip if already exists
      const existing = await query(
        'SELECT id FROM patients WHERE mobile_hash = $1 OR email_hash = $2',
        [mobileHash, emailHash]
      );
      if (existing.rows.length) {
        console.log(`⚠️   Already exists — skipping: ${p.label} (${p.email})`);
        continue;
      }

      const patientId = uuidv4();

      await query(
        `INSERT INTO patients (
           id,
           mobile, mobile_hash, mobile_verified,
           whatsapp, whatsapp_hash, whatsapp_verified,
           email, email_hash, email_verified,
           password_hash,
           first_name, middle_name, last_name,
           guardian_name, guardian_relation,
           dob, dob_auto_calculated,
           gender, blood_group,
           address_line1, address_line2, city, state, pincode,
           primary_doctor_id,
           registration_step, registration_complete,
           failed_login_count
         ) VALUES (
           $1,
           $2,$3,TRUE,
           $4,$5,TRUE,
           $6,$7,TRUE,
           $8,
           $9,$10,$11,
           $12,$13,
           $14,$15,
           $16,$17,
           $18,$19,$20,$21,$22,
           $23,
           9,TRUE,
           0
         )`,
        [
          patientId,
          encryptPHI(p.mobile),      mobileHash,
          encryptPHI(p.whatsapp),    whatsappHash,
          encryptPHI(p.email.toLowerCase()), emailHash,
          passwordHash,
          encryptPHI(p.firstName),   p.middleName ? encryptPHI(p.middleName) : null,
          encryptPHI(p.lastName),
          p.guardianName ? encryptPHI(p.guardianName) : null,
          p.guardianRelation || null,
          encryptPHI(p.dob),         p.dobAutoCalculated,
          p.gender,                  p.bloodGroup || null,
          p.addressLine1 ? encryptPHI(p.addressLine1) : null,
          p.addressLine2 ? encryptPHI(p.addressLine2) : null,
          p.city    ? encryptPHI(p.city)    : null,
          p.state   ? encryptPHI(p.state)   : null,
          p.pincode ? encryptPHI(p.pincode) : null,
          doctor.id,
        ]
      );

      // Seed consents (treatment + data_privacy + telemedicine + photo)
      const consentTypes = ['treatment', 'data_privacy', 'telemedicine', 'photo'];
      for (const ct of consentTypes) {
        const auditHash = crypto.createHash('sha256')
          .update(`${patientId}:${ct}:seed:dev`)
          .digest('hex');
        await query(
          `INSERT INTO consents (patient_id, consent_type, agreed, agreed_at, ip_address, user_agent, audit_hash)
           VALUES ($1,$2,TRUE,NOW(),'127.0.0.1','seed-script',$3)
           ON CONFLICT (patient_id, consent_type) DO NOTHING`,
          [patientId, ct, auditHash]
        );
      }

      console.log(`✅  Created: ${p.label}`);
      console.log(`    ID      : ${patientId}`);
      console.log(`    Login   : ${p.mobile}  OR  ${p.email}`);
      console.log(`    Password: ${p.password}`);
      console.log(`    Doctor  : ${doctor.id}\n`);

    } catch (err) {
      console.error(`❌  Failed for ${p.label}: ${err.message}`);
    }
  }

  console.log('─'.repeat(60));
  console.log('Done. Log in at http://localhost:7070/login (Patient tab)');
  console.log('Use mobile number OR email as the login identifier.\n');

  await pool.end();
};

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
