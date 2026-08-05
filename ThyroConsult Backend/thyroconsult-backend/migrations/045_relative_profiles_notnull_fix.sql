-- 045_relative_profiles_notnull_fix.sql
--
-- Migration 038 added the relative-profile columns but left the actual
-- NOT NULL fix as commented-out, unverified lines ("check `\d patients`
-- and uncomment whichever apply"). Confirmed against the real CREATE
-- TABLE (001_schema.sql): mobile, mobile_hash, email, email_hash, and
-- password_hash are ALL NOT NULL — and registerRelative (authController.js)
-- never sets any of them (relatives have no independent login by
-- design). Every "Opinion for a relative" creation has been failing with
-- a NOT NULL constraint violation, surfaced to the frontend only as the
-- generic "Failed to create relative profile" message.
--
-- A separate migration rather than re-running 038, since 038 already ran
-- once and its other statements (ADD COLUMN, CREATE INDEX) are already
-- in effect.
--
-- Note: mobile_hash/email_hash keep their UNIQUE constraint — Postgres
-- treats each NULL as distinct under UNIQUE, so multiple relative rows
-- with NULL mobile_hash/email_hash are fine, no conflict.

ALTER TABLE patients ALTER COLUMN mobile DROP NOT NULL;
ALTER TABLE patients ALTER COLUMN mobile_hash DROP NOT NULL;
ALTER TABLE patients ALTER COLUMN email DROP NOT NULL;
ALTER TABLE patients ALTER COLUMN email_hash DROP NOT NULL;
ALTER TABLE patients ALTER COLUMN password_hash DROP NOT NULL;

GRANT ALL PRIVILEGES ON TABLE patients TO thyroconsult_user;
