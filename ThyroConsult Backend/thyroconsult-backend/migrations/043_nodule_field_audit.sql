-- 043_nodule_field_audit.sql
--
-- Field-mapping audit of NoduleQuestionnaire.js against NODULE_Q_COLUMNS
-- (same method as the Hyper/TC audits in migrations 040-042) found two
-- issues:
--
--   1. consultation_trigger / consultation_trigger_other (Q9) — frontend
--      used field names the backend never accepted (the correct,
--      already-existing columns are opinion_trigger / opinion_trigger_
--      other). Also a platform language-rule violation ("consultation"
--      is banned everywhere on this platform) independent of the bug.
--      Fixed by renaming the frontend's field references — no schema
--      change needed for this one.
--
--   2. patient_primary_concern (Q12) — "What is your biggest concern
--      regarding this thyroid nodule?", a full radio-button answer with
--      no matching column anywhere (only its "other, please specify"
--      companion field, patient_concern_other, existed). This migration.

ALTER TABLE nodule_questionnaire
  ADD COLUMN IF NOT EXISTS patient_primary_concern VARCHAR(30);

GRANT ALL PRIVILEGES ON TABLE nodule_questionnaire TO thyroconsult_user;
