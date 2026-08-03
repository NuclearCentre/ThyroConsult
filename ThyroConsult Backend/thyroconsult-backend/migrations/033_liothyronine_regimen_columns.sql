-- 033_liothyronine_regimen_columns.sql
--
-- The thyroid medication screen now tracks Timing / Compliance / Taking
-- since / Dose-change as two INDEPENDENT sets (one per drug) instead of
-- one shared set, so a combination LT4+LT3 regimen doesn't mix up the
-- two medicines' schedules. LT4's set already existed (thyroid_med_timing
-- etc., dose_changed_status etc. from migration 032). This adds the
-- matching LT3 set.

ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_timing VARCHAR(30);
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_compliance VARCHAR(30);
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_since_years INTEGER;
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_since_months INTEGER;
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_dose_changed_status VARCHAR(20);
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_dose_changed_date DATE;
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_dose_change_reason VARCHAR(30);

-- Item 5: Anti-TPO/Anti-Tg now capture the actual numeric value instead
-- of just positive/negative. Existing hashimotos_anti_tpo/anti_tg
-- columns are reused for the "not tested" status; these hold the value.
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS hashimotos_anti_tpo_value VARCHAR(20);
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS hashimotos_anti_tg_value VARCHAR(20);

-- Item 7: Anaemia type is now multi-select (a patient can have more than
-- one deficiency type at once) — needs a JSONB array, mirroring the
-- existing family_cancer_types pattern. Old singular anaemia_type left
-- in place, unused going forward.
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS anaemia_types JSONB;

GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire TO thyroconsult_user;
