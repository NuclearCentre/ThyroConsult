-- ============================================================
-- Migration 013: rename doctors.consultation_fee -> doctors.opinion_fee
-- Full path: thyroconsult-backend\migrations\013_rename_doctors_consultation_fee.sql
--
-- Found via seed.js, which inserts into doctors.consultation_fee —
-- confirms the column flagged back on 27 Jul ("consultation_fee naming
-- on doctors table") is real. This is the doctor's own fee, read by
-- the frontend as doc.consultationFee on the payment screen (already
-- renamed to doc.opinionFee in RegisterPage.js in an earlier pass —
-- that rename only becomes correct once this column rename lands and
-- doctorController.js's response key is updated to match).
--
-- Idempotent — safe to re-run.
-- Run in pgAdmin on the thyroconsult database, after 001-012.
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'doctors' AND column_name = 'consultation_fee')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'doctors' AND column_name = 'opinion_fee') THEN
        ALTER TABLE doctors RENAME COLUMN consultation_fee TO opinion_fee;
    END IF;
END $$;

GRANT ALL PRIVILEGES ON TABLE doctors TO thyroconsult_user;
