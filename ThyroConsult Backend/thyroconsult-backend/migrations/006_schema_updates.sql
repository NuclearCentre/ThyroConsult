-- ============================================================
-- Migration 006: Schema updates — D module expansion,
--   unified H module, A4 occupation for all questionnaires
-- Run once in pgAdmin on the thyroconsult database
-- ============================================================

-- ── hypo_questionnaire ───────────────────────────────────────

-- A4 occupation (new)
ALTER TABLE hypo_questionnaire
  ADD COLUMN IF NOT EXISTS occupation          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS occupation_other    VARCHAR(200);

-- D module: T3 total (new), T4 total (new), split antibodies
ALTER TABLE hypo_questionnaire
  ADD COLUMN IF NOT EXISTS t3_status           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS t3_value            NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS t3_unit             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS t3_date             DATE,
  ADD COLUMN IF NOT EXISTS t3_ref_low          NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS t3_ref_high         NUMERIC(10,4),

  ADD COLUMN IF NOT EXISTS t4_status           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS t4_value            NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS t4_unit             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS t4_date             DATE,
  ADD COLUMN IF NOT EXISTS t4_ref_low          NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS t4_ref_high         NUMERIC(10,4),

  -- Split Anti-TPO into its own status + ref range
  ADD COLUMN IF NOT EXISTS antitpo_status      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS antitpo_unit        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS antitpo_ref_low     NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS antitpo_ref_high    NUMERIC(10,4),

  -- Split Anti-Tg into its own status + ref range
  ADD COLUMN IF NOT EXISTS antitg_status       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS antitg_unit         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS antitg_ref_low      NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS antitg_ref_high     NUMERIC(10,4),

  -- Imaging: add findings field
  ADD COLUMN IF NOT EXISTS imaging_finding     TEXT;

-- H module: new unified comorbidities
ALTER TABLE hypo_questionnaire
  -- H1 dyslipidaemia — add medication sub-questions (back-port from Hyper)
  ADD COLUMN IF NOT EXISTS dyslipidaemia_on_med       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS dyslipidaemia_med_name     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS dyslipidaemia_med_dose     NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS dyslipidaemia_med_times    SMALLINT,

  -- H2 anaemia — add medication sub-questions
  ADD COLUMN IF NOT EXISTS anaemia_on_med             VARCHAR(10),
  ADD COLUMN IF NOT EXISTS anaemia_med_name           VARCHAR(200),
  ADD COLUMN IF NOT EXISTS anaemia_med_times          SMALLINT,

  -- H3 diabetes (new for Hypo)
  ADD COLUMN IF NOT EXISTS diabetes_status            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS diabetes_type              VARCHAR(50),
  ADD COLUMN IF NOT EXISTS diabetes_duration_months   SMALLINT,
  ADD COLUMN IF NOT EXISTS diabetes_on_med            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS diabetes_med_name          VARCHAR(200),
  ADD COLUMN IF NOT EXISTS diabetes_med_dose          NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS diabetes_med_times         SMALLINT,

  -- H6 depression (was unnamed, now explicit)
  ADD COLUMN IF NOT EXISTS depression_diagnosed       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS depression_on_med          VARCHAR(10),

  -- H7 osteoporosis (new for Hypo — was Hyper-only)
  ADD COLUMN IF NOT EXISTS osteoporosis_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS osteoporosis_dexa          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS osteoporosis_on_med        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS osteoporosis_med_name      VARCHAR(200),
  ADD COLUMN IF NOT EXISTS osteoporosis_med_times     SMALLINT,

  -- H8 family history — non-thyroid cancers / MEN syndromes (new)
  ADD COLUMN IF NOT EXISTS family_cancer_status       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS family_cancer_types        JSONB,
  ADD COLUMN IF NOT EXISTS family_cancer_relative     VARCHAR(200);

-- ── hyper_questionnaire ──────────────────────────────────────

-- A4 occupation (new)
ALTER TABLE hyper_questionnaire
  ADD COLUMN IF NOT EXISTS occupation          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS occupation_other    VARCHAR(200);

-- D module: T3 total (new), T4 total (new), split TRAb/TSI, split antibodies
ALTER TABLE hyper_questionnaire
  ADD COLUMN IF NOT EXISTS t3_status           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS t3_value            NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS t3_unit             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS t3_date             DATE,
  ADD COLUMN IF NOT EXISTS t3_ref_low          NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS t3_ref_high         NUMERIC(10,4),

  ADD COLUMN IF NOT EXISTS t4_status           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS t4_value            NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS t4_unit             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS t4_date             DATE,
  ADD COLUMN IF NOT EXISTS t4_ref_low          NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS t4_ref_high         NUMERIC(10,4),

  -- Split Anti-TPO (separate status from combined antibody_status)
  ADD COLUMN IF NOT EXISTS antitpo_status      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS antitpo_ref_low     NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS antitpo_ref_high    NUMERIC(10,4),

  -- Split Anti-Tg (separate status)
  ADD COLUMN IF NOT EXISTS antitg_status       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS antitg_ref_low      NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS antitg_ref_high     NUMERIC(10,4),

  -- Split TRAb into its own status (was combined with tsi)
  ADD COLUMN IF NOT EXISTS trab_status_d8      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS trab_value_new      NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS trab_date_new       DATE,
  ADD COLUMN IF NOT EXISTS trab_ref_low        NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS trab_ref_high       NUMERIC(10,4),

  -- TSI gets its own status
  ADD COLUMN IF NOT EXISTS tsi_status          VARCHAR(10);

-- H module: H8_cancers (family history non-thyroid)
ALTER TABLE hyper_questionnaire
  ADD COLUMN IF NOT EXISTS family_cancer_status       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS family_cancer_types        JSONB,
  ADD COLUMN IF NOT EXISTS family_cancer_relative     VARCHAR(200);

-- ── GRANTS ───────────────────────────────────────────────────
GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire  TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hyper_questionnaire TO thyroconsult_user;

-- ── Verification queries ──────────────────────────────────────
-- Run these to confirm migration succeeded:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hypo_questionnaire' AND column_name = 't3_status';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hypo_questionnaire' AND column_name = 'osteoporosis_status';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hyper_questionnaire' AND column_name = 't3_status';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hyper_questionnaire' AND column_name = 'family_cancer_status';
