// ============================================================
// Full path:
//   thyroconsult-backend\src\services\hyperReportFormatter.js
//
// Second condition (after Hypo) to get the "single-file,
// question-by-question" report. Covers all 60 answerable pages of
// hyper_questionnaire, in the exact same order as HyperQuestionnaire.js's
// `allPages` array (A3, B1-B5, C1-C5, D1-D6, E1-E5, F1-F25, G2-G5, H1-H9).
//
// Field names here were pulled directly from HyperQuestionnaire.js's own
// get()/set() calls (post the field-mapping-audit fix in this same
// session — see migration 041 and the HYPER_Q_COLUMNS whitelist) —
// nothing guessed. Formatting logic is written fresh here, not
// copy-pasted from the frontend's JSX, but produces the same information
// a physician would see building the picture themselves from the raw
// record. Same helper-function shape as hypoReportFormatter.js so the
// two files stay easy to compare/maintain side by side.
// ============================================================

// ─── Generic formatting helpers (see hypoReportFormatter.js for the
// canonical versions — duplicated here rather than imported, matching
// that file's own stated design: each formatter is self-contained) ────────

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function words(s) { return s ? String(s).replace(/_/g, ' ') : s; }

// Renders a duration from whichever of {since_date, years, months} is
// present. yearsKey/monthsKey/dateKey let callers pass whichever actual
// column names apply (Hyper's naming isn't 100% uniform across modules).
function durationPhrase(row, dateKey, yearsKey, monthsKey) {
  const date = dateKey ? row[dateKey] : null;
  const years = yearsKey ? row[yearsKey] : null;
  const months = monthsKey ? row[monthsKey] : null;
  if (date) return `since ${fmtDate(date)}`;
  const parts = [];
  if (years) parts.push(`${years} year${years > 1 ? 's' : ''}`);
  if (months) parts.push(`${months} month${months > 1 ? 's' : ''}`);
  return parts.length ? `for ${parts.join(' ')}` : '';
}

// Generic: plain Yes/No/Unsure status question, optionally with a
// since_date/years/months duration once "yes".
function ynDuration(row, label, statusCol, { dateKey, yearsKey, monthsKey, extra } = {}) {
  const status = row[statusCol];
  if (!status) return null;
  if (status !== 'yes') return `${label}: ${status === 'unsure' ? 'Unsure' : 'No'}`;
  const dur = (dateKey || yearsKey || monthsKey) ? durationPhrase(row, dateKey, yearsKey, monthsKey) : '';
  const extraText = extra ? extra(row) : '';
  return `${label}: Yes${dur ? ' — ' + dur : ''}${extraText ? '. ' + extraText : ''}`;
}

// Generic: repeatable-medicine JSONB array, shape [{name, dose/dose_mg,
// freq/freq_per_day, since_months, ...}].
function medListText(meds) {
  if (!Array.isArray(meds)) return '';
  return meds.filter(m => m?.name).map(m => {
    const dose = m.dose_mg || m.dose;
    const freq = m.freq_per_day || m.freq;
    return `${m.name}${dose ? ' ' + dose + ' mg' : ''}${freq ? ' — ' + freq + 'x/day' : ''}`;
  }).join(', ');
}

// Generic: comorbidity shape used by H1/H3 (dyslipidaemia, anaemia) —
// status / since_months / on_med / {prefix}_meds JSONB array.
function comorbidityMonths(row, label, prefix, { extraLabel } = {}) {
  const status = row[`${prefix}_status`];
  if (!status) return null;
  if (status !== 'yes') return `${label}: ${status === 'unsure' ? 'Unsure' : 'No'}`;
  const months = row[`${prefix}_since_months`];
  const dur = months ? `for ${Math.floor(months / 12)} year${Math.floor(months / 12) !== 1 ? 's' : ''}${months % 12 ? ' ' + (months % 12) + ' months' : ''}` : '';
  const onMed = row[`${prefix}_on_med`];
  const meds = row[`${prefix}_meds`];
  const medText = onMed === 'yes' && Array.isArray(meds) && meds.some(m => m?.name) ? ' On ' + medListText(meds) + '.' : '';
  return `${label}: Yes${dur ? ' — ' + dur : ''}.${extraLabel ? ' ' + extraLabel(row) : ''}${medText}`;
}

// Generic: lab test shape — {prefix}_value/unit/date/ref_low/ref_high,
// gated by {prefix}_status.
function labTest(row, label, prefix) {
  const status = row[`${prefix}_status`];
  if (!status) return null;
  if (status !== 'yes') return `${label}: ${status === 'unsure' ? 'Unsure' : 'Not tested'}`;
  const value = row[`${prefix}_value`];
  if (!value) return `${label}: Tested, value not recorded`;
  const unit = row[`${prefix}_unit`] || '';
  const date = row[`${prefix}_date`];
  const refLow = row[`${prefix}_ref_low`];
  const refHigh = row[`${prefix}_ref_high`];
  const ref = (refLow || refHigh) ? ` (ref ${refLow ?? '?'}–${refHigh ?? '?'})` : '';
  return `${label}: ${value} ${unit}${ref}${date ? ' — ' + fmtDate(date) : ''}`;
}

// Generic Module-F symptom line: sym_{key}_status + optional
// since_date/years/months + a caller-supplied "extra" formatter for the
// symptom-specific fields (severity, direction, type, etc.)
function symptom(row, label, key, { extra } = {}) {
  const status = row[`sym_${key}_status`];
  if (!status) return null;
  if (status !== 'yes') return `${label}: ${status === 'unsure' ? 'Unsure' : 'No'}`;
  const dur = durationPhrase(row, `sym_${key}_since_date`, `sym_${key}_years`, `sym_${key}_months`);
  const extraText = extra ? extra(row) : '';
  return `${label}: Yes${dur ? ' — ' + dur : ''}${extraText ? '. ' + extraText : ''}`;
}

// ─── Page-by-page config, in HyperQuestionnaire.js's allPages order ───────

const PAGES = [
  // ── MODULE A — DEMOGRAPHICS ──
  { id: 'A3', q: 'Marital status', f: row => row.marital_status ? `Marital status: ${cap(row.marital_status)}` : null },

  // ── MODULE B — REPRODUCTIVE HISTORY (female patients only) ──
  { id: 'B1', q: 'Hysterectomy', f: row => ynDuration(row, 'Hysterectomy', 'hysterectomy_status', {
    extra: r => r.hysterectomy_reason ? `Reason: ${r.hysterectomy_reason === 'other' ? r.hysterectomy_reason_other : words(r.hysterectomy_reason)}${r.hysterectomy_month && r.hysterectomy_year ? `. Done ${r.hysterectomy_month}/${r.hysterectomy_year}` : r.hysterectomy_year ? `. Done in ${r.hysterectomy_year}` : ''}` : '',
  }) },
  { id: 'B2', q: 'Menopausal status', f: row => {
    if (!row.menopause_status) return null;
    if (row.menopause_status !== 'post') return `Menopausal status: ${row.menopause_status === 'pre' ? 'Pre-menopausal' : 'Peri-menopausal'}`;
    return `Menopausal status: Post-menopausal${row.menopause_year ? ` (since ${row.menopause_year})` : ''}`;
  } },
  { id: 'B3', q: 'Menstrual cycle changes', f: row => ynDuration(row, 'Menstrual cycle changes', 'menstrual_change_status', {
    dateKey: 'menstrual_since_date', yearsKey: 'menstrual_years', monthsKey: 'menstrual_months',
    extra: r => [r.menstrual_pattern ? cap(r.menstrual_pattern) : '', Array.isArray(r.menstrual_flow) && r.menstrual_flow.length ? r.menstrual_flow.join(', ') + ' flow' : ''].filter(Boolean).join(' — '),
  }) },
  { id: 'B4', q: 'Last menstrual period (LMP)', f: row => row.lmp_date ? `LMP: ${fmtDate(row.lmp_date)}` : null },
  { id: 'B5', q: 'Currently pregnant / trying to conceive', f: row => {
    if (!row.pregnancy_status) return null;
    if (row.pregnancy_status !== 'yes') return `Pregnancy: ${row.pregnancy_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Pregnancy: Yes${row.edd_date ? ` — EDD ${fmtDate(row.edd_date)}` : ''}`;
  } },

  // ── MODULE C — THYROID DISEASE & MEDICATION HISTORY ──
  { id: 'C1', q: 'Previously diagnosed thyroid condition', f: row => {
    if (!row.thyroid_dx_status) return null;
    if (row.thyroid_dx_status !== 'yes') return `Previous thyroid diagnosis: ${row.thyroid_dx_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Previous thyroid diagnosis: ${words(row.thyroid_dx_type)}${row.thyroid_dx_year ? ` (${row.thyroid_dx_year})` : ''}`;
  } },
  { id: 'C2a', q: 'Thyroid surgery history', f: row => {
    if (!row.thyroid_surgery_status) return null;
    if (row.thyroid_surgery_status !== 'yes') return `Thyroid surgery: ${row.thyroid_surgery_status === 'unsure' ? 'Unsure' : 'No'}`;
    const type = row.thyroid_surgery_type === 'hemi' ? `Hemithyroidectomy (${row.thyroid_surgery_side || '?'})` : cap(words(row.thyroid_surgery_type));
    const date = row.thyroid_surgery_month && row.thyroid_surgery_year ? ` — done ${row.thyroid_surgery_month}/${row.thyroid_surgery_year}` : row.thyroid_surgery_year ? ` — done in ${row.thyroid_surgery_year}` : '';
    return `Thyroid surgery: ${type}${date}`;
  } },
  { id: 'C2b', q: 'Radioiodine (RAI) therapy history', f: row => {
    if (!row.rai_received) return null;
    if (row.rai_received !== 'yes') return `RAI therapy: ${row.rai_received === 'unsure' ? 'Unsure' : 'No'}`;
    const courses = (Array.isArray(row.rai_courses) ? row.rai_courses : []).filter(c => c?.dose_mci && c?.year);
    const courseText = courses.length
      ? courses.map(c => `${c.dose_mci} mCi on ${c.month || '?'}/${c.year}`).join('; ')
      : 'Received (details not recorded)';
    return `RAI therapy: Yes — ${courseText}${row.rai_post_hypothyroid === 'yes' ? '. Became hypothyroid after RAI' : ''}`;
  } },
  { id: 'C3', q: 'Current thyroid medication', f: row => {
    if (!row.med_status) return null;
    if (row.med_status !== 'yes') return `Current thyroid medication: ${row.med_status === 'unsure' ? 'Unsure' : 'No'}`;
    if (!row.med_drug_name) return 'Current thyroid medication: Yes (details not recorded)';
    const timings = Array.isArray(row.med_timing) ? row.med_timing.map(t => t?.timing).filter(Boolean) : [];
    const allMeal = timings.length > 0 && timings.every(t => ['after_breakfast', 'after_lunch', 'after_dinner'].includes(t));
    const timingText = allMeal ? 'after meals' : timings.map(words).join(', ');
    const dur = durationPhrase(row, 'med_since_date', 'med_since_years', 'med_since_months');
    const brand = row.med_brand_name && row.med_brand_name !== 'other' ? row.med_brand_name + ' ' : '';
    return `On Tab. ${brand}(${row.med_drug_name}) — ${row.med_dose_mg || '?'} mg — ${row.med_tablets_at_a_time || '?'} tablet(s) — ${row.med_times_per_day || '?'}x/day${timingText ? ' ' + timingText : ''}.${row.med_compliance ? ' ' + cap(words(row.med_compliance)) + '.' : ''}${dur ? ' Taking ' + dur + '.' : ''}`;
  } },
  { id: 'C4', q: 'Family history of thyroid disease', f: row => {
    if (!row.family_thyroid_status) return null;
    if (row.family_thyroid_status !== 'yes') return `Family history of thyroid disease: ${row.family_thyroid_status === 'unsure' ? 'Unsure' : 'No'}`;
    const entries = Array.isArray(row.family_thyroid_data) ? row.family_thyroid_data.filter(e => e?.relation) : [];
    if (!entries.length) return 'Family history of thyroid disease: Yes (details not recorded)';
    return `Family history of thyroid disease: ${entries.map(e => `${e.relation}${e.condition ? ' — ' + words(e.condition) : ''}`).join('; ')}`;
  } },
  { id: 'C5', q: 'Known autoimmune conditions', f: row => {
    if (!row.autoimmune_status) return null;
    if (row.autoimmune_status !== 'yes') return `Autoimmune conditions: ${row.autoimmune_status === 'unsure' ? 'Unsure' : 'No'}`;
    const entries = Array.isArray(row.autoimmune_data) ? row.autoimmune_data.filter(e => e?.condition) : [];
    if (!entries.length) return 'Autoimmune conditions: Yes (details not recorded)';
    return `Autoimmune conditions: ${entries.map(e => `${e.condition} — ${durationPhrase({ _y: e.since_years, _m: e.since_months }, null, '_y', '_m') || 'duration not recorded'}`.replace('_y', '').replace('_m', '')).join('; ')}`;
  } },

  // ── MODULE D — LABORATORY ──
  { id: 'D1', q: 'TSH', f: row => labTest(row, 'TSH', 'tsh') },
  { id: 'D2', q: 'Free T4 (FT4)', f: row => labTest(row, 'FT4', 'ft4') },
  { id: 'D3', q: 'Free T3 (FT3)', f: row => labTest(row, 'FT3', 'ft3') },
  { id: 'D4', q: 'TRAb / TSI', f: row => {
    if (!row.trab_status) return null;
    if (row.trab_status !== 'yes') return `TRAb / TSI: ${row.trab_status === 'unsure' ? 'Unsure' : 'Not tested'}`;
    const parts = [];
    if (row.trab_value_d4) parts.push(`TRAb ${row.trab_value_d4} IU/L${row.trab_date_d4 ? ' (' + fmtDate(row.trab_date_d4) + ')' : ''}`);
    if (row.tsi_value) parts.push(`TSI ${row.tsi_value} ${row.tsi_unit || '%'}${row.tsi_date ? ' (' + fmtDate(row.tsi_date) + ')' : ''}`);
    return `TRAb / TSI: ${parts.length ? parts.join(' | ') : 'Tested, values not recorded'}`;
  } },
  { id: 'D5', q: 'Anti-TPO / Anti-Tg antibodies', f: row => {
    if (!row.antibody_status) return null;
    if (row.antibody_status !== 'yes') return `Anti-TPO / Anti-Tg: ${row.antibody_status === 'unsure' ? 'Unsure' : 'Not tested'}`;
    const parts = [];
    if (row.antitpo_value) parts.push(`Anti-TPO ${row.antitpo_value} ${row.antitpo_unit || 'IU/mL'}${row.antitpo_date ? ' (' + fmtDate(row.antitpo_date) + ')' : ''}`);
    if (row.antitg_value) parts.push(`Anti-Tg ${row.antitg_value} ${row.antitg_unit || 'IU/mL'}${row.antitg_date ? ' (' + fmtDate(row.antitg_date) + ')' : ''}`);
    return `Anti-TPO / Anti-Tg: ${parts.length ? parts.join(' | ') : 'Tested, values not recorded'}`;
  } },
  { id: 'D6', q: 'Thyroid imaging (USG / scan)', f: row => {
    if (!row.imaging_status) return null;
    if (row.imaging_status !== 'yes') return `Thyroid imaging: ${row.imaging_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.imaging_types) ? row.imaging_types.map(words).join(', ') : '';
    return `Thyroid imaging: ${types || 'Yes'}${row.imaging_date ? ` — ${fmtDate(row.imaging_date)}` : ''}${row.imaging_finding ? `. Findings: ${row.imaging_finding}` : ''}`;
  } },

  // ── MODULE E — HYPERTHYROIDISM-SPECIFIC ──
  { id: 'E1', q: 'Known cause of hyperthyroidism', f: row => {
    if (!row.hyper_cause_known) return null;
    if (row.hyper_cause_known !== 'yes') return `Known cause: ${row.hyper_cause_known === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'hyper_cause_since_date', 'hyper_cause_since_years', 'hyper_cause_since_months');
    return `Known cause: ${cap(words(row.hyper_cause_type))}${dur ? ' — ' + dur : ''}`;
  } },
  { id: 'E2', q: "Graves' disease confirmation & features", f: row => {
    if (!row.graves_confirmed) return null;
    if (row.graves_confirmed !== 'yes') return `Graves' disease confirmed: ${row.graves_confirmed === 'unsure' ? 'Unsure' : 'No'}`;
    const parts = [`TRAb/TSI ${row.trab_positive === 'not_tested' ? 'not tested' : words(row.trab_positive) || 'not tested'}`];
    if (row.ophthal_status === 'yes') {
      const findings = Array.isArray(row.ophthal_findings) ? row.ophthal_findings.map(words).join(', ') : '';
      parts.push(`Ophthalmopathy: ${findings || 'present'}${durationPhrase(row, 'ophthal_since_date', 'ophthal_since_years', 'ophthal_since_months') ? ' — ' + durationPhrase(row, 'ophthal_since_date', 'ophthal_since_years', 'ophthal_since_months') : ''}${row.ophthal_assessed === 'yes' ? ' (assessed by ophthalmologist)' : ''}`);
    }
    if (row.dermopathy_status === 'yes') parts.push(`Dermopathy${durationPhrase(row, null, 'dermopathy_years', 'dermopathy_months') ? ' — ' + durationPhrase(row, null, 'dermopathy_years', 'dermopathy_months') : ''}`);
    if (row.acropathy_status === 'yes') parts.push('Acropathy present');
    return `Graves' disease: Confirmed. ${parts.join('. ')}`;
  } },
  { id: 'E3', q: 'Toxic nodule / toxic MNG', f: row => {
    if (!row.toxic_nodule_confirmed) return null;
    if (row.toxic_nodule_confirmed !== 'yes') return `Toxic nodule / toxic MNG: ${row.toxic_nodule_confirmed === 'unsure' ? 'Unsure' : 'No'}`;
    const parts = [row.toxic_nodule_type === 'aftn' ? 'AFTN (single toxic nodule)' : 'Toxic MNG'];
    if (row.e3_fnac_status === 'yes') parts.push(`FNAC: ${row.e3_fnac_result || '?'}${row.e3_fnac_date ? ' (' + fmtDate(row.e3_fnac_date) + ')' : ''}`);
    if (row.e3_nodule_size_cm) parts.push(`Size ${row.e3_nodule_size_cm} cm`);
    return `Toxic nodule / toxic MNG: ${parts.join('. ')}`;
  } },
  { id: 'E4', q: 'Goitre', f: row => {
    if (!row.goitre_present) return null;
    if (row.goitre_present !== 'yes') return `Goitre: ${row.goitre_present === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'goitre_since_date', 'goitre_since_years', 'goitre_since_months');
    const pressure = row.goitre_pressure_status === 'yes' && Array.isArray(row.goitre_pressure_types) && row.goitre_pressure_types.length
      ? `. Pressure symptoms: ${row.goitre_pressure_types.map(words).join(', ')}` : '';
    return `Goitre: ${row.goitre_size_label ? cap(row.goitre_size_label) + '-sized' : 'Yes'}${dur ? ' — ' + dur : ''}${pressure}`;
  } },
  { id: 'E5', q: 'Thyroid biopsy / FNAC', f: row => {
    if (!row.fnac_status) return null;
    if (row.fnac_status !== 'yes') return `Thyroid FNAC: ${row.fnac_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Thyroid FNAC: ${row.fnac_result || '?'}${row.fnac_date ? ' (' + fmtDate(row.fnac_date) + ')' : ''}`;
  } },

  // ── MODULE F — SYMPTOMS ──
  { id: 'F1', q: 'Fatigue / tiredness', f: row => symptom(row, 'Fatigue', 'fatigue', { extra: r => r.sym_fatigue_severity ? `Severity: ${cap(r.sym_fatigue_severity)}` : '' }) },
  { id: 'F2', q: 'Unintentional weight change', f: row => symptom(row, 'Weight change', 'weight', {
    extra: r => r.sym_weight_direction ? `${r.sym_weight_direction === 'lost' ? 'Weight loss' : 'Weight gain'}${r.sym_weight_kg ? ' of ' + r.sym_weight_kg + ' kg' : ''}` : '',
  }) },
  { id: 'F3', q: 'Appetite change', f: row => row.sym_appetite_status ? `Appetite: ${words(row.sym_appetite_status)}` : null },
  { id: 'F4', q: 'Heat intolerance', f: row => symptom(row, 'Heat intolerance', 'heat', { extra: r => r.sym_heat_impact ? `Impact: ${r.sym_heat_impact}` : '' }) },
  { id: 'F5', q: 'Excessive sweating', f: row => symptom(row, 'Excessive sweating', 'sweating', { extra: r => r.sym_sweating_pattern ? cap(words(r.sym_sweating_pattern)) : '' }) },
  { id: 'F6', q: 'Bowel habit changes', f: row => symptom(row, 'Bowel habit changes', 'bowel', { extra: r => r.sym_bowel_type ? cap(words(r.sym_bowel_type)) : '' }) },
  { id: 'F7', q: 'Skin changes', f: row => symptom(row, 'Skin changes', 'skin', { extra: r => Array.isArray(r.sym_skin_types) && r.sym_skin_types.length ? r.sym_skin_types.map(words).join(', ') : '' }) },
  { id: 'F8a', q: "Periorbital puffiness (Graves' eye changes)", f: row => symptom(row, 'Periorbital puffiness', 'periorbital') },
  { id: 'F8b', q: 'Facial puffiness', f: row => symptom(row, 'Facial puffiness', 'facial') },
  { id: 'F9', q: 'Pedal oedema (leg/feet swelling)', f: row => symptom(row, 'Pedal oedema', 'pedal', { extra: r => r.sym_pedal_type ? cap(words(r.sym_pedal_type)) : '' }) },
  { id: 'F10', q: 'Hair changes', f: row => {
    const status = row.sym_hair_status;
    if (!status) return null;
    if (status !== 'yes') return `Hair changes: ${status === 'unsure' ? 'Unsure' : 'No'}`;
    const entries = Array.isArray(row.sym_hair_data) ? row.sym_hair_data : [];
    if (!entries.length) return 'Hair changes: Yes';
    return `Hair changes: ${entries.map(e => `${words(e.type)}${durationPhrase(e, e.since_date ? 'since_date' : null, 'years', 'months') ? ' — ' + durationPhrase(e, e.since_date ? 'since_date' : null, 'years', 'months') : ''}`).join(', ')}`;
  } },
  { id: 'F11', q: 'Nail changes', f: row => {
    const status = row.sym_nail_status;
    if (!status) return null;
    if (status !== 'yes') return `Nail changes: ${status === 'unsure' ? 'Unsure' : 'No'}`;
    const entries = Array.isArray(row.sym_nail_data) ? row.sym_nail_data : [];
    if (!entries.length) return 'Nail changes: Yes';
    return `Nail changes: ${entries.map(e => `${words(e.type)}${durationPhrase(e, e.since_date ? 'since_date' : null, 'years', 'months') ? ' — ' + durationPhrase(e, e.since_date ? 'since_date' : null, 'years', 'months') : ''}`).join(', ')}`;
  } },
  { id: 'F12', q: 'Hoarseness / voice change', f: row => symptom(row, 'Hoarseness', 'hoarseness', { extra: r => r.sym_hoarseness_pattern ? cap(words(r.sym_hoarseness_pattern)) : '' }) },
  { id: 'F13', q: 'Muscle weakness (proximal myopathy)', f: row => symptom(row, 'Muscle weakness', 'myopathy', { extra: r => r.sym_myopathy_location ? `Location: ${words(r.sym_myopathy_location)}` : '' }) },
  { id: 'F14', q: 'Muscle cramps / aches', f: row => symptom(row, 'Muscle cramps', 'cramp') },
  { id: 'F15', q: 'Tremors', f: row => symptom(row, 'Tremors', 'tremor', { extra: r => r.sym_tremor_type_val ? cap(words(r.sym_tremor_type_val)) : '' }) },
  { id: 'F16', q: 'Anxiety / nervousness', f: row => symptom(row, 'Anxiety', 'anxiety', {
    extra: r => [r.sym_anxiety_seen_doctor === 'yes' ? 'Seen a doctor' : '', r.sym_anxiety_diagnosed === 'yes' ? 'Formally diagnosed' : ''].filter(Boolean).join('. '),
  }) },
  { id: 'F17', q: 'Irritability / emotional lability', f: row => symptom(row, 'Irritability', 'irritability') },
  { id: 'F18', q: 'Insomnia', f: row => symptom(row, 'Insomnia', 'insomnia', { extra: r => Array.isArray(r.sym_insomnia_types) && r.sym_insomnia_types.length ? r.sym_insomnia_types.map(words).join(', ') : '' }) },
  { id: 'F19', q: 'Palpitations', f: row => symptom(row, 'Palpitations', 'palp', { extra: r => r.sym_palp_pattern ? cap(words(r.sym_palp_pattern)) : '' }) },
  { id: 'F20', q: 'Irregular heartbeat / atrial fibrillation', f: row => {
    const status = row.sym_af_status;
    if (!status) return null;
    if (status !== 'yes') return `Atrial fibrillation: ${status === 'unsure' ? 'Unsure' : 'No'}`;
    const confirmed = row.sym_af_confirmed === 'yes' ? 'Confirmed' : 'Not confirmed';
    const dur = durationPhrase(row, 'sym_af_since_date', 'sym_af_years', 'sym_af_months');
    const meds = row.sym_af_on_med === 'yes' && Array.isArray(row.sym_af_med_data) && row.sym_af_med_data.some(m => m?.name)
      ? ' On ' + medListText(row.sym_af_med_data) + '.' : '';
    return `Atrial fibrillation: Yes — ${confirmed}${dur ? ', ' + dur : ''}.${meds}`;
  } },
  { id: 'F21', q: 'Postural giddiness', f: row => symptom(row, 'Postural giddiness', 'giddiness', { extra: r => r.sym_giddiness_freq ? `Frequency: ${words(r.sym_giddiness_freq)}` : '' }) },
  { id: 'F22', q: 'Blackout / loss of consciousness', f: row => {
    const status = row.sym_blackout_status;
    if (!status) return null;
    if (status !== 'yes') return `Blackout episodes: ${status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Blackout episodes: Yes${row.sym_blackout_count ? ` — ${row.sym_blackout_count} episode(s)` : ''}${row.sym_blackout_last_date ? `, last on ${fmtDate(row.sym_blackout_last_date)}` : ''}${row.sym_blackout_assessed === 'yes' ? '. Medically assessed' : ''}${row.sym_blackout_dx ? ' — ' + row.sym_blackout_dx : ''}`;
  } },
  { id: 'F23', q: 'Shortness of breath (dyspnoea)', f: row => symptom(row, 'Dyspnoea', 'dyspnoea', { extra: r => r.sym_dyspnoea_onset ? `Onset: ${words(r.sym_dyspnoea_onset)}` : '' }) },
  { id: 'F24', q: 'Difficulty concentrating', f: row => symptom(row, 'Concentration difficulty', 'concentration', { extra: r => r.sym_concentration_impact ? `Impact: ${r.sym_concentration_impact}` : '' }) },
  { id: 'F25', q: 'Memory problems', f: row => symptom(row, 'Memory problems', 'memory', { extra: r => r.sym_memory_impact ? `Impact: ${r.sym_memory_impact}` : '' }) },

  // ── MODULE G — TREATMENT & MONITORING ──
  { id: 'G2', q: 'Definitive treatment advised (RAI / surgery)', f: row => {
    if (!row.definitive_tx_status) return null;
    if (row.definitive_tx_status !== 'yes') return `Definitive treatment advised: ${row.definitive_tx_status === 'unsure' ? 'Unsure' : 'No'}`;
    const type = row.definitive_tx_type === 'rai' ? 'Radioiodine (RAI)' : row.definitive_tx_type === 'surgery' ? 'Surgery' : 'Not yet decided';
    return `Definitive treatment advised: ${type}${row.definitive_tx_date ? ` — planned ${fmtDate(row.definitive_tx_date)}` : ''}`;
  } },
  { id: 'G3', q: 'Recent medication dose change', f: row => {
    if (!row.dose_changed_status) return null;
    if (row.dose_changed_status !== 'yes') return `Recent dose change: ${row.dose_changed_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Recent dose change: ${row.dose_change_direction ? cap(row.dose_change_direction) : '?'}${row.dose_changed_date ? ` on ${fmtDate(row.dose_changed_date)}` : ''}${row.dose_changed_reason ? ` — ${words(row.dose_changed_reason)}` : ''}`;
  } },
  { id: 'G4', q: 'Beta-blocker for heart rate control', f: row => {
    if (!row.on_beta_blocker) return null;
    if (row.on_beta_blocker !== 'yes') return `Beta-blocker: ${row.on_beta_blocker === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'beta_blocker_since_date', 'beta_blocker_since_years', 'beta_blocker_since_months');
    return `Beta-blocker: ${row.beta_blocker_name || '?'} ${row.beta_blocker_dose || '?'} mg — ${row.beta_blocker_freq ? words(row.beta_blocker_freq) : '?'}${dur ? '. Taking ' + dur : ''}`;
  } },
  { id: 'G5', q: 'Monitoring plan / review frequency', f: row => {
    if (!row.monitoring_status) return null;
    if (row.monitoring_status !== 'yes') return `Monitoring plan: ${row.monitoring_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Monitoring plan: Reviewed every ${words(row.review_frequency_val) || '?'}${row.next_review_date_val ? `. Next review ${fmtDate(row.next_review_date_val)}` : ''}`;
  } },

  // ── MODULE H — COMORBIDITIES & NOTES ──
  { id: 'H1', q: 'Dyslipidaemia / high cholesterol', f: row => comorbidityMonths(row, 'Dyslipidaemia', 'dyslipidaemia') },
  { id: 'H2', q: 'Diabetes / high blood sugar', f: row => {
    if (!row.diabetes_status) return null;
    if (row.diabetes_status !== 'yes') return `Diabetes: ${row.diabetes_status === 'unsure' ? 'Unsure' : 'No'}`;
    const months = row.diabetes_since_months;
    const dur = months ? `for ${Math.floor(months / 12)} year(s)` : '';
    const meds = row.diabetes_on_med === 'yes' && Array.isArray(row.diabetes_meds) && row.diabetes_meds.some(m => m?.name)
      ? ' On ' + medListText(row.diabetes_meds) + '.' : '';
    return `Diabetes: ${words(row.diabetes_type) || 'Yes'}${dur ? ' — ' + dur : ''}.${meds}`;
  } },
  { id: 'H3', q: 'Anaemia', f: row => {
    if (!row.anaemia_status) return null;
    if (row.anaemia_status !== 'yes') return `Anaemia: ${row.anaemia_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.anaemia_types) ? row.anaemia_types.map(words).join(' + ') : '';
    const meds = row.anaemia_on_med === 'yes' && Array.isArray(row.anaemia_meds) && row.anaemia_meds.some(m => m?.name)
      ? ' On ' + medListText(row.anaemia_meds) + '.' : '';
    return `Anaemia: ${types || 'Yes'}.${meds}`;
  } },
  { id: 'H4', q: 'PCOS / PMOS', f: row => {
    if (!row.pcos_status) return null;
    if (row.pcos_status !== 'yes') return `PCOS/PMOS: ${row.pcos_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'pcos_since_date', 'pcos_years', 'pcos_months');
    const meds = row.pcos_on_med === 'yes' && Array.isArray(row.pcos_meds) && row.pcos_meds.some(m => m?.name)
      ? ' On ' + row.pcos_meds.filter(m => m.name).map(m => `${m.name}${m.dose ? ' ' + m.dose + ' mg' : ''}${m.freq ? ' — ' + m.freq + 'x/day' : ''}`).join(', ') + '.' : '';
    return `PCOS/PMOS: Yes${dur ? ' — ' + dur : ''}.${meds}`;
  } },
  { id: 'H5', q: 'Difficulty conceiving', f: row => row.infertility_status == null ? null : `Difficulty conceiving: ${row.infertility_status === 'yes' ? 'Yes' : row.infertility_status === 'unsure' ? 'Unsure' : 'No'}` },
  { id: 'H6', q: 'Depression (formally diagnosed)', f: row => ynDuration(row, 'Depression', 'depression_status', {
    extra: r => r.depression_on_med === 'yes' ? 'On medication' : '',
  }) },
  { id: 'H8', q: 'Osteoporosis / osteopenia', f: row => {
    if (!row.osteoporosis_status) return null;
    if (row.osteoporosis_status !== 'yes') return `Osteoporosis: ${row.osteoporosis_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dexa = row.osteoporosis_dexa === 'yes' ? ' — DEXA confirmed' : '';
    const meds = row.osteoporosis_on_med === 'yes' && Array.isArray(row.osteoporosis_meds) && row.osteoporosis_meds.some(m => m?.name)
      ? ' On ' + medListText(row.osteoporosis_meds) + '.' : '';
    return `Osteoporosis: Yes${dexa}.${meds}`;
  } },
  { id: 'H9', q: 'Additional notes for the doctor', f: row => row.additional_notes ? `Additional notes: ${row.additional_notes}` : null },
];

// ─── Public: build ordered [{id, question, answer}] list, skipping
// unanswered pages ─────────────────────────────────────────────────────
function formatHyperAnswers(row) {
  if (!row) return [];
  return PAGES
    .map(p => {
      let answer;
      try { answer = p.f(row); } catch (e) { answer = null; }
      return answer ? { id: p.id, question: p.q, answer } : null;
    })
    .filter(Boolean);
}

module.exports = { formatHyperAnswers, PAGES };
