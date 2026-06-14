-- ============================================================
-- Migration 004 — Extended Hyperthyroidism Questionnaire
-- Run in pgAdmin on the thyroconsult database
-- Run AFTER 002_multi_condition_schema.sql and 003_hypo_questionnaire_extended.sql
-- ============================================================

ALTER TABLE hyper_questionnaire

  -- ── Module A / B carry-over (demographics stored on patients table;
  --    only condition-specific overrides stored here)

  -- ── Module C — Thyroid disease & medication history ──────────────
  -- C1
  ADD COLUMN IF NOT EXISTS thyroid_dx_status          VARCHAR(10),   -- no/unsure/yes
  ADD COLUMN IF NOT EXISTS thyroid_dx_type            VARCHAR(50),
  ADD COLUMN IF NOT EXISTS thyroid_dx_year            INTEGER,

  -- C2a — surgery
  ADD COLUMN IF NOT EXISTS thyroid_surgery_status     VARCHAR(10),
  ADD COLUMN IF NOT EXISTS thyroid_surgery_type       VARCHAR(50),   -- total/hemi/isthmusectomy/other
  ADD COLUMN IF NOT EXISTS thyroid_surgery_side       VARCHAR(10),   -- right/left (hemi only)
  ADD COLUMN IF NOT EXISTS thyroid_surgery_date       DATE,

  -- C2b — RAI history
  ADD COLUMN IF NOT EXISTS rai_count                  INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rai_courses                JSONB,         -- [{dose_mci, date}] ordered earliest first
  ADD COLUMN IF NOT EXISTS rai_post_hypothyroid       VARCHAR(10),   -- no/unsure/yes

  -- C3 — current ATD medication (replaces old atd_* flat columns for patient-facing data)
  ADD COLUMN IF NOT EXISTS med_status                 VARCHAR(10),   -- no/unsure/yes
  ADD COLUMN IF NOT EXISTS med_drug_name              VARCHAR(100),
  ADD COLUMN IF NOT EXISTS med_brand_name             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS med_dose_mg                NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS med_tablets_at_a_time      INTEGER,
  ADD COLUMN IF NOT EXISTS med_times_per_day          INTEGER,
  ADD COLUMN IF NOT EXISTS med_timing                 JSONB,         -- [{dose_number, timing_label}]
  ADD COLUMN IF NOT EXISTS med_compliance             VARCHAR(20),   -- regular/irregular/skips_sometimes
  ADD COLUMN IF NOT EXISTS med_since_date             DATE,
  ADD COLUMN IF NOT EXISTS med_since_months           INTEGER,

  -- C4 — family history
  ADD COLUMN IF NOT EXISTS family_thyroid_status      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS family_thyroid_data        JSONB,         -- [{relation, condition}]

  -- C5 — autoimmune
  ADD COLUMN IF NOT EXISTS autoimmune_status          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS autoimmune_data            JSONB,         -- [{condition, since_months}]

  -- ── Module D — Laboratory capture ────────────────────────────────
  -- D1 TSH
  ADD COLUMN IF NOT EXISTS tsh_status                 VARCHAR(10),
  ADD COLUMN IF NOT EXISTS tsh_value                  NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS tsh_date                   DATE,
  ADD COLUMN IF NOT EXISTS tsh_ref_low                NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS tsh_ref_high               NUMERIC(8,4),

  -- D2 FT4
  ADD COLUMN IF NOT EXISTS ft4_status                 VARCHAR(10),
  ADD COLUMN IF NOT EXISTS ft4_value                  NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS ft4_unit                   VARCHAR(10),   -- pmol/L or ng/dL
  ADD COLUMN IF NOT EXISTS ft4_date                   DATE,
  ADD COLUMN IF NOT EXISTS ft4_ref_low                NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS ft4_ref_high               NUMERIC(8,4),

  -- D3 FT3
  ADD COLUMN IF NOT EXISTS ft3_status                 VARCHAR(10),
  ADD COLUMN IF NOT EXISTS ft3_value                  NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS ft3_unit                   VARCHAR(10),   -- pmol/L or pg/mL
  ADD COLUMN IF NOT EXISTS ft3_date                   DATE,
  ADD COLUMN IF NOT EXISTS ft3_ref_low                NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS ft3_ref_high               NUMERIC(8,4),

  -- D4 TRAb / TSI
  ADD COLUMN IF NOT EXISTS trab_status                VARCHAR(10),
  ADD COLUMN IF NOT EXISTS trab_value_d4              NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS trab_date_d4               DATE,
  ADD COLUMN IF NOT EXISTS tsi_status                 VARCHAR(10),
  ADD COLUMN IF NOT EXISTS tsi_value                  NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS tsi_unit                   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tsi_date                   DATE,

  -- D5 Anti-TPO / Anti-Tg
  ADD COLUMN IF NOT EXISTS antibody_status            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS antitpo_value              NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS antitpo_unit               VARCHAR(20),
  ADD COLUMN IF NOT EXISTS antitpo_date               DATE,
  ADD COLUMN IF NOT EXISTS antitg_value               NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS antitg_unit                VARCHAR(20),
  ADD COLUMN IF NOT EXISTS antitg_date                DATE,

  -- D6 Imaging
  ADD COLUMN IF NOT EXISTS imaging_status             VARCHAR(10),
  ADD COLUMN IF NOT EXISTS imaging_types              TEXT[],
  ADD COLUMN IF NOT EXISTS imaging_date               DATE,
  ADD COLUMN IF NOT EXISTS imaging_finding            TEXT,

  -- ── Module E — Hyperthyroidism specific ──────────────────────────
  -- E1 — cause (extends existing cause column)
  ADD COLUMN IF NOT EXISTS hyper_cause_known          VARCHAR(10),   -- no/unsure/yes
  ADD COLUMN IF NOT EXISTS hyper_cause_type           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hyper_cause_since_date     DATE,
  ADD COLUMN IF NOT EXISTS hyper_cause_since_months   INTEGER,

  -- E2 — Graves' disease
  ADD COLUMN IF NOT EXISTS trab_positive              VARCHAR(10),   -- yes/no/not_tested
  ADD COLUMN IF NOT EXISTS ophthal_status             VARCHAR(10),
  ADD COLUMN IF NOT EXISTS ophthal_findings           TEXT[],
  ADD COLUMN IF NOT EXISTS ophthal_since_date         DATE,
  ADD COLUMN IF NOT EXISTS ophthal_since_months       INTEGER,
  ADD COLUMN IF NOT EXISTS ophthal_assessed           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dermopathy_status          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS dermopathy_since_months    INTEGER,
  ADD COLUMN IF NOT EXISTS acropathy_status           VARCHAR(10),

  -- E3 — Toxic nodule / MNG
  ADD COLUMN IF NOT EXISTS toxic_nodule_type          VARCHAR(30),   -- aftn/toxic_mng
  ADD COLUMN IF NOT EXISTS e3_fnac_status             VARCHAR(10),
  ADD COLUMN IF NOT EXISTS e3_fnac_date               DATE,
  ADD COLUMN IF NOT EXISTS e3_fnac_result             VARCHAR(30),
  ADD COLUMN IF NOT EXISTS e3_nodule_size_cm          NUMERIC(4,1),

  -- E4 — Goitre
  ADD COLUMN IF NOT EXISTS goitre_size_label          VARCHAR(10),   -- small/medium/large/unsure
  ADD COLUMN IF NOT EXISTS goitre_since_date          DATE,
  ADD COLUMN IF NOT EXISTS goitre_since_months        INTEGER,
  ADD COLUMN IF NOT EXISTS goitre_pressure_status     VARCHAR(10),
  ADD COLUMN IF NOT EXISTS goitre_pressure_types      TEXT[],

  -- E5 — FNAC (standalone, not from E3)
  ADD COLUMN IF NOT EXISTS fnac_status                VARCHAR(10),
  ADD COLUMN IF NOT EXISTS fnac_date                  DATE,
  ADD COLUMN IF NOT EXISTS fnac_result                VARCHAR(30),

  -- ── Module F — Symptoms ──────────────────────────────────────────
  -- F1 Fatigue
  ADD COLUMN IF NOT EXISTS sym_fatigue_status         VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_fatigue_since_date     DATE,
  ADD COLUMN IF NOT EXISTS sym_fatigue_months         INTEGER,
  ADD COLUMN IF NOT EXISTS sym_fatigue_severity       VARCHAR(10),   -- mild/moderate/severe

  -- F2 Weight
  ADD COLUMN IF NOT EXISTS sym_weight_status          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_weight_direction       VARCHAR(10),   -- gained/lost
  ADD COLUMN IF NOT EXISTS sym_weight_kg              NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sym_weight_since_date      DATE,
  ADD COLUMN IF NOT EXISTS sym_weight_months          INTEGER,

  -- F3 Appetite
  ADD COLUMN IF NOT EXISTS sym_appetite_status        VARCHAR(20),   -- no_change/decreased/increased

  -- F4 Heat intolerance
  ADD COLUMN IF NOT EXISTS sym_heat_status            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_heat_since_date        DATE,
  ADD COLUMN IF NOT EXISTS sym_heat_months            INTEGER,
  ADD COLUMN IF NOT EXISTS sym_heat_impact            BOOLEAN DEFAULT FALSE,

  -- F5 Sweating
  ADD COLUMN IF NOT EXISTS sym_sweating_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_sweating_pattern       VARCHAR(20),   -- generalised/night/both
  ADD COLUMN IF NOT EXISTS sym_sweating_since_date    DATE,
  ADD COLUMN IF NOT EXISTS sym_sweating_months        INTEGER,

  -- F6 Bowel
  ADD COLUMN IF NOT EXISTS sym_bowel_status           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_bowel_type             VARCHAR(30),
  ADD COLUMN IF NOT EXISTS sym_bowel_since_date       DATE,
  ADD COLUMN IF NOT EXISTS sym_bowel_months           INTEGER,

  -- F7 Skin
  ADD COLUMN IF NOT EXISTS sym_skin_status            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_skin_types             TEXT[],
  ADD COLUMN IF NOT EXISTS sym_skin_since_date        DATE,
  ADD COLUMN IF NOT EXISTS sym_skin_months            INTEGER,

  -- F8a Periorbital
  ADD COLUMN IF NOT EXISTS sym_periorbital_status     VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_periorbital_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_periorbital_months     INTEGER,
  ADD COLUMN IF NOT EXISTS sym_periorbital_features   TEXT[],

  -- F8b Facial swelling
  ADD COLUMN IF NOT EXISTS sym_facial_status          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_facial_since_date      DATE,
  ADD COLUMN IF NOT EXISTS sym_facial_months          INTEGER,

  -- F9 Pedal oedema
  ADD COLUMN IF NOT EXISTS sym_pedal_status           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_pedal_type             VARCHAR(20),   -- pitting/non_pitting/unsure
  ADD COLUMN IF NOT EXISTS sym_pedal_since_date       DATE,
  ADD COLUMN IF NOT EXISTS sym_pedal_months           INTEGER,

  -- F10 Hair
  ADD COLUMN IF NOT EXISTS sym_hair_status            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_hair_data              JSONB,         -- [{type, since_date, months}]

  -- F11 Nails
  ADD COLUMN IF NOT EXISTS sym_nail_status            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_nail_data              JSONB,         -- [{type, since_date, months}]

  -- F12 Hoarseness
  ADD COLUMN IF NOT EXISTS sym_hoarseness_status      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_hoarseness_pattern     VARCHAR(15),   -- constant/intermittent
  ADD COLUMN IF NOT EXISTS sym_hoarseness_since_date  DATE,
  ADD COLUMN IF NOT EXISTS sym_hoarseness_months      INTEGER,

  -- F13 Muscle weakness (thyrotoxic myopathy)
  ADD COLUMN IF NOT EXISTS sym_myopathy_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_myopathy_location      VARCHAR(20),   -- proximal/generalised
  ADD COLUMN IF NOT EXISTS sym_myopathy_since_date    DATE,
  ADD COLUMN IF NOT EXISTS sym_myopathy_months        INTEGER,

  -- F14 Muscle cramps
  ADD COLUMN IF NOT EXISTS sym_cramp_status           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_cramp_since_date       DATE,
  ADD COLUMN IF NOT EXISTS sym_cramp_months           INTEGER,

  -- F15 Tremor
  ADD COLUMN IF NOT EXISTS sym_tremor_type_val        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS sym_tremor_triggers        TEXT[],
  ADD COLUMN IF NOT EXISTS sym_tremor_since_date      DATE,
  ADD COLUMN IF NOT EXISTS sym_tremor_months          INTEGER,

  -- F16 Anxiety
  ADD COLUMN IF NOT EXISTS sym_anxiety_status         VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_anxiety_seen_doctor    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sym_anxiety_diagnosed      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sym_anxiety_since_date     DATE,
  ADD COLUMN IF NOT EXISTS sym_anxiety_months         INTEGER,

  -- F17 Irritability
  ADD COLUMN IF NOT EXISTS sym_irritability_status    VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_irritability_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_irritability_months    INTEGER,

  -- F18 Insomnia
  ADD COLUMN IF NOT EXISTS sym_insomnia_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_insomnia_types         TEXT[],
  ADD COLUMN IF NOT EXISTS sym_insomnia_since_date    DATE,
  ADD COLUMN IF NOT EXISTS sym_insomnia_months        INTEGER,

  -- F19 Palpitations
  ADD COLUMN IF NOT EXISTS sym_palp_status            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_palp_pattern           VARCHAR(20),   -- constant/intermittent/exertion
  ADD COLUMN IF NOT EXISTS sym_palp_rate_bpm          INTEGER,
  ADD COLUMN IF NOT EXISTS sym_palp_since_date        DATE,
  ADD COLUMN IF NOT EXISTS sym_palp_months            INTEGER,
  ADD COLUMN IF NOT EXISTS sym_palp_assoc             TEXT[],

  -- F20 Atrial fibrillation
  ADD COLUMN IF NOT EXISTS sym_af_status              VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_af_confirmed           VARCHAR(15),   -- yes/no/not_known
  ADD COLUMN IF NOT EXISTS sym_af_since_date          DATE,
  ADD COLUMN IF NOT EXISTS sym_af_months              INTEGER,
  ADD COLUMN IF NOT EXISTS sym_af_on_med              VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_af_med_data            JSONB,         -- [{name, dose_mg, freq_per_day}]

  -- F21 Postural giddiness
  ADD COLUMN IF NOT EXISTS sym_giddiness_status       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_giddiness_freq         VARCHAR(20),   -- rarely/sometimes/often/every_time
  ADD COLUMN IF NOT EXISTS sym_giddiness_since_date   DATE,
  ADD COLUMN IF NOT EXISTS sym_giddiness_months       INTEGER,

  -- F22 Blackout
  ADD COLUMN IF NOT EXISTS sym_blackout_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_blackout_count         INTEGER,
  ADD COLUMN IF NOT EXISTS sym_blackout_last_date     DATE,
  ADD COLUMN IF NOT EXISTS sym_blackout_assessed      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sym_blackout_dx            TEXT,

  -- F23 Dyspnoea
  ADD COLUMN IF NOT EXISTS sym_dyspnoea_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_dyspnoea_onset         VARCHAR(20),   -- rest/exertion/orthopnoea
  ADD COLUMN IF NOT EXISTS sym_dyspnoea_since_date    DATE,
  ADD COLUMN IF NOT EXISTS sym_dyspnoea_months        INTEGER,

  -- F24 Concentration
  ADD COLUMN IF NOT EXISTS sym_concentration_status   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_concentration_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_concentration_months   INTEGER,
  ADD COLUMN IF NOT EXISTS sym_concentration_impact   BOOLEAN DEFAULT FALSE,

  -- F25 Memory
  ADD COLUMN IF NOT EXISTS sym_memory_status          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_memory_since_date      DATE,
  ADD COLUMN IF NOT EXISTS sym_memory_months          INTEGER,
  ADD COLUMN IF NOT EXISTS sym_memory_impact          BOOLEAN DEFAULT FALSE,

  -- ── Module G — Treatment & monitoring ───────────────────────────
  -- G2 — definitive treatment plan
  ADD COLUMN IF NOT EXISTS definitive_tx_status       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS definitive_tx_type         VARCHAR(20),   -- rai/surgery/not_decided
  ADD COLUMN IF NOT EXISTS definitive_tx_date         DATE,

  -- G3 — dose change (removed from C3, dedicated screen)
  ADD COLUMN IF NOT EXISTS dose_changed_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS dose_changed_date          DATE,
  ADD COLUMN IF NOT EXISTS dose_change_direction      VARCHAR(10),   -- increased/reduced
  ADD COLUMN IF NOT EXISTS dose_changed_reason        VARCHAR(50),

  -- G4 — beta blocker (extends existing on_beta_blocker column)
  ADD COLUMN IF NOT EXISTS beta_blocker_freq          VARCHAR(20),   -- once/twice/three_times/as_needed
  ADD COLUMN IF NOT EXISTS beta_blocker_since_date    DATE,
  ADD COLUMN IF NOT EXISTS beta_blocker_since_months  INTEGER,

  -- G5 — monitoring (NEW)
  ADD COLUMN IF NOT EXISTS monitoring_status          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS review_frequency_val       VARCHAR(30),
  ADD COLUMN IF NOT EXISTS next_review_date_val       DATE,

  -- ── Module H — Comorbidities ─────────────────────────────────────
  -- H1 Dyslipidaemia
  ADD COLUMN IF NOT EXISTS dyslipidaemia_status       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS dyslipidaemia_since_months INTEGER,
  ADD COLUMN IF NOT EXISTS dyslipidaemia_on_med       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS dyslipidaemia_med_data     JSONB,         -- [{name, dose_mg, freq_per_day, since_months}]

  -- H2 Diabetes
  ADD COLUMN IF NOT EXISTS diabetes_status            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS diabetes_type              VARCHAR(20),   -- type1/type2/pre/not_specified
  ADD COLUMN IF NOT EXISTS diabetes_since_months      INTEGER,
  ADD COLUMN IF NOT EXISTS diabetes_on_med            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS diabetes_med_data          JSONB,         -- [{name, dose_mg, freq_per_day}]

  -- H3 Anaemia
  ADD COLUMN IF NOT EXISTS anaemia_status             VARCHAR(10),
  ADD COLUMN IF NOT EXISTS anaemia_types              TEXT[],
  ADD COLUMN IF NOT EXISTS anaemia_on_med             VARCHAR(10),
  ADD COLUMN IF NOT EXISTS anaemia_med_data           JSONB,         -- [{name, freq_per_day, since_months}]

  -- H4 PCOS/PMOS
  ADD COLUMN IF NOT EXISTS pcos_status                VARCHAR(10),
  ADD COLUMN IF NOT EXISTS pcos_label                 VARCHAR(10),   -- pcos/pmos
  ADD COLUMN IF NOT EXISTS pcos_since_months          INTEGER,
  ADD COLUMN IF NOT EXISTS pcos_on_med                VARCHAR(10),
  ADD COLUMN IF NOT EXISTS pcos_med_data              JSONB,         -- [{name, dose_mg, times_per_day}]

  -- H5 Infertility
  ADD COLUMN IF NOT EXISTS infertility_status         VARCHAR(10),

  -- H6 Depression
  ADD COLUMN IF NOT EXISTS depression_diagnosed       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS depression_on_med          BOOLEAN DEFAULT FALSE,

  -- H8 Osteoporosis
  ADD COLUMN IF NOT EXISTS osteoporosis_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS osteoporosis_dexa          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS osteoporosis_on_med        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS osteoporosis_med_data      JSONB,         -- [{name, freq_per_day, since_months}]

  -- H9 Additional notes
  ADD COLUMN IF NOT EXISTS additional_notes           TEXT;

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE hyper_questionnaire TO thyroconsult_user;
