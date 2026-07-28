-- ============================================================
-- ThyroConsult — Complete Database Schema
-- HIPAA-compliant schema with AES-256 encrypted PHI fields
-- All PHI stored as encrypted ciphertext
-- Searchable fields use HMAC hashes (separate column)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'doctor', 'patient');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE consultation_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE consultation_type AS ENUM ('video', 'audio', 'text');
CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE document_category AS ENUM ('blood_report', 'scan_usg', 'prescription', 'biopsy', 'other');
CREATE TYPE otp_purpose AS ENUM ('mobile_verify', 'whatsapp_verify', 'email_verify', 'login', 'password_reset');
CREATE TYPE consent_type AS ENUM ('treatment', 'data_privacy', 'telemedicine', 'photo');
CREATE TYPE audit_result AS ENUM ('success', 'failure', 'blocked');

-- ============================================================
-- ADMINS TABLE
-- ============================================================
CREATE TABLE admins (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email               VARCHAR(255) NOT NULL UNIQUE,
  email_hash          VARCHAR(64) NOT NULL UNIQUE,
  password_hash       VARCHAR(255) NOT NULL,
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  role                user_role NOT NULL DEFAULT 'admin',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at       TIMESTAMPTZ,
  last_login_ip       VARCHAR(45),
  failed_login_count  INTEGER NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  mfa_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_secret          TEXT,
  password_changed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOCTORS TABLE
-- PHI fields encrypted at rest
-- ============================================================
CREATE TABLE doctors (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Authentication
  email                 TEXT NOT NULL,            -- encrypted PHI
  email_hash            VARCHAR(64) NOT NULL UNIQUE,  -- HMAC for lookup
  mobile                TEXT NOT NULL,            -- encrypted PHI
  mobile_hash           VARCHAR(64) NOT NULL UNIQUE,
  password_hash         VARCHAR(255) NOT NULL,
  -- Identity (all encrypted)
  first_name            TEXT NOT NULL,
  middle_name           TEXT,
  last_name             TEXT NOT NULL,
  -- Professional
  registration_number   VARCHAR(50) UNIQUE,
  specialisation        VARCHAR(200),
  qualifications        TEXT,
  experience_years      INTEGER,
  bio                   TEXT,
  -- Status
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified           BOOLEAN NOT NULL DEFAULT FALSE,
  is_available_today    BOOLEAN NOT NULL DEFAULT FALSE,
  consultation_fee      DECIMAL(10,2) NOT NULL DEFAULT 1200.00,
  -- Security
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  last_login_ip         VARCHAR(45),
  mfa_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES admins(id)
);

-- ============================================================
-- PATIENTS TABLE
-- All PHI fields AES-256 encrypted
-- HMAC hashes stored separately for searchability
-- ============================================================
CREATE TABLE patients (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_code          VARCHAR(20) NOT NULL UNIQUE,  -- PT-YYYY-NNNN
  -- Authentication
  mobile                TEXT NOT NULL,            -- encrypted PHI
  mobile_hash           VARCHAR(64) NOT NULL UNIQUE,
  whatsapp              TEXT,                     -- encrypted PHI
  whatsapp_hash         VARCHAR(64) UNIQUE,
  email                 TEXT NOT NULL,            -- encrypted PHI
  email_hash            VARCHAR(64) NOT NULL UNIQUE,
  password_hash         VARCHAR(255) NOT NULL,
  -- Personal identity (all encrypted PHI)
  first_name            TEXT NOT NULL,
  middle_name           TEXT,
  last_name             TEXT NOT NULL,
  guardian_name         TEXT,                     -- father/mother/spouse
  guardian_relation     VARCHAR(50),
  -- Demographics (encrypted)
  dob                   TEXT,                     -- encrypted date string
  dob_auto_calculated   BOOLEAN NOT NULL DEFAULT FALSE,
  gender                gender_type NOT NULL,
  blood_group           VARCHAR(5),
  -- Contact (encrypted)
  address_line1         TEXT,
  address_line2         TEXT,
  city                  TEXT,
  state                 TEXT,
  pincode               TEXT,
  -- Verification status
  mobile_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Photo (stored as encrypted blob reference)
  photo_path            TEXT,                     -- encrypted path
  photo_captured_at     TIMESTAMPTZ,
  photo_hash            VARCHAR(64),              -- SHA-256 of original
  -- Registration
  registration_step     INTEGER NOT NULL DEFAULT 1,  -- 1-7 onboarding steps
  registration_complete BOOLEAN NOT NULL DEFAULT FALSE,
  -- Assigned doctor
  primary_doctor_id     UUID REFERENCES doctors(id),
  -- Security
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  last_login_ip         VARCHAR(45),
  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-generate patient code trigger
CREATE SEQUENCE patient_code_seq START 1;
CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.patient_code := 'PT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('patient_code_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_patient_code
  BEFORE INSERT ON patients
  FOR EACH ROW EXECUTE FUNCTION generate_patient_code();

-- ============================================================
-- OTP VERIFICATION TABLE
-- ============================================================
CREATE TABLE otp_verifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier    VARCHAR(64) NOT NULL,   -- HMAC hash of mobile/email
  purpose       otp_purpose NOT NULL,
  otp_hash      VARCHAR(255) NOT NULL,  -- bcrypt hash of OTP
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  verified      BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at   TIMESTAMPTZ,
  ip_address    VARCHAR(45),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_otp_identifier ON otp_verifications(identifier, purpose);
CREATE INDEX idx_otp_expires ON otp_verifications(expires_at);

-- ============================================================
-- REFRESH TOKENS TABLE
-- ============================================================
CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL,
  user_role     user_role NOT NULL,
  token_hash    VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 of token
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked       BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at    TIMESTAMPTZ,
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id, user_role);

-- ============================================================
-- CONSENTS TABLE
-- HIPAA §164.508 — written authorisation required
-- ============================================================
CREATE TABLE consents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  consent_type      consent_type NOT NULL,
  version           VARCHAR(20) NOT NULL DEFAULT '1.0',
  -- Consent record
  agreed            BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_at         TIMESTAMPTZ,
  ip_address        VARCHAR(45),
  user_agent        TEXT,
  -- Tamper-evident audit
  signature_data    TEXT,                -- base64 signature image or typed name
  document_hash     VARCHAR(64),        -- SHA-256 of consent document version
  audit_hash        VARCHAR(64),        -- SHA-256 of (patient_id+consent_type+agreed_at+ip)
  -- Withdrawal
  withdrawn         BOOLEAN NOT NULL DEFAULT FALSE,
  withdrawn_at      TIMESTAMPTZ,
  withdrawal_reason TEXT,
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(patient_id, consent_type)
);
CREATE INDEX idx_consent_patient ON consents(patient_id);

-- ============================================================
-- APPOINTMENTS TABLE
-- ============================================================
CREATE TABLE appointments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id        UUID NOT NULL REFERENCES patients(id),
  doctor_id         UUID NOT NULL REFERENCES doctors(id),
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 30,
  consultation_type consultation_type NOT NULL DEFAULT 'video',
  status            consultation_status NOT NULL DEFAULT 'scheduled',
  -- Notes (encrypted PHI)
  patient_notes     TEXT,               -- encrypted, pre-consultation notes from patient
  cancellation_reason TEXT,
  -- Video session
  session_link      TEXT,               -- encrypted video call link
  session_started_at TIMESTAMPTZ,
  session_ended_at  TIMESTAMPTZ,
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_appt_patient ON appointments(patient_id);
CREATE INDEX idx_appt_doctor ON appointments(doctor_id);
CREATE INDEX idx_appt_scheduled ON appointments(scheduled_at);
CREATE INDEX idx_appt_status ON appointments(status);

-- ============================================================
-- CONSULTATIONS TABLE
-- Full record of completed consultations
-- ============================================================
CREATE TABLE consultations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id      UUID REFERENCES appointments(id),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  doctor_id           UUID NOT NULL REFERENCES doctors(id),
  consultation_number VARCHAR(20) NOT NULL UNIQUE,  -- CONS-YYYY-NNNN
  consultation_type   consultation_type NOT NULL DEFAULT 'video',
  -- Clinical data (all encrypted PHI)
  chief_complaint     TEXT,
  history             TEXT,
  examination_notes   TEXT,
  diagnosis           TEXT,
  treatment_plan      TEXT,
  doctor_notes        TEXT,
  follow_up_notes     TEXT,
  -- Status
  status              consultation_status NOT NULL DEFAULT 'scheduled',
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  duration_minutes    INTEGER,
  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE SEQUENCE consultation_seq START 1;
CREATE INDEX idx_consult_patient ON consultations(patient_id);
CREATE INDEX idx_consult_doctor ON consultations(doctor_id);

-- ============================================================
-- PRESCRIPTIONS TABLE
-- ============================================================
CREATE TABLE prescriptions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultation_id   UUID NOT NULL REFERENCES consultations(id),
  patient_id        UUID NOT NULL REFERENCES patients(id),
  doctor_id         UUID NOT NULL REFERENCES doctors(id),
  -- Content (encrypted PHI)
  content           TEXT NOT NULL,      -- encrypted prescription text
  medications       TEXT,               -- encrypted JSON array
  instructions      TEXT,
  -- File
  pdf_path          TEXT,               -- encrypted path to generated PDF
  pdf_hash          VARCHAR(64),
  -- Timestamps
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rx_patient ON prescriptions(patient_id);
CREATE INDEX idx_rx_consult ON prescriptions(consultation_id);

-- ============================================================
-- DOCUMENTS TABLE
-- Patient uploaded medical documents
-- ============================================================
CREATE TABLE documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id        UUID NOT NULL REFERENCES patients(id),
  -- Category
  category          document_category NOT NULL,
  -- Encrypted metadata
  original_name     TEXT NOT NULL,      -- encrypted original filename
  storage_path      TEXT NOT NULL,      -- encrypted storage path
  mime_type         VARCHAR(100) NOT NULL,
  file_size_bytes   INTEGER NOT NULL,
  file_hash         VARCHAR(64) NOT NULL,  -- SHA-256 integrity check
  -- Optional associations
  consultation_id   UUID REFERENCES consultations(id),
  -- Parsed values for blood reports (encrypted JSON)
  report_values     TEXT,               -- encrypted JSON { TSH: 4.2, unit: mIU/L, date: ..., lab: ... }
  report_date       DATE,               -- unencrypted for sorting/graphing
  -- Access control
  uploaded_by       UUID NOT NULL,      -- patient_id or doctor_id
  uploaded_by_role  user_role NOT NULL,
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMPTZ,
  deleted_by        UUID,
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_doc_patient ON documents(patient_id, is_deleted);
CREATE INDEX idx_doc_category ON documents(patient_id, category);
CREATE INDEX idx_doc_report_date ON documents(patient_id, report_date);

-- ============================================================
-- BLOOD REPORT VALUES TABLE
-- Structured blood test values extracted from documents
-- Enables time-series graphing
-- ============================================================
CREATE TABLE blood_report_values (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id),
  patient_id      UUID NOT NULL REFERENCES patients(id),
  test_name       VARCHAR(100) NOT NULL,       -- e.g. TSH, Free T3, Haemoglobin
  test_name_lower VARCHAR(100) NOT NULL,       -- lowercase for search
  value           DECIMAL(15,4),
  unit            VARCHAR(50),
  reference_low   DECIMAL(15,4),
  reference_high  DECIMAL(15,4),
  is_abnormal     BOOLEAN,
  lab_name        TEXT,                        -- encrypted
  report_date     DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_brv_patient_test ON blood_report_values(patient_id, test_name_lower);
CREATE INDEX idx_brv_date ON blood_report_values(patient_id, report_date);

-- ============================================================
-- PAYMENTS TABLE
-- ============================================================
CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id        UUID REFERENCES appointments(id),
  patient_id            UUID NOT NULL REFERENCES patients(id),
  doctor_id             UUID NOT NULL REFERENCES doctors(id),
  -- Razorpay
  razorpay_order_id     VARCHAR(100) UNIQUE,
  razorpay_payment_id   VARCHAR(100) UNIQUE,
  razorpay_signature    TEXT,
  -- Amounts
  consultation_fee      DECIMAL(10,2) NOT NULL,
  platform_fee          DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  gst_amount            DECIMAL(10,2) NOT NULL,
  total_amount          DECIMAL(10,2) NOT NULL,
  currency              VARCHAR(10) NOT NULL DEFAULT 'INR',
  -- Status
  status                payment_status NOT NULL DEFAULT 'pending',
  payment_method        VARCHAR(50),             -- upi, card, netbanking, wallet
  paid_at               TIMESTAMPTZ,
  refund_amount         DECIMAL(10,2),
  refund_reason         TEXT,
  refunded_at           TIMESTAMPTZ,
  -- Invoice
  invoice_number        VARCHAR(30) UNIQUE,      -- INV-YYYY-NNNN
  invoice_pdf_path      TEXT,                    -- encrypted path
  invoice_generated_at  TIMESTAMPTZ,
  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE SEQUENCE invoice_seq START 1;
CREATE INDEX idx_payment_patient ON payments(patient_id);
CREATE INDEX idx_payment_status ON payments(status);

-- Auto-generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('invoice_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_invoice_number
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- ============================================================
-- AUDIT LOGS TABLE
-- Every PHI access, modification, and system event
-- HIPAA requires 6-year retention
-- ============================================================
CREATE TABLE audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  event_type      VARCHAR(100) NOT NULL,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id         UUID,
  user_role       user_role,
  patient_id      UUID,
  doctor_id       UUID,
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  resource        VARCHAR(100),
  resource_id     UUID,
  action_detail   TEXT,
  result          audit_result NOT NULL DEFAULT 'success',
  session_id      VARCHAR(100),
  phi_accessed    BOOLEAN NOT NULL DEFAULT FALSE,
  changes         JSONB,
  request_id      UUID DEFAULT uuid_generate_v4()
);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_patient ON audit_logs(patient_id);
CREATE INDEX idx_audit_event ON audit_logs(event_type);
CREATE INDEX idx_audit_result ON audit_logs(result);

-- Audit logs are append-only — prevent updates and deletes
CREATE OR REPLACE RULE audit_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL,
  user_role       user_role NOT NULL,
  type            VARCHAR(50) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  message         TEXT NOT NULL,
  channel         VARCHAR(20) NOT NULL,  -- sms, whatsapp, email, in_app
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_user ON notifications(user_id, user_role);
CREATE INDEX idx_notif_status ON notifications(status);

-- ============================================================
-- UPDATED_AT TRIGGER (applied to all tables)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_admins_updated_at BEFORE UPDATE ON admins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_doctors_updated_at BEFORE UPDATE ON doctors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_consents_updated_at BEFORE UPDATE ON consents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_consultations_updated_at BEFORE UPDATE ON consultations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (patients can only see their own data)
-- ============================================================
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_report_values ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VIEWS (for admin reporting — no PHI exposed)
-- ============================================================
CREATE VIEW v_consultation_stats AS
SELECT
  DATE_TRUNC('month', c.created_at) AS month,
  d.id AS doctor_id,
  COUNT(*) AS total_consultations,
  COUNT(CASE WHEN c.status = 'completed' THEN 1 END) AS completed,
  COUNT(CASE WHEN c.status = 'cancelled' THEN 1 END) AS cancelled,
  SUM(p.total_amount) FILTER (WHERE p.status = 'confirmed') AS revenue
FROM consultations c
JOIN doctors d ON c.doctor_id = d.id
LEFT JOIN payments p ON p.appointment_id = c.appointment_id
GROUP BY DATE_TRUNC('month', c.created_at), d.id;

CREATE VIEW v_platform_stats AS
SELECT
  (SELECT COUNT(*) FROM patients WHERE registration_complete = TRUE) AS total_patients,
  (SELECT COUNT(*) FROM doctors WHERE is_active = TRUE) AS active_doctors,
  (SELECT COUNT(*) FROM consultations WHERE status = 'completed'
   AND DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', NOW())) AS consultations_this_month,
  (SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE status = 'confirmed'
   AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', NOW())) AS revenue_this_month;
