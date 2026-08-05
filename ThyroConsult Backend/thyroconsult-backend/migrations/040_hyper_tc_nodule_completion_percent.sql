-- 040_hyper_tc_nodule_completion_percent.sql
-- Adds completion_percent to hyper_questionnaire, tc_questionnaire, and
-- nodule_questionnaire — mirrors migration 037 (hypo_completion_percent).
-- Reported by each questionnaire's own validation-based progress calc on
-- the frontend, not re-derived server-side. See saveHyperQuestionnaire /
-- saveTcQuestionnaire / saveNoduleQuestionnaire in conditionController.js.

ALTER TABLE hyper_questionnaire
  ADD COLUMN IF NOT EXISTS completion_percent INTEGER;

ALTER TABLE tc_questionnaire
  ADD COLUMN IF NOT EXISTS completion_percent INTEGER;

ALTER TABLE nodule_questionnaire
  ADD COLUMN IF NOT EXISTS completion_percent INTEGER;

GRANT ALL PRIVILEGES ON TABLE hyper_questionnaire TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE tc_questionnaire TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE nodule_questionnaire TO thyroconsult_user;
