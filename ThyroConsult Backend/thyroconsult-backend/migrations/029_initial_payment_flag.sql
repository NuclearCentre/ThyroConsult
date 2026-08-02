-- ======================================================================
-- Migration 029: initial_payment_done on patient_condition_episodes
-- Full path: thyroconsult-backend\migrations\029_initial_payment_flag.sql
--
-- Supports the new pre-questionnaire payment gate: Select Condition ->
-- Select Doctor -> Payment -> Questionnaire -> Submit. Distinct from
-- has_missing_reports / investigation_payment_done / followup_payment_done,
-- which all gate POST-submission follow-up scenarios (S1/S2/S3) — this
-- one gates access to the questionnaire itself, before anything has been
-- submitted.
--
-- CORRECTED: the first version of this migration filtered the backfill
-- by `status NOT IN ('draft', 'created')`, guessing at episode_status
-- enum values without checking them — 'draft' isn't a valid value in
-- that enum and the migration failed outright. Simplified: every episode
-- that already exists predates this payment gate entirely, so there's no
-- need to distinguish by status at all — just mark all of them TRUE
-- unconditionally so nobody already in progress gets retroactively locked.
-- ======================================================================

ALTER TABLE patient_condition_episodes
  ADD COLUMN IF NOT EXISTS initial_payment_done BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: every episode that already exists predates this gate — none
-- of them should be retroactively locked out of their own questionnaire.
UPDATE patient_condition_episodes
SET initial_payment_done = TRUE
WHERE initial_payment_done = FALSE;

GRANT ALL PRIVILEGES ON TABLE patient_condition_episodes TO thyroconsult_user;

-- Verification:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'patient_condition_episodes' AND column_name = 'initial_payment_done';
-- Expected: 1 row
