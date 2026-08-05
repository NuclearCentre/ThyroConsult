-- 041_hyper_missing_answer_fields.sql
--
-- Full field-by-field audit of HyperQuestionnaire.js's get()/set() calls
-- against HYPER_Q_COLUMNS (conditionController.js) turned up two classes
-- of bug, both meaning patient answers were being silently discarded on
-- every save with no error:
--
--   1. Frontend field name simply didn't match an EXISTING, correct
--      backend column (e.g. "goitre_status" vs the real "goitre_present",
--      or "anaemia_med_data" vs the "anaemia_meds" JSONB column migration
--      031 already added for exactly this purpose but the frontend was
--      never updated to use). Fixed by renaming the frontend's field
--      references — no schema change needed, see HyperQuestionnaire.js.
--
--   2. Frontend collects an answer with NO equivalent column anywhere in
--      the schema — this migration. Most of these are the "years"
--      component of a duration (years + months + since_date), where only
--      _months/_since_date ever existed — e.g. every symptom in Module F
--      (sym_*_years) was losing the years part of "2 years 3 months"
--      down to just "3 months" on every single submission.
--
-- Same root cause and same silent-failure shape as the PCOS bug fixed
-- last session (pcos_med_data/pcos_since_months vs the correct
-- pcos_meds/pcos_since_date/_years/_months) — this is that same bug
-- recurring across ~30 more fields that hadn't been audited yet.

ALTER TABLE hyper_questionnaire
  -- Module B / C — reproductive & thyroid-history duration/date gaps
  ADD COLUMN IF NOT EXISTS menopause_year              INTEGER,
  ADD COLUMN IF NOT EXISTS thyroid_surgery_month        VARCHAR(2),
  ADD COLUMN IF NOT EXISTS thyroid_surgery_year         INTEGER,
  ADD COLUMN IF NOT EXISTS med_since_years              INTEGER,

  -- Module E — Graves'/toxic-nodule detail gaps
  ADD COLUMN IF NOT EXISTS toxic_nodule_confirmed       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS hyper_cause_since_years      INTEGER,
  ADD COLUMN IF NOT EXISTS ophthal_since_years          INTEGER,
  ADD COLUMN IF NOT EXISTS dermopathy_months            INTEGER,
  ADD COLUMN IF NOT EXISTS dermopathy_years             INTEGER,
  ADD COLUMN IF NOT EXISTS goitre_since_years            INTEGER,

  -- Module F — every symptom's "years" component (months/since_date
  -- already existed; years never did)
  ADD COLUMN IF NOT EXISTS sym_fatigue_years            INTEGER,
  ADD COLUMN IF NOT EXISTS sym_weight_years             INTEGER,
  ADD COLUMN IF NOT EXISTS sym_heat_years               INTEGER,
  ADD COLUMN IF NOT EXISTS sym_sweating_years           INTEGER,
  ADD COLUMN IF NOT EXISTS sym_bowel_years              INTEGER,
  ADD COLUMN IF NOT EXISTS sym_skin_years               INTEGER,
  ADD COLUMN IF NOT EXISTS sym_periorbital_years        INTEGER,
  ADD COLUMN IF NOT EXISTS sym_facial_years             INTEGER,
  ADD COLUMN IF NOT EXISTS sym_pedal_years              INTEGER,
  ADD COLUMN IF NOT EXISTS sym_hoarseness_years         INTEGER,
  ADD COLUMN IF NOT EXISTS sym_myopathy_years           INTEGER,
  ADD COLUMN IF NOT EXISTS sym_cramp_years              INTEGER,
  ADD COLUMN IF NOT EXISTS sym_tremor_years             INTEGER,
  ADD COLUMN IF NOT EXISTS sym_anxiety_years            INTEGER,
  ADD COLUMN IF NOT EXISTS sym_irritability_years       INTEGER,
  ADD COLUMN IF NOT EXISTS sym_insomnia_years           INTEGER,
  ADD COLUMN IF NOT EXISTS sym_palp_years               INTEGER,
  ADD COLUMN IF NOT EXISTS sym_af_years                 INTEGER,
  ADD COLUMN IF NOT EXISTS sym_giddiness_years          INTEGER,
  ADD COLUMN IF NOT EXISTS sym_dyspnoea_years           INTEGER,
  ADD COLUMN IF NOT EXISTS sym_concentration_years      INTEGER,
  ADD COLUMN IF NOT EXISTS sym_memory_years             INTEGER,

  -- Module G — beta-blocker duration gap
  ADD COLUMN IF NOT EXISTS beta_blocker_since_years     INTEGER,

  -- Module H — osteoporosis repeatable-medicine list. Migration 031 added
  -- this JSONB pattern for anaemia/diabetes/dyslipidaemia/htn/pcos but
  -- explicitly left osteoporosis out of scope at the time; the frontend
  -- has since been built assuming it exists (as osteoporosis_med_data,
  -- renamed to osteoporosis_meds in this same fix). Adding it now
  -- completes the pattern 031 started.
  ADD COLUMN IF NOT EXISTS osteoporosis_meds            JSONB;

GRANT ALL PRIVILEGES ON TABLE hyper_questionnaire TO thyroconsult_user;
