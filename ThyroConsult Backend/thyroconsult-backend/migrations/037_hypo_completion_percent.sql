-- 037_hypo_completion_percent.sql
-- Adds completion_percent to hypo_questionnaire — reported by the
-- frontend's own progress calculation (HypoQuestionnaire.js's allPages,
-- which already correctly accounts for gender/hysterectomy/menopause/
-- cause/surgery branching) on every autosave and submit, rather than
-- re-derived server-side and risking drift from the real branching logic.
--
-- Powers the "percentage pending" indicator on the patient dashboard.
-- Hyper/TC/Nodule will get the same column + wiring once replicated.

ALTER TABLE hypo_questionnaire
  ADD COLUMN IF NOT EXISTS completion_percent INTEGER;

GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire TO thyroconsult_user;
