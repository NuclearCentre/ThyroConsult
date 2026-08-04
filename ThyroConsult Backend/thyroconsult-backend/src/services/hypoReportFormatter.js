// ============================================================
// Full path:
//   thyroconsult-backend\src\services\hypoReportFormatter.js
//
// PILOT for the "single-file, question-by-question PDF" feature
// (item 3). Covers all 56 pages of hypo_questionnaire, in the exact
// same order as HypoQuestionnaire.js's `allPages` array.
//
// Design: every field name here was pulled directly from
// HypoQuestionnaire.js's own save-payload mapping — nothing guessed.
// Field NAMES are ground truth; formatting logic is written fresh
// here (not copy-pasted from the frontend's JSX) but produces the
// same information the physician would see building the picture
// themselves from the raw record.
//
// Once this pilot is confirmed correct against a real submitted
// Hypo questionnaire, the same pattern (generic helpers + per-page
// config array) will be replicated for Hyper/TC/Nodule.
// ============================================================

// ─── Generic formatting helpers ────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Renders a duration from whichever of {since_date, years, months, days}
// is present — mirrors the same fallback priority used throughout the
// frontend's own formatDuration().
function durationPhrase(row, prefix) {
  const date = row[`${prefix}_since_date`];
  const years = row[`${prefix}_years`];
  const months = row[`${prefix}_months`];
  const days = row[`${prefix}_days`];
  if (date) return `since ${fmtDate(date)}`;
  const parts = [];
  if (years) parts.push(`${years} year${years > 1 ? 's' : ''}`);
  if (months) parts.push(`${months} month${months > 1 ? 's' : ''}`);
  if (!years && !months && days) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  return parts.length ? `for ${parts.join(' ')}` : '';
}

// Generic: plain Yes/No/Unsure status question, optionally with a duration
// once "yes". Covers the majority of Module F symptom pages.
function ynDuration(row, label, statusCol, { hasDuration = true, extra } = {}) {
  const status = row[statusCol];
  if (!status) return null;
  if (status !== 'yes') return `${label}: ${status === 'unsure' ? 'Unsure' : 'No'}`;
  const dur = hasDuration ? durationPhrase(row, statusCol.replace(/_status$/, '')) : '';
  const extraText = extra ? extra(row) : '';
  return `${label}: Yes${dur ? ' — ' + dur : ''}${extraText ? '. ' + extraText : ''}`;
}

// Generic: comorbidity shape — status / duration / on_med / {prefix}_meds
// JSONB array of {name, dose, freq}. Covers H1 (dyslipidaemia), H2
// (anaemia), H3 (diabetes), H6 (hypertension), H7 (osteoporosis-like),
// H4 (PCOS, with its own dedicated entry below since it has extra fields).
function comorbidity(row, label, prefix) {
  const status = row[`${prefix}_status`];
  if (!status) return null;
  if (status !== 'yes') return `${label}: ${status === 'unsure' ? 'Unsure' : 'No'}`;
  const dur = durationPhrase(row, prefix);
  const onMed = row[`${prefix}_on_med`];
  const meds = row[`${prefix}_meds`];
  let medText = '';
  if (onMed === 'yes' && Array.isArray(meds) && meds.length) {
    medText = ' On ' + meds.filter(m => m?.name).map(m =>
      `${m.name}${m.dose ? ' ' + m.dose + ' mg' : ''}${m.freq ? ' — ' + m.freq + 'x/day' : ''}`
    ).join(', ') + '.';
  }
  return `${label}: Yes${dur ? ' — ' + dur : ''}.${medText}`;
}

// Generic: lab test shape — {prefix}_value/unit/date/ref_low/ref_high.
// Status field name varies (some use "tested"/null, some yes/no) so the
// caller passes whichever status column applies, or null to skip the gate.
function labTest(row, label, prefix, statusCol) {
  if (statusCol && !row[statusCol]) return null;
  const value = row[`${prefix}_value`];
  if (!value) return statusCol ? `${label}: Not tested` : null;
  const unit = row[`${prefix}_unit`] || '';
  const date = row[`${prefix}_date`];
  const refLow = row[`${prefix}_ref_low`];
  const refHigh = row[`${prefix}_ref_high`];
  const ref = (refLow || refHigh) ? ` (ref ${refLow ?? '?'}–${refHigh ?? '?'})` : '';
  return `${label}: ${value} ${unit}${ref}${date ? ' — ' + fmtDate(date) : ''}`;
}

function medListText(meds) {
  if (!Array.isArray(meds) || !meds.length) return '';
  return meds.filter(m => m?.name).map(m => {
    const since = m.since ? durationPhrase({ [`x_since_date`]: m.since.date, x_years: m.since.years, x_months: m.since.months }, 'x') : '';
    return `${m.name}${m.dose ? ' ' + m.dose + ' mg' : ''}${m.freq ? ' — ' + m.freq + 'x/day' : ''}${since ? ' (' + since + ')' : ''}`;
  }).join(', ');
}

// ─── Page-by-page config, in the exact order of HypoQuestionnaire.js's allPages ──

const PAGES = [
  // ── MODULE A ──
  { id: 'A3', q: 'Marital status', f: row => row.marital_status ? `Marital status: ${row.marital_status}` : null },
  { id: 'A4', q: 'Occupation', f: row => row.occupation ? `Occupation: ${row.occupation === 'other' ? (row.occupation_other || 'Other') : row.occupation.replace(/_/g, ' ')}` : null },

  // ── MODULE B (female only) ──
  { id: 'B1', q: 'Hysterectomy', f: row => {
    if (!row.hysterectomy_status) return null;
    if (row.hysterectomy_status !== 'yes') return `Hysterectomy: ${row.hysterectomy_status === 'unsure' ? 'Unsure' : 'No'}`;
    const when = row.hysterectomy_date ? fmtDate(row.hysterectomy_date) : (row.hysterectomy_year ? `${row.hysterectomy_year}` : '');
    const reason = row.hysterectomy_reason === 'other' ? row.hysterectomy_reason_other : row.hysterectomy_reason;
    return `Hysterectomy: Yes${when ? ' — ' + when : ''}${reason ? '. Reason: ' + reason : ''}`;
  } },
  { id: 'B2', q: 'Menopausal status', f: row => row.menopause_status ? `Menopausal status: ${row.menopause_status}${row.menopause_status === 'post' && row.menopause_years_ago ? ` (${row.menopause_years_ago} years ago)` : ''}` : null },
  { id: 'B3', q: 'Menstrual cycle changes', f: row => {
    if (!row.menstrual_change_status) return null;
    if (row.menstrual_change_status !== 'yes') return `Menstrual cycle changes: ${row.menstrual_change_status === 'unsure' ? 'Unsure' : 'No'}`;
    const parts = [row.menstrual_pattern, ...(Array.isArray(row.menstrual_flow) ? row.menstrual_flow : [])].filter(Boolean);
    const dur = durationPhrase(row, 'menstrual');
    return `Menstrual cycle changes: ${parts.join(', ') || 'Yes'}${dur ? ' — ' + dur : ''}`;
  } },
  { id: 'B4', q: 'Last menstrual period (LMP)', f: row => row.lmp_date ? `LMP: ${fmtDate(row.lmp_date)}` : null },
  { id: 'B5', q: 'Pregnancy', f: row => row.pregnancy_status ? `Pregnancy: ${row.pregnancy_status}${row.pregnancy_status === 'yes' && row.edd_date ? ` — EDD ${fmtDate(row.edd_date)}` : ''}` : null },

  // ── MODULE C ──
  { id: 'C1', q: 'Previous thyroid diagnosis', f: row => {
    if (!row.thyroid_dx_status) return null;
    if (row.thyroid_dx_status !== 'yes') return `Previous thyroid diagnosis: ${row.thyroid_dx_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Previous thyroid diagnosis: Yes — ${row.thyroid_dx_type || '?'}${row.thyroid_dx_year ? ` (${row.thyroid_dx_year})` : ''}`;
  } },
  { id: 'C2a', q: 'Thyroid surgery', f: row => {
    if (!row.thyroid_surgery_status) return null;
    if (row.thyroid_surgery_status !== 'yes') return `Thyroid surgery: ${row.thyroid_surgery_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Thyroid surgery: Yes — ${(row.thyroid_surgery_type || '?').replace(/_/g, ' ')}${row.thyroid_surgery_year ? ` (${row.thyroid_surgery_year})` : ''}`;
  } },
  { id: 'C2b', q: 'Radioiodine (RAI) therapy', f: row => {
    const admins = row.rai_administrations;
    if (!Array.isArray(admins) || !admins.length) return null;
    return `RAI therapy: ${admins.map(a => `${a.dose_mci || '?'} mCi${a.year ? ' in ' + a.year : ''}`).join('; ')}`;
  } },
  { id: 'C3', q: 'Current thyroid medication', f: row => {
    if (!row.thyroid_med_status) return null;
    if (row.thyroid_med_status !== 'yes') return `Current thyroid medication: ${row.thyroid_med_status === 'unsure' ? 'Unsure' : 'No'}`;
    const parts = [];
    if (row.thyroid_med_brand && row.thyroid_med_dose) {
      const brand = row.thyroid_med_brand === 'other' ? (row.thyroid_med_name || 'Other') : row.thyroid_med_brand;
      parts.push(`Tab. ${brand} — ${row.thyroid_med_dose} mcg`);
    }
    if (row.liothyronine_brand && row.liothyronine_dose) {
      const brand = row.liothyronine_brand === 'other' ? (row.liothyronine_name || 'Other') : row.liothyronine_brand;
      parts.push(`Tab. ${brand} — ${row.liothyronine_dose} mcg`);
    }
    return `Current thyroid medication: ${parts.join(' + ') || 'Yes'}${row.thyroid_med_compliance ? '. Compliance: ' + row.thyroid_med_compliance.replace(/_/g, ' ') : ''}`;
  } },
  { id: 'C4', q: 'Family history of thyroid disease', f: row => {
    if (!row.family_thyroid_status) return null;
    if (row.family_thyroid_status !== 'yes') return `Family history of thyroid disease: ${row.family_thyroid_status === 'unsure' ? 'Unsure' : 'No'}`;
    const relations = Array.isArray(row.family_thyroid_relations) ? row.family_thyroid_relations.join(', ') : '';
    return `Family history of thyroid disease: Yes${relations ? ' — ' + relations : ''}${row.family_thyroid_condition ? ' (' + row.family_thyroid_condition.replace(/_/g, ' ') + ')' : ''}`;
  } },
  { id: 'C5', q: 'Autoimmune conditions', f: row => {
    if (!row.autoimmune_status) return null;
    if (row.autoimmune_status !== 'yes') return `Autoimmune conditions: ${row.autoimmune_status === 'unsure' ? 'Unsure' : 'No'}`;
    const conds = Array.isArray(row.autoimmune_conditions) ? row.autoimmune_conditions : [];
    return `Autoimmune conditions: ${conds.join(', ') || 'Yes'}${row.autoimmune_other ? ' — ' + row.autoimmune_other : ''}`;
  } },

  // ── MODULE D — labs ──
  { id: 'D1', q: 'TSH test', f: row => labTest(row, 'TSH', 'tsh', 'tsh_status') },
  { id: 'D2', q: 'T3 (total) test', f: row => labTest(row, 'T3 (total)', 't3', 't3_status') },
  { id: 'D3', q: 'Free T3 test', f: row => labTest(row, 'Free T3', 'ft3', 'ft3_status') },
  { id: 'D4', q: 'T4 (total) test', f: row => labTest(row, 'T4 (total)', 't4', 't4_status') },
  { id: 'D5', q: 'Free T4 test', f: row => labTest(row, 'Free T4', 'ft4', 'ft4_status') },
  { id: 'D6', q: 'Anti-TPO antibody', f: row => labTest(row, 'Anti-TPO', 'antitpo', 'antitpo_status') },
  { id: 'D7', q: 'Anti-Tg antibody', f: row => labTest(row, 'Anti-Tg', 'antitg', 'antitg_status') },
  { id: 'D10', q: 'Thyroid imaging', f: row => row.imaging_finding ? `Thyroid imaging: ${row.imaging_finding}` : null },

  // ── MODULE E ──
  { id: 'E1', q: 'Cause of hypothyroidism', f: row => row.cause ? `Cause of hypothyroidism: ${row.cause.replace(/_/g, ' ')}` : null },
  { id: 'E2', q: "Hashimoto's thyroiditis", f: row => row.hashimotos_confirmed ? `Hashimoto's thyroiditis confirmed${row.hashimotos_anti_tpo_value ? ` — Anti-TPO ${row.hashimotos_anti_tpo_value}` : ''}${row.hashimotos_anti_tg_value ? `, Anti-Tg ${row.hashimotos_anti_tg_value}` : ''}` : null },
  { id: 'E3', q: 'Goitre', f: row => row.goitre_present == null ? null : (row.goitre_present ? `Goitre: Yes${row.goitre_size_value ? ' — ' + row.goitre_size_value : ''}` : 'Goitre: No') },

  // ── MODULE F — symptoms ──
  { id: 'F1', q: 'Fatigue', f: row => ynDuration(row, 'Fatigue', 'sym_fatigue_status', { extra: r => r.sym_fatigue_severity ? `Severity: ${r.sym_fatigue_severity}` : '' }) },
  { id: 'F2', q: 'Weight change', f: row => {
    if (!row.sym_weight_status) return null;
    if (row.sym_weight_status !== 'yes') return `Weight change: ${row.sym_weight_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Weight change: ${row.sym_weight_direction || '?'}${row.sym_weight_kg_val ? ' of ' + row.sym_weight_kg_val + ' kg' : ''} — ${durationPhrase(row, 'sym_weight')}`;
  } },
  { id: 'F3', q: 'Appetite', f: row => row.sym_appetite_status ? `Appetite: ${row.sym_appetite_status}` : null },
  { id: 'F4', q: 'Cold intolerance', f: row => ynDuration(row, 'Cold intolerance', 'sym_cold_status', { extra: r => r.sym_cold_impact ? 'Affects daily activity' : '' }) },
  { id: 'F5', q: 'Bowel habits', f: row => ynDuration(row, 'Bowel habits', 'sym_bowel_status', { extra: r => r.sym_bowel_type ? `Type: ${r.sym_bowel_type}` : '' }) },
  { id: 'F6', q: 'Abdominal symptoms', f: row => {
    if (!row.sym_abdominal_status) return null;
    if (row.sym_abdominal_status !== 'yes') return `Abdominal symptoms: ${row.sym_abdominal_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.sym_abdominal_types) ? row.sym_abdominal_types.join(', ') : '';
    return `Abdominal symptoms: ${types || 'Yes'} — ${durationPhrase(row, 'sym_abdominal')}`;
  } },
  { id: 'F7', q: 'Skin changes', f: row => {
    if (!row.sym_skin_status) return null;
    if (row.sym_skin_status !== 'yes') return `Skin changes: ${row.sym_skin_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.sym_skin_types) ? row.sym_skin_types.join(', ') : '';
    return `Skin changes: ${types || 'Yes'} — ${durationPhrase(row, 'sym_skin')}`;
  } },
  { id: 'F8a', q: 'Periorbital puffiness', f: row => ynDuration(row, 'Periorbital puffiness', 'sym_periorbital_status') },
  { id: 'F8b', q: 'Facial puffiness', f: row => ynDuration(row, 'Facial puffiness', 'sym_facial_oedema_status') },
  { id: 'F9', q: 'Pedal oedema', f: row => ynDuration(row, 'Pedal oedema', 'sym_pedal_oedema_status', { extra: r => r.sym_pedal_oedema_type ? `Type: ${r.sym_pedal_oedema_type}` : '' }) },
  { id: 'F10', q: 'Hair changes', f: row => {
    if (!row.sym_hair_status) return null;
    if (row.sym_hair_status !== 'yes') return `Hair changes: ${row.sym_hair_status === 'unsure' ? 'Unsure' : 'No'}`;
    const data = row.sym_hair_data || {};
    const types = Object.keys(data).filter(k => data[k]?.selected);
    return `Hair changes: ${types.length ? types.join(', ') : 'Yes'}`;
  } },
  { id: 'F11', q: 'Nail changes', f: row => {
    if (!row.sym_nail_status) return null;
    if (row.sym_nail_status !== 'yes') return `Nail changes: ${row.sym_nail_status === 'unsure' ? 'Unsure' : 'No'}`;
    const data = row.sym_nail_data || {};
    const types = Object.keys(data).filter(k => data[k]?.selected);
    return `Nail changes: ${types.length ? types.join(', ') : 'Yes'}`;
  } },
  { id: 'F12', q: 'Hoarseness', f: row => ynDuration(row, 'Hoarseness', 'sym_hoarseness_status', { extra: r => r.sym_hoarseness_pattern ? `Pattern: ${r.sym_hoarseness_pattern}` : '' }) },
  { id: 'F13', q: 'Muscle cramps', f: row => ynDuration(row, 'Muscle cramps', 'sym_cramp_status') },
  { id: 'F14', q: 'Muscle weakness', f: row => ynDuration(row, 'Muscle weakness', 'sym_weakness_status', { extra: r => r.sym_weakness_location ? `Location: ${r.sym_weakness_location}` : '' }) },
  { id: 'F15a', q: 'Difficulty concentrating', f: row => ynDuration(row, 'Difficulty concentrating', 'sym_concentration_status', { extra: r => r.sym_concentration_impact ? 'Affects daily activity' : '' }) },
  { id: 'F15b', q: 'Memory problems', f: row => ynDuration(row, 'Memory problems', 'sym_memory_status', { extra: r => r.sym_memory_impact ? 'Affects daily activity' : '' }) },
  { id: 'F16', q: 'Low mood / depression', f: row => ynDuration(row, 'Low mood / depression', 'sym_depression_status', { extra: r => [r.sym_depression_seen_doctor ? 'Seen a doctor' : '', r.sym_depression_diagnosed ? 'Formally diagnosed' : ''].filter(Boolean).join('; ') }) },
  { id: 'F17', q: 'Excessive sleepiness', f: row => ynDuration(row, 'Excessive sleepiness', 'sym_hypersomnia_status') },
  { id: 'F18', q: 'Slow heart rate', f: row => ynDuration(row, 'Slow heart rate', 'sym_bradycardia_status', { extra: r => r.sym_bradycardia_pulse_bpm ? `Pulse: ${r.sym_bradycardia_pulse_bpm} bpm` : '' }) },
  { id: 'F19', q: 'Positional giddiness', f: row => ynDuration(row, 'Positional giddiness', 'sym_giddiness_status', { extra: r => r.sym_giddiness_freq ? `Frequency: ${r.sym_giddiness_freq}` : '' }) },
  { id: 'F20', q: 'Blackout episodes', f: row => {
    if (!row.sym_blackout_status) return null;
    if (row.sym_blackout_status !== 'yes') return `Blackout episodes: ${row.sym_blackout_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Blackout episodes: Yes${row.sym_blackout_count ? ` — ${row.sym_blackout_count} episode(s)` : ''}${row.sym_blackout_last_date ? `, last on ${fmtDate(row.sym_blackout_last_date)}` : ''}${row.sym_blackout_assessed ? '. Medically assessed' : ''}${row.sym_blackout_dx ? ' — ' + row.sym_blackout_dx : ''}`;
  } },
  { id: 'F21', q: 'Hearing difficulties', f: row => {
    if (!row.sym_hearing_status) return null;
    if (row.sym_hearing_status !== 'yes') return `Hearing difficulties: ${row.sym_hearing_status === 'unsure' ? 'Unsure' : 'No'}`;
    const data = row.sym_hearing_data || {};
    const types = Array.isArray(data.types) ? data.types.join(', ') : '';
    return `Hearing difficulties: ${types || 'Yes'}`;
  } },
  { id: 'F22', q: 'Delayed reflexes', f: row => ynDuration(row, 'Delayed reflexes', 'sym_reflexes_status') },
  { id: 'F23', q: 'Carpal tunnel symptoms (wrists/hands)', f: row => {
    const data = row.sym_carpal_data || {};
    const answered = Object.entries(data).filter(([, v]) => v?.status === 'yes');
    if (!answered.length) return null;
    return `Carpal tunnel symptoms: ${answered.map(([k, v]) => `${k} in ${v.side || '?'} wrist`).join('; ')}`;
  } },
  { id: 'F24', q: 'Tongue enlargement (macroglossia)', f: row => ynDuration(row, 'Tongue enlargement', 'sym_macroglossia_status') },
  { id: 'F25', q: 'Acidity / retrosternal chest burn', f: row => ynDuration(row, 'Acidity / chest burn', 'acidity_status', { extra: r => r.acidity_on_med === 'yes' && r.acidity_med_name ? `On ${r.acidity_med_name}` : '' }) },

  // ── MODULE H — comorbidities ──
  { id: 'H1', q: 'Dyslipidaemia / high cholesterol', f: row => comorbidity(row, 'Dyslipidaemia', 'dyslipidaemia') },
  { id: 'H2', q: 'Anaemia', f: row => {
    if (!row.anaemia_status) return null;
    if (row.anaemia_status !== 'yes') return `Anaemia: ${row.anaemia_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.anaemia_types) ? row.anaemia_types.join(', ') : '';
    return `Anaemia: ${types || 'Yes'}. ${row.anaemia_on_med === 'yes' ? 'On: ' + medListText(row.anaemia_meds) : ''}`;
  } },
  { id: 'H3', q: 'Diabetes / high blood sugar', f: row => {
    if (!row.diabetes_status) return null;
    if (row.diabetes_status !== 'yes') return `Diabetes: ${row.diabetes_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Diabetes: ${row.diabetes_type || 'Yes'} — ${durationPhrase(row, 'diabetes')}. ${row.diabetes_on_med === 'yes' ? 'On: ' + medListText(row.diabetes_meds) : ''}`;
  } },
  { id: 'H6', q: 'Hypertension / high blood pressure', f: row => comorbidity(row, 'Hypertension', 'htn') },
  { id: 'H4', q: 'PCOS / PMOS', f: row => {
    if (!row.pcos_status) return null;
    if (row.pcos_status !== 'yes') return `PCOS/PMOS: ${row.pcos_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'pcos');
    return `PCOS/PMOS: Yes${dur ? ' — ' + dur : ''}. ${row.pcos_on_med === 'yes' ? 'On: ' + medListText(row.pcos_meds) : ''}`;
  } },
  { id: 'H5', q: 'Difficulty conceiving', f: row => row.has_infertility == null ? null : `Difficulty conceiving: ${row.has_infertility ? 'Yes' : 'No'}` },
  { id: 'H7', q: 'Osteoporosis / osteopenia', f: row => {
    if (!row.osteoporosis_status) return null;
    if (row.osteoporosis_status !== 'yes') return `Osteoporosis: ${row.osteoporosis_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'osteoporosis');
    const dexa = row.osteoporosis_dexa === 'yes' ? ' — DEXA confirmed' : '';
    const med = row.osteoporosis_on_med === 'yes' && row.osteoporosis_med_name ? `. On ${row.osteoporosis_med_name}` : '';
    return `Osteoporosis: Yes${dur ? ' — ' + dur : ''}${dexa}${med}`;
  } },
  { id: 'H8', q: 'Family history — non-thyroid cancers', f: row => {
    if (!row.family_cancer_status) return null;
    if (row.family_cancer_status !== 'yes') return `Family history of non-thyroid cancers: ${row.family_cancer_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.family_cancer_types) ? row.family_cancer_types.join(', ') : '';
    return `Family history of non-thyroid cancers: Yes${types ? ' — ' + types : ''}${row.family_cancer_relative ? ' (' + row.family_cancer_relative + ')' : ''}`;
  } },
  { id: 'H9', q: 'Additional notes', f: row => row.additional_notes ? `Additional notes: ${row.additional_notes}` : null },
];

// ─── Public: build ordered [{question, answer}] list, skipping unanswered ──
function formatHypoAnswers(row) {
  if (!row) return [];
  return PAGES
    .map(p => {
      let answer;
      try { answer = p.f(row); } catch (e) { answer = null; }
      return answer ? { id: p.id, question: p.q, answer } : null;
    })
    .filter(Boolean);
}

module.exports = { formatHypoAnswers, PAGES };
