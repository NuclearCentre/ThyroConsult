-- ============================================================
-- Migration 008 (REVISED v2): Thyroid Nodule Questionnaire
-- Full path: thyroconsult-backend\migrations\008_nodule_questionnaire.sql
--
-- CHANGES FROM PREVIOUS VERSION, per product decisions:
--   1. Family thyroid history / autoimmune duplicate RESOLVED — the
--      component asked the same two questions twice (Module C's C4a/C5
--      AND Module J's J6/J5, both reachable in the live page sequence).
--      Kept the Module J field names (J5/J6 carry the doc's official
--      Q43/Q44 numbering); the C-module duplicate is removed. Corresponding
--      frontend fix: see NoduleQuestionnaire_REVISED.js (removes case
--      "C4a"/"C5", removes them from allPages, renames the surviving
--      J5/J6 keys from *_j_* back to the clean names below).
--   2. TSH / antibody / Anti-TPO / Anti-Tg — checked for the same kind
--      of duplicate. None found: Q13 (TSH) and Q16 (antibody) each
--      appear exactly once in the component. No change made.
--   3. Hysterectomy date now supports partial precision (year-only or
--      month+year, not just a full date) via hysterectomy_date_precision
--      + hysterectomy_year/_month alongside the existing hysterectomy_date.
--      EDD is now persisted (edd_date) instead of only computed
--      client-side for display — both patient and doctor need it saved.
--   4. dob and sex columns REMOVED — collected once under patient
--      demographics (patients table) only, passed in as props
--      (patientDob, patientGender), matching Hyper's existing pattern.
--
-- Run once in pgAdmin on the thyroconsult database as superuser.
-- Run AFTER migration 002 and after adding 'nodule' to condition_type.
-- ============================================================

ALTER TYPE condition_type ADD VALUE IF NOT EXISTS 'nodule';

CREATE TABLE IF NOT EXISTS nodule_questionnaire (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id                      UUID NOT NULL REFERENCES patient_condition_episodes(id),
  patient_id                      UUID NOT NULL REFERENCES patients(id),

  -- ── MODULE A [Q3-Q4] — Marital status & occupation. DOB and biological sex are NOT collected here — sourced from the patients table only (patientDob/patientGender props), per decision to remove the duplicate demographic collection. ──
  marital_status                   VARCHAR(30),
  occupation                       VARCHAR(100),
  occupation_other                 VARCHAR(150),
  occupation_voice_dependent       BOOLEAN NOT NULL DEFAULT FALSE,

  -- ── MODULE B [B1-B5] — Menstrual, pregnancy & hysterectomy (female only) ──
  hysterectomy_status              VARCHAR(30),
  hysterectomy_date_precision      VARCHAR(15),
  hysterectomy_date                DATE,
  hysterectomy_year                INTEGER,
  hysterectomy_month               INTEGER,
  hysterectomy_reason              VARCHAR(50),
  hysterectomy_reason_other        VARCHAR(150),
  menopause_status                 VARCHAR(30),
  menopause_years_ago              INTEGER,
  menstrual_change_status          VARCHAR(30),
  menstrual_pattern                VARCHAR(30),
  menstrual_flow                   TEXT[],
  menstrual_since_date             DATE,
  menstrual_years                  INTEGER,
  menstrual_months                 INTEGER,
  lmp_date                         DATE,
  pregnancy_status                 VARCHAR(30),
  edd_date                         DATE,

  -- ── MODULE E [Q5-Q9] — Nodule discovery & history ──
  nodule_discovery_mode            VARCHAR(30),
  nodule_discovery_other           TEXT,
  nodule_noticed_date              DATE,
  nodule_duration_years            INTEGER,
  nodule_duration_months           INTEGER,
  nodule_size_change               VARCHAR(30),
  nodule_growth_direction          VARCHAR(30),
  nodule_growth_rate               VARCHAR(30),
  nodule_growth_years              INTEGER,
  nodule_growth_months             INTEGER,
  doctor_consulted_status          VARCHAR(30),
  doctor_consulted_date            DATE,
  doctor_advised_tests             TEXT[],
  repeat_usg_advised               VARCHAR(30),
  repeat_usg_done                  VARCHAR(30),
  repeat_usg_due_date              DATE,
  consultation_trigger             TEXT[],
  consultation_trigger_other       VARCHAR(150),

  -- ── MODULE I [Q10-Q12] — Management plan, discussion & patient concern ──
  mgmt_plan_discussed              VARCHAR(30),
  mgmt_plan_types                  TEXT[],
  mgmt_plan_next_date              DATE,
  outcomes_discussed               VARCHAR(30),
  outcomes_details                 TEXT[],
  patient_primary_concern          VARCHAR(30),
  patient_concern_other            TEXT,

  -- ── MODULE D [Q13-Q17b] — Thyroid labs, imaging & cytology (TSH branch point) ──
  tsh_status                       VARCHAR(30),
  tsh_value                        NUMERIC,
  tsh_date                         DATE,
  tsh_ref_low                      NUMERIC,
  tsh_ref_high                     NUMERIC,
  ft4_status                       VARCHAR(30),
  ft4_value                        NUMERIC,
  ft4_unit                         VARCHAR(30),
  ft4_date                         DATE,
  ft4_ref_low                      NUMERIC,
  ft4_ref_high                     NUMERIC,
  ft3_status                       VARCHAR(30),
  ft3_value                        NUMERIC,
  ft3_unit                         VARCHAR(30),
  ft3_date                         DATE,
  ft3_ref_low                      NUMERIC,
  ft3_ref_high                     NUMERIC,
  antibody_status                  VARCHAR(30),
  antitpo_value                    NUMERIC,
  antitpo_date                     DATE,
  antitg_value                     NUMERIC,
  antitg_date                      DATE,
  imaging_status                   VARCHAR(30),
  imaging_types                    TEXT[],
  imaging_date                     DATE,
  nodule_size_mm                   NUMERIC,
  nodule_count                     INTEGER,
  tirads_category                  VARCHAR(30),
  cytology_status                  VARCHAR(30),
  cytology_types                   TEXT[],
  cytology_date                    DATE,
  bethesda_category                VARCHAR(30),

  -- ── MODULE C [C1-C3, C4b] — Thyroid disease & medication history. C4a (family thyroid history) and C5 (autoimmune) REMOVED — they duplicated J6/J5 verbatim (same question, same options) and both were reachable in the live page sequence. Kept the Module-J versions since those carry the doc's official Q43/Q44 numbering; C4b (MEN syndrome family history) is unique and stays. ──
  thyroid_dx_status                VARCHAR(30),
  thyroid_dx_type                  VARCHAR(30),
  thyroid_dx_year                  INTEGER,
  thyroid_tx_status                VARCHAR(30),
  thyroid_tx_type                  VARCHAR(30),
  thyroid_tx_year                  INTEGER,
  thyroid_med_status               VARCHAR(30),
  thyroid_med_name                 VARCHAR(200),
  thyroid_med_brand                VARCHAR(200),
  thyroid_med_dose                 NUMERIC,
  thyroid_med_timing               VARCHAR(30),
  thyroid_med_compliance           VARCHAR(30),
  thyroid_med_since_years          INTEGER,
  thyroid_med_since_months         INTEGER,
  infertility_status               VARCHAR(30),

  -- ── MODULE F [Q18-Q21] — Prior treatment & opinions ──
  nodule_treatment_status          VARCHAR(30),
  nodule_treatment_types           TEXT[],
  nodule_treatment_date            DATE,
  nodule_treatment_completed       VARCHAR(30),
  prior_advice_status              VARCHAR(30),
  prior_advice_types               TEXT[],
  prior_advice_followed            VARCHAR(30),
  prior_advice_not_followed_reason TEXT,
  prior_opinion_status             VARCHAR(30),
  prior_opinion_specialty          TEXT[],
  prior_opinion_date               DATE,
  prior_opinion_summary            TEXT,
  prior_opinion_followed           VARCHAR(30),
  current_med_status               VARCHAR(30),
  current_med_name                 VARCHAR(150),
  current_med_brand                VARCHAR(150),
  current_med_dose                 NUMERIC,
  current_med_timing               TEXT[],
  current_med_compliance           VARCHAR(30),
  current_med_since_years          INTEGER,
  current_med_since_months         INTEGER,

  -- ── MODULE G [Q22-Q27] — Nodule-specific local symptoms ──
  nodule_visible_status            VARCHAR(30),
  nodule_visible_pattern           VARCHAR(30),
  nodule_visible_since_date        DATE,
  nodule_visible_years             INTEGER,
  nodule_visible_months            INTEGER,
  neck_pain_status                 VARCHAR(30),
  neck_pain_types                  TEXT[],
  neck_pain_severity               VARCHAR(30),
  neck_pain_since_date             DATE,
  neck_pain_years                  INTEGER,
  neck_pain_months                 INTEGER,
  dysphagia_status                 VARCHAR(30),
  dysphagia_type                   VARCHAR(30),
  dysphagia_severity               VARCHAR(30),
  dysphagia_since_date             DATE,
  dysphagia_years                  INTEGER,
  dysphagia_months                 INTEGER,
  resp_symptom_status              VARCHAR(30),
  resp_symptom_types               TEXT[],
  resp_symptom_trigger             VARCHAR(30),
  resp_since_date                  DATE,
  resp_years                       INTEGER,
  resp_months                      INTEGER,
  hoarseness_status                VARCHAR(30),
  hoarseness_pattern               VARCHAR(30),
  hoarseness_since_date            DATE,
  hoarseness_years                 INTEGER,
  hoarseness_months                INTEGER,
  voice_fatigue_status             VARCHAR(30),
  nodule_cough_status              VARCHAR(30),
  nodule_cough_type                VARCHAR(30),
  nodule_cough_since_date          DATE,
  nodule_cough_years               INTEGER,
  nodule_cough_months              INTEGER,

  -- ── MODULE H [Q28-Q38] — Systemic & hormonal symptoms (shown only when TSH normal) ──
  fatigue_status                   VARCHAR(30),
  fatigue_severity                 VARCHAR(30),
  fatigue_since_date               DATE,
  fatigue_years                    INTEGER,
  fatigue_months                   INTEGER,
  weight_change_status             VARCHAR(30),
  weight_direction                 VARCHAR(30),
  weight_kg                        NUMERIC,
  weight_since_date                DATE,
  weight_years                     INTEGER,
  weight_months                    INTEGER,
  appetite_change_status           VARCHAR(30),
  appetite_direction               VARCHAR(30),
  appetite_since_date              DATE,
  appetite_years                   INTEGER,
  appetite_months                  INTEGER,
  cold_intol_status                VARCHAR(30),
  cold_intol_severity              VARCHAR(30),
  cold_intol_since_date            DATE,
  cold_intol_years                 INTEGER,
  cold_intol_months                INTEGER,
  bowel_change_status              VARCHAR(30),
  bowel_type                       VARCHAR(30),
  bowel_since_date                 DATE,
  bowel_years                      INTEGER,
  bowel_months                     INTEGER,
  skin_status                      VARCHAR(30),
  skin_types                       TEXT[],
  skin_since_date                  DATE,
  skin_years                       INTEGER,
  skin_months                      INTEGER,
  hair_status                      VARCHAR(30),
  hair_types                       TEXT[],
  hair_since_date                  DATE,
  hair_years                       INTEGER,
  hair_months                      INTEGER,
  muscle_sx_status                 VARCHAR(30),
  muscle_sx_types                  TEXT[],
  muscle_weakness_location         VARCHAR(30),
  muscle_sx_since_date             DATE,
  muscle_sx_years                  INTEGER,
  muscle_sx_months                 INTEGER,
  depression_status                VARCHAR(30),
  depression_diagnosed             VARCHAR(30),
  depression_treated               VARCHAR(30),
  depression_since_date            DATE,
  depression_years                 INTEGER,
  depression_months                INTEGER,
  palp_tremor_status               VARCHAR(30),
  palp_tremor_types                TEXT[],
  palp_tremor_since_date           DATE,
  palp_tremor_years                INTEGER,
  palp_tremor_months               INTEGER,
  anxiety_status                   VARCHAR(30),
  anxiety_severity                 VARCHAR(30),
  anxiety_since_date               DATE,
  anxiety_years                    INTEGER,
  anxiety_months                   INTEGER,

  -- ── MODULE J [J1-J4, J4b, J4c, J5-J10] — Comorbidities, risk factors & finish (J5=autoimmune, J6=family thyroid history — see Module C note above) ──
  dyslipidaemia_status             VARCHAR(30),
  dyslipidaemia_since_date         DATE,
  dyslipidaemia_years              INTEGER,
  dyslipidaemia_months             INTEGER,
  dyslipidaemia_on_med             VARCHAR(30),
  dyslipidaemia_meds               JSONB,
  anaemia_status                   VARCHAR(30),
  anaemia_type                     VARCHAR(30),
  diabetes_status                  VARCHAR(30),
  diabetes_type                    VARCHAR(30),
  diabetes_since_date              DATE,
  diabetes_years                   INTEGER,
  diabetes_months                  INTEGER,
  diabetes_meds                    JSONB,
  htn_status                       VARCHAR(30),
  htn_since_date                   DATE,
  htn_years                        INTEGER,
  htn_months                       INTEGER,
  htn_on_med                       VARCHAR(30),
  htn_meds                         JSONB,
  pcos_label                       VARCHAR(30),
  pcos_status                      VARCHAR(30),
  pcos_since_date                  DATE,
  pcos_years                       INTEGER,
  pcos_months                      INTEGER,
  pcos_on_med                      VARCHAR(30),
  pcos_med_name                    VARCHAR(200),
  pcos_med_dose                    NUMERIC,
  pcos_med_freq                    INTEGER,
  autoimmune_status                VARCHAR(30),
  autoimmune_conditions            TEXT[],
  autoimmune_other                 TEXT,
  family_thyroid_status            VARCHAR(30),
  family_thyroid_relations         TEXT[],
  family_thyroid_condition         TEXT,
  family_men_status                VARCHAR(30),
  family_men_types                 TEXT[],
  family_men_relative              TEXT,
  radiation_exposure_status        VARCHAR(30),
  radiation_exposure_types         TEXT[],
  radiation_exposure_other         TEXT,
  radiation_exposure_year          INTEGER,
  iodine_deficiency_status         VARCHAR(30),
  iodine_deficiency_since_date     DATE,
  iodine_deficiency_years          INTEGER,
  iodine_deficiency_months         INTEGER,
  iodine_med_status                VARCHAR(30),
  iodine_med_name                  VARCHAR(150),
  iodine_med_since_date            DATE,
  iodine_med_years                 INTEGER,
  iodine_med_months                INTEGER,
  additional_notes                 TEXT,

  is_draft                        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(episode_id)
);

CREATE INDEX IF NOT EXISTS idx_nodule_q_episode ON nodule_questionnaire(episode_id);
CREATE INDEX IF NOT EXISTS idx_nodule_q_patient ON nodule_questionnaire(patient_id);

DROP TRIGGER IF EXISTS trg_nodule_questionnaire_updated_at ON nodule_questionnaire;
CREATE TRIGGER trg_nodule_questionnaire_updated_at
  BEFORE UPDATE ON nodule_questionnaire
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT ALL PRIVILEGES ON TABLE nodule_questionnaire TO thyroconsult_user;

-- ── Verification ─────────────────────────────────────────────
-- SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'nodule_questionnaire';
-- Expected: 3 + 259 + 3 = 265 columns
