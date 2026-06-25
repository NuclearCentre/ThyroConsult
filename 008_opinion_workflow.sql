-- ============================================================
-- Migration 008: Opinion Workflow
-- Run in pgAdmin on the `thyroconsult` database
-- Run ONCE only
-- ============================================================

-- 1. Pre-defined investigation master list
CREATE TABLE IF NOT EXISTS investigation_master (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category      VARCHAR(100) NOT NULL,
    test_name     VARCHAR(200) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO investigation_master (category, test_name, display_order) VALUES
-- Thyroid Function
('Thyroid Function', 'TSH',                    1),
('Thyroid Function', 'Free T3 (FT3)',           2),
('Thyroid Function', 'Free T4 (FT4)',           3),
('Thyroid Function', 'Total T3',                4),
('Thyroid Function', 'Total T4',                5),
('Thyroid Function', 'T3/T4 Ratio',             6),
-- Thyroid Antibodies
('Thyroid Antibodies', 'Anti-TPO',              10),
('Thyroid Antibodies', 'Anti-Thyroglobulin (Anti-Tg)', 11),
('Thyroid Antibodies', 'TRAb (TSH Receptor Antibody)', 12),
('Thyroid Antibodies', 'TSI (Thyroid Stimulating Immunoglobulin)', 13),
-- Imaging
('Imaging', 'USG Neck (Thyroid)',               20),
('Imaging', 'USG Neck with Doppler',            21),
('Imaging', 'CT Neck',                          22),
('Imaging', 'MRI Neck',                         23),
('Imaging', 'PET Scan',                         24),
('Imaging', 'Bone Scan',                        25),
-- Procedures
('Procedures', 'FNAC (Fine Needle Aspiration Cytology)', 30),
('Procedures', 'Thyroid Scintigraphy (Tc-99m)',  31),
('Procedures', 'Radioiodine Uptake (RAIU)',      32),
('Procedures', 'I-131 Whole Body Scan',          33),
-- Cancer Markers
('Cancer Markers', 'Serum Thyroglobulin',        40),
('Cancer Markers', 'Serum Calcitonin',           41),
('Cancer Markers', 'CEA (Carcinoembryonic Antigen)', 42),
-- General / Metabolic
('General / Metabolic', 'Complete Blood Count (CBC)', 50),
('General / Metabolic', 'Fasting Blood Sugar (FBS)',  51),
('General / Metabolic', 'HbA1c',                52),
('General / Metabolic', 'Lipid Profile',         53),
('General / Metabolic', 'Liver Function Tests (LFT)', 54),
('General / Metabolic', 'Kidney Function Tests (KFT / RFT)', 55),
('General / Metabolic', 'Serum Calcium',         56),
('General / Metabolic', 'Serum Vitamin D3 (25-OH)', 57),
('General / Metabolic', 'Serum Vitamin B12',     58),
('General / Metabolic', 'Serum Iron / TIBC / Ferritin', 59),
('General / Metabolic', 'Serum Cortisol (Morning)', 60),
('General / Metabolic', 'ECG',                  61);

-- 2. Opinions table (structured written opinion by doctor)
CREATE TABLE IF NOT EXISTS opinions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id          UUID NOT NULL REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
    patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id           UUID NOT NULL REFERENCES doctors(id),

    -- Structured sections
    clinical_summary    TEXT,           -- Section 1: what the patient presented with
    impression          TEXT,           -- Section 2: doctor's clinical impression / diagnosis
    advice              TEXT,           -- Section 3: treatment / lifestyle / medication advice
    investigations      JSONB,          -- Section 4: array of { id, name, category, is_custom, note }
    remarks             TEXT,           -- Optional free text at end

    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'submitted', 'acknowledged')),

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at        TIMESTAMPTZ,
    acknowledged_at     TIMESTAMPTZ,
    last_amended_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_opinions_episode  ON opinions(episode_id);
CREATE INDEX IF NOT EXISTS idx_opinions_patient  ON opinions(patient_id);
CREATE INDEX IF NOT EXISTS idx_opinions_doctor   ON opinions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_opinions_status   ON opinions(status);

-- 3. Patient acknowledgement log (full audit trail)
CREATE TABLE IF NOT EXISTS patient_acknowledgements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opinion_id      UUID NOT NULL REFERENCES opinions(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address      VARCHAR(45),
    user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_ack_opinion  ON patient_acknowledgements(opinion_id);
CREATE INDEX IF NOT EXISTS idx_ack_patient  ON patient_acknowledgements(patient_id);

-- 4. Doctor notification tracking (escalation schedule)
CREATE TABLE IF NOT EXISTS doctor_alert_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id      UUID NOT NULL REFERENCES patient_condition_episodes(id) ON DELETE CASCADE,
    doctor_id       UUID NOT NULL REFERENCES doctors(id),
    alert_stage     VARCHAR(30) NOT NULL,
                    -- 'immediate' | '0_24h' | '24_48h_1' | '24_48h_2' | '24_48h_3'
                    -- | '48_72h' (repeating every 2h) | 'stopped'
    channel         VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp', 'email', 'both')),
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success         BOOLEAN NOT NULL DEFAULT TRUE,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_alert_log_episode ON doctor_alert_log(episode_id);
CREATE INDEX IF NOT EXISTS idx_alert_log_doctor  ON doctor_alert_log(doctor_id);

-- 5. New columns on patient_condition_episodes for opinion workflow
ALTER TABLE patient_condition_episodes
    ADD COLUMN IF NOT EXISTS opinion_id             UUID REFERENCES opinions(id),
    ADD COLUMN IF NOT EXISTS opinion_submitted_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS opinion_acknowledged_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS alert_immediate_sent   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS alert_0_24h_sent       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS alert_24_48h_count     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS alert_48_72h_count     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS alert_stopped          BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS episode_closed_at      TIMESTAMPTZ;

-- 6. Grant privileges
GRANT ALL PRIVILEGES ON TABLE investigation_master       TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE opinions                   TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE patient_acknowledgements   TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE doctor_alert_log           TO thyroconsult_user;

-- Sequences created by gen_random_uuid() need no extra grants
-- but grant SELECT on all sequences just in case
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO thyroconsult_user;

-- ============================================================
-- Verify after running:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN (
--   'investigation_master','opinions',
--   'patient_acknowledgements','doctor_alert_log'
-- );
-- Expected: 4 rows
-- ============================================================
