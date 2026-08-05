-- 044_blood_group_other.sql
--
-- Supports the "Opinion for a relative" form's new Blood group -> Other
-- option (e.g. Bombay blood group). The existing blood_group column is
-- VARCHAR(5) — sized for standard codes (A+, AB-, etc.) and too short
-- for a free-text value, so blood_group keeps storing 'other' as a short
-- flag and the actual free-text name goes in this new column instead of
-- widening blood_group itself (used across every patient row, not just
-- relatives — safer to add a companion column than to alter it).

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS blood_group_other VARCHAR(50);

GRANT ALL PRIVILEGES ON TABLE patients TO thyroconsult_user;
