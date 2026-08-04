-- 035_carpal_tunnel_data_column.sql
-- Adds a single JSONB column to hold per-symptom (Pain / Numbness / Tingling)
-- carpal tunnel data — each symptom gets its own status/side/duration inside
-- the JSON, mirroring hypo_questionnaire's existing sym_carpal_data pattern.
--
-- tc_questionnaire already has legacy flat columns (carpal_tunnel_status,
-- carpal_tunnel_symptoms, carpal_tunnel_side, carpal_tunnel_since_date,
-- carpal_tunnel_years, carpal_tunnel_months) — these are left in place
-- (unused going forward, harmless) rather than dropped, consistent with
-- how prior schema-drift columns have been handled in this project.
--
-- nodule_questionnaire has no carpal tunnel columns at all yet — this is
-- a brand new screen for that questionnaire.

ALTER TABLE tc_questionnaire
  ADD COLUMN IF NOT EXISTS carpal_tunnel_data JSONB;

ALTER TABLE nodule_questionnaire
  ADD COLUMN IF NOT EXISTS carpal_tunnel_data JSONB;

GRANT ALL PRIVILEGES ON TABLE tc_questionnaire TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE nodule_questionnaire TO thyroconsult_user;
