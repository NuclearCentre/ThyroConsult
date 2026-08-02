/**
 * seed_doctor_fees.js
 * Adds differentiated per-condition fee overrides for the 2 doctors
 * already created by seed.js (Dr. Rohini Saxena, Dr. Arvind Kumar) —
 * requires migration 028 (doctor_fees table) to have run first.
 *
 * Run once from backend root, AFTER seed.js and AFTER migration 028:
 *   node seed_doctor_fees.js
 *
 * Without this, both doctors just use the condition_fees global default
 * for everything — this is what actually makes the new "Select Doctor"
 * screen show two different prices for the same condition.
 *
 * Full path: thyroconsult-backend\migrations\seed_doctor_fees.js
 */
require('dotenv').config();

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0'.repeat(64);
process.env.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY || '1'.repeat(64);
process.env.PHOTO_ENCRYPTION_KEY = process.env.PHOTO_ENCRYPTION_KEY || '2'.repeat(64);

const { query, pool } = require('../src/config/database');
const { hmacHash } = require('../src/utils/encryption');

// Deliberately different from each other AND from condition_fees' global
// defaults, so the differential-pricing test is unambiguous — if you see
// these exact numbers on the Select Doctor screen, the fee lookup chain
// (doctor_fees -> condition_fees fallback) is working correctly.
const FEE_OVERRIDES = {
  'rsaxena@thyroidcare.in': {
    hypo: 1200, hyper: 1400, tc: 2200, nodule: 1100,
  },
  'akumar@thyroidcare.in': {
    hypo: 950, hyper: 950, tc: 1800, nodule: 900,
    // tc deliberately left off nothing — akumar has all 4 too, but at
    // consistently lower rates, so Hypo/Nodule especially show a clear gap.
  },
};

const run = async () => {
  console.log('Seeding doctor_fees overrides...\n');

  for (const [email, fees] of Object.entries(FEE_OVERRIDES)) {
    const docResult = await query(
      `SELECT id, first_name FROM doctors WHERE email_hash = $1`,
      [hmacHash(email)]
    );
    if (!docResult.rows.length) {
      console.error(`✗ Doctor not found for ${email} — run seed.js first.`);
      continue;
    }
    const doctorId = docResult.rows[0].id;

    for (const [conditionType, rupees] of Object.entries(fees)) {
      const paise = Math.round(rupees * 100);
      await query(
        `INSERT INTO doctor_fees (doctor_id, condition_type, base_fee_paise, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (doctor_id, condition_type) DO UPDATE
           SET base_fee_paise = EXCLUDED.base_fee_paise, is_active = TRUE, updated_at = NOW()`,
        [doctorId, conditionType, paise]
      );
    }
    console.log(`✓ ${email} (id: ${doctorId}): ${JSON.stringify(fees)}`);
  }

  console.log('\nDone. Same condition now prices differently per doctor —');
  console.log('e.g. Hypothyroidism: Dr. Saxena ₹1200 vs Dr. Kumar ₹950.\n');

  await pool.end();
};

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
