-- 032_liothyronine_columns.sql
--
-- Adds separate Liothyronine (LT3) medication columns alongside the
-- existing Levothyroxine (LT4) thyroid_med_* columns. Needed because the
-- medication screen now captures LT4 and LT3 as two independent brand/
-- dose selections (shown side by side, either or both populated
-- depending on "Treatment type": Levothyroxine only / Liothyronine only
-- / Combination) rather than a single medication field.
--
-- Applied to hypo_questionnaire only for now — Hyper/TC/Nodule frontends
-- haven't been redesigned yet, so there's nothing to write these columns
-- from on those tables. Add the same 3 columns there when those
-- questionnaires get this same medication-screen treatment.

ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_brand VARCHAR(100);
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_name  VARCHAR(100);
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS liothyronine_dose  VARCHAR(20);

-- "Both" removed as a single hearing-type option — now multi-select
-- (Reduced hearing / Tinnitus, either or both), each with its own onset
-- date. The old sym_hearing_type column only held one value, so this
-- needs its own JSONB column: { types: [...], reduced: {...}, tinnitus: {...} }.
-- Old sym_hearing_type / sym_hearing_since_date / _years / _months / _days
-- columns are left in place (not dropped) — the frontend hydration reads
-- them as a fallback for episodes saved before this change.
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS sym_hearing_data JSONB;

-- Tongue enlargement (macroglossia) previously had no "since when" —
-- just a bare yes/no. Adding duration columns matching the convention
-- used by other simple duration symptoms (e.g. sym_reflexes_*).
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS sym_macroglossia_since_date DATE;
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS sym_macroglossia_years INTEGER;
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS sym_macroglossia_months INTEGER;
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS sym_macroglossia_days INTEGER;

-- Pre-existing gap, unrelated to LT3: hypo_questionnaire's controller
-- whitelist never included dose_changed_status even though the frontend
-- has always sent it — so "has this dose been changed?" (yes/no/unsure)
-- was silently never saved on this table. Column may or may not already
-- exist depending on how it was originally set up; IF NOT EXISTS makes
-- this safe either way.
ALTER TABLE hypo_questionnaire ADD COLUMN IF NOT EXISTS dose_changed_status VARCHAR(20);

GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire TO thyroconsult_user;
