-- ============================================================
-- Migration 019 — Live translation support
-- Full path: thyroconsult-backend\migrations\019_translation_support.sql
--
-- Adds what's needed for the two-way translation pipeline:
--   Patient free-text (any language) -> English, shown to physician
--   Physician opinion (English)      -> patient's language, shown to patient
--
-- ASSUMPTION FLAGGED: preferred_language CHECK list below assumes the
-- standard 10: English + Hindi, Gujarati, Marathi, Tamil, Telugu,
-- Kannada, Malayalam, Bengali, Punjabi. If your actual list of 10
-- differs, edit the CHECK constraint before running this.
--
-- 1. patients.preferred_language — did NOT exist anywhere in the
--    backend before this migration (confirmed by grep across
--    authController.js, patientController.js, api/index.js — zero
--    hits). The patient portal's language selector must currently be
--    front-end-only (state/localStorage), never persisted server-side.
--    Server-side translation of the physician's opinion needs this
--    persisted, since translation happens at opinion-submit time, not
--    at patient-portal render time.
--
-- 2. field_translations JSONB on core/hypo/hyper/tc/nodule_questionnaire
--    — ONE companion column per table instead of tripling every
--    existing free-text column (_other/_details/_notes — there are
--    250+ of these across nodule_questionnaire alone). Existing plain
--    columns are UNCHANGED and still hold the patient's original-
--    language text exactly as before; this column only holds entries
--    for fields that actually contain non-English text, keyed by
--    column name:
--      { "sym_other": { "en_ai": "...", "en_corrected": null,
--                        "translated_at": "..." }, ... }
--    Physician-facing reads use en_corrected ?? en_ai ?? (fall back
--    to raw column, which is already English if patient's language
--    is 'en'). Patient portal never reads this column — it always
--    reads the original plain column, untouched by any physician edit.
--
-- 3. opinions table — translated counterpart of each physician-authored
--    field, translated once at submit/amend time (not on every patient
--    page view), plus a status column so the patient portal can hold
--    on displaying anything until translation succeeds, per your
--    decision: "submit anyway, block patient display until translated."
--
-- Run once in pgAdmin on the thyroconsult database.
-- All statements use IF NOT EXISTS — safe to re-run.
-- ============================================================

-- 1. Patient language preference
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) NOT NULL DEFAULT 'en';

ALTER TABLE patients
  DROP CONSTRAINT IF EXISTS patients_preferred_language_check;

ALTER TABLE patients
  ADD CONSTRAINT patients_preferred_language_check
  CHECK (preferred_language IN ('en','hi','gu','mr','ta','te','kn','ml','bn','pa'));
  -- en=English hi=Hindi gu=Gujarati mr=Marathi ta=Tamil te=Telugu
  -- kn=Kannada ml=Malayalam bn=Bengali pa=Punjabi

-- 2. Free-text translation companion column, per questionnaire table
ALTER TABLE core_questionnaire
  ADD COLUMN IF NOT EXISTS field_translations JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE hypo_questionnaire
  ADD COLUMN IF NOT EXISTS field_translations JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE hyper_questionnaire
  ADD COLUMN IF NOT EXISTS field_translations JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tc_questionnaire
  ADD COLUMN IF NOT EXISTS field_translations JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE nodule_questionnaire
  ADD COLUMN IF NOT EXISTS field_translations JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Opinions — translated counterpart + status tracking
ALTER TABLE opinions
  ADD COLUMN IF NOT EXISTS clinical_summary_translated TEXT,
  ADD COLUMN IF NOT EXISTS impression_translated        TEXT,
  ADD COLUMN IF NOT EXISTS advice_translated             TEXT,
  ADD COLUMN IF NOT EXISTS remarks_translated            TEXT,
  ADD COLUMN IF NOT EXISTS translated_lang                VARCHAR(5),
  ADD COLUMN IF NOT EXISTS translation_status             VARCHAR(20) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS translation_attempted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS translation_completed_at        TIMESTAMPTZ;

ALTER TABLE opinions
  DROP CONSTRAINT IF EXISTS opinions_translation_status_check;

ALTER TABLE opinions
  ADD CONSTRAINT opinions_translation_status_check
  CHECK (translation_status IN ('not_required','pending','success','failed'));
  -- not_required = patient's language is 'en', nothing to translate
  -- pending       = translation in flight or queued for retry
  -- success       = translated_* columns are safe to show the patient
  -- failed        = translation attempt failed, patient portal must
  --                 hold on displaying the opinion until a retry succeeds

CREATE INDEX IF NOT EXISTS idx_opinions_translation_status
  ON opinions(translation_status) WHERE translation_status IN ('pending','failed');
  -- used by the retry job to find work quickly

-- 4. Grants
GRANT ALL PRIVILEGES ON TABLE patients             TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE core_questionnaire    TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire    TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hyper_questionnaire   TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE tc_questionnaire      TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE nodule_questionnaire  TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE opinions              TO thyroconsult_user;

-- ============================================================
-- Verify after running:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'patients' AND column_name = 'preferred_language';
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name IN ('core_questionnaire','hypo_questionnaire',
--   'hyper_questionnaire','tc_questionnaire','nodule_questionnaire')
-- AND column_name = 'field_translations';
-- Expected: 5 rows
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'opinions' AND column_name LIKE '%translat%';
-- Expected: 6 rows
-- ============================================================
