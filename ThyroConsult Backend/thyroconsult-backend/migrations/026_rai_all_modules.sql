-- ======================================================================
-- Migration 026: RAI (radioactive iodine) administration — extend to all 4 modules
-- Full path: thyroconsult-backend\migrations\026_rai_all_modules.sql
--
-- Migration 025 added rai_administrations (JSONB array of {dose_mci, date},
-- repeatable via "add more") to hyper_questionnaire and tc_questionnaire only,
-- since those were the two tables where RAI is a current/administered
-- treatment. Extending to hypo_questionnaire and nodule_questionnaire too,
-- per instruction: RAI should be capturable in all 4 modules.
--
-- IF NOT EXISTS — safe to re-run, safe even though hyper/tc already have it.
-- ======================================================================

ALTER TABLE hypo_questionnaire
  ADD COLUMN IF NOT EXISTS rai_administrations JSONB;

ALTER TABLE nodule_questionnaire
  ADD COLUMN IF NOT EXISTS rai_administrations JSONB;

GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire   TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE nodule_questionnaire TO thyroconsult_user;

-- Verification:
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE column_name = 'rai_administrations' ORDER BY table_name;
-- Expected: 4 rows (hyper_questionnaire, hypo_questionnaire, nodule_questionnaire, tc_questionnaire)
