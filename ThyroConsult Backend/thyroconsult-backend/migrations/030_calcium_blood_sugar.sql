-- ======================================================================
-- Migration 030: Sr. Calcium + Blood Sugar (Fasting/PP) — all 4 modules
-- Full path: thyroconsult-backend\migrations\030_calcium_blood_sugar.sql
--
-- New investigations, symptom-triggered per the reflex-testing pattern:
--   Muscle cramps/aches -> Vit D3 + Sr. Calcium
--   Dizzy/light-headed/blackout -> CBC + Blood Sugar Fasting + PP
--
-- Same canonical 6-field lab shape as the rest of the panel
-- (status/value/unit/date/ref_low/ref_high), applied uniformly across
-- all 4 questionnaire tables per the existing standardization approach.
-- ======================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['hypo_questionnaire', 'hyper_questionnaire', 'tc_questionnaire', 'nodule_questionnaire']
  LOOP
    EXECUTE format('ALTER TABLE %I
      ADD COLUMN IF NOT EXISTS sr_calcium_status    VARCHAR(15),
      ADD COLUMN IF NOT EXISTS sr_calcium_value      NUMERIC(10,3),
      ADD COLUMN IF NOT EXISTS sr_calcium_unit       VARCHAR(20),
      ADD COLUMN IF NOT EXISTS sr_calcium_date       DATE,
      ADD COLUMN IF NOT EXISTS sr_calcium_ref_low    NUMERIC(10,3),
      ADD COLUMN IF NOT EXISTS sr_calcium_ref_high   NUMERIC(10,3),

      ADD COLUMN IF NOT EXISTS fbs_status            VARCHAR(15),
      ADD COLUMN IF NOT EXISTS fbs_value              NUMERIC(10,3),
      ADD COLUMN IF NOT EXISTS fbs_unit               VARCHAR(20),
      ADD COLUMN IF NOT EXISTS fbs_date               DATE,
      ADD COLUMN IF NOT EXISTS fbs_ref_low            NUMERIC(10,3),
      ADD COLUMN IF NOT EXISTS fbs_ref_high           NUMERIC(10,3),

      ADD COLUMN IF NOT EXISTS ppbs_status            VARCHAR(15),
      ADD COLUMN IF NOT EXISTS ppbs_value             NUMERIC(10,3),
      ADD COLUMN IF NOT EXISTS ppbs_unit              VARCHAR(20),
      ADD COLUMN IF NOT EXISTS ppbs_date              DATE,
      ADD COLUMN IF NOT EXISTS ppbs_ref_low           NUMERIC(10,3),
      ADD COLUMN IF NOT EXISTS ppbs_ref_high          NUMERIC(10,3)
    ', tbl);

    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE %I TO thyroconsult_user', tbl);
  END LOOP;
END $$;

-- Verification:
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE column_name LIKE 'sr_calcium%' OR column_name LIKE 'fbs%' OR column_name LIKE 'ppbs%'
-- ORDER BY table_name, column_name;
-- Expected: 18 rows per table x 4 tables = 72 rows
