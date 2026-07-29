-- ============================================================
-- Migration 017: Remove the video/audio/text appointment-type concept
-- Full path: thyroconsult-backend\migrations\017_remove_video_appointment_type.sql
--
-- ThyroConsult is an asynchronous written "online opinion" service — the
-- patient submits a questionnaire + documents, the doctor reviews and
-- writes a structured opinion (see the `opinions` table / opinionController.js).
-- There is no live video/audio/text session anywhere in the actual product.
--
-- That said, migration 001 modelled this as a live telemedicine consult:
--   - a `consultation_type` ENUM ('video','audio','text'), NOT NULL DEFAULT 'video'
--   - applied to both appointments.consultation_type and
--     consultations.consultation_type. Note: despite the code referring to
--     `opinion_appointment_type`, migration 012 explicitly skipped renaming
--     this column at the DB level (see that file's header) — so these two
--     columns are still literally named `consultation_type` in your live
--     database. This migration drops by both names defensively.
--   - appointments.session_link (an "encrypted video call link" column)
-- doctorController.bookAppointment and RegisterPage.js were both silently
-- defaulting every booking to 'video'. This migration removes the columns
-- and the now-unused ENUM type entirely. The corresponding code
-- (doctorController.js bookAppointment/getDoctorAppointments/
-- getAppointmentDetail, patientController.js getPatientOpinions/getInvoices,
-- RegisterPage.js initiatePayment) has already been updated to stop
-- reading/writing these fields — run this AFTER deploying that code, not
-- before, or those inserts will fail against the still-NOT-NULL columns.
--
-- Run in pgAdmin on the `thyroconsult` database
-- Run ONCE only, after 016
-- ============================================================

-- Drop by BOTH possible names, defensively:
--   - `consultation_type` is what's actually live in your DB right now —
--     migration 012's rename to opinion_appointment_type explicitly
--     skipped appointments/consultations (see that file's own header
--     comment), so these two columns were never renamed at the DB level,
--     only referenced under the new name in application code. That
--     mismatch means every query in doctorController.js/patientController.js
--     that read `a.opinion_appointment_type` / `c.opinion_appointment_type`
--     would have thrown "column does not exist" at runtime — moot now
--     since that code was removed in the same pass as this migration.
--   - `opinion_appointment_type` covers any environment where the rename
--     WAS applied by hand.
ALTER TABLE appointments   DROP COLUMN IF EXISTS consultation_type;
ALTER TABLE appointments   DROP COLUMN IF EXISTS opinion_appointment_type;
ALTER TABLE appointments   DROP COLUMN IF EXISTS session_link;
ALTER TABLE consultations  DROP COLUMN IF EXISTS consultation_type;
ALTER TABLE consultations  DROP COLUMN IF EXISTS opinion_appointment_type;

DROP TYPE IF EXISTS consultation_type;

-- ============================================================
-- Verify after running:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name IN ('appointments','consultations')
-- AND column_name IN ('consultation_type','opinion_appointment_type','session_link');
-- Expected: 0 rows
-- ============================================================
