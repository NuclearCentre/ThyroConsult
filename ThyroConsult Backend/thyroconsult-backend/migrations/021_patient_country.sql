-- ============================================================
-- Migration 021 — patients.country
-- Full path: thyroconsult-backend\migrations\021_patient_country.sql
--
-- Registration Step 1's address section now has a Country dropdown
-- (country-state-city npm package) ahead of State/City, so state/city
-- are ISO codes scoped to a specific country rather than free text.
-- country itself is NOT PHI (same category as gender) — stored plain,
-- 2-letter ISO code (e.g. 'IN', 'US'), not encrypted.
-- ============================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'IN';

GRANT ALL PRIVILEGES ON TABLE patients TO thyroconsult_user;

-- ============================================================
-- Verify after running:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'patients' AND column_name = 'country';
-- Expected: 1 row
-- ============================================================
