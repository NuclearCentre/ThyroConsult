-- ======================================================================
-- Migration 027: thyroid_dx_* / thyroid_surgery_* on hypo_questionnaire
-- Full path: thyroconsult-backend\migrations\027_hypo_dx_surgery_parity.sql
--
-- C1 (previous thyroid diagnosis) and C2a (thyroid surgery) are live
-- screens in HypoQuestionnaire.js, asked of every patient — but
-- hypo_questionnaire never got these columns (migration 025 added
-- thyroid_med_* for the medication block but missed these two).
-- hyper/tc/nodule_questionnaire already have them; this brings hypo
-- to parity.
--
-- IF NOT EXISTS — safe to re-run.
-- ======================================================================

ALTER TABLE hypo_questionnaire
  ADD COLUMN IF NOT EXISTS thyroid_dx_status       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS thyroid_dx_type          VARCHAR(30),
  ADD COLUMN IF NOT EXISTS thyroid_dx_year          INTEGER,
  ADD COLUMN IF NOT EXISTS thyroid_surgery_status   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS thyroid_surgery_type     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS thyroid_surgery_year     INTEGER;

GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire TO thyroconsult_user;

-- Verification:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'hypo_questionnaire' AND column_name LIKE 'thyroid_dx%' OR column_name LIKE 'thyroid_surgery%';
-- Expected: 6 rows
