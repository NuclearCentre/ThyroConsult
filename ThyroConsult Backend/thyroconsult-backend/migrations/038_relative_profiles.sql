-- 038_relative_profiles.sql
-- "Opinion for relative" — Option A. A relative/dependent gets their own
-- patients row (so the entire rest of the app — episodes, payments,
-- questionnaires, opinions — needs zero changes, it already just reads
-- whichever patient_id is in the active session), but no independent
-- login: reachable only via switchProfile (authController.js) from the
-- account that created it.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS managed_by_patient_id UUID REFERENCES patients(id),
  ADD COLUMN IF NOT EXISTS relation_to_manager VARCHAR(30);

-- registerRelative (authController.js) inserts a patients row with NO
-- mobile/whatsapp/email/password_hash at all. If any of these are
-- currently NOT NULL (unverified — this migration was written against
-- registerPatientStep1's INSERT, not the real CREATE TABLE), that
-- insert will fail until they're relaxed. Uncomment whichever apply
-- after checking `\d patients` in pgAdmin:
-- ALTER TABLE patients ALTER COLUMN mobile DROP NOT NULL;
-- ALTER TABLE patients ALTER COLUMN mobile_hash DROP NOT NULL;
-- ALTER TABLE patients ALTER COLUMN email DROP NOT NULL;
-- ALTER TABLE patients ALTER COLUMN email_hash DROP NOT NULL;
-- ALTER TABLE patients ALTER COLUMN password_hash DROP NOT NULL;

-- If mobile_hash/email_hash have a UNIQUE constraint (rather than just
-- being checked manually in registerPatientStep1's code), multiple
-- relative rows with NULL in the same unique column are fine — Postgres
-- treats NULLs as distinct from each other under UNIQUE by default — so
-- no further change should be needed there even if one exists.

-- Fast lookup for "list my relatives" (getMyRelatives).
CREATE INDEX IF NOT EXISTS idx_patients_managed_by ON patients(managed_by_patient_id);

GRANT ALL PRIVILEGES ON TABLE patients TO thyroconsult_user;
