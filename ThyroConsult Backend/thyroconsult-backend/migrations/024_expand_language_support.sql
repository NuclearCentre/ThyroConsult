-- 024_expand_language_support.sql
--
-- RENAME THIS FILE if your migrations folder is already past 023 — check
-- the migrations folder for the highest existing number first.
--
-- Purpose: migration 019 created a CHECK constraint on
-- patients.preferred_language allowing only the original 10 languages.
-- PatientPortal.js's LanguagePicker and translationService.js's
-- LANGUAGE_NAMES were just extended with 5 more (Odia, Assamese, Nepali,
-- Manipuri-Bengali-script, Manipuri-Meitei-script) — without this
-- migration, any patient selecting one of those would hit a DB
-- constraint violation on save. Column width is unaffected (VARCHAR(5),
-- and the longest new code — 'mnib'/'mnim' — is 4 characters, so it
-- already fits).

ALTER TABLE patients
  DROP CONSTRAINT IF EXISTS patients_preferred_language_check;

ALTER TABLE patients
  ADD CONSTRAINT patients_preferred_language_check
  CHECK (preferred_language IN (
    'en','hi','gu','mr','ta','te','kn','ml','bn','pa',
    'or','as','ne','mnib','mnim'
  ));
  -- en=English hi=Hindi gu=Gujarati mr=Marathi ta=Tamil te=Telugu
  -- kn=Kannada ml=Malayalam bn=Bengali pa=Punjabi
  -- or=Odia as=Assamese ne=Nepali
  -- mnib=Manipuri(Bengali script) mnim=Manipuri(Meitei script)

GRANT ALL PRIVILEGES ON TABLE patients TO thyroconsult_user;

-- ============================================================
-- Verify after running:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname = 'patients_preferred_language_check';
-- Expected: definition includes all 15 codes above.
-- ============================================================
