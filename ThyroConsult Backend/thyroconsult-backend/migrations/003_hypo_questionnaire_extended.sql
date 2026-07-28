-- ============================================================
-- Migration 003 — Extended Hypothyroidism Questionnaire
-- Run in pgAdmin on the thyroconsult database
-- ============================================================

-- ── Extend hypo_questionnaire with all new approved fields ──

ALTER TABLE hypo_questionnaire

  -- Cause & duration
  ADD COLUMN IF NOT EXISTS hypo_cause_known         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hypo_duration_date       DATE,
  ADD COLUMN IF NOT EXISTS hypo_duration_years      INTEGER,
  ADD COLUMN IF NOT EXISTS hypo_duration_months     INTEGER,
  ADD COLUMN IF NOT EXISTS hypo_duration_days       INTEGER,

  -- Goitre
  ADD COLUMN IF NOT EXISTS goitre_size_value        VARCHAR(20),

  -- Hashimoto's
  ADD COLUMN IF NOT EXISTS hashimotos_anti_tpo      VARCHAR(20),   -- positive/negative/not_tested
  ADD COLUMN IF NOT EXISTS hashimotos_anti_tg       VARCHAR(20),

  -- Symptoms — fatigue
  ADD COLUMN IF NOT EXISTS sym_fatigue_status       VARCHAR(10),   -- no/unsure/yes
  ADD COLUMN IF NOT EXISTS sym_fatigue_since_date   DATE,
  ADD COLUMN IF NOT EXISTS sym_fatigue_years        INTEGER,
  ADD COLUMN IF NOT EXISTS sym_fatigue_months       INTEGER,
  ADD COLUMN IF NOT EXISTS sym_fatigue_days         INTEGER,
  ADD COLUMN IF NOT EXISTS sym_fatigue_severity     VARCHAR(10),   -- mild/moderate/severe

  -- Symptoms — weight
  ADD COLUMN IF NOT EXISTS sym_weight_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_weight_direction     VARCHAR(10),   -- gained/lost
  ADD COLUMN IF NOT EXISTS sym_weight_kg_val        NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sym_weight_since_date    DATE,
  ADD COLUMN IF NOT EXISTS sym_weight_years         INTEGER,
  ADD COLUMN IF NOT EXISTS sym_weight_months        INTEGER,
  ADD COLUMN IF NOT EXISTS sym_weight_days          INTEGER,

  -- Symptoms — appetite
  ADD COLUMN IF NOT EXISTS sym_appetite_status      VARCHAR(20),   -- no_change/decreased/increased

  -- Symptoms — cold intolerance
  ADD COLUMN IF NOT EXISTS sym_cold_status          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_cold_since_date      DATE,
  ADD COLUMN IF NOT EXISTS sym_cold_years           INTEGER,
  ADD COLUMN IF NOT EXISTS sym_cold_months          INTEGER,
  ADD COLUMN IF NOT EXISTS sym_cold_days            INTEGER,
  ADD COLUMN IF NOT EXISTS sym_cold_impact          BOOLEAN DEFAULT FALSE,

  -- Symptoms — bowel
  ADD COLUMN IF NOT EXISTS sym_bowel_status         VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_bowel_type           VARCHAR(30),   -- constipation/diarrhoea/alternating/reduced_frequency
  ADD COLUMN IF NOT EXISTS sym_bowel_since_date     DATE,
  ADD COLUMN IF NOT EXISTS sym_bowel_years          INTEGER,
  ADD COLUMN IF NOT EXISTS sym_bowel_months         INTEGER,
  ADD COLUMN IF NOT EXISTS sym_bowel_days           INTEGER,

  -- Symptoms — abdominal
  ADD COLUMN IF NOT EXISTS sym_abdominal_status     VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_abdominal_types      TEXT[],        -- bloating/fullness/discomfort/nausea
  ADD COLUMN IF NOT EXISTS sym_abdominal_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_abdominal_years      INTEGER,
  ADD COLUMN IF NOT EXISTS sym_abdominal_months     INTEGER,
  ADD COLUMN IF NOT EXISTS sym_abdominal_days       INTEGER,

  -- Symptoms — skin
  ADD COLUMN IF NOT EXISTS sym_skin_status          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_skin_types           TEXT[],        -- dryness/roughness/pallor/puffiness/thickening
  ADD COLUMN IF NOT EXISTS sym_skin_since_date      DATE,
  ADD COLUMN IF NOT EXISTS sym_skin_years           INTEGER,
  ADD COLUMN IF NOT EXISTS sym_skin_months          INTEGER,
  ADD COLUMN IF NOT EXISTS sym_skin_days            INTEGER,

  -- Symptoms — periorbital oedema (F8a)
  ADD COLUMN IF NOT EXISTS sym_periorbital_status   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_periorbital_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_periorbital_years    INTEGER,
  ADD COLUMN IF NOT EXISTS sym_periorbital_months   INTEGER,
  ADD COLUMN IF NOT EXISTS sym_periorbital_days     INTEGER,

  -- Symptoms — facial oedema (F8b)
  ADD COLUMN IF NOT EXISTS sym_facial_oedema_status VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_facial_oedema_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_facial_oedema_years  INTEGER,
  ADD COLUMN IF NOT EXISTS sym_facial_oedema_months INTEGER,
  ADD COLUMN IF NOT EXISTS sym_facial_oedema_days   INTEGER,

  -- Symptoms — pedal oedema
  ADD COLUMN IF NOT EXISTS sym_pedal_oedema_status  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_pedal_oedema_type    VARCHAR(20),   -- pitting/non_pitting/unsure
  ADD COLUMN IF NOT EXISTS sym_pedal_oedema_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_pedal_oedema_years   INTEGER,
  ADD COLUMN IF NOT EXISTS sym_pedal_oedema_months  INTEGER,
  ADD COLUMN IF NOT EXISTS sym_pedal_oedema_days    INTEGER,

  -- Symptoms — hair (each type has its own duration)
  ADD COLUMN IF NOT EXISTS sym_hair_status          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_hair_data            JSONB,         -- [{type, since_date, years, months, days}]

  -- Symptoms — nails (each type has its own duration)
  ADD COLUMN IF NOT EXISTS sym_nail_status          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_nail_data            JSONB,         -- [{type, since_date, years, months, days}]

  -- Symptoms — hoarseness
  ADD COLUMN IF NOT EXISTS sym_hoarseness_status    VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_hoarseness_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_hoarseness_years     INTEGER,
  ADD COLUMN IF NOT EXISTS sym_hoarseness_months    INTEGER,
  ADD COLUMN IF NOT EXISTS sym_hoarseness_days      INTEGER,
  ADD COLUMN IF NOT EXISTS sym_hoarseness_pattern   VARCHAR(15),   -- constant/intermittent

  -- Symptoms — muscle cramps
  ADD COLUMN IF NOT EXISTS sym_cramp_status         VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_cramp_since_date     DATE,
  ADD COLUMN IF NOT EXISTS sym_cramp_years          INTEGER,
  ADD COLUMN IF NOT EXISTS sym_cramp_months         INTEGER,
  ADD COLUMN IF NOT EXISTS sym_cramp_days           INTEGER,

  -- Symptoms — muscle weakness
  ADD COLUMN IF NOT EXISTS sym_weakness_status      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_weakness_location    VARCHAR(20),   -- proximal/generalised
  ADD COLUMN IF NOT EXISTS sym_weakness_since_date  DATE,
  ADD COLUMN IF NOT EXISTS sym_weakness_years       INTEGER,
  ADD COLUMN IF NOT EXISTS sym_weakness_months      INTEGER,
  ADD COLUMN IF NOT EXISTS sym_weakness_days        INTEGER,

  -- Symptoms — concentration (F15a)
  ADD COLUMN IF NOT EXISTS sym_concentration_status VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_concentration_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_concentration_years  INTEGER,
  ADD COLUMN IF NOT EXISTS sym_concentration_months INTEGER,
  ADD COLUMN IF NOT EXISTS sym_concentration_days   INTEGER,
  ADD COLUMN IF NOT EXISTS sym_concentration_impact BOOLEAN DEFAULT FALSE,

  -- Symptoms — memory (F15b)
  ADD COLUMN IF NOT EXISTS sym_memory_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_memory_since_date    DATE,
  ADD COLUMN IF NOT EXISTS sym_memory_years         INTEGER,
  ADD COLUMN IF NOT EXISTS sym_memory_months        INTEGER,
  ADD COLUMN IF NOT EXISTS sym_memory_days          INTEGER,
  ADD COLUMN IF NOT EXISTS sym_memory_impact        BOOLEAN DEFAULT FALSE,

  -- Symptoms — depression (F16)
  ADD COLUMN IF NOT EXISTS sym_depression_status    VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_depression_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_depression_years     INTEGER,
  ADD COLUMN IF NOT EXISTS sym_depression_months    INTEGER,
  ADD COLUMN IF NOT EXISTS sym_depression_days      INTEGER,
  ADD COLUMN IF NOT EXISTS sym_depression_seen_doctor BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sym_depression_diagnosed BOOLEAN DEFAULT FALSE,

  -- Symptoms — hypersomnia
  ADD COLUMN IF NOT EXISTS sym_hypersomnia_status   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_hypersomnia_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_hypersomnia_years    INTEGER,
  ADD COLUMN IF NOT EXISTS sym_hypersomnia_months   INTEGER,
  ADD COLUMN IF NOT EXISTS sym_hypersomnia_days     INTEGER,

  -- Symptoms — bradycardia
  ADD COLUMN IF NOT EXISTS sym_bradycardia_status   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_bradycardia_pulse_bpm INTEGER,
  ADD COLUMN IF NOT EXISTS sym_bradycardia_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_bradycardia_years    INTEGER,
  ADD COLUMN IF NOT EXISTS sym_bradycardia_months   INTEGER,
  ADD COLUMN IF NOT EXISTS sym_bradycardia_days     INTEGER,

  -- Symptoms — postural giddiness
  ADD COLUMN IF NOT EXISTS sym_giddiness_status     VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_giddiness_freq       VARCHAR(20),   -- rarely/sometimes/often/every_time
  ADD COLUMN IF NOT EXISTS sym_giddiness_since_date DATE,
  ADD COLUMN IF NOT EXISTS sym_giddiness_years      INTEGER,
  ADD COLUMN IF NOT EXISTS sym_giddiness_months     INTEGER,
  ADD COLUMN IF NOT EXISTS sym_giddiness_days       INTEGER,

  -- Symptoms — blackout
  ADD COLUMN IF NOT EXISTS sym_blackout_status      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_blackout_count       INTEGER,
  ADD COLUMN IF NOT EXISTS sym_blackout_last_date   DATE,
  ADD COLUMN IF NOT EXISTS sym_blackout_assessed    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sym_blackout_dx          TEXT,

  -- Symptoms — hearing
  ADD COLUMN IF NOT EXISTS sym_hearing_status       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_hearing_type         VARCHAR(20),   -- reduced/tinnitus/both
  ADD COLUMN IF NOT EXISTS sym_hearing_since_date   DATE,
  ADD COLUMN IF NOT EXISTS sym_hearing_years        INTEGER,
  ADD COLUMN IF NOT EXISTS sym_hearing_months       INTEGER,
  ADD COLUMN IF NOT EXISTS sym_hearing_days         INTEGER,

  -- Symptoms — delayed reflexes
  ADD COLUMN IF NOT EXISTS sym_reflexes_status      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sym_reflexes_since_date  DATE,
  ADD COLUMN IF NOT EXISTS sym_reflexes_years       INTEGER,
  ADD COLUMN IF NOT EXISTS sym_reflexes_months      INTEGER,
  ADD COLUMN IF NOT EXISTS sym_reflexes_days        INTEGER,

  -- Symptoms — carpal tunnel (F23 — 3 sub-questions: pain, numbness, tingling)
  ADD COLUMN IF NOT EXISTS sym_carpal_data          JSONB,         -- [{type: pain/numbness/tingling, side, since_date, years, months, days}]

  -- Symptoms — macroglossia
  ADD COLUMN IF NOT EXISTS sym_macroglossia_status  VARCHAR(10),

  -- Treatment (G1 — extended)
  ADD COLUMN IF NOT EXISTS levo_drug_name           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS levo_compliance_val      VARCHAR(20),   -- regular/irregular/misses_sometimes
  ADD COLUMN IF NOT EXISTS treatment_start_date_val DATE,
  ADD COLUMN IF NOT EXISTS treatment_start_years    INTEGER,
  ADD COLUMN IF NOT EXISTS treatment_start_months_val INTEGER,

  -- Dose change (G2 — extended)
  ADD COLUMN IF NOT EXISTS dose_change_reason_type  VARCHAR(30),   -- tsh_increased/tsh_decreased/pregnancy/doctor_advice_other

  -- Comorbidities (H1 — duration added)
  ADD COLUMN IF NOT EXISTS dyslipidaemia_since_date DATE,
  ADD COLUMN IF NOT EXISTS dyslipidaemia_years      INTEGER,
  ADD COLUMN IF NOT EXISTS dyslipidaemia_months     INTEGER,
  ADD COLUMN IF NOT EXISTS dyslipidaemia_days       INTEGER,

  -- H2 anaemia type
  ADD COLUMN IF NOT EXISTS anaemia_type             VARCHAR(30),

  -- H3 PCOS/PMOS extended
  ADD COLUMN IF NOT EXISTS pcos_pmos_label          VARCHAR(10),   -- pcos/pmos
  ADD COLUMN IF NOT EXISTS pcos_since_date          DATE,
  ADD COLUMN IF NOT EXISTS pcos_years               INTEGER,
  ADD COLUMN IF NOT EXISTS pcos_months              INTEGER,
  ADD COLUMN IF NOT EXISTS pcos_days                INTEGER,
  ADD COLUMN IF NOT EXISTS pcos_on_medication       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS pcos_med_name            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pcos_med_dose            NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS pcos_med_times_per_day   INTEGER,

  -- H4 infertility
  ADD COLUMN IF NOT EXISTS infertility_status       VARCHAR(10),

  -- Additional notes
  ADD COLUMN IF NOT EXISTS additional_notes         TEXT;

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire TO thyroconsult_user;
