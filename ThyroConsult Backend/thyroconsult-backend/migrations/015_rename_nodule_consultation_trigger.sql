-- ============================================================
-- Migration 015: rename nodule_questionnaire.consultation_trigger(_other)
-- Full path: thyroconsult-backend\migrations\015_rename_nodule_consultation_trigger.sql
--
-- Found while rewriting conditionController.js's Nodule save/load
-- functions against migration 008's schema. Module E (Q5-Q9) has
-- consultation_trigger / consultation_trigger_other columns.
--
-- Idempotent — safe to re-run.
-- Run in pgAdmin on the thyroconsult database, after 001-014.
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nodule_questionnaire' AND column_name = 'consultation_trigger')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nodule_questionnaire' AND column_name = 'opinion_trigger') THEN
        ALTER TABLE nodule_questionnaire RENAME COLUMN consultation_trigger TO opinion_trigger;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nodule_questionnaire' AND column_name = 'consultation_trigger_other')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nodule_questionnaire' AND column_name = 'opinion_trigger_other') THEN
        ALTER TABLE nodule_questionnaire RENAME COLUMN consultation_trigger_other TO opinion_trigger_other;
    END IF;
END $$;

GRANT ALL PRIVILEGES ON TABLE nodule_questionnaire TO thyroconsult_user;
