-- 042_tc_med_treatment_type.sql
--
-- Field-mapping audit of TcQuestionnaire.js against TC_Q_COLUMNS (same
-- method as the Hyper audit in migrations 040/041) found exactly one
-- gap: thyroid_med_treatment_type. This is the field that gates which
-- medication columns show at all (levo_only / lio_only / combination /
-- other), so every current-medication answer on the live TC
-- questionnaire has been unrecoverable — the gating value itself was
-- never saved, only the individual drug/dose/brand fields beneath it,
-- with no way to tell from the DB row which branch the patient was even
-- shown.

ALTER TABLE tc_questionnaire
  ADD COLUMN IF NOT EXISTS thyroid_med_treatment_type VARCHAR(20);

GRANT ALL PRIVILEGES ON TABLE tc_questionnaire TO thyroconsult_user;
