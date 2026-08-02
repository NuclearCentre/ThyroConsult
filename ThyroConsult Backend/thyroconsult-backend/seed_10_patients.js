/**
 * seed_10_patients.js
 * Creates 10 fully verified, fully registered test patients — no OTP,
 * consent, photo, or payment needed to reach the dashboard. For walking
 * the Hypo questionnaire (some to completion, some abandoned mid-way,
 * per your test plan) and checking what the assigned doctor sees.
 *
 * Usage (from backend root):
 *   node seed_10_patients.js
 *
 * Assigns every patient to Dr. Rohini Saxena by default (primary_doctor_id)
 * — irrelevant once the new per-episode "Select Doctor" screen ships,
 * since doctor choice will happen at Add Condition time instead, but kept
 * here so patients aren't left with a NULL doctor if you test before that
 * screen is wired in.
 *
 * Deliberate mix: 6 adult females (Module B reproductive questions show
 * in full), 3 adult males (Module B skipped entirely), 1 minor with
 * guardian (tests the guardian-consent path) — so between the 10 you can
 * exercise every branch of the questionnaire's conditional logic, not
 * just one demographic.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

process.env.ENCRYPTION_KEY      = process.env.ENCRYPTION_KEY      || '0'.repeat(64);
process.env.PHI_ENCRYPTION_KEY  = process.env.PHI_ENCRYPTION_KEY  || '1'.repeat(64);
process.env.PHOTO_ENCRYPTION_KEY = process.env.PHOTO_ENCRYPTION_KEY || '2'.repeat(64);

const { query, pool } = require('./src/config/database');
const { encryptPHI, hmacHash } = require('./src/utils/encryption');

const PASSWORD = 'Test@1234!';

const PATIENTS = [
  { firstName: 'Anjali',  lastName: 'Deshmukh', mobile: '+919800000011', email: 'test01@thyroidcare.in', dob: '1988-04-12', gender: 'female', bloodGroup: 'A+', city: 'Pune',      state: 'Maharashtra',  pincode: '411001', label: 'Adult Female (37y) — married' },
  { firstName: 'Sneha',   lastName: 'Kulkarni', mobile: '+919800000012', email: 'test02@thyroidcare.in', dob: '1995-08-23', gender: 'female', bloodGroup: 'B+', city: 'Mumbai',    state: 'Maharashtra',  pincode: '400001', label: 'Adult Female (29y) — married' },
  { firstName: 'Pooja',   lastName: 'Reddy',    mobile: '+919800000013', email: 'test03@thyroidcare.in', dob: '2001-01-30', gender: 'female', bloodGroup: 'O+', city: 'Hyderabad', state: 'Telangana',    pincode: '500001', label: 'Adult Female (24y) — unmarried' },
  { firstName: 'Kavita',  lastName: 'Nair',     mobile: '+919800000014', email: 'test04@thyroidcare.in', dob: '1975-11-05', gender: 'female', bloodGroup: 'AB+',city: 'Chennai',   state: 'Tamil Nadu',   pincode: '600001', label: 'Adult Female (50y) — peri/post-menopausal likely' },
  { firstName: 'Ritu',    lastName: 'Bansal',   mobile: '+919800000015', email: 'test05@thyroidcare.in', dob: '1990-06-18', gender: 'female', bloodGroup: 'A-', city: 'Delhi',     state: 'Delhi',        pincode: '110001', label: 'Adult Female (35y) — married' },
  { firstName: 'Farah',   lastName: 'Sheikh',   mobile: '+919800000016', email: 'test06@thyroidcare.in', dob: '1983-09-09', gender: 'female', bloodGroup: 'B-', city: 'Bengaluru', state: 'Karnataka',    pincode: '560001', label: 'Adult Female (42y) — married' },
  { firstName: 'Rohan',   lastName: 'Joshi',    mobile: '+919800000017', email: 'test07@thyroidcare.in', dob: '1980-02-14', gender: 'male',   bloodGroup: 'O+', city: 'Pune',      state: 'Maharashtra',  pincode: '411002', label: 'Adult Male (45y)' },
  { firstName: 'Vikram',  lastName: 'Rathore',  mobile: '+919800000018', email: 'test08@thyroidcare.in', dob: '1997-12-01', gender: 'male',   bloodGroup: 'A+', city: 'Jaipur',    state: 'Rajasthan',    pincode: '302001', label: 'Adult Male (28y)' },
  { firstName: 'Sameer',  lastName: 'Iyer',     mobile: '+919800000019', email: 'test09@thyroidcare.in', dob: '1965-07-22', gender: 'male',   bloodGroup: 'B+', city: 'Chennai',   state: 'Tamil Nadu',   pincode: '600002', label: 'Adult Male (60y)' },
  { firstName: 'Aarav',   lastName: 'TestMinor',mobile: '+919800000020', email: 'test10@thyroidcare.in', dob: '2011-05-17', gender: 'male',   bloodGroup: 'O+', city: 'Nagpur',    state: 'Maharashtra',  pincode: '440001', label: 'Minor Male (14y) with guardian',
    guardianName: 'Deepak TestGuardian', guardianRelation: 'father' },
].map(p => ({
  ...p,
  whatsapp: p.mobile,
  addressLine1: `${Math.floor(Math.random() * 90 + 10)} Test Colony`,
  addressLine2: null,
  guardianName: p.guardianName || null,
  guardianRelation: p.guardianRelation || null,
  dobAutoCalculated: false,
}));

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
      const passwordHash = await bcrypt.hash(PASSWORD, 12);

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
          encryptPHI(p.firstName),   null,
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
      console.log(`    Password: ${PASSWORD}`);
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
