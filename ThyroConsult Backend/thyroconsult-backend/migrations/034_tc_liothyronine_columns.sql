-- 034_tc_liothyronine_columns.sql
--
-- Porting Hypo's LT4/LT3 medication redesign to TC (thyroid cancer, post-
-- thyroidectomy hormone replacement). TC's existing thyroid_med_* columns
-- become the LT4 side (already exist, reused as-is). This adds the
-- matching LT3 (liothyronine) side, which didn't exist before.
--
-- Also merges TC's G1 ("on thyroid hormone replacement therapy") and G2
-- ("dose changed?") screens into C3 — G1 was a straight duplicate of C3
-- ("currently taking any thyroid medication?"), same pattern already
-- fixed in Hypo. G1's levo_* columns and the orphaned levothyroxine_*
-- columns are left in place, unused going forward — not dropped.
-- dose_changed_status / dose_last_changed_date / dose_change_reason
-- already exist on tc_questionnaire (from the old G2) and are reused
-- directly as the LT4 dose-change columns.

ALTER TABLE tc_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_brand VARCHAR(100);
ALTER TABLE tc_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_name  VARCHAR(100);
ALTER TABLE tc_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_dose  VARCHAR(20);
ALTER TABLE tc_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_timing VARCHAR(30);
ALTER TABLE tc_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_compliance VARCHAR(30);
ALTER TABLE tc_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_since_years INTEGER;
ALTER TABLE tc_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_since_months INTEGER;
ALTER TABLE tc_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_dose_changed_status VARCHAR(20);
ALTER TABLE tc_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_dose_changed_date DATE;
ALTER TABLE tc_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_dose_change_reason VARCHAR(30);

GRANT ALL PRIVILEGES ON TABLE tc_questionnaire TO thyroconsult_user;
