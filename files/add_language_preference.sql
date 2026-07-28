-- Migration: add language_preference to patients table
-- File: migrations/add_language_preference.sql
-- Run in pgAdmin Query Tool against the thyroconsult database

-- Step 1: Add the column
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS language_preference VARCHAR(5) NOT NULL DEFAULT 'en';

-- Step 2: Add a check constraint to allow only valid language codes
ALTER TABLE patients
ADD CONSTRAINT chk_language_preference
CHECK (language_preference IN ('en','hi','mr','ta','te','kn','ml','bn','gu','pa','or'));

-- Step 3: Add an index (optional but useful if you ever query by language)
CREATE INDEX IF NOT EXISTS idx_patients_language_preference
ON patients (language_preference);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'patients' AND column_name = 'language_preference';
