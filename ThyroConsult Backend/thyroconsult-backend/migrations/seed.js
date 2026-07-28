require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Minimal stubs to run seed without full app boot
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0'.repeat(64);
process.env.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY || '1'.repeat(64);
process.env.PHOTO_ENCRYPTION_KEY = process.env.PHOTO_ENCRYPTION_KEY || '2'.repeat(64);

const { query, pool } = require('../src/config/database');
const { encryptPHI, hmacHash } = require('../src/utils/encryption');

const seed = async () => {
  console.log('Seeding database...\n');

  // ─── Super Admin ──────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@thyroidcare.in';
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@1234!';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
  const adminEmailHash = hmacHash(adminEmail);

  await query(
    `INSERT INTO admins(email, email_hash, password_hash, first_name, last_name, role)
     VALUES($1,$2,$3,$4,$5,'super_admin')
     ON CONFLICT(email) DO NOTHING`,
    [adminEmail, adminEmailHash, adminPasswordHash, 'Super', 'Admin']
  );
  console.log(`✓ Admin created: ${adminEmail} / ${adminPassword}`);
  console.log('  ⚠️  CHANGE THIS PASSWORD IMMEDIATELY ON FIRST LOGIN\n');

  // ─── Doctor 1 ─────────────────────────────────────────
  const d1Email = 'rsaxena@thyroidcare.in';
  const d1Pass = await bcrypt.hash('Doctor@1234!', 12);
  await query(
    `INSERT INTO doctors(first_name, last_name, email, email_hash, mobile, mobile_hash,
     password_hash, specialisation, qualifications, experience_years, bio,
     opinion_fee, is_verified, is_active, is_available_today)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,TRUE,TRUE)
     ON CONFLICT(email_hash) DO NOTHING`,
    [
      encryptPHI('Rohini'), encryptPHI('Saxena'),
      encryptPHI(d1Email), hmacHash(d1Email),
      encryptPHI('+919900000001'), hmacHash('+919900000001'),
      d1Pass,
      'Endocrinologist', 'MBBS (AIIMS Delhi), MD Endocrinology, FACE',
      14, 'Specialises in thyroid disorders, diabetes, and hormonal conditions.',
      1200,
    ]
  );
  console.log(`✓ Doctor 1: Dr. Rohini Saxena (${d1Email} / Doctor@1234!)`);

  // ─── Doctor 2 ─────────────────────────────────────────
  const d2Email = 'akumar@thyroidcare.in';
  const d2Pass = await bcrypt.hash('Doctor@5678!', 12);
  await query(
    `INSERT INTO doctors(first_name, last_name, email, email_hash, mobile, mobile_hash,
     password_hash, specialisation, qualifications, experience_years, bio,
     opinion_fee, is_verified, is_active, is_available_today)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,TRUE,FALSE)
     ON CONFLICT(email_hash) DO NOTHING`,
    [
      encryptPHI('Arvind'), encryptPHI('Kumar'),
      encryptPHI(d2Email), hmacHash(d2Email),
      encryptPHI('+919900000002'), hmacHash('+919900000002'),
      d2Pass,
      'Thyroidologist', 'MBBS, MD Internal Medicine, Fellowship Endocrinology',
      9, 'Expert in thyroid nodule management and thyroid cancer follow-up.',
      950,
    ]
  );
  console.log(`✓ Doctor 2: Dr. Arvind Kumar (${d2Email} / Doctor@5678!)`);

  console.log('\n✅ Seed complete.\n');
  await pool.end();
};

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
