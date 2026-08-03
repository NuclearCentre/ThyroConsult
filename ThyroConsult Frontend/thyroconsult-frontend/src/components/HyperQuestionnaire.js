// ============================================================
// HyperQuestionnaire.js
// Chatbot-style questionnaire for Hyperthyroidism / Graves' Disease / AFTN / Toxic MNG
// 1 question per page. Yes → sub-questions on same page. No/Unsure → next page immediately.
// Matches HypoQuestionnaire architecture exactly.
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { conditionAPI, patientAPI } from "../api/index";
import { Spinner, AdditionalDocumentsUploader, LabReportUpload } from "./common/index";

// ─── Primitive UI helpers (Hyper-prefixed to avoid conflicts) ────────────────

const HyperField = ({ label, children, hint }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontWeight: 600, marginBottom: 6, color: "#1a1a2e", fontSize: 14 }}>{label}</label>}
    {hint && <p style={{ margin: "0 0 6px", fontSize: 12, color: "#666" }}>{hint}</p>}
    {children}
  </div>
);

const HyperInput = ({ value, onChange, type = "text", placeholder, min, max, style }) => (
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
// A plain min attribute doesn't stop a typed value from being submitted,
// so this validates live and shows an inline error.
const HyperYearInput = ({ value, onChange, dob, placeholder, style }) => {
  const dobYear = dob ? new Date(dob).getFullYear() : null;
  const thisYear = new Date().getFullYear();
  const invalid = dobYear && value && parseInt(value) < dobYear;
  return (
    <div>
      <HyperInput type="number" value={value} onChange={onChange} placeholder={placeholder}
        min={dobYear || 1950} max={thisYear} style={style} />
      {invalid && (
        <div style={{ fontSize: 11, color: "#c0392b", marginTop: 4 }}>
          Can't be before your birth year ({dobYear})
        </div>
      )}
    </div>
  );
};

const HyperSelect = ({ value, onChange, options, placeholder }) => (
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

// Fixed dose-pill grid (5 per row), matching HypoQuestionnaire's
// HypoPillSelect exactly — single-select, behaves like a radio group.
const HyperPillSelect = ({ options, value, onChange, perRow = 5 }) => (
  <div data-hyporeq-type="select" data-hyporeq-filled={value ? "true" : "false"}
    style={{ display: "grid", gridTemplateColumns: `repeat(${perRow}, 1fr)`, gap: 8, marginBottom: 12 }}>
    {options.map(opt => {
      const sel = value === opt;
      return (
        <div key={opt} onClick={() => onChange(opt)} style={{
          display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
          padding: "8px 6px", borderRadius: 8, cursor: "pointer", fontSize: 13,
          border: `1.5px solid ${sel ? "#3a7bd5" : "#d0d7e8"}`,
          background: sel ? "#eef4ff" : "#fff",
          color: sel ? "#3a7bd5" : "#1a1a2e",
          minHeight: 40, boxSizing: "border-box",
        }}>{opt} mg</div>
      );
    })}
  </div>
);

const HyperRadioGroup = ({ value, onChange, options, inline }) => (
  <div data-hyporeq-type="select" data-hyporeq-filled={value ? "true" : "false"} style={{ display: "flex", flexDirection: inline ? "row" : "column", gap: 10, flexWrap: "wrap" }}>
    {options.map(o => (
      <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${value === o.value ? "#3a7bd5" : "#d0d7e8"}`, background: value === o.value ? "#eef4ff" : "#fff", fontWeight: value === o.value ? 600 : 400, fontSize: 14, whiteSpace: "nowrap" }}>
        <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} style={{ accentColor: "#3a7bd5" }} />
        {o.label}
      </label>
    ))}
  </div>
);

const HyperCheckGroup = ({ values = [], onChange, options }) => {
  const toggle = (val) => {
    const next = values.includes(val) ? values.filter(v => v !== val) : [...values, val];
    onChange(next);
  };
  return (
    <div data-hyporeq-type="select" data-hyporeq-filled={values.length ? "true" : "false"} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {options.map(o => (
        <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${values.includes(o.value) ? "#3a7bd5" : "#d0d7e8"}`, background: values.includes(o.value) ? "#eef4ff" : "#fff", fontSize: 14 }}>
          <input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} style={{ accentColor: "#3a7bd5" }} />
          {o.label}
        </label>
      ))}
    </div>
  );
};

const HyperYesNoUnsure = ({ value, onChange }) => (
  <HyperRadioGroup value={value} onChange={onChange} inline options={[{ value: "no", label: "No" }, { value: "unsure", label: "Unsure" }, { value: "yes", label: "Yes" }]} />
);

const HyperYearGrid = ({ selectedYear, onSelect, onClose }) => {
  const currentYear = new Date().getFullYear();
  const [blockStart, setBlockStart] = useState(
    Math.floor(((selectedYear || currentYear) - 1) / 12) * 12 + 1
  );
  const years = Array.from({ length: 12 }, (_, i) => blockStart + i);
  return (
    <div style={{ position: "absolute", zIndex: 20, marginTop: 4, background: "#fff", border: "1.5px solid #d0d7e8", borderRadius: 8, padding: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", width: 200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button type="button" onClick={() => setBlockStart(b => b - 12)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 15, padding: "2px 8px" }}>‹</button>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#555" }}>{blockStart}–{blockStart + 11}</span>
        <button type="button" onClick={() => setBlockStart(b => b + 12)} disabled={blockStart + 12 > currentYear}
          style={{ border: "none", background: "none", cursor: blockStart + 12 > currentYear ? "default" : "pointer", fontSize: 15, padding: "2px 8px", opacity: blockStart + 12 > currentYear ? 0.3 : 1 }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {years.map(y => (
          <button type="button" key={y} disabled={y > currentYear}
            onClick={() => { onSelect(y); onClose(); }}
            style={{
              padding: "8px 0", fontSize: 12, borderRadius: 6, cursor: y > currentYear ? "default" : "pointer",
              border: y === selectedYear ? "1.5px solid #3a7bd5" : "1px solid #d0d7e8",
              background: y === selectedYear ? "#eaf1fc" : "#fff",
              color: y > currentYear ? "#ccc" : (y === selectedYear ? "#3a7bd5" : "#333"),
            }}>
            {y}
          </button>
        ))}
      </div>
    </div>
  );
};

const HYPER_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const HyperDobField = ({ dob, ageYears, ageMonths, onChange }) => {
  const [showYearGrid, setShowYearGrid] = useState(false);
  const parsed = dob ? new Date(dob + "T00:00:00") : null;
  const day = parsed ? parsed.getDate() : "";
  const month = parsed ? parsed.getMonth() : "";
  const year = parsed ? parsed.getFullYear() : null;

  const setDatePart = (d, m, y) => {
    if (d && m !== "" && y) {
      const mm = String(m + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const newDob = `${y}-${mm}-${dd}`;
      const now = new Date();
      const bd = new Date(newDob);
      let yy = now.getFullYear() - bd.getFullYear();
      let mo = now.getMonth() - bd.getMonth();
      if (mo < 0) { yy--; mo += 12; }
      onChange({ dob: newDob, ageYears: String(yy), ageMonths: String(mo) });
    }
  };

  const setAgePart = (field, val) => {
    const newAgeYears = field === "years" ? val : ageYears;
    const newAgeMonths = field === "months" ? val : ageMonths;
    const totalMonths = (parseInt(newAgeYears) || 0) * 12 + (parseInt(newAgeMonths) || 0);
    const approxDob = new Date();
    approxDob.setMonth(approxDob.getMonth() - totalMonths);
    onChange({
      dob: totalMonths > 0 ? approxDob.toISOString().split("T")[0] : "",
      ageYears: newAgeYears, ageMonths: newAgeMonths,
    });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={day} onChange={e => setDatePart(parseInt(e.target.value), month === "" ? 0 : month, year || new Date().getFullYear())}
          style={{ padding: "8px 6px", fontSize: 13, borderRadius: 6, border: "1.5px solid #d0d7e8" }}>
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={month} onChange={e => setDatePart(day || 1, parseInt(e.target.value), year || new Date().getFullYear())}
          style={{ padding: "8px 6px", fontSize: 13, borderRadius: 6, border: "1.5px solid #d0d7e8" }}>
          <option value="">Month</option>
          {HYPER_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setShowYearGrid(s => !s)}
            style={{ padding: "8px 12px", fontSize: 13, borderRadius: 6, border: "1.5px solid #d0d7e8", background: "#fff", cursor: "pointer", minWidth: 70 }}>
            {year || "Year"}
          </button>
          {showYearGrid && (
            <HyperYearGrid selectedYear={year} onSelect={y => setDatePart(day || 1, month === "" ? 0 : month, y)} onClose={() => setShowYearGrid(false)} />
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#888", margin: "10px 0 6px" }}>— or, if you don't know the exact date —</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="number" min="0" max="120" value={ageYears} onChange={e => setAgePart("years", e.target.value)}
          placeholder="Years" style={{ width: 70, padding: "8px 10px", fontSize: 13, borderRadius: 6, border: "1.5px solid #d0d7e8" }} />
        <input type="number" min="0" max="11" value={ageMonths} onChange={e => setAgePart("months", e.target.value)}
          placeholder="Months" style={{ width: 80, padding: "8px 10px", fontSize: 13, borderRadius: 6, border: "1.5px solid #d0d7e8" }} />
      </div>
    </div>
  );
};

const HyperDurationPicker = ({ label = "Since when?", sinceDate, onSinceDate, years, onYears, months, onMonths, minDate }) => (
  <HyperField label={label}>
    <div data-hyporeq-type="duration" data-hyporeq-filled={(sinceDate || years || months) ? "true" : "false"} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 180px" }}>
        <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Date (if known)</label>
        <HyperInput type="date" value={sinceDate} onChange={onSinceDate} max={new Date().toISOString().split("T")[0]} min={minDate || undefined} />
      </div>
      <div style={{ display: "flex", gap: 8, flex: "1 1 160px", alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Years</label>
          <HyperInput type="number" value={years} onChange={onYears} min={0} max={100} placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Months</label>
          <HyperInput type="number" value={months} onChange={onMonths} min={0} max={11} placeholder="0" />
        </div>
      </div>
    </div>
  </HyperField>
);

const HyperMedBlock = ({ med, index, onChange, onRemove, showSince = true, doseLabel = "Dose (mg)" }) => (
  <div style={{ border: "1px solid #d0d7e8", borderRadius: 8, padding: 14, marginBottom: 10, background: "#fafbff" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <span style={{ fontWeight: 600, fontSize: 13, color: "#3a7bd5" }}>Medicine {index + 1}</span>
      {onRemove && <button onClick={onRemove} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 13 }}>✕ Remove</button>}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <HyperField label="Medicine name">
        <HyperInput value={med.name} onChange={v => onChange({ ...med, name: v })} placeholder="e.g. Atorvastatin" />
      </HyperField>
      <HyperField label={doseLabel}>
        <HyperInput type="number" value={med.dose_mg} onChange={v => onChange({ ...med, dose_mg: v })} placeholder="e.g. 20" />
      </HyperField>
      <HyperField label="Times per day">
        <HyperInput type="number" value={med.freq_per_day} onChange={v => onChange({ ...med, freq_per_day: v })} min={1} max={10} placeholder="e.g. 1" />
      </HyperField>
      {showSince && (
        <HyperField label="Since (months)">
          <HyperInput type="number" value={med.since_months} onChange={v => onChange({ ...med, since_months: v })} min={0} placeholder="e.g. 6" />
        </HyperField>
      )}
    </div>
  </div>
);

// No longer rendered on the patient-facing screen (per explicit request).
// Underlying answers still save normally regardless of this.
const HyperOutputBox = () => null;

// Report upload + AI auto-fill now comes from the shared LabReportUpload
// component (common/index.js) — previously a separate near-identical
// local copy lived here (HyperLabReportUpload). Consolidated so the
// upload experience is visually and behaviorally identical across every
// questionnaire module. This questionnaire's own question order/
// branching/sequence is unchanged — only the upload widget moved.

const HyperSectionCard = ({ title, children }) => (
  <div style={{ marginTop: 20, padding: "16px 20px", border: "1.5px solid #d0d7e8", borderRadius: 10, background: "#fff" }}>
    {title && <p style={{ margin: "0 0 14px", fontWeight: 700, color: "#3a7bd5", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</p>}
    {children}
  </div>
);

// ─── Month helper ─────────────────────────────────────────────────────────────
function totalMonths(years, months) {
  return (parseInt(years) || 0) * 12 + (parseInt(months) || 0);
}
function durationText(years, months, sinceDate) {
  if (sinceDate) {
    const d = new Date(sinceDate);
    const now = new Date();
    const diffMs = now - d;
    const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const y = Math.floor(totalDays / 365);
    const m = Math.floor((totalDays % 365) / 30);
    const dy = totalDays % 30;
    if (y > 0 && m > 0) return `${y} year${y > 1 ? "s" : ""} and ${m} month${m > 1 ? "s" : ""}`;
    if (y > 0) return `${y} year${y > 1 ? "s" : ""}`;
    if (m > 0) return `${m} month${m > 1 ? "s" : ""}`;
    return `${dy} day${dy !== 1 ? "s" : ""}`;
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
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB");
}

// ─── Per-page completion validators ──────────────────────────────────────
// Mirrors HypoQuestionnaire's HYPO_PAGE_VALIDATORS exactly in spirit: pure
// functions taking the raw data object, returning whether that page is
// complete. Built directly from each page's own actual render logic above
// (which sub-fields it reveals on "yes" and what its own output text
// depends on) — not guessed. Where a page's own output text doesn't gate
// on a particular sub-field (e.g. optional multi-selects), that field is
// treated as optional here too, matching the page's own stated intent.
// ─── Antithyroid drug brand → generic name + available doses (mg) ───
const ANTITHYROID_DRUG_BRANDS = {
  'Methimercazole': { generic: 'Methimazole', doses: [5, 10] },
  'Methimez':       { generic: 'Methimazole', doses: [5, 10] },
  'Neo-Mercazole':  { generic: 'Carbimazole', doses: [5, 10, 20] },
  'Anti-Thyrox':    { generic: 'Carbimazole', doses: [5, 10] },
  'Thyrocab':       { generic: 'Carbimazole', doses: [5, 10, 20] },
  'Neomerdin':      { generic: 'Carbimazole', doses: [5] },
  'Propylthiouracil': { generic: 'Propylthiouracil', doses: [25, 50] },
  'PTU':            { generic: 'Propylthiouracil', doses: [25, 50] },
};

const dur = d => !!(d && (d.since_date || d.years || d.months));
const HYPER_PAGE_VALIDATORS = {
  A3: d => !!d.marital_status,

  B1: d => !!d.hysterectomy_status && (d.hysterectomy_status !== "yes" || (!!d.hysterectomy_year && !!d.hysterectomy_reason && (d.hysterectomy_reason !== "other" || !!d.hysterectomy_reason_other))),
  B2: d => !!d.menopause_status && (d.menopause_status !== "post" || !!d.menopause_year),
  B3: d => !!d.menstrual_status && (d.menstrual_status !== "yes" || !!d.menstrual_pattern),
  B4: d => !!d.lmp_date,
  B5: d => {
    const lmpDaysAgo = d.lmp_date ? Math.floor((new Date() - new Date(d.lmp_date)) / 86400000) : 0;
    if (lmpDaysAgo < 31) return true; // page just shows an info message, nothing to answer
    return !!d.pregnancy_status;
  },

  C1: d => !!d.thyroid_dx_status && (d.thyroid_dx_status !== "yes" || (!!d.thyroid_dx_type && !!d.thyroid_dx_year)),
  C2a: d => !!d.thyroid_surgery_status && (d.thyroid_surgery_status !== "yes" || (!!d.thyroid_surgery_type && (d.thyroid_surgery_type !== "hemi" || !!d.thyroid_surgery_side))),
  C2b: d => !!d.rai_status && (d.rai_status !== "yes" || ((d.rai_courses || []).some(c => c.dose_mci && c.year) && !!d.rai_post_hypothyroid)),
  C3: d => !!d.med_status && (d.med_status !== "yes" || (!!d.med_drug_name && !!d.med_brand_name && !!d.med_dose_mg && !!d.med_tablets && !!d.med_compliance)),
  C4: d => !!d.family_thyroid_status && (d.family_thyroid_status !== "yes" || (d.family_thyroid_data || []).some(e => e.relation && e.condition)),
  C5: d => !!d.autoimmune_status && (d.autoimmune_status !== "yes" || (d.autoimmune_data || []).some(e => e.condition)),

  D1: d => !!d.tsh_status && (d.tsh_status !== "yes" || (!!d.tsh_value && !!d.tsh_date)),
  D2: d => !!d.ft4_status && (d.ft4_status !== "yes" || (!!d.ft4_value && !!d.ft4_date)),
  D3: d => !!d.ft3_status && (d.ft3_status !== "yes" || (!!d.ft3_value && !!d.ft3_date)),
  // TRAb/TSI and Anti-TPO/Anti-Tg values are explicitly stated as optional
  // in the page's own UI text ("Either or both can be filled — neither is
  // mandatory") — only the top-level status is required, matching that.
  D4: d => !!d.trab_status,
  D5: d => !!d.antibody_status,
  D6: d => !!d.imaging_status && (d.imaging_status !== "yes" || ((d.imaging_types || []).length > 0 && !!d.imaging_date)),

  E1: d => !!d.hyper_cause_known && (d.hyper_cause_known !== "yes" || (!!d.hyper_cause_type && dur({ since_date: d.hyper_cause_since_date, years: d.hyper_cause_since_years, months: d.hyper_cause_since_months_val }))),
  E2: d => !!d.graves_confirmed && (d.graves_confirmed !== "yes" || (!!d.trab_positive && !!d.ophthal_status && !!d.dermopathy_status && !!d.acropathy_status)),
  E3: d => !!d.toxic_nodule_confirmed && (d.toxic_nodule_confirmed !== "yes" || (!!d.toxic_nodule_type && !!d.e3_fnac_status && (d.e3_fnac_status !== "yes" || (!!d.e3_fnac_date && !!d.e3_fnac_result)))),
  E4: d => !!d.goitre_status && (d.goitre_status !== "yes" || (!!d.goitre_size_label && !!d.goitre_pressure_status && (d.goitre_pressure_status !== "yes" || (d.goitre_pressure_types || []).length > 0))),
  E5: d => !!d.fnac_status && (d.fnac_status !== "yes" || (!!d.fnac_date && !!d.fnac_result)),

  // ── Module F — symptom pages (renderSymptomPage/renderHairNailPage) ──
  F1: d => !!d.sym_fatigue_status && (d.sym_fatigue_status !== "yes" || (dur({ since_date: d.sym_fatigue_since_date, years: d.sym_fatigue_years, months: d.sym_fatigue_months }) && !!d.sym_fatigue_severity)),
  F2: d => !!d.sym_weight_status && (d.sym_weight_status !== "yes" || (!!d.sym_weight_direction && !!d.sym_weight_kg && dur({ since_date: d.sym_weight_since_date, years: d.sym_weight_years, months: d.sym_weight_months }))),
  F3: d => !!d.sym_appetite_status,
  F4: d => !!d.sym_heat_status && (d.sym_heat_status !== "yes" || (dur({ since_date: d.sym_heat_since_date, years: d.sym_heat_years, months: d.sym_heat_months }) && !!d.sym_heat_impact)),
  F5: d => !!d.sym_sweating_status && (d.sym_sweating_status !== "yes" || (!!d.sym_sweating_pattern && dur({ since_date: d.sym_sweating_since_date, years: d.sym_sweating_years, months: d.sym_sweating_months }))),
  F6: d => !!d.sym_bowel_status && (d.sym_bowel_status !== "yes" || (!!d.sym_bowel_type && dur({ since_date: d.sym_bowel_since_date, years: d.sym_bowel_years, months: d.sym_bowel_months }))),
  F7: d => !!d.sym_skin_status && (d.sym_skin_status !== "yes" || ((d.sym_skin_types || []).length > 0 && dur({ since_date: d.sym_skin_since_date, years: d.sym_skin_years, months: d.sym_skin_months }))),
  F8a: d => !!d.sym_periorbital_status && (d.sym_periorbital_status !== "yes" || dur({ since_date: d.sym_periorbital_since_date, years: d.sym_periorbital_years, months: d.sym_periorbital_months })),
  F8b: d => !!d.sym_facial_status && (d.sym_facial_status !== "yes" || dur({ since_date: d.sym_facial_since_date, years: d.sym_facial_years, months: d.sym_facial_months })),
  F9: d => !!d.sym_pedal_status && (d.sym_pedal_status !== "yes" || (!!d.sym_pedal_type && dur({ since_date: d.sym_pedal_since_date, years: d.sym_pedal_years, months: d.sym_pedal_months }))),
  F10: d => !!d.sym_hair_status && (d.sym_hair_status !== "yes" || (d.sym_hair_data || []).length > 0),
  F11: d => !!d.sym_nail_status && (d.sym_nail_status !== "yes" || (d.sym_nail_data || []).length > 0),
  F12: d => !!d.sym_hoarseness_status && (d.sym_hoarseness_status !== "yes" || (!!d.sym_hoarseness_pattern && dur({ since_date: d.sym_hoarseness_since_date, years: d.sym_hoarseness_years, months: d.sym_hoarseness_months }))),
  F13: d => !!d.sym_myopathy_status && (d.sym_myopathy_status !== "yes" || (!!d.sym_myopathy_location && dur({ since_date: d.sym_myopathy_since_date, years: d.sym_myopathy_years, months: d.sym_myopathy_months }))),
  F14: d => !!d.sym_cramp_status && (d.sym_cramp_status !== "yes" || dur({ since_date: d.sym_cramp_since_date, years: d.sym_cramp_years, months: d.sym_cramp_months })),
  F15: d => !!d.sym_tremor_status && (d.sym_tremor_status !== "yes" || (!!d.sym_tremor_type_val && dur({ since_date: d.sym_tremor_since_date, years: d.sym_tremor_years, months: d.sym_tremor_months }))),
  F16: d => !!d.sym_anxiety_status && (d.sym_anxiety_status !== "yes" || (!!d.sym_anxiety_seen_doctor && !!d.sym_anxiety_diagnosed && dur({ since_date: d.sym_anxiety_since_date, years: d.sym_anxiety_years, months: d.sym_anxiety_months }))),
  F17: d => !!d.sym_irritability_status && (d.sym_irritability_status !== "yes" || dur({ since_date: d.sym_irritability_since_date, years: d.sym_irritability_years, months: d.sym_irritability_months })),
  F18: d => !!d.sym_insomnia_status && (d.sym_insomnia_status !== "yes" || ((d.sym_insomnia_types || []).length > 0 && dur({ since_date: d.sym_insomnia_since_date, years: d.sym_insomnia_years, months: d.sym_insomnia_months }))),
  F19: d => !!d.sym_palp_status && (d.sym_palp_status !== "yes" || (!!d.sym_palp_pattern && dur({ since_date: d.sym_palp_since_date, years: d.sym_palp_years, months: d.sym_palp_months }))),
  F20: d => !!d.sym_af_status && (d.sym_af_status !== "yes" || (!!d.sym_af_confirmed && dur({ since_date: d.sym_af_since_date, years: d.sym_af_years, months: d.sym_af_months }) && !!d.sym_af_on_med && (d.sym_af_on_med !== "yes" || (d.sym_af_med_data || []).some(m => m.name)))),
  F21: d => !!d.sym_giddiness_status && (d.sym_giddiness_status !== "yes" || (!!d.sym_giddiness_freq && dur({ since_date: d.sym_giddiness_since_date, years: d.sym_giddiness_years, months: d.sym_giddiness_months }))),
  F22: d => !!d.sym_blackout_status && (d.sym_blackout_status !== "yes" || (!!d.sym_blackout_count && !!d.sym_blackout_last_date && !!d.sym_blackout_assessed && (d.sym_blackout_assessed !== "yes" || !!d.sym_blackout_dx))),
  F23: d => !!d.sym_dyspnoea_status && (d.sym_dyspnoea_status !== "yes" || (!!d.sym_dyspnoea_onset && dur({ since_date: d.sym_dyspnoea_since_date, years: d.sym_dyspnoea_years, months: d.sym_dyspnoea_months }))),
  F24: d => !!d.sym_concentration_status && (d.sym_concentration_status !== "yes" || (dur({ since_date: d.sym_concentration_since_date, years: d.sym_concentration_years, months: d.sym_concentration_months }) && !!d.sym_concentration_impact)),
  F25: d => !!d.sym_memory_status && (d.sym_memory_status !== "yes" || (dur({ since_date: d.sym_memory_since_date, years: d.sym_memory_years, months: d.sym_memory_months }) && !!d.sym_memory_impact)),

  // ── Module G — treatment & monitoring ──
  G2: d => !!d.definitive_tx_status && (d.definitive_tx_status !== "yes" || !!d.definitive_tx_type),
  G3: d => !!d.dose_changed_status && (d.dose_changed_status !== "yes" || (!!d.dose_changed_date && !!d.dose_change_direction && !!d.dose_changed_reason)),
  G4: d => !!d.beta_blocker_status && (d.beta_blocker_status !== "yes" || (!!d.beta_blocker_name && !!d.beta_blocker_dose && !!d.beta_blocker_freq)),
  G5: d => !!d.monitoring_status && (d.monitoring_status !== "yes" || !!d.review_frequency_val),

  // ── Module H — comorbidities ──
  H1: d => !!d.dyslipidaemia_status && (d.dyslipidaemia_status !== "yes" || (!!d.dyslipidaemia_since_months && !!d.dyslipidaemia_on_med && (d.dyslipidaemia_on_med !== "yes" || (d.dyslipidaemia_med_data || []).some(m => m.name)))),
  H2: d => !!d.diabetes_status && (d.diabetes_status !== "yes" || (!!d.diabetes_type && !!d.diabetes_since_months && !!d.diabetes_on_med && (d.diabetes_on_med !== "yes" || (d.diabetes_med_data || []).some(m => m.name)))),
  H3: d => !!d.anaemia_status && (d.anaemia_status !== "yes" || ((d.anaemia_types || []).length > 0 && !!d.anaemia_on_med && (d.anaemia_on_med !== "yes" || (d.anaemia_med_data || []).some(m => m.name)))),
  H4: d => !!d.pcos_status && (d.pcos_status !== "yes" || (!!d.pcos_label && !!d.pcos_since_months && !!d.pcos_on_med && (d.pcos_on_med !== "yes" || (d.pcos_med_data || []).some(m => m.name)))),
  H5: d => !!d.infertility_status,
  H6: d => !!d.depression_status && (d.depression_status !== "yes" || !!d.depression_on_med_status),
  H8: d => !!d.osteoporosis_status && (d.osteoporosis_status !== "yes" || (!!d.osteoporosis_dexa_status && !!d.osteoporosis_on_med && (d.osteoporosis_on_med !== "yes" || (d.osteoporosis_med_data || []).some(m => m.name)))),
  H9: () => true, // optional free-text notes
  DONE: () => true,
};

// ─── Missing-field pointer — identical mechanism to HypoQuestionnaire's
// HypoMissingPointer: scans the current page's DOM for the first
// data-hyporeq-filled="false" marker and points a small animated arrow at
// it with a plain-language hint, live-tracking via MutationObserver as
// the patient fills things in. ───
const HYPERREQ_MESSAGES = { select: "Select any one", date: "Enter date", duration: "Enter duration", text: "Enter details" };
const HyperMissingPointer = ({ containerRef, active, pageKey }) => {
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
        @keyframes hyperreqBounce { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(7px); } }
        .hyperreq-arrow { animation: hyperreqBounce 0.9s ease-in-out infinite; }
      `}</style>
      <div style={{ position: "absolute", top: Math.max(0, pos.top - 30), left: pos.left, display: "flex", alignItems: "center", gap: 4, zIndex: 5, pointerEvents: "none" }}>
        <div style={{ background: "#c0392b", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap" }}>
          {HYPERREQ_MESSAGES[pos.type] || "Answer this question"}
        </div>
        <div className="hyperreq-arrow" style={{ fontSize: 15, color: "#c0392b" }}>➜</div>
      </div>
    </>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function HyperQuestionnaire({ episodeId, patientId, patientDob, patientGender, maritalStatus, hysterectomyDone, onComplete, onBack }) {
  const isFemale = patientGender === "female" || patientGender === "Female";
  const hidePregnancy = ["unmarried", "divorced", "widowed"].includes((maritalStatus || "").toLowerCase()) || hysterectomyDone;

  const [data, setData] = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [savedPageId, setSavedPageId] = useState(null);
  const [resumedFrom, setResumedFrom] = useState(false);

  const set = useCallback((key, value) => setData(prev => ({ ...prev, [key]: value })), []);
  const get = useCallback((key, fallback = "") => (data[key] !== undefined ? data[key] : fallback), [data]);

  // DOB/gender no longer asked here at all (A1/A2 removed — patient already
  // gave these at registration; TC/Nodule already worked this way, this
  // brings Hyper in line with them). data.dob is still pre-filled from the
  // prop so the ~35 existing get("dob") call sites throughout this file
  // (mostly minDate={get("dob")} on duration pickers) keep working
  // unchanged rather than needing to touch every one individually.
  useEffect(() => {
    if (patientDob) setData(prev => ({ ...prev, dob: patientDob }));
  }, [patientDob]);

  // ── Dynamic page list ─────────────────────────────────────────────────────
  const allPages = useMemo(() => {
    const internalHysterectomy = get("hysterectomy_status") === "yes";
    const hideInfertility = !isFemale || hidePregnancy || internalHysterectomy;
    const pages = [
      "A3",
      ...(isFemale ? ["B1", "B2", "B3", "B4", "B5"] : []),
      "C1", "C2a", "C2b", "C3", "C4", "C5",
      "D1", "D2", "D3", "D4", "D5", "D6",
      "E1",
      ...(get("hyper_cause_type") === "graves_disease" ? ["E2"] : []),
      ...(["toxic_mng", "aftn"].includes(get("hyper_cause_type")) ? ["E3"] : []),
      "E4",
      ...(get("e3_fnac_status") !== "yes" ? ["E5"] : []),
      "F1", "F2", "F3", "F4", "F5", "F6", "F7",
      "F8a", "F8b", "F9", "F10", "F11", "F12",
      "F13", "F14", "F15", "F16", "F17", "F18",
      "F19", "F20", "F21", "F22", "F23", "F24", "F25",
      "G2",
      ...(get("med_status") === "yes" ? ["G3"] : []),
      "G4", "G5",
      "H1", "H2", "H3",
      ...(isFemale ? ["H4"] : []),
      ...(!hideInfertility ? ["H5"] : []),
      "H6", "H8", "H9",
      "DONE",
    ];
    return pages;
  }, [isFemale, hidePregnancy, get("hyper_cause_type"), get("med_status"), get("e3_fnac_status"), get("hysterectomy_status")]);

  const pageId = allPages[currentPage];
  const progress = Math.round((currentPage / (allPages.length - 1)) * 100);

  // Blocks proceeding past a screen whose year-of-event field is before
  // the patient's own birth year.
  // dob is guaranteed present from registration (patientDob prop) now that
  // A1 is gone — no more "did the patient fill this in" check needed here,
  // matching TC/Nodule's equivalent logic.
  const dobYear = patientDob ? new Date(patientDob).getFullYear() : null;
  const yearFieldByPage = { B1: "hysterectomy_year", B2: "menopause_year", C1: "thyroid_dx_year", C2a: "thyroid_surgery_year" };
  const currentYearField = yearFieldByPage[pageId];
  const yearInvalid = dobYear && currentYearField && get(currentYearField) && parseInt(get(currentYearField)) < dobYear;

  // Set once handleSubmit finds an incomplete page — while true, "Next"
  // jumps straight to the next INCOMPLETE page instead of advancing one
  // page at a time, skipping every already-answered page in between.
  const [reviewMode, setReviewMode] = useState(false);
  const pageContentRef = useRef(null);

  // Single source of truth for "what's still incomplete" — recomputed
  // live from data on every render, read by both goNext's jump logic and
  // the bottom strip below.
  const incompleteList = reviewMode
    ? allPages
        .map((id, idx) => ({ id, idx }))
        .filter(({ id }) => { const v = HYPER_PAGE_VALIDATORS[id]; return v ? !v(data) : false; })
    : [];

  const next = () => {
    if (yearInvalid) return;
    if (reviewMode) {
      const leavingValidator = HYPER_PAGE_VALIDATORS[pageId];
      if (leavingValidator && !leavingValidator(data)) { setSaveMsg("Please answer this question before continuing."); return; }
      setSaveMsg("");
      const ahead = incompleteList.find(({ idx }) => idx > currentPage);
      const target = ahead || incompleteList[0];
      if (target) { setCurrentPage(target.idx); return; }
      handleSubmit();
      return;
    }
    setCurrentPage(p => Math.min(p + 1, allPages.length - 1));
  };
  const prev = () => setCurrentPage(p => Math.max(p - 1, 0));

  // Resume exactly where the patient left off, once, after allPages has
  // been recomputed with the branching-relevant answers restored.
  useEffect(() => {
    if (!resumedFrom && savedPageId) {
      const idx = allPages.indexOf(savedPageId);
      if (idx > 0) setCurrentPage(idx);
      setResumedFrom(true);
    }
  }, [savedPageId, resumedFrom, allPages]);

  const submitFinal = async () => {
    setSaving(true);
    try {
      await conditionAPI.saveHyperQ(patientId, episodeId, { ...data, _draft: false });
      onComplete && onComplete();
    } catch (e) { setSaveMsg("Submission failed. Please try again."); }
    setSaving(false);
  };

  // Every question needs an answer before the questionnaire can actually
  // be submitted — finds the first incomplete page (in display order, so
  // it respects branching) and routes there instead of submitting.
  // Without this, "Submit to my doctor" on the DONE page would save
  // whatever was filled in regardless of gaps.
  const handleSubmit = () => {
    const incompleteIdx = allPages.findIndex(id => { const v = HYPER_PAGE_VALIDATORS[id]; return v ? !v(data) : false; });
    if (incompleteIdx !== -1) {
      setReviewMode(true);
      setCurrentPage(incompleteIdx);
      setSaveMsg("Please answer this question before submitting — some questions were left incomplete.");
      return;
    }
    setReviewMode(false);
    submitFinal();
  };

  // ── Autosave ─────────────────────────────────────────────────────────────
  // Replaces the old manual "Save draft" button. NOTE: this used to send
  // { draft: true/false } — the backend destructures _draft (underscore),
  // so that flag was never actually being read; markQuestionnaireComplete
  // would have run on every save regardless. Fixed here to send _draft.
  const skipFirstAutosave = useRef(true);
  useEffect(() => {
    if (skipFirstAutosave.current) { skipFirstAutosave.current = false; return; }
    if (!patientId || !episodeId) return;
    const t = setTimeout(async () => {
      try {
        await conditionAPI.saveHyperQ(patientId, episodeId, { ...data, _draft: true, _currentPage: pageId });
        setSaveMsg("✓ Saved");
      } catch (e) { /* silent — retries on next change */ }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, currentPage]);

  // Load existing draft on mount
  // NOTE: backend returns the row flat, not wrapped in { data } — reading
  // r.data here meant previously-saved answers were never restored.
  const [draftLoadError, setDraftLoadError] = useState('');
  const loadDraft = useCallback(() => {
    setDraftLoadError('');
    conditionAPI.getHyperQ(patientId, episodeId)
      .then(r => {
        if (r && Object.keys(r).length > 0) {
          setData(prev => ({ ...prev, ...r }));
          if (r.current_page) setSavedPageId(r.current_page);
        }
      })
      .catch(() => {
        setDraftLoadError('Could not load your saved answers. Your previous answers have NOT been lost — please retry before continuing, rather than re-entering everything.');
      });
  }, [patientId, episodeId]);
  useEffect(() => { loadDraft(); }, [loadDraft]);

  // ── Rehydrate uploaded reports on every load — resume AND post-submit ──
  // Same fix as HypoQuestionnaire: documents are never deleted (see
  // patientController.uploadDocument), so the `documents` table (tagged
  // with episodeId + fieldLabel — migration 022) is the permanent source
  // of truth. Re-read it every time this questionnaire opens rather than
  // trusting a snapshot in the draft JSON, so uploaded files show as
  // already-there whether this is mid-draft, resumed later, or opened
  // long after the patient already submitted.
  useEffect(() => {
    if (!episodeId) return;
    const LABEL_TO_KEY = {
      "TSH": "tsh_reports",
      "FT4": "ft4_reports",
      "FT3": "ft3_reports",
      "TRAb": "trab_reports",
      "TSI": "tsi_reports",
      "Anti-TPO": "antitpo_reports",
      "Anti-Tg": "antitg_reports",
    };
    patientAPI.getDocuments({ episodeId })
      .then(res => {
        const docs = res?.documents || [];
        if (!docs.length) return;

        const grouped = {};
        let latestImaging = null;

        for (const d of docs) {
          const entry = { documentId: d.id, fileName: d.originalName };
          if (d.fieldLabel === "Thyroid imaging") {
            if (!latestImaging) latestImaging = entry;
            continue;
          }
          const key = LABEL_TO_KEY[d.fieldLabel];
          if (!key) continue;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(entry);
        }

        setData(prev => ({
          ...prev,
          ...grouped,
          ...(latestImaging ? { imaging_report: latestImaging } : {}),
        }));
      })
      .catch(() => {});
  }, [episodeId]);

  // Branch: if RAI caused hypothyroidism, signal parent to switch questionnaire
  useEffect(() => {
    if (get("rai_post_hypothyroid") === "yes" && onComplete) {
      onComplete({ switchToHypo: true });
    }
  }, [get("rai_post_hypothyroid")]);

  // ─── Page renderer ────────────────────────────────────────────────────────
  const renderPage = () => {
    switch (pageId) {

      // ══════════════════════════════════════════════════════
      // MODULE A — DEMOGRAPHICS
      // ══════════════════════════════════════════════════════

      case "A3": return (
        <div>
          <h3>What is your marital status?</h3>
          <HyperRadioGroup value={get("marital_status")} onChange={v => set("marital_status", v)} options={[{ value: "unmarried", label: "Unmarried" }, { value: "married", label: "Married" }, { value: "divorced", label: "Divorced" }, { value: "widowed", label: "Widowed" }]} inline />
          <HyperOutputBox text={get("marital_status") ? get("marital_status").charAt(0).toUpperCase() + get("marital_status").slice(1) : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE B — MENSTRUAL / PREGNANCY / HYSTERECTOMY
      // ══════════════════════════════════════════════════════

      case "B1": return (
        <div>
          <h3>Have you had a hysterectomy (surgical removal of the uterus)?</h3>
          <HyperYesNoUnsure value={get("hysterectomy_status")} onChange={v => set("hysterectomy_status", v)} />
          {get("hysterectomy_status") === "yes" && (
            <HyperSectionCard title="Hysterectomy details">
              <HyperField label="When was the surgery done?">
                <div style={{ display: "flex", gap: 10 }}>
                  <HyperSelect value={get("hysterectomy_month")} onChange={v => set("hysterectomy_month", v)} placeholder="Month" options={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => ({ value: String(i+1).padStart(2,"0"), label: m }))} />
                  <HyperYearInput value={get("hysterectomy_year")} onChange={v => set("hysterectomy_year", v)} dob={get("dob")} placeholder="Year" style={{ width: 120 }} />
                </div>
              </HyperField>
              <HyperField label="Reason for hysterectomy">
                <HyperRadioGroup value={get("hysterectomy_reason")} onChange={v => set("hysterectomy_reason", v)} options={[{ value: "excessive_bleeding", label: "Excessive bleeding" }, { value: "prolapse", label: "Prolapse of uterus" }, { value: "cancer", label: "Cancer of uterus or cervix" }, { value: "other", label: "Others" }]} />
                {get("hysterectomy_reason") === "other" && <HyperInput value={get("hysterectomy_reason_other")} onChange={v => set("hysterectomy_reason_other", v)} placeholder="Please specify" style={{ marginTop: 8 }} />}
              </HyperField>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("hysterectomy_status") === "yes" && get("hysterectomy_year") ? `H/o Hysterectomy for "${get("hysterectomy_reason") === "other" ? get("hysterectomy_reason_other") : (get("hysterectomy_reason") || "").replace(/_/g, " ")}" — ${new Date().getFullYear() - parseInt(get("hysterectomy_year"))} years ago` : ""} />
        </div>
      );

      case "B2": return (
        <div>
          <h3>Are you pre-menopausal, peri-menopausal, or post-menopausal?</h3>
          <HyperRadioGroup value={get("menopause_status")} onChange={v => set("menopause_status", v)} options={[{ value: "pre", label: "Pre-menopausal" }, { value: "peri", label: "Peri-menopausal" }, { value: "post", label: "Post-menopausal" }]} />
          {get("menopause_status") === "post" && (
            <HyperSectionCard title="Menopause details">
              <HyperField label="When did menopause occur? (Year)">
                <HyperYearInput value={get("menopause_year")} onChange={v => set("menopause_year", v)} dob={get("dob")} placeholder="e.g. 2019" />
              </HyperField>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("menopause_status") === "post" && get("menopause_year") ? `Post-menopausal status since last ${new Date().getFullYear() - parseInt(get("menopause_year"))} years` : ""} />
        </div>
      );

      case "B3": return (
        <div>
          <h3>Have you noticed any changes in your menstrual cycle?</h3>
          <HyperYesNoUnsure value={get("menstrual_status")} onChange={v => set("menstrual_status", v)} />
          {get("menstrual_status") === "yes" && (
            <HyperSectionCard title="Menstrual changes">
              <HyperField label="Pattern">
                <HyperRadioGroup value={get("menstrual_pattern")} onChange={v => set("menstrual_pattern", v)} options={[{ value: "regular", label: "Regular" }, { value: "irregular", label: "Irregular" }]} inline />
              </HyperField>
              <HyperField label="Flow (multi-select)">
                <HyperCheckGroup values={get("menstrual_flow", [])} onChange={v => set("menstrual_flow", v)} options={[{ value: "heavy", label: "Heavy" }, { value: "scanty", label: "Scanty" }, { value: "absent", label: "Absent" }, { value: "prolonged", label: "Prolonged" }]} />
              </HyperField>
              <HyperDurationPicker minDate={get("dob")} sinceDate={get("menstrual_since_date")} onSinceDate={v => set("menstrual_since_date", v)} years={get("menstrual_years")} onYears={v => set("menstrual_years", v)} months={get("menstrual_months")} onMonths={v => set("menstrual_months", v)} />
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("menstrual_status") === "yes" ? `${get("menstrual_pattern") || ""} ${(get("menstrual_flow", []).join(" and ")) || ""} flow since last ${durationText(get("menstrual_years"), get("menstrual_months"), get("menstrual_since_date"))}` : ""} />
        </div>
      );

      case "B4": return (
        <div>
          <h3>What was the date of your last menstrual period (LMP)?</h3>
          <HyperField>
            <HyperInput type="date" value={get("lmp_date")} onChange={v => set("lmp_date", v)} max={new Date().toISOString().split("T")[0]} />
          </HyperField>
          <HyperOutputBox text={get("lmp_date") ? `LMP: ${fmtDate(get("lmp_date"))}` : ""} />
        </div>
      );

      case "B5": return (() => {
        const lmpDate = get("lmp_date");
        const lmpDaysAgo = lmpDate ? Math.floor((new Date() - new Date(lmpDate)) / 86400000) : 0;
        if (lmpDaysAgo < 31) return <div><p style={{ color: "#888" }}>LMP was less than 31 days ago — pregnancy question not applicable.</p></div>;
        // EDD = LMP + 9 months + 7 days
        const eddDate = lmpDate ? (() => { const d = new Date(lmpDate); d.setMonth(d.getMonth() + 9); d.setDate(d.getDate() + 7); return d; })() : null;
        return (
          <div>
            <h3>Are you currently pregnant or trying to conceive?</h3>
            <HyperYesNoUnsure value={get("pregnancy_status")} onChange={v => set("pregnancy_status", v)} />
            {get("pregnancy_status") === "yes" && eddDate && (
              <HyperSectionCard title="Pregnancy">
                <p style={{ margin: 0, fontWeight: 600, color: "#3a7bd5" }}>Expected Date of Delivery (EDD): {fmtDate(eddDate.toISOString().split("T")[0])}</p>
              </HyperSectionCard>
            )}
            <HyperOutputBox text={get("pregnancy_status") === "yes" && eddDate ? `EDD: ${fmtDate(eddDate.toISOString().split("T")[0])}` : ""} />
          </div>
        );
      })();

      // ══════════════════════════════════════════════════════
      // MODULE C — THYROID DISEASE & MEDICATION HISTORY
      // ══════════════════════════════════════════════════════

      case "C1": return (
        <div>
          <h3>Have you been previously diagnosed with a thyroid condition?</h3>
          <HyperYesNoUnsure value={get("thyroid_dx_status")} onChange={v => set("thyroid_dx_status", v)} />
          {get("thyroid_dx_status") === "yes" && (
            <HyperSectionCard title="Previous thyroid diagnosis">
              <HyperField label="Condition">
                <HyperSelect value={get("thyroid_dx_type")} onChange={v => set("thyroid_dx_type", v)} placeholder="Select condition" options={[{ value: "hypothyroidism", label: "Hypothyroidism" }, { value: "hyperthyroidism", label: "Hyperthyroidism" }, { value: "graves_disease", label: "Graves' disease" }, { value: "toxic_mng", label: "Toxic MNG" }, { value: "aftn", label: "AFTN (Single toxic nodule)" }, { value: "goitre", label: "Goitre" }, { value: "thyroid_nodule", label: "Thyroid nodule" }, { value: "thyroid_cancer", label: "Thyroid cancer" }, { value: "other", label: "Other" }]} />
              </HyperField>
              <HyperField label="Year of diagnosis">
                <HyperYearInput value={get("thyroid_dx_year")} onChange={v => set("thyroid_dx_year", v)} dob={get("dob")} placeholder="e.g. 2018" />
              </HyperField>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("thyroid_dx_status") === "yes" && get("thyroid_dx_type") ? `K/c/o ${(get("thyroid_dx_type") || "").replace(/_/g, " ")} since ${get("thyroid_dx_year") ? new Date().getFullYear() - parseInt(get("thyroid_dx_year")) + " years" : ""}` : ""} />
        </div>
      );

      case "C2a": return (
        <div>
          <h3>Have you had any thyroid surgery in the past?</h3>
          <HyperYesNoUnsure value={get("thyroid_surgery_status")} onChange={v => set("thyroid_surgery_status", v)} />
          {get("thyroid_surgery_status") === "yes" && (
            <HyperSectionCard title="Thyroid surgery details">
              <HyperField label="Type of surgery">
                <HyperRadioGroup value={get("thyroid_surgery_type")} onChange={v => set("thyroid_surgery_type", v)} options={[{ value: "total", label: "Total thyroidectomy" }, { value: "hemi", label: "Hemithyroidectomy" }, { value: "isthmusectomy", label: "Isthmusectomy" }, { value: "other", label: "Other" }]} />
              </HyperField>
              {get("thyroid_surgery_type") === "hemi" && (
                <HyperField label="Side">
                  <HyperRadioGroup value={get("thyroid_surgery_side")} onChange={v => set("thyroid_surgery_side", v)} options={[{ value: "right", label: "Right" }, { value: "left", label: "Left" }]} inline />
                </HyperField>
              )}
              <HyperField label="Date of surgery">
                <div style={{ display: "flex", gap: 10 }}>
                  <HyperSelect value={get("thyroid_surgery_month")} onChange={v => set("thyroid_surgery_month", v)} placeholder="Month" options={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => ({ value: String(i+1).padStart(2,"0"), label: m }))} />
                  <HyperYearInput value={get("thyroid_surgery_year")} onChange={v => set("thyroid_surgery_year", v)} dob={get("dob")} placeholder="Year" style={{ width: 120 }} />
                </div>
              </HyperField>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("thyroid_surgery_status") === "yes" && get("thyroid_surgery_type") ? `Post ${get("thyroid_surgery_type") === "hemi" ? (get("thyroid_surgery_side") || "") + " hemithyroidectomy" : (get("thyroid_surgery_type") || "").replace(/_/g," ")} status${get("thyroid_surgery_month") && get("thyroid_surgery_year") ? ` — done on ${get("thyroid_surgery_month")}/${get("thyroid_surgery_year")}` : ""}` : ""} />
        </div>
      );

      case "C2b": return (
        <div>
          <h3>Have you had radioiodine (RAI) therapy in the past?</h3>
          <HyperYesNoUnsure value={get("rai_status")} onChange={v => set("rai_status", v)} />
          {get("rai_status") === "yes" && (
            <HyperSectionCard title="RAI therapy details">
              <HyperField label="How many times have you received radioiodine?">
                <HyperSelect value={get("rai_count", "1")} onChange={v => { set("rai_count", v); const n = parseInt(v); const existing = get("rai_courses", []); const updated = Array.from({ length: n }, (_, i) => existing[i] || { dose_mci: "", month: "", year: "" }); set("rai_courses", updated); }} options={[1,2,3,4,5].map(n => ({ value: String(n), label: String(n) }))} />
              </HyperField>
              {(get("rai_courses", []) || []).map((course, i) => (
                <div key={i} style={{ border: "1px solid #d0d7e8", borderRadius: 8, padding: 12, marginBottom: 10, background: "#fafbff" }}>
                  <p style={{ fontWeight: 700, color: "#3a7bd5", margin: "0 0 10px", fontSize: 13 }}>Course {i + 1}</p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <HyperField label="Dose (mCi)">
                      <HyperInput type="number" value={course.dose_mci} onChange={v => { const c = [...get("rai_courses", [])]; c[i] = { ...c[i], dose_mci: v }; set("rai_courses", c); }} placeholder="e.g. 10.1" min={0} />
                    </HyperField>
                    <HyperField label="Month">
                      <HyperSelect value={course.month} onChange={v => { const c = [...get("rai_courses", [])]; c[i] = { ...c[i], month: v }; set("rai_courses", c); }} placeholder="Month" options={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,j) => ({ value: String(j+1).padStart(2,"0"), label: m }))} />
                    </HyperField>
                    <HyperField label="Year">
                      <HyperInput type="number" value={course.year} onChange={v => { const c = [...get("rai_courses", [])]; c[i] = { ...c[i], year: v }; set("rai_courses", c); }} placeholder="Year" min={1950} max={new Date().getFullYear()} style={{ width: 100 }} />
                    </HyperField>
                  </div>
                </div>
              ))}
              <HyperField label="Did you become hypothyroid after RAI?">
                <HyperYesNoUnsure value={get("rai_post_hypothyroid")} onChange={v => set("rai_post_hypothyroid", v)} />
              </HyperField>
              {get("rai_post_hypothyroid") === "yes" && (
                <div style={{ padding: "10px 14px", background: "#fff8e1", border: "1px solid #f9a825", borderRadius: 8, marginTop: 10 }}>
                  <p style={{ margin: 0, color: "#7f4f00", fontSize: 14 }}>⚑ You developed hypothyroidism after RAI. Your symptom questions will now follow the Hypothyroidism questionnaire.</p>
                </div>
              )}
            </HyperSectionCard>
          )}
          <HyperOutputBox text={(() => {
            if (get("rai_status") !== "yes") return "";
            const courses = (get("rai_courses", []) || []).filter(c => c.dose_mci && c.year).sort((a, b) => parseInt(a.year) - parseInt(b.year) || parseInt(a.month) - parseInt(b.month));
            if (courses.length === 0) return "";
            if (courses.length === 1) return `Post low-dose radioiodine therapy — ${courses[0].dose_mci} mCi given on ${courses[0].month || ""}/${courses[0].year}`;
            return `Post multiple low-dose radioiodine therapies — ${courses.map(c => `${c.dose_mci} mCi on ${c.month || ""}/${c.year}`).join(" and ")}`;
          })()} />
        </div>
      );

      case "C3": return (
        <div>
          <h3>Are you currently taking any thyroid medication?</h3>
          <HyperYesNoUnsure value={get("med_status")} onChange={v => set("med_status", v)} />
          {get("med_status") === "yes" && (
            <HyperSectionCard title="Current medication details">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <HyperField label="Brand name">
                  <HyperSelect
                    value={get("med_brand_name")}
                    onChange={brand => {
                      const info = ANTITHYROID_DRUG_BRANDS[brand];
                      set("med_brand_name", brand);
                      set("med_drug_name", info ? info.generic : "");
                      set("med_dose_mg", "");
                    }}
                    placeholder="Select brand..."
                    options={Object.keys(ANTITHYROID_DRUG_BRANDS).sort().map(b => ({ value: b, label: b }))}
                  />
                </HyperField>
                <HyperField label="Drug name (generic)" hint="Auto-filled from brand">
                  <HyperInput value={get("med_drug_name")} onChange={v => set("med_drug_name", v)} placeholder="e.g. Carbimazole" />
                </HyperField>
                <HyperField label="Tablets at a time">
                  <HyperInput type="number" value={get("med_tablets")} onChange={v => set("med_tablets", v)} placeholder="e.g. 2" min={1} max={10} />
                </HyperField>
                <HyperField label="Times per day">
                  <HyperSelect value={get("med_times_per_day", "1")} onChange={v => { set("med_times_per_day", v); const n = parseInt(v); const existing = get("med_timing", []); const updated = Array.from({ length: n }, (_, i) => existing[i] || { dose_number: i + 1, timing: "" }); set("med_timing", updated); }} options={[1,2,3,4].map(n => ({ value: String(n), label: `${n} time${n > 1 ? "s" : ""}` }))} />
                </HyperField>
              </div>
              {get("med_brand_name") && ANTITHYROID_DRUG_BRANDS[get("med_brand_name")] && (
                <HyperField label="Current dose (mg)">
                  <HyperPillSelect perRow={3}
                    value={get("med_dose_mg") ? Number(get("med_dose_mg")) : null}
                    onChange={dose => set("med_dose_mg", String(dose))}
                    options={ANTITHYROID_DRUG_BRANDS[get("med_brand_name")].doses}
                  />
                </HyperField>
              )}
              {(get("med_timing", []) || []).map((t, i) => (
                <HyperField key={i} label={`${i === 0 ? "First" : i === 1 ? "Second" : i === 2 ? "Third" : "Fourth"} dose timing`}>
                  <HyperSelect value={t.timing} onChange={v => { const arr = [...(get("med_timing", []) || [])]; arr[i] = { ...arr[i], timing: v }; set("med_timing", arr); }} placeholder="Select timing" options={[{ value: "before_breakfast", label: "Before breakfast" }, { value: "after_breakfast", label: "After breakfast" }, { value: "before_lunch", label: "Before lunch" }, { value: "after_lunch", label: "After lunch" }, { value: "before_dinner", label: "Before dinner" }, { value: "after_dinner", label: "After dinner" }, { value: "at_bedtime", label: "At bedtime" }]} />
                </HyperField>
              ))}
              <HyperField label="Compliance">
                <HyperRadioGroup value={get("med_compliance")} onChange={v => set("med_compliance", v)} options={[{ value: "regular", label: "Regular" }, { value: "irregular", label: "Irregular" }, { value: "skips_sometimes", label: "Skips sometimes" }]} inline />
              </HyperField>
              <HyperDurationPicker minDate={get("dob")} label="Taking since" sinceDate={get("med_since_date")} onSinceDate={v => set("med_since_date", v)} years={get("med_since_years")} onYears={v => set("med_since_years", v)} months={get("med_since_months_val")} onMonths={v => set("med_since_months_val", v)} />
            </HyperSectionCard>
          )}
          <HyperOutputBox text={(() => {
            if (get("med_status") !== "yes" || !get("med_drug_name")) return "";
            const timings = (get("med_timing", []) || []).map(t => t.timing || "");
            const allMealTime = timings.length > 0 && timings.every(t => t.includes("after_breakfast") || t.includes("after_lunch") || t.includes("after_dinner"));
            const timingText = allMealTime ? "after meals" : timings.map(t => (t || "").replace(/_/g, " ")).join(", ");
            const dur = durationText(get("med_since_years"), get("med_since_months_val"), get("med_since_date"));
            return `On Tab. ${get("med_brand_name") || ""} (${get("med_drug_name") || ""}) — ${get("med_dose_mg") || "?"} mg — ${get("med_tablets") || "?"} tablet${parseInt(get("med_tablets")) > 1 ? "s" : ""} — ${get("med_times_per_day") || "?"} times per day${timingText ? " " + timingText : ""}. ${get("med_compliance") ? (get("med_compliance").replace(/_/g, " ").charAt(0).toUpperCase() + get("med_compliance").replace(/_/g, " ").slice(1)) + "." : ""}${dur ? " Since " + dur + "." : ""}`;
          })()} />
        </div>
      );

      case "C4": return (
        <div>
          <h3>Do you have a family history of thyroid disease?</h3>
          <HyperYesNoUnsure value={get("family_thyroid_status")} onChange={v => set("family_thyroid_status", v)} />
          {get("family_thyroid_status") === "yes" && (
            <HyperSectionCard title="Family history">
              {(get("family_thyroid_data", [{ relation: "", condition: "" }]) || []).map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-end" }}>
                  <HyperField label="Relative" style={{ flex: 1 }}>
                    <HyperSelect value={entry.relation} onChange={v => { const d = [...(get("family_thyroid_data", []) || [])]; d[i] = { ...d[i], relation: v }; set("family_thyroid_data", d); }} placeholder="Select relative" options={["Mother","Father","Brother","Sister","Son","Daughter","Paternal Grandfather","Paternal Grandmother","Paternal Uncle","Paternal Aunt","Paternal Cousin Brother","Paternal Cousin Sister","Maternal Grandfather","Maternal Grandmother","Maternal Uncle","Maternal Aunt","Maternal Cousin Brother","Maternal Cousin Sister"].map(r => ({ value: r, label: r }))} />
                  </HyperField>
                  <HyperField label="Condition" style={{ flex: 1 }}>
                    <HyperSelect value={entry.condition} onChange={v => { const d = [...(get("family_thyroid_data", []) || [])]; d[i] = { ...d[i], condition: v }; set("family_thyroid_data", d); }} placeholder="Condition" options={[{ value: "hypothyroidism", label: "Hypothyroidism" }, { value: "hyperthyroidism", label: "Hyperthyroidism" }, { value: "graves_disease", label: "Graves' disease" }, { value: "toxic_mng", label: "Toxic MNG" }, { value: "aftn", label: "AFTN" }, { value: "thyroid_cancer", label: "Thyroid cancer" }, { value: "goitre", label: "Goitre" }, { value: "others", label: "Others" }]} />
                  </HyperField>
                  {i > 0 && <button onClick={() => { const d = [...(get("family_thyroid_data", []) || [])]; d.splice(i, 1); set("family_thyroid_data", d); }} style={{ marginBottom: 2, background: "none", border: "none", color: "#e74c3c", cursor: "pointer" }}>✕</button>}
                </div>
              ))}
              <button onClick={() => set("family_thyroid_data", [...(get("family_thyroid_data", []) || []), { relation: "", condition: "" }])} style={{ marginTop: 4, padding: "6px 14px", background: "#eef4ff", border: "1.5px solid #3a7bd5", borderRadius: 6, color: "#3a7bd5", cursor: "pointer", fontSize: 13 }}>+ Add relative</button>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("family_thyroid_status") === "yes" ? `${(get("family_thyroid_data", []) || []).filter(d => d.relation).map(d => d.relation).join(" and ")} are suffering from thyroid disease` : ""} />
        </div>
      );

      case "C5": return (
        <div>
          <h3>Do you have any known autoimmune condition?</h3>
          <p style={{ color: "#666", fontSize: 14 }}>e.g. type 1 diabetes, rheumatoid arthritis, lupus, vitiligo, Addison's disease</p>
          <HyperYesNoUnsure value={get("autoimmune_status")} onChange={v => set("autoimmune_status", v)} />
          {get("autoimmune_status") === "yes" && (
            <HyperSectionCard title="Autoimmune conditions">
              {(get("autoimmune_data", [{ condition: "", since_years: "", since_months: "" }]) || []).map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <HyperField label="Condition" style={{ flex: "2 1 160px" }}>
                    <HyperInput value={entry.condition} onChange={v => { const d = [...(get("autoimmune_data", []) || [])]; d[i] = { ...d[i], condition: v }; set("autoimmune_data", d); }} placeholder="e.g. Type 1 diabetes" />
                  </HyperField>
                  <HyperField label="Since (years)" style={{ flex: "1 1 80px" }}>
                    <HyperInput type="number" value={entry.since_years} onChange={v => { const d = [...(get("autoimmune_data", []) || [])]; d[i] = { ...d[i], since_years: v }; set("autoimmune_data", d); }} min={0} placeholder="0" />
                  </HyperField>
                  <HyperField label="Months" style={{ flex: "1 1 80px" }}>
                    <HyperInput type="number" value={entry.since_months} onChange={v => { const d = [...(get("autoimmune_data", []) || [])]; d[i] = { ...d[i], since_months: v }; set("autoimmune_data", d); }} min={0} max={11} placeholder="0" />
                  </HyperField>
                  {i > 0 && <button onClick={() => { const d = [...(get("autoimmune_data", []) || [])]; d.splice(i, 1); set("autoimmune_data", d); }} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer" }}>✕</button>}
                </div>
              ))}
              <button onClick={() => set("autoimmune_data", [...(get("autoimmune_data", []) || []), { condition: "", since_years: "", since_months: "" }])} style={{ padding: "6px 14px", background: "#eef4ff", border: "1.5px solid #3a7bd5", borderRadius: 6, color: "#3a7bd5", cursor: "pointer", fontSize: 13 }}>+ Add condition</button>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("autoimmune_status") === "yes" ? (get("autoimmune_data", []) || []).filter(d => d.condition).map(d => `${d.condition} since ${durationText(d.since_years, d.since_months)}`).join(". ") : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE D — LABORATORY CAPTURE
      // ══════════════════════════════════════════════════════

      case "D1": return renderLabPage("D1","Have you had a TSH (thyroid stimulating hormone) test done?","TSH","tsh","mIU/L",["mIU/L"]);
      case "D2": return renderLabPage("D2","Have you had a Free T4 (FT4) test done?","FT4","ft4","pmol/L",["pmol/L","ng/dL"]);
      case "D3": return renderLabPage("D3","Have you had a Free T3 (FT3) test done?","FT3","ft3","pmol/L",["pmol/L","pg/mL"]);

      case "D4": return (
        <div>
          <h3>Have you had TSH Receptor Antibody (TRAb) or Thyroid Stimulating Immunoglobulin (TSI) tested?</h3>
          <HyperYesNoUnsure value={get("trab_status")} onChange={v => set("trab_status", v)} />
          {get("trab_status") === "yes" && (
            <HyperSectionCard title="TRAb / TSI results">
              <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>Either or both can be filled — neither is mandatory.</p>
              <p style={{ fontWeight: 700, color: "#3a7bd5", fontSize: 13, margin: "0 0 8px" }}>TRAb</p>
              <LabReportUpload
                patientId={patientId} episodeId={episodeId} fieldLabel="TRAb"
                category="blood_report"
                reports={get("trab_reports", [])}
                onReportsChange={v => set("trab_reports", v)}
                onExtract={(extracted) => {
                  if (extracted.value != null) set("trab_value_d4", extracted.value);
                  if (extracted.date != null) set("trab_date_d4", extracted.date);
                }}
              />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <HyperField label="Value"><HyperInput type="number" value={get("trab_value_d4")} onChange={v => set("trab_value_d4", v)} placeholder="e.g. 8.6" /></HyperField>
                <HyperField label="Unit"><HyperInput value="IU/L" onChange={() => {}} style={{ background: "#f5f5f5", color: "#888" }} /></HyperField>
                <HyperField label="Date of test">
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <HyperInput type="date" value={get("trab_date_d4")} onChange={v => set("trab_date_d4", v)} max={new Date().toISOString().split("T")[0]} />
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, whiteSpace: "nowrap", cursor: "pointer" }}><input type="checkbox" onChange={e => e.target.checked && set("trab_date_d4", get("tsh_date"))} /> Same as TSH</label>
                  </div>
                </HyperField>
              </div>
              <p style={{ fontWeight: 700, color: "#3a7bd5", fontSize: 13, margin: "0 0 8px" }}>TSI</p>
              <LabReportUpload
                patientId={patientId} episodeId={episodeId} fieldLabel="TSI"
                category="blood_report"
                reports={get("tsi_reports", [])}
                onReportsChange={v => set("tsi_reports", v)}
                onExtract={(extracted) => {
                  if (extracted.value != null) set("tsi_value", extracted.value);
                  if (extracted.unit != null) set("tsi_unit", extracted.unit);
                  if (extracted.date != null) set("tsi_date", extracted.date);
                }}
              />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <HyperField label="Value"><HyperInput type="number" value={get("tsi_value")} onChange={v => set("tsi_value", v)} placeholder="e.g. 140" /></HyperField>
                <HyperField label="Unit"><HyperInput value={get("tsi_unit") || "%"} onChange={v => set("tsi_unit", v)} placeholder="%" /></HyperField>
                <HyperField label="Date of test">
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <HyperInput type="date" value={get("tsi_date")} onChange={v => set("tsi_date", v)} max={new Date().toISOString().split("T")[0]} />
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, whiteSpace: "nowrap", cursor: "pointer" }}><input type="checkbox" onChange={e => e.target.checked && set("tsi_date", get("tsh_date"))} /> Same as TSH</label>
                  </div>
                </HyperField>
              </div>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("trab_status") === "yes" && get("trab_value_d4") ? `TRAb — ${get("trab_value_d4")} IU/L  (${fmtDate(get("trab_date_d4"))})${get("tsi_value") ? " | TSI — " + get("tsi_value") + " " + (get("tsi_unit") || "%") + (get("tsi_date") ? " (" + fmtDate(get("tsi_date")) + ")" : "") : ""}` : ""} />
        </div>
      );

      case "D5": return (
        <div>
          <h3>Have you had Anti-TPO or Anti-thyroglobulin (Anti-Tg) antibodies tested?</h3>
          <HyperYesNoUnsure value={get("antibody_status")} onChange={v => set("antibody_status", v)} />
          {get("antibody_status") === "yes" && (
            <HyperSectionCard title="Antibody results">
              <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>Either or both can be filled — neither is mandatory.</p>
              {[["antitpo", "Anti-TPO", "IU/mL"], ["antitg", "Anti-Tg", "IU/mL"]].map(([key, label, unit]) => (
                <div key={key} style={{ marginBottom: 16 }}>
                  <p style={{ fontWeight: 700, color: "#3a7bd5", fontSize: 13, margin: "0 0 8px" }}>{label}</p>
                  <LabReportUpload
                    patientId={patientId} episodeId={episodeId} fieldLabel={label}
                    category="blood_report"
                    reports={get(`${key}_reports`, [])}
                    onReportsChange={v => set(`${key}_reports`, v)}
                    onExtract={(extracted) => {
                      if (extracted.value != null) set(`${key}_value`, extracted.value);
                      if (extracted.date != null) set(`${key}_date`, extracted.date);
                    }}
                  />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <HyperField label="Value"><HyperInput type="number" value={get(`${key}_value`)} onChange={v => set(`${key}_value`, v)} placeholder="numeric" /></HyperField>
                    <HyperField label="Unit"><HyperInput value={get(`${key}_unit`) || unit} onChange={v => set(`${key}_unit`, v)} placeholder={unit} /></HyperField>
                    <HyperField label="Date">
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <HyperInput type="date" value={get(`${key}_date`)} onChange={v => set(`${key}_date`, v)} max={new Date().toISOString().split("T")[0]} />
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, whiteSpace: "nowrap", cursor: "pointer" }}><input type="checkbox" onChange={e => e.target.checked && set(`${key}_date`, get("tsh_date"))} /> Same as TSH</label>
                      </div>
                    </HyperField>
                  </div>
                </div>
              ))}
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("antibody_status") === "yes" ? [get("antitpo_value") ? `Anti-TPO — ${get("antitpo_value")} ${get("antitpo_unit") || "IU/mL"}  (${fmtDate(get("antitpo_date"))})` : "", get("antitg_value") ? `Anti-Tg — ${get("antitg_value")} ${get("antitg_unit") || "IU/mL"}  (${fmtDate(get("antitg_date"))})` : ""].filter(Boolean).join(" | ") : ""} />
        </div>
      );

      case "D6": return (
        <div>
          <h3>Have you had a thyroid ultrasound, radionuclide scan, or other thyroid imaging done?</h3>
          <HyperYesNoUnsure value={get("imaging_status")} onChange={v => set("imaging_status", v)} />
          {get("imaging_status") === "yes" && (
            <HyperSectionCard title="Imaging details">
              <HyperField label="Type of imaging (multi-select)">
                <HyperCheckGroup values={get("imaging_types", [])} onChange={v => set("imaging_types", v)} options={[{ value: "usg_thyroid", label: "USG thyroid" }, { value: "usg_neck", label: "USG neck" }, { value: "tc99_scan", label: "Thyroid radionuclide (Tc-99m) scan" }, { value: "ct_neck", label: "CT scan neck" }, { value: "mri_neck", label: "MRI scan neck" }, { value: "other", label: "Other" }]} />
              </HyperField>
              <HyperField label="Date of imaging"><HyperInput type="date" value={get("imaging_date")} onChange={v => set("imaging_date", v)} max={new Date().toISOString().split("T")[0]} /></HyperField>
              <HyperField label="Key findings (optional)"><HyperInput value={get("imaging_finding")} onChange={v => set("imaging_finding", v)} placeholder="e.g. Features of Graves' disease, uptake 15.6%" /></HyperField>
              <LabReportUpload
                patientId={patientId} episodeId={episodeId} fieldLabel="Thyroid imaging"
                category="scan_usg"
                enableExtract={false}
                reports={get("imaging_report") ? [get("imaging_report")] : []}
                onReportsChange={(arr) => set("imaging_report", arr[arr.length - 1] || null)}
              />
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("imaging_status") === "yes" && (get("imaging_types", []) || []).length > 0 ? `${(get("imaging_types", []) || []).join(", ").replace(/_/g, " ")} done on ${fmtDate(get("imaging_date"))}${get("imaging_finding") ? " showed " + get("imaging_finding") : ""}` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE E — HYPERTHYROIDISM SPECIFIC
      // ══════════════════════════════════════════════════════

      case "E1": return (
        <div>
          <h3>Do you know the cause of your hyperthyroidism?</h3>
          <HyperYesNoUnsure value={get("hyper_cause_known")} onChange={v => set("hyper_cause_known", v)} />
          {get("hyper_cause_known") === "yes" && (
            <HyperSectionCard title="Cause of hyperthyroidism">
              <HyperField label="Cause">
                <HyperRadioGroup value={get("hyper_cause_type")} onChange={v => set("hyper_cause_type", v)} options={[{ value: "graves_disease", label: "Graves' disease" }, { value: "toxic_mng", label: "Toxic multinodular goitre (Toxic MNG)" }, { value: "aftn", label: "Single toxic nodule (AFTN)" }, { value: "subacute_thyroiditis", label: "Subacute thyroiditis" }, { value: "postpartum_thyroiditis", label: "Post-partum thyroiditis" }, { value: "drug_induced", label: "Drug-induced (e.g. amiodarone, lithium)" }, { value: "other", label: "Other" }]} />
              </HyperField>
              <HyperDurationPicker minDate={get("dob")} label="Diagnosed / known since" sinceDate={get("hyper_cause_since_date")} onSinceDate={v => set("hyper_cause_since_date", v)} years={get("hyper_cause_since_years")} onYears={v => set("hyper_cause_since_years", v)} months={get("hyper_cause_since_months_val")} onMonths={v => set("hyper_cause_since_months_val", v)} />
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("hyper_cause_known") === "yes" && get("hyper_cause_type") ? `${(get("hyper_cause_type") || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} since ${durationText(get("hyper_cause_since_years"), get("hyper_cause_since_months_val"), get("hyper_cause_since_date"))}` : ""} />
        </div>
      );

      case "E2": return (
        <div>
          <h3>Have you been confirmed to have Graves' disease?</h3>
          <HyperYesNoUnsure value={get("graves_confirmed")} onChange={v => set("graves_confirmed", v)} />
          {get("graves_confirmed") === "yes" && (
            <HyperSectionCard title="Graves' disease details">
              <HyperField label="Was TRAb / TSI test positive?">
                <HyperRadioGroup value={get("trab_positive")} onChange={v => set("trab_positive", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not_tested", label: "Not tested" }]} inline />
              </HyperField>
              <HyperField label="Graves' ophthalmopathy (eye changes)?">
                <HyperYesNoUnsure value={get("ophthal_status")} onChange={v => set("ophthal_status", v)} />
              </HyperField>
              {get("ophthal_status") === "yes" && (
                <div style={{ paddingLeft: 16, borderLeft: "3px solid #3a7bd5", marginTop: 8 }}>
                  <HyperField label="Eye findings (multi-select)">
                    <HyperCheckGroup values={get("ophthal_findings", [])} onChange={v => set("ophthal_findings", v)} options={[{ value: "proptosis", label: "Bulging eyes (proptosis)" }, { value: "puffy_eyelids", label: "Puffy eyelids" }, { value: "double_vision", label: "Double vision" }, { value: "eye_pain", label: "Eye pain" }, { value: "reduced_vision", label: "Reduced vision" }, { value: "redness", label: "Redness of eyes" }]} />
                  </HyperField>
                  <HyperDurationPicker minDate={get("dob")} sinceDate={get("ophthal_since_date")} onSinceDate={v => set("ophthal_since_date", v)} years={get("ophthal_since_years")} onYears={v => set("ophthal_since_years", v)} months={get("ophthal_since_months_val")} onMonths={v => set("ophthal_since_months_val", v)} />
                  <HyperField label="Assessed by an ophthalmologist?">
                    <HyperRadioGroup value={get("ophthal_assessed")} onChange={v => set("ophthal_assessed", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} inline />
                  </HyperField>
                </div>
              )}
              <HyperField label="Graves' dermopathy (pretibial myxoedema — skin thickening over the shins)?">
                <HyperYesNoUnsure value={get("dermopathy_status")} onChange={v => set("dermopathy_status", v)} />
              </HyperField>
              {get("dermopathy_status") === "yes" && (
                <div style={{ paddingLeft: 16, borderLeft: "3px solid #3a7bd5", marginTop: 8 }}>
                  <HyperDurationPicker minDate={get("dob")} label="Duration" years={get("dermopathy_years")} onYears={v => set("dermopathy_years", v)} months={get("dermopathy_months")} onMonths={v => set("dermopathy_months", v)} />
                </div>
              )}
              <HyperField label="Graves' acropathy (finger clubbing / bone changes)?">
                <HyperYesNoUnsure value={get("acropathy_status")} onChange={v => set("acropathy_status", v)} />
              </HyperField>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("graves_confirmed") === "yes" ? `Graves' disease — TRAb ${get("trab_positive") || "not tested"}.${get("ophthal_status") === "yes" ? ` Graves' ophthalmopathy: ${(get("ophthal_findings", []) || []).join(", ")} since ${durationText(get("ophthal_since_years"), get("ophthal_since_months_val"), get("ophthal_since_date"))}.${get("ophthal_assessed") === "yes" ? " Assessed by ophthalmologist." : ""}` : ""}${get("dermopathy_status") === "yes" ? ` Graves' dermopathy since ${durationText(get("dermopathy_years"), get("dermopathy_months"))}.` : ""}${get("acropathy_status") === "yes" ? " Graves' acropathy present." : ""}` : ""} />
        </div>
      );

      case "E3": return (
        <div>
          <h3>Have you been told that you have a toxic nodule or toxic multinodular goitre?</h3>
          <HyperYesNoUnsure value={get("toxic_nodule_confirmed")} onChange={v => set("toxic_nodule_confirmed", v)} />
          {get("toxic_nodule_confirmed") === "yes" && (
            <HyperSectionCard title="Toxic nodule details">
              <HyperField label="Type">
                <HyperRadioGroup value={get("toxic_nodule_type")} onChange={v => set("toxic_nodule_type", v)} options={[{ value: "aftn", label: "Single toxic nodule (AFTN)" }, { value: "toxic_mng", label: "Toxic multinodular goitre" }]} inline />
              </HyperField>
              <HyperField label="Has an FNAC (fine needle aspiration) been done?">
                <HyperYesNoUnsure value={get("e3_fnac_status")} onChange={v => set("e3_fnac_status", v)} />
              </HyperField>
              {get("e3_fnac_status") === "yes" && (
                <div style={{ paddingLeft: 16, borderLeft: "3px solid #3a7bd5", marginTop: 8 }}>
                  <HyperField label="FNAC date"><HyperInput type="date" value={get("e3_fnac_date")} onChange={v => set("e3_fnac_date", v)} max={new Date().toISOString().split("T")[0]} /></HyperField>
                  <HyperField label="FNAC result">
                    <HyperRadioGroup value={get("e3_fnac_result")} onChange={v => set("e3_fnac_result", v)} options={[{ value: "benign", label: "Benign" }, { value: "malignant", label: "Malignant" }, { value: "indeterminate", label: "Indeterminate" }, { value: "unknown", label: "Unknown" }]} inline />
                  </HyperField>
                </div>
              )}
              <HyperField label="Size of nodule if known (cm — optional)"><HyperInput type="number" value={get("e3_nodule_size")} onChange={v => set("e3_nodule_size", v)} placeholder="e.g. 2.3" min={0} max={20} /></HyperField>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("toxic_nodule_confirmed") === "yes" && get("toxic_nodule_type") ? `K/c/o ${get("toxic_nodule_type") === "aftn" ? "AFTN" : "Toxic MNG"}.${get("e3_fnac_status") === "yes" && get("e3_fnac_result") ? ` FNAC — ${get("e3_fnac_result")}${get("e3_fnac_date") ? " (" + fmtDate(get("e3_fnac_date")) + ")" : ""}.` : ""}${get("e3_nodule_size") ? ` Nodule size ${get("e3_nodule_size")} cm.` : ""}` : ""} />
        </div>
      );

      case "E4": return (
        <div>
          <h3>Do you have or have you been told you have a goitre?</h3>
          <p style={{ color: "#666", fontSize: 14 }}>Enlarged thyroid / swelling in the front of the neck</p>
          <HyperYesNoUnsure value={get("goitre_status")} onChange={v => set("goitre_status", v)} />
          {get("goitre_status") === "yes" && (
            <HyperSectionCard title="Goitre details">
              <HyperField label="Size">
                <HyperRadioGroup value={get("goitre_size_label")} onChange={v => set("goitre_size_label", v)} options={[{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }, { value: "unsure", label: "Unsure" }]} inline />
              </HyperField>
              <HyperDurationPicker minDate={get("dob")} sinceDate={get("goitre_since_date")} onSinceDate={v => set("goitre_since_date", v)} years={get("goitre_since_years")} onYears={v => set("goitre_since_years", v)} months={get("goitre_since_months_val")} onMonths={v => set("goitre_since_months_val", v)} />
              <HyperField label="Is the goitre causing any pressure symptoms?">
                <HyperYesNoUnsure value={get("goitre_pressure_status")} onChange={v => set("goitre_pressure_status", v)} />
              </HyperField>
              {get("goitre_pressure_status") === "yes" && (
                <HyperField label="Pressure symptoms (multi-select)">
                  <HyperCheckGroup values={get("goitre_pressure_types", [])} onChange={v => set("goitre_pressure_types", v)} options={[{ value: "dysphagia", label: "Difficulty swallowing" }, { value: "dyspnoea", label: "Difficulty breathing" }, { value: "hoarseness", label: "Hoarseness" }, { value: "tightness", label: "Feeling of tightness in the neck" }]} />
                </HyperField>
              )}
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("goitre_status") === "yes" ? `${get("goitre_size_label") ? get("goitre_size_label").charAt(0).toUpperCase() + get("goitre_size_label").slice(1) + "-sized" : ""} goitre${durationText(get("goitre_since_years"), get("goitre_since_months_val"), get("goitre_since_date")) ? " since " + durationText(get("goitre_since_years"), get("goitre_since_months_val"), get("goitre_since_date")) : ""}.${get("goitre_pressure_status") === "yes" && (get("goitre_pressure_types", []) || []).length > 0 ? " Pressure symptom: " + (get("goitre_pressure_types", []) || []).join(", ").replace(/_/g, " ") + "." : ""}` : ""} />
        </div>
      );

      case "E5": return (
        <div>
          <h3>Have you had a thyroid biopsy or fine needle aspiration (FNAC) done?</h3>
          <HyperYesNoUnsure value={get("fnac_status")} onChange={v => set("fnac_status", v)} />
          {get("fnac_status") === "yes" && (
            <HyperSectionCard title="FNAC details">
              <HyperField label="Date"><HyperInput type="date" value={get("fnac_date")} onChange={v => set("fnac_date", v)} max={new Date().toISOString().split("T")[0]} /></HyperField>
              <HyperField label="Result">
                <HyperRadioGroup value={get("fnac_result")} onChange={v => set("fnac_result", v)} options={[{ value: "benign", label: "Benign" }, { value: "malignant", label: "Malignant" }, { value: "indeterminate", label: "Indeterminate" }, { value: "unknown", label: "Unknown" }]} inline />
              </HyperField>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("fnac_status") === "yes" && get("fnac_result") ? `FNAC — ${get("fnac_result")}${get("fnac_date") ? "  (" + fmtDate(get("fnac_date")) + ")" : ""}` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE F — SYMPTOMS (F1–F25)
      // ══════════════════════════════════════════════════════

      case "F1": return renderSymptomPage("F1","Do you experience unusual tiredness or fatigue?","fatigue",
        <>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_fatigue_since_date")} onSinceDate={v => set("sym_fatigue_since_date", v)} years={get("sym_fatigue_years")} onYears={v => set("sym_fatigue_years", v)} months={get("sym_fatigue_months")} onMonths={v => set("sym_fatigue_months", v)} />
          <HyperField label="Severity"><HyperRadioGroup value={get("sym_fatigue_severity")} onChange={v => set("sym_fatigue_severity", v)} options={[{ value: "mild", label: "Mild" }, { value: "moderate", label: "Moderate" }, { value: "severe", label: "Severe" }]} inline /></HyperField>
        </>,
        get("sym_fatigue_severity") ? `${get("sym_fatigue_severity")} tiredness since last ${durationText(get("sym_fatigue_years"), get("sym_fatigue_months"), get("sym_fatigue_since_date"))}` : ""
      );

      case "F2": return renderSymptomPage("F2","Have you noticed any unintentional change in your weight?","weight",
        <>
          <HyperField label="Direction"><HyperRadioGroup value={get("sym_weight_direction")} onChange={v => set("sym_weight_direction", v)} options={[{ value: "gained", label: "Weight gained" }, { value: "lost", label: "Weight lost" }]} inline /></HyperField>
          <HyperField label="How much (kg)"><HyperInput type="number" value={get("sym_weight_kg")} onChange={v => set("sym_weight_kg", v)} min={0} max={200} placeholder="e.g. 8" /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_weight_since_date")} onSinceDate={v => set("sym_weight_since_date", v)} years={get("sym_weight_years")} onYears={v => set("sym_weight_years", v)} months={get("sym_weight_months")} onMonths={v => set("sym_weight_months", v)} />
        </>,
        get("sym_weight_direction") && get("sym_weight_kg") ? `Weight ${get("sym_weight_direction") === "lost" ? "loss" : "gain"} of ${get("sym_weight_kg")} kg over last ${durationText(get("sym_weight_years"), get("sym_weight_months"), get("sym_weight_since_date"))}` : ""
      );

      case "F3": return (
        <div>
          <h3>Has your appetite changed?</h3>
          <HyperRadioGroup value={get("sym_appetite_status")} onChange={v => set("sym_appetite_status", v)} options={[{ value: "no_change", label: "No change" }, { value: "decreased", label: "Decreased" }, { value: "increased", label: "Increased" }]} inline />
          <HyperOutputBox text={get("sym_appetite_status") ? `${get("sym_appetite_status").replace("_", " ").charAt(0).toUpperCase() + get("sym_appetite_status").replace("_", " ").slice(1)} appetite` : ""} />
        </div>
      );

      case "F4": return renderSymptomPage("F4","Do you feel unusually hot or have difficulty tolerating heat?","heat",
        <>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_heat_since_date")} onSinceDate={v => set("sym_heat_since_date", v)} years={get("sym_heat_years")} onYears={v => set("sym_heat_years", v)} months={get("sym_heat_months")} onMonths={v => set("sym_heat_months", v)} />
          <HyperField label="Does it affect daily activities?"><HyperRadioGroup value={get("sym_heat_impact")} onChange={v => set("sym_heat_impact", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} inline /></HyperField>
        </>,
        `Heat intolerance since last ${durationText(get("sym_heat_years"), get("sym_heat_months"), get("sym_heat_since_date"))}`
      );

      case "F5": return renderSymptomPage("F5","Do you sweat more than usual or have episodes of excessive sweating?","sweating",
        <>
          <HyperField label="Pattern"><HyperRadioGroup value={get("sym_sweating_pattern")} onChange={v => set("sym_sweating_pattern", v)} options={[{ value: "generalised", label: "Generalised" }, { value: "night", label: "Mostly at night (night sweats)" }, { value: "both", label: "Both" }]} /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_sweating_since_date")} onSinceDate={v => set("sym_sweating_since_date", v)} years={get("sym_sweating_years")} onYears={v => set("sym_sweating_years", v)} months={get("sym_sweating_months")} onMonths={v => set("sym_sweating_months", v)} />
        </>,
        `Excessive sweating — ${get("sym_sweating_pattern") || ""} — since last ${durationText(get("sym_sweating_years"), get("sym_sweating_months"), get("sym_sweating_since_date"))}`
      );

      case "F6": return renderSymptomPage("F6","Have you noticed any changes in your bowel habits?","bowel",
        <>
          <HyperField label="Type"><HyperRadioGroup value={get("sym_bowel_type")} onChange={v => set("sym_bowel_type", v)} options={[{ value: "constipation", label: "Constipation" }, { value: "diarrhoea", label: "Diarrhoea" }, { value: "increased_frequency", label: "Increased frequency (loose stools)" }, { value: "alternating", label: "Alternating" }]} /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_bowel_since_date")} onSinceDate={v => set("sym_bowel_since_date", v)} years={get("sym_bowel_years")} onYears={v => set("sym_bowel_years", v)} months={get("sym_bowel_months")} onMonths={v => set("sym_bowel_months", v)} />
        </>,
        `${get("sym_bowel_type") ? get("sym_bowel_type").replace(/_/g, " ") : ""} since last ${durationText(get("sym_bowel_years"), get("sym_bowel_months"), get("sym_bowel_since_date"))}`
      );

      case "F7": return renderSymptomPage("F7","Have you noticed any changes in your skin?","skin",
        <>
          <HyperField label="Type (multi-select)"><HyperCheckGroup values={get("sym_skin_types", [])} onChange={v => set("sym_skin_types", v)} options={[{ value: "warm_moist", label: "Warm and moist skin" }, { value: "smoothness", label: "Smoothness" }, { value: "increased_sweating", label: "Increased sweating" }, { value: "flushing", label: "Flushing" }, { value: "itching", label: "Itching" }, { value: "pretibial_thickening", label: "Pretibial thickening or redness" }]} /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_skin_since_date")} onSinceDate={v => set("sym_skin_since_date", v)} years={get("sym_skin_years")} onYears={v => set("sym_skin_years", v)} months={get("sym_skin_months")} onMonths={v => set("sym_skin_months", v)} />
        </>,
        `${(get("sym_skin_types", []) || []).join(", ").replace(/_/g, " ")} since last ${durationText(get("sym_skin_years"), get("sym_skin_months"), get("sym_skin_since_date"))}`
      );

      case "F8a": return renderSymptomPage("F8a","Do you have puffiness or swelling around your eyes? (periorbital oedema / Graves' eye changes)","periorbital",
        <>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_periorbital_since_date")} onSinceDate={v => set("sym_periorbital_since_date", v)} years={get("sym_periorbital_years")} onYears={v => set("sym_periorbital_years", v)} months={get("sym_periorbital_months")} onMonths={v => set("sym_periorbital_months", v)} />
          <HyperField label="Additional features (multi-select)"><HyperCheckGroup values={get("sym_periorbital_features", [])} onChange={v => set("sym_periorbital_features", v)} options={[{ value: "bulging", label: "Bulging" }, { value: "redness", label: "Redness" }, { value: "dryness", label: "Dryness" }, { value: "double_vision", label: "Double vision" }, { value: "reduced_vision", label: "Reduced vision" }]} /></HyperField>
        </>,
        `Peri-orbital puffiness${(get("sym_periorbital_features", []) || []).length > 0 ? " with " + (get("sym_periorbital_features", []) || []).join(", ") : ""} since last ${durationText(get("sym_periorbital_years"), get("sym_periorbital_months"), get("sym_periorbital_since_date"))}`
      );

      case "F8b": return renderSymptomPage("F8b","Do you have puffiness or swelling of the face?","facial",
        <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_facial_since_date")} onSinceDate={v => set("sym_facial_since_date", v)} years={get("sym_facial_years")} onYears={v => set("sym_facial_years", v)} months={get("sym_facial_months")} onMonths={v => set("sym_facial_months", v)} />,
        `Facial puffiness since last ${durationText(get("sym_facial_years"), get("sym_facial_months"), get("sym_facial_since_date"))}`
      );

      case "F9": return renderSymptomPage("F9","Do you have swelling of the legs or feet? (pedal oedema)","pedal",
        <>
          <HyperField label="Type"><HyperRadioGroup value={get("sym_pedal_type")} onChange={v => set("sym_pedal_type", v)} options={[{ value: "pitting", label: "Pitting" }, { value: "non_pitting", label: "Non-pitting" }, { value: "unsure", label: "Unsure" }]} inline /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_pedal_since_date")} onSinceDate={v => set("sym_pedal_since_date", v)} years={get("sym_pedal_years")} onYears={v => set("sym_pedal_years", v)} months={get("sym_pedal_months")} onMonths={v => set("sym_pedal_months", v)} />
        </>,
        `Pedal oedema — ${get("sym_pedal_type") || ""} — since last ${durationText(get("sym_pedal_years"), get("sym_pedal_months"), get("sym_pedal_since_date"))}`
      );

      case "F10": return renderHairNailPage("F10","Have you noticed any changes in your hair?","hair",
        [{ value: "hair_loss", label: "Hair loss" }, { value: "thinning", label: "Thinning" }, { value: "fineness", label: "Fineness" }, { value: "silky_texture", label: "Silky texture" }, { value: "increased_softness", label: "Increased softness" }]
      );

      case "F11": return renderHairNailPage("F11","Have you noticed any changes in your nails?","nail",
        [{ value: "brittle", label: "Brittle" }, { value: "softening", label: "Softening" }, { value: "onycholysis", label: "Onycholysis (nail separating from nail bed)" }, { value: "fast_growing", label: "Fast growing" }]
      );

      case "F12": return renderSymptomPage("F12","Have you noticed any hoarseness or change in your voice?","hoarseness",
        <>
          <HyperField label="Pattern"><HyperRadioGroup value={get("sym_hoarseness_pattern")} onChange={v => set("sym_hoarseness_pattern", v)} options={[{ value: "constant", label: "Constant" }, { value: "intermittent", label: "Intermittent" }]} inline /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_hoarseness_since_date")} onSinceDate={v => set("sym_hoarseness_since_date", v)} years={get("sym_hoarseness_years")} onYears={v => set("sym_hoarseness_years", v)} months={get("sym_hoarseness_months")} onMonths={v => set("sym_hoarseness_months", v)} />
        </>,
        `${get("sym_hoarseness_pattern") || ""} hoarseness of voice since last ${durationText(get("sym_hoarseness_years"), get("sym_hoarseness_months"), get("sym_hoarseness_since_date"))}`
      );

      case "F13": return renderSymptomPage("F13","Do you experience muscle weakness or difficulty climbing stairs / rising from a chair?","myopathy",
        <>
          <HyperField label="Location"><HyperRadioGroup value={get("sym_myopathy_location")} onChange={v => set("sym_myopathy_location", v)} options={[{ value: "proximal", label: "Proximal (upper arms / thighs)" }, { value: "generalised", label: "Generalised" }]} /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_myopathy_since_date")} onSinceDate={v => set("sym_myopathy_since_date", v)} years={get("sym_myopathy_years")} onYears={v => set("sym_myopathy_years", v)} months={get("sym_myopathy_months")} onMonths={v => set("sym_myopathy_months", v)} />
        </>,
        `${get("sym_myopathy_location") === "proximal" ? "Proximal muscle weakness — both thighs" : "Generalised muscle weakness"} since last ${durationText(get("sym_myopathy_years"), get("sym_myopathy_months"), get("sym_myopathy_since_date"))}`
      );

      case "F14": return renderSymptomPage("F14","Do you experience muscle cramps or aches?","cramp",
        <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_cramp_since_date")} onSinceDate={v => set("sym_cramp_since_date", v)} years={get("sym_cramp_years")} onYears={v => set("sym_cramp_years", v)} months={get("sym_cramp_months")} onMonths={v => set("sym_cramp_months", v)} />,
        `Muscle cramps since last ${durationText(get("sym_cramp_years"), get("sym_cramp_months"), get("sym_cramp_since_date"))}`
      );

      case "F15": return renderSymptomPage("F15","Do you experience tremors or shaking — especially of the hands?","tremor",
        <>
          <HyperField label="Type"><HyperRadioGroup value={get("sym_tremor_type_val")} onChange={v => set("sym_tremor_type_val", v)} options={[{ value: "fine_hands", label: "Fine tremor of hands" }, { value: "coarse_hands", label: "Coarse tremor of hands" }, { value: "generalised", label: "Generalised shakiness" }]} /></HyperField>
          <HyperField label="Triggers (multi-select)"><HyperCheckGroup values={get("sym_tremor_triggers", [])} onChange={v => set("sym_tremor_triggers", v)} options={[{ value: "at_rest", label: "At rest" }, { value: "with_activity", label: "With activity" }, { value: "holding_objects", label: "When holding objects" }, { value: "constant", label: "Constant" }]} /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_tremor_since_date")} onSinceDate={v => set("sym_tremor_since_date", v)} years={get("sym_tremor_years")} onYears={v => set("sym_tremor_years", v)} months={get("sym_tremor_months")} onMonths={v => set("sym_tremor_months", v)} />
        </>,
        `${get("sym_tremor_type_val") ? get("sym_tremor_type_val").replace(/_/g, " ") : ""} — ${(get("sym_tremor_triggers", []) || []).join(", ").replace(/_/g, " ")} — since last ${durationText(get("sym_tremor_years"), get("sym_tremor_months"), get("sym_tremor_since_date"))}`
      );

      case "F16": return renderSymptomPage("F16","Do you feel nervous, anxious, or on edge most of the time?","anxiety",
        <>
          <HyperField label="Have you seen a doctor for this?"><HyperRadioGroup value={get("sym_anxiety_seen_doctor")} onChange={v => set("sym_anxiety_seen_doctor", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} inline /></HyperField>
          <HyperField label="Formally diagnosed with anxiety by a doctor?"><HyperRadioGroup value={get("sym_anxiety_diagnosed")} onChange={v => set("sym_anxiety_diagnosed", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} inline /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_anxiety_since_date")} onSinceDate={v => set("sym_anxiety_since_date", v)} years={get("sym_anxiety_years")} onYears={v => set("sym_anxiety_years", v)} months={get("sym_anxiety_months")} onMonths={v => set("sym_anxiety_months", v)} />
        </>,
        `Anxiety / nervousness since last ${durationText(get("sym_anxiety_years"), get("sym_anxiety_months"), get("sym_anxiety_since_date"))}.${get("sym_anxiety_diagnosed") === "yes" ? " Formally diagnosed." : ""}`
      );

      case "F17": return renderSymptomPage("F17","Have you been feeling irritable, restless, or emotionally labile?","irritability",
        <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_irritability_since_date")} onSinceDate={v => set("sym_irritability_since_date", v)} years={get("sym_irritability_years")} onYears={v => set("sym_irritability_years", v)} months={get("sym_irritability_months")} onMonths={v => set("sym_irritability_months", v)} />,
        `Irritability and emotional lability since last ${durationText(get("sym_irritability_years"), get("sym_irritability_months"), get("sym_irritability_since_date"))}`
      );

      case "F18": return renderSymptomPage("F18","Do you have difficulty falling asleep or staying asleep? (insomnia)","insomnia",
        <>
          <HyperField label="Type (multi-select)"><HyperCheckGroup values={get("sym_insomnia_types", [])} onChange={v => set("sym_insomnia_types", v)} options={[{ value: "difficulty_falling", label: "Difficulty falling asleep" }, { value: "waking_frequently", label: "Waking up frequently" }, { value: "early_morning_waking", label: "Early morning waking" }]} /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_insomnia_since_date")} onSinceDate={v => set("sym_insomnia_since_date", v)} years={get("sym_insomnia_years")} onYears={v => set("sym_insomnia_years", v)} months={get("sym_insomnia_months")} onMonths={v => set("sym_insomnia_months", v)} />
        </>,
        `${(get("sym_insomnia_types", []) || []).join(", ").replace(/_/g, " ")} since last ${durationText(get("sym_insomnia_years"), get("sym_insomnia_months"), get("sym_insomnia_since_date"))}`
      );

      case "F19": return renderSymptomPage("F19","Do you notice that your heart beats fast, pounds, or flutters? (palpitations)","palp",
        <>
          <HyperField label="Pattern"><HyperRadioGroup value={get("sym_palp_pattern")} onChange={v => set("sym_palp_pattern", v)} options={[{ value: "constant", label: "Constant" }, { value: "intermittent", label: "Intermittent" }, { value: "exertion", label: "On exertion only" }]} inline /></HyperField>
          <HyperField label="Approximate heart rate if known (bpm — optional)"><HyperInput type="number" value={get("sym_palp_rate_bpm")} onChange={v => set("sym_palp_rate_bpm", v)} min={40} max={300} placeholder="e.g. 110" /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_palp_since_date")} onSinceDate={v => set("sym_palp_since_date", v)} years={get("sym_palp_years")} onYears={v => set("sym_palp_years", v)} months={get("sym_palp_months")} onMonths={v => set("sym_palp_months", v)} />
          <HyperField label="Associated symptoms (multi-select)"><HyperCheckGroup values={get("sym_palp_assoc", [])} onChange={v => set("sym_palp_assoc", v)} options={[{ value: "chest_pain", label: "Chest pain" }, { value: "breathlessness", label: "Shortness of breath" }, { value: "light_headedness", label: "Light-headedness" }, { value: "blackout", label: "Blackout" }]} /></HyperField>
        </>,
        `Palpitations — ${get("sym_palp_pattern") || ""} — since last ${durationText(get("sym_palp_years"), get("sym_palp_months"), get("sym_palp_since_date"))}.${(get("sym_palp_assoc", []) || []).length > 0 ? " Associated: " + (get("sym_palp_assoc", []) || []).join(", ").replace(/_/g, " ") + "." : ""}`
      );

      case "F20": return renderSymptomPage("F20","Have you been told that you have an irregular heartbeat or atrial fibrillation (AF)?","af",
        <>
          <HyperField label="Confirmed by ECG / Holter?"><HyperRadioGroup value={get("sym_af_confirmed")} onChange={v => set("sym_af_confirmed", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not_known", label: "Not known" }]} inline /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_af_since_date")} onSinceDate={v => set("sym_af_since_date", v)} years={get("sym_af_years")} onYears={v => set("sym_af_years", v)} months={get("sym_af_months")} onMonths={v => set("sym_af_months", v)} />
          <HyperField label="On medication for this?"><HyperYesNoUnsure value={get("sym_af_on_med")} onChange={v => set("sym_af_on_med", v)} /></HyperField>
          {get("sym_af_on_med") === "yes" && (
            <div style={{ paddingLeft: 16, borderLeft: "3px solid #3a7bd5", marginTop: 8 }}>
              {(get("sym_af_med_data", [{ name: "", dose_mg: "", freq_per_day: "" }]) || []).map((med, i) => (
                <HyperMedBlock key={i} med={med} index={i} doseLabel="Dose (mg)" showSince={false} onChange={v => { const a = [...(get("sym_af_med_data", []) || [])]; a[i] = v; set("sym_af_med_data", a); }} onRemove={i > 0 ? () => { const a = [...(get("sym_af_med_data", []) || [])]; a.splice(i, 1); set("sym_af_med_data", a); } : null} />
              ))}
              <button onClick={() => set("sym_af_med_data", [...(get("sym_af_med_data", []) || []), { name: "", dose_mg: "", freq_per_day: "" }])} style={{ padding: "6px 14px", background: "#eef4ff", border: "1.5px solid #3a7bd5", borderRadius: 6, color: "#3a7bd5", cursor: "pointer", fontSize: 13 }}>+ Add medicine</button>
            </div>
          )}
        </>,
        `K/c/o Atrial fibrillation — ${get("sym_af_confirmed") === "yes" ? "ECG confirmed" : ""} — since last ${durationText(get("sym_af_years"), get("sym_af_months"), get("sym_af_since_date"))}.${get("sym_af_on_med") === "yes" ? " On medication." : ""}`
      );

      case "F21": return renderSymptomPage("F21","Do you feel dizzy or light-headed when you stand up quickly? (postural giddiness)","giddiness",
        <>
          <HyperField label="Frequency"><HyperRadioGroup value={get("sym_giddiness_freq")} onChange={v => set("sym_giddiness_freq", v)} options={[{ value: "rarely", label: "Rarely" }, { value: "sometimes", label: "Sometimes" }, { value: "often", label: "Often" }, { value: "every_time", label: "Every time I stand" }]} inline /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_giddiness_since_date")} onSinceDate={v => set("sym_giddiness_since_date", v)} years={get("sym_giddiness_years")} onYears={v => set("sym_giddiness_years", v)} months={get("sym_giddiness_months")} onMonths={v => set("sym_giddiness_months", v)} />
        </>,
        `Postural giddiness since last ${durationText(get("sym_giddiness_years"), get("sym_giddiness_months"), get("sym_giddiness_since_date"))}`
      );

      case "F22": return renderSymptomPage("F22","Have you ever had a sudden loss of consciousness or black-out episode?","blackout",
        <>
          <HyperField label="Number of episodes"><HyperInput type="number" value={get("sym_blackout_count")} onChange={v => set("sym_blackout_count", v)} min={1} placeholder="e.g. 1" /></HyperField>
          <HyperField label="Date of most recent episode"><HyperInput type="date" value={get("sym_blackout_last_date")} onChange={v => set("sym_blackout_last_date", v)} max={new Date().toISOString().split("T")[0]} /></HyperField>
          <HyperField label="Were you assessed by a doctor?"><HyperRadioGroup value={get("sym_blackout_assessed")} onChange={v => set("sym_blackout_assessed", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} inline /></HyperField>
          {get("sym_blackout_assessed") === "yes" && <HyperField label="What cause was identified?"><HyperInput value={get("sym_blackout_dx")} onChange={v => set("sym_blackout_dx", v)} placeholder="e.g. vasovagal" /></HyperField>}
        </>,
        `${get("sym_blackout_count") === "1" || get("sym_blackout_count") === 1 ? "Only one" : get("sym_blackout_count") || ""} black-out episode${parseInt(get("sym_blackout_count")) > 1 ? "s" : ""}${get("sym_blackout_last_date") ? " — most recent on " + fmtDate(get("sym_blackout_last_date")) : ""}.`
      );

      case "F23": return renderSymptomPage("F23","Have you experienced any shortness of breath — at rest or on exertion?","dyspnoea",
        <>
          <HyperField label="Onset"><HyperRadioGroup value={get("sym_dyspnoea_onset")} onChange={v => set("sym_dyspnoea_onset", v)} options={[{ value: "rest", label: "At rest" }, { value: "exertion", label: "On exertion" }, { value: "orthopnoea", label: "Lying flat (Orthopnoea)" }]} /></HyperField>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_dyspnoea_since_date")} onSinceDate={v => set("sym_dyspnoea_since_date", v)} years={get("sym_dyspnoea_years")} onYears={v => set("sym_dyspnoea_years", v)} months={get("sym_dyspnoea_months")} onMonths={v => set("sym_dyspnoea_months", v)} />
        </>,
        `Shortness of breath ${get("sym_dyspnoea_onset") ? (get("sym_dyspnoea_onset") === "rest" ? "at rest" : get("sym_dyspnoea_onset") === "exertion" ? "on exertion" : "on lying flat (Orthopnoea)") : ""} since last ${durationText(get("sym_dyspnoea_years"), get("sym_dyspnoea_months"), get("sym_dyspnoea_since_date"))}`
      );

      case "F24": return renderSymptomPage("F24","Do you experience difficulty concentrating?","concentration",
        <>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_concentration_since_date")} onSinceDate={v => set("sym_concentration_since_date", v)} years={get("sym_concentration_years")} onYears={v => set("sym_concentration_years", v)} months={get("sym_concentration_months")} onMonths={v => set("sym_concentration_months", v)} />
          <HyperField label="Does it affect your work or daily life?"><HyperRadioGroup value={get("sym_concentration_impact")} onChange={v => set("sym_concentration_impact", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} inline /></HyperField>
        </>,
        `Difficulty concentrating since last ${durationText(get("sym_concentration_years"), get("sym_concentration_months"), get("sym_concentration_since_date"))}.${get("sym_concentration_impact") === "yes" ? " Affects daily life." : ""}`
      );

      case "F25": return renderSymptomPage("F25","Do you have problems with memory?","memory",
        <>
          <HyperDurationPicker minDate={get("dob")} sinceDate={get("sym_memory_since_date")} onSinceDate={v => set("sym_memory_since_date", v)} years={get("sym_memory_years")} onYears={v => set("sym_memory_years", v)} months={get("sym_memory_months")} onMonths={v => set("sym_memory_months", v)} />
          <HyperField label="Does it affect your work or daily life?"><HyperRadioGroup value={get("sym_memory_impact")} onChange={v => set("sym_memory_impact", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} inline /></HyperField>
        </>,
        `Memory problems since last ${durationText(get("sym_memory_years"), get("sym_memory_months"), get("sym_memory_since_date"))}.${get("sym_memory_impact") === "yes" ? " Affects daily life." : get("sym_memory_impact") === "no" ? " Does not affect daily life." : ""}`
      );

      // ══════════════════════════════════════════════════════
      // MODULE G — TREATMENT & MONITORING
      // ══════════════════════════════════════════════════════

      case "G2": return (
        <div>
          <h3>Have you been advised radioiodine (RAI) therapy or surgery as the definitive treatment for your hyperthyroidism?</h3>
          <HyperYesNoUnsure value={get("definitive_tx_status")} onChange={v => set("definitive_tx_status", v)} />
          {get("definitive_tx_status") === "yes" && (
            <HyperSectionCard title="Definitive treatment plan">
              <HyperField label="Which is planned?">
                <HyperRadioGroup value={get("definitive_tx_type")} onChange={v => set("definitive_tx_type", v)} options={[{ value: "rai", label: "Radioiodine (RAI)" }, { value: "surgery", label: "Surgery" }, { value: "not_decided", label: "Not yet decided" }]} inline />
              </HyperField>
              <HyperField label="Planned date (optional)"><HyperInput type="date" value={get("definitive_tx_date")} onChange={v => set("definitive_tx_date", v)} min={new Date().toISOString().split("T")[0]} /></HyperField>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("definitive_tx_status") === "yes" && get("definitive_tx_type") ? `${get("definitive_tx_type") === "rai" ? "Radioiodine (RAI) therapy" : get("definitive_tx_type") === "surgery" ? "Surgery" : "Definitive treatment not yet decided"}${get("definitive_tx_date") ? " planned on " + fmtDate(get("definitive_tx_date")) : ""}.` : ""} />
        </div>
      );

      case "G3": return (
        <div>
          <h3>Has your medication dose been changed recently?</h3>
          <HyperYesNoUnsure value={get("dose_changed_status")} onChange={v => set("dose_changed_status", v)} />
          {get("dose_changed_status") === "yes" && (
            <HyperSectionCard title="Dose change details">
              <HyperField label="Date of last dose change"><HyperInput type="date" value={get("dose_changed_date")} onChange={v => set("dose_changed_date", v)} max={new Date().toISOString().split("T")[0]} /></HyperField>
              <HyperField label="Direction of change">
                <HyperRadioGroup value={get("dose_change_direction")} onChange={v => set("dose_change_direction", v)} options={[{ value: "increased", label: "Dose increased" }, { value: "reduced", label: "Dose reduced" }]} inline />
              </HyperField>
              <HyperField label="Reason for change">
                <HyperRadioGroup value={get("dose_changed_reason")} onChange={v => set("dose_changed_reason", v)} options={[{ value: "tsh_increased", label: "TSH increased (dose reduced)" }, { value: "tsh_decreased", label: "TSH decreased (dose increased)" }, { value: "side_effects", label: "Side effects" }, { value: "doctor_advice_other", label: "Doctor's advice or Other" }]} />
              </HyperField>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("dose_changed_status") === "yes" && get("dose_changed_date") ? `Dose of ${get("med_drug_name") ? "Tab. " + get("med_drug_name") : "medication"} was ${get("dose_change_direction") || ""} on ${fmtDate(get("dose_changed_date"))} as ${(get("dose_changed_reason") || "").replace(/_/g, " ")}.` : ""} />
        </div>
      );

      case "G4": return (
        <div>
          <h3>Are you currently taking a beta-blocker for heart rate control?</h3>
          <p style={{ color: "#666", fontSize: 14 }}>e.g. Propranolol, Atenolol</p>
          <HyperYesNoUnsure value={get("beta_blocker_status")} onChange={v => set("beta_blocker_status", v)} />
          {get("beta_blocker_status") === "yes" && (
            <HyperSectionCard title="Beta-blocker details">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <HyperField label="Drug name"><HyperInput value={get("beta_blocker_name")} onChange={v => set("beta_blocker_name", v)} placeholder="e.g. Propranolol" /></HyperField>
                <HyperField label="Dose (mg)"><HyperInput type="number" value={get("beta_blocker_dose")} onChange={v => set("beta_blocker_dose", v)} placeholder="e.g. 40" min={0} /></HyperField>
              </div>
              <HyperField label="Frequency">
                <HyperRadioGroup value={get("beta_blocker_freq")} onChange={v => set("beta_blocker_freq", v)} options={[{ value: "once", label: "Once daily" }, { value: "twice", label: "Twice daily" }, { value: "three_times", label: "Three times daily" }, { value: "as_needed", label: "As needed" }]} inline />
              </HyperField>
              <HyperDurationPicker minDate={get("dob")} label="Since when?" sinceDate={get("beta_blocker_since_date")} onSinceDate={v => set("beta_blocker_since_date", v)} years={get("beta_blocker_since_years")} onYears={v => set("beta_blocker_since_years", v)} months={get("beta_blocker_since_months_val")} onMonths={v => set("beta_blocker_since_months_val", v)} />
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("beta_blocker_status") === "yes" && get("beta_blocker_name") ? `Tab. ${get("beta_blocker_name")} ${get("beta_blocker_dose") || "?"} mg — ${get("beta_blocker_freq") ? get("beta_blocker_freq").replace(/_/g, " ").replace("once", "once daily").replace("twice", "twice daily").replace("three times", "three times daily") : ""}.${durationText(get("beta_blocker_since_years"), get("beta_blocker_since_months_val"), get("beta_blocker_since_date")) ? " Since " + durationText(get("beta_blocker_since_years"), get("beta_blocker_since_months_val"), get("beta_blocker_since_date")) + "." : ""}` : ""} />
        </div>
      );

      case "G5": return (
        <div>
          <h3>Does your doctor have a monitoring plan for your hyperthyroidism, and how often do you get your thyroid function tested?</h3>
          <HyperYesNoUnsure value={get("monitoring_status")} onChange={v => set("monitoring_status", v)} />
          {get("monitoring_status") === "yes" && (
            <HyperSectionCard title="Monitoring plan">
              <HyperField label="Review frequency">
                <HyperRadioGroup value={get("review_frequency_val")} onChange={v => set("review_frequency_val", v)} options={[{ value: "4_6_weeks", label: "Every 4–6 weeks" }, { value: "3_months", label: "Every 3 months" }, { value: "6_months", label: "Every 6 months" }, { value: "other", label: "Other" }]} inline />
              </HyperField>
              <HyperField label="Next review date (optional)"><HyperInput type="date" value={get("next_review_date_val")} onChange={v => set("next_review_date_val", v)} min={new Date().toISOString().split("T")[0]} /></HyperField>
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("monitoring_status") === "yes" && get("review_frequency_val") ? `Thyroid function reviewed every ${(get("review_frequency_val") || "").replace(/_/g, " ")}.${get("next_review_date_val") ? " Next review: " + fmtDate(get("next_review_date_val")) + "." : ""}` : ""} />
        </div>
      );

      // ══════════════════════════════════════════════════════
      // MODULE H — COMORBIDITIES & FINISH
      // ══════════════════════════════════════════════════════

      case "H1": return (
        <div>
          <h3>Have you been diagnosed with high cholesterol or dyslipidaemia?</h3>
          <HyperYesNoUnsure value={get("dyslipidaemia_status")} onChange={v => set("dyslipidaemia_status", v)} />
          {get("dyslipidaemia_status") === "yes" && (
            <HyperSectionCard title="Dyslipidaemia details">
              <HyperField label="Since when (months)"><HyperInput type="number" value={get("dyslipidaemia_since_months")} onChange={v => set("dyslipidaemia_since_months", v)} min={0} placeholder="e.g. 60" /></HyperField>
              <HyperField label="On medication to control cholesterol?"><HyperYesNoUnsure value={get("dyslipidaemia_on_med")} onChange={v => set("dyslipidaemia_on_med", v)} /></HyperField>
              {get("dyslipidaemia_on_med") === "yes" && (
                <div>
                  {(get("dyslipidaemia_med_data", [{ name: "", dose_mg: "", freq_per_day: "", since_months: "" }]) || []).map((med, i) => (
                    <HyperMedBlock key={i} med={med} index={i} onChange={v => { const a = [...(get("dyslipidaemia_med_data", []) || [])]; a[i] = v; set("dyslipidaemia_med_data", a); }} onRemove={i > 0 ? () => { const a = [...(get("dyslipidaemia_med_data", []) || [])]; a.splice(i, 1); set("dyslipidaemia_med_data", a); } : null} />
                  ))}
                  <button onClick={() => set("dyslipidaemia_med_data", [...(get("dyslipidaemia_med_data", []) || []), { name: "", dose_mg: "", freq_per_day: "", since_months: "" }])} style={{ padding: "6px 14px", background: "#eef4ff", border: "1.5px solid #3a7bd5", borderRadius: 6, color: "#3a7bd5", cursor: "pointer", fontSize: 13 }}>+ Add medicine</button>
                </div>
              )}
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("dyslipidaemia_status") === "yes" ? `Dyslipidaemia / Hypercholesterolaemia since last ${Math.floor((parseInt(get("dyslipidaemia_since_months")) || 0) / 12)} years${(parseInt(get("dyslipidaemia_since_months")) || 0) % 12 > 0 ? " " + ((parseInt(get("dyslipidaemia_since_months")) || 0) % 12) + " months" : ""}.${get("dyslipidaemia_on_med") === "yes" && (get("dyslipidaemia_med_data", []) || []).some(m => m.name) ? " On " + (get("dyslipidaemia_med_data", []) || []).filter(m => m.name).map(m => `Tab. ${m.name}${m.dose_mg ? " " + m.dose_mg + " mg" : ""}${m.freq_per_day ? " " + m.freq_per_day + " times/day" : ""}`).join(", ") + "." : ""}` : ""} />
        </div>
      );

      case "H2": return renderComorbiditySinglePage("H2","Have you been diagnosed with diabetes or high blood sugar?","diabetes",
        <>
          <HyperField label="Type">
            <HyperRadioGroup value={get("diabetes_type")} onChange={v => set("diabetes_type", v)} options={[{ value: "type1", label: "Type 1 diabetes" }, { value: "type2", label: "Type 2 diabetes" }, { value: "pre", label: "Pre-diabetes" }, { value: "not_specified", label: "Not specified" }]} />
          </HyperField>
          <HyperField label="Since when (months)"><HyperInput type="number" value={get("diabetes_since_months")} onChange={v => set("diabetes_since_months", v)} min={0} placeholder="e.g. 48" /></HyperField>
          <HyperField label="On medication?"><HyperYesNoUnsure value={get("diabetes_on_med")} onChange={v => set("diabetes_on_med", v)} /></HyperField>
          {get("diabetes_on_med") === "yes" && (
            <div>
              {(get("diabetes_med_data", [{ name: "", dose_mg: "", freq_per_day: "" }]) || []).map((med, i) => (
                <HyperMedBlock key={i} med={med} index={i} showSince={false} onChange={v => { const a = [...(get("diabetes_med_data", []) || [])]; a[i] = v; set("diabetes_med_data", a); }} onRemove={i > 0 ? () => { const a = [...(get("diabetes_med_data", []) || [])]; a.splice(i, 1); set("diabetes_med_data", a); } : null} />
              ))}
              <button onClick={() => set("diabetes_med_data", [...(get("diabetes_med_data", []) || []), { name: "", dose_mg: "", freq_per_day: "" }])} style={{ padding: "6px 14px", background: "#eef4ff", border: "1.5px solid #3a7bd5", borderRadius: 6, color: "#3a7bd5", cursor: "pointer", fontSize: 13 }}>+ Add medicine</button>
            </div>
          )}
        </>,
        `K/c/o ${(get("diabetes_type") || "").replace(/_/g, " ")} diabetes since last ${Math.floor((parseInt(get("diabetes_since_months")) || 0) / 12)} years.${get("diabetes_on_med") === "yes" && (get("diabetes_med_data", []) || []).some(m => m.name) ? " On " + (get("diabetes_med_data", []) || []).filter(m => m.name).map(m => `Tab. ${m.name}${m.dose_mg ? " (" + m.dose_mg + " mg)" : ""} — ${m.freq_per_day || "?"} times a day`).join(" and ") + "." : ""}`
      );

      case "H3": return renderComorbiditySinglePage("H3","Have you been diagnosed with anaemia?","anaemia",
        <>
          <HyperField label="Type if known (multi-select)"><HyperCheckGroup values={get("anaemia_types", [])} onChange={v => set("anaemia_types", v)} options={[{ value: "iron_deficiency", label: "Iron deficiency" }, { value: "b12_deficiency", label: "Vitamin B12 deficiency" }, { value: "folate_deficiency", label: "Folate deficiency" }, { value: "other", label: "Other" }, { value: "not_known", label: "Not known" }]} /></HyperField>
          <HyperField label="On medication?"><HyperYesNoUnsure value={get("anaemia_on_med")} onChange={v => set("anaemia_on_med", v)} /></HyperField>
          {get("anaemia_on_med") === "yes" && (
            <div>
              {(get("anaemia_med_data", [{ name: "", freq_per_day: "", since_months: "" }]) || []).map((med, i) => (
                <HyperMedBlock key={i} med={med} index={i} doseLabel="Dose (optional)" onChange={v => { const a = [...(get("anaemia_med_data", []) || [])]; a[i] = v; set("anaemia_med_data", a); }} onRemove={i > 0 ? () => { const a = [...(get("anaemia_med_data", []) || [])]; a.splice(i, 1); set("anaemia_med_data", a); } : null} />
              ))}
              <button onClick={() => set("anaemia_med_data", [...(get("anaemia_med_data", []) || []), { name: "", freq_per_day: "", since_months: "" }])} style={{ padding: "6px 14px", background: "#eef4ff", border: "1.5px solid #3a7bd5", borderRadius: 6, color: "#3a7bd5", cursor: "pointer", fontSize: 13 }}>+ Add medicine</button>
            </div>
          )}
        </>,
        `K/c/o ${(get("anaemia_types", []) || []).map(t => t.replace(/_/g, " ")).join(" + ")} anaemia.${get("anaemia_on_med") === "yes" && (get("anaemia_med_data", []) || []).some(m => m.name) ? " On " + (get("anaemia_med_data", []) || []).filter(m => m.name).map(m => `Tab. ${m.name}`).join(" and ") + "." : ""}`
      );

      case "H4": return (
        <div>
          <h3>Have you been diagnosed with polycystic ovarian syndrome (PCOS) / Polyendocrine Metabolic Ovarian Syndrome (PMOS)?</h3>
          <HyperYesNoUnsure value={get("pcos_status")} onChange={v => set("pcos_status", v)} />
          {get("pcos_status") === "yes" && (
            <HyperSectionCard title="PCOS / PMOS details">
              <HyperField label="Which diagnosis?"><HyperRadioGroup value={get("pcos_label")} onChange={v => set("pcos_label", v)} options={[{ value: "pcos", label: "PCOS" }, { value: "pmos", label: "PMOS" }]} inline /></HyperField>
              <HyperField label="Since when (months)"><HyperInput type="number" value={get("pcos_since_months")} onChange={v => set("pcos_since_months", v)} min={0} placeholder="e.g. 120" /></HyperField>
              <HyperField label="On medication?"><HyperYesNoUnsure value={get("pcos_on_med")} onChange={v => set("pcos_on_med", v)} /></HyperField>
              {get("pcos_on_med") === "yes" && (
                <div>
                  {(get("pcos_med_data", [{ name: "", dose_mg: "", freq_per_day: "" }]) || []).map((med, i) => (
                    <HyperMedBlock key={i} med={med} index={i} doseLabel="Dose (mg)" showSince={false} onChange={v => { const a = [...(get("pcos_med_data", []) || [])]; a[i] = v; set("pcos_med_data", a); }} onRemove={i > 0 ? () => { const a = [...(get("pcos_med_data", []) || [])]; a.splice(i, 1); set("pcos_med_data", a); } : null} />
                  ))}
                  <button onClick={() => set("pcos_med_data", [...(get("pcos_med_data", []) || []), { name: "", dose_mg: "", freq_per_day: "" }])} style={{ padding: "6px 14px", background: "#eef4ff", border: "1.5px solid #3a7bd5", borderRadius: 6, color: "#3a7bd5", cursor: "pointer", fontSize: 13 }}>+ Add medicine</button>
                </div>
              )}
            </HyperSectionCard>
          )}
          <HyperOutputBox text={get("pcos_status") === "yes" ? `K/c/o ${(get("pcos_label") || "PCOS").toUpperCase()} since last ${Math.floor((parseInt(get("pcos_since_months")) || 0) / 12)} years.${get("pcos_on_med") === "yes" && (get("pcos_med_data", []) || []).some(m => m.name) ? " On " + (get("pcos_med_data", []) || []).filter(m => m.name).map(m => `Tab. ${m.name}${m.dose_mg ? " (" + m.dose_mg + " mg)" : ""} — ${m.freq_per_day || "?"} times a day`).join(" and ") + "." : ""}` : ""} />
        </div>
      );

      case "H5": return (
        <div>
          <h3>Have you experienced any difficulty conceiving? (infertility)</h3>
          <HyperYesNoUnsure value={get("infertility_status")} onChange={v => set("infertility_status", v)} />
          <HyperOutputBox text={get("infertility_status") === "no" ? "No difficulty in conceiving" : get("infertility_status") === "yes" ? "Difficulty in conceiving reported." : ""} />
        </div>
      );

      case "H6": return renderComorbiditySinglePage("H6","Have you been formally diagnosed with depression by a doctor or psychiatrist?","depression",
        <HyperField label="Currently on medication for depression?"><HyperRadioGroup value={get("depression_on_med_status")} onChange={v => set("depression_on_med_status", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} inline /></HyperField>,
        `K/c/o depression.${get("depression_on_med_status") === "yes" ? " On medication." : ""}`
      );

      case "H8": return renderComorbiditySinglePage("H8","Have you been diagnosed with osteoporosis or osteopenia (low bone density)?","osteoporosis",
        <>
          <HyperField label="Confirmed by DEXA scan?"><HyperRadioGroup value={get("osteoporosis_dexa_status")} onChange={v => set("osteoporosis_dexa_status", v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} inline /></HyperField>
          <HyperField label="On bone-protection medication?"><HyperYesNoUnsure value={get("osteoporosis_on_med")} onChange={v => set("osteoporosis_on_med", v)} /></HyperField>
          {get("osteoporosis_on_med") === "yes" && (
            <div>
              {(get("osteoporosis_med_data", [{ name: "", freq_per_day: "", since_months: "" }]) || []).map((med, i) => (
                <HyperMedBlock key={i} med={med} index={i} doseLabel="Dose (optional)" onChange={v => { const a = [...(get("osteoporosis_med_data", []) || [])]; a[i] = v; set("osteoporosis_med_data", a); }} onRemove={i > 0 ? () => { const a = [...(get("osteoporosis_med_data", []) || [])]; a.splice(i, 1); set("osteoporosis_med_data", a); } : null} />
              ))}
              <button onClick={() => set("osteoporosis_med_data", [...(get("osteoporosis_med_data", []) || []), { name: "", freq_per_day: "", since_months: "" }])} style={{ padding: "6px 14px", background: "#eef4ff", border: "1.5px solid #3a7bd5", borderRadius: 6, color: "#3a7bd5", cursor: "pointer", fontSize: 13 }}>+ Add medicine</button>
            </div>
          )}
        </>,
        `K/c/o Osteoporosis${get("osteoporosis_dexa_status") === "yes" ? " — DEXA confirmed" : ""}.${get("osteoporosis_on_med") === "yes" ? " On bone-protection medication." : ""}`
      );

      case "H9": return (
        <div>
          <h3>Is there anything else about your thyroid condition or symptoms that you would like your doctor to know?</h3>
          <p style={{ color: "#666", fontSize: 14 }}>This field is optional.</p>
          <textarea value={get("additional_notes", "")} onChange={e => set("additional_notes", e.target.value)} rows={5} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #d0d7e8", borderRadius: 8, fontSize: 14, resize: "vertical", boxSizing: "border-box" }} placeholder="Type any additional information here..." />
          <p style={{ fontWeight: 600, fontSize: 14, marginTop: 20, marginBottom: 4 }}>Want to add any more reports, images, or documents?</p>
          <p style={{ color: "#666", fontSize: 13, marginBottom: 8 }}>Anything not covered by the questions above — old reports, discharge summaries, referral letters, etc.</p>
          <AdditionalDocumentsUploader patientId={patientId} episodeId={episodeId} category="other" />
        </div>
      );

      case "DONE": return (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: "#27ae60" }}>Questionnaire complete!</h2>
          <p style={{ color: "#555", fontSize: 16 }}>Thank you for completing the hyperthyroidism questionnaire. Your doctor will review your responses before your online opinion.</p>
          <button onClick={handleSubmit} disabled={saving} style={{ marginTop: 24, padding: "14px 40px", background: "#27ae60", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Submitting..." : "Submit to my doctor"}
          </button>
          {saveMsg && <p style={{ marginTop: 12, color: "#e74c3c" }}>{saveMsg}</p>}
        </div>
      );

      default: return <div><p>Page {pageId} not found.</p></div>;
    }
  };

  // ─── Reusable lab page renderer ───────────────────────────────────────────
  function renderLabPage(id, question, testName, key, defaultUnit, unitOptions) {
    const handleExtract = (extracted) => {
      if (extracted.value != null) set(`${key}_value`, extracted.value);
      if (extracted.unit != null && unitOptions.length > 1) set(`${key}_unit`, extracted.unit);
      if (extracted.date != null) set(`${key}_date`, extracted.date);
      if (extracted.refLow != null) set(`${key}_ref_low`, extracted.refLow);
      if (extracted.refHigh != null) set(`${key}_ref_high`, extracted.refHigh);
    };
    return (
      <div>
        <h3>{question}</h3>
        <HyperYesNoUnsure value={get(`${key}_status`)} onChange={v => set(`${key}_status`, v)} />
        {get(`${key}_status`) === "yes" && (
          <HyperSectionCard title={`${testName} result`}>
            <LabReportUpload
              patientId={patientId} episodeId={episodeId} fieldLabel={testName}
              category="blood_report"
              reports={get(`${key}_reports`, [])}
              onReportsChange={v => set(`${key}_reports`, v)}
              onExtract={handleExtract}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <HyperField label="Most recent value">
                <HyperInput type="number" value={get(`${key}_value`)} onChange={v => set(`${key}_value`, v)} placeholder="numeric" />
              </HyperField>
              <HyperField label="Unit">
                {unitOptions.length > 1
                  ? <HyperSelect value={get(`${key}_unit`) || unitOptions[0]} onChange={v => set(`${key}_unit`, v)} options={unitOptions.map(u => ({ value: u, label: u }))} />
                  : <HyperInput value={defaultUnit} onChange={() => {}} style={{ background: "#f5f5f5", color: "#888" }} />}
              </HyperField>
            </div>
            <HyperField label="Date of test">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <HyperInput type="date" value={get(`${key}_date`)} onChange={v => set(`${key}_date`, v)} max={new Date().toISOString().split("T")[0]} />
                {id !== "D1" && <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, whiteSpace: "nowrap", cursor: "pointer" }}><input type="checkbox" onChange={e => e.target.checked && set(`${key}_date`, get("tsh_date"))} /> Same as TSH</label>}
              </div>
            </HyperField>
            <HyperField label="Lab reference range">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <HyperInput type="number" value={get(`${key}_ref_low`)} onChange={v => set(`${key}_ref_low`, v)} placeholder="Low" />
                <span style={{ color: "#888" }}>–</span>
                <HyperInput type="number" value={get(`${key}_ref_high`)} onChange={v => set(`${key}_ref_high`, v)} placeholder="High" />
              </div>
            </HyperField>
          </HyperSectionCard>
        )}
        <HyperOutputBox text={get(`${key}_status`) === "yes" && get(`${key}_value`) ? `${testName} — ${get(`${key}_value`)} ${get(`${key}_unit`) || defaultUnit}  (${fmtDate(get(`${key}_date`))})` : ""} />
      </div>
    );
  }

  // ─── Reusable symptom page renderer ──────────────────────────────────────
  function renderSymptomPage(id, question, key, subContent, outputText) {
    return (
      <div>
        <h3>{question}</h3>
        <HyperYesNoUnsure value={get(`sym_${key}_status`)} onChange={v => set(`sym_${key}_status`, v)} />
        {get(`sym_${key}_status`) === "yes" && (
          <HyperSectionCard title="Details">
            {subContent}
          </HyperSectionCard>
        )}
        <HyperOutputBox text={get(`sym_${key}_status`) === "yes" ? outputText : ""} />
      </div>
    );
  }

  // ─── Reusable hair/nail page (each type has own duration) ────────────────
  function renderHairNailPage(id, question, key, typeOptions) {
    const dataKey = `sym_${key}_data`;
    const selectedTypes = get(`sym_${key}_status`) === "yes" ? (get(dataKey, []) || []) : [];
    const toggleType = (typeVal) => {
      const exists = selectedTypes.find(t => t.type === typeVal);
      if (exists) set(dataKey, selectedTypes.filter(t => t.type !== typeVal));
      else set(dataKey, [...selectedTypes, { type: typeVal, since_date: "", years: "", months: "" }]);
    };
    const updateEntry = (typeVal, field, value) => {
      set(dataKey, selectedTypes.map(t => t.type === typeVal ? { ...t, [field]: value } : t));
    };
    return (
      <div>
        <h3>{question}</h3>
        <HyperYesNoUnsure value={get(`sym_${key}_status`)} onChange={v => set(`sym_${key}_status`, v)} />
        {get(`sym_${key}_status`) === "yes" && (
          <HyperSectionCard title="Details">
            <HyperField label="Type (select all that apply)">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {typeOptions.map(opt => {
                  const entry = selectedTypes.find(t => t.type === opt.value);
                  return (
                    <div key={opt.value}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${entry ? "#3a7bd5" : "#d0d7e8"}`, background: entry ? "#eef4ff" : "#fff", fontSize: 14 }}>
                        <input type="checkbox" checked={!!entry} onChange={() => toggleType(opt.value)} style={{ accentColor: "#3a7bd5" }} />
                        {opt.label}
                      </label>
                      {entry && (
                        <div style={{ paddingLeft: 24, marginTop: 6, marginBottom: 6 }}>
                          <HyperDurationPicker minDate={get("dob")} label={`Since when? (${opt.label})`} sinceDate={entry.since_date} onSinceDate={v => updateEntry(opt.value, "since_date", v)} years={entry.years} onYears={v => updateEntry(opt.value, "years", v)} months={entry.months} onMonths={v => updateEntry(opt.value, "months", v)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </HyperField>
          </HyperSectionCard>
        )}
        <HyperOutputBox text={get(`sym_${key}_status`) === "yes" && selectedTypes.length > 0 ? selectedTypes.map(t => { const opt = typeOptions.find(o => o.value === t.type); return `${opt ? opt.label : t.type} since last ${durationText(t.years, t.months, t.since_date)}`; }).join(". ") : ""} />
      </div>
    );
  }

  // ─── Reusable comorbidity page (Yes → sub-content, output) ───────────────
  function renderComorbiditySinglePage(id, question, key, subContent, outputText) {
    return (
      <div>
        <h3>{question}</h3>
        <HyperYesNoUnsure value={get(`${key}_status`)} onChange={v => set(`${key}_status`, v)} />
        {get(`${key}_status`) === "yes" && (
          <HyperSectionCard title="Details">
            {subContent}
          </HyperSectionCard>
        )}
        <HyperOutputBox text={get(`${key}_status`) === "yes" ? outputText : ""} />
      </div>
    );
  }

  // ─── Shell ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", fontFamily: "'DM Sans', Arial, sans-serif", color: "#1a1a2e" }}>
      {draftLoadError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{draftLoadError}</span>
          <button onClick={loadDraft} className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>Retry</button>
        </div>
      )}
      {/* Progress bar */}
      <div style={{ position: "sticky", top: 0, background: "#fff", zIndex: 10, padding: "12px 0 8px", borderBottom: "1px solid #e8edf5" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#3a7bd5" }}>Hyperthyroidism Questionnaire</span>
          <span style={{ fontSize: 13, color: "#888" }}>{progress}% complete</span>
        </div>
        <div style={{ height: 6, background: "#e8edf5", borderRadius: 3 }}>
          <div style={{ height: 6, background: "linear-gradient(90deg, #3a7bd5, #27ae60)", borderRadius: 3, width: `${progress}%`, transition: "width 0.3s" }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {["A", "B", "C", "D", "E", "F", "G", "H"].map(mod => {
            const pages = allPages.filter(p => p.startsWith(mod));
            const done = pages.some(p => allPages.indexOf(p) < currentPage);
            const active = pages.some(p => p === pageId);
            return pages.length > 0 ? (
              <span key={mod} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: active ? "#3a7bd5" : done ? "#e8f5e9" : "#f0f4fb", color: active ? "#fff" : done ? "#27ae60" : "#888", fontWeight: active ? 700 : 400 }}>
                Mod {mod}
              </span>
            ) : null;
          })}
        </div>
      </div>

      {/* Question card */}
      <div ref={pageContentRef} style={{ position: "relative", background: "#fff", borderRadius: 12, border: "1.5px solid #e8edf5", padding: "28px 32px", marginTop: 16 }}>
        {saveMsg && pageId !== "DONE" && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#991b1b" }}>{saveMsg}</div>
        )}
        {renderPage()}
        <HyperMissingPointer containerRef={pageContentRef} pageKey={pageId}
          active={reviewMode && incompleteList.some(({ idx }) => idx === currentPage)} />
      </div>

      {/* Navigation */}
      {pageId !== "DONE" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, padding: "0 4px", marginBottom: incompleteList.length > 0 ? 60 : 0 }}>
          <button onClick={currentPage === 0 ? onBack : prev} disabled={currentPage === 0 && !onBack} style={{ padding: "10px 24px", background: (currentPage === 0 && !onBack) ? "#f0f4fb" : "#fff", border: "1.5px solid #d0d7e8", borderRadius: 8, cursor: (currentPage === 0 && !onBack) ? "default" : "pointer", color: (currentPage === 0 && !onBack) ? "#bbb" : "#444", fontSize: 14 }}>
            ← Back
          </button>
          {saveMsg === "✓ Saved" && <span style={{ fontSize: 12, color: "#888" }}>✓ Saved</span>}
          <button onClick={next} disabled={(currentPage >= allPages.length - 1 && !reviewMode) || yearInvalid} style={{ padding: "10px 24px", background: "#3a7bd5", border: "none", borderRadius: 8, cursor: "pointer", color: "#fff", fontSize: 14, fontWeight: 600 }}>
            {reviewMode ? "Next unanswered →" : "Next →"}
          </button>
        </div>
      )}

      {/* Bottom strip listing every unanswered question — appears once
          Submit has been attempted and something's missing, disappears
          once everything's fixed (fully derived from incompleteList, so
          it reappears automatically if Submit is clicked again and
          something's still missing). */}
      {incompleteList.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, background: "#fff", borderTop: "2px solid #e6a3a3", boxShadow: "0 -2px 12px rgba(0,0,0,0.10)", padding: "10px 20px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#a83232", marginRight: 4 }}>{incompleteList.length} unanswered — jump to:</span>
          {incompleteList.map(({ id, idx }) => (
            <button key={id} onClick={() => { setSaveMsg(""); setCurrentPage(idx); }}
              style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 12, cursor: "pointer", border: `1.5px solid ${idx === currentPage ? "#3a7bd5" : "#e6a3a3"}`, background: idx === currentPage ? "#eef4ff" : "#fff", color: idx === currentPage ? "#3a7bd5" : "#a83232" }}>
              Q{idx + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
