-- 031_comorbidity_meds_repeatable.sql
--
-- Adds a repeatable "add more medicines" capability for the 5 comorbidities
-- that currently only capture ONE medicine each (Anaemia, Diabetes,
-- Dyslipidaemia, Hypertension, PCOS/PMOS) — mirrors the existing
-- rai_administrations JSONB-array pattern already in use.
--
-- Each new column stores an array of objects shaped like:
--   [{ "name": "Metformin", "dose": "500", "freq": "2",
--      "since_date": null, "since_years": "3", "since_months": "0" }, ...]
--
-- The old singular columns (e.g. diabetes_med_name, diabetes_med_dose, ...)
-- are LEFT IN PLACE, not dropped — they hold any data already collected
-- before this migration and cost nothing to keep. The frontend and
-- conditionController.js whitelist are being updated in the same session
-- to write/read the new *_meds column instead of the old singular ones.
--
-- Applied identically across all 4 condition tables, matching the existing
-- standardization pattern from migrations 025-030 (all 4 tables carry the
-- same canonical comorbidity fields even though only the Hypo frontend
-- uses this specific feature so far — Hyper/TC/Nodule frontends are not
-- yet redesigned, so this keeps schema ready for when they are, avoiding
-- a future migration gap).

ALTER TABLE hypo_questionnaire   ADD COLUMN IF NOT EXISTS anaemia_meds        JSONB;
ALTER TABLE hypo_questionnaire   ADD COLUMN IF NOT EXISTS diabetes_meds       JSONB;
ALTER TABLE hypo_questionnaire   ADD COLUMN IF NOT EXISTS dyslipidaemia_meds  JSONB;
ALTER TABLE hypo_questionnaire   ADD COLUMN IF NOT EXISTS htn_meds            JSONB;
ALTER TABLE hypo_questionnaire   ADD COLUMN IF NOT EXISTS pcos_meds           JSONB;

ALTER TABLE hyper_questionnaire  ADD COLUMN IF NOT EXISTS anaemia_meds        JSONB;
ALTER TABLE hyper_questionnaire  ADD COLUMN IF NOT EXISTS diabetes_meds       JSONB;
ALTER TABLE hyper_questionnaire  ADD COLUMN IF NOT EXISTS dyslipidaemia_meds  JSONB;
ALTER TABLE hyper_questionnaire  ADD COLUMN IF NOT EXISTS htn_meds            JSONB;
ALTER TABLE hyper_questionnaire  ADD COLUMN IF NOT EXISTS pcos_meds           JSONB;

ALTER TABLE tc_questionnaire     ADD COLUMN IF NOT EXISTS anaemia_meds        JSONB;
ALTER TABLE tc_questionnaire     ADD COLUMN IF NOT EXISTS diabetes_meds       JSONB;
ALTER TABLE tc_questionnaire     ADD COLUMN IF NOT EXISTS dyslipidaemia_meds  JSONB;
ALTER TABLE tc_questionnaire     ADD COLUMN IF NOT EXISTS htn_meds            JSONB;
ALTER TABLE tc_questionnaire     ADD COLUMN IF NOT EXISTS pcos_meds           JSONB;

ALTER TABLE nodule_questionnaire ADD COLUMN IF NOT EXISTS anaemia_meds        JSONB;
ALTER TABLE nodule_questionnaire ADD COLUMN IF NOT EXISTS diabetes_meds       JSONB;
ALTER TABLE nodule_questionnaire ADD COLUMN IF NOT EXISTS dyslipidaemia_meds  JSONB;
ALTER TABLE nodule_questionnaire ADD COLUMN IF NOT EXISTS htn_meds            JSONB;
ALTER TABLE nodule_questionnaire ADD COLUMN IF NOT EXISTS pcos_meds           JSONB;

GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire   TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hyper_questionnaire  TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE tc_questionnaire     TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE nodule_questionnaire TO thyroconsult_user;
