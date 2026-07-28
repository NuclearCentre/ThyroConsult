-- ============================================================
-- ThyroConsult — Multi-Condition Schema Extension
-- Migration: 002_multi_condition_schema.sql  (FIXED)
--
-- Run AFTER 001_schema.sql is already applied.
-- Adds support for:
--   1. Hypothyroidism  (existing patients — new structured tables)
--   2. Hyperthyroidism / Graves' Disease
--   3. Thyroid Cancer
--
-- What already exists (from 001_schema.sql):
--   patients, doctors, admins, appointments, consultations,
--   prescriptions, documents, blood_report_values, payments,
--   consents, otp_verifications, refresh_tokens,
--   audit_logs, notifications
--   lab_parameters (created manually before this run)
--
-- This file adds 14 new tables and extends 2 existing ones.
-- ============================================================

-- ============================================================
-- SECTION 0 — ENUMS
-- ============================================================

CREATE TYPE condition_type AS ENUM (
  'hypothyroidism',
  'hyperthyroidism',
  'thyroid_cancer'
);

CREATE TYPE episode_status AS ENUM (
  'active',
  'remission',
  'monitoring',
  'closed'
);

CREATE TYPE questionnaire_status AS ENUM (
  'not_started',
  'in_progress',
  'completed'
);

CREATE TYPE severity_level AS ENUM (
  'none', 'mild', 'moderate', 'severe'
);

CREATE TYPE symptom_frequency AS ENUM (
  'never', 'occasionally', 'frequently', 'always'
);

CREATE TYPE hypo_cause AS ENUM (
  'hashimotos', 'post_radioiodine', 'post_surgical',
  'congenital', 'iodine_deficiency', 'drug_induced', 'unknown'
);

CREATE TYPE hypo_treatment_type AS ENUM (
  'levothyroxine', 'liothyronine', 'combination', 'none'
);

CREATE TYPE hyper_cause AS ENUM (
  'graves_disease', 'toxic_multinodular_goitre', 'toxic_adenoma',
  'subacute_thyroiditis', 'post_partum_thyroiditis',
  'iodine_induced', 'drug_induced', 'unknown'
);

CREATE TYPE hyper_treatment_type AS ENUM (
  'antithyroid_drug', 'radioiodine', 'surgery',
  'beta_blocker_only', 'none'
);

CREATE TYPE atd_drug_name AS ENUM (
  'methimazole', 'carbimazole', 'propylthiouracil', 'other'
);

CREATE TYPE rai_outcome AS ENUM (
  'euthyroid', 'hypothyroid',
  'persistent_hyperthyroidism', 'awaiting_assessment'
);

CREATE TYPE tc_cancer_type AS ENUM (
  'papillary', 'follicular', 'hurthle_cell', 'medullary',
  'anaplastic', 'poorly_differentiated', 'other'
);

CREATE TYPE tc_t_stage  AS ENUM ('T1a','T1b','T2','T3a','T3b','T4a','T4b','Tx');
CREATE TYPE tc_n_stage  AS ENUM ('N0','N1a','N1b','Nx');
CREATE TYPE tc_m_stage  AS ENUM ('M0','M1','Mx');
CREATE TYPE tc_overall_stage AS ENUM ('I','II','III','IVA','IVB','IVC');

CREATE TYPE tc_risk_category AS ENUM (
  'very_low', 'low', 'intermediate', 'high'
);

CREATE TYPE tc_surgery_type AS ENUM (
  'total_thyroidectomy', 'near_total_thyroidectomy',
  'hemithyroidectomy', 'completion_thyroidectomy',
  'central_neck_dissection', 'lateral_neck_dissection',
  'modified_radical_neck_dissection', 'other'
);

CREATE TYPE tc_rai_response AS ENUM (
  'excellent', 'indeterminate', 'biochemically_incomplete',
  'structurally_incomplete', 'awaiting_assessment'
);

CREATE TYPE tc_surveillance_interval AS ENUM (
  '3_months', '6_months', '12_months', '24_months'
);

CREATE TYPE scan_type AS ENUM (
  'usg_thyroid', 'usg_neck', 'radioiodine_scan', 'thyroid_scan',
  'ct_neck', 'ct_chest', 'xr_chest', 'pet_ct',
  'mri_neck', 'bone_scan', 'fnac', 'other'
);

-- ============================================================
-- SECTION 1 — PATIENT CONDITION EPISODES
-- One row per condition per patient.
-- ============================================================

CREATE TABLE patient_condition_episodes (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id                UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  condition                 condition_type NOT NULL,
  status                    episode_status NOT NULL DEFAULT 'active',
  primary_doctor_id         UUID REFERENCES doctors(id),
  onset_date                DATE,
  diagnosis_date            DATE,
  diagnosed_by              TEXT,             -- PHI-ENCRYPTED: external doctor name
  diagnosis_notes           TEXT,             -- PHI-ENCRYPTED
  questionnaire_status      questionnaire_status NOT NULL DEFAULT 'not_started',
  questionnaire_completed_at TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_patient_condition UNIQUE (patient_id, condition)
);

CREATE INDEX idx_pce_patient   ON patient_condition_episodes(patient_id);
CREATE INDEX idx_pce_condition ON patient_condition_episodes(condition);
CREATE INDEX idx_pce_doctor    ON patient_condition_episodes(primary_doctor_id);

-- ============================================================
-- SECTION 2 — CONDITION SELECTION (Registration Step 5.5)
-- Records which condition the patient selects between
-- Step 5 (Choose Doctor) and Step 6 (Upload Reports).
-- ============================================================

CREATE TABLE patient_condition_selection (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  selected_condition  condition_type,
  selected_at         TIMESTAMPTZ,
  completed           BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_patient_condition_selection UNIQUE (patient_id)
);

-- ============================================================
-- SECTION 3 — SHARED CORE QUESTIONNAIRE
-- Filled once per episode; shared across all conditions.
-- ============================================================

CREATE TABLE core_questionnaire (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id                  UUID NOT NULL UNIQUE REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id                  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Chief complaint
  chief_complaint             TEXT,                   -- PHI-ENCRYPTED
  complaint_duration_value    INTEGER,
  complaint_duration_unit     VARCHAR(10),            -- days/weeks/months/years

  -- General symptoms
  sym_fatigue                 symptom_frequency DEFAULT 'never',
  sym_weight_change           VARCHAR(20),            -- gained/lost/no_change
  sym_weight_kg               NUMERIC(5,2),
  sym_weight_duration_weeks   INTEGER,
  sym_neck_swelling           BOOLEAN DEFAULT FALSE,
  sym_neck_swelling_side      VARCHAR(10),            -- left/right/bilateral
  sym_neck_pain               symptom_frequency DEFAULT 'never',
  sym_difficulty_swallowing   symptom_frequency DEFAULT 'never',
  sym_voice_change            BOOLEAN DEFAULT FALSE,
  sym_breathlessness          symptom_frequency DEFAULT 'never',
  sym_palpitations            symptom_frequency DEFAULT 'never',
  sym_heat_intolerance        BOOLEAN DEFAULT FALSE,
  sym_cold_intolerance        BOOLEAN DEFAULT FALSE,
  sym_hair_loss               symptom_frequency DEFAULT 'never',
  sym_skin_changes            TEXT,
  sym_bowel_changes           VARCHAR(30),            -- constipation/diarrhoea/normal
  sym_menstrual_changes       TEXT,                   -- PHI-ENCRYPTED
  sym_mood_changes            TEXT,
  sym_muscle_weakness         symptom_frequency DEFAULT 'never',
  sym_joint_pain              symptom_frequency DEFAULT 'never',
  sym_eye_changes             BOOLEAN DEFAULT FALSE,
  sym_other                   TEXT,

  -- Vital signs
  height_cm                   NUMERIC(5,1),
  weight_kg                   NUMERIC(5,2),
  bmi                         NUMERIC(4,1),
  bp_systolic                 INTEGER,
  bp_diastolic                INTEGER,
  heart_rate                  INTEGER,
  temperature_celsius         NUMERIC(4,1),

  -- Past medical history
  pmh_hypertension            BOOLEAN DEFAULT FALSE,
  pmh_diabetes                BOOLEAN DEFAULT FALSE,
  pmh_cardiac                 BOOLEAN DEFAULT FALSE,
  pmh_renal                   BOOLEAN DEFAULT FALSE,
  pmh_liver                   BOOLEAN DEFAULT FALSE,
  pmh_autoimmune              BOOLEAN DEFAULT FALSE,
  pmh_autoimmune_details      TEXT,
  pmh_previous_thyroid        BOOLEAN DEFAULT FALSE,
  pmh_previous_thyroid_details TEXT,
  pmh_neck_radiation          BOOLEAN DEFAULT FALSE,
  pmh_neck_radiation_details  TEXT,
  pmh_other                   TEXT,

  -- Surgical history
  surgical_history            BOOLEAN DEFAULT FALSE,
  surgical_history_details    TEXT,                   -- PHI-ENCRYPTED

  -- Family history
  fh_thyroid_disease          BOOLEAN DEFAULT FALSE,
  fh_thyroid_details          TEXT,
  fh_thyroid_cancer           BOOLEAN DEFAULT FALSE,
  fh_thyroid_cancer_details   TEXT,
  fh_autoimmune               BOOLEAN DEFAULT FALSE,
  fh_autoimmune_details       TEXT,
  fh_men_syndrome             BOOLEAN DEFAULT FALSE,
  fh_other                    TEXT,

  -- Medications & allergies
  current_medications         JSONB DEFAULT '[]',
  allergies                   TEXT,                   -- PHI-ENCRYPTED
  contrast_allergy            BOOLEAN DEFAULT FALSE,

  -- Social history
  smoking_status              VARCHAR(20),            -- never/ex/current
  smoking_pack_years          NUMERIC(4,1),
  alcohol_status              VARCHAR(20),            -- never/occasional/regular
  occupation                  TEXT,                   -- PHI-ENCRYPTED
  radiation_exposure          BOOLEAN DEFAULT FALSE,
  radiation_exposure_details  TEXT,

  -- Obstetric history
  is_pregnant                 BOOLEAN DEFAULT FALSE,
  is_breastfeeding            BOOLEAN DEFAULT FALSE,
  gravida                     INTEGER,
  para                        INTEGER,
  last_menstrual_period       DATE,

  -- Previous investigations
  prev_tsh_done               BOOLEAN DEFAULT FALSE,
  prev_tsh_value              NUMERIC(8,4),
  prev_tsh_date               DATE,
  prev_usg_done               BOOLEAN DEFAULT FALSE,
  prev_usg_date               DATE,
  prev_fnac_done              BOOLEAN DEFAULT FALSE,
  prev_fnac_result            TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cq_episode ON core_questionnaire(episode_id);
CREATE INDEX idx_cq_patient ON core_questionnaire(patient_id);

-- ============================================================
-- SECTION 4 — HYPOTHYROIDISM QUESTIONNAIRE
-- ============================================================

CREATE TABLE hypo_questionnaire (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id                  UUID NOT NULL UNIQUE REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id                  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  cause                       hypo_cause,
  is_subclinical              BOOLEAN DEFAULT FALSE,
  goitre_present              BOOLEAN DEFAULT FALSE,
  goitre_size                 VARCHAR(30),

  -- Hypothyroid-specific symptoms
  sym_myxoedema               BOOLEAN DEFAULT FALSE,
  sym_periorbital_puffiness   BOOLEAN DEFAULT FALSE,
  sym_macroglossia            BOOLEAN DEFAULT FALSE,
  sym_delayed_reflexes        BOOLEAN DEFAULT FALSE,
  sym_carpal_tunnel           BOOLEAN DEFAULT FALSE,
  sym_cognitive_impairment    symptom_frequency DEFAULT 'never',
  sym_depression              symptom_frequency DEFAULT 'never',
  sym_dry_skin                symptom_frequency DEFAULT 'never',
  sym_brittle_nails           BOOLEAN DEFAULT FALSE,

  -- Treatment
  on_treatment                BOOLEAN DEFAULT FALSE,
  treatment_type              hypo_treatment_type,
  levo_dose_mcg               NUMERIC(6,2),
  levo_brand                  VARCHAR(100),
  levo_timing                 VARCHAR(50),
  levo_compliance             VARCHAR(20),            -- good/poor/irregular
  treatment_start_date        DATE,
  dose_last_changed_date      DATE,
  dose_last_changed_reason    TEXT,

  -- Hashimoto's
  hashimotos_confirmed        BOOLEAN DEFAULT FALSE,
  anti_tpo_positive           BOOLEAN DEFAULT FALSE,
  anti_tg_positive            BOOLEAN DEFAULT FALSE,

  -- Comorbidities
  has_dyslipidaemia           BOOLEAN DEFAULT FALSE,
  has_anaemia                 BOOLEAN DEFAULT FALSE,
  has_pcos                    BOOLEAN DEFAULT FALSE,
  has_infertility             BOOLEAN DEFAULT FALSE,
  has_depression_diagnosed    BOOLEAN DEFAULT FALSE,

  -- Monitoring
  tsh_target                  VARCHAR(50),
  review_frequency            VARCHAR(30),
  next_review_date            DATE,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hypo_q_episode ON hypo_questionnaire(episode_id);

-- Hypothyroidism treatment history
CREATE TABLE hypo_treatment_history (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id            UUID NOT NULL REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  treatment_type        hypo_treatment_type NOT NULL,
  drug_name             VARCHAR(100),
  brand_name            VARCHAR(100),
  dose_mcg              NUMERIC(6,2),
  frequency             VARCHAR(50),
  start_date            DATE,
  end_date              DATE,
  reason_for_change     TEXT,
  tsh_at_start          NUMERIC(8,4),
  tsh_at_end            NUMERIC(8,4),
  notes                 TEXT,
  recorded_by_doctor_id UUID REFERENCES doctors(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hypo_tx_episode ON hypo_treatment_history(episode_id);

-- ============================================================
-- SECTION 5 — HYPERTHYROIDISM / GRAVES' QUESTIONNAIRE
-- ============================================================

CREATE TABLE hyper_questionnaire (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id                      UUID NOT NULL UNIQUE REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id                      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  cause                           hyper_cause,
  is_subclinical                  BOOLEAN DEFAULT FALSE,
  goitre_present                  BOOLEAN DEFAULT FALSE,
  goitre_type                     VARCHAR(30),        -- diffuse/nodular/multinodular

  -- Graves' specific
  graves_confirmed                BOOLEAN DEFAULT FALSE,
  trab_value                      NUMERIC(8,4),
  trab_unit                       VARCHAR(20),        -- IU/L
  trab_date                       DATE,

  -- Graves' ophthalmopathy
  graves_ophthalmopathy           BOOLEAN DEFAULT FALSE,
  go_class                        VARCHAR(30),        -- mild/moderate/severe/sight_threatening
  go_clinical_activity_score      INTEGER,            -- CAS 0-7
  go_proptosis_mm_right           NUMERIC(4,1),
  go_proptosis_mm_left            NUMERIC(4,1),
  go_diplopia                     BOOLEAN DEFAULT FALSE,
  go_visual_acuity_affected       BOOLEAN DEFAULT FALSE,
  go_treatment                    TEXT,

  -- Graves' dermopathy
  graves_dermopathy               BOOLEAN DEFAULT FALSE,
  graves_dermopathy_details       TEXT,

  -- Hyperthyroid-specific symptoms
  sym_tremor                      BOOLEAN DEFAULT FALSE,
  sym_tremor_severity             severity_level DEFAULT 'none',
  sym_excessive_sweating          symptom_frequency DEFAULT 'never',
  sym_heat_intolerance_severity   severity_level DEFAULT 'none',
  sym_anxiety                     symptom_frequency DEFAULT 'never',
  sym_irritability                symptom_frequency DEFAULT 'never',
  sym_insomnia                    symptom_frequency DEFAULT 'never',
  sym_increased_appetite          BOOLEAN DEFAULT FALSE,
  sym_frequent_bowel_movements    BOOLEAN DEFAULT FALSE,
  sym_muscle_wasting              BOOLEAN DEFAULT FALSE,
  sym_proximal_myopathy           BOOLEAN DEFAULT FALSE,
  sym_periodic_paralysis          BOOLEAN DEFAULT FALSE,
  sym_atrial_fibrillation         BOOLEAN DEFAULT FALSE,
  sym_osteoporosis_risk           BOOLEAN DEFAULT FALSE,
  sym_gynaecomastia               BOOLEAN DEFAULT FALSE,

  -- Current treatment
  on_treatment                    BOOLEAN DEFAULT FALSE,
  current_treatment_type          hyper_treatment_type,

  -- ATD details
  atd_drug                        atd_drug_name,
  atd_dose_mg                     NUMERIC(6,2),
  atd_frequency                   VARCHAR(50),
  atd_start_date                  DATE,
  atd_end_date                    DATE,
  atd_compliance                  VARCHAR(20),
  atd_side_effects                TEXT,
  atd_agranulocytosis_history     BOOLEAN DEFAULT FALSE,
  atd_block_replace               BOOLEAN DEFAULT FALSE,

  -- Beta blocker
  on_beta_blocker                 BOOLEAN DEFAULT FALSE,
  beta_blocker_name               VARCHAR(100),
  beta_blocker_dose               VARCHAR(50),

  -- RAI history summary
  rai_received                    BOOLEAN DEFAULT FALSE,
  rai_dose_mci                    NUMERIC(6,2),
  rai_date                        DATE,
  rai_outcome                     rai_outcome,
  rai_developed_hypothyroidism    BOOLEAN DEFAULT FALSE,

  -- RAI uptake / thyroid scan
  rai_uptake_done                 BOOLEAN DEFAULT FALSE,
  rai_uptake_percent_2h           NUMERIC(5,2),
  rai_uptake_percent_24h          NUMERIC(5,2),
  rai_uptake_date                 DATE,
  thyroid_scan_done               BOOLEAN DEFAULT FALSE,
  thyroid_scan_findings           TEXT,
  thyroid_scan_date               DATE,

  -- Monitoring
  tsh_target                      VARCHAR(50),
  planned_treatment_duration      VARCHAR(50),
  review_frequency                VARCHAR(30),
  next_review_date                DATE,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hyper_q_episode ON hyper_questionnaire(episode_id);

-- Hyperthyroidism ATD treatment history
CREATE TABLE hyper_atd_history (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id            UUID NOT NULL REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  drug                  atd_drug_name NOT NULL,
  dose_mg               NUMERIC(6,2),
  frequency             VARCHAR(50),
  start_date            DATE,
  end_date              DATE,
  reason_stopped        TEXT,
  side_effects          TEXT,
  agranulocytosis       BOOLEAN DEFAULT FALSE,
  hepatotoxicity        BOOLEAN DEFAULT FALSE,
  tsh_at_start          NUMERIC(8,4),
  ft4_at_start          NUMERIC(8,4),
  tsh_at_end            NUMERIC(8,4),
  ft4_at_end            NUMERIC(8,4),
  achieved_remission    BOOLEAN,
  notes                 TEXT,
  recorded_by_doctor_id UUID REFERENCES doctors(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hyper_atd_episode ON hyper_atd_history(episode_id);

-- Hyperthyroidism RAI treatment history
CREATE TABLE hyper_rai_history (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id                UUID NOT NULL REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id                UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  dose_mci                  NUMERIC(6,2) NOT NULL,
  administration_date       DATE NOT NULL,
  indication                TEXT,
  pre_rai_tsh               NUMERIC(8,4),
  pre_rai_ft4               NUMERIC(8,4),
  pre_rai_trab              NUMERIC(8,4),
  post_rai_tsh_value        NUMERIC(8,4),
  post_rai_tsh_date         DATE,
  outcome                   rai_outcome,
  developed_hypothyroidism  BOOLEAN DEFAULT FALSE,
  hypothyroid_date          DATE,
  complications             TEXT,
  notes                     TEXT,
  recorded_by_doctor_id     UUID REFERENCES doctors(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hyper_rai_episode ON hyper_rai_history(episode_id);

-- Hyperthyroidism surgery history
CREATE TABLE hyper_surgery_history (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id                UUID NOT NULL REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id                UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  surgery_type              tc_surgery_type,
  surgery_date              DATE,
  surgeon_name              TEXT,                   -- PHI-ENCRYPTED
  hospital_name             TEXT,                   -- PHI-ENCRYPTED
  pre_op_tsh                NUMERIC(8,4),
  pre_op_ft4                NUMERIC(8,4),
  histopathology            TEXT,
  complications             TEXT,
  post_op_tsh               NUMERIC(8,4),
  post_op_tsh_date          DATE,
  developed_hypothyroidism  BOOLEAN DEFAULT FALSE,
  notes                     TEXT,
  recorded_by_doctor_id     UUID REFERENCES doctors(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hyper_surg_episode ON hyper_surgery_history(episode_id);

-- ============================================================
-- SECTION 6 — THYROID CANCER QUESTIONNAIRE
-- ============================================================

CREATE TABLE tc_questionnaire (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id                      UUID NOT NULL UNIQUE REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id                      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Cancer characterisation
  cancer_type                     tc_cancer_type,
  laterality                      VARCHAR(20),        -- left/right/bilateral/isthmus
  multifocal                      BOOLEAN DEFAULT FALSE,
  multifocal_count                INTEGER,
  tumour_size_mm                  NUMERIC(5,1),
  extrathyroidal_extension        BOOLEAN DEFAULT FALSE,
  extrathyroidal_extent           VARCHAR(30),        -- minimal/gross

  -- TNM Staging
  t_stage                         tc_t_stage,
  n_stage                         tc_n_stage,
  m_stage                         tc_m_stage,
  overall_stage                   tc_overall_stage,
  risk_category                   tc_risk_category,

  -- FNAC / Biopsy
  fnac_done                       BOOLEAN DEFAULT FALSE,
  fnac_date                       DATE,
  fnac_result                     VARCHAR(50),        -- Bethesda I-VI
  fnac_details                    TEXT,
  core_biopsy_done                BOOLEAN DEFAULT FALSE,
  core_biopsy_date                DATE,
  core_biopsy_result              TEXT,
  histopathology_report           TEXT,
  histopathology_date             DATE,

  -- Cancer-specific symptoms
  sym_rapidly_growing_nodule      BOOLEAN DEFAULT FALSE,
  sym_hard_fixed_nodule           BOOLEAN DEFAULT FALSE,
  sym_cervical_lymphadenopathy    BOOLEAN DEFAULT FALSE,
  sym_hoarseness                  BOOLEAN DEFAULT FALSE,
  sym_dysphagia                   severity_level DEFAULT 'none',
  sym_stridor                     BOOLEAN DEFAULT FALSE,
  sym_bone_pain                   BOOLEAN DEFAULT FALSE,
  sym_haemoptysis                 BOOLEAN DEFAULT FALSE,

  -- Medullary cancer (MTC) specific
  mtc_calcitonin_elevated         BOOLEAN DEFAULT FALSE,
  mtc_cea_elevated                BOOLEAN DEFAULT FALSE,
  mtc_ret_mutation                BOOLEAN DEFAULT FALSE,
  mtc_ret_mutation_details        TEXT,
  mtc_family_screening_advised    BOOLEAN DEFAULT FALSE,
  mtc_men2_associated             BOOLEAN DEFAULT FALSE,
  mtc_men2_type                   VARCHAR(10),        -- MEN2A/MEN2B

  -- Biochemistry at diagnosis
  tsh_at_diagnosis                NUMERIC(8,4),
  tg_at_diagnosis                 NUMERIC(10,4),
  anti_tg_at_diagnosis            NUMERIC(10,4),
  calcitonin_at_diagnosis         NUMERIC(10,4),
  cea_at_diagnosis                NUMERIC(10,4),
  sr_calcium_at_diagnosis         NUMERIC(6,3),
  vit_d3_at_diagnosis             NUMERIC(8,2),
  pth_at_diagnosis                NUMERIC(8,2),

  -- Treatment status flags
  surgery_done                    BOOLEAN DEFAULT FALSE,
  rai_therapy_done                BOOLEAN DEFAULT FALSE,
  on_tsh_suppression              BOOLEAN DEFAULT FALSE,
  on_external_beam_rt             BOOLEAN DEFAULT FALSE,
  on_targeted_therapy             BOOLEAN DEFAULT FALSE,
  on_chemotherapy                 BOOLEAN DEFAULT FALSE,
  on_active_surveillance          BOOLEAN DEFAULT FALSE,

  -- TSH suppression
  tsh_suppression_target          VARCHAR(50),
  tsh_suppression_indication      TEXT,
  levothyroxine_dose_mcg          NUMERIC(6,2),
  levothyroxine_brand             VARCHAR(100),
  levothyroxine_compliance        VARCHAR(20),

  -- Surveillance plan
  surveillance_interval           tc_surveillance_interval,
  next_tg_date                    DATE,
  next_usg_date                   DATE,
  next_rai_scan_date              DATE,
  next_review_date                DATE,
  surveillance_notes              TEXT,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tc_q_episode ON tc_questionnaire(episode_id);

-- Thyroid cancer surgery history
CREATE TABLE tc_surgery_history (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id                  UUID NOT NULL REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id                  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  surgery_type                tc_surgery_type NOT NULL,
  surgery_date                DATE NOT NULL,
  surgeon_name                TEXT,                   -- PHI-ENCRYPTED
  hospital_name               TEXT,                   -- PHI-ENCRYPTED
  tumour_size_mm              NUMERIC(5,1),
  margins                     VARCHAR(20),            -- clear/close/positive
  lymph_nodes_removed         INTEGER,
  lymph_nodes_positive        INTEGER,
  capsular_invasion           BOOLEAN DEFAULT FALSE,
  vascular_invasion           BOOLEAN DEFAULT FALSE,
  perineural_invasion         BOOLEAN DEFAULT FALSE,
  extrathyroidal_extension    BOOLEAN DEFAULT FALSE,
  final_t_stage               tc_t_stage,
  final_n_stage               tc_n_stage,
  final_m_stage               tc_m_stage,
  final_overall_stage         tc_overall_stage,
  histopathology_details      TEXT,
  complications               TEXT,
  post_op_calcium             NUMERIC(6,3),
  post_op_pth                 NUMERIC(8,2),
  hypoparathyroidism          BOOLEAN DEFAULT FALSE,
  rln_injury                  BOOLEAN DEFAULT FALSE,
  notes                       TEXT,
  recorded_by_doctor_id       UUID REFERENCES doctors(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tc_surg_episode ON tc_surgery_history(episode_id);

-- Thyroid cancer RAI therapy history (multiple rounds)
CREATE TABLE tc_rai_history (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id                  UUID NOT NULL REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id                  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  round_number                INTEGER NOT NULL DEFAULT 1,
  dose_mci                    NUMERIC(8,2) NOT NULL,
  administration_date         DATE NOT NULL,
  indication                  TEXT,
  pre_rai_tsh                 NUMERIC(8,4),
  pre_rai_tg                  NUMERIC(10,4),
  pre_rai_anti_tg             NUMERIC(10,4),
  stimulation_method          VARCHAR(30),            -- thyroid_hormone_withdrawal/rhTSH
  whole_body_scan_done        BOOLEAN DEFAULT FALSE,
  whole_body_scan_findings    TEXT,
  whole_body_scan_date        DATE,
  post_rai_tg                 NUMERIC(10,4),
  post_rai_tg_date            DATE,
  response                    tc_rai_response,
  complications               TEXT,
  notes                       TEXT,
  recorded_by_doctor_id       UUID REFERENCES doctors(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tc_rai_episode ON tc_rai_history(episode_id);
CREATE INDEX idx_tc_rai_patient ON tc_rai_history(patient_id);

-- Thyroid cancer systemic treatment
CREATE TABLE tc_systemic_treatment (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id            UUID NOT NULL REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  treatment_type        VARCHAR(50) NOT NULL,     -- targeted_therapy/chemotherapy/ebrt/immunotherapy
  drug_name             VARCHAR(200),
  dose                  VARCHAR(100),
  frequency             VARCHAR(100),
  start_date            DATE,
  end_date              DATE,
  indication            TEXT,
  response              VARCHAR(50),              -- CR/PR/SD/PD
  side_effects          TEXT,
  reason_stopped        TEXT,
  notes                 TEXT,
  recorded_by_doctor_id UUID REFERENCES doctors(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tc_systx_episode ON tc_systemic_treatment(episode_id);

-- ============================================================
-- SECTION 7 — SCAN REPORTS
-- All imaging across all conditions in one table.
-- ============================================================

CREATE TABLE scan_reports (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id              UUID NOT NULL REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
  patient_id              UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  document_id             UUID REFERENCES documents(id),  -- link to uploaded file
  scan_type               scan_type NOT NULL,
  scan_date               DATE NOT NULL,
  reporting_centre        VARCHAR(200),
  radiologist_name        TEXT,                   -- PHI-ENCRYPTED
  ai_extracted            BOOLEAN DEFAULT FALSE,
  findings                TEXT,                   -- PHI-ENCRYPTED
  impression              TEXT,                   -- PHI-ENCRYPTED
  doctor_notes            TEXT,                   -- PHI-ENCRYPTED
  tirads_score            VARCHAR(10),            -- TI-RADS 1-5 for USG thyroid
  nodule_size_mm          NUMERIC(5,1),
  nodule_count            INTEGER,
  lymph_node_involvement  BOOLEAN,
  uploaded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scan_episode ON scan_reports(episode_id);
CREATE INDEX idx_scan_patient ON scan_reports(patient_id);
CREATE INDEX idx_scan_type    ON scan_reports(scan_type);
CREATE INDEX idx_scan_date    ON scan_reports(scan_date);

-- ============================================================
-- SECTION 8 — EXTEND EXISTING TABLES
-- ============================================================

-- Link consultations to a condition episode
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS episode_id  UUID REFERENCES patient_condition_episodes(id),
  ADD COLUMN IF NOT EXISTS condition   condition_type;

CREATE INDEX IF NOT EXISTS idx_consult_episode   ON consultations(episode_id);
CREATE INDEX IF NOT EXISTS idx_consult_condition ON consultations(condition);

-- Add language preference to patients (from Session 3 i18n work)
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS language_preference VARCHAR(5) NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'patients' AND constraint_name = 'chk_language_preference'
  ) THEN
    ALTER TABLE patients
      ADD CONSTRAINT chk_language_preference
      CHECK (language_preference IN ('en','hi','mr','ta','te','kn','ml','bn','gu','pa','or'));
  END IF;
END;
$$;

-- Extend lab_parameters (already created manually — safe with IF NOT EXISTS)
ALTER TABLE lab_parameters
  ADD COLUMN IF NOT EXISTS applicable_conditions TEXT[] DEFAULT ARRAY['hypothyroidism'],
  ADD COLUMN IF NOT EXISTS display_order         INTEGER DEFAULT 99,
  ADD COLUMN IF NOT EXISTS graph_eligible        BOOLEAN DEFAULT TRUE;

-- Insert new lab parameters
INSERT INTO lab_parameters (name, short_name, unit, normal_min, normal_max, applicable_conditions, display_order, graph_eligible)
VALUES
  ('Thyroid Receptor Antibody', 'TRAb',       'IU/L',   0,    1.75, ARRAY['hyperthyroidism'],                              1,  TRUE),
  ('Anti-TPO Antibody',         'Anti-TPO',   'IU/mL',  0,    34,   ARRAY['hypothyroidism','hyperthyroidism'],              5,  TRUE),
  ('Anti-Thyroglobulin Ab',     'Anti-Tg',    'IU/mL',  0,    115,  ARRAY['hypothyroidism','hyperthyroidism','thyroid_cancer'], 6, TRUE),
  ('Thyroglobulin',             'Tg',         'ng/mL',  1.4,  78,   ARRAY['thyroid_cancer'],                               2,  TRUE),
  ('Serum Calcium',             'Sr. Ca',     'mg/dL',  8.5,  10.5, ARRAY['thyroid_cancer'],                               7,  TRUE),
  ('Vitamin D3 (25-OH)',        'Vit D3',     'ng/mL',  30,   100,  ARRAY['thyroid_cancer','hypothyroidism'],               8,  TRUE),
  ('Parathyroid Hormone',       'PTH',        'pg/mL',  15,   65,   ARRAY['thyroid_cancer'],                               9,  TRUE),
  ('Calcitonin',                'Calcitonin', 'pg/mL',  0,    10,   ARRAY['thyroid_cancer'],                               10, TRUE),
  ('Carcinoembryonic Antigen',  'CEA',        'ng/mL',  0,    5,    ARRAY['thyroid_cancer'],                               11, TRUE)
ON CONFLICT (short_name) DO UPDATE
  SET applicable_conditions = EXCLUDED.applicable_conditions,
      display_order         = EXCLUDED.display_order;

-- ============================================================
-- SECTION 9 — UPDATED_AT TRIGGERS
-- Reuse existing function from 001_schema.sql
-- ============================================================

CREATE TRIGGER trg_updated_at_pce
  BEFORE UPDATE ON patient_condition_episodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at_pcs
  BEFORE UPDATE ON patient_condition_selection
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at_core_q
  BEFORE UPDATE ON core_questionnaire
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at_hypo_q
  BEFORE UPDATE ON hypo_questionnaire
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at_hyper_q
  BEFORE UPDATE ON hyper_questionnaire
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at_tc_q
  BEFORE UPDATE ON tc_questionnaire
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at_scan
  BEFORE UPDATE ON scan_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SECTION 10 — DOCTOR PORTAL SUMMARY VIEW
-- ============================================================

CREATE OR REPLACE VIEW v_patient_condition_summary AS
SELECT
  pce.id                    AS episode_id,
  pce.patient_id,
  pce.condition,
  pce.status                AS episode_status,
  pce.diagnosis_date,
  pce.questionnaire_status,
  pce.primary_doctor_id,
  hq.cause                  AS hypo_cause,
  hq.on_treatment           AS hypo_on_treatment,
  hq.levo_dose_mcg,
  hrq.cause                 AS hyper_cause,
  hrq.graves_confirmed,
  hrq.current_treatment_type AS hyper_treatment,
  hrq.atd_drug,
  hrq.rai_received,
  tcq.cancer_type,
  tcq.overall_stage,
  tcq.risk_category,
  tcq.surgery_done,
  tcq.rai_therapy_done,
  tcq.on_tsh_suppression,
  tcq.tsh_suppression_target,
  tcq.surveillance_interval,
  tcq.next_review_date
FROM patient_condition_episodes pce
LEFT JOIN hypo_questionnaire  hq  ON hq.episode_id  = pce.id AND pce.condition = 'hypothyroidism'
LEFT JOIN hyper_questionnaire hrq ON hrq.episode_id = pce.id AND pce.condition = 'hyperthyroidism'
LEFT JOIN tc_questionnaire    tcq ON tcq.episode_id = pce.id AND pce.condition = 'thyroid_cancer';

-- ============================================================
-- VERIFY — run this to confirm all tables were created
-- ============================================================
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'patient_condition_episodes',
    'patient_condition_selection',
    'core_questionnaire',
    'hypo_questionnaire',
    'hypo_treatment_history',
    'hyper_questionnaire',
    'hyper_atd_history',
    'hyper_rai_history',
    'hyper_surgery_history',
    'tc_questionnaire',
    'tc_surgery_history',
    'tc_rai_history',
    'tc_systemic_treatment',
    'scan_reports'
  )
ORDER BY table_name;
