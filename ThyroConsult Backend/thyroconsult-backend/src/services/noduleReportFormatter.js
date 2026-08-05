// ============================================================
// Full path:
//   thyroconsult-backend\src\services\noduleReportFormatter.js
//
// Fourth and final condition to get the "single-file, question-by-
// question" report — completes the pattern started with Hypo. Covers
// all answerable pages of nodule_questionnaire, in the exact same order
// as NoduleQuestionnaire.js's `allPages` array.
//
// Field names verified against NoduleQuestionnaire.js's own get()/set()
// calls and NODULE_PAGE_VALIDATORS, cross-checked against
// NODULE_Q_COLUMNS (migration 043 fixed the two gaps found:
// consultation_trigger/_other -> opinion_trigger/_other rename, and the
// new patient_primary_concern column).
//
// Unlike Hypo/Hyper/TC, Nodule's page ids (Q3, B1, J4b, ...) don't
// self-encode a module letter via string-stripping, so this file also
// exports MODULE_BY_ID — an explicit id -> section-letter map — for
// questionnaireReportService.js's PDF section headers to use instead of
// the regex trick the other three formatters rely on.
// ============================================================

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function words(s) { return s ? String(s).replace(/_/g, ' ') : s; }

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

function symptom(row, label, key, { extra } = {}) {
  const status = row[`${key}_status`];
  if (!status) return null;
  if (status !== 'yes') return `${label}: ${status === 'unsure' ? 'Unsure' : 'No'}`;
  const dur = durationPhrase(row, `${key}_since_date`, `${key}_years`, `${key}_months`);
  const extraText = extra ? extra(row) : '';
  return `${label}: Yes${dur ? ' — ' + dur : ''}${extraText ? '. ' + extraText : ''}`;
}

function ynDuration(row, label, statusCol, { dateKey, yearsKey, monthsKey, extra } = {}) {
  const status = row[statusCol];
  if (!status) return null;
  if (status !== 'yes') return `${label}: ${status === 'unsure' ? 'Unsure' : 'No'}`;
  const dur = (dateKey || yearsKey || monthsKey) ? durationPhrase(row, dateKey, yearsKey, monthsKey) : '';
  const extraText = extra ? extra(row) : '';
  return `${label}: Yes${dur ? ' — ' + dur : ''}${extraText ? '. ' + extraText : ''}`;
}

function medListText(meds) {
  if (!Array.isArray(meds)) return '';
  return meds.filter(m => m?.name).map(m => {
    const dose = m.dose_mg || m.dose;
    const freq = m.freq_per_day || m.freq;
    return `${m.name}${dose ? ' ' + dose + ' mg' : ''}${freq ? ' — ' + freq + 'x/day' : ''}`;
  }).join(', ');
}

function comorbidity(row, label, prefix) {
  const status = row[`${prefix}_status`];
  if (!status) return null;
  if (status !== 'yes') return `${label}: ${status === 'unsure' ? 'Unsure' : 'No'}`;
  const dur = durationPhrase(row, `${prefix}_since_date`, `${prefix}_years`, `${prefix}_months`);
  const onMed = row[`${prefix}_on_med`];
  const meds = row[`${prefix}_meds`];
  const medText = onMed === 'yes' && Array.isArray(meds) && meds.some(m => m?.name) ? ' On ' + medListText(meds) + '.' : '';
  return `${label}: Yes${dur ? ' — ' + dur : ''}.${medText}`;
}

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

const PAGES = [
  // ── MODULE A — DEMOGRAPHICS ──
  { id: 'Q3', q: 'Marital status', f: row => row.marital_status ? `Marital status: ${cap(row.marital_status)}` : null },
  { id: 'Q4', q: 'Occupation', f: row => row.occupation ? `Occupation: ${row.occupation === 'other' ? row.occupation_other : words(row.occupation)}` : null },

  // ── MODULE E — NODULE DISCOVERY ──
  { id: 'Q5', q: 'How and when the nodule/swelling was first noticed', f: row => {
    if (!row.nodule_discovery_mode) return null;
    const dur = durationPhrase(row, 'nodule_noticed_date', 'nodule_duration_years', 'nodule_duration_months');
    const durAgo = dur.startsWith('for ') ? dur.slice(4) + ' ago' : dur;
    return `Noticed by: ${row.nodule_discovery_mode === 'other' ? row.nodule_discovery_other : words(row.nodule_discovery_mode)}${durAgo ? ' — ' + durAgo : ''}`;
  } },
  { id: 'Q6', q: 'Change in nodule size since noticed', f: row => {
    if (!row.nodule_size_change) return null;
    if (row.nodule_size_change !== 'yes') return `Size change: ${row.nodule_size_change === 'unsure' ? 'Unsure' : 'No'}`;
    if (row.nodule_growth_direction !== 'larger') return `Size change: ${words(row.nodule_growth_direction)}`;
    const dur = durationPhrase(row, null, 'nodule_growth_years', 'nodule_growth_months');
    return `Size change: Getting larger${dur ? ', over ' + dur.replace('for ', '') : ''}${row.nodule_growth_rate ? ` — ${words(row.nodule_growth_rate)}` : ''}`;
  } },
  { id: 'Q7', q: 'Consulted a doctor for this nodule', f: row => {
    if (!row.doctor_consulted_status) return null;
    if (row.doctor_consulted_status !== 'yes') return 'Consulted a doctor for this nodule: No';
    const tests = Array.isArray(row.doctor_advised_tests) ? row.doctor_advised_tests.map(words).join(', ') : '';
    return `Consulted a doctor for this nodule: Yes${row.doctor_consulted_date ? `, on ${fmtDate(row.doctor_consulted_date)}` : ''}${tests ? `. Advised: ${tests}` : ''}`;
  } },
  { id: 'Q8', q: 'Advised repeat thyroid ultrasound', f: row => {
    if (!row.repeat_usg_advised) return null;
    if (row.repeat_usg_advised !== 'yes') return 'Repeat USG advised: No';
    return `Repeat USG advised: Yes — ${row.repeat_usg_done === 'yes' ? 'done' : row.repeat_usg_due_date ? 'due ' + fmtDate(row.repeat_usg_due_date) + ', not yet done' : 'not yet done'}`;
  } },
  { id: 'Q9', q: 'Reason for seeking an online opinion now', f: row => {
    const triggers = Array.isArray(row.opinion_trigger) ? row.opinion_trigger : [];
    if (!triggers.length) return null;
    return `Opinion requested because: ${triggers.map(t => t === 'other' ? row.opinion_trigger_other : words(t)).join(', ')}`;
  } },

  // ── MODULE I — PLAN, DISCUSSION & PATIENT CONCERN ──
  { id: 'Q10', q: 'Management plan discussed by doctor', f: row => {
    if (!row.mgmt_plan_discussed) return null;
    if (row.mgmt_plan_discussed !== 'yes') return `Management plan discussed: ${row.mgmt_plan_discussed === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.mgmt_plan_types) ? row.mgmt_plan_types.map(words).join(' + ') : '';
    return `Management plan: ${types || '?'}${row.mgmt_plan_next_date ? ` (Next: ${fmtDate(row.mgmt_plan_next_date)})` : ''}`;
  } },
  { id: 'Q11', q: 'Possible outcomes discussed by doctor', f: row => {
    if (!row.outcomes_discussed) return null;
    if (row.outcomes_discussed !== 'yes') return `Outcomes discussed: ${row.outcomes_discussed === 'unsure' ? 'Unsure' : 'No'}`;
    const details = Array.isArray(row.outcomes_details) ? row.outcomes_details.map(words).join(' + ') : '';
    return `Outcomes discussed: ${details || 'Yes'}`;
  } },
  { id: 'Q12', q: "Patient's biggest concern about the nodule", f: row => row.patient_primary_concern ? `Biggest concern: ${row.patient_primary_concern === 'other' ? row.patient_concern_other : words(row.patient_primary_concern)}` : null },

  // ── MODULE D — LABS (TSH branch point) ──
  { id: 'Q13', q: 'TSH', f: row => labTest(row, 'TSH', 'tsh') },
  { id: 'Q14', q: 'Free T4 (FT4)', f: row => labTest(row, 'FT4', 'ft4') },
  { id: 'Q15', q: 'Free T3 (FT3)', f: row => labTest(row, 'FT3', 'ft3') },
  { id: 'Q16', q: 'Anti-TPO / Anti-Tg antibodies', f: row => {
    if (!row.antibody_status) return null;
    if (row.antibody_status !== 'yes') return `Anti-TPO / Anti-Tg: ${row.antibody_status === 'unsure' ? 'Unsure' : 'Not tested'}`;
    const parts = [];
    if (row.antitpo_value) parts.push(`Anti-TPO ${row.antitpo_value} IU/mL${row.antitpo_date ? ' (' + fmtDate(row.antitpo_date) + ')' : ''}`);
    if (row.antitg_value) parts.push(`Anti-Tg ${row.antitg_value} IU/mL${row.antitg_date ? ' (' + fmtDate(row.antitg_date) + ')' : ''}`);
    return `Anti-TPO / Anti-Tg: ${parts.length ? parts.join(' | ') : 'Tested, values not recorded'}`;
  } },
  { id: 'Q17a', q: 'Thyroid imaging', f: row => {
    if (!row.imaging_status) return null;
    if (row.imaging_status !== 'yes') return `Thyroid imaging: ${row.imaging_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.imaging_types) ? row.imaging_types.map(words).join(', ') : '';
    const count = row.nodule_count && row.nodule_count !== 'not_stated' ? `, ${row.nodule_count} nodule` : '';
    const size = row.nodule_size_mm ? `, ${row.nodule_size_mm} mm` : '';
    const tirads = row.tirads_category && row.tirads_category !== 'not_stated' ? `, TIRADS ${row.tirads_category}` : '';
    return `Thyroid imaging: ${types || 'Yes'}${count}${size}${tirads}${row.imaging_date ? ` (${fmtDate(row.imaging_date)})` : ''}`;
  } },
  { id: 'Q17b', q: 'Thyroid FNAC / Core Biopsy', f: row => {
    if (!row.cytology_status) return null;
    if (row.cytology_status !== 'yes') return `Thyroid FNAC/Biopsy: ${row.cytology_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.cytology_types) ? row.cytology_types.map(words).join(' / ') : '';
    const bethesda = row.bethesda_category && row.bethesda_category !== 'not_stated' ? ` — ${words(row.bethesda_category)}` : '';
    return `Thyroid FNAC/Biopsy: ${types || 'Yes'}${row.cytology_date ? ` on ${fmtDate(row.cytology_date)}` : ''}${bethesda}`;
  } },

  // ── MODULE B — REPRODUCTIVE HISTORY (female patients only) ──
  { id: 'B1', q: 'Hysterectomy', f: row => ynDuration(row, 'Hysterectomy', 'hysterectomy_status', {
    extra: r => {
      const reason = r.hysterectomy_reason === 'other' ? r.hysterectomy_reason_other : words(r.hysterectomy_reason);
      const precision = r.hysterectomy_date_precision || 'full';
      const when = precision === 'full' && r.hysterectomy_date ? fmtDate(r.hysterectomy_date)
        : precision === 'month_year' && r.hysterectomy_month && r.hysterectomy_year ? `${r.hysterectomy_month}/${r.hysterectomy_year}`
        : precision === 'year_only' && r.hysterectomy_year ? r.hysterectomy_year : '';
      return reason ? `Reason: ${reason}${when ? '. ' + when : ''}` : '';
    },
  }) },
  { id: 'B2', q: 'Menopausal status', f: row => {
    if (!row.menopause_status) return null;
    if (row.menopause_status !== 'post') return `Menopausal status: ${row.menopause_status === 'pre' ? 'Pre-menopausal' : 'Peri-menopausal'}`;
    return `Menopausal status: Post-menopausal${row.menopause_years_ago ? ` (${row.menopause_years_ago} years ago)` : ''}`;
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
  { id: 'C2', q: 'Prior thyroid surgery / RAI', f: row => {
    if (!row.thyroid_tx_status) return null;
    if (row.thyroid_tx_status !== 'yes') return `Prior thyroid surgery/RAI: ${row.thyroid_tx_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Prior thyroid surgery/RAI: ${words(row.thyroid_tx_type)}${row.thyroid_tx_year ? ` (${row.thyroid_tx_year})` : ''}`;
  } },
  { id: 'C3', q: 'Current thyroid medication', f: row => {
    if (!row.thyroid_med_status) return null;
    if (row.thyroid_med_status !== 'yes') return `Current thyroid medication: ${row.thyroid_med_status === 'unsure' ? 'Unsure' : 'No'}`;
    if (!row.thyroid_med_name) return 'Current thyroid medication: Yes (details not recorded)';
    return `Current thyroid medication: Tab. ${row.thyroid_med_brand || row.thyroid_med_name} — ${row.thyroid_med_dose || '?'} mcg${row.thyroid_med_timing ? ', ' + words(row.thyroid_med_timing) : ''}${row.thyroid_med_compliance ? ', ' + words(row.thyroid_med_compliance) : ''}`;
  } },
  { id: 'C4b', q: 'Family history of MEN syndrome / endocrine tumours', f: row => {
    if (!row.family_men_status) return null;
    if (row.family_men_status !== 'yes') return `Family history of MEN/endocrine tumours: ${row.family_men_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.family_men_types) ? row.family_men_types.map(words).join(', ') : '';
    return `Family history of MEN/endocrine tumours: ${types || '?'} — ${row.family_men_relative || 'relative not specified'}`;
  } },

  // ── MODULE F — PRIOR TREATMENT & OPINIONS ──
  { id: 'Q18', q: 'Prior treatment for this nodule', f: row => {
    if (!row.nodule_treatment_status) return null;
    if (row.nodule_treatment_status !== 'yes') return `Prior nodule treatment: ${row.nodule_treatment_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.nodule_treatment_types) ? row.nodule_treatment_types.map(words).join(', ') : '';
    return `Prior nodule treatment: ${types || '?'}${row.nodule_treatment_date ? ` — ${fmtDate(row.nodule_treatment_date)}` : ''}${row.nodule_treatment_completed ? `, ${row.nodule_treatment_completed}` : ''}`;
  } },
  { id: 'Q19', q: 'Prior treatment advice from a doctor', f: row => {
    if (!row.prior_advice_status) return null;
    if (row.prior_advice_status !== 'yes') return `Prior advice: ${row.prior_advice_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.prior_advice_types) ? row.prior_advice_types.map(words).join(', ') : '';
    const followed = row.prior_advice_followed === 'no' ? `Not followed (${row.prior_advice_not_followed_reason || '?'})` : words(row.prior_advice_followed);
    return `Prior advice: ${types || '?'} — ${followed}`;
  } },
  { id: 'Q20', q: 'Prior medical opinion from another doctor/hospital', f: row => {
    if (!row.prior_opinion_status) return null;
    if (row.prior_opinion_status !== 'yes') return 'Prior medical opinion sought: No';
    const specialty = Array.isArray(row.prior_opinion_specialty) ? row.prior_opinion_specialty.map(words).join(' / ') : '';
    return `Prior medical opinion: ${specialty || '?'}${row.prior_opinion_date ? `, ${fmtDate(row.prior_opinion_date)}` : ''}${row.prior_opinion_summary ? ` — ${row.prior_opinion_summary}` : ''}. Advice ${words(row.prior_opinion_followed) || 'not recorded'}`;
  } },
  { id: 'Q21', q: 'Current medication for this nodule/thyroid condition', f: row => {
    if (!row.current_med_status) return null;
    if (row.current_med_status !== 'yes') return `Current medication: ${row.current_med_status === 'unsure' ? 'Unsure' : 'No'}`;
    if (!row.current_med_brand) return 'Current medication: Yes (details not recorded)';
    const dur = durationPhrase(row, null, 'current_med_since_years', 'current_med_since_months');
    return `Current medication: Tab. ${row.current_med_brand} ${row.current_med_dose || ''} mcg — ${words(row.current_med_timing) || ''} — ${words(row.current_med_compliance) || ''}${dur ? '. Taking ' + dur : ''}`;
  } },

  // ── MODULE G — NODULE-SPECIFIC LOCAL SYMPTOMS ──
  { id: 'Q22', q: 'Swelling visible to others', f: row => {
    if (!row.nodule_visible_status) return null;
    if (row.nodule_visible_status !== 'yes') return `Swelling visible to others: ${row.nodule_visible_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'nodule_visible_since_date', 'nodule_visible_years', 'nodule_visible_months');
    const pattern = Array.isArray(row.nodule_visible_pattern) ? row.nodule_visible_pattern.map(words).join(', ') : '';
    return `Swelling visible to others: Yes${dur ? ' — ' + dur : ''}${pattern ? `. ${pattern}` : ''}`;
  } },
  { id: 'Q23', q: 'Neck pain or tenderness', f: row => {
    if (!row.neck_pain_status) return null;
    if (row.neck_pain_status !== 'yes') return `Neck pain: ${row.neck_pain_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.neck_pain_types) ? row.neck_pain_types.map(words).join(', ') : '';
    const dur = durationPhrase(row, 'neck_pain_since_date', 'neck_pain_years', 'neck_pain_months');
    return `Neck pain: ${row.neck_pain_severity ? cap(row.neck_pain_severity) + ' ' : ''}${types || '?'}${dur ? ' — ' + dur : ''}`;
  } },
  { id: 'Q24', q: 'Difficulty swallowing (dysphagia)', f: row => {
    if (!row.dysphagia_status) return null;
    if (row.dysphagia_status !== 'yes') return `Dysphagia: ${row.dysphagia_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'dysphagia_since_date', 'dysphagia_years', 'dysphagia_months');
    return `Dysphagia: ${row.dysphagia_severity ? cap(row.dysphagia_severity) + ' ' : ''}${words(row.dysphagia_type) || '?'}${dur ? ' — ' + dur : ''}`;
  } },
  { id: 'Q25', q: 'Breathing difficulty / throat tightness', f: row => {
    if (!row.resp_symptom_status) return null;
    if (row.resp_symptom_status !== 'yes') return `Breathing difficulty: ${row.resp_symptom_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.resp_symptom_types) ? row.resp_symptom_types.map(words).join(', ') : '';
    const dur = durationPhrase(row, 'resp_since_date', 'resp_years', 'resp_months');
    return `Breathing difficulty: ${types || '?'}${row.resp_symptom_trigger ? ` — ${words(row.resp_symptom_trigger)}` : ''}${dur ? ', ' + dur : ''}`;
  } },
  { id: 'Q26', q: 'Hoarseness / voice change', f: row => {
    if (!row.hoarseness_status) return null;
    if (row.hoarseness_status !== 'yes') return `Hoarseness: ${row.hoarseness_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'hoarseness_since_date', 'hoarseness_years', 'hoarseness_months');
    return `Hoarseness: ${row.hoarseness_pattern ? cap(row.hoarseness_pattern) + ' ' : ''}voice change${dur ? ' — ' + dur : ''}${row.voice_fatigue_status === 'yes' ? '. Voice fatigues easily' : ''}`;
  } },
  { id: 'Q27', q: 'Cough related to neck swelling', f: row => {
    if (!row.nodule_cough_status) return null;
    if (row.nodule_cough_status !== 'yes') return `Cough related to neck swelling: ${row.nodule_cough_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'nodule_cough_since_date', 'nodule_cough_years', 'nodule_cough_months');
    return `Cough related to neck swelling: ${row.nodule_cough_type ? words(row.nodule_cough_type) : '?'}${dur ? ' — ' + dur : ''}`;
  } },

  // ── MODULE H — SYSTEMIC & HORMONAL SYMPTOMS (shown only if TSH normal) ──
  { id: 'Q28', q: 'Fatigue / tiredness', f: row => symptom(row, 'Fatigue', 'fatigue', { extra: r => r.fatigue_severity ? `Severity: ${cap(r.fatigue_severity)}` : '' }) },
  { id: 'Q29', q: 'Unintentional weight change', f: row => symptom(row, 'Weight change', 'weight', {
    extra: r => r.weight_direction ? `${r.weight_direction === 'lost' ? 'Weight loss' : 'Weight gain'}${r.weight_kg ? ' of ' + r.weight_kg + ' kg' : ''}` : '',
  }) },
  { id: 'Q30', q: 'Appetite change', f: row => symptom(row, 'Appetite change', 'appetite_change', { extra: r => r.appetite_direction ? words(r.appetite_direction) : '' }) },
  { id: 'Q31', q: 'Cold intolerance', f: row => symptom(row, 'Cold intolerance', 'cold_intol', { extra: r => r.cold_intol_severity ? `Severity: ${cap(r.cold_intol_severity)}` : '' }) },
  { id: 'Q32', q: 'Bowel habit changes', f: row => symptom(row, 'Bowel habit changes', 'bowel', { extra: r => r.bowel_type ? cap(words(r.bowel_type)) : '' }) },
  { id: 'Q33', q: 'Skin changes', f: row => symptom(row, 'Skin changes', 'skin', { extra: r => Array.isArray(r.skin_types) && r.skin_types.length ? r.skin_types.map(words).join(', ') : '' }) },
  { id: 'Q34', q: 'Hair changes', f: row => symptom(row, 'Hair changes', 'hair', { extra: r => Array.isArray(r.hair_types) && r.hair_types.length ? r.hair_types.map(words).join(', ') : '' }) },
  { id: 'Q35', q: 'Muscle cramps, aches, or weakness', f: row => symptom(row, 'Muscle symptoms', 'muscle_sx', {
    extra: r => {
      const types = Array.isArray(r.muscle_sx_types) ? r.muscle_sx_types.map(words).join(', ') : '';
      const loc = r.muscle_sx_types?.includes('weakness') && r.muscle_weakness_location ? ` (${words(r.muscle_weakness_location)})` : '';
      return types ? types + loc : '';
    },
  }) },
  { id: 'Q36', q: 'Depressed / low mood', f: row => {
    const status = row.depression_status;
    if (!status) return null;
    if (status !== 'yes') return `Low mood/depressed: ${status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'depression_since_date', 'depression_years', 'depression_months');
    return `Low mood/depressed: Yes${dur ? ' — ' + dur : ''}.${row.depression_treated === 'yes' ? ' Treated.' : ''}${row.depression_diagnosed === 'yes' ? ' Formally diagnosed.' : ''}`;
  } },
  { id: 'Q37', q: 'Palpitations, tremors, or excessive sweating', f: row => symptom(row, 'Palpitations/tremor/sweating', 'palp_tremor', { extra: r => Array.isArray(r.palp_tremor_types) && r.palp_tremor_types.length ? r.palp_tremor_types.map(words).join(', ') : '' }) },
  { id: 'Q38', q: 'Anxiety / restlessness / irritability', f: row => symptom(row, 'Anxiety/restlessness', 'anxiety', { extra: r => r.anxiety_severity ? `Severity: ${cap(r.anxiety_severity)}` : '' }) },
  { id: 'Q39', q: 'Carpal tunnel symptoms (wrists/hands)', f: row => {
    const data = row.carpal_tunnel_data || {};
    const answered = Object.entries(data).filter(([, v]) => v?.status === 'yes');
    if (!answered.length) return null;
    return `Carpal tunnel symptoms: ${answered.map(([k, v]) => `${cap(k)} in ${v.side || '?'} wrist${durationPhrase(v.since || {}, v.since?.date ? 'date' : null, 'years', 'months') ? ' — ' + durationPhrase(v.since || {}, v.since?.date ? 'date' : null, 'years', 'months') : ''}`).join('; ')}`;
  } },

  // ── MODULE J — COMORBIDITIES, RISK FACTORS & NOTES ──
  { id: 'J1', q: 'Dyslipidaemia / high cholesterol', f: row => comorbidity(row, 'Dyslipidaemia', 'dyslipidaemia') },
  { id: 'J2', q: 'Anaemia', f: row => {
    if (!row.anaemia_status) return null;
    if (row.anaemia_status !== 'yes') return `Anaemia: ${row.anaemia_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Anaemia: ${row.anaemia_type ? words(row.anaemia_type) : 'Yes'}`;
  } },
  { id: 'J3', q: 'Diabetes', f: row => {
    if (!row.diabetes_status) return null;
    if (row.diabetes_status !== 'yes') return `Diabetes: ${row.diabetes_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'diabetes_since_date', 'diabetes_years', 'diabetes_months');
    return `Diabetes: ${row.diabetes_type ? words(row.diabetes_type) : '?'}${dur ? ' — ' + dur : ''}${row.diabetes_meds ? `. On ${row.diabetes_meds}` : ''}`;
  } },
  { id: 'J4', q: 'Hypertension', f: row => comorbidity(row, 'Hypertension', 'htn') },
  { id: 'J4b', q: 'PCOS / PMOS', f: row => {
    if (!row.pcos_status) return null;
    if (row.pcos_status !== 'yes') return `PCOS/PMOS: ${row.pcos_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'pcos_since_date', 'pcos_years', 'pcos_months');
    const med = row.pcos_on_med === 'yes' && row.pcos_med_name ? `. On Tab. ${row.pcos_med_name}` : '';
    return `PCOS/PMOS: ${row.pcos_label ? row.pcos_label.toUpperCase() : 'Yes'}${dur ? ' — ' + dur : ''}.${med}`;
  } },
  { id: 'J4c', q: 'Difficulty conceiving', f: row => row.infertility_status == null ? null : `Difficulty conceiving: ${row.infertility_status === 'yes' ? 'Yes' : row.infertility_status === 'unsure' ? 'Unsure' : 'No'}` },
  { id: 'J5', q: 'Known autoimmune conditions', f: row => {
    if (!row.autoimmune_status) return null;
    if (row.autoimmune_status !== 'yes') return `Autoimmune conditions: ${row.autoimmune_status === 'unsure' ? 'Unsure' : 'No'}`;
    const conds = Array.isArray(row.autoimmune_conditions) ? row.autoimmune_conditions.map(c => c === 'other' ? row.autoimmune_other : words(c)).join(', ') : '';
    return `Autoimmune conditions: ${conds || 'Yes'}`;
  } },
  { id: 'J6', q: 'Family history of thyroid disease', f: row => {
    if (!row.family_thyroid_status) return null;
    if (row.family_thyroid_status !== 'yes') return `Family history of thyroid disease: ${row.family_thyroid_status === 'unsure' ? 'Unsure' : 'No'}`;
    const relations = Array.isArray(row.family_thyroid_relations) ? row.family_thyroid_relations.map(words).join(', ') : '';
    return `Family history of thyroid disease: ${relations || '?'}${row.family_thyroid_condition ? ` — ${words(row.family_thyroid_condition)}` : ''}`;
  } },
  { id: 'J7', q: 'History of radiation exposure to head/neck/chest', f: row => {
    if (!row.radiation_exposure_status) return null;
    if (row.radiation_exposure_status !== 'yes') return `Radiation exposure: ${row.radiation_exposure_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.radiation_exposure_types) ? row.radiation_exposure_types.map(t => t === 'other' ? row.radiation_exposure_other : words(t)).join(', ') : '';
    return `Radiation exposure: ${types || '?'}${row.radiation_exposure_year ? `, ${row.radiation_exposure_year}` : ''}`;
  } },
  { id: 'J8', q: 'History of iodine deficiency', f: row => ynDuration(row, 'Iodine deficiency', 'iodine_deficiency_status', {
    dateKey: 'iodine_deficiency_since_date', yearsKey: 'iodine_deficiency_years', monthsKey: 'iodine_deficiency_months',
  }) },
  { id: 'J9', q: 'Current iodine-containing medications/supplements', f: row => {
    if (!row.iodine_med_status) return null;
    if (row.iodine_med_status !== 'yes') return `Iodine-containing medication: ${row.iodine_med_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'iodine_med_since_date', 'iodine_med_years', 'iodine_med_months');
    return `Iodine-containing medication: ${row.iodine_med_name || '?'}${dur ? ' — taking ' + dur : ''}`;
  } },
  { id: 'J10', q: 'Additional notes for the doctor', f: row => row.additional_notes ? `Additional notes: ${row.additional_notes}` : null },
];

// Explicit id -> module-letter map, since page ids (Q3, B1, J4b...) don't
// self-encode this the way Hypo/Hyper/TC's do. Matches the module
// comments in NoduleQuestionnaire.js's allPages definition.
const MODULE_BY_ID = {
  Q3: 'A', Q4: 'A',
  Q5: 'E', Q6: 'E', Q7: 'E', Q8: 'E', Q9: 'E',
  Q10: 'I', Q11: 'I', Q12: 'I',
  Q13: 'D', Q14: 'D', Q15: 'D', Q16: 'D', Q17a: 'D', Q17b: 'D',
  B1: 'B', B2: 'B', B3: 'B', B4: 'B', B5: 'B',
  C1: 'C', C2: 'C', C3: 'C', C4b: 'C',
  Q18: 'F', Q19: 'F', Q20: 'F', Q21: 'F',
  Q22: 'G', Q23: 'G', Q24: 'G', Q25: 'G', Q26: 'G', Q27: 'G',
  Q28: 'H', Q29: 'H', Q30: 'H', Q31: 'H', Q32: 'H', Q33: 'H', Q34: 'H',
  Q35: 'H', Q36: 'H', Q37: 'H', Q38: 'H', Q39: 'H',
  J1: 'J', J2: 'J', J3: 'J', J4: 'J', J4b: 'J', J4c: 'J', J5: 'J',
  J6: 'J', J7: 'J', J8: 'J', J9: 'J', J10: 'J',
};

function formatNoduleAnswers(row) {
  if (!row) return [];
  return PAGES
    .map(p => {
      let answer;
      try { answer = p.f(row); } catch (e) { answer = null; }
      return answer ? { id: p.id, question: p.q, answer } : null;
    })
    .filter(Boolean);
}

module.exports = { formatNoduleAnswers, PAGES, MODULE_BY_ID };
