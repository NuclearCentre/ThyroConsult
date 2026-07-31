-- ============================================================
-- Migration 020 — OTP attempt limiting (registration Step 2)
-- Full path: thyroconsult-backend\migrations\020_otp_attempt_limiting.sql
--
-- Mirrors the existing failed_login_count/locked_until pattern already
-- used for password login (see authController.js login()), applied per
-- verification channel (mobile/whatsapp/email) instead of one shared
-- counter — a patient failing email OTP shouldn't lock out their mobile
-- OTP attempts too.
--
-- 5 attempts, then a 15-minute lockout, enforced server-side in
-- authController.js's verifyOtp — a client-side-only attempt counter is
-- trivially bypassed by refreshing the page, so this is the actual
-- enforcement; the frontend just reflects it.
-- ============================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS mobile_otp_attempts     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mobile_otp_locked_until  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_otp_attempts    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_otp_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_otp_attempts       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_otp_locked_until   TIMESTAMPTZ;

GRANT ALL PRIVILEGES ON TABLE patients TO thyroconsult_user;

-- ============================================================
-- Verify after running:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'patients' AND column_name LIKE '%otp_attempts%'
--    OR column_name LIKE '%otp_locked_until%';
-- Expected: 6 rows
-- ============================================================
