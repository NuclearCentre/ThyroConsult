// ============================================================
// TcQuestionnaire.js
// Full path:
//   thyroconsult-frontend\src\components\TcQuestionnaire.js
//
// Chatbot-style questionnaire for Carcinoma Thyroid (CA Thyroid)
// 1 question per page. Yes → sub-questions on same page.
// No/Unsure → next page immediately.
// Architecture matches HyperQuestionnaire exactly.
// Tc-prefixed UI primitives to avoid naming conflicts.
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { conditionAPI } from "../api/index";

// ─── Tc-prefixed UI primitives ────────────────────────────────────────────────

const TcField = ({ label, children, hint }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontWeight: 600, marginBottom: 6, color: "#1a1a2e", fontSize: 14 }}>{label}</label>}
    {hint && <p style={{ margin: "0 0 6px", fontSize: 12, color: "#666" }}>{hint}</p>}
    {children}
  </div>
);

const TcInput = ({ value, onChange, type = "text", placeholder, min, max, style }) => (
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
const TcYearInput = ({ value, onChange, dob, placeholder, style }) => {
  const dobYear = dob ? new Date(dob).getFullYear() : null;
  const thisYear = new Date().getFullYear();
  const invalid = dobYear && value && parseInt(value) < dobYear;
  return (
    <div>
      <TcInput type="number" value={value} onChange={onChange} placeholder={placeholder}
        min={dobYear || 1950} max={thisYear} style={style} />
      {invalid && (
        <div style={{ fontSize: 11, color: "#c0392b", marginTop: 4 }}>
          Can't be before your birth year ({dobYear})
        </div>
      )}
    </div>
  );
};

const TcSelect = ({ value, onChange, options, placeholder }) => (
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

// Fixed dose-pill grid (5 per row), matching HypoQuestionnaire's HypoPillSelect.
const TcPillSelect = ({ options, value, onChange, perRow = 5 }) => (
  <div data-hyporeq-type="select" data-hyporeq-filled={value ? "true" : "false"}
    style={{ display: "grid", gridTemplateColumns: `repeat(${perRow}, 1fr)`, gap: 8, marginBottom: 12 }}>
    {options.map(opt => {
      const sel = value === opt;
      return (
        <div key={opt} onClick={() => onChange(opt)} style={{
          display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
          padding: "8px 6px", borderRadius: 8, cursor: "pointer", fontSize: 13,
          border: `1.5px solid ${sel ? "#d35400" : "#d0d7e8"}`,
          background: sel ? "#fef5ef" : "#fff",
          color: sel ? "#d35400" : "#1a1a2e",
          minHeight: 40, boxSizing: "border-box",
        }}>{opt} mcg</div>
      );
    })}
  </div>
);

const TcRadioGroup = ({ value, onChange, options, inline }) => (
  <div data-hyporeq-type="select" data-hyporeq-filled={value ? "true" : "false"} style={{ display: "flex", flexDirection: inline ? "row" : "column", gap: 10, flexWrap: "wrap" }}>
    {options.map(o => (
      <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${value === o.value ? "#d35400" : "#d0d7e8"}`, background: value === o.value ? "#fef5ef" : "#fff", fontWeight: value === o.value ? 600 : 400, fontSize: 14, whiteSpace: "nowrap" }}>
        <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} style={{ accentColor: "#d35400" }} />
        {o.label}
      </label>
    ))}
  </div>
);

const TcCheckGroup = ({ values = [], onChange, options }) => {
  const toggle = (val) => {
    const next = values.includes(val) ? values.filter(v => v !== val) : [...values, val];
    onChange(next);
  };
  return (
    <div data-hyporeq-type="select" data-hyporeq-filled={values.length ? "true" : "false"} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {options.map(o => (
        <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${values.includes(o.value) ? "#d35400" : "#d0d7e8"}`, background: values.includes(o.value) ? "#fef5ef" : "#fff", fontSize: 14 }}>
          <input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} style={{ accentColor: "#d35400" }} />
          {o.label}
        </label>
      ))}
    </div>
  );
};

const TcYesNoUnsure = ({ value, onChange }) => (
  <TcRadioGroup value={value} onChange={onChange} inline options={[{ value: "no", label: "No" }, { value: "unsure", label: "Unsure" }, { value: "yes", label: "Yes" }]} />
);

const TcYesNo = ({ value, onChange }) => (
  <TcRadioGroup value={value} onChange={onChange} inline options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
);

const TcDurationPicker = ({ label = "Since when?", sinceDate, onSinceDate, years, onYears, months, onMonths, minDate }) => (
  <TcField label={label}>
    <div data-hyporeq-type="duration" data-hyporeq-filled={(sinceDate || years || months) ? "true" : "false"} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 180px" }}>
        <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Date (if known)</label>
        <TcInput type="date" value={sinceDate} onChange={onSinceDate} max={new Date().toISOString().split("T")[0]} min={minDate || undefined} />
      </div>
      <div style={{ display: "flex", gap: 8, flex: "1 1 160px", alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Years</label>
          <TcInput type="number" value={years} onChange={onYears} min={0} max={100} placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Months</label>
          <TcInput type="number" value={months} onChange={onMonths} min={0} max={11} placeholder="0" />
        </div>
      </div>
    </div>
  </TcField>
);

const TcMedBlock = ({ med, index, onChange, onRemove }) => (
  <div style={{ border: "1px solid #d0d7e8", borderRadius: 8, padding: 14, marginBottom: 10, background: "#fafbff" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <span style={{ fontWeight: 600, fontSize: 13, color: "#d35400" }}>Medicine {index + 1}</span>
      {onRemove && <button onClick={onRemove} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 13 }}>✕ Remove</button>}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <TcField label="Medicine name"><TcInput value={med.name} onChange={v => onChange({ ...med, name: v })} placeholder="e.g. Atorvastatin" /></TcField>
      <TcField label="Dose (mg)"><TcInput type="number" value={med.dose_mg} onChange={v => onChange({ ...med, dose_mg: v })} placeholder="e.g. 20" /></TcField>
      <TcField label="Times per day"><TcInput type="number" value={med.freq_per_day} onChange={v => onChange({ ...med, freq_per_day: v })} min={1} max={10} placeholder="e.g. 1" /></TcField>
      <TcField label="Since (months)"><TcInput type="number" value={med.since_months} onChange={v => onChange({ ...med, since_months: v })} min={0} placeholder="e.g. 6" /></TcField>
    </div>
  </div>
);

// No longer rendered on the patient-facing screen (per explicit request).
// Underlying answers still save normally regardless of this.
const TcOutputBox = () => null;

const TcSectionCard = ({ title, children }) => (
  <div style={{ marginTop: 20, padding: "16px 20px", border: "1.5px solid #d0d7e8", borderRadius: 10, background: "#fff" }}>
    {title && <p style={{ margin: "0 0 14px", fontWeight: 700, color: "#d35400", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</p>}
    {children}
  </div>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function durationText(years, months, sinceDate) {
  if (sinceDate) {
    const d = new Date(sinceDate);
    const now = new Date();
    const totalDays = Math.floor((now - d) / 86400000);
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

function fmtDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB");
}

function calcAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function calcEDD(lmp, iso) {
  if (!lmp) return "";
  const d = new Date(lmp);
  d.setMonth(d.getMonth() + 9);
  d.setDate(d.getDate() + 7);
  return iso ? d.toISOString().split("T")[0] : d.toLocaleDateString("en-GB");
}

// ─── Per-page completion validators — built directly from each page's own
// actual render logic above, mirroring HypoQuestionnaire/HyperQuestionnaire. ───
// ─── Thyroid medication brand → generic name + available doses ───
// Same database as HypoQuestionnaire — same drugs, same market.
const THYROID_MED_BRANDS = {
  'Eltroxin':    { generic: 'Thyroxine Sodium', doses: [25, 50, 100] },
  'Thyronorm':   { generic: 'Thyroxine Sodium', doses: [12.5, 25, 37.5, 50, 62.5, 75, 88, 100, 112, 125, 137, 150, 200] },
  'Thyrox':      { generic: 'Thyroxine Sodium', doses: [50, 62.5, 88, 100, 150] },
  'L-Thyroid':   { generic: 'Thyroxine Sodium', doses: [25, 50, 75, 88, 150] },
  'Thyroactiv':  { generic: 'Thyroxine Sodium', doses: [12.5, 25, 50, 75, 100] },
  'Thyro-Fresh': { generic: 'Thyroxine Sodium', doses: [100] },
  'Thyroford':   { generic: 'Thyroxine Sodium', doses: [50] },
  'Tyroxil':     { generic: 'Thyroxine Sodium', doses: [25, 50, 100] },
  'Thyine':      { generic: 'Thyroxine Sodium', doses: [75] },
  'Lythrox':     { generic: 'Thyroxine Sodium', doses: [12.5, 25, 50, 75] },
  'Thyronex':    { generic: 'Thyroxine Sodium', doses: [12.5, 25, 50] },
  'Thyrocip':    { generic: 'Thyroxine Sodium', doses: [100] },
  'Toskiv':      { generic: 'Thyroxine Sodium', doses: [100] },
  'L-Thyrox':    { generic: 'Levothyroxine Sodium', doses: [25] },
  'Euthyrox':    { generic: 'Levothyroxine Sodium', doses: [100] },
  'Lethyrox':    { generic: 'Levothyroxine Sodium', doses: [50] },
};

const LIOTHYRONINE_BRANDS = {
  'Thyonin':   { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
  'Tertroxin': { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
  'Linorma T': { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
  'Thyro3':    { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
  'Liorel':    { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
  'Cytomel':   { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
};

const tcDur = d => !!(d && (d.since_date || d.years || d.months));
const TC_PAGE_VALIDATORS = {
  A3: d => !!d.marital_status,
  A4: d => !!d.occupation && (d.occupation !== "other" || !!d.occupation_other),

  D5a: d => !!d.imaging_status && (d.imaging_status !== "yes" || ((d.imaging_types || []).length > 0 && !!d.imaging_date)),
  D5b: d => !!d.cytology_status && (d.cytology_status !== "yes" || ((d.cytology_types || []).length > 0 && !!d.cytology_date && !!d.cytology_result)),

  E1: d => !!d.ca_thyroid_type && (d.ca_thyroid_type !== "other" || !!d.ca_thyroid_type_other) && !!d.ca_dx_year,
  E2: d => !!d.ca_staged && (d.ca_staged !== "yes" || (!!d.ca_stage && !!d.ca_grade)),
  E3: d => !!d.ca_surgery_type && (d.ca_surgery_type !== "other" || !!d.ca_surgery_type_other) && (d.ca_surgery_type === "no_surgery" || (!!d.ca_surgery_date && !!d.ca_surgery_side)),
  E4: d => !!d.neck_dissection_status && (d.neck_dissection_status !== "yes" || (!!d.neck_dissection_type && !!d.neck_dissection_side)),
  E5: d => !!d.rai_post_surgery_status && (d.rai_post_surgery_status !== "yes" || (!!d.rai_cycles && !!d.rai_last_date && !!d.rai_purpose)),
  E6: d => !!d.ebrt_status && (d.ebrt_status !== "yes" || ((d.ebrt_regions || []).length > 0 && (!(d.ebrt_regions || []).includes("other") || !!d.ebrt_other) && !!d.ebrt_date)),
  E7: d => !!d.targeted_tx_status && (d.targeted_tx_status !== "yes" || (!!d.targeted_tx_name && !!d.targeted_tx_dose && !!d.targeted_tx_freq && !!d.targeted_tx_ongoing && (d.targeted_tx_ongoing !== "no" || !!d.targeted_tx_stop_reason))),
  E8: d => !!d.recurrence_status && (d.recurrence_status !== "yes" || ((d.recurrence_sites || []).length > 0 && !!d.recurrence_date)),
  E9: d => !!d.metastasis_status && (d.metastasis_status !== "yes" || ((d.metastasis_sites || []).length > 0 && (!(d.metastasis_sites || []).includes("other") || !!d.metastasis_other) && !!d.metastasis_date)),
  // Tg/TgAb values explicitly optional ("neither is mandatory") — only status + stimulated required
  E10: d => !!d.tg_status && (d.tg_status !== "yes" || !!d.tg_stimulated),
  E11: d => !!d.surveillance_status && (d.surveillance_status !== "yes" || ((d.surveillance_types || []).length > 0 && !!d.surveillance_date && !!d.surveillance_findings)),

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
    const lmpDaysAgo = d.lmp_date ? Math.floor((Date.now() - new Date(d.lmp_date)) / 86400000) : 0;
    if (lmpDaysAgo < 31) return true;
    return !!d.pregnancy_status;
  },

  C1: d => !!d.thyroid_dx_status && (d.thyroid_dx_status !== "yes" || (!!d.thyroid_dx_type && !!d.thyroid_dx_year)),
  C2: d => !!d.thyroid_tx_status && (d.thyroid_tx_status !== "yes" || (!!d.thyroid_tx_type && !!d.thyroid_tx_year)),
  C3: d => {
    if (!d.thyroid_med_status) return false;
    if (d.thyroid_med_status !== "yes") return true;
    if (!d.thyroid_med_treatment_type) return false;
    const lt4Ok = !!d.thyroid_med_brand && !!d.thyroid_med_dose;
    const lt3Ok = !!d.liothyronine_brand && !!d.liothyronine_dose;
    const otherOk = !!d.thyroid_med_name && !!d.thyroid_med_dose;
    const medOk =
      d.thyroid_med_treatment_type === "levo_only" ? lt4Ok :
      d.thyroid_med_treatment_type === "lio_only" ? lt3Ok :
      d.thyroid_med_treatment_type === "combination" ? (lt4Ok && lt3Ok) :
      d.thyroid_med_treatment_type === "other" ? otherOk : false;
    if (!medOk) return false;
    const lt4DcOk = !!d.dose_changed_status && (d.dose_changed_status !== "yes" || (!!d.dose_last_changed_date && !!d.dose_change_reason));
    const lt3DcOk = !!d.liothyronine_dose_changed_status && (d.liothyronine_dose_changed_status !== "yes" || (!!d.liothyronine_dose_changed_date && !!d.liothyronine_dose_change_reason));
    if (d.thyroid_med_treatment_type === "levo_only" && !lt4DcOk) return false;
    if (d.thyroid_med_treatment_type === "lio_only" && !lt3DcOk) return false;
    if (d.thyroid_med_treatment_type === "combination" && !(lt4DcOk && lt3DcOk)) return false;
    if (d.thyroid_med_treatment_type === "other" && !lt4DcOk) return false;
    return true;
  },
  C4a: d => !!d.family_thyroid_status && (d.family_thyroid_status !== "yes" || ((d.family_thyroid_relations || []).length > 0 && !!d.family_thyroid_condition)),
  C4b: d => !!d.family_men_status && (d.family_men_status !== "yes" || ((d.family_men_types || []).length > 0 && !!d.family_men_relative)),
  C5: d => !!d.autoimmune_status && (d.autoimmune_status !== "yes" || ((d.autoimmune_conditions || []).length > 0 && (!(d.autoimmune_conditions || []).includes("other") || !!d.autoimmune_other))),

  D1: d => !!d.tsh_status && (d.tsh_status !== "yes" || (!!d.tsh_value && !!d.tsh_date)),
  D2: d => !!d.t3_status && (d.t3_status !== "yes" || (!!d.t3_value && !!d.t3_date)),
  D3: d => !!d.ft3_status && (d.ft3_status !== "yes" || (!!d.ft3_value && !!d.ft3_date)),
  D4: d => !!d.t4_status && (d.t4_status !== "yes" || (!!d.t4_value && !!d.t4_date)),
  D5: d => !!d.ft4_status && (d.ft4_status !== "yes" || (!!d.ft4_value && !!d.ft4_date)),
  D6: d => !!d.antitpo_status && (d.antitpo_status !== "yes" || (!!d.antitpo_value && !!d.antitpo_date)),
  D7: d => !!d.antitg_status && (d.antitg_status !== "yes" || (!!d.antitg_value && !!d.antitg_date)),

  F1: d => !!d.fatigue_status && (d.fatigue_status !== "yes" || (!!d.fatigue_severity && tcDur({ since_date: d.fatigue_since_date, years: d.fatigue_years, months: d.fatigue_months }))),
  F2: d => !!d.weight_change_status && (d.weight_change_status !== "yes" || (!!d.weight_direction && !!d.weight_kg && tcDur({ since_date: d.weight_since_date, years: d.weight_years, months: d.weight_months }))),
  F3: d => !!d.appetite_status,
  F4: d => !!d.cold_intol_status && (d.cold_intol_status !== "yes" || tcDur({ since_date: d.cold_intol_since_date, years: d.cold_intol_years, months: d.cold_intol_months })),
  F5: d => !!d.bowel_change_status && (d.bowel_change_status !== "yes" || (!!d.bowel_type && tcDur({ since_date: d.bowel_since_date, years: d.bowel_years, months: d.bowel_months }))),
  F6: d => !!d.abdominal_status && (d.abdominal_status !== "yes" || ((d.abdominal_types || []).length > 0 && tcDur({ since_date: d.abdominal_since_date, years: d.abdominal_years, months: d.abdominal_months }))),
  F7: d => !!d.skin_status && (d.skin_status !== "yes" || ((d.skin_types || []).length > 0 && tcDur({ since_date: d.skin_since_date, years: d.skin_years, months: d.skin_months }))),
  F8a: d => !!d.periorbital_status && (d.periorbital_status !== "yes" || tcDur({ since_date: d.periorbital_since_date, years: d.periorbital_years, months: d.periorbital_months })),
  F8b: d => !!d.facial_oedema_status && (d.facial_oedema_status !== "yes" || tcDur({ since_date: d.facial_oedema_since_date, years: d.facial_oedema_years, months: d.facial_oedema_months })),
  F9: d => !!d.leg_oedema_status && (d.leg_oedema_status !== "yes" || (!!d.leg_oedema_type && tcDur({ since_date: d.leg_oedema_since_date, years: d.leg_oedema_years, months: d.leg_oedema_months }))),
  F10: d => !!d.hair_status && (d.hair_status !== "yes" || ((d.hair_types || []).length > 0 && tcDur({ since_date: d.hair_since_date, years: d.hair_years, months: d.hair_months }))),
  F11: d => !!d.nail_status && (d.nail_status !== "yes" || ((d.nail_types || []).length > 0 && tcDur({ since_date: d.nail_since_date, years: d.nail_years, months: d.nail_months }))),
  F12: d => !!d.hoarseness_status && (d.hoarseness_status !== "yes" || (!!d.hoarseness_pattern && tcDur({ since_date: d.hoarseness_since_date, years: d.hoarseness_years, months: d.hoarseness_months }))),
  F13: d => !!d.muscle_cramp_status && (d.muscle_cramp_status !== "yes" || tcDur({ since_date: d.muscle_cramp_since_date, years: d.muscle_cramp_years, months: d.muscle_cramp_months })),
  F14: d => !!d.muscle_weakness_status && (d.muscle_weakness_status !== "yes" || (!!d.muscle_weakness_location && tcDur({ since_date: d.muscle_weakness_since_date, years: d.muscle_weakness_years, months: d.muscle_weakness_months }))),
  F15a: d => !!d.cognition_status && (d.cognition_status !== "yes" || tcDur({ since_date: d.cognition_since_date, years: d.cognition_years, months: d.cognition_months })),
  F15b: d => !!d.memory_status && (d.memory_status !== "yes" || tcDur({ since_date: d.memory_since_date, years: d.memory_years, months: d.memory_months })),
  F16: d => !!d.depression_status && (d.depression_status !== "yes" || (tcDur({ since_date: d.depression_since_date, years: d.depression_years, months: d.depression_months }) && !!d.depression_treated && !!d.depression_diagnosed)),
  F17: d => !!d.hypersomnia_status && (d.hypersomnia_status !== "yes" || tcDur({ since_date: d.hypersomnia_since_date, years: d.hypersomnia_years, months: d.hypersomnia_months })),
  F18: d => !!d.bradycardia_status && (d.bradycardia_status !== "yes" || tcDur({ since_date: d.bradycardia_since_date, years: d.bradycardia_years, months: d.bradycardia_months })),
  F19: d => !!d.postural_giddiness_status && (d.postural_giddiness_status !== "yes" || (!!d.postural_giddiness_freq && tcDur({ since_date: d.postural_giddiness_since_date, years: d.postural_giddiness_years, months: d.postural_giddiness_months }))),
  F20: d => !!d.blackout_status && (d.blackout_status !== "yes" || (!!d.blackout_count && !!d.blackout_last_date && !!d.blackout_assessed && (d.blackout_assessed !== "yes" || !!d.blackout_dx))),
  F21: d => !!d.hearing_status && (d.hearing_status !== "yes" || (!!d.hearing_type && tcDur({ since_date: d.hearing_since_date, years: d.hearing_years, months: d.hearing_months }))),
  F22: d => !!d.delayed_reflexes_status,
  F23: d => ["pain", "numbness", "tingling"].every(type => {
    const item = (d.carpal_tunnel_data || {})[type] || {};
    if (!item.status) return false;
    if (item.status !== "yes") return true;
    return !!item.side && tcDur(item.since);
  }),
  F24: d => !!d.macroglossia_status,


  H1: d => !!d.dyslipidaemia_status && (d.dyslipidaemia_status !== "yes" || (tcDur({ since_date: d.dyslipidaemia_since_date, years: d.dyslipidaemia_years, months: d.dyslipidaemia_months }) && !!d.dyslipidaemia_on_med && (d.dyslipidaemia_on_med !== "yes" || (d.dyslipidaemia_meds || []).some(m => m.name)))),
  H2: d => !!d.anaemia_status && (d.anaemia_status !== "yes" || !!d.anaemia_type),
  H3: d => !!d.diabetes_status && (d.diabetes_status !== "yes" || (tcDur({ since_date: d.diabetes_since_date, years: d.diabetes_years, months: d.diabetes_months }) && !!d.diabetes_on_med && (d.diabetes_on_med !== "yes" || (d.diabetes_meds || []).some(m => m.name)))),
  H4: d => !!d.pcos_status && (d.pcos_status !== "yes" || (!!d.pcos_label && tcDur({ since_date: d.pcos_since_date, years: d.pcos_years, months: d.pcos_months }) && !!d.pcos_on_med && (d.pcos_on_med !== "yes" || !!d.pcos_med_name))),
  H5: d => !!d.infertility_status,
  H6: d => !!d.depression_dx_status && (d.depression_dx_status !== "yes" || !!d.depression_on_med),
  H7: d => !!d.osteoporosis_status && (d.osteoporosis_status !== "yes" || (!!d.osteoporosis_dexa && !!d.osteoporosis_on_med && (d.osteoporosis_on_med !== "yes" || !!d.osteoporosis_med_name))),
  H8: d => !!d.family_cancer_status && (d.family_cancer_status !== "yes" || (d.family_cancer_types || []).length > 0),
  H9: () => true,
};

const TCREQ_MESSAGES = { select: "Select any one", date: "Enter date", duration: "Enter duration", text: "Enter details" };
const TcMissingPointer = ({ containerRef, active, pageKey }) => {
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
        @keyframes tcreqBounce { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(7px); } }
        .tcreq-arrow { animation: tcreqBounce 0.9s ease-in-out infinite; }
      `}</style>
      <div style={{ position: "absolute", top: Math.max(0, pos.top - 30), left: pos.left, display: "flex", alignItems: "center", gap: 4, zIndex: 5, pointerEvents: "none" }}>
        <div style={{ background: "#c0392b", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap" }}>
          {TCREQ_MESSAGES[pos.type] || "Answer this question"}
        </div>
        <div className="tcreq-arrow" style={{ fontSize: 15, color: "#c0392b" }}>➜</div>
      </div>
    </>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function TcQuestionnaire({ episodeId, patientId, patientDob, patientGender, maritalStatus, hysterectomyDone, onComplete, onBack }) {
  const isFemale = ["female", "Female"].includes(patientGender || "");
  const isMarried = (maritalStatus || "").toLowerCase() === "married";

  const [data, setData]           = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState("");
  const [savedPageId, setSavedPageId] = useState(null);
  const [reviewMode, setReviewMode] = useState(false);
  const pageContentRef = useRef(null);
  const [resumedFrom, setResumedFrom] = useState(false);

  const set = useCallback((key, value) => setData(prev => ({ ...prev, [key]: value })), []);
  const get = useCallback((key, fallback = "") => (data[key] !== undefined ? data[key] : fallback), [data]);

  // ── Dynamic page list ─────────────────────────────────────────────────────
  const allPages = useMemo(() => {
    const hadHysterectomy = get("hysterectomy_status") === "yes" || hysterectomyDone;
    const isPostMeno      = get("menopause_status") === "post";
    const hideInfertility = !isFemale || hadHysterectomy || !isMarried;
    const surgeryDone     = get("ca_surgery_type") !== "" && get("ca_surgery_type") !== "no_surgery";

    return [
      // ── MODULE A ──
      "A3", "A4",

      // ── MODULE D (partial — imaging & FNAC before E) ──
      "D5a",  // Thyroid imaging
      "D5b",  // FNAC / Biopsy

      // ── MODULE E — CA Thyroid specific ──
      "E1",   // Cancer type & year
      "E2",   // Staging & grading
      "E3",   // Surgery type & date
      ...(surgeryDone ? ["E4"] : []),  // Neck dissection (only if surgery done)
      "E5",   // RAI post-surgery
      "E6",   // EBRT
      "E7",   // Targeted therapy / systemic treatment
      "E8",   // Recurrence
      "E9",   // Metastasis
      "E10",  // Tg / TgAb monitoring
      "E11",  // Surveillance imaging

      // ── MODULE B — Female only ──
      ...(isFemale ? [
        "B1",
        "B2",
        ...(!hadHysterectomy ? ["B3"] : []),
        ...(!hadHysterectomy && !isPostMeno ? ["B4"] : []),
        ...(!hadHysterectomy && !isPostMeno && isMarried ? ["B5"] : []),
      ] : []),

      // ── MODULE C ──
      "C1", "C2", "C3", "C4a", "C4b", "C5",

      // ── MODULE D (full labs) ──
      "D1", "D2", "D3", "D4", "D5", "D6", "D7",

      // ── MODULE F — Symptoms ──
      "F1", "F2", "F3", "F4", "F5", "F6", "F7",
      "F8a", "F8b", "F9", "F10", "F11", "F12",
      "F13", "F14", "F15a", "F15b", "F16", "F17",
      "F18", "F19", "F20", "F21", "F22", "F23", "F24",

      // ── MODULE G (no standalone pages — merged into C3) ──

      // ── MODULE H — Unified comorbidities ──
      "H1", "H2", "H3",
      ...(isFemale ? ["H4"] : []),
      ...(!hideInfertility ? ["H5"] : []),
      "H6", "H7", "H8", "H9",
    ];
  }, [data, isFemale, isMarried, hysterectomyDone, patientGender, maritalStatus]);

  const totalPages = allPages.length;
  const pageId     = allPages[currentPage] || "A3";
  const progress   = Math.round(((currentPage + 1) / totalPages) * 100);

  // Blocks proceeding past a screen whose year-of-event field is before
  // the patient's own birth year.
  const dobYear = patientDob ? new Date(patientDob).getFullYear() : null;
  const yearFieldByPage = { B1: "hysterectomy_year", C1: "thyroid_dx_year", C2: "thyroid_tx_year", E1: "ca_dx_year" };
  const currentYearField = yearFieldByPage[pageId];
  const yearInvalid = dobYear && currentYearField && get(currentYearField) && parseInt(get(currentYearField)) < dobYear;

  // Resume exactly where the patient left off, once, after allPages has
  // recomputed with the branching-relevant answers restored.
  useEffect(() => {
    if (!resumedFrom && savedPageId) {
      const idx = allPages.indexOf(savedPageId);
      if (idx > 0) setCurrentPage(idx);
      setResumedFrom(true);
    }
  }, [savedPageId, resumedFrom, allPages]);

  // ── Load draft on mount ───────────────────────────────────────────────────
  const [draftLoadError, setDraftLoadError] = useState('');
  const loadedForRef = useRef(null);
  const loadDraft = useCallback(() => {
    if (patientId && episodeId) {
      setDraftLoadError('');
      conditionAPI.getTcQ(patientId, episodeId)
        .then(d => {
          if (d && Object.keys(d).length) {
            setData(d);
            if (d.current_page) setSavedPageId(d.current_page);
          }
          // If d is empty (a genuinely brand-new episode), data was
          // already reset to {} by the patient/episode-switch check
          // below — nothing further to do here.
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
      // loaded — reset to blank BEFORE loading the new draft. setData(d)
      // above already replaces state wholesale on a successful load, but
      // that only runs when the server returns a non-empty row — a
      // genuinely brand-new/empty episode would skip it and leave the
      // previous patient's data in place otherwise.
      setData({});
      setCurrentPage(0);
      setReviewMode(false);
      setSavedPageId(null);
      setResumedFrom(false);
    }
    loadedForRef.current = key;
    loadDraft();
  }, [patientId, episodeId, loadDraft]);

  // ── Autosave ───────────────────────────────────────────────────────────────
  // Replaces the previous approach of saving (always as a draft) only
  // when the patient clicked Next. Now saves automatically ~1.5s after
  // the patient stops interacting, and separately on page change, so a
  // network outage or a voluntary pause never loses answers.
  const skipFirstAutosave = useRef(true);
  useEffect(() => {
    if (skipFirstAutosave.current) { skipFirstAutosave.current = false; return; }
    if (!patientId || !episodeId) return;
    const t = setTimeout(async () => {
      try {
        await conditionAPI.saveTcQ(patientId, episodeId, { ...data, _draft: true, _currentPage: pageId });
        setSaveMsg("✓ Saved");
      } catch { /* silent — retries on next change */ }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, currentPage]);

  // ── Final submit ─────────────────────────────────────────────────────────
  // NOTE: previously the last "Next" click reused saveDraft(), which
  // always sent _draft:true — the questionnaire could never actually be
  // marked complete (questionnaire_completed_at never got set, so this
  // episode would never reach the doctor's queue). Separated out here.
  const submitFinal = useCallback(async () => {
    if (!patientId || !episodeId) return;
    setSaving(true);
    try {
      await conditionAPI.saveTcQ(patientId, episodeId, { ...data, _draft: false });
      onComplete && onComplete(data);
    } catch { setSaveMsg("Submission failed. Please try again."); }
    finally { setSaving(false); }
  }, [data, patientId, episodeId, onComplete]);

  // Every question needs an answer before the questionnaire can actually
  // be submitted — finds the first incomplete page (in display order, so
  // it respects branching) and routes there instead of submitting.
  const handleSubmit = useCallback(() => {
    const incompleteIdx = allPages.findIndex(id => { const v = TC_PAGE_VALIDATORS[id]; return v ? !v(data) : false; });
    if (incompleteIdx !== -1) {
      setReviewMode(true);
      setCurrentPage(incompleteIdx);
      setSaveMsg("Please answer this question before submitting — some questions were left incomplete.");
      return;
    }
    setReviewMode(false);
    submitFinal();
  }, [allPages, data, submitFinal]);

  // Single source of truth for "what's still incomplete" — recomputed
  // live from data on every render.
  const incompleteList = reviewMode
    ? allPages.map((id, idx) => ({ id, idx })).filter(({ id }) => { const v = TC_PAGE_VALIDATORS[id]; return v ? !v(data) : false; })
    : [];

  const next = useCallback(() => {
    if (yearInvalid) return;
    if (reviewMode) {
      const leavingValidator = TC_PAGE_VALIDATORS[pageId];
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
  }, [currentPage, totalPages, handleSubmit, yearInvalid, reviewMode, incompleteList, pageId, data]);

  const prev = useCallback(() => {
    if (currentPage > 0) setCurrentPage(p => p - 1);
  }, [currentPage]);

  // ── Render page ───────────────────────────────────────────────────────────
  const renderPage = () => {
    switch (pageId) {

      // ══════════════════════════════════════════════════════
      // MODULE A — DEMOGRAPHICS
      // ══════════════════════════════════════════════════════

      // ══════════════════════════════════════════════════════
      // A1 (DOB) and A2 (biological sex) REMOVED — sourced from the
      // patients table only (patientDob, patientGender props), not
      // re-collected here. See props at top of component.
      // ══════════════════════════════════════════════════════

      case "A3": return (
        <div>
          <h3>What is your marital status?</h3>
          <TcRadioGroup value={get("marital_status")} onChange={v => set("marital_status", v)} options={[{ value: "unmarried", label: "Unmarried" }, { value: "married", label: "Married" }, { value: "divorced", label: "Divorced" }, { value: "widowed", label: "Widowed" }]} />
          <TcOutputBox text={get("marital_status") ? get("marital_status").charAt(0).toUpperCase() + get("marital_status").slice(1) : ""} />
        </div>
      );

      case "A4": return (
        <div>
          <h3>What is your occupation or profession?</h3>
          <TcRadioGroup value={get("occupation")} onChange={v => set("occupation", v)} options={[
            { value: "teacher", label: "Teacher" }, { value: "singer", label: "Singer" },
            { value: "actor", label: "Actor" }, { value: "vocal_instructor", label: "Vocal instructor" },
            { value: "call_centre", label: "Call centre agent" }, { value: "sales", label: "Sales professional" },
            { value: "other", label: "Other" },
          ]} />
          {get("occupation") === "other" && (
            <TcField label="Please specify"><TcInput value={get("occupation_other")} onChange={v => set("occupation_other", v)} placeholder="Your occupation" /></TcField>
          )}
          <TcOutputBox text={get("occupation") ? `Occupation: ${get("occupation") === "other" ? get("occupation_other") : get("occupation").replace(/_/g, " ")}` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE D (partial) — IMAGING & FNAC (before E)
      // ══════════════════════════════════════════════════════

      case "D5a": return (
        <div>
          <h3>Have you had a thyroid ultrasound or any other thyroid imaging done?</h3>
          <TcYesNoUnsure value={get("imaging_status")} onChange={v => set("imaging_status", v)} />
          {get("imaging_status") === "yes" && (
            <TcSectionCard title="Imaging details">
              <TcField label="Type (select all that apply)">
                <TcCheckGroup values={get("imaging_types", [])} onChange={v => set("imaging_types", v)} options={[
                  { value: "usg_thyroid", label: "USG thyroid" }, { value: "usg_neck", label: "USG neck" },
                  { value: "thyroid_scan", label: "Thyroid scan" }, { value: "ct_neck", label: "CT neck" }, { value: "other", label: "Other" },
                ]} />
              </TcField>
              <TcField label="Date of imaging"><TcInput type="date" value={get("imaging_date")} onChange={v => set("imaging_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
              <TcField label="Key findings (optional)"><TcInput value={get("imaging_finding")} onChange={v => set("imaging_finding", v)} placeholder="e.g. Right lobe nodule 2.5 cm" /></TcField>
              <TcField label="Upload report (optional)">
                <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload imaging report (PDF / JPG / PNG)</div>
              </TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("imaging_status") === "yes" && get("imaging_types", []).length ? `${get("imaging_types", []).map(t => t.replace(/_/g, " ")).join(", ")} done on ${fmtDate(get("imaging_date"))}${get("imaging_finding") ? " — " + get("imaging_finding") : ""}` : get("imaging_status") === "no" ? "No thyroid imaging done." : ""} />
        </div>
      );

      case "D5b": return (
        <div>
          <h3>Have you undergone a thyroid FNAC or Biopsy?</h3>
          <TcYesNoUnsure value={get("cytology_status")} onChange={v => set("cytology_status", v)} />
          {get("cytology_status") === "yes" && (
            <TcSectionCard title="FNAC / Biopsy details">
              <TcField label="Type (select all that apply)">
                <TcCheckGroup values={get("cytology_types", [])} onChange={v => set("cytology_types", v)} options={[
                  { value: "fnac", label: "FNAC (Fine needle aspiration cytology)" },
                  { value: "biopsy", label: "Core biopsy" },
                  { value: "other", label: "Other" },
                ]} />
              </TcField>
              <TcField label="Date"><TcInput type="date" value={get("cytology_date")} onChange={v => set("cytology_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
              <TcField label="Bethesda / Result category">
                <TcSelect value={get("cytology_result")} onChange={v => set("cytology_result", v)} placeholder="Select result" options={[
                  { value: "bethesda_1", label: "Bethesda I — Non-diagnostic" },
                  { value: "bethesda_2", label: "Bethesda II — Benign" },
                  { value: "bethesda_3", label: "Bethesda III — Atypia of undetermined significance" },
                  { value: "bethesda_4", label: "Bethesda IV — Follicular neoplasm" },
                  { value: "bethesda_5", label: "Bethesda V — Suspicious for malignancy" },
                  { value: "bethesda_6", label: "Bethesda VI — Malignant" },
                  { value: "malignant", label: "Malignant (not Bethesda classified)" },
                  { value: "not_known", label: "Not known" },
                ]} />
              </TcField>
              <TcField label="Upload report (optional)">
                <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload FNAC / biopsy report</div>
              </TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("cytology_status") === "yes" && get("cytology_types", []).length ? `${get("cytology_types", []).join(" / ").toUpperCase()} done on ${fmtDate(get("cytology_date"))}${get("cytology_result") ? " — " + get("cytology_result").replace(/_/g, " ") : ""}` : get("cytology_status") === "no" ? "No FNAC or biopsy done." : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE E — CA THYROID SPECIFIC
      // ══════════════════════════════════════════════════════

      case "E1": return (
        <div>
          <h3>What type of thyroid cancer have you been diagnosed with?</h3>
          <TcRadioGroup value={get("ca_thyroid_type")} onChange={v => set("ca_thyroid_type", v)} options={[
            { value: "ptc", label: "Papillary thyroid carcinoma (PTC)" },
            { value: "ftc", label: "Follicular thyroid carcinoma (FTC)" },
            { value: "mtc", label: "Medullary thyroid carcinoma (MTC)" },
            { value: "anaplastic", label: "Anaplastic thyroid carcinoma" },
            { value: "hurthle", label: "Hurthle cell carcinoma" },
            { value: "other", label: "Other" },
            { value: "not_known", label: "Not known" },
          ]} />
          {get("ca_thyroid_type") === "other" && (
            <TcField label="Please specify"><TcInput value={get("ca_thyroid_type_other")} onChange={v => set("ca_thyroid_type_other", v)} placeholder="Cancer type" /></TcField>
          )}
          <TcField label="Year of diagnosis">
            <TcYearInput value={get("ca_dx_year")} onChange={v => set("ca_dx_year", v)} dob={patientDob} placeholder="e.g. 2021" />
          </TcField>
          <TcOutputBox text={get("ca_thyroid_type") && get("ca_dx_year") ? `K/c/o ${get("ca_thyroid_type") === "other" ? get("ca_thyroid_type_other") : get("ca_thyroid_type").toUpperCase()} diagnosed in ${get("ca_dx_year")}.` : ""} />
        </div>
      );

      case "E2": return (
        <div>
          <h3>Has your thyroid cancer been staged or graded by your doctor?</h3>
          <TcYesNoUnsure value={get("ca_staged")} onChange={v => set("ca_staged", v)} />
          {get("ca_staged") === "yes" && (
            <TcSectionCard title="Staging & grading">
              <TcField label="Stage">
                <TcRadioGroup value={get("ca_stage")} onChange={v => set("ca_stage", v)} inline options={[
                  { value: "I", label: "Stage I" }, { value: "II", label: "Stage II" },
                  { value: "III", label: "Stage III" }, { value: "IV", label: "Stage IV" },
                  { value: "not_known", label: "Not known" },
                ]} />
              </TcField>
              <TcField label="Grade">
                <TcRadioGroup value={get("ca_grade")} onChange={v => set("ca_grade", v)} inline options={[
                  { value: "low", label: "Low grade" }, { value: "intermediate", label: "Intermediate grade" },
                  { value: "high", label: "High grade" }, { value: "not_known", label: "Not known" },
                ]} />
              </TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("ca_staged") === "yes" && get("ca_stage") ? `${get("ca_stage") !== "not_known" ? "Stage " + get("ca_stage") : "Stage not known"}${get("ca_grade") && get("ca_grade") !== "not_known" ? ", " + get("ca_grade") + " grade" : ""} thyroid cancer.` : ""} />
        </div>
      );

      case "E3": return (
        <div>
          <h3>What surgery was performed for your thyroid cancer?</h3>
          <TcRadioGroup value={get("ca_surgery_type")} onChange={v => set("ca_surgery_type", v)} options={[
            { value: "total_thyroidectomy", label: "Total thyroidectomy" },
            { value: "near_total_thyroidectomy", label: "Near-total thyroidectomy" },
            { value: "hemithyroidectomy", label: "Hemithyroidectomy (one lobe removed)" },
            { value: "isthmusectomy", label: "Isthmusectomy" },
            { value: "no_surgery", label: "No surgery done" },
            { value: "other", label: "Other" },
          ]} />
          {get("ca_surgery_type") === "other" && (
            <TcField label="Please specify"><TcInput value={get("ca_surgery_type_other")} onChange={v => set("ca_surgery_type_other", v)} placeholder="Surgery type" /></TcField>
          )}
          {get("ca_surgery_type") && get("ca_surgery_type") !== "no_surgery" && (
            <TcSectionCard title="Surgery details">
              <TcField label="Date of surgery"><TcInput type="date" value={get("ca_surgery_date")} onChange={v => set("ca_surgery_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
              <TcField label="Side (if applicable)">
                <TcRadioGroup value={get("ca_surgery_side")} onChange={v => set("ca_surgery_side", v)} inline options={[
                  { value: "left", label: "Left lobe" }, { value: "right", label: "Right lobe" },
                  { value: "both", label: "Both lobes" }, { value: "na", label: "Not applicable" },
                ]} />
              </TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("ca_surgery_type") === "no_surgery" ? "No surgery done for thyroid cancer." : get("ca_surgery_type") ? `H/o ${get("ca_surgery_type") === "other" ? get("ca_surgery_type_other") : get("ca_surgery_type").replace(/_/g, " ")}${get("ca_surgery_date") ? " on " + fmtDate(get("ca_surgery_date")) : ""}.` : ""} />
        </div>
      );

      case "E4": return (
        <div>
          <h3>Was a neck dissection (lymph node removal) also performed?</h3>
          <TcYesNoUnsure value={get("neck_dissection_status")} onChange={v => set("neck_dissection_status", v)} />
          {get("neck_dissection_status") === "yes" && (
            <TcSectionCard title="Neck dissection details">
              <TcField label="Type">
                <TcRadioGroup value={get("neck_dissection_type")} onChange={v => set("neck_dissection_type", v)} options={[
                  { value: "central", label: "Central neck dissection" },
                  { value: "lateral", label: "Lateral neck dissection" },
                  { value: "both", label: "Both central and lateral" },
                  { value: "not_known", label: "Not known" },
                ]} />
              </TcField>
              <TcField label="Side">
                <TcRadioGroup value={get("neck_dissection_side")} onChange={v => set("neck_dissection_side", v)} inline options={[
                  { value: "left", label: "Left" }, { value: "right", label: "Right" }, { value: "bilateral", label: "Bilateral" },
                ]} />
              </TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("neck_dissection_status") === "yes" && get("neck_dissection_type") ? `H/o ${get("neck_dissection_type").replace(/_/g, " ")} neck dissection${get("neck_dissection_side") ? " (" + get("neck_dissection_side") + ")" : ""} at the time of surgery.` : ""} />
        </div>
      );

      case "E5": return (
        <div>
          <h3>Have you received Radioactive Iodine (RAI / I-131) therapy after surgery?</h3>
          <TcYesNoUnsure value={get("rai_post_surgery_status")} onChange={v => set("rai_post_surgery_status", v)} />
          {get("rai_post_surgery_status") === "yes" && (
            <TcSectionCard title="RAI therapy details">
              <TcField label="Number of doses / cycles"><TcInput type="number" value={get("rai_cycles")} onChange={v => set("rai_cycles", v)} min={1} placeholder="e.g. 2" /></TcField>
              <TcField label="Total cumulative dose (mCi — optional)"><TcInput type="number" value={get("rai_total_dose_mci")} onChange={v => set("rai_total_dose_mci", v)} placeholder="e.g. 150" /></TcField>
              <TcField label="Date of most recent RAI"><TcInput type="date" value={get("rai_last_date")} onChange={v => set("rai_last_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
              <TcField label="Purpose of RAI">
                <TcRadioGroup value={get("rai_purpose")} onChange={v => set("rai_purpose", v)} options={[
                  { value: "remnant_ablation", label: "Remnant ablation" },
                  { value: "metastasis_treatment", label: "Treatment of metastases" },
                  { value: "both", label: "Both" },
                  { value: "not_known", label: "Not known" },
                ]} />
              </TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("rai_post_surgery_status") === "yes" && get("rai_cycles") ? `Received ${get("rai_cycles")} cycle${get("rai_cycles") > 1 ? "s" : ""} of RAI therapy${get("rai_total_dose_mci") ? " (total " + get("rai_total_dose_mci") + " mCi)" : ""}${get("rai_last_date") ? ", last on " + fmtDate(get("rai_last_date")) : ""}${get("rai_purpose") ? ", for " + get("rai_purpose").replace(/_/g, " ") : ""}.` : ""} />
        </div>
      );

      case "E6": return (
        <div>
          <h3>Have you received external beam radiation therapy (EBRT) for your thyroid cancer?</h3>
          <TcYesNoUnsure value={get("ebrt_status")} onChange={v => set("ebrt_status", v)} />
          {get("ebrt_status") === "yes" && (
            <TcSectionCard title="EBRT details">
              <TcField label="Region treated (select all that apply)">
                <TcCheckGroup values={get("ebrt_regions", [])} onChange={v => set("ebrt_regions", v)} options={[
                  { value: "neck", label: "Neck" }, { value: "mediastinum", label: "Mediastinum" }, { value: "other", label: "Other" },
                ]} />
              </TcField>
              {get("ebrt_regions", []).includes("other") && (
                <TcField label="Please specify"><TcInput value={get("ebrt_other")} onChange={v => set("ebrt_other", v)} placeholder="Region treated" /></TcField>
              )}
              <TcField label="Date of treatment"><TcInput type="date" value={get("ebrt_date")} onChange={v => set("ebrt_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("ebrt_status") === "yes" && get("ebrt_regions", []).length ? `H/o EBRT to ${get("ebrt_regions", []).join(" and ")}${get("ebrt_date") ? " in " + fmtDate(get("ebrt_date")) : ""}.` : ""} />
        </div>
      );

      case "E7": return (
        <div>
          <h3>Have you received any targeted therapy or systemic treatment for thyroid cancer?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>e.g. Sorafenib, Lenvatinib, Vandetanib, Cabozantinib, Selpercatinib, Pralsetinib</p>
          <TcYesNoUnsure value={get("targeted_tx_status")} onChange={v => set("targeted_tx_status", v)} />
          {get("targeted_tx_status") === "yes" && (
            <TcSectionCard title="Targeted therapy details">
              <TcField label="Drug name"><TcInput value={get("targeted_tx_name")} onChange={v => set("targeted_tx_name", v)} placeholder="e.g. Lenvatinib" /></TcField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <TcField label="Dose"><TcInput type="number" value={get("targeted_tx_dose")} onChange={v => set("targeted_tx_dose", v)} placeholder="e.g. 24" /></TcField>
                <TcField label="Unit"><TcSelect value={get("targeted_tx_unit")} onChange={v => set("targeted_tx_unit", v)} options={[{ value: "mg", label: "mg" }, { value: "mg/m2", label: "mg/m²" }]} /></TcField>
              </div>
              <TcField label="Frequency"><TcInput type="number" value={get("targeted_tx_freq")} onChange={v => set("targeted_tx_freq", v)} placeholder="Times per day" /></TcField>
              <TcField label="Currently ongoing?">
                <TcYesNo value={get("targeted_tx_ongoing")} onChange={v => set("targeted_tx_ongoing", v)} />
              </TcField>
              {get("targeted_tx_ongoing") === "no" && (
                <TcField label="Reason for stopping">
                  <TcRadioGroup value={get("targeted_tx_stop_reason")} onChange={v => set("targeted_tx_stop_reason", v)} options={[
                    { value: "completed", label: "Completed course" }, { value: "side_effects", label: "Side effects" },
                    { value: "progression", label: "Disease progression" }, { value: "other", label: "Other" },
                  ]} />
                </TcField>
              )}
            </TcSectionCard>
          )}
          <TcOutputBox text={get("targeted_tx_status") === "yes" && get("targeted_tx_name") ? `On Tab. ${get("targeted_tx_name")} (${get("targeted_tx_dose") || "?"} ${get("targeted_tx_unit") || "mg"}) — currently ${get("targeted_tx_ongoing") === "yes" ? "ongoing" : "stopped"}.` : ""} />
        </div>
      );

      case "E8": return (
        <div>
          <h3>Has your thyroid cancer recurred after initial treatment?</h3>
          <TcYesNoUnsure value={get("recurrence_status")} onChange={v => set("recurrence_status", v)} />
          {get("recurrence_status") === "yes" && (
            <TcSectionCard title="Recurrence details">
              <TcField label="Site(s) of recurrence (select all that apply)">
                <TcCheckGroup values={get("recurrence_sites", [])} onChange={v => set("recurrence_sites", v)} options={[
                  { value: "local_thyroid_bed", label: "Local (thyroid bed)" },
                  { value: "regional_lymph_nodes", label: "Regional (lymph nodes)" },
                  { value: "distant_metastases", label: "Distant metastases" },
                  { value: "not_known", label: "Not known" },
                ]} />
              </TcField>
              <TcField label="Date recurrence detected"><TcInput type="date" value={get("recurrence_date")} onChange={v => set("recurrence_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("recurrence_status") === "yes" && get("recurrence_sites", []).length ? `Recurrence detected at ${get("recurrence_sites", []).map(s => s.replace(/_/g, " ")).join(" and ")}${get("recurrence_date") ? " in " + fmtDate(get("recurrence_date")) : ""}.` : ""} />
        </div>
      );

      case "E9": return (
        <div>
          <h3>Has your thyroid cancer spread to any distant sites? (metastases)</h3>
          <TcYesNoUnsure value={get("metastasis_status")} onChange={v => set("metastasis_status", v)} />
          {get("metastasis_status") === "yes" && (
            <TcSectionCard title="Metastasis details">
              <TcField label="Site(s) of metastases (select all that apply)">
                <TcCheckGroup values={get("metastasis_sites", [])} onChange={v => set("metastasis_sites", v)} options={[
                  { value: "lung", label: "Lung" }, { value: "bone", label: "Bone" },
                  { value: "brain", label: "Brain" }, { value: "liver", label: "Liver" },
                  { value: "other", label: "Other" },
                ]} />
              </TcField>
              {get("metastasis_sites", []).includes("other") && (
                <TcField label="Please specify"><TcInput value={get("metastasis_other")} onChange={v => set("metastasis_other", v)} placeholder="Site of metastasis" /></TcField>
              )}
              <TcField label="Date first detected"><TcInput type="date" value={get("metastasis_date")} onChange={v => set("metastasis_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("metastasis_status") === "yes" && get("metastasis_sites", []).length ? `Distant metastases to ${get("metastasis_sites", []).join(" and ")}${get("metastasis_date") ? " first detected in " + fmtDate(get("metastasis_date")) : ""}.` : ""} />
        </div>
      );

      case "E10": return (
        <div>
          <h3>Have you had a Thyroglobulin (Tg) or Thyroglobulin antibody (TgAb) test done after surgery?</h3>
          <TcYesNoUnsure value={get("tg_status")} onChange={v => set("tg_status", v)} />
          {get("tg_status") === "yes" && (
            <TcSectionCard title="Tg / TgAb results">
              <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Either or both can be filled — neither is mandatory</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <TcField label="Tg value (ng/mL)"><TcInput type="number" value={get("tg_value")} onChange={v => set("tg_value", v)} placeholder="e.g. 0.2" /></TcField>
                <TcField label="Tg date"><TcInput type="date" value={get("tg_date")} onChange={v => set("tg_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
                <TcField label="TgAb value"><TcInput type="number" value={get("tgab_value")} onChange={v => set("tgab_value", v)} placeholder="e.g. 15" /></TcField>
              </div>
              <TcField label="TgAb date"><TcInput type="date" value={get("tgab_date")} onChange={v => set("tgab_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
              <TcField label="Was this a stimulated Tg? (after TSH stimulation or thyroid hormone withdrawal)">
                <TcRadioGroup value={get("tg_stimulated")} onChange={v => set("tg_stimulated", v)} inline options={[
                  { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not_known", label: "Not known" },
                ]} />
              </TcField>
              <TcField label="Upload report (optional)">
                <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload Tg / TgAb report</div>
              </TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("tg_status") === "yes" && get("tg_value") ? `Tg — ${get("tg_value")} ng/mL (${fmtDate(get("tg_date"))}), stimulated: ${get("tg_stimulated") || "not known"}.${get("tgab_value") ? ` TgAb — ${get("tgab_value")} (${fmtDate(get("tgab_date"))}).` : ""}` : ""} />
        </div>
      );

      case "E11": return (
        <div>
          <h3>Have you had any surveillance imaging done after treatment?</h3>
          <TcYesNoUnsure value={get("surveillance_status")} onChange={v => set("surveillance_status", v)} />
          {get("surveillance_status") === "yes" && (
            <TcSectionCard title="Surveillance imaging details">
              <TcField label="Type (select all that apply)">
                <TcCheckGroup values={get("surveillance_types", [])} onChange={v => set("surveillance_types", v)} options={[
                  { value: "whole_body_rai_scan", label: "Whole body RAI scan" },
                  { value: "usg_neck", label: "USG neck" },
                  { value: "ct_scan", label: "CT scan" },
                  { value: "pet_ct", label: "PET-CT scan" },
                  { value: "mri", label: "MRI" },
                  { value: "other", label: "Other" },
                ]} />
              </TcField>
              <TcField label="Date of most recent scan"><TcInput type="date" value={get("surveillance_date")} onChange={v => set("surveillance_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
              <TcField label="Findings">
                <TcRadioGroup value={get("surveillance_findings")} onChange={v => set("surveillance_findings", v)} options={[
                  { value: "no_residual", label: "No residual disease" },
                  { value: "residual_disease", label: "Residual disease present" },
                  { value: "recurrence_detected", label: "Recurrence detected" },
                  { value: "unsure", label: "Unsure" },
                ]} />
              </TcField>
              <TcField label="Upload report (optional)">
                <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload surveillance imaging report</div>
              </TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("surveillance_status") === "yes" && get("surveillance_types", []).length ? `${get("surveillance_types", []).map(t => t.replace(/_/g, " ")).join(", ")} done${get("surveillance_date") ? " on " + fmtDate(get("surveillance_date")) : ""}${get("surveillance_findings") ? " — " + get("surveillance_findings").replace(/_/g, " ") : ""}.` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE B — MENSTRUAL / PREGNANCY (Female only)
      // ══════════════════════════════════════════════════════

      case "B1": return (
        <div>
          <h3>Have you had a hysterectomy (surgical removal of the uterus)?</h3>
          <TcYesNoUnsure value={get("hysterectomy_status")} onChange={v => set("hysterectomy_status", v)} />
          {get("hysterectomy_status") === "yes" && (
            <TcSectionCard title="Hysterectomy details">
              <TcField label="How well do you know the date of surgery?">
                <TcRadioGroup value={get("hysterectomy_date_precision", "full")} onChange={v => set("hysterectomy_date_precision", v)} inline options={[
                  { value: "full", label: "Exact date" }, { value: "month_year", label: "Month & year" }, { value: "year_only", label: "Year only" },
                ]} />
              </TcField>
              {get("hysterectomy_date_precision", "full") === "full" && (
                <TcField label="Date of surgery"><TcInput type="date" value={get("hysterectomy_date")} onChange={v => set("hysterectomy_date", v)} max={new Date().toISOString().split("T")[0]} min={patientDob || undefined} /></TcField>
              )}
              {get("hysterectomy_date_precision") === "month_year" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <TcField label="Month"><TcSelect value={get("hysterectomy_month")} onChange={v => set("hysterectomy_month", v)} placeholder="Month" options={["1","2","3","4","5","6","7","8","9","10","11","12"].map((m,i) => ({ value: m, label: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i] }))} /></TcField>
                  <TcField label="Year"><TcYearInput value={get("hysterectomy_year")} onChange={v => set("hysterectomy_year", v)} dob={patientDob} placeholder="e.g. 2019" /></TcField>
                </div>
              )}
              {get("hysterectomy_date_precision") === "year_only" && (
                <TcField label="Year"><TcYearInput value={get("hysterectomy_year")} onChange={v => set("hysterectomy_year", v)} dob={patientDob} placeholder="e.g. 2019" /></TcField>
              )}
              <TcField label="Reason">
                <TcRadioGroup value={get("hysterectomy_reason")} onChange={v => set("hysterectomy_reason", v)} options={[
                  { value: "excessive_bleeding", label: "Excessive bleeding" },
                  { value: "prolapse", label: "Prolapse of uterus" },
                  { value: "cancer", label: "Cancer of uterus / cervix" },
                  { value: "other", label: "Others" },
                ]} />
              </TcField>
              {get("hysterectomy_reason") === "other" && (
                <TcField label="Please specify"><TcInput value={get("hysterectomy_reason_other")} onChange={v => set("hysterectomy_reason_other", v)} /></TcField>
              )}
            </TcSectionCard>
          )}
          <TcOutputBox text={get("hysterectomy_status") === "yes" ? `H/o Hysterectomy for "${get("hysterectomy_reason") === "other" ? get("hysterectomy_reason_other") : get("hysterectomy_reason")?.replace(/_/g, " ")}"${get("hysterectomy_date_precision", "full") === "full" && get("hysterectomy_date") ? " on " + fmtDate(get("hysterectomy_date")) : get("hysterectomy_date_precision") === "month_year" && get("hysterectomy_month") && get("hysterectomy_year") ? ` in ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][get("hysterectomy_month")-1]} ${get("hysterectomy_year")}` : get("hysterectomy_date_precision") === "year_only" && get("hysterectomy_year") ? ` in ${get("hysterectomy_year")}` : ""}.` : ""} />
        </div>
      );

      case "B2": return (
        <div>
          <h3>What is your menopausal status?</h3>
          <TcRadioGroup value={get("menopause_status")} onChange={v => set("menopause_status", v)} options={[
            { value: "pre", label: "Pre-menopausal" },
            { value: "peri", label: "Peri-menopausal" },
            { value: "post", label: "Post-menopausal" },
          ]} />
          {get("menopause_status") === "post" && (
            <TcField label="How many years since menopause?">
              <TcInput type="number" value={get("menopause_years_ago")} onChange={v => set("menopause_years_ago", v)} min={0} placeholder="e.g. 3" />
            </TcField>
          )}
          <TcOutputBox text={get("menopause_status") === "post" ? `Post-menopausal status since last ${get("menopause_years_ago") || "?"} year${get("menopause_years_ago") != 1 ? "s" : ""}.` : ""} />
        </div>
      );

      case "B3": return (
        <div>
          <h3>Have you noticed any changes in your menstrual cycle?</h3>
          <TcYesNoUnsure value={get("menstrual_change_status")} onChange={v => set("menstrual_change_status", v)} />
          {get("menstrual_change_status") === "yes" && (
            <TcSectionCard title="Menstrual change details">
              <TcField label="Pattern"><TcRadioGroup value={get("menstrual_pattern")} onChange={v => set("menstrual_pattern", v)} inline options={[{ value: "regular", label: "Regular" }, { value: "irregular", label: "Irregular" }]} /></TcField>
              <TcField label="Flow (select all that apply)">
                <TcCheckGroup values={get("menstrual_flow", [])} onChange={v => set("menstrual_flow", v)} options={[
                  { value: "heavy", label: "Heavy" }, { value: "scanty", label: "Scanty" },
                  { value: "absent", label: "Absent" }, { value: "prolonged", label: "Prolonged" },
                ]} />
              </TcField>
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("menstrual_since_date")} onSinceDate={v => set("menstrual_since_date", v)} years={get("menstrual_years")} onYears={v => set("menstrual_years", v)} months={get("menstrual_months")} onMonths={v => set("menstrual_months", v)} />
            </TcSectionCard>
          )}
          <TcOutputBox text={get("menstrual_change_status") === "yes" && get("menstrual_pattern") ? `${get("menstrual_pattern")} ${get("menstrual_flow", []).join(", ")} flow since last ${durationText(get("menstrual_years"), get("menstrual_months"), get("menstrual_since_date"))}.` : ""} />
        </div>
      );

      case "B4": return (
        <div>
          <h3>What was the date of your last menstrual period (LMP)?</h3>
          <TcField label="LMP date"><TcInput type="date" value={get("lmp_date")} onChange={v => set("lmp_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
          <TcOutputBox text={get("lmp_date") ? `LMP: ${fmtDate(get("lmp_date"))}` : ""} />
        </div>
      );

      case "B5": {
        const lmpDate = get("lmp_date");
        const lmpDaysAgo = lmpDate ? Math.floor((Date.now() - new Date(lmpDate)) / 86400000) : 0;
        if (lmpDaysAgo < 31) return (
          <div>
            <h3>Are you currently pregnant or trying to conceive?</h3>
            <p style={{ fontSize: 13, color: "#888" }}>LMP was less than 31 days ago — pregnancy question not applicable.</p>
          </div>
        );
        return (
          <div>
            <h3>Are you currently pregnant or trying to conceive?</h3>
            <TcYesNoUnsure value={get("pregnancy_status")} onChange={v => { set("pregnancy_status", v); set("edd_date", v === "yes" ? calcEDD(lmpDate, true) : ""); }} />
            {get("pregnancy_status") === "yes" && (
              <TcSectionCard title="Pregnancy details">
                <p style={{ fontSize: 13, color: "#555" }}>Expected Date of Delivery (EDD): <strong>{calcEDD(lmpDate)}</strong></p>
              </TcSectionCard>
            )}
            <TcOutputBox text={get("pregnancy_status") === "yes" ? `Currently pregnant. EDD: ${calcEDD(lmpDate)}.` : ""} />
          </div>
        );
      }

      // ══════════════════════════════════════════════════════
      // MODULE C — THYROID DISEASE & MEDICATION HISTORY
      // ══════════════════════════════════════════════════════

      case "C1": return (
        <div>
          <h3>Have you been previously diagnosed with a thyroid condition?</h3>
          <TcYesNoUnsure value={get("thyroid_dx_status")} onChange={v => set("thyroid_dx_status", v)} />
          {get("thyroid_dx_status") === "yes" && (
            <TcSectionCard title="Prior thyroid diagnosis">
              <TcField label="Condition">
                <TcRadioGroup value={get("thyroid_dx_type")} onChange={v => set("thyroid_dx_type", v)} options={[
                  { value: "hypothyroidism", label: "Hypothyroidism" }, { value: "hyperthyroidism", label: "Hyperthyroidism" },
                  { value: "goitre", label: "Goitre" }, { value: "thyroid_nodule", label: "Thyroid nodule" },
                  { value: "thyroid_cancer", label: "Thyroid cancer" }, { value: "other", label: "Other" },
                ]} />
              </TcField>
              <TcField label="Year of diagnosis"><TcYearInput value={get("thyroid_dx_year")} onChange={v => set("thyroid_dx_year", v)} dob={patientDob} placeholder="e.g. 2018" /></TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("thyroid_dx_status") === "yes" && get("thyroid_dx_type") ? `K/c/o ${get("thyroid_dx_type").replace(/_/g, " ")} since ${get("thyroid_dx_year") || "?"}.` : ""} />
        </div>
      );

      case "C2": return (
        <div>
          <h3>Have you had any thyroid surgery or radioiodine (RAI) therapy in the past?</h3>
          <TcYesNoUnsure value={get("thyroid_tx_status")} onChange={v => set("thyroid_tx_status", v)} />
          {get("thyroid_tx_status") === "yes" && (
            <TcSectionCard title="Prior thyroid treatment">
              <TcField label="Type">
                <TcRadioGroup value={get("thyroid_tx_type")} onChange={v => set("thyroid_tx_type", v)} options={[
                  { value: "surgery", label: "Surgery" }, { value: "rai", label: "RAI (Radioiodine)" }, { value: "both", label: "Both" },
                ]} />
              </TcField>
              <TcField label="Year"><TcYearInput value={get("thyroid_tx_year")} onChange={v => set("thyroid_tx_year", v)} dob={patientDob} placeholder="e.g. 2020" /></TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("thyroid_tx_status") === "yes" && get("thyroid_tx_type") ? `H/o ${get("thyroid_tx_type")} for thyroid in ${get("thyroid_tx_year") || "?"}.` : ""} />
        </div>
      );

      case "C3": return (() => {
        const hadHysterectomy = get("hysterectomy_status") === "yes" || hysterectomyDone;
        const isPostMeno = get("menopause_status") === "post";
        const LT4_COLOR = { bg: "#fef5ef", border: "#f0c8a8", text: "#d35400" };
        const LT3_COLOR = { bg: "#f6f0fc", border: "#c9b3e8", text: "#6b3fa0" };
        const renderMedCol = (which) => {
          const isLT4 = which === "lt4";
          const c = isLT4 ? LT4_COLOR : LT3_COLOR;
          const timingField = isLT4 ? "thyroid_med_timing" : "liothyronine_timing";
          const complianceField = isLT4 ? "thyroid_med_compliance" : "liothyronine_compliance";
          const sinceYearsField = isLT4 ? "thyroid_med_since_years" : "liothyronine_since_years";
          const sinceMonthsField = isLT4 ? "thyroid_med_since_months" : "liothyronine_since_months";
          const dcField = isLT4 ? "dose_changed_status" : "liothyronine_dose_changed_status";
          const dcDateField = isLT4 ? "dose_last_changed_date" : "liothyronine_dose_changed_date";
          const dcReasonField = isLT4 ? "dose_change_reason" : "liothyronine_dose_change_reason";
          return (
            <div style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 10 }}>
                {isLT4 ? "Levothyroxine (LT4)" : "Liothyronine (LT3)"}
              </div>
              <TcField label="Timing">
                <TcRadioGroup value={get(timingField)} onChange={v => set(timingField, v)} options={[
                  { value: "before_breakfast", label: "Before breakfast" },
                  { value: "after_breakfast", label: "After breakfast" },
                  { value: "bedtime", label: "Bedtime" },
                ]} />
              </TcField>
              <TcField label="Compliance">
                <TcRadioGroup value={get(complianceField)} onChange={v => set(complianceField, v)} inline options={[
                  { value: "regular", label: "Regular" }, { value: "irregular", label: "Irregular" }, { value: "skips_sometimes", label: "Skips sometimes" },
                ]} />
              </TcField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <TcField label="Taking since (years)"><TcInput type="number" value={get(sinceYearsField)} onChange={v => set(sinceYearsField, v)} min={0} placeholder="0" /></TcField>
                <TcField label="Taking since (months)"><TcInput type="number" value={get(sinceMonthsField)} onChange={v => set(sinceMonthsField, v)} min={0} max={11} placeholder="0" /></TcField>
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Dose changed recently?</div>
                <TcYesNoUnsure value={get(dcField)} onChange={v => set(dcField, v)} />
                {get(dcField) === "yes" && (
                  <TcSectionCard title="Dose change details">
                    <TcField label="Date of last dose change"><TcInput type="date" value={get(dcDateField)} onChange={v => set(dcDateField, v)} max={new Date().toISOString().split("T")[0]} /></TcField>
                    <TcField label="Reason for change">
                      <TcRadioGroup value={get(dcReasonField)} onChange={v => set(dcReasonField, v)} options={[
                        { value: "tsh_increased", label: "TSH increased" }, { value: "tsh_decreased", label: "TSH decreased" },
                        ...(isFemale && !hadHysterectomy && !isPostMeno && isMarried ? [{ value: "pregnancy", label: "Pregnancy" }] : []),
                        { value: "other", label: "Other" },
                      ]} />
                    </TcField>
                  </TcSectionCard>
                )}
              </div>
            </div>
          );
        };

        return (
          <div>
            <h3>Are you currently taking any thyroid medication?</h3>
            <TcYesNoUnsure value={get("thyroid_med_status")} onChange={v => set("thyroid_med_status", v)} />
            {get("thyroid_med_status") === "yes" && (
              <TcSectionCard title="Current thyroid medication">
                <TcField label="Treatment type">
                  <TcRadioGroup value={get("thyroid_med_treatment_type")} onChange={v => set("thyroid_med_treatment_type", v)} inline options={[
                    { value: "levo_only", label: "Levothyroxine (LT4)" },
                    { value: "lio_only", label: "Liothyronine (LT3)" },
                    { value: "combination", label: "Combination" },
                    { value: "other", label: "Other" },
                  ]} />
                </TcField>

                {(get("thyroid_med_treatment_type") === "levo_only" || get("thyroid_med_treatment_type") === "lio_only" || get("thyroid_med_treatment_type") === "combination") && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
                      <div>
                        {(get("thyroid_med_treatment_type") === "levo_only" || get("thyroid_med_treatment_type") === "combination") && (
                          <TcField label="Brand name — Levothyroxine (LT4)">
                            <TcSelect
                              value={get("thyroid_med_brand")}
                              onChange={brand => {
                                const info = THYROID_MED_BRANDS[brand];
                                set("thyroid_med_brand", brand);
                                set("thyroid_med_name", info ? info.generic : "");
                                set("thyroid_med_dose", "");
                              }}
                              placeholder="Select brand..."
                              options={[...Object.keys(THYROID_MED_BRANDS).sort().map(b => ({ value: b, label: b })), { value: "other", label: "Others" }]}
                            />
                          </TcField>
                        )}
                      </div>
                      <div>
                        {(get("thyroid_med_treatment_type") === "lio_only" || get("thyroid_med_treatment_type") === "combination") && (
                          <TcField label="Brand name — Liothyronine (LT3)">
                            <TcSelect
                              value={get("liothyronine_brand")}
                              onChange={brand => {
                                const info = LIOTHYRONINE_BRANDS[brand];
                                set("liothyronine_brand", brand);
                                set("liothyronine_name", info ? info.generic : "");
                                set("liothyronine_dose", "");
                              }}
                              placeholder="Select brand..."
                              options={[...Object.keys(LIOTHYRONINE_BRANDS).sort().map(b => ({ value: b, label: b })), { value: "other", label: "Others" }]}
                            />
                          </TcField>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
                      <div>
                        {(get("thyroid_med_treatment_type") === "levo_only" || get("thyroid_med_treatment_type") === "combination") && get("thyroid_med_brand") && (
                          <TcField label="Drug name" hint={get("thyroid_med_brand") === "other" ? "Enter medicine name" : "Auto-filled from brand"}>
                            <TcInput value={get("thyroid_med_name")} onChange={v => set("thyroid_med_name", v)} placeholder={get("thyroid_med_brand") === "other" ? "e.g. Thyroxine Sodium" : undefined} />
                          </TcField>
                        )}
                      </div>
                      <div>
                        {(get("thyroid_med_treatment_type") === "lio_only" || get("thyroid_med_treatment_type") === "combination") && get("liothyronine_brand") && (
                          <TcField label="Drug name" hint={get("liothyronine_brand") === "other" ? "Enter medicine name" : "Auto-filled from brand"}>
                            <TcInput value={get("liothyronine_name")} onChange={v => set("liothyronine_name", v)} placeholder={get("liothyronine_brand") === "other" ? "e.g. Liothyronine Sodium" : undefined} />
                          </TcField>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                      <div>
                        {(get("thyroid_med_treatment_type") === "levo_only" || get("thyroid_med_treatment_type") === "combination") && get("thyroid_med_brand") && THYROID_MED_BRANDS[get("thyroid_med_brand")] && (
                          <TcField label="Current dose (mcg)">
                            <TcPillSelect perRow={3}
                              value={get("thyroid_med_dose") ? Number(get("thyroid_med_dose")) : null}
                              onChange={dose => set("thyroid_med_dose", String(dose))}
                              options={THYROID_MED_BRANDS[get("thyroid_med_brand")].doses}
                            />
                          </TcField>
                        )}
                        {(get("thyroid_med_treatment_type") === "levo_only" || get("thyroid_med_treatment_type") === "combination") && get("thyroid_med_brand") === "other" && (
                          <TcField label="Current dose (mcg)">
                            <TcInput type="number" value={get("thyroid_med_dose")} onChange={v => set("thyroid_med_dose", v)} placeholder="e.g. 75" min={0} />
                          </TcField>
                        )}
                      </div>
                      <div>
                        {(get("thyroid_med_treatment_type") === "lio_only" || get("thyroid_med_treatment_type") === "combination") && get("liothyronine_brand") && LIOTHYRONINE_BRANDS[get("liothyronine_brand")] && (
                          <TcField label="Current dose (mcg)">
                            <TcPillSelect perRow={3}
                              value={get("liothyronine_dose") ? Number(get("liothyronine_dose")) : null}
                              onChange={dose => set("liothyronine_dose", String(dose))}
                              options={LIOTHYRONINE_BRANDS[get("liothyronine_brand")].doses}
                            />
                          </TcField>
                        )}
                        {(get("thyroid_med_treatment_type") === "lio_only" || get("thyroid_med_treatment_type") === "combination") && get("liothyronine_brand") === "other" && (
                          <TcField label="Current dose (mcg)">
                            <TcInput type="number" value={get("liothyronine_dose")} onChange={v => set("liothyronine_dose", v)} placeholder="e.g. 5" min={0} />
                          </TcField>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>{(get("thyroid_med_treatment_type") === "levo_only" || get("thyroid_med_treatment_type") === "combination") && renderMedCol("lt4")}</div>
                      <div>{(get("thyroid_med_treatment_type") === "lio_only" || get("thyroid_med_treatment_type") === "combination") && renderMedCol("lt3")}</div>
                    </div>
                  </>
                )}

                {get("thyroid_med_treatment_type") === "other" && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <TcField label="Drug name"><TcInput value={get("thyroid_med_name")} onChange={v => set("thyroid_med_name", v)} placeholder="e.g. Levothyroxine" /></TcField>
                      <TcField label="Dose (mcg)"><TcInput type="number" value={get("thyroid_med_dose")} onChange={v => set("thyroid_med_dose", v)} placeholder="e.g. 100" /></TcField>
                    </div>
                    <TcField label="Timing">
                      <TcRadioGroup value={get("thyroid_med_timing")} onChange={v => set("thyroid_med_timing", v)} options={[
                        { value: "before_breakfast", label: "Before breakfast" },
                        { value: "after_breakfast", label: "After breakfast" },
                        { value: "bedtime", label: "Bedtime" },
                      ]} />
                    </TcField>
                    <TcField label="Compliance">
                      <TcRadioGroup value={get("thyroid_med_compliance")} onChange={v => set("thyroid_med_compliance", v)} inline options={[
                        { value: "regular", label: "Regular" }, { value: "irregular", label: "Irregular" }, { value: "skips_sometimes", label: "Skips sometimes" },
                      ]} />
                    </TcField>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <TcField label="Taking since (years)"><TcInput type="number" value={get("thyroid_med_since_years")} onChange={v => set("thyroid_med_since_years", v)} min={0} placeholder="0" /></TcField>
                      <TcField label="Taking since (months)"><TcInput type="number" value={get("thyroid_med_since_months")} onChange={v => set("thyroid_med_since_months", v)} min={0} max={11} placeholder="0" /></TcField>
                    </div>
                    <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #d0d7e8" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Has this dose been changed recently?</div>
                      <TcYesNoUnsure value={get("dose_changed_status")} onChange={v => set("dose_changed_status", v)} />
                      {get("dose_changed_status") === "yes" && (
                        <TcSectionCard title="Dose change details">
                          <TcField label="Date of last dose change"><TcInput type="date" value={get("dose_last_changed_date")} onChange={v => set("dose_last_changed_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
                          <TcField label="Reason for change">
                            <TcRadioGroup value={get("dose_change_reason")} onChange={v => set("dose_change_reason", v)} options={[
                              { value: "tsh_increased", label: "TSH increased" }, { value: "tsh_decreased", label: "TSH decreased" },
                              ...(isFemale && !hadHysterectomy && !isPostMeno && isMarried ? [{ value: "pregnancy", label: "Pregnancy" }] : []),
                              { value: "other", label: "Other" },
                            ]} />
                          </TcField>
                        </TcSectionCard>
                      )}
                    </div>
                  </>
                )}
              </TcSectionCard>
            )}
            <TcOutputBox text={(() => {
              if (get("thyroid_med_status") !== "yes") return "";
              const parts = [];
              if (get("thyroid_med_brand") && get("thyroid_med_dose")) parts.push(`Tab. ${get("thyroid_med_brand") === "other" ? (get("thyroid_med_name") || "Other") : get("thyroid_med_brand")} — ${get("thyroid_med_dose")} mcg`);
              if (get("liothyronine_brand") && get("liothyronine_dose")) parts.push(`Tab. ${get("liothyronine_brand") === "other" ? (get("liothyronine_name") || "Other") : get("liothyronine_brand")} — ${get("liothyronine_dose")} mcg`);
              if (get("thyroid_med_treatment_type") === "other" && get("thyroid_med_name")) parts.push(`${get("thyroid_med_name")} — ${get("thyroid_med_dose") || "?"} mcg`);
              return parts.join(" + ");
            })()} />
          </div>
        );
      })();

      case "C4a": return (
        <div>
          <h3>Do you have a family history of thyroid disease?</h3>
          <TcYesNoUnsure value={get("family_thyroid_status")} onChange={v => set("family_thyroid_status", v)} />
          {get("family_thyroid_status") === "yes" && (
            <TcSectionCard title="Family thyroid history">
              <TcField label="Which relative(s) and condition (select all that apply)">
                <TcCheckGroup values={get("family_thyroid_relations", [])} onChange={v => set("family_thyroid_relations", v)} options={[
                  { value: "mother", label: "Mother" }, { value: "father", label: "Father" },
                  { value: "brother", label: "Brother" }, { value: "sister", label: "Sister" },
                  { value: "son", label: "Son" }, { value: "daughter", label: "Daughter" },
                  { value: "paternal_grandfather", label: "Paternal grandfather" }, { value: "paternal_grandmother", label: "Paternal grandmother" },
                  { value: "maternal_grandfather", label: "Maternal grandfather" }, { value: "maternal_grandmother", label: "Maternal grandmother" },
                  { value: "paternal_uncle", label: "Paternal uncle" }, { value: "paternal_aunt", label: "Paternal aunt" },
                  { value: "maternal_uncle", label: "Maternal uncle" }, { value: "maternal_aunt", label: "Maternal aunt" },
                  { value: "cousin", label: "Cousin" },
                ]} />
              </TcField>
              <TcField label="Condition in family member(s)">
                <TcSelect value={get("family_thyroid_condition")} onChange={v => set("family_thyroid_condition", v)} placeholder="Select condition" options={[
                  { value: "hypothyroidism", label: "Hypothyroidism" }, { value: "hyperthyroidism", label: "Hyperthyroidism" },
                  { value: "thyroid_cancer", label: "Thyroid cancer" }, { value: "goitre", label: "Goitre" }, { value: "others", label: "Others" },
                ]} />
              </TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("family_thyroid_status") === "yes" && get("family_thyroid_relations", []).length ? `Family history of thyroid disease in: ${get("family_thyroid_relations", []).map(r => r.replace(/_/g, " ")).join(", ")}.` : ""} />
        </div>
      );

      case "C4b": return (
        <div>
          <h3>Is there a family history of MEN syndrome or other endocrine tumours?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>Multiple Endocrine Neoplasia, familial thyroid cancer, parathyroid, pituitary, or adrenal tumours</p>
          <TcYesNoUnsure value={get("family_men_status")} onChange={v => set("family_men_status", v)} />
          {get("family_men_status") === "yes" && (
            <TcSectionCard title="MEN / endocrine tumour family history">
              <TcField label="Type (select all that apply)">
                <TcCheckGroup values={get("family_men_types", [])} onChange={v => set("family_men_types", v)} options={[
                  { value: "men1", label: "MEN1 (Multiple Endocrine Neoplasia type 1)" },
                  { value: "men2a", label: "MEN2A (Multiple Endocrine Neoplasia type 2A)" },
                  { value: "men2b", label: "MEN2B (Multiple Endocrine Neoplasia type 2B)" },
                  { value: "familial_nmtc", label: "Familial non-medullary thyroid cancer (FNMTC)" },
                  { value: "parathyroid", label: "Parathyroid tumour" },
                  { value: "pituitary", label: "Pituitary tumour" },
                  { value: "adrenal", label: "Adrenal tumour / Phaeochromocytoma" },
                  { value: "other_cancer", label: "Other cancer" },
                ]} />
              </TcField>
              <TcField label="Which relative?"><TcInput value={get("family_men_relative")} onChange={v => set("family_men_relative", v)} placeholder="e.g. Mother, Maternal uncle" /></TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("family_men_status") === "yes" && get("family_men_types", []).length ? `Family history: ${get("family_men_types", []).map(t => t.replace(/_/g, " ")).join(", ")} — ${get("family_men_relative") || "relative not specified"}.` : ""} />
        </div>
      );

      case "C5": return (
        <div>
          <h3>Do you have any known autoimmune condition?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>e.g. Type 1 diabetes, rheumatoid arthritis, lupus, vitiligo, Addison's disease</p>
          <TcYesNoUnsure value={get("autoimmune_status")} onChange={v => set("autoimmune_status", v)} />
          {get("autoimmune_status") === "yes" && (
            <TcSectionCard title="Autoimmune conditions">
              <TcField label="Condition(s) (select all that apply)">
                <TcCheckGroup values={get("autoimmune_conditions", [])} onChange={v => set("autoimmune_conditions", v)} options={[
                  { value: "type1_diabetes", label: "Type 1 diabetes" }, { value: "rheumatoid_arthritis", label: "Rheumatoid arthritis" },
                  { value: "lupus", label: "Lupus (SLE)" }, { value: "vitiligo", label: "Vitiligo" },
                  { value: "addisons", label: "Addison's disease" }, { value: "other", label: "Other" },
                ]} />
              </TcField>
              {get("autoimmune_conditions", []).includes("other") && (
                <TcField label="Please specify"><TcInput value={get("autoimmune_other")} onChange={v => set("autoimmune_other", v)} /></TcField>
              )}
            </TcSectionCard>
          )}
          <TcOutputBox text={get("autoimmune_status") === "yes" && get("autoimmune_conditions", []).length ? get("autoimmune_conditions", []).map(c => c.replace(/_/g, " ")).join(". ") + "." : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE D (full) — LABORATORY CAPTURE
      // ══════════════════════════════════════════════════════

      case "D1": return renderLabScreen("D1", "TSH (thyroid stimulating hormone)", "tsh", "mIU/L", null);
      case "D2": return renderLabScreen("D2", "T3 (total triiodothyronine)", "t3", "", [{ value: "nmol_l", label: "nmol/L" }, { value: "ng_dl", label: "ng/dL" }]);
      case "D3": return renderLabScreen("D3", "Free T3 (FT3)", "ft3", "", [{ value: "pmol_l", label: "pmol/L" }, { value: "pg_ml", label: "pg/mL" }]);
      case "D4": return renderLabScreen("D4", "T4 (total thyroxine)", "t4", "", [{ value: "nmol_l", label: "nmol/L" }, { value: "mcg_dl", label: "mcg/dL" }]);
      case "D5": return renderLabScreen("D5", "Free T4 (FT4)", "ft4", "", [{ value: "pmol_l", label: "pmol/L" }, { value: "ng_dl", label: "ng/dL" }]);
      case "D6": return renderLabScreen("D6", "Anti-TPO antibody", "antitpo", "", [{ value: "iu_ml", label: "IU/mL" }, { value: "ku_l", label: "kU/L" }]);
      case "D7": return renderLabScreen("D7", "Anti-Tg (Anti-thyroglobulin) antibody", "antitg", "", [{ value: "iu_ml", label: "IU/mL" }, { value: "ku_l", label: "kU/L" }]);

      // ══════════════════════════════════════════════════════
      // MODULE F — SYMPTOMS
      // ══════════════════════════════════════════════════════

      case "F1":  return renderSymptomScreen("F1",  "Do you experience unusual tiredness or fatigue?", "fatigue", "Mild fatigue", ["Mild","Moderate","Severe"], `Mild tiredness since last ${durationText(get("fatigue_years"), get("fatigue_months"), get("fatigue_since_date"))}.`);
      case "F2":  return (
        <div>
          <h3>Have you noticed any unintentional change in your weight?</h3>
          <TcYesNoUnsure value={get("weight_change_status")} onChange={v => set("weight_change_status", v)} />
          {get("weight_change_status") === "yes" && (
            <TcSectionCard title="Weight change details">
              <TcField label="Direction"><TcRadioGroup value={get("weight_direction")} onChange={v => set("weight_direction", v)} inline options={[{ value: "gained", label: "Weight gained" }, { value: "lost", label: "Weight lost" }]} /></TcField>
              <TcField label="How much (kg)?"><TcInput type="number" value={get("weight_kg")} onChange={v => set("weight_kg", v)} min={0} placeholder="e.g. 5" /></TcField>
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("weight_since_date")} onSinceDate={v => set("weight_since_date", v)} years={get("weight_years")} onYears={v => set("weight_years", v)} months={get("weight_months")} onMonths={v => set("weight_months", v)} />
            </TcSectionCard>
          )}
          <TcOutputBox text={get("weight_change_status") === "yes" && get("weight_direction") ? `Weight ${get("weight_direction")}${get("weight_kg") ? " of " + get("weight_kg") + " kg" : ""} over last ${durationText(get("weight_years"), get("weight_months"), get("weight_since_date"))}.` : ""} />
        </div>
      );
      case "F3":  return (
        <div>
          <h3>Has your appetite changed?</h3>
          <TcRadioGroup value={get("appetite_status")} onChange={v => set("appetite_status", v)} options={[{ value: "no_change", label: "No change" }, { value: "decreased", label: "Decreased" }, { value: "increased", label: "Increased" }]} />
          <TcOutputBox text={get("appetite_status") && get("appetite_status") !== "no_change" ? `${get("appetite_status").charAt(0).toUpperCase() + get("appetite_status").slice(1)} appetite.` : ""} />
        </div>
      );
      case "F4":  return renderSymptomScreen("F4",  "Do you feel unusually cold or have difficulty tolerating cold temperatures?", "cold_intol", "Intolerance to cold", null, `Intolerance to cold since last ${durationText(get("cold_intol_years"), get("cold_intol_months"), get("cold_intol_since_date"))}.`);
      case "F5":  return (
        <div>
          <h3>Have you noticed any changes in your bowel habits?</h3>
          <TcYesNoUnsure value={get("bowel_change_status")} onChange={v => set("bowel_change_status", v)} />
          {get("bowel_change_status") === "yes" && (
            <TcSectionCard title="Bowel change details">
              <TcField label="Type"><TcRadioGroup value={get("bowel_type")} onChange={v => set("bowel_type", v)} options={[{ value: "constipation", label: "Constipation" }, { value: "diarrhoea", label: "Diarrhoea" }, { value: "alternating", label: "Alternating" }, { value: "reduced_frequency", label: "Reduced frequency" }]} /></TcField>
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("bowel_since_date")} onSinceDate={v => set("bowel_since_date", v)} years={get("bowel_years")} onYears={v => set("bowel_years", v)} months={get("bowel_months")} onMonths={v => set("bowel_months", v)} />
            </TcSectionCard>
          )}
          <TcOutputBox text={get("bowel_change_status") === "yes" && get("bowel_type") ? `${get("bowel_type").charAt(0).toUpperCase() + get("bowel_type").slice(1)} since last ${durationText(get("bowel_years"), get("bowel_months"), get("bowel_since_date"))}.` : ""} />
        </div>
      );
      case "F6":  return renderMultiSymptom("F6",  "Do you experience any abdominal bloating, fullness, or discomfort?", "abdominal", ["Bloating","Fullness","Discomfort","Nausea"]);
      case "F7":  return renderMultiSymptom("F7",  "Have you noticed any changes in your skin?", "skin", ["Dryness","Roughness","Pallor","Puffiness","Thickening"]);
      case "F8a": return renderSymptomScreen("F8a", "Do you have puffiness or swelling around your eyes? (periorbital oedema)", "periorbital", "Peri-orbital puffiness", null, `Peri-orbital puffiness since last ${durationText(get("periorbital_years"), get("periorbital_months"), get("periorbital_since_date"))}.`);
      case "F8b": return renderSymptomScreen("F8b", "Do you have puffiness or swelling of your face? (facial oedema)", "facial_oedema", "Facial puffiness", null, `Facial puffiness since last ${durationText(get("facial_oedema_years"), get("facial_oedema_months"), get("facial_oedema_since_date"))}.`);
      case "F9":  return (
        <div>
          <h3>Do you have swelling of the legs or feet? (pedal oedema)</h3>
          <TcYesNoUnsure value={get("leg_oedema_status")} onChange={v => set("leg_oedema_status", v)} />
          {get("leg_oedema_status") === "yes" && (
            <TcSectionCard title="Pedal oedema details">
              <TcField label="Type"><TcRadioGroup value={get("leg_oedema_type")} onChange={v => set("leg_oedema_type", v)} inline options={[{ value: "pitting", label: "Pitting" }, { value: "non_pitting", label: "Non-pitting" }, { value: "unsure", label: "Unsure" }]} /></TcField>
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("leg_oedema_since_date")} onSinceDate={v => set("leg_oedema_since_date", v)} years={get("leg_oedema_years")} onYears={v => set("leg_oedema_years", v)} months={get("leg_oedema_months")} onMonths={v => set("leg_oedema_months", v)} />
            </TcSectionCard>
          )}
          <TcOutputBox text={get("leg_oedema_status") === "yes" ? `Pedal oedema since last ${durationText(get("leg_oedema_years"), get("leg_oedema_months"), get("leg_oedema_since_date"))}.` : ""} />
        </div>
      );
      case "F10": return renderMultiSymptom("F10", "Have you noticed any changes in your hair?", "hair", ["Hair loss","Thinning","Dryness","Coarsening","Loss of outer eyebrow (lateral third)"]);
      case "F11": return renderMultiSymptom("F11", "Have you noticed any changes in your nails?", "nail", ["Brittle","Slow growing","Ridged","Thickened"]);
      case "F12": return (
        <div>
          <h3>Have you noticed any hoarseness or change in your voice?</h3>
          <TcYesNoUnsure value={get("hoarseness_status")} onChange={v => set("hoarseness_status", v)} />
          {get("hoarseness_status") === "yes" && (
            <TcSectionCard title="Voice change details">
              <TcField label="Pattern"><TcRadioGroup value={get("hoarseness_pattern")} onChange={v => set("hoarseness_pattern", v)} inline options={[{ value: "constant", label: "Constant" }, { value: "intermittent", label: "Intermittent" }]} /></TcField>
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("hoarseness_since_date")} onSinceDate={v => set("hoarseness_since_date", v)} years={get("hoarseness_years")} onYears={v => set("hoarseness_years", v)} months={get("hoarseness_months")} onMonths={v => set("hoarseness_months", v)} />
            </TcSectionCard>
          )}
          <TcOutputBox text={get("hoarseness_status") === "yes" ? `${get("hoarseness_pattern") || ""}  hoarseness of voice since last ${durationText(get("hoarseness_years"), get("hoarseness_months"), get("hoarseness_since_date"))}.` : ""} />
        </div>
      );
      case "F13": return renderSymptomScreen("F13", "Do you experience muscle cramps or aches?", "muscle_cramp", "Muscle cramps", null, `Muscle cramps since last ${durationText(get("muscle_cramp_years"), get("muscle_cramp_months"), get("muscle_cramp_since_date"))}.`);
      case "F14": return (
        <div>
          <h3>Do you feel a general weakness or heaviness in your muscles?</h3>
          <TcYesNoUnsure value={get("muscle_weakness_status")} onChange={v => set("muscle_weakness_status", v)} />
          {get("muscle_weakness_status") === "yes" && (
            <TcSectionCard title="Muscle weakness details">
              <TcField label="Location"><TcRadioGroup value={get("muscle_weakness_location")} onChange={v => set("muscle_weakness_location", v)} options={[{ value: "proximal", label: "Proximal (upper arms / thighs)" }, { value: "generalised", label: "Generalised" }]} /></TcField>
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("muscle_weakness_since_date")} onSinceDate={v => set("muscle_weakness_since_date", v)} years={get("muscle_weakness_years")} onYears={v => set("muscle_weakness_years", v)} months={get("muscle_weakness_months")} onMonths={v => set("muscle_weakness_months", v)} />
            </TcSectionCard>
          )}
          <TcOutputBox text={get("muscle_weakness_status") === "yes" ? `Weakness in ${get("muscle_weakness_location") || ""} muscles since last ${durationText(get("muscle_weakness_years"), get("muscle_weakness_months"), get("muscle_weakness_since_date"))}.` : ""} />
        </div>
      );
      case "F15a": return renderSymptomScreen("F15a", "Do you experience difficulty concentrating?", "cognition", "Difficulty in concentrating", null, `Difficulty in concentrating since last ${durationText(get("cognition_years"), get("cognition_months"), get("cognition_since_date"))}.`);
      case "F15b": return renderSymptomScreen("F15b", "Do you experience problems with your memory?", "memory", "Memory difficulties", null, `Memory difficulties since last ${durationText(get("memory_years"), get("memory_months"), get("memory_since_date"))}.`);
      case "F16": return (
        <div>
          <h3>Have you been feeling depressed, low in mood, or emotionally flat?</h3>
          <TcYesNoUnsure value={get("depression_status")} onChange={v => set("depression_status", v)} />
          {get("depression_status") === "yes" && (
            <TcSectionCard title="Depression details">
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("depression_since_date")} onSinceDate={v => set("depression_since_date", v)} years={get("depression_years")} onYears={v => set("depression_years", v)} months={get("depression_months")} onMonths={v => set("depression_months", v)} />
              <TcField label="Have you seen a doctor for this?"><TcYesNo value={get("depression_treated")} onChange={v => set("depression_treated", v)} /></TcField>
              <TcField label="Formally diagnosed with depression by a doctor?"><TcYesNo value={get("depression_diagnosed")} onChange={v => set("depression_diagnosed", v)} /></TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("depression_status") === "yes" ? `${get("depression_diagnosed") === "yes" ? "Diagnosed" : "Reported"} case of depression since last ${durationText(get("depression_years"), get("depression_months"), get("depression_since_date"))}.` : ""} />
        </div>
      );
      case "F17": return renderSymptomScreen("F17", "Do you experience excessive daytime sleepiness or sleeping more than usual?", "hypersomnia", "Excessive sleep", null, `Excessive sleep since last ${durationText(get("hypersomnia_years"), get("hypersomnia_months"), get("hypersomnia_since_date"))}.`);
      case "F18": return (
        <div>
          <h3>Have you noticed that your heart beats slowly, or been told you have a low pulse rate?</h3>
          <TcYesNoUnsure value={get("bradycardia_status")} onChange={v => set("bradycardia_status", v)} />
          {get("bradycardia_status") === "yes" && (
            <TcSectionCard title="Bradycardia details">
              <TcField label="Approximate resting pulse rate (bpm — optional)"><TcInput type="number" value={get("pulse_rate_bpm")} onChange={v => set("pulse_rate_bpm", v)} min={20} max={200} placeholder="e.g. 52" /></TcField>
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("bradycardia_since_date")} onSinceDate={v => set("bradycardia_since_date", v)} years={get("bradycardia_years")} onYears={v => set("bradycardia_years", v)} months={get("bradycardia_months")} onMonths={v => set("bradycardia_months", v)} />
            </TcSectionCard>
          )}
          <TcOutputBox text={get("bradycardia_status") === "yes" ? `Bradycardia${get("pulse_rate_bpm") ? " (pulse " + get("pulse_rate_bpm") + " bpm)" : ""} since last ${durationText(get("bradycardia_years"), get("bradycardia_months"), get("bradycardia_since_date"))}.` : ""} />
        </div>
      );
      case "F19": return (
        <div>
          <h3>Do you feel dizzy or lightheaded when you stand up quickly? (positional giddiness)</h3>
          <TcYesNoUnsure value={get("postural_giddiness_status")} onChange={v => set("postural_giddiness_status", v)} />
          {get("postural_giddiness_status") === "yes" && (
            <TcSectionCard title="Postural giddiness details">
              <TcField label="Frequency"><TcRadioGroup value={get("postural_giddiness_freq")} onChange={v => set("postural_giddiness_freq", v)} options={[{ value: "rarely", label: "Rarely" }, { value: "sometimes", label: "Sometimes" }, { value: "often", label: "Often" }, { value: "every_time", label: "Every time I stand" }]} /></TcField>
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("postural_giddiness_since_date")} onSinceDate={v => set("postural_giddiness_since_date", v)} years={get("postural_giddiness_years")} onYears={v => set("postural_giddiness_years", v)} months={get("postural_giddiness_months")} onMonths={v => set("postural_giddiness_months", v)} />
            </TcSectionCard>
          )}
          <TcOutputBox text={get("postural_giddiness_status") === "yes" ? `Postural giddiness since last ${durationText(get("postural_giddiness_years"), get("postural_giddiness_months"), get("postural_giddiness_since_date"))}.` : ""} />
        </div>
      );
      case "F20": return (
        <div>
          <h3>Have you ever had a sudden loss of consciousness or black-out episode?</h3>
          <TcYesNoUnsure value={get("blackout_status")} onChange={v => set("blackout_status", v)} />
          {get("blackout_status") === "yes" && (
            <TcSectionCard title="Black-out details">
              <TcField label="Number of episodes"><TcInput type="number" value={get("blackout_count")} onChange={v => set("blackout_count", v)} min={1} placeholder="e.g. 2" /></TcField>
              <TcField label="Date of most recent episode"><TcInput type="date" value={get("blackout_last_date")} onChange={v => set("blackout_last_date", v)} max={new Date().toISOString().split("T")[0]} /></TcField>
              <TcField label="Were you assessed by a doctor after any episode?"><TcYesNo value={get("blackout_assessed")} onChange={v => set("blackout_assessed", v)} /></TcField>
              {get("blackout_assessed") === "yes" && (
                <TcField label="What cause was identified?"><TcInput value={get("blackout_dx")} onChange={v => set("blackout_dx", v)} placeholder="e.g. Vasovagal episode" /></TcField>
              )}
            </TcSectionCard>
          )}
          <TcOutputBox text={get("blackout_status") === "yes" && get("blackout_count") ? `${get("blackout_count") === "1" ? "One black-out episode" : get("blackout_count") + " black-out episodes"}, last on ${fmtDate(get("blackout_last_date"))}.` : ""} />
        </div>
      );
      case "F21": return (
        <div>
          <h3>Have you experienced any hearing difficulties or ringing in the ears?</h3>
          <TcYesNoUnsure value={get("hearing_status")} onChange={v => set("hearing_status", v)} />
          {get("hearing_status") === "yes" && (
            <TcSectionCard title="Hearing details">
              <TcField label="Type"><TcRadioGroup value={get("hearing_type")} onChange={v => set("hearing_type", v)} options={[{ value: "reduced_hearing", label: "Reduced hearing" }, { value: "tinnitus", label: "Tinnitus (ringing)" }, { value: "both", label: "Both" }]} /></TcField>
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("hearing_since_date")} onSinceDate={v => set("hearing_since_date", v)} years={get("hearing_years")} onYears={v => set("hearing_years", v)} months={get("hearing_months")} onMonths={v => set("hearing_months", v)} />
            </TcSectionCard>
          )}
          <TcOutputBox text={get("hearing_status") === "yes" && get("hearing_type") ? `${get("hearing_type").replace(/_/g, " ")} since last ${durationText(get("hearing_years"), get("hearing_months"), get("hearing_since_date"))}.` : ""} />
        </div>
      );
      case "F22": return (
        <div>
          <h3>Do you have delayed or sluggish reflexes? (noticed by yourself or pointed out by a doctor)</h3>
          <TcYesNoUnsure value={get("delayed_reflexes_status")} onChange={v => set("delayed_reflexes_status", v)} />
          <TcOutputBox text={get("delayed_reflexes_status") === "yes" ? "Sluggish / delayed reflexes noted." : ""} />
        </div>
      );
      case "F23": return (
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
                  <TcRadioGroup value={item.status || ""} onChange={v => updateItem({ status: v })} inline options={[{ value: "no", label: "No" }, { value: "unsure", label: "Unsure" }, { value: "yes", label: "Yes" }]} />
                </div>
                {item.status === "yes" && (
                  <TcSectionCard title={`${label} details`}>
                    <TcField label="Which hand?"><TcRadioGroup value={item.side || ""} onChange={v => updateItem({ side: v })} inline options={[{ value: "right", label: "Right" }, { value: "left", label: "Left" }, { value: "both", label: "Both" }]} /></TcField>
                    <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={item.since?.date} onSinceDate={v => updateItem({ since: { ...(item.since || {}), date: v } })} years={item.since?.years} onYears={v => updateItem({ since: { ...(item.since || {}), years: v } })} months={item.since?.months} onMonths={v => updateItem({ since: { ...(item.since || {}), months: v } })} />
                  </TcSectionCard>
                )}
              </div>
            );
          })}
          <TcOutputBox text={Object.entries(get("carpal_tunnel_data", {}) || {}).filter(([, v]) => v?.status === "yes").length > 0
            ? Object.entries(get("carpal_tunnel_data", {}) || {}).filter(([, v]) => v?.status === "yes")
              .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} in ${v.side || "?"} wrist since last ${durationText(v.since?.years, v.since?.months, v.since?.date)}.`).join(" ")
            : ""} />
        </div>
      );
      case "F24": return (
        <div>
          <h3>Have you noticed any swelling or enlargement of your tongue? (macroglossia)</h3>
          <TcYesNoUnsure value={get("macroglossia_status")} onChange={v => set("macroglossia_status", v)} />
          <TcOutputBox text={get("macroglossia_status") === "no" ? "No enlargement of tongue." : get("macroglossia_status") === "yes" ? "Macroglossia (enlarged tongue) reported." : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE G (no standalone pages — G1 duplicated C3's "currently
      // taking any thyroid medication" question; G2's dose-change now
      // lives inside C3, merged per drug column)
      // ══════════════════════════════════════════════════════

      // ══════════════════════════════════════════════════════
      // MODULE H — UNIFIED COMORBIDITIES
      // ══════════════════════════════════════════════════════

      case "H1": return renderComorbidity("H1", "Have you been diagnosed with high cholesterol or dyslipidaemia?", "dyslipidaemia", "Dyslipidaemia / Hypercholesterolaemia");
      case "H2": return (
        <div>
          <h3>Have you been diagnosed with anaemia?</h3>
          <TcYesNoUnsure value={get("anaemia_status")} onChange={v => set("anaemia_status", v)} />
          {get("anaemia_status") === "yes" && (
            <TcSectionCard title="Anaemia details">
              <TcField label="Type if known">
                <TcRadioGroup value={get("anaemia_type")} onChange={v => set("anaemia_type", v)} options={[
                  { value: "iron_deficiency", label: "Iron deficiency" }, { value: "b12_deficiency", label: "Vitamin B12 deficiency" },
                  { value: "folate_deficiency", label: "Folate deficiency" }, { value: "other", label: "Other" }, { value: "not_known", label: "Not known" },
                ]} />
              </TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("anaemia_status") === "yes" && get("anaemia_type") ? `K/c/o ${get("anaemia_type").replace(/_/g, " ")} anaemia.` : ""} />
        </div>
      );
      case "H3": return renderComorbidity("H3", "Have you been diagnosed with diabetes or high blood sugar?", "diabetes", "Diabetes mellitus");
      case "H4": return (
        <div>
          <h3>Have you been diagnosed with PCOS or PMOS?</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>Polycystic Ovarian Syndrome (PCOS) / Polyendocrine Metabolic Ovarian Syndrome (PMOS)</p>
          <TcYesNoUnsure value={get("pcos_status")} onChange={v => set("pcos_status", v)} />
          {get("pcos_status") === "yes" && (
            <TcSectionCard title="PCOS / PMOS details">
              <TcField label="Which diagnosis?"><TcRadioGroup value={get("pcos_label")} onChange={v => set("pcos_label", v)} inline options={[{ value: "pcos", label: "PCOS" }, { value: "pmos", label: "PMOS" }]} /></TcField>
              <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get("pcos_since_date")} onSinceDate={v => set("pcos_since_date", v)} years={get("pcos_years")} onYears={v => set("pcos_years", v)} months={get("pcos_months")} onMonths={v => set("pcos_months", v)} />
              <TcField label="Are you taking any medicines for this?"><TcYesNoUnsure value={get("pcos_on_med")} onChange={v => set("pcos_on_med", v)} /></TcField>
              {get("pcos_on_med") === "yes" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <TcField label="Medicine name"><TcInput value={get("pcos_med_name")} onChange={v => set("pcos_med_name", v)} placeholder="e.g. Metformin" /></TcField>
                  <TcField label="Dose (mg)"><TcInput type="number" value={get("pcos_med_dose")} onChange={v => set("pcos_med_dose", v)} /></TcField>
                  <TcField label="Times per day"><TcInput type="number" value={get("pcos_med_freq")} onChange={v => set("pcos_med_freq", v)} min={1} max={6} /></TcField>
                </div>
              )}
            </TcSectionCard>
          )}
          <TcOutputBox text={get("pcos_status") === "yes" && get("pcos_label") ? `K/c/o ${get("pcos_label").toUpperCase()} since last ${durationText(get("pcos_years"), get("pcos_months"), get("pcos_since_date"))}${get("pcos_on_med") === "yes" && get("pcos_med_name") ? `, on Tab. ${get("pcos_med_name")}${get("pcos_med_dose") ? " (" + get("pcos_med_dose") + " mg)" : ""}` : ""}.` : ""} />
        </div>
      );
      case "H5": return (
        <div>
          <h3>Have you experienced any difficulty conceiving? (infertility)</h3>
          <TcYesNoUnsure value={get("infertility_status")} onChange={v => set("infertility_status", v)} />
          <TcOutputBox text={get("infertility_status") === "yes" ? "Difficulty in conceiving reported." : get("infertility_status") === "no" ? "No difficulty in conceiving." : ""} />
        </div>
      );
      case "H6": return (
        <div>
          <h3>Have you been formally diagnosed with depression by a doctor or psychiatrist?</h3>
          <TcYesNoUnsure value={get("depression_dx_status")} onChange={v => set("depression_dx_status", v)} />
          {get("depression_dx_status") === "yes" && (
            <TcSectionCard title="Depression">
              <TcField label="Currently on medication for depression?"><TcYesNo value={get("depression_on_med")} onChange={v => set("depression_on_med", v)} /></TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("depression_dx_status") === "yes" ? `K/c/o depression${get("depression_on_med") === "yes" ? " — on medication" : ""}.` : ""} />
        </div>
      );
      case "H7": return (
        <div>
          <h3>Have you been diagnosed with osteoporosis or osteopenia (low bone density)?</h3>
          <TcYesNoUnsure value={get("osteoporosis_status")} onChange={v => set("osteoporosis_status", v)} />
          {get("osteoporosis_status") === "yes" && (
            <TcSectionCard title="Osteoporosis details">
              <TcField label="Confirmed by DEXA scan?"><TcRadioGroup value={get("osteoporosis_dexa")} onChange={v => set("osteoporosis_dexa", v)} inline options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not_done", label: "Not done" }]} /></TcField>
              <TcField label="On bone-protection medication?"><TcYesNoUnsure value={get("osteoporosis_on_med")} onChange={v => set("osteoporosis_on_med", v)} /></TcField>
              {get("osteoporosis_on_med") === "yes" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <TcField label="Medicine name"><TcInput value={get("osteoporosis_med_name")} onChange={v => set("osteoporosis_med_name", v)} placeholder="e.g. Alendronate" /></TcField>
                  <TcField label="Times per day"><TcInput type="number" value={get("osteoporosis_med_freq")} onChange={v => set("osteoporosis_med_freq", v)} min={1} max={4} /></TcField>
                </div>
              )}
            </TcSectionCard>
          )}
          <TcOutputBox text={get("osteoporosis_status") === "yes" ? `K/c/o Osteoporosis${get("osteoporosis_dexa") === "yes" ? " — DEXA confirmed" : ""}${get("osteoporosis_on_med") === "yes" ? `. On bone-protection medication${get("osteoporosis_med_name") ? ": " + get("osteoporosis_med_name") : ""}.` : "."}` : ""} />
        </div>
      );
      case "H8": return (
        <div>
          <h3>Is there a family history of cancer or endocrine tumours (other than thyroid disease)?</h3>
          <TcYesNoUnsure value={get("family_cancer_status")} onChange={v => set("family_cancer_status", v)} />
          {get("family_cancer_status") === "yes" && (
            <TcSectionCard title="Family cancer / endocrine tumour history">
              <TcField label="Type (select all that apply)">
                <TcCheckGroup values={get("family_cancer_types", [])} onChange={v => set("family_cancer_types", v)} options={[
                  { value: "men1", label: "MEN1 (Multiple Endocrine Neoplasia type 1)" },
                  { value: "men2a", label: "MEN2A (Multiple Endocrine Neoplasia type 2A)" },
                  { value: "men2b", label: "MEN2B (Multiple Endocrine Neoplasia type 2B)" },
                  { value: "familial_nmtc", label: "Familial non-medullary thyroid cancer (FNMTC)" },
                  { value: "parathyroid", label: "Parathyroid tumour" },
                  { value: "pituitary", label: "Pituitary tumour" },
                  { value: "adrenal", label: "Adrenal tumour / Phaeochromocytoma" },
                  { value: "other_cancer", label: "Other cancer" },
                ]} />
              </TcField>
              <TcField label="Which relative?"><TcInput value={get("family_cancer_relative")} onChange={v => set("family_cancer_relative", v)} placeholder="e.g. Mother, Maternal uncle" /></TcField>
            </TcSectionCard>
          )}
          <TcOutputBox text={get("family_cancer_status") === "yes" && get("family_cancer_types", []).length ? `Family history: ${get("family_cancer_types", []).map(t => t.replace(/_/g, " ")).join(", ")} — ${get("family_cancer_relative") || "relative not specified"}.` : ""} />
        </div>
      );
      case "H9": return (
        <div>
          <h3>Is there anything else about your thyroid cancer, condition, or symptoms that you would like your doctor to know?</h3>
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
    const statusKey = `${key}_status`;
    const valKey    = `${key}_value`;
    const unitKey   = `${key}_unit`;
    const dateKey   = `${key}_date`;
    const refLoKey  = `${key}_ref_low`;
    const refHiKey  = `${key}_ref_high`;
    return (
      <div>
        <h3>Have you had a {label} test done?</h3>
        <TcYesNoUnsure value={get(statusKey)} onChange={v => set(statusKey, v)} />
        {get(statusKey) === "yes" && (
          <TcSectionCard title={`${label} result`}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <TcField label="Value"><TcInput type="number" value={get(valKey)} onChange={v => set(valKey, v)} placeholder="Numeric value" /></TcField>
              {unitOptions ? (
                <TcField label="Unit"><TcSelect value={get(unitKey)} onChange={v => set(unitKey, v)} options={unitOptions} /></TcField>
              ) : (
                <TcField label="Unit"><TcInput value={fixedUnit} onChange={() => {}} style={{ background: "#f5f5f5", color: "#888" }} /></TcField>
              )}
              <TcField label="Date of test">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <TcInput type="date" value={get(dateKey)} onChange={v => set(dateKey, v)} max={new Date().toISOString().split("T")[0]} />
                  <label style={{ fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                    <input type="checkbox" onChange={e => e.target.checked && set(dateKey, get("tsh_date"))} /> Same as TSH
                  </label>
                </div>
              </TcField>
              <TcField label="Reference range">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <TcInput type="number" value={get(refLoKey)} onChange={v => set(refLoKey, v)} placeholder="Low" />
                  <span style={{ color: "#999" }}>–</span>
                  <TcInput type="number" value={get(refHiKey)} onChange={v => set(refHiKey, v)} placeholder="High" />
                </div>
              </TcField>
            </div>
            <TcField label="Upload report (optional)">
              <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: 12, textAlign: "center", fontSize: 13, color: "#888" }}>Tap to upload lab report (PDF / JPG / PNG)</div>
            </TcField>
          </TcSectionCard>
        )}
        <TcOutputBox text={get(statusKey) === "yes" && get(valKey) ? `${label} — ${get(valKey)} ${get(unitKey) || fixedUnit || ""} (${fmtDate(get(dateKey))})` : ""} />
      </div>
    );
  }

  function renderSymptomScreen(id, question, key, outputLabel, severityOptions, outputText) {
    return (
      <div>
        <h3>{question}</h3>
        <TcYesNoUnsure value={get(`${key}_status`)} onChange={v => set(`${key}_status`, v)} />
        {get(`${key}_status`) === "yes" && (
          <TcSectionCard title="Details">
            {severityOptions && (
              <TcField label="Severity">
                <TcRadioGroup value={get(`${key}_severity`)} onChange={v => set(`${key}_severity`, v)} inline options={severityOptions.map(s => ({ value: s.toLowerCase(), label: s }))} />
              </TcField>
            )}
            <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get(`${key}_since_date`)} onSinceDate={v => set(`${key}_since_date`, v)} years={get(`${key}_years`)} onYears={v => set(`${key}_years`, v)} months={get(`${key}_months`)} onMonths={v => set(`${key}_months`, v)} />
          </TcSectionCard>
        )}
        <TcOutputBox text={get(`${key}_status`) === "yes" ? outputText : ""} />
      </div>
    );
  }

  function renderMultiSymptom(id, question, key, typeOptions) {
    return (
      <div>
        <h3>{question}</h3>
        <TcYesNoUnsure value={get(`${key}_status`)} onChange={v => set(`${key}_status`, v)} />
        {get(`${key}_status`) === "yes" && (
          <TcSectionCard title="Details">
            <TcField label="Type (select all that apply)">
              <TcCheckGroup values={get(`${key}_types`, [])} onChange={v => set(`${key}_types`, v)} options={typeOptions.map(t => ({ value: t.toLowerCase().replace(/\s+/g, "_"), label: t }))} />
            </TcField>
            <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get(`${key}_since_date`)} onSinceDate={v => set(`${key}_since_date`, v)} years={get(`${key}_years`)} onYears={v => set(`${key}_years`, v)} months={get(`${key}_months`)} onMonths={v => set(`${key}_months`, v)} />
          </TcSectionCard>
        )}
        <TcOutputBox text={get(`${key}_status`) === "yes" && get(`${key}_types`, []).length ? `${get(`${key}_types`, []).map(t => t.replace(/_/g, " ")).join(", ")} since last ${durationText(get(`${key}_years`), get(`${key}_months`), get(`${key}_since_date`))}.` : ""} />
      </div>
    );
  }

  function renderComorbidity(id, question, key, outputLabel) {
    return (
      <div>
        <h3>{question}</h3>
        <TcYesNoUnsure value={get(`${key}_status`)} onChange={v => set(`${key}_status`, v)} />
        {get(`${key}_status`) === "yes" && (
          <TcSectionCard title="Details">
            <TcDurationPicker minDate={patientDob} label="Since when?" sinceDate={get(`${key}_since_date`)} onSinceDate={v => set(`${key}_since_date`, v)} years={get(`${key}_years`)} onYears={v => set(`${key}_years`, v)} months={get(`${key}_months`)} onMonths={v => set(`${key}_months`, v)} />
            <TcField label="On medication?"><TcYesNoUnsure value={get(`${key}_on_med`)} onChange={v => set(`${key}_on_med`, v)} /></TcField>
            {get(`${key}_on_med`) === "yes" && (
              <div>
                {(get(`${key}_meds`, [{ name: "", dose_mg: "", freq_per_day: "", since_months: "" }])).map((med, i) => (
                  <TcMedBlock key={i} med={med} index={i}
                    onChange={updated => { const arr = [...get(`${key}_meds`, [{}])]; arr[i] = updated; set(`${key}_meds`, arr); }}
                    onRemove={i > 0 ? () => { const arr = get(`${key}_meds`, []).filter((_, j) => j !== i); set(`${key}_meds`, arr); } : null}
                  />
                ))}
                <button onClick={() => set(`${key}_meds`, [...get(`${key}_meds`, [{}]), { name: "", dose_mg: "", freq_per_day: "", since_months: "" }])}
                  style={{ background: "none", border: "1px dashed #d35400", color: "#d35400", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>
                  + Add another medicine
                </button>
              </div>
            )}
          </TcSectionCard>
        )}
        <TcOutputBox text={get(`${key}_status`) === "yes" ? `${outputLabel} since last ${durationText(get(`${key}_years`), get(`${key}_months`), get(`${key}_since_date`))}.` : ""} />
      </div>
    );
  }

  // ── Shell ─────────────────────────────────────────────────────────────────
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
          <span style={{ fontSize: 12, color: "#888" }}>CA Thyroid</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#d35400" }}>{progress}%</span>
        </div>
        <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3 }}>
          <div style={{ height: 6, background: "#d35400", borderRadius: 3, width: `${progress}%`, transition: "width 0.3s" }} />
        </div>
        <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
          Module {pageId.replace(/[0-9a-z_]+$/, "")} · {pageId}
          {saveMsg && <span style={{ marginLeft: 12, color: (saveMsg.includes("failed") || saveMsg.includes("Please answer")) ? "#e74c3c" : "#27ae60" }}>{saveMsg}</span>}
        </div>
      </div>

      {/* Question */}
      <div ref={pageContentRef} style={{ position: "relative", paddingTop: 24, paddingBottom: incompleteList.length > 0 ? 130 : 80 }}>
        {renderPage()}
        <TcMissingPointer containerRef={pageContentRef} pageKey={pageId}
          active={reviewMode && incompleteList.some(({ idx }) => idx === currentPage)} />
      </div>

      {/* Bottom strip listing every unanswered question — stacked just
          above the already-fixed nav bar. */}
      {incompleteList.length > 0 && (
        <div style={{ position: "fixed", bottom: 60, left: 0, right: 0, zIndex: 40, background: "#fff", borderTop: "2px solid #e6a3a3", boxShadow: "0 -2px 12px rgba(0,0,0,0.10)", padding: "10px 20px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", maxWidth: 680, margin: "0 auto" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#a83232", marginRight: 4 }}>{incompleteList.length} unanswered — jump to:</span>
          {incompleteList.map(({ id, idx }) => (
            <button key={id} onClick={() => { setSaveMsg(""); setCurrentPage(idx); }}
              style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 12, cursor: "pointer", border: `1.5px solid ${idx === currentPage ? "#d35400" : "#e6a3a3"}`, background: idx === currentPage ? "#fef5ef" : "#fff", color: idx === currentPage ? "#d35400" : "#a83232" }}>
              Q{idx + 1}
            </button>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #f0f0f0", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 680, margin: "0 auto" }}>
        <button
          onClick={currentPage === 0 ? onBack : prev}
          disabled={currentPage === 0 && !onBack}
          style={{ padding: "10px 24px", border: "1.5px solid #d0d7e8", borderRadius: 8, background: "transparent", color: (currentPage === 0 && !onBack) ? "#ccc" : "#555", cursor: (currentPage === 0 && !onBack) ? "not-allowed" : "pointer", fontSize: 14 }}
        >
          ← Back
        </button>

        <button
          onClick={next}
          disabled={yearInvalid}
          style={{ padding: "10px 28px", border: "none", borderRadius: 8, background: yearInvalid ? "#ccc" : "#d35400", color: "#fff", cursor: yearInvalid ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}
        >
          {reviewMode ? "Next unanswered →" : currentPage === totalPages - 1 ? "Submit ✓" : "Next →"}
        </button>
      </div>
    </div>
  );
}
