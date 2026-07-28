-- ============================================================
-- Migration 014: rename consultation_seq -> opinion_seq
-- Full path: thyroconsult-backend\migrations\014_rename_consultation_seq.sql
--
-- Found via doctorController.js's bookAppointment(), which pulls the
-- next opinion number from nextval('consultation_seq'). doctorController.js
-- has already been updated to call nextval('opinion_seq') — run this
-- migration before deploying that updated file, or appointment booking
-- will fail with "relation opinion_seq does not exist".
--
-- Idempotent — safe to re-run.
-- Run in pgAdmin on the thyroconsult database, after 001-013.
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'consultation_seq')
       AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'opinion_seq') THEN
        ALTER SEQUENCE consultation_seq RENAME TO opinion_seq;
    END IF;
END $$;

GRANT USAGE, SELECT ON SEQUENCE opinion_seq TO thyroconsult_user;
