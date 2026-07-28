-- ============================================================
-- Migration 007: Follow-up visits & payment gating
-- Full path: thyroconsult-backend\migrations\007_followup_payments.sql
--
-- IMPORTANT CORRECTIONS from database inspection:
--   - All primary keys are UUID (not SERIAL INTEGER)
--   - episodes table is called patient_condition_episodes
--   - users table does not exist (use doctors/admins instead)
--   - Original payments table exists (appointment-based, UUID pk)
--     → follow-up payments stored in new followup_payments table
--
-- Run once in pgAdmin on thyroconsult database as superuser
-- All statements use IF NOT EXISTS — safe to re-run
-- ============================================================

-- ── condition_fees ───────────────────────────────────────────
-- Admin-controlled per-condition pricing for follow-up payments
CREATE TABLE IF NOT EXISTS condition_fees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_type    VARCHAR(20) NOT NULL UNIQUE,
  -- 'hypo' | 'hyper' | 'tc' | 'nodule'
  base_fee_paise    INTEGER NOT NULL DEFAULT 150000,
  -- stored in paise: ₹1500 = 150000 paise
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by        UUID REFERENCES admins(id),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default fees (₹1500 per condition)
-- ON CONFLICT makes this safe to re-run
INSERT INTO condition_fees (condition_type, base_fee_paise) VALUES
  ('hypo',   150000),
  ('hyper',  150000),
  ('tc',     150000),
  ('nodule', 150000)
ON CONFLICT (condition_type) DO NOTHING;

-- ── followup_payments ────────────────────────────────────────
-- Separate from the existing payments table (appointment-based)
-- This table handles S1 / S2 / S3 follow-up payment events only
CREATE TABLE IF NOT EXISTS followup_payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID NOT NULL REFERENCES patients(id),
  episode_id            UUID NOT NULL REFERENCES patient_condition_episodes(id),
  payment_type          VARCHAR(30) NOT NULL,
  -- 'initial' | 's1_full' | 's2_followup' | 's2_full' | 's3_full'
  condition_type        VARCHAR(20) NOT NULL,
  base_fee_paise        INTEGER NOT NULL,
  discount_pct          SMALLINT NOT NULL DEFAULT 0,
  amount_paise          INTEGER NOT NULL,
  -- Razorpay fields
  razorpay_order_id     VARCHAR(100) UNIQUE,
  razorpay_payment_id   VARCHAR(100),
  razorpay_signature    VARCHAR(255),
  status                VARCHAR(20) NOT NULL DEFAULT 'created',
  -- 'created' | 'paid' | 'failed' | 'refunded'
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── follow_up_visits ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_up_visits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id            UUID NOT NULL REFERENCES patient_condition_episodes(id),
  patient_id            UUID NOT NULL REFERENCES patients(id),
  payment_id            UUID REFERENCES followup_payments(id),
  visit_number          SMALLINT NOT NULL DEFAULT 2,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- 'draft' | 'submitted' | 'reviewed'
  lab_data              JSONB DEFAULT '{}',
  symptom_delta         JSONB DEFAULT '{}',
  new_symptoms_text     TEXT,
  medication_compliance VARCHAR(20),
  -- 'regular' | 'irregular' | 'skips_sometimes'
  submitted_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── advised_investigations ───────────────────────────────────
CREATE TABLE IF NOT EXISTS advised_investigations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id            UUID NOT NULL REFERENCES patient_condition_episodes(id),
  patient_id            UUID NOT NULL REFERENCES patients(id),
  test_name             VARCHAR(200) NOT NULL,
  notes                 TEXT,
  source                VARCHAR(10) NOT NULL DEFAULT 'doctor',
  -- 'doctor' | 'self'
  advised_by            UUID REFERENCES doctors(id),
  -- NULL if self-added by patient
  report_path           TEXT,
  report_uploaded_at    TIMESTAMPTZ,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'uploaded' | 'reviewed'
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── New columns on patient_condition_episodes ─────────────────
-- Powers the follow-up payment gating logic
ALTER TABLE patient_condition_episodes
  ADD COLUMN IF NOT EXISTS submitted_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_missing_reports          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_advised_investigations   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS investigation_payment_done   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS investigation_review_pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followup_payment_done        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followup_review_pending      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS patient_notified_at          TIMESTAMPTZ;

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_followup_payments_episode
  ON followup_payments(episode_id);
CREATE INDEX IF NOT EXISTS idx_followup_payments_patient
  ON followup_payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_followup_payments_status
  ON followup_payments(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_visits_episode
  ON follow_up_visits(episode_id);
CREATE INDEX IF NOT EXISTS idx_advised_inv_episode
  ON advised_investigations(episode_id);
CREATE INDEX IF NOT EXISTS idx_advised_inv_status
  ON advised_investigations(status);

-- ── Grants ───────────────────────────────────────────────────
GRANT ALL PRIVILEGES ON TABLE condition_fees             TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE followup_payments          TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE follow_up_visits           TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE advised_investigations     TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE patient_condition_episodes TO thyroconsult_user;

-- ── Verification ─────────────────────────────────────────────
-- Run these after migration to confirm success:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN (
--   'condition_fees','followup_payments',
--   'follow_up_visits','advised_investigations'
-- );
-- Expected: 4 rows
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'patient_condition_episodes'
-- AND column_name = 'has_missing_reports';
-- Expected: 1 row
