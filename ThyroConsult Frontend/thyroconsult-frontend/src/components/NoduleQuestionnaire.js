// ============================================================
// NoduleQuestionnaire.js
// Full path:
//   thyroconsult-frontend\src\components\NoduleQuestionnaire.js
//
// Chatbot-style questionnaire for Thyroid Nodule
// 1 question per page. Yes → sub-questions on same page.
// No/Unsure → next page immediately.
// Architecture matches TcQuestionnaire / HyperQuestionnaire exactly.
// Nodule-prefixed UI primitives to avoid naming conflicts.
//
// Key feature: TSH BRANCH at Q13
//   TSH > upper ref → onComplete({ switchToHypo: true })
//   TSH < lower ref → onComplete({ switchToHyper: true })
//   TSH normal      → continue Q14–Q48
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { conditionAPI } from "../api/index";

// ─── Nodule-prefixed UI primitives ───────────────────────────────────────────

const NoduleField = ({ label, children, hint }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontWeight: 600, marginBottom: 6, color: "#1a1a2e", fontSize: 14 }}>{label}</label>}
    {hint && <p style={{ margin: "0 0 6px", fontSize: 12, color: "#666" }}>{hint}</p>}
    {children}
  </div>
);

const NoduleInput = ({ value, onChange, type = "text", placeholder, min, max, style }) => (
  <input
    type={type}
    value={value || ""}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    min={min}
    max={max}
    data-hyporeq-type={type === "date" ? "date" : "text"}
    data-hyporeq-filled={value ? "true" : "false"}
    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #d0d7e8", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", ...style }}
  />
);

// Year-of-event input that can't be before the patient's own birth year.
const NoduleYearInput = ({ value, onChange, dob, placeholder, style }) => {
  const dobYear = dob ? new Date(dob).getFullYear() : null;
  const thisYear = new Date().getFullYear();
  const invalid = dobYear && value && parseInt(value) < dobYear;
  return (
    <div>
      <NoduleInput type="number" value={value} onChange={onChange} placeholder={placeholder}
        min={dobYear || 1950} max={thisYear} style={style} />
      {invalid && (
        <div style={{ fontSize: 11, color: "#c0392b", marginTop: 4 }}>
          Can't be before your birth year ({dobYear})
        </div>
      )}
    </div>
  );
};

const NoduleSelect = ({ value, onChange, options, placeholder }) => (
  <select
    value={value || ""}
    onChange={e => onChange(e.target.value)}
    data-hyporeq-type="select"
    data-hyporeq-filled={value ? "true" : "false"}
    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #d0d7e8", borderRadius: 8, fontSize: 14, background: "#fff", outline: "none" }}
  >
    {placeholder && <option value="">{placeholder}</option>}
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const NoduleRadioGroup = ({ value, onChange, options, inline }) => (
  <div data-hyporeq-type="select" data-hyporeq-filled={value ? "true" : "false"} style={{ display: "flex", flexDirection: inline ? "row" : "column", gap: 10, flexWrap: "wrap" }}>
    {options.map(o => (
      <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${value === o.value ? "#534AB7" : "#d0d7e8"}`, background: value === o.value ? "#EEEDFE" : "#fff", fontWeight: value === o.value ? 600 : 400, fontSize: 14, whiteSpace: "nowrap" }}>
        <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} style={{ accentColor: "#534AB7" }} />
        {o.label}
      </label>
    ))}
  </div>
);

const NoduleCheckGroup = ({ values = [], onChange, options }) => {
  const toggle = (val) => {
    const next = values.includes(val) ? values.filter(v => v !== val) : [...values, val];
    onChange(next);
  };
  return (
    <div data-hyporeq-type="select" data-hyporeq-filled={values.length ? "true" : "false"} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {options.map(o => (
        <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${values.includes(o.value) ? "#534AB7" : "#d0d7e8"}`, background: values.includes(o.value) ? "#EEEDFE" : "#fff", fontSize: 14 }}>
          <input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} style={{ accentColor: "#534AB7" }} />
          {o.label}
        </label>
      ))}
    </div>
  );
};

const NoduleYesNoUnsure = ({ value, onChange }) => (
  <NoduleRadioGroup value={value} onChange={onChange} inline options={[{ value: "no", label: "No" }, { value: "unsure", label: "Unsure" }, { value: "yes", label: "Yes" }]} />
);

const NoduleYesNo = ({ value, onChange }) => (
  <NoduleRadioGroup value={value} onChange={onChange} inline options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
);

const NoduleDurationPicker = ({ label = "Since when?", sinceDate, onSinceDate, years, onYears, months, onMonths, minDate }) => (
  <NoduleField label={label}>
    <div data-hyporeq-type="duration" data-hyporeq-filled={(sinceDate || years || months) ? "true" : "false"} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 180px" }}>
        <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Date (if known)</label>
        <NoduleInput type="date" value={sinceDate} onChange={onSinceDate} max={new Date().toISOString().split("T")[0]} min={minDate || undefined} />
      </div>
      <div style={{ display: "flex", gap: 8, flex: "1 1 160px", alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Years</label>
          <NoduleInput type="number" value={years} onChange={onYears} min={0} max={100} placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Months</label>
          <NoduleInput type="number" value={months} onChange={onMonths} min={0} max={11} placeholder="0" />
        </div>
      </div>
    </div>
  </NoduleField>
);

const NoduleMedBlock = ({ med, index, onChange, onRemove }) => (
  <div style={{ border: "1px solid #d0d7e8", borderRadius: 8, padding: 14, marginBottom: 10, background: "#fafbff" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <span style={{ fontWeight: 600, fontSize: 13, color: "#534AB7" }}>Medicine {index + 1}</span>
      {onRemove && <button onClick={onRemove} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 13 }}>✕ Remove</button>}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <NoduleField label="Medicine name"><NoduleInput value={med.name} onChange={v => onChange({ ...med, name: v })} placeholder="e.g. Atorvastatin" /></NoduleField>
      <NoduleField label="Dose (mg)"><NoduleInput type="number" value={med.dose_mg} onChange={v => onChange({ ...med, dose_mg: v })} placeholder="e.g. 20" /></NoduleField>
      <NoduleField label="Times per day"><NoduleInput type="number" value={med.freq_per_day} onChange={v => onChange({ ...med, freq_per_day: v })} min={1} max={10} placeholder="e.g. 1" /></NoduleField>
      <NoduleField label="Since (months)"><NoduleInput type="number" value={med.since_months} onChange={v => onChange({ ...med, since_months: v })} min={0} placeholder="e.g. 6" /></NoduleField>
    </div>
  </div>
);

// No longer rendered on the patient-facing screen (per explicit request).
// Underlying answers still save normally regardless of this.
const NoduleOutputBox = () => null;

// Applied as minHeight (not fixed height) to the question content area for
// visual consistency with Hypo/Hyper's card height. Note: Nodule's
// Prev/Next bar is position:fixed at the bottom (unlike Hypo/Hyper's
// in-flow nav), so this isn't preventing a button-jump bug here — it's
// purely visual, per explicit request. Same measured value as
// HYPO_PAGE_MIN_HEIGHT.
const NODULE_PAGE_MIN_HEIGHT = 328;

const NoduleSectionCard = ({ title, children }) => (
  <div style={{ marginTop: 20, padding: "16px 20px", border: "1.5px solid #d0d7e8", borderRadius: 10, background: "#fff" }}>
    {title && <p style={{ margin: "0 0 14px", fontWeight: 700, color: "#534AB7", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</p>}
    {children}
  </div>
);

const TshBranchAlert = ({ type }) => {
  const isHigh = type === "high";
  return (
    <div style={{ margin: "20px 0", padding: "16px 20px", background: isHigh ? "#E6F1FB" : "#FAEEDA", border: `1.5px solid ${isHigh ? "#185FA5" : "#854F0B"}`, borderRadius: 10 }}>
      <p style={{ fontWeight: 700, color: isHigh ? "#0C447C" : "#633806", marginBottom: 8, fontSize: 15 }}>
        {isHigh ? "🔵 TSH is above normal — may indicate Hypothyroidism" : "🟠 TSH is below normal — may indicate Hyperthyroidism"}
      </p>
      <p style={{ fontSize: 13, color: isHigh ? "#185FA5" : "#854F0B", margin: 0 }}>
        {isHigh
          ? "You will now be taken to the Hypothyroidism questionnaire to provide more details about your thyroid condition."
          : "You will now be taken to the Hyperthyroidism questionnaire to provide more details about your thyroid condition."}
      </p>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function durationText(years, months, sinceDate) {
  if (sinceDate) {
    const totalDays = Math.floor((Date.now() - new Date(sinceDate)) / 86400000);
    const y = Math.floor(totalDays / 365);
    const m = Math.floor((totalDays % 365) / 30);
    if (y > 0 && m > 0) return `${y} year${y > 1 ? "s" : ""} and ${m} month${m > 1 ? "s" : ""}`;
    if (y > 0) return `${y} year${y > 1 ? "s" : ""}`;
    if (m > 0) return `${m} month${m > 1 ? "s" : ""}`;
    return `${totalDays} day${totalDays !== 1 ? "s" : ""}`;
  }
  const y = parseInt(years) || 0;
  const m = parseInt(months) || 0;
  if (y > 0 && m > 0) return `${y} year${y > 1 ? "s" : ""} and ${m} month${m > 1 ? "s" : ""}`;
  if (y > 0) return `${y} year${y > 1 ? "s" : ""}`;
  if (m > 0) return `${m} month${m > 1 ? "s" : ""}`;
  return "";
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB");
}

function calcAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob)) / (365.25 * 86400000));
}

function calcEDD(lmp, iso) {
  if (!lmp) return "";
  const d = new Date(lmp);
  d.setMonth(d.getMonth() + 9);
  d.setDate(d.getDate() + 7);
  return iso ? d.toISOString().split("T")[0] : d.toLocaleDateString("en-GB");
}

// Evaluate TSH branch: "high" | "low" | "normal" | null
function evalTshBranch(tshValue, refLow, refHigh) {
  const v = parseFloat(tshValue);
  const lo = parseFloat(refLow);
  const hi = parseFloat(refHigh);
  if (isNaN(v) || isNaN(lo) || isNaN(hi)) return null;
  if (v > hi) return "high";
  if (v < lo) return "low";
  return "normal";
}

// ─── Per-page completion validators — built directly from each page's own
// actual render logic above. ───
const ndDur = d => !!(d && (d.since_date || d.years || d.months));
const NODULE_PAGE_VALIDATORS = {
  Q3: d => !!d.marital_status,
  Q4: d => !!d.occupation && (d.occupation !== "other" || !!d.occupation_other),

  Q5: d => !!d.nodule_discovery_mode && (d.nodule_discovery_mode !== "other" || !!d.nodule_discovery_other) && ndDur({ since_date: d.nodule_noticed_date, years: d.nodule_duration_years, months: d.nodule_duration_months }),
  Q6: d => !!d.nodule_size_change && (d.nodule_size_change !== "yes" || (!!d.nodule_growth_direction && (d.nodule_growth_direction !== "larger" || (!!d.nodule_growth_years || !!d.nodule_growth_months) && !!d.nodule_growth_rate))),
  Q7: d => !!d.doctor_consulted_status && (d.doctor_consulted_status !== "yes" || (!!d.doctor_consulted_date && (d.doctor_advised_tests || []).length > 0)),
  Q8: d => !!d.repeat_usg_advised && (d.repeat_usg_advised !== "yes" || (!!d.repeat_usg_done && (d.repeat_usg_done !== "no" || !!d.repeat_usg_due_date))),
  Q9: d => (d.opinion_trigger || []).length > 0 && (!(d.opinion_trigger || []).includes("other") || !!d.opinion_trigger_other),

  Q10: d => !!d.mgmt_plan_discussed && (d.mgmt_plan_discussed !== "yes" || (d.mgmt_plan_types || []).length > 0),
  Q11: d => !!d.outcomes_discussed,
  Q12: d => !!d.patient_primary_concern && (d.patient_primary_concern !== "other" || !!d.patient_concern_other),

  // TSH — ref range is functionally required here (not just optional
  // detail like other lab screens) because the branch logic can't
  // classify high/low/normal without both bounds.
  Q13: d => !!d.tsh_status && (d.tsh_status !== "yes" || (!!d.tsh_value && !!d.tsh_date && !!d.tsh_ref_low && !!d.tsh_ref_high)),
  Q14: d => !!d.ft4_status && (d.ft4_status !== "yes" || (!!d.ft4_value && !!d.ft4_date)),
  Q15: d => !!d.ft3_status && (d.ft3_status !== "yes" || (!!d.ft3_value && !!d.ft3_date)),
  // Anti-TPO/Anti-Tg explicitly optional ("neither is mandatory")
  Q16: d => !!d.antibody_status,
  Q17a: d => !!d.imaging_status && (d.imaging_status !== "yes" || ((d.imaging_types || []).length > 0 && !!d.imaging_date && !!d.nodule_count && !!d.tirads_category)),
  Q17b: d => !!d.cytology_status && (d.cytology_status !== "yes" || ((d.cytology_types || []).length > 0 && !!d.cytology_date && !!d.bethesda_category)),

  B1: d => {
    if (!d.hysterectomy_status) return false;
    if (d.hysterectomy_status !== "yes") return true;
    if (!d.hysterectomy_reason || (d.hysterectomy_reason === "other" && !d.hysterectomy_reason_other)) return false;
    const precision = d.hysterectomy_date_precision || "full";
    if (precision === "full") return !!d.hysterectomy_date;
    if (precision === "month_year") return !!d.hysterectomy_month && !!d.hysterectomy_year;
    if (precision === "year_only") return !!d.hysterectomy_year;
    return true;
  },
  B2: d => !!d.menopause_status && (d.menopause_status !== "post" || !!d.menopause_years_ago),
  B3: d => !!d.menstrual_change_status && (d.menstrual_change_status !== "yes" || !!d.menstrual_pattern),
  B4: d => !!d.lmp_date,
  B5: d => {
    // An unanswered LMP (d.lmp_date falsy) must NOT fall back to "0 days
    // ago" — that made this page silently count as complete with zero
    // input, since 0 < 31 always short-circuited to true before any date
    // was ever entered. Same fix applied to Hyper/TC's identical B5.
    if (d.lmp_date) {
      const lmpDaysAgo = Math.floor((Date.now() - new Date(d.lmp_date)) / 86400000);
      if (lmpDaysAgo < 31) return true;
    }
    return !!d.pregnancy_status;
  },

  C1: d => !!d.thyroid_dx_status && (d.thyroid_dx_status !== "yes" || (!!d.thyroid_dx_type && !!d.thyroid_dx_year)),
  C2: d => !!d.thyroid_tx_status && (d.thyroid_tx_status !== "yes" || (!!d.thyroid_tx_type && !!d.thyroid_tx_year)),
  C3: d => !!d.thyroid_med_status && (d.thyroid_med_status !== "yes" || (!!d.thyroid_med_name && !!d.thyroid_med_brand && !!d.thyroid_med_dose && !!d.thyroid_med_timing && !!d.thyroid_med_compliance)),
  C4b: d => !!d.family_men_status && (d.family_men_status !== "yes" || ((d.family_men_types || []).length > 0 && !!d.family_men_relative)),

  Q18: d => !!d.nodule_treatment_status && (d.nodule_treatment_status !== "yes" || ((d.nodule_treatment_types || []).length > 0 && !!d.nodule_treatment_date && !!d.nodule_treatment_completed)),
  Q19: d => !!d.prior_advice_status && (d.prior_advice_status !== "yes" || ((d.prior_advice_types || []).length > 0 && !!d.prior_advice_followed && (d.prior_advice_followed !== "no" || !!d.prior_advice_not_followed_reason))),
  Q20: d => !!d.prior_opinion_status && (d.prior_opinion_status !== "yes" || ((d.prior_opinion_specialty || []).length > 0 && !!d.prior_opinion_date && !!d.prior_opinion_summary && !!d.prior_opinion_followed)),
  Q21: d => !!d.current_med_status && (d.current_med_status !== "yes" || (!!d.current_med_name && !!d.current_med_brand && !!d.current_med_dose && !!d.current_med_timing && !!d.current_med_compliance)),

  Q22: d => !!d.nodule_visible_status && (d.nodule_visible_status !== "yes" || (ndDur({ since_date: d.nodule_visible_since_date, years: d.nodule_visible_years, months: d.nodule_visible_months }) && (d.nodule_visible_pattern || []).length > 0)),
  Q23: d => !!d.neck_pain_status && (d.neck_pain_status !== "yes" || ((d.neck_pain_types || []).length > 0 && !!d.neck_pain_severity && ndDur({ since_date: d.neck_pain_since_date, years: d.neck_pain_years, months: d.neck_pain_months }))),
  Q24: d => !!d.dysphagia_status && (d.dysphagia_status !== "yes" || (!!d.dysphagia_type && !!d.dysphagia_severity && ndDur({ since_date: d.dysphagia_since_date, years: d.dysphagia_years, months: d.dysphagia_months }))),
  Q25: d => !!d.resp_symptom_status && (d.resp_symptom_status !== "yes" || ((d.resp_symptom_types || []).length > 0 && !!d.resp_symptom_trigger && ndDur({ since_date: d.resp_since_date, years: d.resp_years, months: d.resp_months }))),
  Q26: d => !!d.hoarseness_status && (d.hoarseness_status !== "yes" || (ndDur({ since_date: d.hoarseness_since_date, years: d.hoarseness_years, months: d.hoarseness_months }) && !!d.hoarseness_pattern && !!d.voice_fatigue_status)),
  Q27: d => !!d.nodule_cough_status && (d.nodule_cough_status !== "yes" || (!!d.nodule_cough_type && ndDur({ since_date: d.nodule_cough_since_date, years: d.nodule_cough_years, months: d.nodule_cough_months }))),

  Q28: d => !!d.fatigue_status && (d.fatigue_status !== "yes" || (!!d.fatigue_severity && ndDur({ since_date: d.fatigue_since_date, years: d.fatigue_years, months: d.fatigue_months }))),
  Q29: d => !!d.weight_change_status && (d.weight_change_status !== "yes" || (!!d.weight_direction && !!d.weight_kg && ndDur({ since_date: d.weight_since_date, years: d.weight_years, months: d.weight_months }))),
  Q30: d => !!d.appetite_change_status && (d.appetite_change_status !== "yes" || (!!d.appetite_direction && ndDur({ since_date: d.appetite_since_date, years: d.appetite_years, months: d.appetite_months }))),
  Q31: d => !!d.cold_intol_status && (d.cold_intol_status !== "yes" || (!!d.cold_intol_severity && ndDur({ since_date: d.cold_intol_since_date, years: d.cold_intol_years, months: d.cold_intol_months }))),
  Q32: d => !!d.bowel_change_status && (d.bowel_change_status !== "yes" || (!!d.bowel_type && ndDur({ since_date: d.bowel_since_date, years: d.bowel_years, months: d.bowel_months }))),
  Q33: d => !!d.skin_status && (d.skin_status !== "yes" || ((d.skin_types || []).length > 0 && ndDur({ since_date: d.skin_since_date, years: d.skin_years, months: d.skin_months }))),
  Q34: d => !!d.hair_status && (d.hair_status !== "yes" || ((d.hair_types || []).length > 0 && ndDur({ since_date: d.hair_since_date, years: d.hair_years, months: d.hair_months }))),
  Q35: d => !!d.muscle_sx_status && (d.muscle_sx_status !== "yes" || ((d.muscle_sx_types || []).length > 0 && (!(d.muscle_sx_types || []).includes("weakness") || !!d.muscle_weakness_location) && ndDur({ since_date: d.muscle_sx_since_date, years: d.muscle_sx_years, months: d.muscle_sx_months }))),
  Q36: d => !!d.depression_status && (d.depression_status !== "yes" || (ndDur({ since_date: d.depression_since_date, years: d.depression_years, months: d.depression_months }) && !!d.depression_treated && !!d.depression_diagnosed)),
  Q37: d => !!d.palp_tremor_status && (d.palp_tremor_status !== "yes" || ((d.palp_tremor_types || []).length > 0 && ndDur({ since_date: d.palp_tremor_since_date, years: d.palp_tremor_years, months: d.palp_tremor_months }))),
  Q38: d => !!d.anxiety_status && (d.anxiety_status !== "yes" || (!!d.anxiety_severity && ndDur({ since_date: d.anxiety_since_date, years: d.anxiety_years, months: d.anxiety_months }))),
  Q39: d => ["pain", "numbness", "tingling"].every(type => {
    const item = (d.carpal_tunnel_data || {})[type] || {};
    if (!item.status) return false;
    if (item.status !== "yes") return true;
    return !!item.side && ndDur({ since_date: item.since?.date, years: item.since?.years, months: item.since?.months });
  }),

  J1: d => !!d.dyslipidaemia_status && (d.dyslipidaemia_status !== "yes" || (ndDur({ since_date: d.dyslipidaemia_since_date, years: d.dyslipidaemia_years, months: d.dyslipidaemia_months }) && !!d.dyslipidaemia_on_med && (d.dyslipidaemia_on_med !== "yes" || (d.dyslipidaemia_meds || []).some(m => m.name)))),
  J2: d => !!d.anaemia_status && (d.anaemia_status !== "yes" || !!d.anaemia_type),
  // "Current medications" on J3 is explicitly labelled optional
  J3: d => !!d.diabetes_status && (d.diabetes_status !== "yes" || (!!d.diabetes_type && ndDur({ since_date: d.diabetes_since_date, years: d.diabetes_years, months: d.diabetes_months }))),
  J4: d => !!d.htn_status && (d.htn_status !== "yes" || (ndDur({ since_date: d.htn_since_date, years: d.htn_years, months: d.htn_months }) && !!d.htn_on_med && (d.htn_on_med !== "yes" || (d.htn_meds || []).some(m => m.name)))),
  J4b: d => !!d.pcos_status && (d.pcos_status !== "yes" || (!!d.pcos_label && ndDur({ since_date: d.pcos_since_date, years: d.pcos_years, months: d.pcos_months }) && !!d.pcos_on_med && (d.pcos_on_med !== "yes" || !!d.pcos_med_name))),
  J4c: d => !!d.infertility_status,
  J5: d => !!d.autoimmune_status && (d.autoimmune_status !== "yes" || ((d.autoimmune_conditions || []).length > 0 && (!(d.autoimmune_conditions || []).includes("other") || !!d.autoimmune_other))),
  J6: d => !!d.family_thyroid_status && (d.family_thyroid_status !== "yes" || ((d.family_thyroid_relations || []).length > 0 && !!d.family_thyroid_condition)),
  J7: d => !!d.radiation_exposure_status && (d.radiation_exposure_status !== "yes" || ((d.radiation_exposure_types || []).length > 0 && (!(d.radiation_exposure_types || []).includes("other") || !!d.radiation_exposure_other) && !!d.radiation_exposure_year)),
  J8: d => !!d.iodine_deficiency_status && (d.iodine_deficiency_status !== "yes" || ndDur({ since_date: d.iodine_deficiency_since_date, years: d.iodine_deficiency_years, months: d.iodine_deficiency_months })),
  J9: d => !!d.iodine_med_status && (d.iodine_med_status !== "yes" || (!!d.iodine_med_name && ndDur({ since_date: d.iodine_med_since_date, years: d.iodine_med_years, months: d.iodine_med_months }))),
  J10: () => true,
};

const NDREQ_MESSAGES = { select: "Select any one", date: "Enter date", duration: "Enter duration", text: "Enter details" };
const NoduleMissingPointer = ({ containerRef, active, pageKey }) => {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!active || !containerRef.current) { setPos(null); return; }
    const scan = () => {
      if (!containerRef.current) return;
      const el = containerRef.current.querySelector('[data-hyporeq-filled="false"]');
      if (!el) { setPos(null); return; }
      const elRect = el.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      setPos({ top: elRect.top - containerRect.top, left: elRect.left - containerRect.left, type: el.getAttribute("data-hyporeq-type") || "select" });
    };
    scan();
    const t = setTimeout(scan, 60);
    const observer = new MutationObserver(scan);
    observer.observe(containerRef.current, { attributes: true, attributeFilter: ["data-hyporeq-filled"], childList: true, subtree: true });
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [active, containerRef, pageKey]);

  if (!pos) return null;
  return (
    <>
      <style>{`
        @keyframes ndreqBounce { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(7px); } }
        .ndreq-arrow { animation: ndreqBounce 0.9s ease-in-out infinite; }
      `}</style>
      <div style={{ position: "absolute", top: Math.max(0, pos.top - 30), left: pos.left, display: "flex", alignItems: "center", gap: 4, zIndex: 5, pointerEvents: "none" }}>
        <div style={{ background: "#c0392b", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap" }}>
          {NDREQ_MESSAGES[pos.type] || "Answer this question"}
        </div>
        <div className="ndreq-arrow" style={{ fontSize: 15, color: "#c0392b" }}>➜</div>
      </div>
    </>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function NoduleQuestionnaire({
  episodeId, patientId, patientDob, patientGender, maritalStatus, hysterectomyDone, onComplete, onBack,
}) {
  const isFemale  = ["female", "Female"].includes(patientGender || "");
  const isMarried = (maritalStatus || "").toLowerCase() === "married";

  const [data, setData]             = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  // Resets on every page change — without this, lastSavedAt stays truthy
  // forever once the FIRST autosave anywhere in the session fires (e.g.
  // the draft-load-triggered save on mount), so "✓ Saved" kept showing
  // on brand-new, still-blank pages the patient hadn't touched yet —
  // reporting "something was saved at some point," not "this page is
  // saved." Same fix as HypoQuestionnaire.js's lastSavedAt.
  useEffect(() => { setLastSavedAt(null); }, [currentPage]);
  const [tshBranch, setTshBranch]   = useState(null); // null | "high" | "low" | "normal"
  const [branchConfirmed, setBranchConfirmed] = useState(false);
  const [savedPageId, setSavedPageId] = useState(null);
  const [resumedFrom, setResumedFrom] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const pageContentRef = useRef(null);

  const set = useCallback((key, value) => setData(prev => ({ ...prev, [key]: value })), []);
  const get = useCallback((key, fallback = "") => (data[key] !== undefined ? data[key] : fallback), [data]);

  // Evaluate TSH branch whenever TSH fields change
  useEffect(() => {
    const branch = evalTshBranch(get("tsh_value"), get("tsh_ref_low"), get("tsh_ref_high"));
    setTshBranch(branch);
  }, [data]);

  // ── Dynamic page list ─────────────────────────────────────────────────────
  const allPages = useMemo(() => {
    const hadHysterectomy = get("hysterectomy_status") === "yes" || hysterectomyDone;
    const isPostMeno      = get("menopause_status") === "post";
    const hideInfertility = !isFemale || hadHysterectomy || !isMarried;
    const tshNormal       = tshBranch === "normal";
    const incidentalQ5    = get("nodule_discovery_mode") === "incidental_imaging";
    const doctorConsulted = get("doctor_consulted_status") === "yes";

    return [
      // MODULE A
      "Q3", "Q4",

      // MODULE E — Nodule discovery
      "Q5", "Q6", "Q7",
      ...(incidentalQ5 && doctorConsulted ? ["Q8"] : []),
      "Q9",

      // MODULE I — Plan & concern (shown early)
      "Q10", "Q11", "Q12",

      // MODULE D — Labs (TSH first, then branch)
      "Q13",                              // TSH — branch point
      ...(tshNormal ? ["Q14", "Q15", "Q16", "Q17a", "Q17b"] : []),

      // MODULE B — Female only (shown after labs)
      ...(isFemale ? [
        "B1", "B2",
        ...(!hadHysterectomy ? ["B3"] : []),
        ...(!hadHysterectomy && !isPostMeno ? ["B4"] : []),
        ...(!hadHysterectomy && !isPostMeno && isMarried ? ["B5"] : []),
      ] : []),

      // MODULE C — Thyroid history (shown for all, same as CA Thyroid)
      "C1", "C2", "C3", "C4b",

      // MODULE F — Prior treatment & opinions
      "Q18", "Q19", "Q20", "Q21",

      // MODULE G — Local nodule symptoms
      "Q22", "Q23", "Q24", "Q25", "Q26", "Q27",

      // MODULE H — Systemic symptoms (shown only if TSH normal)
      ...(tshNormal ? ["Q28","Q29","Q30","Q31","Q32","Q33","Q34","Q35","Q36","Q37","Q38","Q39"] : []),

      // MODULE J — Comorbidities, risk factors & finish
      "J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9",
      ...(isFemale ? ["J4b"] : []),       // PCOS (female only)
      ...(!hideInfertility ? ["J4c"] : []),// Infertility (female, married, no hysterectomy)
      "J10",
    ];
  }, [data, isFemale, isMarried, hysterectomyDone, tshBranch]);

  const totalPages = allPages.length;
  const pageId     = allPages[currentPage] || "Q3";
  const progress   = Math.round(((currentPage + 1) / totalPages) * 100);
  // What's actually reported to the backend as completion_percent —
  // counts pages that genuinely pass their own validator (same check
  // handleSubmit uses), not just position in the flow. Matches
  // HypoQuestionnaire.js's validationProgress fix — see its comment.
  const validationProgress = Math.round(
    (allPages.filter(id => {
      const v = NODULE_PAGE_VALIDATORS[id];
      return v ? v(data) : true;
    }).length / totalPages) * 100
  );

  // Blocks proceeding past a screen whose year-of-event field is before
  // the patient's own birth year.
  const dobYear = patientDob ? new Date(patientDob).getFullYear() : null;
  const yearFieldByPage = { B1: "hysterectomy_year", C1: "thyroid_dx_year", C2: "thyroid_tx_year", J7: "radiation_exposure_year" };
  const currentYearField = yearFieldByPage[pageId];
  const yearInvalid = dobYear && currentYearField && get(currentYearField) && parseInt(get(currentYearField)) < dobYear;

  // Resume exactly where the patient left off, once, after allPages has
  // recomputed with the branching-relevant answers (and TSH branch)
  // restored.
  useEffect(() => {
    if (!resumedFrom && savedPageId) {
      const idx = allPages.indexOf(savedPageId);
      if (idx > 0) setCurrentPage(idx);
      setResumedFrom(true);
    }
  }, [savedPageId, resumedFrom, allPages]);

  // ── Load draft ────────────────────────────────────────────────────────────
  // NOTE: this previously had no .then() at all — the response was
  // fetched and immediately discarded. Nodule was the only one of the
  // four condition questionnaires where a returning patient's answers
  // were never restored under any circumstances, not even buggily.
  const [draftLoadError, setDraftLoadError] = useState('');
  const loadedForRef = useRef(null);
  const loadDraft = useCallback(() => {
    if (patientId && episodeId) {
      setDraftLoadError('');
      conditionAPI.getNoduleQ(patientId, episodeId)
        .then(d => {
          if (d && Object.keys(d).length) {
            setData(prev => ({ ...prev, ...d }));
            if (d.current_page) setSavedPageId(d.current_page);
          }
        })
        .catch(() => {
          setDraftLoadError('Could not load your saved answers. Your previous answers have NOT been lost — please retry before continuing, rather than re-entering everything.');
        });
    }
  }, [patientId, episodeId]);
  useEffect(() => {
    const key = `${patientId}::${episodeId}`;
    if (loadedForRef.current !== null && loadedForRef.current !== key) {
      // Different patient or episode than whatever this instance last
      // loaded — reset to blank BEFORE loading the new draft. Without
      // this, since `data` is sent back to the server as-is on save, any
      // field the previous patient's session touched that the new
      // episode doesn't set would not just display wrong, it could get
      // saved into the new patient's record on next submit. Also resets
      // branchConfirmed — a leftover "confirmed" flag from a previous
      // patient's TSH branch could otherwise auto-confirm this patient's.
      setData({});
      setCurrentPage(0);
      setReviewMode(false);
      setSavedPageId(null);
      setResumedFrom(false);
      setBranchConfirmed(false);
    }
    loadedForRef.current = key;
    loadDraft();
  }, [patientId, episodeId, loadDraft]);

  // ── Autosave ───────────────────────────────────────────────────────────────
  // Replaces saving only when the patient clicked Next. Saves
  // automatically ~1.5s after the patient stops interacting, and on page
  // change, so a network outage or a voluntary pause never loses answers.
  const skipFirstAutosave = useRef(true);
  useEffect(() => {
    if (skipFirstAutosave.current) { skipFirstAutosave.current = false; return; }
    if (!patientId || !episodeId) return;
    const t = setTimeout(async () => {
      try {
        await conditionAPI.saveNoduleQ(patientId, episodeId, { ...data, _draft: true, _currentPage: pageId, _progressPercent: validationProgress });
        setLastSavedAt(Date.now());
      } catch { /* silent — retries on next change */ }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, currentPage]);

  // ── Final submit ─────────────────────────────────────────────────────────
  // NOTE: all three exit paths (normal completion, switchToHypo,
  // switchToHyper) previously called saveDraft(), which always sent
  // _draft:true — none of them could ever actually mark the
  // questionnaire complete. Separated out a real final-submit path.
  const submitFinal = useCallback(async (result) => {
    if (!patientId || !episodeId) return;
    setSaving(true);
    try {
      await conditionAPI.saveNoduleQ(patientId, episodeId, { ...data, _draft: false, _progressPercent: validationProgress });
      onComplete && onComplete(result);
    } catch { setSaveMsg("Submission failed. Please try again."); }
    finally { setSaving(false); }
  }, [data, patientId, episodeId, onComplete, validationProgress]);

  // Every question needs an answer before the questionnaire can actually
  // be submitted — finds the first incomplete page (in display order, so
  // it respects branching, including the TSH-normal-only pages) and
  // routes there instead of submitting. Only applies to the NORMAL
  // completion path — the TSH-branch handoff (switchToHypo/switchToHyper)
  // intentionally bypasses this, since it's handing off to a different
  // questionnaire entirely rather than completing this one.
  const handleSubmit = useCallback(() => {
    const incompleteIdx = allPages.findIndex(id => { const v = NODULE_PAGE_VALIDATORS[id]; return v ? !v(data) : false; });
    if (incompleteIdx !== -1) {
      setReviewMode(true);
      setCurrentPage(incompleteIdx);
      setSaveMsg("Please answer this question before submitting — some questions were left incomplete.");
      return;
    }
    setReviewMode(false);
    submitFinal(data);
  }, [allPages, data, submitFinal]);

  const incompleteList = reviewMode
    ? allPages.map((id, idx) => ({ id, idx })).filter(({ id }) => { const v = NODULE_PAGE_VALIDATORS[id]; return v ? !v(data) : false; })
    : [];

  const next = useCallback(() => {
    if (yearInvalid) return;
    // TSH branch — trigger switch before moving past Q13. Left completely
    // untouched by reviewMode/handleSubmit: this hands off to a different
    // questionnaire, so full-questionnaire completeness doesn't apply.
    if (pageId === "Q13" && (tshBranch === "high" || tshBranch === "low") && !branchConfirmed) {
      setBranchConfirmed(true);
      return; // show the alert on same page; user clicks Next again to confirm
    }
    if (pageId === "Q13" && tshBranch === "high" && branchConfirmed) {
      submitFinal({ switchToHypo: true, data });
      return;
    }
    if (pageId === "Q13" && tshBranch === "low" && branchConfirmed) {
      submitFinal({ switchToHyper: true, data });
      return;
    }
    if (reviewMode) {
      const leavingValidator = NODULE_PAGE_VALIDATORS[pageId];
      if (leavingValidator && !leavingValidator(data)) { setSaveMsg("Please answer this question before continuing."); return; }
      setSaveMsg("");
      const ahead = incompleteList.find(({ idx }) => idx > currentPage);
      const target = ahead || incompleteList[0];
      if (target) { setCurrentPage(target.idx); return; }
      handleSubmit();
      return;
    }
    if (currentPage < totalPages - 1) setCurrentPage(p => p + 1);
    else handleSubmit();
  }, [currentPage, totalPages, pageId, tshBranch, branchConfirmed, submitFinal, data, yearInvalid, reviewMode, incompleteList, handleSubmit]);

  const prev = useCallback(() => {
    setBranchConfirmed(false);
    if (currentPage > 0) setCurrentPage(p => p - 1);
  }, [currentPage]);

  // ── Render page ───────────────────────────────────────────────────────────
  const renderPage = () => {
    switch (pageId) {

      // ══════════════════════════════════════════════════════
      // MODULE A — DEMOGRAPHICS
      // ══════════════════════════════════════════════════════

      // ══════════════════════════════════════════════════════
      // Q1 (DOB) and Q2 (biological sex) REMOVED — sourced from the
      // patients table only (patientDob, patientGender props), not
      // re-collected here. See props at top of component.
      // ══════════════════════════════════════════════════════

      case "Q3": return (
        <div>
          <h3>What is your marital status?</h3>
          <NoduleRadioGroup value={get("marital_status")} onChange={v => set("marital_status", v)} options={[{ value: "unmarried", label: "Unmarried" }, { value: "married", label: "Married" }, { value: "divorced", label: "Divorced" }, { value: "widowed", label: "Widowed" }]} />
          <NoduleOutputBox text={get("marital_status") ? get("marital_status").charAt(0).toUpperCase() + get("marital_status").slice(1) : ""} />
        </div>
      );

      case "Q4": return (
        <div>
          <h3>What is your occupation or profession?</h3>
          <NoduleRadioGroup value={get("occupation")} onChange={v => set("occupation", v)} options={[
            { value: "teacher", label: "Teacher" }, { value: "singer", label: "Singer" },
            { value: "actor", label: "Actor" }, { value: "vocal_instructor", label: "Vocal instructor" },
            { value: "call_centre", label: "Call centre agent" }, { value: "sales", label: "Sales professional" },
            { value: "other", label: "Other" },
          ]} />
          {get("occupation") === "other" && (
            <NoduleField label="Please specify"><NoduleInput value={get("occupation_other")} onChange={v => set("occupation_other", v)} placeholder="Your occupation" /></NoduleField>
          )}
          <NoduleOutputBox text={get("occupation") ? `Occupation: ${get("occupation") === "other" ? get("occupation_other") : get("occupation").replace(/_/g, " ")}` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE E — NODULE DISCOVERY & HISTORY
      // ══════════════════════════════════════════════════════

      case "Q5": return (
        <div>
          <h3>When did you — or someone else — first notice the nodule or swelling in the neck, and how was it discovered?</h3>
          <NoduleField label="How was it noticed?">
            <NoduleRadioGroup value={get("nodule_discovery_mode")} onChange={v => set("nodule_discovery_mode", v)} options={[
              { value: "self", label: "I felt it myself" },
              { value: "family", label: "Noticed by a family member" },
              { value: "friend", label: "Noticed by a friend" },
              { value: "doctor_exam", label: "Noticed by a doctor during examination" },
              { value: "incidental_imaging", label: "Found incidentally on imaging (ultrasound, CT, MRI) done for another reason" },
              { value: "other", label: "Other" },
            ]} />
          </NoduleField>
          {get("nodule_discovery_mode") === "other" && (
            <NoduleField label="Please specify"><NoduleInput value={get("nodule_discovery_other")} onChange={v => set("nodule_discovery_other", v)} /></NoduleField>
          )}
          <NoduleDurationPicker minDate={patientDob} label="When was it first noticed?" sinceDate={get("nodule_noticed_date")} onSinceDate={v => set("nodule_noticed_date", v)} years={get("nodule_duration_years")} onYears={v => set("nodule_duration_years", v)} months={get("nodule_duration_months")} onMonths={v => set("nodule_duration_months", v)} />
          <NoduleOutputBox text={get("nodule_discovery_mode") ? `Nodule / swelling in neck noticed by ${get("nodule_discovery_mode").replace(/_/g, " ")}${get("nodule_noticed_date") || get("nodule_duration_years") || get("nodule_duration_months") ? " — " + durationText(get("nodule_duration_years"), get("nodule_duration_months"), get("nodule_noticed_date")) + " ago" : ""}.` : ""} />
        </div>
      );

      case "Q6": return (
        <div>
          <h3>Has the nodule or swelling changed in size since you first noticed it?</h3>
          <NoduleYesNoUnsure value={get("nodule_size_change")} onChange={v => set("nodule_size_change", v)} />
          {get("nodule_size_change") === "yes" && (
            <NoduleSectionCard title="Size change details">
              <NoduleField label="How has it changed?">
                <NoduleRadioGroup value={get("nodule_growth_direction")} onChange={v => set("nodule_growth_direction", v)} options={[
                  { value: "larger", label: "Getting larger" }, { value: "smaller", label: "Getting smaller" },
                  { value: "fluctuating", label: "Fluctuating in size" }, { value: "unsure", label: "Unsure" },
                ]} />
              </NoduleField>
              {get("nodule_growth_direction") === "larger" && (
                <>
                  <NoduleDurationPicker minDate={patientDob} label="Over what time period?" years={get("nodule_growth_years")} onYears={v => set("nodule_growth_years", v)} months={get("nodule_growth_months")} onMonths={v => set("nodule_growth_months", v)} />
                  <NoduleField label="How fast has it grown?">
                    <NoduleRadioGroup value={get("nodule_growth_rate")} onChange={v => set("nodule_growth_rate", v)} options={[
                      { value: "rapid_weeks", label: "Rapidly — within weeks" },
                      { value: "gradual_months", label: "Gradually — over months" },
                      { value: "slow_years", label: "Slowly — over years" },
                    ]} />
                  </NoduleField>
                </>
              )}
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("nodule_size_change") === "yes" && get("nodule_growth_direction") === "larger" ? `Nodule ${get("nodule_growth_rate") === "rapid_weeks" ? "rapidly" : get("nodule_growth_rate") === "gradual_months" ? "gradually" : "slowly"} increasing in size over last ${durationText(get("nodule_growth_years"), get("nodule_growth_months"), "")}.` : ""} />
        </div>
      );

      case "Q7": return (
        <div>
          <h3>Have you consulted a doctor for this nodule?</h3>
          <NoduleYesNo value={get("doctor_consulted_status")} onChange={v => set("doctor_consulted_status", v)} />
          {get("doctor_consulted_status") === "yes" && (
            <NoduleSectionCard title="Doctor consultation details">
              <NoduleField label="When did you consult?"><NoduleInput type="date" value={get("doctor_consulted_date")} onChange={v => set("doctor_consulted_date", v)} max={new Date().toISOString().split("T")[0]} /></NoduleField>
              <NoduleField label="Did your doctor advise any of the following? (select all that apply)">
                <NoduleCheckGroup values={get("doctor_advised_tests", [])} onChange={v => set("doctor_advised_tests", v)} options={[
                  { value: "usg_neck", label: "USG — Neck" },
                  { value: "fnac", label: "FNAC of thyroid nodule" },
                  { value: "biopsy", label: "Biopsy of thyroid nodule" },
                ]} />
              </NoduleField>
              {get("doctor_advised_tests", []).length > 0 && (
                <NoduleField label="Upload reports (optional)">
                  <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload report (PDF / JPG / PNG)</div>
                </NoduleField>
              )}
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("doctor_consulted_status") === "yes" && get("doctor_advised_tests", []).length ? `${get("doctor_advised_tests", []).map(t => t.replace(/_/g, " ").toUpperCase()).join(", ")} advised by doctor.` : ""} />
        </div>
      );

      case "Q8": return (
        <div>
          <h3>Have you been advised to do a repeat thyroid ultrasound for follow-up of the nodule?</h3>
          <NoduleYesNo value={get("repeat_usg_advised")} onChange={v => set("repeat_usg_advised", v)} />
          {get("repeat_usg_advised") === "yes" && (
            <NoduleSectionCard title="Repeat USG details">
              <NoduleField label="Has it been done?"><NoduleYesNo value={get("repeat_usg_done")} onChange={v => set("repeat_usg_done", v)} /></NoduleField>
              {get("repeat_usg_done") === "yes" && (
                <NoduleField label="Upload report (optional)">
                  <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload repeat USG report</div>
                </NoduleField>
              )}
              {get("repeat_usg_done") === "no" && (
                <NoduleField label="When is it due?"><NoduleInput type="date" value={get("repeat_usg_due_date")} onChange={v => set("repeat_usg_due_date", v)} /></NoduleField>
              )}
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("repeat_usg_advised") === "yes" ? `Repeat USG advised — ${get("repeat_usg_done") === "yes" ? "done" : get("repeat_usg_due_date") ? "due on " + fmtDate(get("repeat_usg_due_date")) + " — not yet done" : "not yet done"}.` : ""} />
        </div>
      );

      case "Q9": return (
        <div>
          <h3>What was the reason you decided to seek an online opinion now?</h3>
          <NoduleField label="Select all that apply">
            <NoduleCheckGroup values={get("opinion_trigger", [])} onChange={v => set("opinion_trigger", v)} options={[
              { value: "new_swelling", label: "Noticed a new swelling or lump" },
              { value: "size_increase", label: "Existing swelling has increased in size" },
              { value: "pain", label: "Pain or discomfort in neck" },
              { value: "dysphagia", label: "Difficulty in swallowing" },
              { value: "voice_change", label: "Change in voice" },
              { value: "hoarseness", label: "Hoarseness in voice" },
              { value: "breathing_difficulty", label: "Difficulty in breathing" },
              { value: "cancer_concern", label: "Concern about cancer" },
              { value: "doctor_advice", label: "Advised by another doctor" },
              { value: "family_history", label: "Family history concern" },
              { value: "other", label: "Other" },
            ]} />
          </NoduleField>
          {get("opinion_trigger", []).includes("other") && (
            <NoduleField label="Please specify"><NoduleInput value={get("opinion_trigger_other")} onChange={v => set("opinion_trigger_other", v)} /></NoduleField>
          )}
          <NoduleOutputBox text={get("opinion_trigger", []).length ? `Opinion requested because: ${get("opinion_trigger", []).map(t => t.replace(/_/g, " ")).join(", ")}.` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE I — PLAN, DISCUSSION & PATIENT CONCERN
      // ══════════════════════════════════════════════════════

      case "Q10": return (
        <div>
          <h3>Has your doctor discussed a management plan for the thyroid nodule with you?</h3>
          <NoduleYesNoUnsure value={get("mgmt_plan_discussed")} onChange={v => set("mgmt_plan_discussed", v)} />
          {get("mgmt_plan_discussed") === "yes" && (
            <NoduleSectionCard title="Management plan">
              <NoduleField label="What was the plan? (select all that apply)">
                <NoduleCheckGroup values={get("mgmt_plan_types", [])} onChange={v => set("mgmt_plan_types", v)} options={[
                  { value: "watch_repeat_usg", label: "Wait and watch with repeat ultrasound" },
                  { value: "repeat_fnac", label: "Repeat FNAC" },
                  { value: "ablation_rfa", label: "Ablation therapy (RFA / laser / ethanol)" },
                  { value: "surgery_hemi", label: "Surgery — Hemithyroidectomy" },
                  { value: "surgery_total", label: "Surgery — Total thyroidectomy" },
                  { value: "medical_therapy", label: "Medical therapy" },
                  { value: "referral", label: "Referral to another specialist" },
                  { value: "other", label: "Other" },
                ]} />
              </NoduleField>
              <NoduleField label="When is the next follow-up or procedure planned? (optional)">
                <NoduleInput type="date" value={get("mgmt_plan_next_date")} onChange={v => set("mgmt_plan_next_date", v)} />
              </NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("mgmt_plan_discussed") === "yes" && get("mgmt_plan_types", []).length ? `Plan: ${get("mgmt_plan_types", []).map(t => t.replace(/_/g, " ")).join(" + ")}${get("mgmt_plan_next_date") ? " (Next: " + fmtDate(get("mgmt_plan_next_date")) + ")" : ""}.` : ""} />
        </div>
      );

      case "Q11": return (
        <div>
          <h3>Has your doctor discussed the possible outcomes of the nodule with you?</h3>
          <NoduleYesNoUnsure value={get("outcomes_discussed")} onChange={v => set("outcomes_discussed", v)} />
          {get("outcomes_discussed") === "yes" && (
            <NoduleSectionCard title="Outcomes discussed">
              <NoduleCheckGroup values={get("outcomes_details", [])} onChange={v => set("outcomes_details", v)} options={[
                { value: "likely_benign", label: "Likely benign — no further action needed" },
                { value: "need_fnac", label: "May need FNAC to confirm benign nature" },
                { value: "malignancy_risk", label: "Risk of malignancy discussed" },
                { value: "may_grow", label: "May grow over time and require surgery" },
                { value: "ablation_option", label: "Ablation therapy discussed as an option" },
                { value: "surgery_recommended", label: "Surgery recommended" },
                { value: "cancer_not_ruled_out", label: "Possibility of thyroid cancer cannot be ruled out" },
              ]} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("outcomes_discussed") === "yes" && get("outcomes_details", []).length ? `Outcomes discussed: ${get("outcomes_details", []).map(o => o.replace(/_/g, " ")).join(" + ")}.` : ""} />
        </div>
      );

      case "Q12": return (
        <div>
          <h3>What is your biggest concern regarding this thyroid nodule?</h3>
          <NoduleRadioGroup value={get("patient_primary_concern")} onChange={v => set("patient_primary_concern", v)} options={[
            { value: "fear_cancer", label: "Fear of cancer" },
            { value: "concern_surgery", label: "Concern about surgery" },
            { value: "cosmetic", label: "Worry about cosmetic appearance" },
            { value: "fear_growth", label: "Fear the nodule will grow" },
            { value: "concern_voice", label: "Concern about voice" },
            { value: "thyroid_imbalance", label: "Worry about thyroid hormone imbalance" },
            { value: "other", label: "Other" },
          ]} />
          {get("patient_primary_concern") === "other" && (
            <NoduleField label="Please specify"><NoduleInput value={get("patient_concern_other")} onChange={v => set("patient_concern_other", v)} /></NoduleField>
          )}
          <NoduleOutputBox text={get("patient_primary_concern") ? `Patient's biggest concern: ${get("patient_primary_concern") === "other" ? get("patient_concern_other") : get("patient_primary_concern").replace(/_/g, " ")}.` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE D — LABS (TSH branch point)
      // ══════════════════════════════════════════════════════

      case "Q13": return (
        <div>
          <h3>Have you had a TSH (Thyroid Stimulating Hormone) test done?</h3>
          <NoduleYesNoUnsure value={get("tsh_status")} onChange={v => set("tsh_status", v)} />
          {get("tsh_status") === "yes" && (
            <NoduleSectionCard title="TSH result">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <NoduleField label="TSH value"><NoduleInput type="number" value={get("tsh_value")} onChange={v => set("tsh_value", v)} placeholder="e.g. 2.5" /></NoduleField>
                <NoduleField label="Unit"><NoduleInput value="mIU/L" onChange={() => {}} style={{ background: "#f5f5f5", color: "#888" }} /></NoduleField>
                <NoduleField label="Date of test"><NoduleInput type="date" value={get("tsh_date")} onChange={v => set("tsh_date", v)} max={new Date().toISOString().split("T")[0]} /></NoduleField>
                <NoduleField label="Reference range">
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <NoduleInput type="number" value={get("tsh_ref_low")} onChange={v => set("tsh_ref_low", v)} placeholder="Low" />
                    <span style={{ color: "#999" }}>–</span>
                    <NoduleInput type="number" value={get("tsh_ref_high")} onChange={v => set("tsh_ref_high", v)} placeholder="High" />
                  </div>
                </NoduleField>
              </div>
              <NoduleField label="Upload report (optional)">
                <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload TSH report</div>
              </NoduleField>
            </NoduleSectionCard>
          )}

          {/* TSH Branch alert */}
          {branchConfirmed && tshBranch && tshBranch !== "normal" && (
            <TshBranchAlert type={tshBranch} />
          )}

          <NoduleOutputBox text={get("tsh_status") === "yes" && get("tsh_value") ? `TSH — ${get("tsh_value")} mIU/L (${fmtDate(get("tsh_date"))})${tshBranch === "high" ? " — ABOVE NORMAL [FLAG: Hypothyroidism]" : tshBranch === "low" ? " — BELOW NORMAL [FLAG: Hyperthyroidism]" : tshBranch === "normal" ? " — Within normal range" : ""}` : ""} />
        </div>
      );

      case "Q14": return renderLabScreen("Q14", "Free T4 (FT4)", "ft4", "", [{ value: "pmol_l", label: "pmol/L" }, { value: "ng_dl", label: "ng/dL" }]);
      case "Q15": return renderLabScreen("Q15", "Free T3 (FT3)", "ft3", "", [{ value: "pmol_l", label: "pmol/L" }, { value: "pg_ml", label: "pg/mL" }]);

      case "Q16": return (
        <div>
          <h3>Have you had Anti-TPO or Anti-Tg (Anti-thyroglobulin) antibodies tested?</h3>
          <NoduleYesNoUnsure value={get("antibody_status")} onChange={v => set("antibody_status", v)} />
          {get("antibody_status") === "yes" && (
            <NoduleSectionCard title="Antibody results">
              <p style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>Either or both can be filled — neither is mandatory.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <NoduleField label="Anti-TPO value"><NoduleInput type="number" value={get("antitpo_value")} onChange={v => set("antitpo_value", v)} placeholder="IU/mL" /></NoduleField>
                <NoduleField label="Anti-TPO date"><NoduleInput type="date" value={get("antitpo_date")} onChange={v => set("antitpo_date", v)} max={new Date().toISOString().split("T")[0]} /></NoduleField>
                <NoduleField label="Anti-Tg value"><NoduleInput type="number" value={get("antitg_value")} onChange={v => set("antitg_value", v)} placeholder="IU/mL" /></NoduleField>
              </div>
              <NoduleField label="Anti-Tg date"><NoduleInput type="date" value={get("antitg_date")} onChange={v => set("antitg_date", v)} max={new Date().toISOString().split("T")[0]} /></NoduleField>
              {(parseFloat(get("antitpo_value")) > 35 || parseFloat(get("antitg_value")) > 115) && (
                <div style={{ background: "#E6F1FB", border: "1px solid #185FA5", borderRadius: 8, padding: 10, fontSize: 12, color: "#0C447C", marginTop: 8 }}>
                  ℹ Elevated antibodies may suggest Hashimoto's thyroiditis — flagged for physician.
                </div>
              )}
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("antibody_status") === "yes" && (get("antitpo_value") || get("antitg_value")) ? `${get("antitpo_value") ? "Anti-TPO: " + get("antitpo_value") + " IU/mL " : ""}${get("antitg_value") ? "Anti-Tg: " + get("antitg_value") + " IU/mL" : ""}.` : ""} />
        </div>
      );

      case "Q17a": return (
        <div>
          <h3>Have you had a thyroid ultrasound or any other thyroid imaging done?</h3>
          <NoduleYesNoUnsure value={get("imaging_status")} onChange={v => set("imaging_status", v)} />
          {get("imaging_status") === "yes" && (
            <NoduleSectionCard title="Imaging details">
              <NoduleField label="Type (select all that apply)">
                <NoduleCheckGroup values={get("imaging_types", [])} onChange={v => set("imaging_types", v)} options={[
                  { value: "usg_thyroid", label: "USG thyroid" }, { value: "usg_neck", label: "USG neck" },
                  { value: "ct_neck", label: "CT neck" }, { value: "mri_neck", label: "MRI neck" }, { value: "other", label: "Other" },
                ]} />
              </NoduleField>
              <NoduleField label="Date of most recent imaging"><NoduleInput type="date" value={get("imaging_date")} onChange={v => set("imaging_date", v)} max={new Date().toISOString().split("T")[0]} /></NoduleField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <NoduleField label="Nodule size (longest diameter, mm — optional)"><NoduleInput type="number" value={get("nodule_size_mm")} onChange={v => set("nodule_size_mm", v)} placeholder="e.g. 18" /></NoduleField>
                <NoduleField label="Number of nodules">
                  <NoduleRadioGroup value={get("nodule_count")} onChange={v => set("nodule_count", v)} options={[{ value: "single", label: "Single" }, { value: "multiple", label: "Multiple" }, { value: "not_stated", label: "Not stated" }]} />
                </NoduleField>
              </div>
              <NoduleField label="TIRADS category (if reported)">
                <NoduleRadioGroup value={get("tirads_category")} onChange={v => set("tirads_category", v)} inline options={[
                  { value: "TR1", label: "TR1" }, { value: "TR2", label: "TR2" }, { value: "TR3", label: "TR3" },
                  { value: "TR4", label: "TR4" }, { value: "TR5", label: "TR5" }, { value: "not_stated", label: "Not stated" },
                ]} />
              </NoduleField>
              <NoduleField label="Upload report (optional)">
                <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload imaging report</div>
              </NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("imaging_status") === "yes" && get("imaging_types", []).length ? `${get("imaging_types", []).map(t => t.replace(/_/g, " ")).join(", ")}${get("nodule_count") && get("nodule_count") !== "not_stated" ? " — " + get("nodule_count") + " nodule" : ""}${get("nodule_size_mm") ? ", " + get("nodule_size_mm") + " mm" : ""}${get("tirads_category") && get("tirads_category") !== "not_stated" ? ", TIRADS " + get("tirads_category") : ""}${get("imaging_date") ? " (" + fmtDate(get("imaging_date")) + ")" : ""}` : ""} />
        </div>
      );

      case "Q17b": return (
        <div>
          <h3>Have you had a thyroid FNAC (Fine Needle Aspiration Cytology) or Core Biopsy done?</h3>
          <NoduleYesNoUnsure value={get("cytology_status")} onChange={v => set("cytology_status", v)} />
          {get("cytology_status") === "yes" && (
            <NoduleSectionCard title="FNAC / Biopsy details">
              <NoduleField label="Type (select all that apply)">
                <NoduleCheckGroup values={get("cytology_types", [])} onChange={v => set("cytology_types", v)} options={[
                  { value: "fnac", label: "FNAC (Fine needle aspiration cytology)" },
                  { value: "core_biopsy", label: "Core biopsy" },
                  { value: "other", label: "Other" },
                ]} />
              </NoduleField>
              <NoduleField label="Date"><NoduleInput type="date" value={get("cytology_date")} onChange={v => set("cytology_date", v)} max={new Date().toISOString().split("T")[0]} /></NoduleField>
              <NoduleField label="Bethesda category (if reported)">
                <NoduleRadioGroup value={get("bethesda_category")} onChange={v => set("bethesda_category", v)} options={[
                  { value: "bethesda_1", label: "Bethesda I — Non-diagnostic" },
                  { value: "bethesda_2", label: "Bethesda II — Benign" },
                  { value: "bethesda_3", label: "Bethesda III — AUS / FLUS" },
                  { value: "bethesda_4", label: "Bethesda IV — Follicular neoplasm / SFN" },
                  { value: "bethesda_5", label: "Bethesda V — Suspicious for malignancy" },
                  { value: "bethesda_6", label: "Bethesda VI — Malignant" },
                  { value: "not_stated", label: "Not stated" },
                ]} />
              </NoduleField>
              <NoduleField label="Upload report (optional)">
                <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload FNAC / biopsy report</div>
              </NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("cytology_status") === "yes" && get("cytology_types", []).length ? `${get("cytology_types", []).join(" / ").toUpperCase()} done on ${fmtDate(get("cytology_date"))}${get("bethesda_category") && get("bethesda_category") !== "not_stated" ? " — " + get("bethesda_category").replace(/_/g, " ") : ""}.` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE B — MENSTRUAL / PREGNANCY (Female only)
      // Identical to CA Thyroid schema
      // ══════════════════════════════════════════════════════

      case "B1": return (
        <div>
          <h3>Have you had a hysterectomy (surgical removal of the uterus)?</h3>
          <NoduleYesNoUnsure value={get("hysterectomy_status")} onChange={v => set("hysterectomy_status", v)} />
          {get("hysterectomy_status") === "yes" && (
            <NoduleSectionCard title="Hysterectomy details">
              <NoduleField label="How well do you know the date of surgery?">
                <NoduleRadioGroup value={get("hysterectomy_date_precision", "full")} onChange={v => set("hysterectomy_date_precision", v)} inline options={[
                  { value: "full", label: "Exact date" }, { value: "month_year", label: "Month & year" }, { value: "year_only", label: "Year only" },
                ]} />
              </NoduleField>
              {get("hysterectomy_date_precision", "full") === "full" && (
                <NoduleField label="Date of surgery"><NoduleInput type="date" value={get("hysterectomy_date")} onChange={v => set("hysterectomy_date", v)} max={new Date().toISOString().split("T")[0]} min={patientDob || undefined} /></NoduleField>
              )}
              {get("hysterectomy_date_precision") === "month_year" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <NoduleField label="Month"><NoduleSelect value={get("hysterectomy_month")} onChange={v => set("hysterectomy_month", v)} placeholder="Month" options={["1","2","3","4","5","6","7","8","9","10","11","12"].map((m,i) => ({ value: m, label: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i] }))} /></NoduleField>
                  <NoduleField label="Year"><NoduleYearInput value={get("hysterectomy_year")} onChange={v => set("hysterectomy_year", v)} dob={patientDob} placeholder="e.g. 2019" /></NoduleField>
                </div>
              )}
              {get("hysterectomy_date_precision") === "year_only" && (
                <NoduleField label="Year"><NoduleYearInput value={get("hysterectomy_year")} onChange={v => set("hysterectomy_year", v)} dob={patientDob} placeholder="e.g. 2019" /></NoduleField>
              )}
              <NoduleField label="Reason">
                <NoduleRadioGroup value={get("hysterectomy_reason")} onChange={v => set("hysterectomy_reason", v)} options={[
                  { value: "excessive_bleeding", label: "Excessive bleeding" }, { value: "prolapse", label: "Prolapse of uterus" },
                  { value: "cancer", label: "Cancer of uterus / cervix" }, { value: "other", label: "Others" },
                ]} />
              </NoduleField>
              {get("hysterectomy_reason") === "other" && <NoduleField label="Please specify"><NoduleInput value={get("hysterectomy_reason_other")} onChange={v => set("hysterectomy_reason_other", v)} /></NoduleField>}
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("hysterectomy_status") === "yes" ? `H/o Hysterectomy for "${get("hysterectomy_reason")?.replace(/_/g, " ")}"${get("hysterectomy_date_precision", "full") === "full" && get("hysterectomy_date") ? " on " + fmtDate(get("hysterectomy_date")) : get("hysterectomy_date_precision") === "month_year" && get("hysterectomy_month") && get("hysterectomy_year") ? ` in ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][get("hysterectomy_month")-1]} ${get("hysterectomy_year")}` : get("hysterectomy_date_precision") === "year_only" && get("hysterectomy_year") ? ` in ${get("hysterectomy_year")}` : ""}.` : ""} />
        </div>
      );

      case "B2": return (
        <div>
          <h3>What is your menopausal status?</h3>
          <NoduleRadioGroup value={get("menopause_status")} onChange={v => set("menopause_status", v)} options={[{ value: "pre", label: "Pre-menopausal" }, { value: "peri", label: "Peri-menopausal" }, { value: "post", label: "Post-menopausal" }]} />
          {get("menopause_status") === "post" && <NoduleField label="How many years since menopause?"><NoduleInput type="number" value={get("menopause_years_ago")} onChange={v => set("menopause_years_ago", v)} min={0} placeholder="e.g. 3" /></NoduleField>}
          <NoduleOutputBox text={get("menopause_status") === "post" ? `Post-menopausal status since last ${get("menopause_years_ago") || "?"} year${get("menopause_years_ago") != 1 ? "s" : ""}.` : ""} />
        </div>
      );

      case "B3": return (
        <div>
          <h3>Have you noticed any changes in your menstrual cycle?</h3>
          <NoduleYesNoUnsure value={get("menstrual_change_status")} onChange={v => set("menstrual_change_status", v)} />
          {get("menstrual_change_status") === "yes" && (
            <NoduleSectionCard title="Menstrual change details">
              <NoduleField label="Pattern"><NoduleRadioGroup value={get("menstrual_pattern")} onChange={v => set("menstrual_pattern", v)} inline options={[{ value: "regular", label: "Regular" }, { value: "irregular", label: "Irregular" }]} /></NoduleField>
              <NoduleField label="Flow (select all that apply)">
                <NoduleCheckGroup values={get("menstrual_flow", [])} onChange={v => set("menstrual_flow", v)} options={[{ value: "heavy", label: "Heavy" }, { value: "scanty", label: "Scanty" }, { value: "absent", label: "Absent" }, { value: "prolonged", label: "Prolonged" }]} />
              </NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("menstrual_since_date")} onSinceDate={v => set("menstrual_since_date", v)} years={get("menstrual_years")} onYears={v => set("menstrual_years", v)} months={get("menstrual_months")} onMonths={v => set("menstrual_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("menstrual_change_status") === "yes" && get("menstrual_pattern") ? `${get("menstrual_pattern")} ${get("menstrual_flow", []).join(", ")} flow since last ${durationText(get("menstrual_years"), get("menstrual_months"), get("menstrual_since_date"))}.` : ""} />
        </div>
      );

      case "B4": return (
        <div>
          <h3>What was the date of your last menstrual period (LMP)?</h3>
          <NoduleField label="LMP date"><NoduleInput type="date" value={get("lmp_date")} onChange={v => set("lmp_date", v)} max={new Date().toISOString().split("T")[0]} /></NoduleField>
          <NoduleOutputBox text={get("lmp_date") ? `LMP: ${fmtDate(get("lmp_date"))}` : ""} />
        </div>
      );

      case "B5": {
        const lmpDate = get("lmp_date");
        // Same fix as the B5 validator: an unanswered lmpDate must NOT
        // fall back to "0 days ago" — that silently showed the "not
        // applicable" message on every blank LMP, before any date was
        // ever entered.
        const lmpDaysAgo = lmpDate ? Math.floor((Date.now() - new Date(lmpDate)) / 86400000) : null;
        if (lmpDaysAgo !== null && lmpDaysAgo < 31) return (
          <div>
            <h3>Are you currently pregnant or trying to conceive?</h3>
            <p style={{ fontSize: 13, color: "#888" }}>LMP was less than 31 days ago — pregnancy question not applicable.</p>
          </div>
        );
        return (
          <div>
            <h3>Are you currently pregnant or trying to conceive?</h3>
            <NoduleYesNoUnsure value={get("pregnancy_status")} onChange={v => { set("pregnancy_status", v); set("edd_date", v === "yes" ? calcEDD(lmpDate, true) : ""); }} />
            {get("pregnancy_status") === "yes" && (
              <NoduleSectionCard title="Pregnancy details">
                <p style={{ fontSize: 13, color: "#555" }}>Expected Date of Delivery (EDD): <strong>{calcEDD(lmpDate)}</strong></p>
              </NoduleSectionCard>
            )}
            <NoduleOutputBox text={get("pregnancy_status") === "yes" ? `Currently pregnant. EDD: ${calcEDD(lmpDate)}.` : ""} />
          </div>
        );
      }

      // ══════════════════════════════════════════════════════
      // MODULE C — THYROID DISEASE & MEDICATION HISTORY
      // Identical to CA Thyroid schema
      // ══════════════════════════════════════════════════════

      case "C1": return (
        <div>
          <h3>Have you been previously diagnosed with a thyroid condition?</h3>
          <NoduleYesNoUnsure value={get("thyroid_dx_status")} onChange={v => set("thyroid_dx_status", v)} />
          {get("thyroid_dx_status") === "yes" && (
            <NoduleSectionCard title="Prior thyroid diagnosis">
              <NoduleField label="Condition">
                <NoduleRadioGroup value={get("thyroid_dx_type")} onChange={v => set("thyroid_dx_type", v)} options={[
                  { value: "hypothyroidism", label: "Hypothyroidism" }, { value: "hyperthyroidism", label: "Hyperthyroidism" },
                  { value: "goitre", label: "Goitre" }, { value: "thyroid_nodule", label: "Thyroid nodule" },
                  { value: "thyroid_cancer", label: "Thyroid cancer" }, { value: "other", label: "Other" },
                ]} />
              </NoduleField>
              <NoduleField label="Year of diagnosis"><NoduleYearInput value={get("thyroid_dx_year")} onChange={v => set("thyroid_dx_year", v)} dob={patientDob} placeholder="e.g. 2018" /></NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("thyroid_dx_status") === "yes" && get("thyroid_dx_type") ? `K/c/o ${get("thyroid_dx_type").replace(/_/g, " ")} since ${get("thyroid_dx_year") || "?"}.` : ""} />
        </div>
      );

      case "C2": return (
        <div>
          <h3>Have you had any thyroid surgery or radioiodine (RAI) therapy in the past?</h3>
          <NoduleYesNoUnsure value={get("thyroid_tx_status")} onChange={v => set("thyroid_tx_status", v)} />
          {get("thyroid_tx_status") === "yes" && (
            <NoduleSectionCard title="Prior thyroid treatment">
              <NoduleField label="Type"><NoduleRadioGroup value={get("thyroid_tx_type")} onChange={v => set("thyroid_tx_type", v)} options={[{ value: "surgery", label: "Surgery" }, { value: "rai", label: "RAI (Radioiodine)" }, { value: "both", label: "Both" }]} /></NoduleField>
              <NoduleField label="Year"><NoduleYearInput value={get("thyroid_tx_year")} onChange={v => set("thyroid_tx_year", v)} dob={patientDob} placeholder="e.g. 2020" /></NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("thyroid_tx_status") === "yes" && get("thyroid_tx_type") ? `H/o ${get("thyroid_tx_type")} for thyroid in ${get("thyroid_tx_year") || "?"}.` : ""} />
        </div>
      );

      case "C3": return (
        <div>
          <h3>Are you currently taking any thyroid medication?</h3>
          <NoduleYesNoUnsure value={get("thyroid_med_status")} onChange={v => set("thyroid_med_status", v)} />
          {get("thyroid_med_status") === "yes" && (
            <NoduleSectionCard title="Current thyroid medication">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <NoduleField label="Drug name"><NoduleInput value={get("thyroid_med_name")} onChange={v => set("thyroid_med_name", v)} placeholder="e.g. Levothyroxine" /></NoduleField>
                <NoduleField label="Brand name"><NoduleInput value={get("thyroid_med_brand")} onChange={v => set("thyroid_med_brand", v)} placeholder="e.g. Thyronorm" /></NoduleField>
                <NoduleField label="Dose (mcg)"><NoduleInput type="number" value={get("thyroid_med_dose")} onChange={v => set("thyroid_med_dose", v)} placeholder="e.g. 50" /></NoduleField>
                <NoduleField label="Timing">
                  <NoduleRadioGroup value={get("thyroid_med_timing")} onChange={v => set("thyroid_med_timing", v)} options={[{ value: "before_breakfast", label: "Before breakfast" }, { value: "after_breakfast", label: "After breakfast" }, { value: "bedtime", label: "Bedtime" }]} />
                </NoduleField>
              </div>
              <NoduleField label="Compliance">
                <NoduleRadioGroup value={get("thyroid_med_compliance")} onChange={v => set("thyroid_med_compliance", v)} inline options={[{ value: "regular", label: "Regular" }, { value: "irregular", label: "Irregular" }, { value: "skips_sometimes", label: "Skips sometimes" }]} />
              </NoduleField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <NoduleField label="Taking since (years)"><NoduleInput type="number" value={get("thyroid_med_since_years")} onChange={v => set("thyroid_med_since_years", v)} min={0} placeholder="0" /></NoduleField>
                <NoduleField label="Taking since (months)"><NoduleInput type="number" value={get("thyroid_med_since_months")} onChange={v => set("thyroid_med_since_months", v)} min={0} max={11} placeholder="0" /></NoduleField>
              </div>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("thyroid_med_status") === "yes" && get("thyroid_med_brand") && get("thyroid_med_dose") ? `On Tab. ${get("thyroid_med_brand")} — ${get("thyroid_med_dose")} mcg ${get("thyroid_med_timing")?.replace(/_/g, " ") || ""} since last ${durationText(get("thyroid_med_since_years"), get("thyroid_med_since_months"), "")}.` : ""} />
        </div>
      );

      case "C4b": return (
        <div>
          <h3>Is there a family history of MEN syndrome or other endocrine tumours?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>Multiple Endocrine Neoplasia, familial thyroid cancer, parathyroid, pituitary, or adrenal tumours</p>
          <NoduleYesNoUnsure value={get("family_men_status")} onChange={v => set("family_men_status", v)} />
          {get("family_men_status") === "yes" && (
            <NoduleSectionCard title="MEN / endocrine tumour family history">
              <NoduleField label="Type (select all that apply)">
                <NoduleCheckGroup values={get("family_men_types", [])} onChange={v => set("family_men_types", v)} options={[
                  { value: "men1", label: "MEN1" }, { value: "men2a", label: "MEN2A" }, { value: "men2b", label: "MEN2B" },
                  { value: "familial_nmtc", label: "Familial non-medullary thyroid cancer (FNMTC)" },
                  { value: "parathyroid", label: "Parathyroid tumour" }, { value: "pituitary", label: "Pituitary tumour" },
                  { value: "adrenal", label: "Adrenal tumour / Phaeochromocytoma" }, { value: "other_cancer", label: "Other cancer" },
                ]} />
              </NoduleField>
              <NoduleField label="Which relative?"><NoduleInput value={get("family_men_relative")} onChange={v => set("family_men_relative", v)} placeholder="e.g. Mother, Maternal uncle" /></NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("family_men_status") === "yes" && get("family_men_types", []).length ? `Family history: ${get("family_men_types", []).map(t => t.replace(/_/g, " ")).join(", ")} — ${get("family_men_relative") || "relative not specified"}.` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE F — PRIOR TREATMENT & OPINIONS
      // ══════════════════════════════════════════════════════

      case "Q18": return (
        <div>
          <h3>Have you received any treatment for this thyroid nodule in the past?</h3>
          <NoduleYesNoUnsure value={get("nodule_treatment_status")} onChange={v => set("nodule_treatment_status", v)} />
          {get("nodule_treatment_status") === "yes" && (
            <NoduleSectionCard title="Prior nodule treatment">
              <NoduleField label="Type of treatment (select all that apply)">
                <NoduleCheckGroup values={get("nodule_treatment_types", [])} onChange={v => set("nodule_treatment_types", v)} options={[
                  { value: "watchful_waiting", label: "Observation only (watchful waiting)" },
                  { value: "hormone_suppression", label: "Thyroid hormone suppression therapy" },
                  { value: "ethanol_ablation", label: "Ethanol ablation (PEI)" },
                  { value: "rfa", label: "Radiofrequency ablation (RFA)" },
                  { value: "laser_ablation", label: "Laser ablation" },
                  { value: "microwave_ablation", label: "Microwave ablation" },
                  { value: "surgery_hemi", label: "Surgery — Hemithyroidectomy" },
                  { value: "surgery_total", label: "Surgery — Total thyroidectomy" },
                  { value: "surgery_isthmus", label: "Surgery — Isthmusectomy" },
                  { value: "other", label: "Other" },
                ]} />
              </NoduleField>
              <NoduleField label="When was treatment given?"><NoduleInput type="date" value={get("nodule_treatment_date")} onChange={v => set("nodule_treatment_date", v)} max={new Date().toISOString().split("T")[0]} /></NoduleField>
              <NoduleField label="Was treatment completed?">
                <NoduleRadioGroup value={get("nodule_treatment_completed")} onChange={v => set("nodule_treatment_completed", v)} inline options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "ongoing", label: "Ongoing" }]} />
              </NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("nodule_treatment_status") === "yes" && get("nodule_treatment_types", []).length ? `H/o ${get("nodule_treatment_types", []).map(t => t.replace(/_/g, " ")).join(", ")} for thyroid nodule${get("nodule_treatment_date") ? " in " + fmtDate(get("nodule_treatment_date")) : ""}${get("nodule_treatment_completed") ? " — " + get("nodule_treatment_completed") : ""}.` : ""} />
        </div>
      );

      case "Q19": return (
        <div>
          <h3>Have you been advised any treatment for this nodule by a doctor earlier?</h3>
          <NoduleYesNoUnsure value={get("prior_advice_status")} onChange={v => set("prior_advice_status", v)} />
          {get("prior_advice_status") === "yes" && (
            <NoduleSectionCard title="Prior advice details">
              <NoduleField label="What was advised? (select all that apply)">
                <NoduleCheckGroup values={get("prior_advice_types", [])} onChange={v => set("prior_advice_types", v)} options={[
                  { value: "watchful_waiting", label: "Watchful waiting" }, { value: "repeat_usg", label: "Repeat ultrasound" },
                  { value: "fnac", label: "FNAC" }, { value: "biopsy", label: "Biopsy" }, { value: "surgery", label: "Surgery" },
                  { value: "ablation", label: "Ablation therapy" }, { value: "hormone_therapy", label: "Thyroid hormone therapy" },
                  { value: "radioiodine", label: "Radioiodine" }, { value: "other", label: "Other" },
                ]} />
              </NoduleField>
              <NoduleField label="Did you follow that advice?">
                <NoduleRadioGroup value={get("prior_advice_followed")} onChange={v => set("prior_advice_followed", v)} inline options={[{ value: "yes", label: "Yes" }, { value: "partially", label: "Partially" }, { value: "no", label: "No" }]} />
              </NoduleField>
              {get("prior_advice_followed") === "no" && (
                <NoduleField label="Reason for not following advice"><NoduleInput value={get("prior_advice_not_followed_reason")} onChange={v => set("prior_advice_not_followed_reason", v)} placeholder="e.g. Wanted a second opinion" /></NoduleField>
              )}
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("prior_advice_status") === "yes" && get("prior_advice_types", []).length ? `Advised ${get("prior_advice_types", []).join(", ")} — ${get("prior_advice_followed") === "no" ? "not followed (" + get("prior_advice_not_followed_reason") + ")" : get("prior_advice_followed") || ""}.` : ""} />
        </div>
      );

      case "Q20": return (
        <div>
          <h3>Have you sought a medical opinion for this nodule from any other doctor or hospital?</h3>
          <NoduleYesNo value={get("prior_opinion_status")} onChange={v => set("prior_opinion_status", v)} />
          {get("prior_opinion_status") === "yes" && (
            <NoduleSectionCard title="Prior medical opinion">
              <NoduleField label="Who did you consult? (select all that apply)">
                <NoduleCheckGroup values={get("prior_opinion_specialty", [])} onChange={v => set("prior_opinion_specialty", v)} options={[
                  { value: "family_physician", label: "Family physician" }, { value: "general_physician", label: "General physician (MD)" },
                  { value: "ent_surgeon", label: "ENT Surgeon" }, { value: "endocrinologist", label: "Endocrinologist" },
                  { value: "surgical_oncologist", label: "Surgical oncologist (Cancer surgeon)" }, { value: "general_surgeon", label: "General surgeon" },
                  { value: "radiologist", label: "Radiologist" }, { value: "other", label: "Other" },
                ]} />
              </NoduleField>
              <NoduleField label="Approximate date of consultation"><NoduleInput type="date" value={get("prior_opinion_date")} onChange={v => set("prior_opinion_date", v)} max={new Date().toISOString().split("T")[0]} /></NoduleField>
              <NoduleField label="What was the opinion / suggestion given?"><NoduleInput value={get("prior_opinion_summary")} onChange={v => set("prior_opinion_summary", v)} placeholder="e.g. Advised repeat USG in 6 months" /></NoduleField>
              <NoduleField label="Did you follow that advice?">
                <NoduleRadioGroup value={get("prior_opinion_followed")} onChange={v => set("prior_opinion_followed", v)} inline options={[{ value: "yes", label: "Yes" }, { value: "partially", label: "Partially" }, { value: "no", label: "No" }]} />
              </NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("prior_opinion_status") === "yes" && get("prior_opinion_specialty", []).length ? `Previous opinion from ${get("prior_opinion_specialty", []).join(" / ")}${get("prior_opinion_date") ? " in " + fmtDate(get("prior_opinion_date")) : ""}${get("prior_opinion_summary") ? " — " + get("prior_opinion_summary") : ""}. Advice ${get("prior_opinion_followed") || ""}.` : ""} />
        </div>
      );

      case "Q21": return (
        <div>
          <h3>Are you currently on any medication for this thyroid nodule or for any thyroid condition?</h3>
          <NoduleYesNoUnsure value={get("current_med_status")} onChange={v => set("current_med_status", v)} />
          {get("current_med_status") === "yes" && (
            <NoduleSectionCard title="Current medication">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <NoduleField label="Drug name"><NoduleInput value={get("current_med_name")} onChange={v => set("current_med_name", v)} placeholder="e.g. Levothyroxine" /></NoduleField>
                <NoduleField label="Brand name"><NoduleInput value={get("current_med_brand")} onChange={v => set("current_med_brand", v)} placeholder="e.g. Thyronorm" /></NoduleField>
                <NoduleField label="Dose"><NoduleInput type="number" value={get("current_med_dose")} onChange={v => set("current_med_dose", v)} placeholder="e.g. 50" /></NoduleField>
                <NoduleField label="Timing">
                  <NoduleRadioGroup value={get("current_med_timing")} onChange={v => set("current_med_timing", v)} options={[{ value: "before_breakfast", label: "Before breakfast" }, { value: "after_breakfast", label: "After breakfast" }, { value: "bedtime", label: "Bedtime" }]} />
                </NoduleField>
              </div>
              <NoduleField label="Compliance">
                <NoduleRadioGroup value={get("current_med_compliance")} onChange={v => set("current_med_compliance", v)} inline options={[{ value: "regular", label: "Regular" }, { value: "irregular", label: "Irregular" }, { value: "skips_sometimes", label: "Skips sometimes" }]} />
              </NoduleField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <NoduleField label="Taking since (years)"><NoduleInput type="number" value={get("current_med_since_years")} onChange={v => set("current_med_since_years", v)} min={0} placeholder="0" /></NoduleField>
                <NoduleField label="Taking since (months)"><NoduleInput type="number" value={get("current_med_since_months")} onChange={v => set("current_med_since_months", v)} min={0} max={11} placeholder="0" /></NoduleField>
              </div>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("current_med_status") === "yes" && get("current_med_brand") ? `On Tab. ${get("current_med_brand")} ${get("current_med_dose") || ""} mcg — ${get("current_med_timing")?.replace(/_/g, " ") || ""} — since ${durationText(get("current_med_since_years"), get("current_med_since_months"), "")} — ${get("current_med_compliance") || ""}.` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE G — NODULE-SPECIFIC LOCAL SYMPTOMS
      // ══════════════════════════════════════════════════════

      case "Q22": return (
        <div>
          <h3>Is the swelling or lump in your neck visible to others?</h3>
          <NoduleYesNoUnsure value={get("nodule_visible_status")} onChange={v => set("nodule_visible_status", v)} />
          {get("nodule_visible_status") === "yes" && (
            <NoduleSectionCard title="Visible swelling details">
              <NoduleDurationPicker minDate={patientDob} label="Since when has it been visible?" sinceDate={get("nodule_visible_since_date")} onSinceDate={v => set("nodule_visible_since_date", v)} years={get("nodule_visible_years")} onYears={v => set("nodule_visible_years", v)} months={get("nodule_visible_months")} onMonths={v => set("nodule_visible_months", v)} />
              <NoduleField label="When is it visible? (select all that apply)">
                <NoduleCheckGroup values={get("nodule_visible_pattern", [])} onChange={v => set("nodule_visible_pattern", v)} options={[{ value: "constant", label: "Constant" }, { value: "on_swallowing", label: "Only on swallowing" }]} />
              </NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("nodule_visible_status") === "yes" ? `Swelling in neck visible to others since last ${durationText(get("nodule_visible_years"), get("nodule_visible_months"), get("nodule_visible_since_date"))} — ${get("nodule_visible_pattern", []).join(", ")}.` : ""} />
        </div>
      );

      case "Q23": return (
        <div>
          <h3>Do you have any pain or tenderness in the neck or thyroid area?</h3>
          <NoduleYesNoUnsure value={get("neck_pain_status")} onChange={v => set("neck_pain_status", v)} />
          {get("neck_pain_status") === "yes" && (
            <NoduleSectionCard title="Neck pain details">
              <NoduleField label="Character (select all that apply)">
                <NoduleCheckGroup values={get("neck_pain_types", [])} onChange={v => set("neck_pain_types", v)} options={[
                  { value: "dull_ache", label: "Continuous dull aching pain" }, { value: "sharp", label: "Sharp pain" },
                  { value: "on_swallowing", label: "Pain on swallowing" }, { value: "on_touch", label: "Pain on touch only" },
                  { value: "radiates_jaw_ear", label: "Pain radiates to jaw or ear" },
                ]} />
              </NoduleField>
              <NoduleField label="Severity"><NoduleRadioGroup value={get("neck_pain_severity")} onChange={v => set("neck_pain_severity", v)} inline options={[{ value: "mild", label: "Mild" }, { value: "moderate", label: "Moderate" }, { value: "severe", label: "Severe" }]} /></NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("neck_pain_since_date")} onSinceDate={v => set("neck_pain_since_date", v)} years={get("neck_pain_years")} onYears={v => set("neck_pain_years", v)} months={get("neck_pain_months")} onMonths={v => set("neck_pain_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("neck_pain_status") === "yes" && get("neck_pain_types", []).length ? `${get("neck_pain_severity") || ""} ${get("neck_pain_types", []).join(", ")} in neck since last ${durationText(get("neck_pain_years"), get("neck_pain_months"), get("neck_pain_since_date"))}.` : ""} />
        </div>
      );

      case "Q24": return (
        <div>
          <h3>Do you have any difficulty swallowing food or liquids? (Dysphagia)</h3>
          <NoduleYesNoUnsure value={get("dysphagia_status")} onChange={v => set("dysphagia_status", v)} />
          {get("dysphagia_status") === "yes" && (
            <NoduleSectionCard title="Dysphagia details">
              <NoduleField label="Type"><NoduleRadioGroup value={get("dysphagia_type")} onChange={v => set("dysphagia_type", v)} options={[{ value: "solids_only", label: "Solids only" }, { value: "liquids_only", label: "Liquids only" }, { value: "both", label: "Both" }]} /></NoduleField>
              <NoduleField label="Severity">
                <NoduleRadioGroup value={get("dysphagia_severity")} onChange={v => set("dysphagia_severity", v)} options={[
                  { value: "mild", label: "Mild (slight discomfort)" }, { value: "moderate", label: "Moderate (need to take sips of water)" }, { value: "severe", label: "Severe (food gets stuck)" },
                ]} />
              </NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("dysphagia_since_date")} onSinceDate={v => set("dysphagia_since_date", v)} years={get("dysphagia_years")} onYears={v => set("dysphagia_years", v)} months={get("dysphagia_months")} onMonths={v => set("dysphagia_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("dysphagia_status") === "yes" && get("dysphagia_type") ? `${get("dysphagia_severity") || ""} difficulty in swallowing ${get("dysphagia_type").replace(/_/g, " ")} since last ${durationText(get("dysphagia_years"), get("dysphagia_months"), get("dysphagia_since_date"))}.` : ""} />
        </div>
      );

      case "Q25": return (
        <div>
          <h3>Do you have any difficulty in breathing or a feeling of tightness in the throat?</h3>
          <NoduleYesNoUnsure value={get("resp_symptom_status")} onChange={v => set("resp_symptom_status", v)} />
          {get("resp_symptom_status") === "yes" && (
            <NoduleSectionCard title="Breathing / tightness details">
              <NoduleField label="Type (select all that apply)">
                <NoduleCheckGroup values={get("resp_symptom_types", [])} onChange={v => set("resp_symptom_types", v)} options={[
                  { value: "sob", label: "Shortness of breath" }, { value: "tightness", label: "Tightness in throat" },
                  { value: "stridor", label: "Noisy breathing (Stridor)" }, { value: "pressure_windpipe", label: "Feeling of pressure on the windpipe" },
                ]} />
              </NoduleField>
              <NoduleField label="When does it occur?">
                <NoduleRadioGroup value={get("resp_symptom_trigger")} onChange={v => set("resp_symptom_trigger", v)} options={[{ value: "at_rest", label: "At rest" }, { value: "on_exertion", label: "On exertion" }, { value: "lying_flat", label: "On lying flat" }, { value: "all_the_time", label: "All the time" }]} />
              </NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("resp_since_date")} onSinceDate={v => set("resp_since_date", v)} years={get("resp_years")} onYears={v => set("resp_years", v)} months={get("resp_months")} onMonths={v => set("resp_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("resp_symptom_status") === "yes" && get("resp_symptom_types", []).length ? `${get("resp_symptom_types", []).join(", ")} ${get("resp_symptom_trigger") ? "— " + get("resp_symptom_trigger").replace(/_/g, " ") : ""} since last ${durationText(get("resp_years"), get("resp_months"), get("resp_since_date"))}.` : ""} />
        </div>
      );

      case "Q26": return (
        <div>
          <h3>Have you noticed any hoarseness or change in your voice?</h3>
          {["teacher","singer","actor","vocal_instructor","call_centre","sales"].includes(get("occupation")) && (
            <div style={{ background: "#fff3cd", border: "1px solid #f5a623", borderRadius: 8, padding: 10, fontSize: 12, color: "#7d5200", marginBottom: 12 }}>
              ⚠ Voice-dependent profession detected — please answer carefully. Hoarseness from a thyroid nodule may indicate recurrent laryngeal nerve involvement.
            </div>
          )}
          <NoduleYesNoUnsure value={get("hoarseness_status")} onChange={v => set("hoarseness_status", v)} />
          {get("hoarseness_status") === "yes" && (
            <NoduleSectionCard title="Voice change details">
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("hoarseness_since_date")} onSinceDate={v => set("hoarseness_since_date", v)} years={get("hoarseness_years")} onYears={v => set("hoarseness_years", v)} months={get("hoarseness_months")} onMonths={v => set("hoarseness_months", v)} />
              <NoduleField label="Pattern"><NoduleRadioGroup value={get("hoarseness_pattern")} onChange={v => set("hoarseness_pattern", v)} inline options={[{ value: "constant", label: "Constant" }, { value: "intermittent", label: "Intermittent" }]} /></NoduleField>
              <NoduleField label="Does your voice fatigue easily?"><NoduleYesNo value={get("voice_fatigue_status")} onChange={v => set("voice_fatigue_status", v)} /></NoduleField>
              <div style={{ background: "#FCEBEB", border: "1px solid #E24B4A", borderRadius: 8, padding: 10, fontSize: 12, color: "#791F1F", marginTop: 8 }}>
                ⚠ Voice change from a thyroid nodule may indicate recurrent laryngeal nerve involvement — flagged for urgent physician review.
              </div>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("hoarseness_status") === "yes" ? `${get("hoarseness_pattern") || ""} hoarseness of voice since last ${durationText(get("hoarseness_years"), get("hoarseness_months"), get("hoarseness_since_date"))}${get("voice_fatigue_status") === "yes" ? " — voice fatigue present" : ""}.` : ""} />
        </div>
      );

      case "Q27": return (
        <div>
          <h3>Do you have any cough that you feel may be related to the neck swelling?</h3>
          <NoduleYesNoUnsure value={get("nodule_cough_status")} onChange={v => set("nodule_cough_status", v)} />
          {get("nodule_cough_status") === "yes" && (
            <NoduleSectionCard title="Cough details">
              <NoduleField label="Character"><NoduleRadioGroup value={get("nodule_cough_type")} onChange={v => set("nodule_cough_type", v)} inline options={[{ value: "dry", label: "Dry cough" }, { value: "productive", label: "Cough with sputum" }]} /></NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("nodule_cough_since_date")} onSinceDate={v => set("nodule_cough_since_date", v)} years={get("nodule_cough_years")} onYears={v => set("nodule_cough_years", v)} months={get("nodule_cough_months")} onMonths={v => set("nodule_cough_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("nodule_cough_status") === "yes" && get("nodule_cough_type") ? `${get("nodule_cough_type")} cough possibly related to neck swelling since last ${durationText(get("nodule_cough_years"), get("nodule_cough_months"), get("nodule_cough_since_date"))}.` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE H — SYSTEMIC & HORMONAL SYMPTOMS
      // (shown only if TSH is normal)
      // ══════════════════════════════════════════════════════

      case "Q28": return renderSxScreen("Q28", "Do you experience unusual tiredness or fatigue?", "fatigue", true);
      case "Q29": return (
        <div>
          <h3>Have you noticed any unintentional change in your weight?</h3>
          <NoduleYesNoUnsure value={get("weight_change_status")} onChange={v => set("weight_change_status", v)} />
          {get("weight_change_status") === "yes" && (
            <NoduleSectionCard title="Weight change details">
              <NoduleField label="Direction"><NoduleRadioGroup value={get("weight_direction")} onChange={v => set("weight_direction", v)} inline options={[{ value: "gained", label: "Weight gained" }, { value: "lost", label: "Weight lost" }]} /></NoduleField>
              <NoduleField label="How much (kg)?"><NoduleInput type="number" value={get("weight_kg")} onChange={v => set("weight_kg", v)} min={0} placeholder="e.g. 5" /></NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("weight_since_date")} onSinceDate={v => set("weight_since_date", v)} years={get("weight_years")} onYears={v => set("weight_years", v)} months={get("weight_months")} onMonths={v => set("weight_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("weight_change_status") === "yes" && get("weight_direction") ? `Weight ${get("weight_direction")}${get("weight_kg") ? " of " + get("weight_kg") + " kg" : ""} over last ${durationText(get("weight_years"), get("weight_months"), get("weight_since_date"))}.` : ""} />
        </div>
      );
      case "Q30": return (
        <div>
          <h3>Has your appetite changed?</h3>
          <NoduleYesNoUnsure value={get("appetite_change_status")} onChange={v => set("appetite_change_status", v)} />
          {get("appetite_change_status") === "yes" && (
            <NoduleSectionCard title="Appetite change details">
              <NoduleField label="Direction"><NoduleRadioGroup value={get("appetite_direction")} onChange={v => set("appetite_direction", v)} inline options={[{ value: "decreased", label: "Decreased" }, { value: "increased", label: "Increased" }]} /></NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("appetite_since_date")} onSinceDate={v => set("appetite_since_date", v)} years={get("appetite_years")} onYears={v => set("appetite_years", v)} months={get("appetite_months")} onMonths={v => set("appetite_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("appetite_change_status") === "yes" && get("appetite_direction") ? `${get("appetite_direction").charAt(0).toUpperCase() + get("appetite_direction").slice(1)} appetite since last ${durationText(get("appetite_years"), get("appetite_months"), get("appetite_since_date"))}.` : ""} />
        </div>
      );
      case "Q31": return renderSxScreen("Q31", "Do you feel unusually cold or have difficulty tolerating cold temperatures?", "cold_intol", true);
      case "Q32": return (
        <div>
          <h3>Have you noticed any changes in your bowel habits?</h3>
          <NoduleYesNoUnsure value={get("bowel_change_status")} onChange={v => set("bowel_change_status", v)} />
          {get("bowel_change_status") === "yes" && (
            <NoduleSectionCard title="Bowel change details">
              <NoduleField label="Type"><NoduleRadioGroup value={get("bowel_type")} onChange={v => set("bowel_type", v)} options={[{ value: "constipation", label: "Constipation" }, { value: "diarrhoea", label: "Diarrhoea" }, { value: "alternating", label: "Alternating" }]} /></NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("bowel_since_date")} onSinceDate={v => set("bowel_since_date", v)} years={get("bowel_years")} onYears={v => set("bowel_years", v)} months={get("bowel_months")} onMonths={v => set("bowel_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("bowel_change_status") === "yes" && get("bowel_type") ? `${get("bowel_type").charAt(0).toUpperCase() + get("bowel_type").slice(1)} since last ${durationText(get("bowel_years"), get("bowel_months"), get("bowel_since_date"))}.` : ""} />
        </div>
      );
      case "Q33": return renderMultiSxScreen("Q33", "Have you noticed any changes in your skin?", "skin", ["Dryness","Roughness","Pallor","Puffiness","Thickening"]);
      case "Q34": return renderMultiSxScreen("Q34", "Have you noticed any changes in your hair?", "hair", ["Hair loss","Thinning","Dryness","Coarsening","Loss of outer eyebrow (lateral third)"]);
      case "Q35": return (
        <div>
          <h3>Do you experience muscle cramps, aches, or weakness?</h3>
          <NoduleYesNoUnsure value={get("muscle_sx_status")} onChange={v => set("muscle_sx_status", v)} />
          {get("muscle_sx_status") === "yes" && (
            <NoduleSectionCard title="Muscle symptom details">
              <NoduleField label="Type (select all that apply)">
                <NoduleCheckGroup values={get("muscle_sx_types", [])} onChange={v => set("muscle_sx_types", v)} options={[{ value: "cramps", label: "Cramps" }, { value: "aches", label: "Dull aches" }, { value: "weakness", label: "Weakness" }]} />
              </NoduleField>
              {get("muscle_sx_types", []).includes("weakness") && (
                <NoduleField label="Location of weakness"><NoduleRadioGroup value={get("muscle_weakness_location")} onChange={v => set("muscle_weakness_location", v)} options={[{ value: "proximal", label: "Proximal (upper arms / thighs)" }, { value: "generalised", label: "Generalised" }]} /></NoduleField>
              )}
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("muscle_sx_since_date")} onSinceDate={v => set("muscle_sx_since_date", v)} years={get("muscle_sx_years")} onYears={v => set("muscle_sx_years", v)} months={get("muscle_sx_months")} onMonths={v => set("muscle_sx_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("muscle_sx_status") === "yes" && get("muscle_sx_types", []).length ? `${get("muscle_sx_types", []).join(", ")} since last ${durationText(get("muscle_sx_years"), get("muscle_sx_months"), get("muscle_sx_since_date"))}.` : ""} />
        </div>
      );
      case "Q36": return (
        <div>
          <h3>Have you been feeling depressed, low in mood, or emotionally flat?</h3>
          <NoduleYesNoUnsure value={get("depression_status")} onChange={v => set("depression_status", v)} />
          {get("depression_status") === "yes" && (
            <NoduleSectionCard title="Depression details">
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("depression_since_date")} onSinceDate={v => set("depression_since_date", v)} years={get("depression_years")} onYears={v => set("depression_years", v)} months={get("depression_months")} onMonths={v => set("depression_months", v)} />
              <NoduleField label="Have you seen a doctor for this?"><NoduleYesNo value={get("depression_treated")} onChange={v => set("depression_treated", v)} /></NoduleField>
              <NoduleField label="Formally diagnosed with depression?"><NoduleYesNo value={get("depression_diagnosed")} onChange={v => set("depression_diagnosed", v)} /></NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("depression_status") === "yes" ? `${get("depression_diagnosed") === "yes" ? "Diagnosed" : "Reported"} case of depression since last ${durationText(get("depression_years"), get("depression_months"), get("depression_since_date"))}.` : ""} />
        </div>
      );
      case "Q37": return renderMultiSxScreen("Q37", "Do you experience palpitations, tremors, or excessive sweating?", "palp_tremor", ["Palpitations (fast heartbeat)","Tremor of hands","Excessive sweating"]);
      case "Q38": return renderSxScreen("Q38", "Do you feel unusually anxious, restless, or irritable?", "anxiety", true);

      case "Q39": return (
        <div>
          <h3>Do you have any of the following in your wrists or hands?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>(Carpal tunnel symptoms)</p>
          {[["pain", "Pain"], ["numbness", "Numbness"], ["tingling", "Tingling"]].map(([type, label]) => {
            const item = (get("carpal_tunnel_data", {}) || {})[type] || {};
            const updateItem = (patch) => {
              const all = { ...(get("carpal_tunnel_data", {}) || {}) };
              all[type] = { ...(all[type] || {}), ...patch };
              set("carpal_tunnel_data", all);
            };
            return (
              <div key={type} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #e5e9f0" }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, minWidth: 90 }}>{label}</div>
                  <NoduleRadioGroup value={item.status || ""} onChange={v => updateItem({ status: v })} inline options={[{ value: "no", label: "No" }, { value: "unsure", label: "Unsure" }, { value: "yes", label: "Yes" }]} />
                </div>
                {item.status === "yes" && (
                  <NoduleSectionCard title={`${label} details`}>
                    <NoduleField label="Which hand?"><NoduleRadioGroup value={item.side || ""} onChange={v => updateItem({ side: v })} inline options={[{ value: "right", label: "Right" }, { value: "left", label: "Left" }, { value: "both", label: "Both" }]} /></NoduleField>
                    <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={item.since?.date} onSinceDate={v => updateItem({ since: { ...(item.since || {}), date: v } })} years={item.since?.years} onYears={v => updateItem({ since: { ...(item.since || {}), years: v } })} months={item.since?.months} onMonths={v => updateItem({ since: { ...(item.since || {}), months: v } })} />
                  </NoduleSectionCard>
                )}
              </div>
            );
          })}
          <NoduleOutputBox text={Object.entries(get("carpal_tunnel_data", {}) || {}).filter(([, v]) => v?.status === "yes").length > 0
            ? Object.entries(get("carpal_tunnel_data", {}) || {}).filter(([, v]) => v?.status === "yes")
              .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} in ${v.side || "?"} wrist since last ${durationText(v.since?.years, v.since?.months, v.since?.date)}.`).join(" ")
            : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE J — COMORBIDITIES, RISK FACTORS & FINISH
      // ══════════════════════════════════════════════════════

      case "J1": return renderComorbidity("J1", "Have you been diagnosed with high cholesterol or dyslipidaemia?", "dyslipidaemia", "Dyslipidaemia");
      case "J2": return (
        <div>
          <h3>Have you been diagnosed with anaemia?</h3>
          <NoduleYesNoUnsure value={get("anaemia_status")} onChange={v => set("anaemia_status", v)} />
          {get("anaemia_status") === "yes" && (
            <NoduleSectionCard title="Anaemia details">
              <NoduleField label="Type if known">
                <NoduleRadioGroup value={get("anaemia_type")} onChange={v => set("anaemia_type", v)} options={[
                  { value: "iron_deficiency", label: "Iron deficiency" }, { value: "b12_deficiency", label: "Vitamin B12 deficiency" },
                  { value: "folate_deficiency", label: "Folate deficiency" }, { value: "other", label: "Other" }, { value: "not_known", label: "Not known" },
                ]} />
              </NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("anaemia_status") === "yes" && get("anaemia_type") ? `K/c/o ${get("anaemia_type").replace(/_/g, " ")} anaemia.` : ""} />
        </div>
      );
      case "J3": return (
        <div>
          <h3>Have you been diagnosed with diabetes?</h3>
          <NoduleYesNoUnsure value={get("diabetes_status")} onChange={v => set("diabetes_status", v)} />
          {get("diabetes_status") === "yes" && (
            <NoduleSectionCard title="Diabetes details">
              <NoduleField label="Type">
                <NoduleRadioGroup value={get("diabetes_type")} onChange={v => set("diabetes_type", v)} options={[
                  { value: "type1", label: "Type 1" }, { value: "type2", label: "Type 2" },
                  { value: "gestational", label: "Gestational" }, { value: "pre_diabetes", label: "Pre-diabetes" }, { value: "not_known", label: "Not known" },
                ]} />
              </NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("diabetes_since_date")} onSinceDate={v => set("diabetes_since_date", v)} years={get("diabetes_years")} onYears={v => set("diabetes_years", v)} months={get("diabetes_months")} onMonths={v => set("diabetes_months", v)} />
              <NoduleField label="Current medications (optional)"><NoduleInput value={get("diabetes_meds")} onChange={v => set("diabetes_meds", v)} placeholder="e.g. Metformin 500 mg" /></NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("diabetes_status") === "yes" && get("diabetes_type") ? `K/c/o ${get("diabetes_type").replace(/_/g, " ")} diabetes since last ${durationText(get("diabetes_years"), get("diabetes_months"), get("diabetes_since_date"))}.` : ""} />
        </div>
      );
      case "J4": return renderComorbidity("J4", "Have you been diagnosed with hypertension (high blood pressure)?", "htn", "Hypertension");
      case "J4b": return (
        <div>
          <h3>Have you been diagnosed with PCOS or PMOS?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>Polycystic Ovarian Syndrome (PCOS) / Polyendocrine Metabolic Ovarian Syndrome (PMOS)</p>
          <NoduleYesNoUnsure value={get("pcos_status")} onChange={v => set("pcos_status", v)} />
          {get("pcos_status") === "yes" && (
            <NoduleSectionCard title="PCOS / PMOS details">
              <NoduleField label="Which diagnosis?"><NoduleRadioGroup value={get("pcos_label")} onChange={v => set("pcos_label", v)} inline options={[{ value: "pcos", label: "PCOS" }, { value: "pmos", label: "PMOS" }]} /></NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("pcos_since_date")} onSinceDate={v => set("pcos_since_date", v)} years={get("pcos_years")} onYears={v => set("pcos_years", v)} months={get("pcos_months")} onMonths={v => set("pcos_months", v)} />
              <NoduleField label="On medication?"><NoduleYesNoUnsure value={get("pcos_on_med")} onChange={v => set("pcos_on_med", v)} /></NoduleField>
              {get("pcos_on_med") === "yes" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <NoduleField label="Medicine name"><NoduleInput value={get("pcos_med_name")} onChange={v => set("pcos_med_name", v)} placeholder="e.g. Metformin" /></NoduleField>
                  <NoduleField label="Dose (mg)"><NoduleInput type="number" value={get("pcos_med_dose")} onChange={v => set("pcos_med_dose", v)} /></NoduleField>
                  <NoduleField label="Times per day"><NoduleInput type="number" value={get("pcos_med_freq")} onChange={v => set("pcos_med_freq", v)} min={1} max={6} /></NoduleField>
                </div>
              )}
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("pcos_status") === "yes" && get("pcos_label") ? `K/c/o ${get("pcos_label").toUpperCase()} since last ${durationText(get("pcos_years"), get("pcos_months"), get("pcos_since_date"))}${get("pcos_on_med") === "yes" && get("pcos_med_name") ? `, on Tab. ${get("pcos_med_name")}` : ""}.` : ""} />
        </div>
      );
      case "J4c": return (
        <div>
          <h3>Have you experienced any difficulty conceiving? (infertility)</h3>
          <NoduleYesNoUnsure value={get("infertility_status")} onChange={v => set("infertility_status", v)} />
          <NoduleOutputBox text={get("infertility_status") === "yes" ? "Difficulty in conceiving reported." : get("infertility_status") === "no" ? "No difficulty in conceiving." : ""} />
        </div>
      );
      case "J5": return (
        <div>
          <h3>Do you have any known autoimmune condition?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>e.g. Type 1 diabetes, rheumatoid arthritis, lupus, vitiligo, Addison's disease</p>
          <NoduleYesNoUnsure value={get("autoimmune_status")} onChange={v => set("autoimmune_status", v)} />
          {get("autoimmune_status") === "yes" && (
            <NoduleSectionCard title="Autoimmune conditions">
              <NoduleCheckGroup values={get("autoimmune_conditions", [])} onChange={v => set("autoimmune_conditions", v)} options={[
                { value: "type1_diabetes", label: "Type 1 diabetes" }, { value: "rheumatoid_arthritis", label: "Rheumatoid arthritis" },
                { value: "lupus", label: "Lupus (SLE)" }, { value: "vitiligo", label: "Vitiligo" },
                { value: "addisons", label: "Addison's disease" }, { value: "other", label: "Other" },
              ]} />
              {get("autoimmune_conditions", []).includes("other") && <NoduleField label="Please specify"><NoduleInput value={get("autoimmune_other")} onChange={v => set("autoimmune_other", v)} /></NoduleField>}
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("autoimmune_status") === "yes" && get("autoimmune_conditions", []).length ? get("autoimmune_conditions", []).map(c => c.replace(/_/g, " ")).join(". ") + "." : ""} />
        </div>
      );
      case "J6": return (
        <div>
          <h3>Do you have a family history of thyroid disease?</h3>
          <NoduleYesNoUnsure value={get("family_thyroid_status")} onChange={v => set("family_thyroid_status", v)} />
          {get("family_thyroid_status") === "yes" && (
            <NoduleSectionCard title="Family thyroid history">
              <NoduleField label="Which relative(s)? (select all that apply)">
                <NoduleCheckGroup values={get("family_thyroid_relations", [])} onChange={v => set("family_thyroid_relations", v)} options={[
                  { value: "mother", label: "Mother" }, { value: "father", label: "Father" },
                  { value: "siblings", label: "Siblings" }, { value: "children", label: "Children" },
                  { value: "paternal_grandfather", label: "Paternal grandfather" }, { value: "paternal_grandmother", label: "Paternal grandmother" },
                  { value: "maternal_grandfather", label: "Maternal grandfather" }, { value: "maternal_grandmother", label: "Maternal grandmother" },
                  { value: "uncle", label: "Uncle" }, { value: "aunt", label: "Aunt" }, { value: "cousin", label: "Cousin" },
                ]} />
              </NoduleField>
              <NoduleField label="Condition">
                <NoduleSelect value={get("family_thyroid_condition")} onChange={v => set("family_thyroid_condition", v)} placeholder="Select condition" options={[
                  { value: "hypothyroidism", label: "Hypothyroidism" }, { value: "hyperthyroidism", label: "Hyperthyroidism" },
                  { value: "thyroid_cancer", label: "Thyroid cancer" }, { value: "goitre", label: "Goitre" },
                  { value: "thyroid_nodule", label: "Thyroid nodule" }, { value: "others", label: "Others" },
                ]} />
              </NoduleField>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("family_thyroid_status") === "yes" && get("family_thyroid_relations", []).length ? `Family history: ${get("family_thyroid_relations", []).join(", ")} — ${get("family_thyroid_condition")?.replace(/_/g, " ") || ""}.` : ""} />
        </div>
      );
      case "J7": return (
        <div>
          <h3>Have you been exposed to radiation to the head, neck, or chest in the past?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>e.g. radiation therapy for cancer, frequent X-rays, CT scans, or radiotherapy to the neck</p>
          <NoduleYesNoUnsure value={get("radiation_exposure_status")} onChange={v => set("radiation_exposure_status", v)} />
          {get("radiation_exposure_status") === "yes" && (
            <NoduleSectionCard title="Radiation exposure details">
              <NoduleField label="Type (select all that apply)">
                <NoduleCheckGroup values={get("radiation_exposure_types", [])} onChange={v => set("radiation_exposure_types", v)} options={[
                  { value: "radiation_therapy", label: "Radiation therapy (cancer treatment)" },
                  { value: "frequent_xray_ct", label: "Frequent diagnostic X-rays or CT scans" },
                  { value: "occupational", label: "Occupational radiation exposure" },
                  { value: "other", label: "Other" },
                ]} />
              </NoduleField>
              {get("radiation_exposure_types", []).includes("other") && <NoduleField label="Please specify"><NoduleInput value={get("radiation_exposure_other")} onChange={v => set("radiation_exposure_other", v)} /></NoduleField>}
              <NoduleField label="Approximate year of exposure">
                <NoduleYearInput value={get("radiation_exposure_year")} onChange={v => set("radiation_exposure_year", v)} dob={patientDob} placeholder="e.g. 2018" />
              </NoduleField>
              <div style={{ background: "#FCEBEB", border: "1px solid #E24B4A", borderRadius: 8, padding: 10, fontSize: 12, color: "#791F1F", marginTop: 8 }}>
                ⚠ History of radiation to the neck is a known risk factor for thyroid nodules and thyroid cancer — flagged for physician review.
              </div>
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("radiation_exposure_status") === "yes" && get("radiation_exposure_types", []).length ? `H/o ${get("radiation_exposure_types", []).join(", ")}${get("radiation_exposure_year") ? " in " + get("radiation_exposure_year") : ""} — [FLAG: Radiation exposure risk factor].` : ""} />
        </div>
      );
      case "J8": return (
        <div>
          <h3>Have you ever lived in an area known for iodine deficiency, or been told you had iodine deficiency?</h3>
          <NoduleYesNoUnsure value={get("iodine_deficiency_status")} onChange={v => set("iodine_deficiency_status", v)} />
          {get("iodine_deficiency_status") === "yes" && (
            <NoduleSectionCard title="Iodine deficiency details">
              <NoduleDurationPicker minDate={patientDob} label="How long ago / for how long?" sinceDate={get("iodine_deficiency_since_date")} onSinceDate={v => set("iodine_deficiency_since_date", v)} years={get("iodine_deficiency_years")} onYears={v => set("iodine_deficiency_years", v)} months={get("iodine_deficiency_months")} onMonths={v => set("iodine_deficiency_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("iodine_deficiency_status") === "yes" ? `H/o iodine deficiency for ${durationText(get("iodine_deficiency_years"), get("iodine_deficiency_months"), get("iodine_deficiency_since_date"))}.` : ""} />
        </div>
      );
      case "J9": return (
        <div>
          <h3>Are you currently taking any iodine-containing medications or supplements?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>e.g. Amiodarone, Lugol's iodine, Kelp supplements, or recent iodine-based contrast agents</p>
          <NoduleYesNoUnsure value={get("iodine_med_status")} onChange={v => set("iodine_med_status", v)} />
          {get("iodine_med_status") === "yes" && (
            <NoduleSectionCard title="Iodine medication / supplement details">
              <NoduleField label="Name of medication / supplement"><NoduleInput value={get("iodine_med_name")} onChange={v => set("iodine_med_name", v)} placeholder="e.g. Amiodarone, Kelp supplement" /></NoduleField>
              <NoduleDurationPicker minDate={patientDob} label="Taking since?" sinceDate={get("iodine_med_since_date")} onSinceDate={v => set("iodine_med_since_date", v)} years={get("iodine_med_years")} onYears={v => set("iodine_med_years", v)} months={get("iodine_med_months")} onMonths={v => set("iodine_med_months", v)} />
            </NoduleSectionCard>
          )}
          <NoduleOutputBox text={get("iodine_med_status") === "yes" && get("iodine_med_name") ? `On ${get("iodine_med_name")} since last ${durationText(get("iodine_med_years"), get("iodine_med_months"), get("iodine_med_since_date"))}.` : ""} />
        </div>
      );
      case "J10": return (
        <div>
          <h3>Is there anything else about your thyroid nodule, symptoms, or condition that you would like your doctor to know?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>This is optional</p>
          <textarea
            value={get("additional_notes")}
            onChange={e => set("additional_notes", e.target.value)}
            placeholder="Type anything additional here..."
            rows={5}
            style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #d0d7e8", borderRadius: 8, fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
          />
        </div>
      );

      default: return <div>Unknown page: {pageId}</div>;
    }
  };

  // ── Reusable screen helpers ───────────────────────────────────────────────

  function renderLabScreen(id, label, key, fixedUnit, unitOptions) {
    return (
      <div>
        <h3>Have you had a {label} test done?</h3>
        <NoduleYesNoUnsure value={get(`${key}_status`)} onChange={v => set(`${key}_status`, v)} />
        {get(`${key}_status`) === "yes" && (
          <NoduleSectionCard title={`${label} result`}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <NoduleField label="Value"><NoduleInput type="number" value={get(`${key}_value`)} onChange={v => set(`${key}_value`, v)} placeholder="Numeric value" /></NoduleField>
              {unitOptions ? (
                <NoduleField label="Unit"><NoduleSelect value={get(`${key}_unit`)} onChange={v => set(`${key}_unit`, v)} options={unitOptions} /></NoduleField>
              ) : (
                <NoduleField label="Unit"><NoduleInput value={fixedUnit} onChange={() => {}} style={{ background: "#f5f5f5", color: "#888" }} /></NoduleField>
              )}
              <NoduleField label="Date of test">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <NoduleInput type="date" value={get(`${key}_date`)} onChange={v => set(`${key}_date`, v)} max={new Date().toISOString().split("T")[0]} />
                  <label style={{ fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                    <input type="checkbox" onChange={e => e.target.checked && set(`${key}_date`, get("tsh_date"))} /> Same as TSH
                  </label>
                </div>
              </NoduleField>
              <NoduleField label="Reference range">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <NoduleInput type="number" value={get(`${key}_ref_low`)} onChange={v => set(`${key}_ref_low`, v)} placeholder="Low" />
                  <span style={{ color: "#999" }}>–</span>
                  <NoduleInput type="number" value={get(`${key}_ref_high`)} onChange={v => set(`${key}_ref_high`, v)} placeholder="High" />
                </div>
              </NoduleField>
            </div>
            <NoduleField label="Upload report (optional)">
              <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload lab report</div>
            </NoduleField>
          </NoduleSectionCard>
        )}
        <NoduleOutputBox text={get(`${key}_status`) === "yes" && get(`${key}_value`) ? `${label} — ${get(`${key}_value`)} ${get(`${key}_unit`) || fixedUnit || ""} (${fmtDate(get(`${key}_date`))})` : ""} />
      </div>
    );
  }

  function renderSxScreen(id, question, key, hasSeverity) {
    return (
      <div>
        <h3>{question}</h3>
        <NoduleYesNoUnsure value={get(`${key}_status`)} onChange={v => set(`${key}_status`, v)} />
        {get(`${key}_status`) === "yes" && (
          <NoduleSectionCard title="Details">
            {hasSeverity && <NoduleField label="Severity"><NoduleRadioGroup value={get(`${key}_severity`)} onChange={v => set(`${key}_severity`, v)} inline options={[{ value: "mild", label: "Mild" }, { value: "moderate", label: "Moderate" }, { value: "severe", label: "Severe" }]} /></NoduleField>}
            <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get(`${key}_since_date`)} onSinceDate={v => set(`${key}_since_date`, v)} years={get(`${key}_years`)} onYears={v => set(`${key}_years`, v)} months={get(`${key}_months`)} onMonths={v => set(`${key}_months`, v)} />
          </NoduleSectionCard>
        )}
        <NoduleOutputBox text={get(`${key}_status`) === "yes" ? `${get(`${key}_severity`) ? get(`${key}_severity`) + " " : ""}${key.replace(/_/g, " ")} since last ${durationText(get(`${key}_years`), get(`${key}_months`), get(`${key}_since_date`))}.` : ""} />
      </div>
    );
  }

  function renderMultiSxScreen(id, question, key, typeOptions) {
    return (
      <div>
        <h3>{question}</h3>
        <NoduleYesNoUnsure value={get(`${key}_status`)} onChange={v => set(`${key}_status`, v)} />
        {get(`${key}_status`) === "yes" && (
          <NoduleSectionCard title="Details">
            <NoduleField label="Type (select all that apply)">
              <NoduleCheckGroup values={get(`${key}_types`, [])} onChange={v => set(`${key}_types`, v)} options={typeOptions.map(t => ({ value: t.toLowerCase().replace(/[\s/()]+/g, "_"), label: t }))} />
            </NoduleField>
            <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get(`${key}_since_date`)} onSinceDate={v => set(`${key}_since_date`, v)} years={get(`${key}_years`)} onYears={v => set(`${key}_years`, v)} months={get(`${key}_months`)} onMonths={v => set(`${key}_months`, v)} />
          </NoduleSectionCard>
        )}
        <NoduleOutputBox text={get(`${key}_status`) === "yes" && get(`${key}_types`, []).length ? `${get(`${key}_types`, []).map(t => t.replace(/_/g, " ")).join(", ")} since last ${durationText(get(`${key}_years`), get(`${key}_months`), get(`${key}_since_date`))}.` : ""} />
      </div>
    );
  }

  function renderComorbidity(id, question, key, outputLabel) {
    return (
      <div>
        <h3>{question}</h3>
        <NoduleYesNoUnsure value={get(`${key}_status`)} onChange={v => set(`${key}_status`, v)} />
        {get(`${key}_status`) === "yes" && (
          <NoduleSectionCard title="Details">
            <NoduleDurationPicker minDate={patientDob} label="Since when?" sinceDate={get(`${key}_since_date`)} onSinceDate={v => set(`${key}_since_date`, v)} years={get(`${key}_years`)} onYears={v => set(`${key}_years`, v)} months={get(`${key}_months`)} onMonths={v => set(`${key}_months`, v)} />
            <NoduleField label="On medication?"><NoduleYesNoUnsure value={get(`${key}_on_med`)} onChange={v => set(`${key}_on_med`, v)} /></NoduleField>
            {get(`${key}_on_med`) === "yes" && (
              <div>
                {(get(`${key}_meds`, [{ name: "", dose_mg: "", freq_per_day: "", since_months: "" }])).map((med, i) => (
                  <NoduleMedBlock key={i} med={med} index={i}
                    onChange={updated => { const arr = [...get(`${key}_meds`, [{}])]; arr[i] = updated; set(`${key}_meds`, arr); }}
                    onRemove={i > 0 ? () => { const arr = get(`${key}_meds`, []).filter((_, j) => j !== i); set(`${key}_meds`, arr); } : null}
                  />
                ))}
                <button onClick={() => set(`${key}_meds`, [...get(`${key}_meds`, [{}]), { name: "", dose_mg: "", freq_per_day: "", since_months: "" }])}
                  style={{ background: "none", border: "1px dashed #534AB7", color: "#534AB7", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>
                  + Add another medicine
                </button>
              </div>
            )}
          </NoduleSectionCard>
        )}
        <NoduleOutputBox text={get(`${key}_status`) === "yes" ? `${outputLabel} since last ${durationText(get(`${key}_years`), get(`${key}_months`), get(`${key}_since_date`))}.` : ""} />
      </div>
    );
  }

  // ── Shell ─────────────────────────────────────────────────────────────────

  const nextBtnLabel = () => {
    if (pageId === "Q13" && (tshBranch === "high" || tshBranch === "low") && !branchConfirmed) return "View TSH result →";
    if (pageId === "Q13" && tshBranch === "high" && branchConfirmed) return "Continue to Hypothyroid questionnaire →";
    if (pageId === "Q13" && tshBranch === "low" && branchConfirmed) return "Continue to Hyperthyroid questionnaire →";
    if (reviewMode) return "Next unanswered →";
    if (currentPage === totalPages - 1) return "Submit ✓";
    return "Next →";
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", fontFamily: "system-ui, sans-serif", padding: "0 16px 40px" }}>

      {draftLoadError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', margin: '16px 0', fontSize: 13, color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{draftLoadError}</span>
          <button onClick={loadDraft} className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>Retry</button>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ position: "sticky", top: 0, background: "#fff", paddingTop: 16, paddingBottom: 12, zIndex: 10, borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#888" }}>Thyroid Nodule</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#534AB7" }}>{progress}%</span>
        </div>
        <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3 }}>
          <div style={{ height: 6, background: "#534AB7", borderRadius: 3, width: `${progress}%`, transition: "width 0.3s" }} />
        </div>
        <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
          {pageId}
          {saveMsg && <span style={{ marginLeft: 12, color: "#e74c3c" }}>{saveMsg}</span>}
          {tshBranch === "high" && get("tsh_status") === "yes" && <span style={{ marginLeft: 12, color: "#185FA5", fontWeight: 600 }}>TSH high — Hypo route</span>}
          {tshBranch === "low"  && get("tsh_status") === "yes" && <span style={{ marginLeft: 12, color: "#854F0B", fontWeight: 600 }}>TSH low — Hyper route</span>}
          {tshBranch === "normal" && get("tsh_status") === "yes" && <span style={{ marginLeft: 12, color: "#27ae60", fontWeight: 600 }}>TSH normal — continuing</span>}
        </div>
      </div>

      {/* Question */}
      <div ref={pageContentRef} style={{ position: "relative", paddingTop: 24, paddingBottom: 80, minHeight: NODULE_PAGE_MIN_HEIGHT, boxSizing: "border-box" }}>
        {renderPage()}
        <NoduleMissingPointer containerRef={pageContentRef} pageKey={pageId}
          active={reviewMode && incompleteList.some(({ idx }) => idx === currentPage)} />
      </div>

      {/* Navigation */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #f0f0f0", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={currentPage === 0 ? onBack : prev}
          disabled={currentPage === 0 && !onBack}
          style={{ padding: "10px 24px", border: "1.5px solid #d0d7e8", borderRadius: 8, background: "transparent", color: (currentPage === 0 && !onBack) ? "#ccc" : "#555", cursor: (currentPage === 0 && !onBack) ? "not-allowed" : "pointer", fontSize: 14 }}
        >
          ← Back
        </button>

        {lastSavedAt && <span style={{ fontSize: 12, color: "#888" }}>✓ Saved</span>}

        <button
          onClick={next}
          disabled={yearInvalid}
          style={{ padding: "10px 28px", border: "none", borderRadius: 8, background: yearInvalid ? "#ccc" : "#534AB7", color: "#fff", cursor: yearInvalid ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}
        >
          {nextBtnLabel()}
        </button>
      </div>
    </div>
  );
}
