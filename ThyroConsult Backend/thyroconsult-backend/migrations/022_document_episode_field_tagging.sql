-- 022_document_episode_field_tagging.sql
--
-- RENAME THIS FILE if your migrations folder is already past 021 — check
-- D:\Thyroid Consultation Software\ThyroConsult Backend\thyroconsult-backend\migrations\
-- for the highest existing number first and bump this one to the next
-- integer. Session summary as of 31 Jul 2026 had migrations up through 021
-- (021_patient_country.sql) — if nothing newer has landed since, 022 is
-- correct as-is.
--
-- Purpose: lets an uploaded document be tagged to (a) the specific
-- condition episode it belongs to, and (b) the specific question/field it
-- was uploaded against (e.g. "TSH", "USG neck", "Anti-TPO"), instead of
-- only the coarse category enum (blood_report/scan_usg/prescription/
-- biopsy/other) that exists today. Both columns are nullable — general
-- documents uploaded outside a questionnaire context (e.g. via the old
-- generic Upload Reports flow, or a future non-condition-linked upload)
-- keep working exactly as before.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS episode_id UUID REFERENCES patient_condition_episodes(id),
  ADD COLUMN IF NOT EXISTS field_label VARCHAR(120);

-- Speeds up the two new lookup patterns this feature needs:
-- "all documents for this episode" (patient questionnaire resume, and the
-- physician's episode review screen) and "all documents for this patient,
-- grouped" (the physician-portal per-patient documents view).
CREATE INDEX IF NOT EXISTS idx_documents_episode_id ON documents(episode_id);
CREATE INDEX IF NOT EXISTS idx_documents_patient_episode ON documents(patient_id, episode_id);

GRANT ALL PRIVILEGES ON TABLE documents TO thyroconsult_user;
