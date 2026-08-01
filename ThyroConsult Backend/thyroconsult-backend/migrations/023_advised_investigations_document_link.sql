-- 023_advised_investigations_document_link.sql  (REVISED)
--
-- RENAME THIS FILE if your migrations folder is already past 022 — check
-- D:\Thyroid Consultation Software\ThyroConsult Backend\thyroconsult-backend\migrations\
-- for the highest existing number first.
--
-- WHY THIS CHANGED: the first version of this migration only ALTERed
-- advised_investigations — it assumed the table already existed, since
-- followUpController.js and physicianController.js both reference it
-- extensively as if it were live. Running it produced:
--   ERROR: relation "advised_investigations" does not exist  (42P01)
-- So the table itself was never created by any migration that actually
-- ran. This revised version CREATEs it (and follow_up_visits, which the
-- same S1/S2/S3 code depends on just as heavily and was never verified
-- either) from scratch, using every column referenced in the actual
-- controller code as the source of truth for what's needed. Also adds
-- the patient_condition_episodes flag columns physicianController.js's
-- getPendingWork query depends on, in case those are missing too — same
-- failure mode, better to catch it now than one error at a time.
--
-- NOT covered here: `followup_payments`, referenced by
-- createFollowUpVisit (WHERE status='paid' AND payment_type='s3_full').
-- That table almost certainly belongs to paymentController.js (never
-- reviewed in this session) and likely already has a real schema with
-- Razorpay fields etc. — guessing at a payments-table schema is
-- higher-stakes than a documents-table one, so this migration
-- deliberately does NOT create it. If you hit the same 42P01 error on
-- followup_payments, send over paymentController.js and its migration
-- before running anything against it.
--
-- All statements use IF NOT EXISTS — safe to re-run, and safe even if
-- some of these already partially exist.

-- uuid_generate_v4() is not currently available in this database, despite
-- 001_schema.sql including a CREATE EXTENSION statement for uuid-ossp —
-- that either failed silently (needs superuser/rds_superuser privileges
-- on managed Postgres) or was never actually run. Re-asserting it here,
-- defensively, rather than assuming any prior migration's side effects
-- actually took hold.
-- IF THIS CREATE EXTENSION LINE ITSELF FAILS with a permission error
-- (common on managed Postgres — AWS RDS, Azure, GCP Cloud SQL, Supabase —
-- where CREATE EXTENSION needs a privilege your app's DB user may not
-- have): this needs your hosting provider's console/superuser account to
-- enable it once, OR switch every `uuid_generate_v4()` in this file to
-- `gen_random_uuid()` (pgcrypto, more commonly pre-enabled on managed
-- services) instead — but check with your hosting provider first, since
-- either extension might already be enabled at the instance level even
-- if this migration can't enable it itself.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── advised_investigations (Scenario 2) ────────────────────────
CREATE TABLE IF NOT EXISTS advised_investigations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id          UUID NOT NULL REFERENCES patient_condition_episodes(id),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  test_name           VARCHAR(200) NOT NULL,
  notes               TEXT,
  source              VARCHAR(10) NOT NULL DEFAULT 'doctor',  -- 'doctor' | 'self'
  advised_by          UUID REFERENCES doctors(id),             -- NULL when source='self'
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending' | 'uploaded' | 'reviewed'
  report_path         TEXT,                                    -- legacy/unused going forward — see migration notes
  document_id         UUID REFERENCES documents(id),           -- the real link, as of this fix
  report_uploaded_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Runs regardless of whether the CREATE TABLE above just created the
-- table fresh (in which case document_id already exists from the column
-- list above and this is a safe no-op) or the table already existed from
-- before this migration (in which case this is what actually adds the
-- column) — must run BEFORE the index below that depends on it.
ALTER TABLE advised_investigations
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id);

CREATE INDEX IF NOT EXISTS idx_advised_investigations_episode_id ON advised_investigations(episode_id);
CREATE INDEX IF NOT EXISTS idx_advised_investigations_document_id ON advised_investigations(document_id);

-- ── follow_up_visits (Scenario 3) ──────────────────────────────
-- Column list assembled from every reference in followUpController.js's
-- createFollowUpVisit/getFollowUpVisits/saveFollowUpDraft/submitFollowUp/
-- uploadFollowUpLab. payment_id references followup_payments(id) — left
-- as a plain UUID (no FK constraint) since that table's existence is
-- unconfirmed; add the constraint later once it's verified, rather than
-- have this migration fail on a table this one isn't responsible for.
CREATE TABLE IF NOT EXISTS follow_up_visits (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id             UUID NOT NULL REFERENCES patient_condition_episodes(id),
  patient_id             UUID NOT NULL REFERENCES patients(id),
  payment_id             UUID,
  visit_number           INTEGER NOT NULL DEFAULT 1,
  status                 VARCHAR(20) NOT NULL DEFAULT 'draft',  -- 'draft' | 'submitted' | 'reviewed'
  lab_data               JSONB DEFAULT '{}'::jsonb,
  symptom_delta          JSONB DEFAULT '{}'::jsonb,
  new_symptoms_text      TEXT,
  medication_compliance  VARCHAR(30),
  submitted_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_follow_up_visits_episode_id ON follow_up_visits(episode_id);

-- ── patient_condition_episodes — S1/S2/S3 status flags ─────────
-- Referenced throughout followUpController.js and physicianController.js
-- (getPendingWork's queue-grouping query in particular). Added
-- defensively with IF NOT EXISTS in case some already exist from a
-- migration not seen in this session.
ALTER TABLE patient_condition_episodes
  ADD COLUMN IF NOT EXISTS has_missing_reports            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_advised_investigations      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS investigation_review_pending    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS investigation_payment_done      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followup_review_pending         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followup_payment_done           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS patient_notified_at             TIMESTAMPTZ;

-- ── Grants ───────────────────────────────────────────────────
GRANT ALL PRIVILEGES ON TABLE advised_investigations TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE follow_up_visits TO thyroconsult_user;

-- ── Verification ─────────────────────────────────────────────
-- SELECT to_regclass('advised_investigations'), to_regclass('follow_up_visits');
-- Expected: both return non-null.
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'patient_condition_episodes'
-- AND column_name IN ('has_missing_reports','has_advised_investigations','investigation_review_pending','followup_review_pending');
-- Expected: 4 rows.
