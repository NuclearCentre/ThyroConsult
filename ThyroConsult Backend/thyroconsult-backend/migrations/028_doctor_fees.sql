-- ======================================================================
-- Migration 028: doctor_fees — per-doctor, per-condition pricing
-- Full path: thyroconsult-backend\migrations\028_doctor_fees.sql
--
-- Supports the new patient-facing "Select Doctor" step (Select Condition
-- -> Select Doctor -> Payment -> Questionnaire -> Submit), where each
-- doctor can charge a different amount for the same condition.
--
-- Falls back to condition_fees (the existing global default) when a
-- doctor has no row here for a given condition — so existing doctors
-- keep working with zero setup, and only need a row added when their
-- fee should differ from the default.
--
-- CORRECTED: doctors.id is UUID (not integer) — first version of this
-- migration used INTEGER for doctor_id, which failed with "incompatible
-- types: integer and uuid" the moment Postgres tried to create the FK.
-- If you already ran the broken version and it partially failed, this
-- is still safe to run — DROP TABLE IF EXISTS clears any partial state
-- first (the broken version couldn't have gotten past the FK creation,
-- so there's no real data to lose here).
-- ======================================================================

DROP TABLE IF EXISTS doctor_fees;

CREATE TABLE doctor_fees (
  id              SERIAL PRIMARY KEY,
  doctor_id       UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  condition_type  VARCHAR(10) NOT NULL,  -- short code: hypo/hyper/tc/nodule, matches condition_fees
  base_fee_paise  INTEGER NOT NULL CHECK (base_fee_paise > 0),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by      INTEGER,               -- admin user id, matches condition_fees.updated_by pattern
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (doctor_id, condition_type)
);

CREATE INDEX idx_doctor_fees_lookup ON doctor_fees(doctor_id, condition_type) WHERE is_active = TRUE;

GRANT ALL PRIVILEGES ON TABLE doctor_fees TO thyroconsult_user;
GRANT USAGE, SELECT ON SEQUENCE doctor_fees_id_seq TO thyroconsult_user;

-- Verification:
-- SELECT * FROM doctor_fees;
-- Expected: empty until seed_doctor_fees.js populates test data.
