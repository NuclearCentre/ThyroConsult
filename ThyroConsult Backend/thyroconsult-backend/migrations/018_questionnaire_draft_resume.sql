-- ============================================================
-- Migration 018 — questionnaire draft/resume support
--
-- 1. is_draft on hypo/hyper/tc_questionnaire — nodule_questionnaire
--    already had this column (migration 008); hypo/hyper/tc never got
--    it, which meant every save (including interim autosaves) marked
--    the whole episode "questionnaire completed" the moment the first
--    field was ever saved. See conditionController.js for the fix.
--
-- 2. current_page (string page id, e.g. 'F16') on hypo/hyper/tc/nodule
--    questionnaire — current_section (integer) on core_questionnaire —
--    so that when a patient logs back in after a pause (network
--    outage, waiting on a report, etc.) they land back on the exact
--    screen they left off on, not just see their answers pre-filled
--    starting from page 1 again.
-- ============================================================

ALTER TABLE hypo_questionnaire
  ADD COLUMN IF NOT EXISTS is_draft      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS current_page  VARCHAR(20);

ALTER TABLE hyper_questionnaire
  ADD COLUMN IF NOT EXISTS is_draft      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS current_page  VARCHAR(20);

ALTER TABLE tc_questionnaire
  ADD COLUMN IF NOT EXISTS is_draft      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS current_page  VARCHAR(20);

ALTER TABLE nodule_questionnaire
  ADD COLUMN IF NOT EXISTS current_page  VARCHAR(20);
  -- is_draft already exists on this table (migration 008)

ALTER TABLE core_questionnaire
  ADD COLUMN IF NOT EXISTS current_section INTEGER;

GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire   TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hyper_questionnaire  TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE tc_questionnaire     TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE nodule_questionnaire TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE core_questionnaire   TO thyroconsult_user;
