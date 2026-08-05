// ============================================================
// Full path:
//   thyroconsult-backend\src\services\tcReportFormatter.js
//
// Third condition (after Hypo, Hyper) to get the "single-file,
// question-by-question" report. Covers all answerable pages of
// tc_questionnaire, in the exact same order as TcQuestionnaire.js's
// `allPages` array (A3-A4, D5a-D5b, E1-E11, B1-B5, C1-C5, D1-D7,
// F1-F24, H1-H9).
//
// Field names here were pulled directly from TcQuestionnaire.js's own
// get()/set() calls and TC_PAGE_VALIDATORS, cross-checked against the
// TC_Q_COLUMNS whitelist (migration 042 fixed the one gap found:
// thyroid_med_treatment_type). Unlike Hyper, TC's symptom fields have NO
// "sym_" prefix (e.g. fatigue_status, not sym_fatigue_status) — kept
// that way here to match the real columns.
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

// Generic Module-F symptom line (TC field names have no "sym_" prefix).
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

// Generic comorbidity — status / since_date+years+months / on_med / {prefix}_meds
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
  { id: 'A3', q: 'Marital status', f: row => row.marital_status ? `Marital status: ${cap(row.marital_status)}` : null },
  { id: 'A4', q: 'Occupation', f: row => row.occupation ? `Occupation: ${row.occupation === 'other' ? row.occupation_other : words(row.occupation)}` : null },

  // ── MODULE D (partial) — IMAGING & FNAC ──
  { id: 'D5a', q: 'Thyroid imaging', f: row => {
    if (!row.imaging_status) return null;
    if (row.imaging_status !== 'yes') return `Thyroid imaging: ${row.imaging_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.imaging_types) ? row.imaging_types.map(words).join(', ') : '';
    return `Thyroid imaging: ${types || 'Yes'}${row.imaging_date ? ` — ${fmtDate(row.imaging_date)}` : ''}${row.imaging_finding ? `. Findings: ${row.imaging_finding}` : ''}`;
  } },
  { id: 'D5b', q: 'Thyroid FNAC / Biopsy', f: row => {
    if (!row.cytology_status) return null;
    if (row.cytology_status !== 'yes') return `Thyroid FNAC / Biopsy: ${row.cytology_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.cytology_types) ? row.cytology_types.map(words).join(' / ') : '';
    return `Thyroid FNAC / Biopsy: ${types || 'Yes'}${row.cytology_date ? ` — ${fmtDate(row.cytology_date)}` : ''}${row.cytology_result ? `. Result: ${words(row.cytology_result)}` : ''}`;
  } },

  // ── MODULE E — CA THYROID SPECIFIC ──
  { id: 'E1', q: 'Thyroid cancer type & year of diagnosis', f: row => {
    if (!row.ca_thyroid_type) return null;
    const type = row.ca_thyroid_type === 'other' ? row.ca_thyroid_type_other : row.ca_thyroid_type.toUpperCase();
    return `Cancer type: ${type}${row.ca_dx_year ? `, diagnosed ${row.ca_dx_year}` : ''}`;
  } },
  { id: 'E2', q: 'Staging & grading', f: row => {
    if (!row.ca_staged) return null;
    if (row.ca_staged !== 'yes') return `Staged/graded: ${row.ca_staged === 'unsure' ? 'Unsure' : 'No'}`;
    return `Staging: ${row.ca_stage && row.ca_stage !== 'not_known' ? 'Stage ' + row.ca_stage : 'Not known'}${row.ca_grade && row.ca_grade !== 'not_known' ? `, ${words(row.ca_grade)} grade` : ''}`;
  } },
  { id: 'E3', q: 'Surgery for thyroid cancer', f: row => {
    if (!row.ca_surgery_type) return null;
    if (row.ca_surgery_type === 'no_surgery') return 'Surgery: No surgery done';
    const type = row.ca_surgery_type === 'other' ? row.ca_surgery_type_other : words(row.ca_surgery_type);
    return `Surgery: ${type}${row.ca_surgery_date ? ` — ${fmtDate(row.ca_surgery_date)}` : ''}${row.ca_surgery_side && row.ca_surgery_side !== 'na' ? `, ${words(row.ca_surgery_side)}` : ''}`;
  } },
  { id: 'E4', q: 'Neck dissection', f: row => ynDuration(row, 'Neck dissection', 'neck_dissection_status', {
    extra: r => r.neck_dissection_type ? `${words(r.neck_dissection_type)}${r.neck_dissection_side ? ' (' + r.neck_dissection_side + ')' : ''}` : '',
  }) },
  { id: 'E5', q: 'RAI therapy after surgery', f: row => {
    if (!row.rai_post_surgery_status) return null;
    if (row.rai_post_surgery_status !== 'yes') return `RAI after surgery: ${row.rai_post_surgery_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `RAI after surgery: Yes — ${row.rai_cycles || '?'} cycle(s)${row.rai_total_dose_mci ? `, ${row.rai_total_dose_mci} mCi total` : ''}${row.rai_last_date ? `, last ${fmtDate(row.rai_last_date)}` : ''}${row.rai_purpose ? `. Purpose: ${words(row.rai_purpose)}` : ''}`;
  } },
  { id: 'E6', q: 'External beam radiation therapy (EBRT)', f: row => {
    if (!row.ebrt_status) return null;
    if (row.ebrt_status !== 'yes') return `EBRT: ${row.ebrt_status === 'unsure' ? 'Unsure' : 'No'}`;
    const regions = Array.isArray(row.ebrt_regions) ? row.ebrt_regions.map(r => r === 'other' ? row.ebrt_other : words(r)).join(', ') : '';
    return `EBRT: Yes — ${regions || '?'}${row.ebrt_date ? `, ${fmtDate(row.ebrt_date)}` : ''}`;
  } },
  { id: 'E7', q: 'Targeted therapy / systemic treatment', f: row => {
    if (!row.targeted_tx_status) return null;
    if (row.targeted_tx_status !== 'yes') return `Targeted therapy: ${row.targeted_tx_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Targeted therapy: ${row.targeted_tx_name || '?'} (${row.targeted_tx_dose || '?'} ${row.targeted_tx_unit || 'mg'})${row.targeted_tx_freq ? `, ${row.targeted_tx_freq}x/day` : ''} — ${row.targeted_tx_ongoing === 'yes' ? 'ongoing' : 'stopped' + (row.targeted_tx_stop_reason ? ' (' + words(row.targeted_tx_stop_reason) + ')' : '')}`;
  } },
  { id: 'E8', q: 'Recurrence', f: row => {
    if (!row.recurrence_status) return null;
    if (row.recurrence_status !== 'yes') return `Recurrence: ${row.recurrence_status === 'unsure' ? 'Unsure' : 'No'}`;
    const sites = Array.isArray(row.recurrence_sites) ? row.recurrence_sites.map(words).join(', ') : '';
    return `Recurrence: Yes — ${sites || '?'}${row.recurrence_date ? `, detected ${fmtDate(row.recurrence_date)}` : ''}`;
  } },
  { id: 'E9', q: 'Distant metastases', f: row => {
    if (!row.metastasis_status) return null;
    if (row.metastasis_status !== 'yes') return `Distant metastases: ${row.metastasis_status === 'unsure' ? 'Unsure' : 'No'}`;
    const sites = Array.isArray(row.metastasis_sites) ? row.metastasis_sites.map(s => s === 'other' ? row.metastasis_other : words(s)).join(', ') : '';
    return `Distant metastases: Yes — ${sites || '?'}${row.metastasis_date ? `, first detected ${fmtDate(row.metastasis_date)}` : ''}`;
  } },
  { id: 'E10', q: 'Thyroglobulin (Tg) / TgAb monitoring', f: row => {
    if (!row.tg_status) return null;
    if (row.tg_status !== 'yes') return `Tg / TgAb: ${row.tg_status === 'unsure' ? 'Unsure' : 'No'}`;
    const parts = [];
    if (row.tg_value) parts.push(`Tg ${row.tg_value} ng/mL${row.tg_date ? ' (' + fmtDate(row.tg_date) + ')' : ''}`);
    if (row.tgab_value) parts.push(`TgAb ${row.tgab_value}${row.tgab_date ? ' (' + fmtDate(row.tgab_date) + ')' : ''}`);
    return `Tg / TgAb: ${parts.length ? parts.join(' | ') : 'Tested, values not recorded'}${row.tg_stimulated ? `. Stimulated: ${words(row.tg_stimulated)}` : ''}`;
  } },
  { id: 'E11', q: 'Surveillance imaging after treatment', f: row => {
    if (!row.surveillance_status) return null;
    if (row.surveillance_status !== 'yes') return `Surveillance imaging: ${row.surveillance_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.surveillance_types) ? row.surveillance_types.map(words).join(', ') : '';
    return `Surveillance imaging: ${types || 'Yes'}${row.surveillance_date ? ` — ${fmtDate(row.surveillance_date)}` : ''}${row.surveillance_findings ? `. Findings: ${words(row.surveillance_findings)}` : ''}`;
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
    const parts = [];
    const type = row.thyroid_med_treatment_type;
    if ((type === 'levo_only' || type === 'combination') && row.thyroid_med_brand && row.thyroid_med_dose) {
      const brand = row.thyroid_med_brand === 'other' ? (row.thyroid_med_name || 'Other') : row.thyroid_med_brand;
      const dur = durationPhrase(row, null, 'thyroid_med_since_years', 'thyroid_med_since_months');
      parts.push(`LT4: Tab. ${brand} — ${row.thyroid_med_dose} mcg${row.thyroid_med_timing ? ', ' + words(row.thyroid_med_timing) : ''}${row.thyroid_med_compliance ? ', ' + words(row.thyroid_med_compliance) : ''}${dur ? '. Taking ' + dur : ''}${row.dose_changed_status === 'yes' ? `. Dose changed ${row.dose_last_changed_date ? fmtDate(row.dose_last_changed_date) : ''} (${words(row.dose_change_reason)})` : ''}`);
    }
    if ((type === 'lio_only' || type === 'combination') && row.liothyronine_brand && row.liothyronine_dose) {
      const brand = row.liothyronine_brand === 'other' ? (row.liothyronine_name || 'Other') : row.liothyronine_brand;
      const dur = durationPhrase(row, null, 'liothyronine_since_years', 'liothyronine_since_months');
      parts.push(`LT3: Tab. ${brand} — ${row.liothyronine_dose} mcg${row.liothyronine_timing ? ', ' + words(row.liothyronine_timing) : ''}${row.liothyronine_compliance ? ', ' + words(row.liothyronine_compliance) : ''}${dur ? '. Taking ' + dur : ''}${row.liothyronine_dose_changed_status === 'yes' ? `. Dose changed ${row.liothyronine_dose_changed_date ? fmtDate(row.liothyronine_dose_changed_date) : ''} (${words(row.liothyronine_dose_change_reason)})` : ''}`);
    }
    if (type === 'other' && row.thyroid_med_name) {
      parts.push(`${row.thyroid_med_name} — ${row.thyroid_med_dose || '?'} mcg${row.thyroid_med_timing ? ', ' + words(row.thyroid_med_timing) : ''}${row.thyroid_med_compliance ? ', ' + words(row.thyroid_med_compliance) : ''}${row.dose_changed_status === 'yes' ? `. Dose changed ${row.dose_last_changed_date ? fmtDate(row.dose_last_changed_date) : ''} (${words(row.dose_change_reason)})` : ''}`);
    }
    return `Current thyroid medication: ${parts.length ? parts.join(' + ') : 'Yes (details not recorded)'}`;
  } },
  { id: 'C4a', q: 'Family history of thyroid disease', f: row => {
    if (!row.family_thyroid_status) return null;
    if (row.family_thyroid_status !== 'yes') return `Family history of thyroid disease: ${row.family_thyroid_status === 'unsure' ? 'Unsure' : 'No'}`;
    const relations = Array.isArray(row.family_thyroid_relations) ? row.family_thyroid_relations.map(words).join(', ') : '';
    return `Family history of thyroid disease: ${relations || '?'}${row.family_thyroid_condition ? ` — ${words(row.family_thyroid_condition)}` : ''}`;
  } },
  { id: 'C4b', q: 'Family history of MEN syndrome / endocrine tumours', f: row => {
    if (!row.family_men_status) return null;
    if (row.family_men_status !== 'yes') return `Family history of MEN/endocrine tumours: ${row.family_men_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.family_men_types) ? row.family_men_types.map(words).join(', ') : '';
    return `Family history of MEN/endocrine tumours: ${types || '?'} — ${row.family_men_relative || 'relative not specified'}`;
  } },
  { id: 'C5', q: 'Known autoimmune conditions', f: row => {
    if (!row.autoimmune_status) return null;
    if (row.autoimmune_status !== 'yes') return `Autoimmune conditions: ${row.autoimmune_status === 'unsure' ? 'Unsure' : 'No'}`;
    const conds = Array.isArray(row.autoimmune_conditions) ? row.autoimmune_conditions.map(c => c === 'other' ? row.autoimmune_other : words(c)).join(', ') : '';
    return `Autoimmune conditions: ${conds || 'Yes'}`;
  } },

  // ── MODULE D — LABORATORY ──
  { id: 'D1', q: 'TSH', f: row => labTest(row, 'TSH', 'tsh') },
  { id: 'D2', q: 'T3 (total)', f: row => labTest(row, 'T3', 't3') },
  { id: 'D3', q: 'Free T3 (FT3)', f: row => labTest(row, 'FT3', 'ft3') },
  { id: 'D4', q: 'T4 (total)', f: row => labTest(row, 'T4', 't4') },
  { id: 'D5', q: 'Free T4 (FT4)', f: row => labTest(row, 'FT4', 'ft4') },
  { id: 'D6', q: 'Anti-TPO antibody', f: row => labTest(row, 'Anti-TPO', 'antitpo') },
  { id: 'D7', q: 'Anti-Tg antibody', f: row => labTest(row, 'Anti-Tg', 'antitg') },

  // ── MODULE F — SYMPTOMS ──
  { id: 'F1', q: 'Fatigue / tiredness', f: row => symptom(row, 'Fatigue', 'fatigue', { extra: r => r.fatigue_severity ? `Severity: ${cap(r.fatigue_severity)}` : '' }) },
  { id: 'F2', q: 'Unintentional weight change', f: row => symptom(row, 'Weight change', 'weight', {
    extra: r => r.weight_direction ? `${r.weight_direction === 'lost' ? 'Weight loss' : 'Weight gain'}${r.weight_kg ? ' of ' + r.weight_kg + ' kg' : ''}` : '',
  }) },
  { id: 'F3', q: 'Appetite change', f: row => row.appetite_status ? `Appetite: ${words(row.appetite_status)}` : null },
  { id: 'F4', q: 'Cold intolerance', f: row => symptom(row, 'Cold intolerance', 'cold_intol') },
  { id: 'F5', q: 'Bowel habit changes', f: row => symptom(row, 'Bowel habit changes', 'bowel', { extra: r => r.bowel_type ? cap(words(r.bowel_type)) : '' }) },
  { id: 'F6', q: 'Abdominal bloating/fullness/discomfort', f: row => symptom(row, 'Abdominal symptoms', 'abdominal', { extra: r => Array.isArray(r.abdominal_types) && r.abdominal_types.length ? r.abdominal_types.map(words).join(', ') : '' }) },
  { id: 'F7', q: 'Skin changes', f: row => symptom(row, 'Skin changes', 'skin', { extra: r => Array.isArray(r.skin_types) && r.skin_types.length ? r.skin_types.map(words).join(', ') : '' }) },
  { id: 'F8a', q: 'Periorbital puffiness', f: row => symptom(row, 'Periorbital puffiness', 'periorbital') },
  { id: 'F8b', q: 'Facial oedema', f: row => symptom(row, 'Facial oedema', 'facial_oedema') },
  { id: 'F9', q: 'Pedal oedema (leg/feet swelling)', f: row => symptom(row, 'Pedal oedema', 'leg_oedema', { extra: r => r.leg_oedema_type ? cap(words(r.leg_oedema_type)) : '' }) },
  { id: 'F10', q: 'Hair changes', f: row => symptom(row, 'Hair changes', 'hair', { extra: r => Array.isArray(r.hair_types) && r.hair_types.length ? r.hair_types.map(words).join(', ') : '' }) },
  { id: 'F11', q: 'Nail changes', f: row => symptom(row, 'Nail changes', 'nail', { extra: r => Array.isArray(r.nail_types) && r.nail_types.length ? r.nail_types.map(words).join(', ') : '' }) },
  { id: 'F12', q: 'Hoarseness / voice change', f: row => symptom(row, 'Hoarseness', 'hoarseness', { extra: r => r.hoarseness_pattern ? cap(words(r.hoarseness_pattern)) : '' }) },
  { id: 'F13', q: 'Muscle cramps / aches', f: row => symptom(row, 'Muscle cramps', 'muscle_cramp') },
  { id: 'F14', q: 'General muscle weakness / heaviness', f: row => symptom(row, 'Muscle weakness', 'muscle_weakness', { extra: r => r.muscle_weakness_location ? `Location: ${words(r.muscle_weakness_location)}` : '' }) },
  { id: 'F15a', q: 'Difficulty concentrating', f: row => symptom(row, 'Concentration difficulty', 'cognition') },
  { id: 'F15b', q: 'Memory problems', f: row => symptom(row, 'Memory problems', 'memory') },
  { id: 'F16', q: 'Depressed / low mood', f: row => {
    const status = row.depression_status;
    if (!status) return null;
    if (status !== 'yes') return `Low mood/depressed: ${status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'depression_since_date', 'depression_years', 'depression_months');
    return `Low mood/depressed: Yes${dur ? ' — ' + dur : ''}.${row.depression_treated === 'yes' ? ' Treated.' : ''}${row.depression_diagnosed === 'yes' ? ' Formally diagnosed.' : ''}`;
  } },
  { id: 'F17', q: 'Excessive daytime sleepiness', f: row => symptom(row, 'Excessive sleepiness', 'hypersomnia') },
  { id: 'F18', q: 'Slow heart rate (bradycardia)', f: row => symptom(row, 'Bradycardia', 'bradycardia') },
  { id: 'F19', q: 'Postural giddiness', f: row => symptom(row, 'Postural giddiness', 'postural_giddiness', { extra: r => r.postural_giddiness_freq ? `Frequency: ${words(r.postural_giddiness_freq)}` : '' }) },
  { id: 'F20', q: 'Blackout / loss of consciousness', f: row => {
    const status = row.blackout_status;
    if (!status) return null;
    if (status !== 'yes') return `Blackout episodes: ${status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Blackout episodes: Yes${row.blackout_count ? ` — ${row.blackout_count} episode(s)` : ''}${row.blackout_last_date ? `, last on ${fmtDate(row.blackout_last_date)}` : ''}${row.blackout_assessed === 'yes' ? '. Medically assessed' : ''}${row.blackout_dx ? ' — ' + row.blackout_dx : ''}`;
  } },
  { id: 'F21', q: 'Hearing difficulties / tinnitus', f: row => symptom(row, 'Hearing difficulties', 'hearing', { extra: r => r.hearing_type ? cap(words(r.hearing_type)) : '' }) },
  { id: 'F22', q: 'Delayed / sluggish reflexes', f: row => row.delayed_reflexes_status ? `Delayed reflexes: ${row.delayed_reflexes_status === 'yes' ? 'Yes' : row.delayed_reflexes_status === 'unsure' ? 'Unsure' : 'No'}` : null },
  { id: 'F23', q: 'Carpal tunnel symptoms (wrists/hands)', f: row => {
    const data = row.carpal_tunnel_data || {};
    const answered = Object.entries(data).filter(([, v]) => v?.status === 'yes');
    if (!answered.length) return null;
    return `Carpal tunnel symptoms: ${answered.map(([k, v]) => `${cap(k)} in ${v.side || '?'} wrist${durationPhrase(v.since || {}, v.since?.date ? 'date' : null, 'years', 'months') ? ' — ' + durationPhrase(v.since || {}, v.since?.date ? 'date' : null, 'years', 'months') : ''}`).join('; ')}`;
  } },
  { id: 'F24', q: 'Tongue enlargement (macroglossia)', f: row => row.macroglossia_status ? `Macroglossia: ${row.macroglossia_status === 'yes' ? 'Yes' : row.macroglossia_status === 'unsure' ? 'Unsure' : 'No'}` : null },

  // ── MODULE H — COMORBIDITIES & NOTES ──
  { id: 'H1', q: 'Dyslipidaemia / high cholesterol', f: row => comorbidity(row, 'Dyslipidaemia', 'dyslipidaemia') },
  { id: 'H2', q: 'Anaemia', f: row => {
    if (!row.anaemia_status) return null;
    if (row.anaemia_status !== 'yes') return `Anaemia: ${row.anaemia_status === 'unsure' ? 'Unsure' : 'No'}`;
    return `Anaemia: ${row.anaemia_type ? words(row.anaemia_type) : 'Yes'}`;
  } },
  { id: 'H3', q: 'Diabetes / high blood sugar', f: row => comorbidity(row, 'Diabetes', 'diabetes') },
  { id: 'H4', q: 'PCOS / PMOS', f: row => {
    if (!row.pcos_status) return null;
    if (row.pcos_status !== 'yes') return `PCOS/PMOS: ${row.pcos_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dur = durationPhrase(row, 'pcos_since_date', 'pcos_years', 'pcos_months');
    const med = row.pcos_on_med === 'yes' && row.pcos_med_name ? `. On Tab. ${row.pcos_med_name}${row.pcos_med_dose ? ' (' + row.pcos_med_dose + ' mg)' : ''}` : '';
    return `PCOS/PMOS: ${row.pcos_label ? row.pcos_label.toUpperCase() : 'Yes'}${dur ? ' — ' + dur : ''}.${med}`;
  } },
  { id: 'H5', q: 'Difficulty conceiving', f: row => row.infertility_status == null ? null : `Difficulty conceiving: ${row.infertility_status === 'yes' ? 'Yes' : row.infertility_status === 'unsure' ? 'Unsure' : 'No'}` },
  { id: 'H6', q: 'Depression (formally diagnosed)', f: row => ynDuration(row, 'Depression', 'depression_dx_status', { extra: r => r.depression_on_med === 'yes' ? 'On medication' : '' }) },
  { id: 'H7', q: 'Osteoporosis / osteopenia', f: row => {
    if (!row.osteoporosis_status) return null;
    if (row.osteoporosis_status !== 'yes') return `Osteoporosis: ${row.osteoporosis_status === 'unsure' ? 'Unsure' : 'No'}`;
    const dexa = row.osteoporosis_dexa === 'yes' ? ' — DEXA confirmed' : '';
    const med = row.osteoporosis_on_med === 'yes' && row.osteoporosis_med_name ? `. On ${row.osteoporosis_med_name}` : '';
    return `Osteoporosis: Yes${dexa}.${med}`;
  } },
  { id: 'H8', q: 'Family history of non-thyroid cancer / endocrine tumours', f: row => {
    if (!row.family_cancer_status) return null;
    if (row.family_cancer_status !== 'yes') return `Family history of non-thyroid cancer: ${row.family_cancer_status === 'unsure' ? 'Unsure' : 'No'}`;
    const types = Array.isArray(row.family_cancer_types) ? row.family_cancer_types.map(words).join(', ') : '';
    return `Family history of non-thyroid cancer: ${types || '?'} — ${row.family_cancer_relative || 'relative not specified'}`;
  } },
  { id: 'H9', q: 'Additional notes for the doctor', f: row => row.additional_notes ? `Additional notes: ${row.additional_notes}` : null },
];

function formatTcAnswers(row) {
  if (!row) return [];
  return PAGES
    .map(p => {
      let answer;
      try { answer = p.f(row); } catch (e) { answer = null; }
      return answer ? { id: p.id, question: p.q, answer } : null;
    })
    .filter(Boolean);
}

module.exports = { formatTcAnswers, PAGES };
