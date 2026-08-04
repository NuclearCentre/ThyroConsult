-- 039_guardian_photo_column.sql
-- New requirement per Nuclear: a SEPARATE guardian photo, for
-- documentation purposes only, distinct from the minor patient's own
-- photo (photo_path — stays the mainstay field, unchanged). Mirrors the
-- existing photo_path/photo_captured_at/photo_hash trio exactly, under
-- its own guardian_ prefix, so the two can never collide.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS guardian_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS guardian_photo_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guardian_photo_hash VARCHAR(64);

GRANT ALL PRIVILEGES ON TABLE patients TO thyroconsult_user;
