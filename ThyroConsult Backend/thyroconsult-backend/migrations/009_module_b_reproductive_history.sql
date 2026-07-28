-- ============================================================
-- Migration 009 (CORRECTED v2): Module B — Menstrual, Pregnancy & Hysterectomy
-- Full path: thyroconsult-backend\migrations\009_module_b_reproductive_history.sql
--
-- v2 CHANGES (on top of the v1 field-name correction):
--   - Hysterectomy date now supports partial precision: patients often
--     only know the year, or month+year, not a full date. Added
--     hysterectomy_date_precision ('full'/'month_year'/'year_only') +
--     hysterectomy_year / hysterectomy_month alongside the existing
--     hysterectomy_date (used when precision = 'full').
--   - EDD is now persisted (edd_date) rather than only computed
--     client-side for display (calcEDD()) — both patient and doctor
--     need this saved, not just shown once.
--   - dob/sex are handled separately (patients table only) — see the
--     Nodule/TC-specific note; this migration was never about
--     per-condition dob/sex, so no change needed here.
--
-- v1 CHANGES (still in effect): corrected field names to match the real
-- TcQuestionnaire.js / NoduleQuestionnaire.js Module B implementation
-- (menopause_years_ago not menopause_age; menstrual_pattern +
-- menstrual_flow not menstrual_change_type; no hysterectomy_years/months
-- as separate fields from the old draft).
--
-- Run once in pgAdmin on the thyroconsult database as superuser.
-- All statements use IF NOT EXISTS — safe to re-run.
-- ============================================================

-- ── hypo_questionnaire ──────────────────────────────────────
ALTER TABLE hypo_questionnaire
  ADD COLUMN IF NOT EXISTS marital_status              VARCHAR(20),   -- unmarried/married/divorced/widowed

  ADD COLUMN IF NOT EXISTS hysterectomy_status          VARCHAR(10),   -- no/unsure/yes
  ADD COLUMN IF NOT EXISTS hysterectomy_date_precision   VARCHAR(15),   -- full/month_year/year_only -- patients often only know year or month+year
  ADD COLUMN IF NOT EXISTS hysterectomy_date             DATE,
  ADD COLUMN IF NOT EXISTS hysterectomy_year             INTEGER,
  ADD COLUMN IF NOT EXISTS hysterectomy_month            INTEGER,
  ADD COLUMN IF NOT EXISTS hysterectomy_reason           VARCHAR(50),   -- excessive_bleeding/prolapse/cancer/other
  ADD COLUMN IF NOT EXISTS hysterectomy_reason_other      VARCHAR(150),

  ADD COLUMN IF NOT EXISTS menopause_status              VARCHAR(20),   -- pre/peri/post
  ADD COLUMN IF NOT EXISTS menopause_years_ago            INTEGER,

  ADD COLUMN IF NOT EXISTS menstrual_change_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS menstrual_pattern               VARCHAR(20),  -- regular/irregular
  ADD COLUMN IF NOT EXISTS menstrual_flow                  TEXT[],       -- heavy/scanty/absent/prolonged
  ADD COLUMN IF NOT EXISTS menstrual_since_date             DATE,
  ADD COLUMN IF NOT EXISTS menstrual_years                  INTEGER,
  ADD COLUMN IF NOT EXISTS menstrual_months                 INTEGER,

  ADD COLUMN IF NOT EXISTS lmp_date                          DATE,
  ADD COLUMN IF NOT EXISTS pregnancy_status                  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS edd_date                          DATE;   -- now persisted, not just computed client-side -- both patient and doctor need it saved

-- ── hyper_questionnaire ─────────────────────────────────────
-- Note: hyper_questionnaire already has infertility_status (H5) from
-- an earlier migration -- not duplicated here.
ALTER TABLE hyper_questionnaire
  ADD COLUMN IF NOT EXISTS marital_status              VARCHAR(20),   -- unmarried/married/divorced/widowed

  ADD COLUMN IF NOT EXISTS hysterectomy_status          VARCHAR(10),   -- no/unsure/yes
  ADD COLUMN IF NOT EXISTS hysterectomy_date_precision   VARCHAR(15),   -- full/month_year/year_only -- patients often only know year or month+year
  ADD COLUMN IF NOT EXISTS hysterectomy_date             DATE,
  ADD COLUMN IF NOT EXISTS hysterectomy_year             INTEGER,
  ADD COLUMN IF NOT EXISTS hysterectomy_month            INTEGER,
  ADD COLUMN IF NOT EXISTS hysterectomy_reason           VARCHAR(50),   -- excessive_bleeding/prolapse/cancer/other
  ADD COLUMN IF NOT EXISTS hysterectomy_reason_other      VARCHAR(150),

  ADD COLUMN IF NOT EXISTS menopause_status              VARCHAR(20),   -- pre/peri/post
  ADD COLUMN IF NOT EXISTS menopause_years_ago            INTEGER,

  ADD COLUMN IF NOT EXISTS menstrual_change_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS menstrual_pattern               VARCHAR(20),  -- regular/irregular
  ADD COLUMN IF NOT EXISTS menstrual_flow                  TEXT[],       -- heavy/scanty/absent/prolonged
  ADD COLUMN IF NOT EXISTS menstrual_since_date             DATE,
  ADD COLUMN IF NOT EXISTS menstrual_years                  INTEGER,
  ADD COLUMN IF NOT EXISTS menstrual_months                 INTEGER,

  ADD COLUMN IF NOT EXISTS lmp_date                          DATE,
  ADD COLUMN IF NOT EXISTS pregnancy_status                  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS edd_date                          DATE;   -- now persisted, not just computed client-side -- both patient and doctor need it saved

-- ── tc_questionnaire ────────────────────────────────────────
ALTER TABLE tc_questionnaire
  ADD COLUMN IF NOT EXISTS marital_status              VARCHAR(20),   -- unmarried/married/divorced/widowed

  ADD COLUMN IF NOT EXISTS hysterectomy_status          VARCHAR(10),   -- no/unsure/yes
  ADD COLUMN IF NOT EXISTS hysterectomy_date_precision   VARCHAR(15),   -- full/month_year/year_only -- patients often only know year or month+year
  ADD COLUMN IF NOT EXISTS hysterectomy_date             DATE,
  ADD COLUMN IF NOT EXISTS hysterectomy_year             INTEGER,
  ADD COLUMN IF NOT EXISTS hysterectomy_month            INTEGER,
  ADD COLUMN IF NOT EXISTS hysterectomy_reason           VARCHAR(50),   -- excessive_bleeding/prolapse/cancer/other
  ADD COLUMN IF NOT EXISTS hysterectomy_reason_other      VARCHAR(150),

  ADD COLUMN IF NOT EXISTS menopause_status              VARCHAR(20),   -- pre/peri/post
  ADD COLUMN IF NOT EXISTS menopause_years_ago            INTEGER,

  ADD COLUMN IF NOT EXISTS menstrual_change_status        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS menstrual_pattern               VARCHAR(20),  -- regular/irregular
  ADD COLUMN IF NOT EXISTS menstrual_flow                  TEXT[],       -- heavy/scanty/absent/prolonged
  ADD COLUMN IF NOT EXISTS menstrual_since_date             DATE,
  ADD COLUMN IF NOT EXISTS menstrual_years                  INTEGER,
  ADD COLUMN IF NOT EXISTS menstrual_months                 INTEGER,

  ADD COLUMN IF NOT EXISTS lmp_date                          DATE,
  ADD COLUMN IF NOT EXISTS pregnancy_status                  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS edd_date                          DATE;   -- now persisted, not just computed client-side -- both patient and doctor need it saved

-- ── Grants ───────────────────────────────────────────────────
GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire  TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hyper_questionnaire TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE tc_questionnaire    TO thyroconsult_user;

-- ── Cleanup (optional, run later once verified) ────────────────
-- Columns from the original (v1-pre-correction) draft that are dead if
-- that version ever ran: hysterectomy_years, hysterectomy_months,
-- menopause_age, menstrual_change_type, menstrual_change_duration_years,
-- menstrual_change_duration_months, pregnancy_weeks (the old, wrong,
-- non-precision-aware edd_date guess was replaced, not dropped, in v2).
-- Confirm unused before dropping, e.g.:
--   SELECT COUNT(*) FROM tc_questionnaire WHERE menopause_age IS NOT NULL;

-- ── Verification ─────────────────────────────────────────────
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE column_name IN ('marital_status','hysterectomy_date_precision','hysterectomy_year','hysterectomy_month','edd_date')
-- AND table_name IN ('hypo_questionnaire','hyper_questionnaire','tc_questionnaire')
-- ORDER BY table_name, column_name;
-- Expected: 5 rows per table, 15 total
