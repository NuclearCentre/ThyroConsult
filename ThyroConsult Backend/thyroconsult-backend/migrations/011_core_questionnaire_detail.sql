-- ============================================================
-- Migration 011: Core Questionnaire — detailed Module B/C upgrade
-- Full path: thyroconsult-backend\migrations\011_core_questionnaire_detail.sql
--
-- CONTEXT: core_questionnaire ("Part 1 of 2", CoreQuestionnaire.js) is the
-- shared intake used ahead of the live TcQuestionnaire ("Part 2"). Its
-- original Module B/C fields (migration 002) were simple booleans + free
-- text (pmh_hysterectomy, fh_thyroid_disease + free-text details). Per
-- product decision, upgrading these to match the Word doc's detailed
-- spec: partial-precision hysterectomy dates, persisted EDD, itemized
-- family thyroid history, itemized personal autoimmune history.
--
-- Also fixes two orphaned fields found during this audit:
--   - pmh_hysterectomy existed on the frontend (read AND toggle) but was
--     never in the backend's save mapping, and never had a DB column.
--     Now has a real column and is actually saved.
--   - marital_status is read by CoreQuestionnaire.js's mapDbToForm but
--     was never saved either, and had no column. Added here.
--
-- Corresponding frontend/backend changes: CoreQuestionnaire.js (detailed
-- UI), conditionController.js's saveCoreQuestionnaire cols{} mapping.
-- api/index.js also needed getCoreQ/saveCoreQ added — separate, already
-- fixed — since CoreQuestionnaire.js couldn't reach the backend at all
-- before that.
--
-- Run once in pgAdmin on the thyroconsult database as superuser.
-- All statements use IF NOT EXISTS — safe to re-run.
-- ============================================================

ALTER TABLE core_questionnaire
  -- ── Social history gap-fill ──
  ADD COLUMN IF NOT EXISTS marital_status                  VARCHAR(20),   -- unmarried/married/divorced/widowed -- was read but never saved

  -- ── Hysterectomy (was a bare boolean with no detail, and not even saved) ──
  ADD COLUMN IF NOT EXISTS pmh_hysterectomy                BOOLEAN DEFAULT FALSE,   -- now actually saved (see conditionController.js fix)
  ADD COLUMN IF NOT EXISTS hysterectomy_date_precision      VARCHAR(15),   -- full/month_year/year_only
  ADD COLUMN IF NOT EXISTS hysterectomy_date                DATE,
  ADD COLUMN IF NOT EXISTS hysterectomy_year                INTEGER,
  ADD COLUMN IF NOT EXISTS hysterectomy_month               INTEGER,
  ADD COLUMN IF NOT EXISTS hysterectomy_reason               VARCHAR(50),  -- excessive_bleeding/prolapse/cancer/other
  ADD COLUMN IF NOT EXISTS hysterectomy_reason_other          VARCHAR(150),

  -- ── Itemized personal autoimmune history (was pmh_autoimmune_details free text) ──
  ADD COLUMN IF NOT EXISTS pmh_autoimmune_conditions        TEXT[],        -- type1_diabetes/rheumatoid_arthritis/lupus/vitiligo/addisons/other
  ADD COLUMN IF NOT EXISTS pmh_autoimmune_other              VARCHAR(150),

  -- ── Itemized family thyroid history (was fh_thyroid_details free text) ──
  ADD COLUMN IF NOT EXISTS fh_thyroid_relations              TEXT[],       -- mother/father/brother/sister/... (see CoreQuestionnaire.js for full list)
  ADD COLUMN IF NOT EXISTS fh_thyroid_condition               VARCHAR(30), -- hypothyroidism/hyperthyroidism/thyroid_cancer/goitre/thyroid_nodule/others

  -- ── Menopause status (did not exist at all) ──
  ADD COLUMN IF NOT EXISTS menopause_status                  VARCHAR(20) DEFAULT 'pre',
  ADD COLUMN IF NOT EXISTS menopause_years_ago                INTEGER,

  -- ── Structured menstrual change (previously only a free-text sym_menstrual_changes) ──
  ADD COLUMN IF NOT EXISTS menstrual_change_status            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS menstrual_pattern                   VARCHAR(20), -- regular/irregular
  ADD COLUMN IF NOT EXISTS menstrual_flow                      TEXT[],      -- heavy/scanty/absent/prolonged
  ADD COLUMN IF NOT EXISTS menstrual_since_date                DATE,
  ADD COLUMN IF NOT EXISTS menstrual_years                     INTEGER,
  ADD COLUMN IF NOT EXISTS menstrual_months                    INTEGER,

  -- ── EDD (computed client-side from LMP, now persisted) ──
  ADD COLUMN IF NOT EXISTS edd_date                            DATE;

-- ── Grant ────────────────────────────────────────────────────
GRANT ALL PRIVILEGES ON TABLE core_questionnaire TO thyroconsult_user;

-- ── Verification ─────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'core_questionnaire'
-- AND column_name IN ('marital_status','pmh_hysterectomy','hysterectomy_date_precision','edd_date','fh_thyroid_relations','pmh_autoimmune_conditions','menopause_status');
-- Expected: 7 rows
