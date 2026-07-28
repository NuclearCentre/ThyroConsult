-- ============================================================
-- Migration 011: rename payments.consultation_fee -> payments.opinion_fee
-- Full path (place here): D:\Thyroid Consultation Software\thyroconsult-backend\migrations\011_rename_consultation_fee.sql
--
-- Platform-language rule: "consultation"/"consult"/"consulted" must never
-- appear anywhere on the platform, including database column names.
-- This migration is scoped ONLY to the `payments` table because that is
-- the one place this session could confirm every reader of the column
-- (conditionController.js has no references; patientController.js,
-- paymentController.js, receiptController.js, receiptService.js were
-- all reviewed and updated to use `opinion_fee`).
--
-- NOT included here, and deliberately left alone pending confirmation:
--   - appointments.consultation_type
--   - the entire `consultations` table (consultation_number,
--     consultation_type, started_at, completed_at, duration_minutes, etc.)
--   - documents.consultation_id
-- These are read by patientController.js's getPatientOpinions/getInvoices
-- but their full read/write surface (booking system, doctor-side
-- controllers) hasn't been reviewed this session. There's a separate
-- opinionController.js in the codebase (seen in the folder listing) that
-- may already be the live, correctly-named replacement for the
-- `consultations` table — check that first, the same way Nodule's
-- live/dead status was checked, before renaming this schema.
--
-- Idempotent — safe to run regardless of current column name.
-- Run in pgAdmin on the `thyroconsult` database, after 001-010.
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payments' AND column_name = 'consultation_fee'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payments' AND column_name = 'opinion_fee'
    ) THEN
        ALTER TABLE payments RENAME COLUMN consultation_fee TO opinion_fee;
    END IF;
END $$;

-- Re-grant in case the rename affected privilege inheritance in your setup
GRANT ALL PRIVILEGES ON TABLE payments TO thyroconsult_user;
