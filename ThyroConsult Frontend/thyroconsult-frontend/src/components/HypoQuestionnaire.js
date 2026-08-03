/**
 * HypoQuestionnaire.js (renamed from ConditionQuestionnaires.js)
 *
 * Contains <HypoQuestionnaire /> — Hypothyroidism. Used to also re-export
 * <HyperQuestionnaire /> from its own standalone file for backward
 * compatibility, since the only known consumer (PatientPortal.js) hadn't
 * been checked yet. That's now been verified and fixed directly — see
 * PatientPortal.js's own import lines — so the re-export was removed.
 *
 * REMOVED as part of this rename: the old dead <TcQuestionnaire /> stub
 * (~270 lines) that used to live at the bottom of this file. It was never
 * the real component — the real, standalone TcQuestionnaire.js (1493
 * lines) is what PatientPortal.js/RegisterPage.js actually import.
 *
 * Props pattern: patientId, episodeId, patientGender, onComplete, onBack
 */

import React, { useState, useEffect, useCallback } from 'react';
import { conditionAPI, patientAPI } from '../api';
import { Spinner, Alert, AdditionalDocumentsUploader, LabReportUpload } from './common/index';

// ── Shared field helpers (same as CoreQuestionnaire) ─────
const Field = ({ label, required, children, hint }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
      {label}{required && <span style={{ color: 'var(--red-600)' }}> *</span>}
    </label>
    {children}
    {hint && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{hint}</div>}
  </div>
);

const Input = ({ value, onChange, type = 'text', placeholder, max, min, step, style, disabled }) => (
  <input className="form-control" type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
    placeholder={placeholder} max={max} min={min} step={step} disabled={disabled}
    style={{ fontSize: 13, ...style }} />
);

const Select = ({ value, onChange, options, placeholder = 'Select...' }) => (
  <select className="form-control" value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }}>
    <option value="">{placeholder}</option>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

const BoolRow = ({ label, value, onChange, hint }) => (
  <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {[['Yes', true], ['No', false]].map(([l, v]) => (
          <button key={l} onClick={() => onChange(v)} style={{
            padding: '3px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
            border: `1px solid ${value === v ? 'var(--teal-400)' : 'var(--border)'}`,
            background: value === v ? 'var(--teal-50)' : 'transparent',
            color: value === v ? 'var(--teal-600)' : 'var(--text-secondary)',
            fontWeight: value === v ? 500 : 400,
          }}>{l}</button>
        ))}
      </div>
    </div>
    {hint && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{hint}</div>}
  </div>
);

const SectionTitle = ({ title, icon }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', padding: '14px 0 8px', borderBottom: '2px solid var(--border)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
    <span>{icon}</span>{title}
  </div>
);

const FreqSelect = ({ label, value, onChange }) => (
  <Field label={label}>
    <Select value={value} onChange={onChange} options={[
      ['never', 'Never'], ['occasionally', 'Occasionally'], ['frequently', 'Frequently'], ['always', 'Always']
    ]} />
  </Field>
);

const SeveritySelect = ({ label, value, onChange }) => (
  <Field label={label}>
    <Select value={value} onChange={onChange} options={[
      ['none', 'None'], ['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe']
    ]} />
  </Field>
);

// ── Save + nav footer shared by all three ────────────────
const QuestionnaireFooter = ({ onBack, onSave, saving, onSaveAndContinue }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
    <button className="btn btn-secondary" onClick={onBack}>← Back</button>
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn btn-ghost" onClick={onSave} disabled={saving}>
        {saving ? <Spinner size={16} /> : '💾 Save draft'}
      </button>
      <button className="btn btn-primary btn-lg" onClick={onSaveAndContinue} disabled={saving}>
        {saving ? <Spinner size={18} color="#fff" /> : 'Save & continue to reports →'}
      </button>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════
// HYPOTHYROIDISM QUESTIONNAIRE
// ═══════════════════════════════════════════════════════════

// ─── Thyroid medication brand → generic name + available doses ───
// ─── Thyroid medication brand → generic name + available doses ───
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

// ─── Liothyronine (LT3) brand → generic name + available doses (mcg) ───
const LIOTHYRONINE_BRANDS = {
  'Thyonin':    { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
  'Tertroxin':  { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
  'Linorma T':  { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
  'Thyro3':     { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
  'Liorel':     { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
  'Cytomel':    { generic: 'Liothyronine Sodium', doses: [5, 25, 50] },
};

// ─── Shared UI primitives ─────────────────────────────────
const HypoField = ({ label, hint, children }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>}
    {children}
    {hint && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{hint}</div>}
  </div>
);

// Fixed min-height applied to every option pill so screens with short vs.
// long option labels (e.g. "No" vs "Every time I stand") don't produce
// visibly uneven box heights as the patient navigates back and forth.
// Text still wraps to 2 lines for long labels rather than being clipped —
// only the minimum is fixed, so nothing is cut off.
const HYPO_OPTION_MIN_HEIGHT = 40;

const HypoRadioGroup = ({ options, value, onChange, horizontal, noMargin }) => (
  <div data-hyporeq-type="select" data-hyporeq-filled={value ? 'true' : 'false'}
    style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', flexWrap: 'wrap', gap: 8, marginBottom: noMargin ? 0 : 12 }}>
    {options.map(([val, label]) => (
      <div key={val} onClick={() => onChange(val)} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
        border: `1.5px solid ${value === val ? 'var(--teal-400)' : 'var(--border)'}`,
        background: value === val ? 'var(--teal-50)' : 'var(--surface)',
        color: value === val ? 'var(--teal-700)' : 'var(--text-primary)',
        fontSize: 13, flex: horizontal ? '1 1 auto' : undefined,
        minHeight: HYPO_OPTION_MIN_HEIGHT, boxSizing: 'border-box',
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
          border: `1.5px solid ${value === val ? 'var(--teal-500)' : 'var(--border-md)'}`,
          background: value === val ? 'var(--teal-500)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {value === val && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
        </div>
        {label}
      </div>
    ))}
  </div>
);

const HypoMultiSelect = ({ options, value = [], onChange }) => (
  <div data-hyporeq-type="select" data-hyporeq-filled={value.length ? 'true' : 'false'}
    style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
    {options.map(([val, label]) => {
      const sel = value.includes(val);
      return (
        <div key={val} onClick={() => onChange(sel ? value.filter(v => v !== val) : [...value, val])} style={{
          padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12,
          border: `1px solid ${sel ? 'var(--teal-400)' : 'var(--border)'}`,
          background: sel ? 'var(--teal-50)' : 'transparent',
          color: sel ? 'var(--teal-700)' : 'var(--text-secondary)',
          fontWeight: sel ? 500 : 400,
          minHeight: HYPO_OPTION_MIN_HEIGHT, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center',
        }}>{label}</div>
      );
    })}
  </div>
);

// ── Pill-style checkbox row, used for the multi-select dose grid (item 2)
// and the investigation-selection checkboxes (item 3). Distinct from
// HypoMultiSelect (rounded pill tags) — this is a checkbox-style grid,
// fixed at 5 items per row per the dose-picker spec, wrapping naturally
// for lists shorter than 5.
const HypoCheckPillGrid = ({ options, value = [], onChange, perRow = 5 }) => (
  <div data-hyporeq-type="select" data-hyporeq-filled={value.length ? 'true' : 'false'}
    style={{ display: 'grid', gridTemplateColumns: `repeat(${perRow}, 1fr)`, gap: 8, marginBottom: 12 }}>
    {options.map(([val, label]) => {
      const sel = value.includes(val);
      return (
        <div key={val} onClick={() => onChange(sel ? value.filter(v => v !== val) : [...value, val])} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          padding: '8px 6px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
          border: `1.5px solid ${sel ? 'var(--teal-400)' : 'var(--border)'}`,
          background: sel ? 'var(--teal-50)' : 'var(--surface)',
          color: sel ? 'var(--teal-700)' : 'var(--text-primary)',
          minHeight: HYPO_OPTION_MIN_HEIGHT, boxSizing: 'border-box',
        }}>{label}</div>
      );
    })}
  </div>
);

// Single-select variant of the above (one dose chosen, not multiple) —
// same 5-per-row pill grid but behaves like a radio group.
const HypoPillSelect = ({ options, value, onChange, perRow = 5 }) => (
  <div data-hyporeq-type="select" data-hyporeq-filled={value ? 'true' : 'false'}
    style={{ display: 'grid', gridTemplateColumns: `repeat(${perRow}, 1fr)`, gap: 8, marginBottom: 12 }}>
    {options.map(opt => {
      const sel = value === opt;
      return (
        <div key={opt} onClick={() => onChange(opt)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          padding: '8px 6px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
          border: `1.5px solid ${sel ? 'var(--teal-400)' : 'var(--border)'}`,
          background: sel ? 'var(--teal-50)' : 'var(--surface)',
          color: sel ? 'var(--teal-700)' : 'var(--text-primary)',
          minHeight: HYPO_OPTION_MIN_HEIGHT, boxSizing: 'border-box',
        }}>{opt} mcg</div>
      );
    })}
  </div>
);

const HypoTextInput = ({ value, onChange, placeholder, type = 'text', min, max, step, style }) => (
  <input className="form-input" type={type} value={value || ''} min={min} max={max} step={step}
    onChange={e => onChange(e.target.value)} placeholder={placeholder}
    data-hyporeq-type="text" data-hyporeq-filled={value ? 'true' : 'false'}
    style={{ fontSize: 13, ...style }} />
);

// Was referenced at two call sites (antitpoUnit/antitgUnit) but never
// defined anywhere in this file — a plain single-value dropdown, matching
// the same native <select> pattern already used inline for the FT3/FT4/TSH
// unit pickers elsewhere in this component (see HypoLabScreen below).
const HypoSelect = ({ value, onChange, options, placeholder = 'Select...', style }) => (
  <select className="form-input" style={{ fontSize: 13, ...style }}
    value={value || ''} onChange={e => onChange(e.target.value)}
    data-hyporeq-type="select" data-hyporeq-filled={value ? 'true' : 'false'}>
    <option value="">{placeholder}</option>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

// Year-of-event input (diagnosis / surgery / RAI / any other "what year
// did X happen" question) that can never be before the patient's own
// birth year. A plain HTML min attribute doesn't stop someone from
// typing an out-of-range value — it only affects the spinner arrows —
// so this validates on every change and shows an inline error.
const HypoYearInput = ({ value, onChange, dob, style }) => {
  const dobYear = dob ? new Date(dob).getFullYear() : null;
  const thisYear = new Date().getFullYear();
  const invalid = dobYear && value && parseInt(value) < dobYear;
  return (
    <div>
      <HypoTextInput type="number" min={dobYear || 1900} max={thisYear} value={value}
        onChange={onChange} style={{ width: 100, ...style }} />
      {invalid && (
        <div style={{ fontSize: 11, color: 'var(--red-600, #c0392b)', marginTop: 4 }}>
          Can't be before your birth year ({dobYear})
        </div>
      )}
    </div>
  );
};

const HypoDateInput = ({ value, onChange, maxDate, minDate }) => (
  <input className="form-input" type="date" value={value || ''}
    onChange={e => onChange(e.target.value)}
    max={maxDate || new Date().toISOString().split('T')[0]}
    min={minDate || undefined}
    data-hyporeq-type="date" data-hyporeq-filled={value ? 'true' : 'false'}
    style={{ fontSize: 13, width: 180 }} />
);

// 3x4 grid year picker — opened by clicking the year button in HypoDobField.
// Native browser date-inputs don't expose a "year selection" view that can
// be customized, so this is a small custom popup instead.
const HypoYearGrid = ({ selectedYear, onSelect, onClose }) => {
  const currentYear = new Date().getFullYear();
  const [blockStart, setBlockStart] = useState(
    Math.floor(((selectedYear || currentYear) - 1) / 12) * 12 + 1
  );
  const years = Array.from({ length: 12 }, (_, i) => blockStart + i);
  return (
    <div style={{ position: 'absolute', zIndex: 20, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', width: 200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button type="button" onClick={() => setBlockStart(b => b - 12)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, padding: '2px 8px' }}>‹</button>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{blockStart}–{blockStart + 11}</span>
        <button type="button" onClick={() => setBlockStart(b => b + 12)} disabled={blockStart + 12 > currentYear}
          style={{ border: 'none', background: 'none', cursor: blockStart + 12 > currentYear ? 'default' : 'pointer', fontSize: 15, padding: '2px 8px', opacity: blockStart + 12 > currentYear ? 0.3 : 1 }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {years.map(y => (
          <button type="button" key={y} disabled={y > currentYear}
            onClick={() => { onSelect(y); onClose(); }}
            style={{
              padding: '8px 0', fontSize: 12, borderRadius: 6, cursor: y > currentYear ? 'default' : 'pointer',
              border: y === selectedYear ? '1.5px solid var(--teal-500)' : '1px solid var(--border)',
              background: y === selectedYear ? 'var(--teal-50)' : '#fff',
              color: y > currentYear ? '#ccc' : (y === selectedYear ? 'var(--teal-600)' : 'var(--text-primary)'),
            }}>
            {y}
          </button>
        ))}
      </div>
    </div>
  );
};

const HYPO_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Combined DOB entry: day/month selects + a year button that opens the
// 3x4 grid, with an "age in years/months" alternative underneath for
// patients who don't know their exact date of birth. Either one on its
// own is enough — the two stay in sync (entering DOB fills in age, and
// vice versa gives an approximate DOB).
const HypoDobField = ({ dob, ageYears, ageMonths, onChange }) => {
  const [showYearGrid, setShowYearGrid] = useState(false);
  const parsed = dob ? new Date(dob + 'T00:00:00') : null;
  const day = parsed ? parsed.getDate() : '';
  const month = parsed ? parsed.getMonth() : '';
  const year = parsed ? parsed.getFullYear() : null;

  const setDatePart = (d, m, y) => {
    if (d && m !== '' && y) {
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
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
    const newAgeYears = field === 'years' ? val : ageYears;
    const newAgeMonths = field === 'months' ? val : ageMonths;
    const totalMonths = (parseInt(newAgeYears) || 0) * 12 + (parseInt(newAgeMonths) || 0);
    const approxDob = new Date();
    approxDob.setMonth(approxDob.getMonth() - totalMonths);
    onChange({
      dob: totalMonths > 0 ? approxDob.toISOString().split('T')[0] : '',
      ageYears: newAgeYears, ageMonths: newAgeMonths,
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={day} onChange={e => setDatePart(parseInt(e.target.value), month === '' ? 0 : month, year || new Date().getFullYear())}
          style={{ padding: '8px 6px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)' }}>
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={month} onChange={e => setDatePart(day || 1, parseInt(e.target.value), year || new Date().getFullYear())}
          style={{ padding: '8px 6px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)' }}>
          <option value="">Month</option>
          {HYPO_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setShowYearGrid(s => !s)}
            style={{ padding: '8px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', minWidth: 70 }}>
            {year || 'Year'}
          </button>
          {showYearGrid && (
            <HypoYearGrid selectedYear={year} onSelect={y => setDatePart(day || 1, month === '' ? 0 : month, y)} onClose={() => setShowYearGrid(false)} />
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '10px 0 6px' }}>— or, if you don't know the exact date —</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" min="0" max="120" value={ageYears} onChange={e => setAgePart('years', e.target.value)}
          placeholder="Years" style={{ width: 70, padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)' }} />
        <input type="number" min="0" max="11" value={ageMonths} onChange={e => setAgePart('months', e.target.value)}
          placeholder="Months" style={{ width: 80, padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)' }} />
      </div>
    </div>
  );
};

// LMP entry: same day/month/year-grid picker as DOB, with a "can't
// remember exactly" fallback that asks roughly how many weeks ago
// instead (LMP dates are usually recent, unlike DOB, so an approximate
// weeks-ago figure is the natural fallback here rather than years).
const HypoLmpField = ({ lmpDate, lmpApproxWeeks, lmpUnknown, onChange }) => {
  const [showYearGrid, setShowYearGrid] = useState(false);
  // Default to today's date on first render if nothing's been entered yet
  // — the patient adjusts it if it's wrong, rather than starting from 3
  // blank dropdowns every time.
  useEffect(() => {
    if (!lmpDate && !lmpUnknown) {
      onChange({ lmpDate: new Date().toISOString().split('T')[0], lmpApproxWeeks: '', lmpUnknown: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsed = lmpDate ? new Date(lmpDate + 'T00:00:00') : null;
  const day = parsed ? parsed.getDate() : '';
  const month = parsed ? parsed.getMonth() : '';
  const year = parsed ? parsed.getFullYear() : null;

  const setDatePart = (d, m, y) => {
    if (d && m !== '' && y) {
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      onChange({ lmpDate: `${y}-${mm}-${dd}`, lmpApproxWeeks: '', lmpUnknown: false });
    }
  };

  const setApproxWeeks = (val) => {
    const weeks = parseInt(val) || 0;
    const approx = new Date();
    approx.setDate(approx.getDate() - weeks * 7);
    onChange({
      lmpDate: weeks > 0 ? approx.toISOString().split('T')[0] : lmpDate,
      lmpApproxWeeks: val, lmpUnknown: true,
    });
  };

  return (
    <div>
      {/* Exact date — always visible, dimmed (not hidden) once "Can't
          remember" is checked so the patient can still see/toggle back
          to it without losing their place. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: lmpUnknown ? 0.4 : 1, pointerEvents: lmpUnknown ? 'none' : 'auto', transition: 'opacity 0.15s' }}>
        <select value={day} onChange={e => setDatePart(parseInt(e.target.value), month === '' ? 0 : month, year || new Date().getFullYear())}
          style={{ padding: '8px 6px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)' }}>
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={month} onChange={e => setDatePart(day || 1, parseInt(e.target.value), year || new Date().getFullYear())}
          style={{ padding: '8px 6px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)' }}>
          <option value="">Month</option>
          {HYPO_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setShowYearGrid(s => !s)}
            style={{ padding: '8px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', minWidth: 70 }}>
            {year || 'Year'}
          </button>
          {showYearGrid && (
            <HypoYearGrid selectedYear={year} onSelect={y => setDatePart(day || 1, month === '' ? 0 : month, y)} onClose={() => setShowYearGrid(false)} />
          )}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', margin: '10px 0', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!lmpUnknown} onChange={e => {
          if (e.target.checked) onChange({ lmpDate, lmpApproxWeeks, lmpUnknown: true });
          else onChange({ lmpDate: lmpDate || new Date().toISOString().split('T')[0], lmpApproxWeeks: '', lmpUnknown: false });
        }} />
        Can't remember exactly
      </label>

      {lmpUnknown && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" min="0" max="52" value={lmpApproxWeeks} onChange={e => setApproxWeeks(e.target.value)}
            placeholder="e.g. 6" style={{ width: 90, padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>weeks ago (approximately)</span>
        </div>
      )}
    </div>
  );
};

const HypoDurationPicker = ({ value = {}, onChange, label = 'Since when?', minDate }) => (
  <HypoField label={label}>
    <div data-hyporeq-type="duration" data-hyporeq-filled={(value.date || value.years || value.months) ? 'true' : 'false'}
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Date (if known)</div>
        <HypoDateInput value={value.date} onChange={v => onChange({ ...value, date: v })} minDate={minDate} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', paddingBottom: 8 }}>— or —</div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Years</div>
        <HypoTextInput type="number" min="0" value={value.years} onChange={v => onChange({ ...value, years: v })} style={{ width: 70 }} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Months</div>
        <HypoTextInput type="number" min="0" max="11" value={value.months} onChange={v => onChange({ ...value, months: v })} style={{ width: 70 }} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Days</div>
        <HypoTextInput type="number" min="0" max="30" value={value.days} onChange={v => onChange({ ...value, days: v })} style={{ width: 70 }} />
      </div>
    </div>
  </HypoField>
);

const HypoSubBlock = ({ children }) => (
  <div style={{
    background: 'var(--gray-50)', borderLeft: '3px solid var(--teal-400)',
    borderRadius: '0 8px 8px 0', padding: '14px 16px', marginBottom: 12,
  }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal-600)', marginBottom: 10 }}>
      ↳ Additional details
    </div>
    {children}
  </div>
);

// No longer rendered on the patient-facing screen (per explicit request —
// the per-question preview sentence was considered unnecessary/confusing
// for patients to see live). The underlying answers are still saved
// normally via mapFormToDb regardless of what this renders; nothing here
// affects what data reaches the physician.
const HypoOutputBox = () => null;

const HYPOREQ_MESSAGES = {
  select: 'Select any one',
  date: 'Enter date',
  duration: 'Enter duration',
  text: 'Enter details',
};

// Scans the current page's rendered DOM (via containerRef) for the first
// data-hyporeq-filled="false" marker — set generically by every shared
// input primitive above (HypoRadioGroup, HypoTextInput, HypoDatePicker,
// etc.) — and points a small animated arrow at it with a plain-language
// hint. This works across every screen without hand-mapping which field
// is missing on each of the ~50 pages individually: any primitive with no
// value is, by this app's own rule that every question needs an answer,
// the thing blocking submission.
const HypoMissingPointer = ({ containerRef, active, pageKey }) => {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!active || !containerRef.current) { setPos(null); return; }
    const scan = () => {
      if (!containerRef.current) return;
      const el = containerRef.current.querySelector('[data-hyporeq-filled="false"]');
      if (!el) { setPos(null); return; }
      const elRect = el.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      setPos({
        top: elRect.top - containerRect.top,
        left: elRect.left - containerRect.left,
        type: el.getAttribute('data-hyporeq-type') || 'select',
      });
    };
    scan();
    // Re-scan shortly after in case conditional sub-fields haven't
    // finished settling into their final layout on the first paint.
    const t = setTimeout(scan, 60);
    // A single scan on mount isn't enough — as the patient answers one
    // field on a multi-field screen (e.g. Pain/Numbness/Tingling, each
    // tracked separately), data-hyporeq-filled flips on that field but
    // nothing here re-triggered the effect, so the arrow stayed stuck at
    // its very first position instead of following the next actual gap.
    // A MutationObserver catches every such change directly, regardless
    // of what caused it (radio pick, typed value, a newly-revealed
    // conditional sub-field, an investigation checkbox toggling on).
    const observer = new MutationObserver(scan);
    observer.observe(containerRef.current, {
      attributes: true, attributeFilter: ['data-hyporeq-filled'],
      childList: true, subtree: true,
    });
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [active, containerRef, pageKey]);

  if (!pos) return null;
  return (
    <>
      <style>{`
        @keyframes hyporeqBounce { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(7px); } }
        .hyporeq-arrow { animation: hyporeqBounce 0.9s ease-in-out infinite; }
      `}</style>
      <div style={{
        position: 'absolute', top: Math.max(0, pos.top - 30), left: pos.left,
        display: 'flex', alignItems: 'center', gap: 4, zIndex: 5, pointerEvents: 'none',
      }}>
        <div style={{
          background: 'var(--red-600, #c0392b)', color: '#fff', fontSize: 11, fontWeight: 600,
          padding: '3px 9px', borderRadius: 6, whiteSpace: 'nowrap',
        }}>
          {HYPOREQ_MESSAGES[pos.type] || 'Answer this question'}
        </div>
        <div className="hyporeq-arrow" style={{ fontSize: 15, color: 'var(--red-600, #c0392b)' }}>➜</div>
      </div>
    </>
  );
};

const HypoSkipNote = ({ text }) => (
  <div style={{ fontSize: 11, color: 'var(--amber-700)', background: 'var(--amber-50)',
    border: '1px solid var(--amber-200)', borderRadius: 6, padding: '5px 10px', marginTop: 6 }}>
    {text}
  </div>
);

const HypoInfoNote = ({ text }) => (
  <div style={{ fontSize: 11, color: 'var(--blue-700)', background: 'var(--blue-50)',
    border: '1px solid var(--blue-200)', borderRadius: 6, padding: '5px 10px', marginTop: 6 }}>
    {text}
  </div>
);

// ─── Duration formatter ───────────────────────────────────
function formatDuration(d) {
  if (!d) return '';
  if (d.date) return `since ${new Date(d.date).toLocaleDateString('en-IN')}`;
  const parts = [];
  if (d.years && parseInt(d.years) > 0) parts.push(`${d.years} year${d.years > 1 ? 's' : ''}`);
  if (d.months && parseInt(d.months) > 0) parts.push(`${d.months} month${d.months > 1 ? 's' : ''}`);
  if (d.days && parseInt(d.days) > 0) parts.push(`${d.days} day${d.days > 1 ? 's' : ''}`);
  return parts.length ? `since last ${parts.join(' & ')}` : '';
}

// Same as formatDuration but phrased as a span ("over last X") rather than
// a starting point ("since X") — used for the weight-change output
// sentence specifically, per explicit request. Left formatDuration (used
// everywhere else — medication, menstrual changes, bowel habits, etc.)
// unchanged since "since" reads correctly in those other contexts.
function formatDurationOver(d) {
  if (!d) return '';
  if (d.date) return `over the period since ${new Date(d.date).toLocaleDateString('en-IN')}`;
  const parts = [];
  if (d.years && parseInt(d.years) > 0) parts.push(`${d.years} year${d.years > 1 ? 's' : ''}`);
  if (d.months && parseInt(d.months) > 0) parts.push(`${d.months} month${d.months > 1 ? 's' : ''}`);
  if (d.days && parseInt(d.days) > 0) parts.push(`${d.days} day${d.days > 1 ? 's' : ''}`);
  return parts.length ? `over last ${parts.join(' & ')}` : '';
}

// Formats a repeatable medicine list (from HypoMedList) into one joined
// phrase for the physician output sentence, e.g. "Tab. Metformin (500 mg
// — 2 times a day), Tab. Glimepiride (1 mg — 1 time a day)".
function formatMedList(meds) {
  if (!meds || !meds.length) return '';
  return meds
    .filter(m => m.name)
    .map(m => `Tab. ${m.name}${m.dose ? ` (${m.dose} mg)` : ''}${m.freq ? ` — ${m.freq} time${m.freq > 1 ? 's' : ''} a day` : ''}`)
    .join(', ');
}

// ─── Page completeness — every question needs an answer, and a "yes"
// answer needs its follow-up detail(s) too (so the physician never gets a
// "yes" with nothing behind it — e.g. "yes, diabetic" with no type/
// duration/medication status). Checked at submit time; if anything's
// incomplete, the patient is taken straight to the first such page
// instead of the questionnaire being submitted. Pages not listed here
// (there shouldn't be any) default to "complete" rather than silently
// blocking submission on something unvalidated.
const HYPO_PAGE_VALIDATORS = {
  A3: (f) => !!f.maritalStatus,
  A4: (f) => !!f.occupation && (f.occupation !== 'other' || !!f.occupationOther),
  B1: (f) => !!f.hysterectomy && (f.hysterectomy !== 'yes' || (!!(f.hysterectomyDate?.date || f.hysterectomyDate?.years) && !!f.hysterectomyReason && (f.hysterectomyReason !== 'others' || !!f.hysterectomyOther))),
  B2: (f) => !!f.menopauseStatus && (f.menopauseStatus !== 'post' || !!f.menopauseYears),
  B3: (f) => !!f.menstrualChange && (f.menstrualChange !== 'yes' || (f.menstrualChangeTypes || []).length > 0),
  B4: (f) => !!f.lmpDate,
  B5: (f) => !!f.pregnant,
  C1: (f) => !!f.thyroidDx && (f.thyroidDx !== 'yes' || (!!f.thyroidDxType && !!f.thyroidDxYear)),
  C2a: (f) => !!f.thyroidSurgery && (f.thyroidSurgery !== 'yes' || (!!f.thyroidSurgeryType && !!f.thyroidSurgeryYear)),
  C2b: (f) => !!f.thyroidRai && (f.thyroidRai !== 'yes' || (f.raiAdministrations || []).some(e => e.doseMci && e.date)),
  C3: (f) => {
    if (!f.thyroidMed) return false;
    if (f.thyroidMed !== 'yes') return true;
    if (!f.treatmentType) return false;
    const lt4Ok = !!f.thyroidMedBrand && !!f.thyroidMedDose;
    const lt3Ok = !!f.liothyronineBrand && !!f.liothyronineDose;
    const otherOk = !!f.thyroidMedName && !!f.thyroidMedDose;
    const medOk =
      f.treatmentType === 'levo_only' ? lt4Ok :
      f.treatmentType === 'lio_only' ? lt3Ok :
      f.treatmentType === 'combination' ? (lt4Ok && lt3Ok) :
      f.treatmentType === 'other' ? otherOk : false;
    if (!medOk) return false;
    const lt4DcOk = !!f.doseChanged && (f.doseChanged !== 'yes' || !!(f.doseChangedDate && f.doseChangedReason));
    const lt3DcOk = !!f.liothyronineDoseChanged && (f.liothyronineDoseChanged !== 'yes' || !!(f.liothyronineDoseChangedDate && f.liothyronineDoseChangedReason));
    if (f.treatmentType === 'levo_only' && !lt4DcOk) return false;
    if (f.treatmentType === 'lio_only' && !lt3DcOk) return false;
    if (f.treatmentType === 'combination' && !(lt4DcOk && lt3DcOk)) return false;
    if (f.treatmentType === 'other' && !lt4DcOk) return false;
    return true;
  },
  C4: (f) => !!f.familyThyroid && (f.familyThyroid !== 'yes' || (f.familyThyroidRelatives || []).length > 0),
  C5: (f) => !!f.autoimmune && (f.autoimmune !== 'yes' || Object.values(f.autoimmuneItems || {}).some(v => v?.selected)),
  D1: (f) => !!f.tshDone && (f.tshDone !== 'yes' || !!f.tshValue),
  D2: (f) => !!f.t3Done && (f.t3Done !== 'yes' || !!f.t3Value),
  D3: (f) => !!f.ft3Done && (f.ft3Done !== 'yes' || !!f.ft3Value),
  D4: (f) => !!f.t4Done && (f.t4Done !== 'yes' || !!f.t4Value),
  D5: (f) => !!f.ft4Done && (f.ft4Done !== 'yes' || !!f.ft4Value),
  D6: (f) => !!f.antitpoDone && (f.antitpoDone !== 'yes' || !!f.antitpoValue),
  D7: (f) => !!f.antitgDone && (f.antitgDone !== 'yes' || !!f.antitgValue),
  D10: (f) => !!f.imagingDone && (f.imagingDone !== 'yes' || ((f.imagingTypes || []).length > 0 && !!f.imagingDate)),
  E1: (f) => !!f.hypoCauseKnown && (f.hypoCauseKnown !== 'yes' || !!f.hypoCause),
  E2: () => true,
  E3: (f) => !!f.goitre && (f.goitre !== 'yes' || !!f.goitreSize),
  F1: (f) => !!f.fatigue && (f.fatigue !== 'yes' || !!f.fatigueSeverity),
  F2: (f) => !!f.weightChange && (f.weightChange !== 'yes' || (!!f.weightDirection && !!f.weightKg)),
  F3: (f) => !!f.appetite,
  F4: (f) => !!f.cold && (f.cold !== 'yes' || !!f.coldImpact),
  F5: (f) => !!f.bowel && (f.bowel !== 'yes' || !!f.bowelType),
  F6: (f) => !!f.abdominal && (f.abdominal !== 'yes' || (f.abdominalTypes || []).length > 0),
  F7: (f) => !!f.skin && (f.skin !== 'yes' || (f.skinTypes || []).length > 0),
  F8a: (f) => !!f.periorbital,
  F8b: (f) => !!f.facialOedema,
  F9: (f) => !!f.pedalOedema && (f.pedalOedema !== 'yes' || !!f.pedalOedemaType),
  F10: (f) => !!f.hair && (f.hair !== 'yes' || Object.values(f.hairItems || {}).some(v => v?.selected)),
  F11: (f) => !!f.nails && (f.nails !== 'yes' || Object.values(f.nailItems || {}).some(v => v?.selected)),
  F12: (f) => !!f.hoarseness && (f.hoarseness !== 'yes' || !!f.hoarsenessPattern),
  F13: (f) => !!f.cramps,
  F14: (f) => !!f.weakness && (f.weakness !== 'yes' || !!f.weaknessLocation),
  F15a: (f) => !!f.concentration && (f.concentration !== 'yes' || !!f.concentrationImpact),
  F15b: (f) => !!f.memory && (f.memory !== 'yes' || !!f.memoryImpact),
  F16: (f) => !!f.depression && (f.depression !== 'yes' || (!!f.depressionSeenDoctor && !!f.depressionDiagnosed)),
  F17: (f) => !!f.hypersomnia,
  F18: (f) => !!f.bradycardia,
  F19: (f) => !!f.giddiness && (f.giddiness !== 'yes' || !!f.giddinessFreq),
  F20: (f) => !!f.blackout && (f.blackout !== 'yes' || (!!f.blackoutCount && !!f.blackoutLastDate && !!f.blackoutAssessed)),
  F21: (f) => !!f.hearing && (f.hearing !== 'yes' || (f.hearingTypes || []).length > 0),
  F22: (f) => !!f.reflexes,
  F23: (f) => ['pain', 'numbness', 'tingling'].every(t => {
    const item = (f.carpalItems || {})[t];
    return !!item?.status && (item.status !== 'yes' || !!item.side);
  }),
  F24: (f) => !!f.macroglossia && (f.macroglossia !== 'yes' || !!(f.macroglossiaDuration?.date || f.macroglossiaDuration?.years || f.macroglossiaDuration?.months)),
  F25: (f) => !!f.acidity && (f.acidity !== 'yes' || !!f.acidityOnMed),
  H1: (f) => !!f.dyslipidaemia && (f.dyslipidaemia !== 'yes' || !!f.dyslipidaemiaOnMed),
  H6: (f) => !!f.htn && (f.htn !== 'yes' || !!f.htnOnMed),
  H2: (f) => !!f.anaemia && (f.anaemia !== 'yes' || ((f.anaemiaTypes || []).length > 0 && !!f.anaemiaOnMed)),
  H3: (f) => !!f.diabetes && (f.diabetes !== 'yes' || (!!f.diabetesType && !!f.diabetesOnMed)),
  H4: (f) => !!f.pcosPmos && (f.pcosPmos !== 'yes' || !!f.pcosOnMed),
  H5: (f) => !!f.infertility,
  H7: (f) => !!f.osteoporosis && (f.osteoporosis !== 'yes' || (!!f.osteoporosisDEXA && !!f.osteoporosisOnMed)),
  H8: (f) => !!f.familyCancer && (f.familyCancer !== 'yes' || (f.familyCancerTypes || []).length > 0),
  H9: () => true, // explicitly optional free-text notes
};

// ─── EDD calculator: LMP + 9 months + 7 days ─────────────
function calcEDD(lmpDateStr) {
  if (!lmpDateStr) return null;
  const lmp = new Date(lmpDateStr);
  lmp.setMonth(lmp.getMonth() + 9);
  lmp.setDate(lmp.getDate() + 7);
  return lmp.toLocaleDateString('en-IN');
}

// ─── Main component ───────────────────────────────────────
export const HypoQuestionnaire = ({ patientId, episodeId, patientGender, patientDob, onComplete, onBack }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const pageContentRef = React.useRef(null);
  const [savedPageId, setSavedPageId] = useState(null); // page id restored from a previous session
  const [resumedFrom, setResumedFrom] = useState(false); // jumped to it yet?
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // ── Form state ────────────────────────────────────────
  const [f, setF] = useState({
    // A — Demographics
    dob: '', ageYears: '', ageMonths: '', sex: '', maritalStatus: '', occupation: '', occupationOther: '',

    // B — Menstrual
    hysterectomy: '', hysterectomyDate: {}, hysterectomyReason: '', hysterectomyOther: '',
    menopauseStatus: '', menopauseYears: '',
    menstrualChange: '', menstrualChangeTypes: [], menstrualChangeDuration: {},
    lmpDate: '', lmpApproxWeeks: '', lmpUnknown: false,
    pregnant: '', pregnancyWeeks: '',

    // C — Thyroid history
    thyroidDx: '', thyroidDxType: '', thyroidDxYear: '',
    thyroidSurgery: '', thyroidSurgeryType: '', thyroidSurgeryYear: '',
    thyroidRai: '', thyroidRaiYear: '', raiAdministrations: [],
    thyroidMed: '', thyroidMedName: '', thyroidMedBrand: '', thyroidMedDose: '',
    thyroidMedTiming: '', thyroidMedCompliance: '', thyroidMedSince: {},
    thyroidMedDoseChangedDate: '', thyroidMedDoseChangedReason: '',
    familyThyroid: '', familyThyroidRelatives: [], familyThyroidConditions: {},
    autoimmune: '', autoimmuneItems: {},

    // D — Labs
    tshDone: '', tshValue: '', tshDate: '', tshRefLow: '', tshRefHigh: '', tshReports: [],
    t3Done: '', t3Value: '', t3Unit: '', t3Date: '', t3RefLow: '', t3RefHigh: '', t3Reports: [],
    ft3Done: '', ft3Value: '', ft3Unit: '', ft3Date: '', ft3RefLow: '', ft3RefHigh: '', ft3Reports: [],
    t4Done: '', t4Value: '', t4Unit: '', t4Date: '', t4RefLow: '', t4RefHigh: '', t4Reports: [],
    ft4Done: '', ft4Value: '', ft4Unit: '', ft4Date: '', ft4RefLow: '', ft4RefHigh: '', ft4Reports: [],
    antitpoDone: '', antitpoValue: '', antitpoUnit: '', antitpoDate: '', antitpoRefLow: '', antitpoRefHigh: '', antitpoReports: [],
    antitgDone: '', antitgValue: '', antitgUnit: '', antitgDate: '', antitgRefLow: '', antitgRefHigh: '', antitgReports: [],
    imagingDone: '', imagingTypes: [], imagingDate: '', imagingFinding: '', imagingReport: null,
    cbcDone: '', cbcDate: '', cbcValues: {}, cbcReports: [],
    investigationsSelected: {},
    vitB12Done: '', vitB12Value: '', vitB12Unit: '', vitB12Date: '', vitB12RefLow: '', vitB12RefHigh: '', vitB12Reports: [],
    vitD3Done: '', vitD3Value: '', vitD3Unit: '', vitD3Date: '', vitD3RefLow: '', vitD3RefHigh: '', vitD3Reports: [],
    srIronDone: '', srIronValue: '', srIronUnit: '', srIronDate: '', srIronRefLow: '', srIronRefHigh: '', srIronReports: [],
    srFerritinDone: '', srFerritinValue: '', srFerritinUnit: '', srFerritinDate: '', srFerritinRefLow: '', srFerritinRefHigh: '', srFerritinReports: [],
    tibcDone: '', tibcValue: '', tibcUnit: '', tibcDate: '', tibcRefLow: '', tibcRefHigh: '', tibcReports: [],
    transferrinSatDone: '', transferrinSatValue: '', transferrinSatUnit: '', transferrinSatDate: '', transferrinSatRefLow: '', transferrinSatRefHigh: '', transferrinSatReports: [],

    // E — Hypo specific
    hypoCauseKnown: '', hypoCause: '', hypoDuration: {},
    hashimotosAntiTpo: '', hashimotosAntiTg: '', hashimotosAntiTpoValue: '', hashimotosAntiTgValue: '',
    goitre: '', goitreSize: '',

    // F — Symptoms
    fatigue: '', fatigueDuration: {}, fatigueSeverity: '',
    weightChange: '', weightDirection: '', weightKg: '', weightDuration: {},
    appetite: '',
    cold: '', coldDuration: {}, coldImpact: '',
    bowel: '', bowelType: '', bowelDuration: {},
    abdominal: '', abdominalTypes: [], abdominalDuration: {},
    skin: '', skinTypes: [], skinDuration: {},
    periorbital: '', periorbitalDuration: {},
    facialOedema: '', facialOedemaDuration: {},
    pedalOedema: '', pedalOedemaType: '', pedalOedemaDuration: {},
    hair: '', hairItems: {},   // { type: { selected, duration } }
    nails: '', nailItems: {},
    hoarseness: '', hoarsenessDuration: {}, hoarsenessPattern: '',
    cramps: '', crampsDuration: {},
    weakness: '', weaknessLocation: '', weaknessDuration: {},
    concentration: '', concentrationDuration: {}, concentrationImpact: '',
    memory: '', memoryDuration: {}, memoryImpact: '',
    depression: '', depressionDuration: {}, depressionSeenDoctor: '', depressionDiagnosed: '',
    hypersomnia: '', hypersomniaDuration: {},
    bradycardia: '', bradycardiaPulse: '', bradycardiaDuration: {},
    giddiness: '', giddinessFreq: '', giddinessDuration: {},
    blackout: '', blackoutCount: '', blackoutLastDate: '', blackoutAssessed: '', blackoutDx: '',
    hearing: '', hearingTypes: [], hearingReducedDuration: {}, hearingTinnitusDuration: {},
    reflexes: '', reflexesDuration: {},
    carpalItems: {},  // { pain: { present, side, duration }, numbness: {...}, tingling: {...} }
    macroglossia: '', macroglossiaDuration: {},
    acidity: '', acidityDuration: {}, acidityOnMed: '', acidityMedName: '', acidityMedDose: '', acidityMedFreq: '', acidityMedSince: {},

    // G — Treatment
    onTreatment: '', treatmentType: '',
    liothyronineBrand: '', liothyronineName: '', liothyronineDose: '',
    liothyronineTiming: '', liothyronineCompliance: '', liothyronineSince: {},
    liothyronineDoseChanged: '', liothyronineDoseChangedDate: '', liothyronineDoseChangedReason: '',
    doseChanged: '', doseChangedDate: '', doseChangedReason: '',

    // H — Comorbidities
    dyslipidaemia: '', dyslipidaemiaDuration: {}, dyslipidaemiaOnMed: '', dyslipidaemiaMeds: [],
    anaemia: '', anaemiaTypes: [], anaemiaDuration: {}, anaemiaOnMed: '', anaemiaMeds: [],
    diabetes: '', diabetesType: '', diabetesDuration: {}, diabetesOnMed: '', diabetesMeds: [],
    htn: '', htnDuration: {}, htnOnMed: '', htnMeds: [],
    pcosPmos: '', pcosPmosLabel: '', pcosDuration: {}, pcosOnMed: '',
    pcosMeds: [],
    infertility: '',
    osteoporosis: '', osteoporosisDEXA: '', osteoporosisDuration: {}, osteoporosisOnMed: '', osteoporosisMedName: '', osteoporosisMedDose: '', osteoporosisMedTimes: '', osteoporosisMedSince: {},
    depressionOnMed: '', depressionMedName: '', depressionMedDose: '', depressionMedFreq: '', depressionMedSince: {},
    familyCancer: '', familyCancerTypes: [], familyCancerRelative: '',
    additionalNotes: '',
  });

  const set = key => val => setF(p => ({ ...p, [key]: val }));

  const [draftLoadError, setDraftLoadError] = useState('');
  const loadDraft = React.useCallback(() => {
    if (!(patientId && episodeId)) return;
    setDraftLoadError('');
    // NOTE: backend returns the row flat (res.json(result.rows[0] ||
    // null)), not wrapped in { data }. Reading res.data here meant
    // this always evaluated to undefined — previously-saved answers
    // were never actually restored on reload, "resume" was silently a
    // no-op. Fixed to read the response directly.
    conditionAPI.getHypoQ(patientId, episodeId)
      .then(res => {
        if (res && Object.keys(res).length) {
          setF(p => ({ ...p, ...mapDbToForm(res) }));
          if (res.current_page) setSavedPageId(res.current_page);
        }
      })
      .catch(() => {
        // Genuinely silent here would risk the patient thinking their
        // previously-saved answers were lost and re-entering everything
        // from scratch — surface it plainly instead, with a retry.
        setDraftLoadError('Could not load your saved answers. Your previous answers have NOT been lost — please retry before continuing, rather than re-entering everything.');
      });
  }, [patientId, episodeId]);

  // ── Pre-fill from patient profile ─────────────────────
  useEffect(() => {
    if (patientGender) setF(p => ({ ...p, sex: patientGender }));
    if (patientDob) setF(p => ({ ...p, dob: patientDob }));
    loadDraft();
  }, [patientId, episodeId, patientGender, patientDob, loadDraft]);

  // ── Rehydrate uploaded reports on every load — resume AND post-submit ──
  // Uploaded files are never deleted (see patientController.uploadDocument
  // — nothing sets is_deleted); the gap was purely that the "already
  // uploaded ✓" display lived only in this component's in-memory state,
  // which resets on reload. Fixed here by treating the `documents` table
  // (tagged with episodeId + fieldLabel — migration 022) as the single
  // source of truth and re-reading it every time this questionnaire opens,
  // whether that's mid-draft, after resuming, or long after the patient
  // already submitted. This runs independently of the draft-load effect
  // above and only ever adds report-list keys, so the two can't clobber
  // each other.
  //
  // NOTE: patientAPI.getDocuments({ episodeId }) — verify this exact call
  // shape against src/api/index.js once available; written to match the
  // { documents: [...] } shape patientController.getDocuments returns.
  useEffect(() => {
    if (!episodeId) return;
    const LABEL_TO_KEY = {
      'TSH': 'tshReports',
      'T3 (total)': 't3Reports',
      'Free T3 (FT3)': 'ft3Reports',
      'T4 (total)': 't4Reports',
      'Free T4 (FT4)': 'ft4Reports',
      'Anti-TPO': 'antitpoReports',
      'Anti-Tg': 'antitgReports',
    };
    patientAPI.getDocuments({ episodeId })
      .then(res => {
        const docs = res?.documents || [];
        if (!docs.length) return;

        const grouped = {}; // reportKey -> [{ documentId, fileName }]
        let latestImaging = null;

        for (const d of docs) {
          const entry = { documentId: d.id, fileName: d.originalName };
          if (d.fieldLabel === 'Thyroid imaging') {
            // singular field — keep only the most recent (docs are
            // ordered created_at DESC from the backend)
            if (!latestImaging) latestImaging = entry;
            continue;
          }
          const key = LABEL_TO_KEY[d.fieldLabel];
          if (!key) continue; // "Additional document" from the H9 catch-all, or untagged — not shown inline
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(entry);
        }

        setF(p => ({
          ...p,
          ...grouped,
          ...(latestImaging ? { imagingReport: latestImaging } : {}),
        }));
      })
      .catch(() => {}); // non-fatal — worst case, the upload boxes just start empty again
  }, [episodeId]);

  // ── Reproductive gate helpers ─────────────────────────
  const isMale = f.sex === 'male';
  const isMarriedStatus = f.maritalStatus === 'married';
  const hadHysterectomy = f.hysterectomy === 'yes';
  const isPostMeno = f.menopauseStatus === 'post';
  const lmpDaysAgo = f.lmpDate
    ? Math.floor((new Date() - new Date(f.lmpDate)) / (1000 * 60 * 60 * 24)) : 0;
  const showPregnancy = !isMale && !hadHysterectomy && !isPostMeno && isMarriedStatus && lmpDaysAgo >= 31;
  const showInfertility = !isMale && !hadHysterectomy && !isPostMeno && f.maritalStatus === 'married';

  // Note: symptom-triggered investigations (CBC/Vit B12/Vit D3/Sr Calcium/
  // Iron studies/Blood sugar) are now embedded directly inline within
  // each triggering symptom screen (F1/F13/F14/F19/F20/F23) rather than
  // shown as a separate suggestion banner pointing at a later D-module
  // screen — see HypoInlineLab/HypoCbcPanel usage in those case blocks.

  // ── All pages definition ──────────────────────────────
  const allPages = [
    // ── MODULE A ──
    { id: 'A3', module: 'A', title: 'Marital status' },
    { id: 'A4', module: 'A', title: 'Occupation' },

    // ── MODULE B (female only) ──
    ...(isMale ? [] : [
      { id: 'B1', module: 'B', title: 'Hysterectomy' },
      ...(!hadHysterectomy ? [{ id: 'B2', module: 'B', title: 'Menopausal status' }] : []),
      ...(!hadHysterectomy && !isPostMeno ? [{ id: 'B3', module: 'B', title: 'Menstrual cycle changes' }] : []),
      ...(!hadHysterectomy && !isPostMeno ? [{ id: 'B4', module: 'B', title: 'Last menstrual period (LMP)' }] : []),
      ...(showPregnancy ? [{ id: 'B5', module: 'B', title: 'Pregnancy' }] : []),
    ]),

    // ── MODULE C ──
    { id: 'C1', module: 'C', title: 'Previous thyroid diagnosis' },
    { id: 'C2a', module: 'C', title: 'Thyroid surgery' },
    { id: 'C2b', module: 'C', title: 'Radioiodine (RAI) therapy' },
    { id: 'C3', module: 'C', title: 'Current thyroid medication' },
    { id: 'C4', module: 'C', title: 'Family history of thyroid disease' },
    { id: 'C5', module: 'C', title: 'Autoimmune conditions' },

    // ── MODULE D ──
    { id: 'D1',  module: 'D', title: 'TSH test' },
    { id: 'D2',  module: 'D', title: 'T3 (total) test' },
    { id: 'D3',  module: 'D', title: 'Free T3 test' },
    { id: 'D4',  module: 'D', title: 'T4 (total) test' },
    { id: 'D5',  module: 'D', title: 'Free T4 test' },
    { id: 'D6',  module: 'D', title: 'Anti-TPO antibody' },
    { id: 'D7',  module: 'D', title: 'Anti-Tg antibody' },
    { id: 'D10', module: 'D', title: 'Thyroid imaging' },

    // ── MODULE E ──
    // E1 (cause of hypothyroidism) is skipped only when the cause is
    // already evident from an earlier, hypothyroidism-specific answer: a
    // prior diagnosis of hypothyroidism itself (not a nodule/cancer/other
    // diagnosis, which says nothing about this hypothyroidism's cause),
    // RAI therapy, or a total thyroidectomy. E3 (goitre) is skipped after
    // a total thyroidectomy since the whole gland has already been removed.
    ...(!((f.thyroidDx === 'yes' && f.thyroidDxType === 'hypothyroidism') || f.thyroidRai === 'yes' || f.thyroidSurgeryType === 'total')
      ? [{ id: 'E1', module: 'E', title: 'Cause of hypothyroidism' }] : []),
    ...(f.hypoCause === 'hashimotos' ? [{ id: 'E2', module: 'E', title: "Hashimoto's thyroiditis" }] : []),
    ...(f.thyroidSurgeryType !== 'total' ? [{ id: 'E3', module: 'E', title: 'Goitre' }] : []),

    // ── MODULE F ──
    { id: 'F1', module: 'F', title: 'Fatigue' },
    { id: 'F2', module: 'F', title: 'Weight change' },
    { id: 'F3', module: 'F', title: 'Appetite' },
    { id: 'F4', module: 'F', title: 'Cold intolerance' },
    { id: 'F5', module: 'F', title: 'Bowel habits' },
    { id: 'F6', module: 'F', title: 'Abdominal symptoms' },
    { id: 'F7', module: 'F', title: 'Skin changes' },
    { id: 'F8a', module: 'F', title: 'Periorbital puffiness' },
    { id: 'F8b', module: 'F', title: 'Facial puffiness' },
    { id: 'F9', module: 'F', title: 'Pedal oedema' },
    { id: 'F10', module: 'F', title: 'Hair changes' },
    { id: 'F11', module: 'F', title: 'Nail changes' },
    { id: 'F12', module: 'F', title: 'Hoarseness' },
    { id: 'F13', module: 'F', title: 'Muscle cramps' },
    { id: 'F14', module: 'F', title: 'Muscle weakness' },
    { id: 'F15a', module: 'F', title: 'Difficulty concentrating' },
    { id: 'F15b', module: 'F', title: 'Memory problems' },
    { id: 'F16', module: 'F', title: 'Low mood / depression' },
    { id: 'F17', module: 'F', title: 'Excessive sleepiness' },
    { id: 'F18', module: 'F', title: 'Slow heart rate' },
    { id: 'F19', module: 'F', title: 'Positional giddiness' },
    { id: 'F20', module: 'F', title: 'Blackout episodes' },
    { id: 'F21', module: 'F', title: 'Hearing difficulties' },
    { id: 'F22', module: 'F', title: 'Delayed reflexes' },
    { id: 'F23', module: 'F', title: 'Carpal tunnel symptoms' },
    { id: 'F24', module: 'F', title: 'Tongue enlargement (macroglossia)' },
    { id: 'F25', module: 'F', title: 'Acidity / retrosternal chest burn' },

    // ── MODULE G (no standalone pages — dose-change now lives in C3) ──

    // ── MODULE H (unified) ──
    { id: 'H1', module: 'H', title: 'Dyslipidaemia / high cholesterol' },
    { id: 'H2', module: 'H', title: 'Anaemia' },
    { id: 'H3', module: 'H', title: 'Diabetes / high blood sugar' },
    { id: 'H6', module: 'H', title: 'Hypertension / high blood pressure' },
    ...(!isMale ? [{ id: 'H4', module: 'H', title: 'PCOS / PMOS' }] : []),
    ...(showInfertility ? [{ id: 'H5', module: 'H', title: 'Difficulty conceiving' }] : []),
    { id: 'H7', module: 'H', title: 'Osteoporosis / osteopenia' },
    { id: 'H8', module: 'H', title: 'Family history — non-thyroid cancers' },
    { id: 'H9', module: 'H', title: 'Additional notes' },
  ];

  const totalPages = allPages.length;
  const page = allPages[currentPage];
  const progress = Math.round(((currentPage + 1) / totalPages) * 100);

  // Resume exactly where the patient left off, once, after the saved
  // draft (including branching-relevant answers like sex/marital status)
  // has loaded and allPages has been recomputed with the right pages in
  // it. Without this, the patient would land back on page 1 every time
  // even though their answers are all pre-filled.
  useEffect(() => {
    if (!resumedFrom && savedPageId) {
      const idx = allPages.findIndex(p => p.id === savedPageId);
      if (idx > 0) setCurrentPage(idx);
      setResumedFrom(true);
    }
  }, [savedPageId, resumedFrom, allPages]);

  // E1 ("do you know the cause") is skipped when the cause is already
  // evident from earlier answers — but the cause is still clinically
  // relevant to the physician's summary, so derive it here instead of
  // just losing it.
  useEffect(() => {
    if (f.thyroidSurgeryType === 'total') {
      setF(p => ({ ...p, hypoCauseKnown: 'yes', hypoCause: 'post_surgical' }));
    } else if (f.thyroidRai === 'yes') {
      setF(p => ({ ...p, hypoCauseKnown: 'yes', hypoCause: 'post_rai' }));
    } else if (f.thyroidDx === 'yes' && f.thyroidDxType === 'hypothyroidism') {
      setF(p => ({ ...p, hypoCauseKnown: 'yes' }));
    }
  }, [f.thyroidSurgeryType, f.thyroidRai, f.thyroidDx, f.thyroidDxType]);

  // Blocks proceeding past a screen whose year-of-event field (diagnosis/
  // surgery/RAI year) is before the patient's own birth year. dob is
  // guaranteed present from registration (patientDob prop) now that A1 is
  // gone — no more "did the patient fill this in" check needed here,
  // matching TC/Nodule's equivalent logic.
  const dobYear = patientDob ? new Date(patientDob).getFullYear() : (f.dob ? new Date(f.dob).getFullYear() : null);
  const yearFieldByPage = { C1: 'thyroidDxYear', C2a: 'thyroidSurgeryYear' };
  const currentYearField = yearFieldByPage[page?.id];
  const yearInvalid = dobYear && currentYearField && f[currentYearField] && parseInt(f[currentYearField]) < dobYear;

  // Set once handleSubmit finds an incomplete page — while true, "Next"
  // stops advancing one page at a time and instead jumps straight to the
  // next INCOMPLETE page, skipping every already-answered page in
  // between. Without this, a patient sent back to fix question 5 of 40
  // would have to click Next through pages 6-40 one at a time just to
  // reach Submit again — this makes it a direct chain: incomplete ->
  // incomplete -> incomplete -> Submit, exactly as asked for.
  const [reviewMode, setReviewMode] = useState(false);

  // Single source of truth for "what's still incomplete" — recomputed
  // live from f on every render (not just at the moment Submit was
  // clicked), so it self-updates the instant a page is fixed and also
  // self-corrects if editing one answer changes what's required
  // elsewhere. Both goNext's jump logic and the bottom strip (item 3)
  // read from this same list, so they can never disagree with each other.
  const incompleteList = reviewMode
    ? allPages
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => { const v = HYPO_PAGE_VALIDATORS[p.id]; return v ? !v(f) : false; })
    : [];

  const goNext = () => {
    if (yearInvalid) return;
    if (reviewMode) {
      // Don't skip ahead if the page they're leaving is itself still
      // incomplete — without this check, clicking Next before actually
      // finishing the flagged page would silently jump to a DIFFERENT
      // incomplete page instead of holding them here.
      const leavingValidator = HYPO_PAGE_VALIDATORS[page?.id];
      if (leavingValidator && !leavingValidator(f)) {
        setError('Please answer this question before continuing.');
        return;
      }
      setError('');
      // Prefer the next incomplete page ahead of current; if none ahead,
      // wrap around to the earliest incomplete page overall (covers the
      // case where an earlier page became incomplete again, e.g. the
      // patient navigated back and changed something).
      const ahead = incompleteList.find(({ idx }) => idx > currentPage);
      const target = ahead || incompleteList[0];
      if (target) { setCurrentPage(target.idx); return; }
      handleSubmit();
      return;
    }
    if (currentPage < totalPages - 1) setCurrentPage(p => p + 1);
    else handleSubmit();
  };
  const goPrev = () => {
    if (currentPage > 0) setCurrentPage(p => p - 1);
    else onBack?.();
  };

  // ── Save & submit ─────────────────────────────────────
  const handleSubmit = async () => {
    // Every question needs an answer; a "yes" needs its follow-up
    // detail(s) too. Find the first page (in display order, so it
    // respects branching — allPages already excludes skipped questions)
    // that isn't complete, and take the patient straight there instead
    // of submitting.
    const incompleteIdx = allPages.findIndex(p => {
      const validator = HYPO_PAGE_VALIDATORS[p.id];
      return validator ? !validator(f) : false;
    });
    if (incompleteIdx !== -1) {
      setReviewMode(true);
      setCurrentPage(incompleteIdx);
      setError('Please answer this question before submitting — some questions were left incomplete.');
      return;
    }
    setReviewMode(false);
    setSaving(true); setError('');
    try {
      await conditionAPI.saveHypoQ(patientId, episodeId, { ...mapFormToDb(f), _draft: false });
      onComplete();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Autosave ───────────────────────────────────────────
  // Replaces the old manual "Save draft" button — saves automatically
  // ~1.5s after the patient stops typing/selecting, and again whenever
  // they move to a new screen, so a network outage or a voluntary pause
  // (e.g. waiting on a lab report) never loses answers already given.
  // _draft:true keeps questionnaire_status from being marked "completed"
  // by these interim saves (see conditionController.js).
  const skipFirstAutosave = React.useRef(true);
  useEffect(() => {
    if (skipFirstAutosave.current) { skipFirstAutosave.current = false; return; }
    if (!patientId || !episodeId) return;
    const t = setTimeout(async () => {
      try {
        await conditionAPI.saveHypoQ(patientId, episodeId, {
          ...mapFormToDb(f), _draft: true, _currentPage: page?.id,
        });
        setLastSavedAt(Date.now());
      } catch (e) { /* silent — will retry on next change */ }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, currentPage]);

  // ── Module colour map ─────────────────────────────────
  const MOD_COLORS = {
    A: { bg: '#E1F5EE', text: '#085041', border: '#9FE1CB' },
    B: { bg: '#E6F1FB', text: '#0C447C', border: '#B5D4F4' },
    C: { bg: '#FAEEDA', text: '#633806', border: '#FAC775' },
    D: { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC' },
    E: { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC' },
    F: { bg: '#FCEBEB', text: '#791F1F', border: '#F7C1C1' },
    G: { bg: '#EAF3DE', text: '#27500A', border: '#C0DD97' },
    H: { bg: '#F1EFE8', text: '#444441', border: '#D3D1C7' },
  };
  const mc = MOD_COLORS[page?.module] || MOD_COLORS.A;

  // ── Render each page ──────────────────────────────────
  const renderPage = () => {
    if (!page) return null;
    switch (page.id) {

      // ── A3: Marital status ──
      case 'A3': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>What is your marital status?</div>
          <HypoRadioGroup value={f.maritalStatus} onChange={set('maritalStatus')} options={[
            ['married', 'Married'], ['unmarried', 'Unmarried'],
            ['divorced', 'Divorced'], ['widowed', 'Widowed'],
          ]} />
          {f.maritalStatus && <HypoOutputBox text={f.maritalStatus.charAt(0).toUpperCase() + f.maritalStatus.slice(1)} />}
        </>
      );

      // ── A4: Occupation ──
      case 'A4': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>What is your occupation or profession?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              ['teacher', 'Teacher'], ['singer', 'Singer'], ['actor', 'Actor'],
              ['vocal_instructor', 'Vocal instructor'], ['call_centre', 'Call centre agent'],
              ['sales', 'Sales professional'], ['other', 'Other'],
            ].map(([val, label]) => (
              <div key={val} onClick={() => set('occupation')(val)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                border: `1.5px solid ${f.occupation === val ? 'var(--teal-400)' : 'var(--border)'}`,
                background: f.occupation === val ? 'var(--teal-50)' : 'var(--surface)',
                color: f.occupation === val ? 'var(--teal-700)' : 'var(--text-primary)',
                fontSize: 13, minHeight: 40, boxSizing: 'border-box',
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                  border: `1.5px solid ${f.occupation === val ? 'var(--teal-500)' : 'var(--border-md)'}`,
                  background: f.occupation === val ? 'var(--teal-500)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {f.occupation === val && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                </div>
                {label}
              </div>
            ))}
          </div>
          {f.occupation === 'other' && (
            <HypoField label="Please specify"><HypoTextInput value={f.occupationOther} onChange={set('occupationOther')} placeholder="Your occupation" /></HypoField>
          )}
          <HypoOutputBox text={f.occupation ? `Occupation: ${f.occupation === 'other' ? f.occupationOther : f.occupation.replace(/_/g,' ')}` : ''} />
        </>
      );

      // ── B1: Hysterectomy ──
      case 'B1': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you had a hysterectomy (surgical removal of the uterus)?</div>
          <HypoRadioGroup value={f.hysterectomy} onChange={set('hysterectomy')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.hysterectomy === 'yes' && (
            <HypoSubBlock>
              <HypoField label="When was the surgery done?">
                <HypoDurationPicker minDate={f.dob} value={f.hysterectomyDate} onChange={set('hysterectomyDate')} label="" />
              </HypoField>
              <HypoField label="Reason for hysterectomy">
                <HypoRadioGroup value={f.hysterectomyReason} onChange={set('hysterectomyReason')} options={[
                  ['excessive_bleeding', 'Excessive bleeding'],
                  ['prolapse', 'Prolapse of uterus'],
                  ['cancer', 'Cancer of uterus / cervix'],
                  ['others', 'Others'],
                ]} />
                {f.hysterectomyReason === 'others' && (
                  <HypoField label="Please specify">
                    <HypoTextInput value={f.hysterectomyOther} onChange={set('hysterectomyOther')} placeholder="Specify reason..." />
                  </HypoField>
                )}
              </HypoField>
              {f.hysterectomyReason && (
                <HypoOutputBox text={`H/o Hysterectomy for "${
                  f.hysterectomyReason === 'excessive_bleeding' ? 'Excessive bleeding' :
                  f.hysterectomyReason === 'prolapse' ? 'Prolapse of uterus' :
                  f.hysterectomyReason === 'cancer' ? 'Cancer of uterus/cervix' :
                  f.hysterectomyOther || 'Others'}" ${formatDuration(f.hysterectomyDate)}`} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      // ── B2: Menopausal status ──
      case 'B2': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>What is your menopausal status?</div>
          <HypoRadioGroup value={f.menopauseStatus} onChange={set('menopauseStatus')} options={[
            ['pre', 'Pre-menopausal (in menstruating age)'],
            ['peri', 'Peri-menopausal'],
            ['post', 'Post-menopausal (menstruation stopped)'],
          ]} />
          {f.menopauseStatus === 'post' && (
            <HypoSubBlock>
              <HypoField label="How many years ago did menopause occur?">
                <HypoTextInput type="number" min="0" value={f.menopauseYears} onChange={set('menopauseYears')} style={{ width: 100 }} placeholder="Years" />
              </HypoField>
              {f.menopauseYears && <HypoOutputBox text={`Post-menopausal status since last ${f.menopauseYears} year${f.menopauseYears > 1 ? 's' : ''}`} />}
            </HypoSubBlock>
          )}
        </>
      );

      // ── B3: Menstrual changes ──
      case 'B3': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you noticed any changes in your menstrual cycle?</div>
          <HypoRadioGroup value={f.menstrualChange} onChange={set('menstrualChange')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.menstrualChange === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Cycle regularity (select one)">
                <HypoRadioGroup value={f.menstrualChangeTypes.find(t => ['regular', 'irregular'].includes(t)) || ''}
                  onChange={v => {
                    const others = (f.menstrualChangeTypes || []).filter(t => !['regular', 'irregular'].includes(t));
                    set('menstrualChangeTypes')([...others, v]);
                  }}
                  options={[['regular', 'Regular'], ['irregular', 'Irregular'], ['skips_sometimes', 'Skips sometimes']]} horizontal />
              </HypoField>
              <HypoField label="Flow characteristics (select all that apply)">
                <HypoMultiSelect value={(f.menstrualChangeTypes || []).filter(t => ['heavy', 'scanty', 'absent', 'prolonged'].includes(t))}
                  onChange={vals => {
                    const reg = (f.menstrualChangeTypes || []).filter(t => ['regular', 'irregular'].includes(t));
                    set('menstrualChangeTypes')([...reg, ...vals]);
                  }}
                  options={[['heavy', 'Heavy'], ['scanty', 'Scanty'], ['absent', 'Absent'], ['prolonged', 'Prolonged']]} />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.menstrualChangeDuration} onChange={set('menstrualChangeDuration')} label="Duration of this change" />
              {f.menstrualChangeTypes?.length > 0 && (
                <HypoOutputBox text={`${f.menstrualChangeTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')} flow ${formatDuration(f.menstrualChangeDuration)}`} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      // ── B4: LMP ──
      case 'B4': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>What was the date of your last menstrual period (LMP)?</div>
          <HypoField label="LMP date">
            <HypoLmpField
              lmpDate={f.lmpDate} lmpApproxWeeks={f.lmpApproxWeeks} lmpUnknown={f.lmpUnknown}
              onChange={({ lmpDate, lmpApproxWeeks, lmpUnknown }) => setF(p => ({ ...p, lmpDate, lmpApproxWeeks, lmpUnknown }))}
            />
          </HypoField>
          {f.lmpDate && <HypoOutputBox text={`LMP: ${new Date(f.lmpDate).toLocaleDateString('en-IN')}${f.lmpUnknown ? ' (approximate)' : ''}`} />}
        </>
      );

      // ── B5: Pregnancy ──
      case 'B5': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Are you currently pregnant or trying to conceive?</div>
          <div style={{ marginTop: 12 }}>
            <HypoRadioGroup value={f.pregnant} onChange={set('pregnant')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          </div>
          {f.pregnant === 'yes' && (
            <HypoSubBlock>
              <HypoInfoNote text={`EDD (LMP + 9 months & 7 days): ${calcEDD(f.lmpDate)}`} />
              <HypoOutputBox text={`EDD: ${calcEDD(f.lmpDate)}`} />
            </HypoSubBlock>
          )}
        </>
      );

      // ── C1: Previous thyroid diagnosis ──
      case 'C1': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you been previously diagnosed with a thyroid condition?</div>
          <HypoRadioGroup value={f.thyroidDx} onChange={set('thyroidDx')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.thyroidDx === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Condition (select one)">
                <HypoRadioGroup value={f.thyroidDxType} onChange={set('thyroidDxType')} options={[
                  ['hypothyroidism', 'Hypothyroidism'],
                  ['hyperthyroidism', 'Hyperthyroidism'],
                  ['goitre', 'Goitre'],
                  ['nodule', 'Thyroid nodule'],
                  ['cancer', 'Thyroid cancer'],
                  ['other', 'Other'],
                ]} />
              </HypoField>
              <HypoField label="Year of diagnosis">
                <HypoYearInput value={f.thyroidDxYear} onChange={set('thyroidDxYear')} dob={f.dob} />
              </HypoField>
            </HypoSubBlock>
          )}
        </>
      );

      // ── C2a: Surgery ──
      case 'C2a': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you had any thyroid surgery in the past?</div>
          <HypoRadioGroup value={f.thyroidSurgery} onChange={set('thyroidSurgery')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.thyroidSurgery === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type of surgery">
                <HypoRadioGroup value={f.thyroidSurgeryType} onChange={set('thyroidSurgeryType')} options={[
                  ['total', 'Total thyroidectomy'],
                  ['hemi', 'Hemithyroidectomy'],
                  ['other', 'Other'],
                ]} />
              </HypoField>
              <HypoField label="Year of surgery">
                <HypoYearInput value={f.thyroidSurgeryYear} onChange={set('thyroidSurgeryYear')} dob={f.dob} />
              </HypoField>
            </HypoSubBlock>
          )}
        </>
      );

      // ── C2b: RAI (repeatable — patient may have received it more than once) ──
      case 'C2b': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you received radioiodine (RAI) therapy in the past?</div>
          <HypoRadioGroup value={f.thyroidRai} onChange={set('thyroidRai')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.thyroidRai === 'yes' && (
            <HypoSubBlock>
              {(f.raiAdministrations || []).map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
                  <HypoField label={`Dose ${i + 1} (mCi)`}>
                    <HypoTextInput type="number" min="0" step="0.1" value={entry.doseMci}
                      onChange={val => set('raiAdministrations')((f.raiAdministrations || []).map((e, j) => j === i ? { ...e, doseMci: val } : e))} />
                  </HypoField>
                  <HypoField label="Date">
                    <HypoDateInput value={entry.date}
                      onChange={val => set('raiAdministrations')((f.raiAdministrations || []).map((e, j) => j === i ? { ...e, date: val } : e))} />
                  </HypoField>
                  <button type="button" onClick={() => set('raiAdministrations')((f.raiAdministrations || []).filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: 'var(--red-500)', cursor: 'pointer', fontSize: 13, paddingBottom: 8 }}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button"
                onClick={() => set('raiAdministrations')([...(f.raiAdministrations || []), { doseMci: '', date: '' }])}
                style={{ fontSize: 13, color: 'var(--teal-600)', background: 'none', border: '1px dashed var(--teal-300)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', marginTop: 4 }}>
                + Add {(f.raiAdministrations || []).length ? 'another' : ''} RAI dose
              </button>
              {(f.raiAdministrations || []).some(e => e.doseMci && e.date) && (
                <HypoOutputBox text={`H/o RAI therapy — ${(f.raiAdministrations || []).filter(e => e.doseMci && e.date).map(e => `${e.doseMci} mCi (${new Date(e.date).toLocaleDateString('en-IN')})`).join(', ')}`} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      // ── C3: Medication (also captures "treatment type" and "dose
      // change", formerly the separate G1/G2 screens — G1 duplicated this
      // question outright, and G2's dose-change question logically
      // belongs right after "what are you taking", not several screens
      // later in Module G) ──
      case 'C3': return (() => {
        const LT4_COLOR = { bg: '#eef4fc', border: '#a8c8f0', text: '#1a5fb4' };
        const LT3_COLOR = { bg: '#f6f0fc', border: '#c9b3e8', text: '#6b3fa0' };
        const renderMedCol = (which) => {
          const isLT4 = which === 'lt4';
          const c = isLT4 ? LT4_COLOR : LT3_COLOR;
          const timingField = isLT4 ? 'thyroidMedTiming' : 'liothyronineTiming';
          const complianceField = isLT4 ? 'thyroidMedCompliance' : 'liothyronineCompliance';
          const sinceField = isLT4 ? 'thyroidMedSince' : 'liothyronineSince';
          const dcField = isLT4 ? 'doseChanged' : 'liothyronineDoseChanged';
          const dcDateField = isLT4 ? 'doseChangedDate' : 'liothyronineDoseChangedDate';
          const dcReasonField = isLT4 ? 'doseChangedReason' : 'liothyronineDoseChangedReason';
          return (
            <div style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 10 }}>
                {isLT4 ? 'Levothyroxine (LT4)' : 'Liothyronine (LT3)'}
              </div>
              <HypoField label="Timing">
                <HypoRadioGroup value={f[timingField]} onChange={set(timingField)} options={[
                  ['before_breakfast', 'Before breakfast'],
                  ['after_breakfast', 'After breakfast'],
                  ['bedtime', 'Bedtime'],
                ]} horizontal />
              </HypoField>
              <HypoField label="Compliance">
                <HypoRadioGroup value={f[complianceField]} onChange={set(complianceField)} options={[
                  ['regular', 'Regular'],
                  ['irregular', 'Irregular'],
                  ['skips_sometimes', 'Skips sometimes'],
                ]} horizontal />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f[sinceField]} onChange={set(sinceField)} label="Taking since" />
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Dose changed recently?</div>
                <HypoRadioGroup value={f[dcField]} onChange={set(dcField)} horizontal options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
                {f[dcField] === 'yes' && (
                  <HypoSubBlock>
                    <HypoField label="Date of last dose change">
                      <HypoDateInput value={f[dcDateField]} onChange={set(dcDateField)} />
                    </HypoField>
                    <HypoField label="Reason for change">
                      <HypoRadioGroup value={f[dcReasonField]} onChange={set(dcReasonField)} options={[
                        ['tsh_increased', 'TSH increased'],
                        ['tsh_decreased', 'TSH decreased'],
                        ...((!isMale && !hadHysterectomy && !isPostMeno && isMarriedStatus) ? [['pregnancy', 'Pregnancy']] : []),
                        ['doctor_advice', "Doctor's advice / Other"],
                      ]} />
                    </HypoField>
                  </HypoSubBlock>
                )}
              </div>
            </div>
          );
        };

        return (
          <>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Are you currently taking any thyroid medication?</div>
            <HypoRadioGroup value={f.thyroidMed} onChange={set('thyroidMed')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
            {f.thyroidMed === 'yes' && (
              <HypoSubBlock>
                <HypoField label="Treatment type">
                  <HypoRadioGroup value={f.treatmentType} onChange={set('treatmentType')} horizontal options={[
                    ['levo_only', 'Levothyroxine (LT4)'],
                    ['lio_only', 'Liothyronine (LT3)'],
                    ['combination', 'Combination'],
                    ['other', 'Other'],
                  ]} />
                </HypoField>

                {(f.treatmentType === 'levo_only' || f.treatmentType === 'lio_only' || f.treatmentType === 'combination') && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
                      <div>
                        {(f.treatmentType === 'levo_only' || f.treatmentType === 'combination') && (
                          <HypoField label="Brand name — Levothyroxine (LT4)">
                            <HypoSelect
                              value={f.thyroidMedBrand}
                              onChange={brand => {
                                const info = THYROID_MED_BRANDS[brand];
                                set('thyroidMedBrand')(brand);
                                set('thyroidMedName')(info ? info.generic : '');
                                set('thyroidMedDose')('');
                              }}
                              placeholder="Select brand..."
                              options={Object.keys(THYROID_MED_BRANDS).sort().map(b => [b, b])}
                            />
                          </HypoField>
                        )}
                      </div>
                      <div>
                        {(f.treatmentType === 'lio_only' || f.treatmentType === 'combination') && (
                          <HypoField label="Brand name — Liothyronine (LT3)">
                            <HypoSelect
                              value={f.liothyronineBrand}
                              onChange={brand => {
                                const info = LIOTHYRONINE_BRANDS[brand];
                                set('liothyronineBrand')(brand);
                                set('liothyronineName')(info ? info.generic : '');
                                set('liothyronineDose')('');
                              }}
                              placeholder="Select brand..."
                              options={Object.keys(LIOTHYRONINE_BRANDS).sort().map(b => [b, b])}
                            />
                          </HypoField>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
                      <div>
                        {(f.treatmentType === 'levo_only' || f.treatmentType === 'combination') && f.thyroidMedBrand && (
                          <HypoField label="Drug name" hint="Auto-filled from brand">
                            <HypoTextInput value={f.thyroidMedName} onChange={set('thyroidMedName')} />
                          </HypoField>
                        )}
                      </div>
                      <div>
                        {(f.treatmentType === 'lio_only' || f.treatmentType === 'combination') && f.liothyronineBrand && (
                          <HypoField label="Drug name" hint="Auto-filled from brand">
                            <HypoTextInput value={f.liothyronineName} onChange={set('liothyronineName')} />
                          </HypoField>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      <div>
                        {(f.treatmentType === 'levo_only' || f.treatmentType === 'combination') && f.thyroidMedBrand && THYROID_MED_BRANDS[f.thyroidMedBrand] && (
                          <HypoField label="Current dose (mcg)">
                            <HypoPillSelect perRow={3}
                              value={f.thyroidMedDose ? Number(f.thyroidMedDose) : null}
                              onChange={dose => set('thyroidMedDose')(String(dose))}
                              options={THYROID_MED_BRANDS[f.thyroidMedBrand].doses}
                            />
                          </HypoField>
                        )}
                      </div>
                      <div>
                        {(f.treatmentType === 'lio_only' || f.treatmentType === 'combination') && f.liothyronineBrand && LIOTHYRONINE_BRANDS[f.liothyronineBrand] && (
                          <HypoField label="Current dose (mcg)">
                            <HypoPillSelect perRow={3}
                              value={f.liothyronineDose ? Number(f.liothyronineDose) : null}
                              onChange={dose => set('liothyronineDose')(String(dose))}
                              options={LIOTHYRONINE_BRANDS[f.liothyronineBrand].doses}
                            />
                          </HypoField>
                        )}
                      </div>
                    </div>

                    {/* Timing / Compliance / Since / Dose-change — two
                        color-coded columns, one per drug, so a combination
                        regimen's two medicines never get mixed up */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>{(f.treatmentType === 'levo_only' || f.treatmentType === 'combination') && renderMedCol('lt4')}</div>
                      <div>{(f.treatmentType === 'lio_only' || f.treatmentType === 'combination') && renderMedCol('lt3')}</div>
                    </div>

                    {(f.thyroidMedBrand || f.liothyronineBrand) && (
                      <HypoOutputBox text={[
                        f.thyroidMedBrand && f.thyroidMedDose ? `Tab. ${f.thyroidMedBrand} — ${f.thyroidMedDose} mcg ${formatDuration(f.thyroidMedSince)}` : '',
                        f.liothyronineBrand && f.liothyronineDose ? `Tab. ${f.liothyronineBrand} — ${f.liothyronineDose} mcg ${formatDuration(f.liothyronineSince)}` : '',
                      ].filter(Boolean).join(' + ')} />
                    )}
                  </>
                )}

                {f.treatmentType === 'other' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <HypoField label="Drug name"><HypoTextInput value={f.thyroidMedName} onChange={set('thyroidMedName')} placeholder="e.g. Levothyroxine" /></HypoField>
                      <HypoField label="Current dose (mcg)"><HypoTextInput type="number" min="0" value={f.thyroidMedDose} onChange={set('thyroidMedDose')} /></HypoField>
                    </div>
                    <HypoField label="Timing">
                      <HypoRadioGroup value={f.thyroidMedTiming} onChange={set('thyroidMedTiming')} options={[
                        ['before_breakfast', 'Before breakfast'],
                        ['after_breakfast', 'After breakfast'],
                        ['bedtime', 'Bedtime'],
                      ]} horizontal />
                    </HypoField>
                    <HypoField label="Compliance">
                      <HypoRadioGroup value={f.thyroidMedCompliance} onChange={set('thyroidMedCompliance')} options={[
                        ['regular', 'Regular'],
                        ['irregular', 'Irregular'],
                        ['skips_sometimes', 'Skips sometimes'],
                      ]} horizontal />
                    </HypoField>
                    <HypoDurationPicker minDate={f.dob} value={f.thyroidMedSince} onChange={set('thyroidMedSince')} label="Taking since" />
                    {f.thyroidMedName && f.thyroidMedSince && (
                      <HypoOutputBox text={`On Tab. ${f.thyroidMedName} — ${f.thyroidMedDose} mcg ${formatDuration(f.thyroidMedSince)}`} />
                    )}
                    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Has this dose been changed recently?</div>
                      <HypoRadioGroup value={f.doseChanged} onChange={set('doseChanged')} horizontal options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
                      {f.doseChanged === 'yes' && (
                        <HypoSubBlock>
                          <HypoField label="Date of last dose change">
                            <HypoDateInput value={f.doseChangedDate} onChange={set('doseChangedDate')} />
                          </HypoField>
                          <HypoField label="Reason for change">
                            <HypoRadioGroup value={f.doseChangedReason} onChange={set('doseChangedReason')} options={[
                              ['tsh_increased', 'TSH increased'],
                              ['tsh_decreased', 'TSH decreased'],
                              ...((!isMale && !hadHysterectomy && !isPostMeno && isMarriedStatus) ? [['pregnancy', 'Pregnancy']] : []),
                              ['doctor_advice', "Doctor's advice / Other"],
                            ]} />
                          </HypoField>
                        </HypoSubBlock>
                      )}
                    </div>
                  </>
                )}
              </HypoSubBlock>
            )}
          </>
        );
      })();

      // ── C4: Family history ──
      case 'C4': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Do you have a family history of thyroid disease?</div>
          <HypoRadioGroup value={f.familyThyroid} onChange={set('familyThyroid')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.familyThyroid === 'yes' && (
            <HypoSubBlock>
              {[
                { group: 'Immediate family', members: ['Mother', 'Father', 'Brother', 'Sister', 'Son', 'Daughter'] },
                { group: 'Paternal side', members: ['Grandfather (P)', 'Grandmother (P)', 'Uncle (P)', 'Aunt (P)', 'Cousin brother (P)', 'Cousin sister (P)'] },
                { group: 'Maternal side', members: ['Grandfather (M)', 'Grandmother (M)', 'Uncle (M)', 'Aunt (M)', 'Cousin brother (M)', 'Cousin sister (M)'] },
              ].map(({ group, members }) => (
                <div key={group} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>{group}</div>
                  <HypoMultiSelect value={f.familyThyroidRelatives || []} onChange={set('familyThyroidRelatives')}
                    options={members.map(m => [m, m])} />
                </div>
              ))}
              {(f.familyThyroidRelatives || []).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Condition for each selected relative</div>
                  {f.familyThyroidRelatives.map(rel => (
                    <div key={rel} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div style={{ fontSize: 13, minWidth: 140 }}>{rel}</div>
                      <select className="form-input" style={{ fontSize: 12 }}
                        value={(f.familyThyroidConditions || {})[rel] || ''}
                        onChange={e => set('familyThyroidConditions')({ ...(f.familyThyroidConditions || {}), [rel]: e.target.value })}>
                        <option value="">Select condition</option>
                        {['Hypothyroidism', 'Hyperthyroidism', 'Thyroid cancer', 'Goitre', 'Others'].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <HypoOutputBox text={(f.familyThyroidRelatives || []).join(' and ')} />
                </div>
              )}
            </HypoSubBlock>
          )}
        </>
      );

      // ── C5: Autoimmune ──
      case 'C5': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Do you have any known autoimmune condition?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>e.g. Type 1 diabetes, rheumatoid arthritis, lupus, vitiligo, Addison's disease</div>
          <HypoRadioGroup value={f.autoimmune} onChange={set('autoimmune')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.autoimmune === 'yes' && (
            <HypoSubBlock>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>Select all that apply and enter duration for each</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>(Diabetes is covered separately later in this questionnaire — no need to list it here)</div>
              {['Rheumatoid arthritis', 'Lupus (SLE)', 'Vitiligo', "Addison's disease", 'Other'].map(cond => (
                <div key={cond} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={!!(f.autoimmuneItems || {})[cond]?.selected}
                    onChange={e => set('autoimmuneItems')({ ...(f.autoimmuneItems || {}), [cond]: { ...(f.autoimmuneItems?.[cond] || {}), selected: e.target.checked } })}
                    style={{ marginTop: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>{cond}</div>
                    {(f.autoimmuneItems || {})[cond]?.selected && (
                      <HypoDurationPicker minDate={f.dob} value={(f.autoimmuneItems || {})[cond]?.duration || {}}
                        onChange={v => set('autoimmuneItems')({ ...(f.autoimmuneItems || {}), [cond]: { ...(f.autoimmuneItems?.[cond] || {}), duration: v } })}
                        label="" />
                    )}
                  </div>
                </div>
              ))}
              {Object.entries(f.autoimmuneItems || {}).filter(([, v]) => v?.selected).length > 0 && (
                <HypoOutputBox text={Object.entries(f.autoimmuneItems || {})
                  .filter(([, v]) => v?.selected)
                  .map(([k, v]) => `${k} ${v.duration ? formatDuration(v.duration) : ''}`)
                  .join('. ')} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      // ── D1: TSH ──
      case 'D1': return <HypoLabScreen patientId={patientId} episodeId={episodeId} label="TSH" field="tsh" unit="mIU/L" f={f} set={set}
        unitOptions={null} reportKey="tshReports" tshField="tshDate"
        output={f.tshValue ? `TSH — ${f.tshValue} mIU/L (${f.tshDate ? new Date(f.tshDate).toLocaleDateString('en-IN') : ''})` : ''} />;

      // ── D2: T3 (total) — optional ──
      case 'D2': return <HypoLabScreen patientId={patientId} episodeId={episodeId} label="T3 (total)" field="t3" unit="" f={f} set={set}
        unitOptions={[['nmol_l', 'nmol/L'], ['ng_dl', 'ng/dL']]} reportKey="t3Reports" tshField="tshDate" optional
        output={f.t3Value ? `T3 — ${f.t3Value} ${f.t3Unit || ''} (${f.t3Date ? new Date(f.t3Date).toLocaleDateString('en-IN') : ''})` : ''} />;

      // ── D3: FT3 ──
      case 'D3': return <HypoLabScreen patientId={patientId} episodeId={episodeId} label="Free T3 (FT3)" field="ft3" unit="" f={f} set={set}
        unitOptions={[['pmol_l', 'pmol/L'], ['pg_ml', 'pg/mL']]} reportKey="ft3Reports" tshField="tshDate"
        output={f.ft3Value ? `Free T3 — ${f.ft3Value} ${f.ft3Unit || ''} (${f.ft3Date ? new Date(f.ft3Date).toLocaleDateString('en-IN') : ''})` : ''} />;

      // ── D4: T4 (total) — optional ──
      case 'D4': return <HypoLabScreen patientId={patientId} episodeId={episodeId} label="T4 (total)" field="t4" unit="" f={f} set={set}
        unitOptions={[['nmol_l', 'nmol/L'], ['mcg_dl', 'mcg/dL']]} reportKey="t4Reports" tshField="tshDate" optional
        output={f.t4Value ? `T4 — ${f.t4Value} ${f.t4Unit || ''} (${f.t4Date ? new Date(f.t4Date).toLocaleDateString('en-IN') : ''})` : ''} />;

      // ── D5: FT4 ──
      case 'D5': return <HypoLabScreen patientId={patientId} episodeId={episodeId} label="Free T4 (FT4)" field="ft4" unit="" f={f} set={set}
        unitOptions={[['pmol_l', 'pmol/L'], ['ng_dl', 'ng/dL']]} reportKey="ft4Reports" tshField="tshDate"
        output={f.ft4Value ? `Free T4 — ${f.ft4Value} ${f.ft4Unit || ''} (${f.ft4Date ? new Date(f.ft4Date).toLocaleDateString('en-IN') : ''})` : ''} />;

      // ── D6: Anti-TPO ──
      case 'D6': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you had an Anti-TPO (Anti-Thyroperoxidase) antibody test done?</div>
          <HypoRadioGroup value={f.antitpoDone} onChange={set('antitpoDone')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.antitpoDone === 'yes' && (
            <HypoSubBlock>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <HypoField label="Anti-TPO value"><HypoTextInput type="number" value={f.antitpoValue} onChange={set('antitpoValue')} placeholder="Value" /></HypoField>
                <HypoField label="Unit"><HypoSelect value={f.antitpoUnit} onChange={set('antitpoUnit')} options={[['iu_ml','IU/mL'],['ku_l','kU/L']]} /></HypoField>
                <HypoField label="Date of test"><HypoDateInput value={f.antitpoDate} onChange={set('antitpoDate')} /></HypoField>
                <HypoField label=""><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" onChange={e => e.target.checked && set('antitpoDate')(f.tshDate)} /> Same date as TSH</label></HypoField>
                <HypoField label="Reference range low"><HypoTextInput type="number" value={f.antitpoRefLow} onChange={set('antitpoRefLow')} placeholder="Low" /></HypoField>
                <HypoField label="Reference range high"><HypoTextInput type="number" value={f.antitpoRefHigh} onChange={set('antitpoRefHigh')} placeholder="High" /></HypoField>
              </div>
              <LabReportUpload
                patientId={patientId} episodeId={episodeId} fieldLabel="Anti-TPO"
                category="blood_report"
                reports={f.antitpoReports || []}
                onReportsChange={set('antitpoReports')}
                onExtract={(extracted) => {
                  if (extracted.value != null) set('antitpoValue')(extracted.value);
                  if (extracted.date != null) set('antitpoDate')(extracted.date);
                  if (extracted.refLow != null) set('antitpoRefLow')(extracted.refLow);
                  if (extracted.refHigh != null) set('antitpoRefHigh')(extracted.refHigh);
                }}
              />
            </HypoSubBlock>
          )}
          <HypoOutputBox text={f.antitpoDone === 'yes' && f.antitpoValue ? `Anti-TPO — ${f.antitpoValue} ${f.antitpoUnit || 'IU/mL'}  (${f.antitpoDate ? new Date(f.antitpoDate).toLocaleDateString('en-IN') : ''})` : ''} />
        </>
      );

      // ── D7: Anti-Tg ──
      case 'D7': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you had an Anti-Tg (Anti-thyroglobulin) antibody test done?</div>
          <HypoRadioGroup value={f.antitgDone} onChange={set('antitgDone')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.antitgDone === 'yes' && (
            <HypoSubBlock>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <HypoField label="Anti-Tg value"><HypoTextInput type="number" value={f.antitgValue} onChange={set('antitgValue')} placeholder="Value" /></HypoField>
                <HypoField label="Unit"><HypoSelect value={f.antitgUnit} onChange={set('antitgUnit')} options={[['iu_ml','IU/mL'],['ku_l','kU/L']]} /></HypoField>
                <HypoField label="Date of test"><HypoDateInput value={f.antitgDate} onChange={set('antitgDate')} /></HypoField>
                <HypoField label=""><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" onChange={e => e.target.checked && set('antitgDate')(f.tshDate)} /> Same date as TSH</label></HypoField>
                <HypoField label="Reference range low"><HypoTextInput type="number" value={f.antitgRefLow} onChange={set('antitgRefLow')} placeholder="Low" /></HypoField>
                <HypoField label="Reference range high"><HypoTextInput type="number" value={f.antitgRefHigh} onChange={set('antitgRefHigh')} placeholder="High" /></HypoField>
              </div>
              <LabReportUpload
                patientId={patientId} episodeId={episodeId} fieldLabel="Anti-Tg"
                category="blood_report"
                reports={f.antitgReports || []}
                onReportsChange={set('antitgReports')}
                onExtract={(extracted) => {
                  if (extracted.value != null) set('antitgValue')(extracted.value);
                  if (extracted.date != null) set('antitgDate')(extracted.date);
                  if (extracted.refLow != null) set('antitgRefLow')(extracted.refLow);
                  if (extracted.refHigh != null) set('antitgRefHigh')(extracted.refHigh);
                }}
              />
            </HypoSubBlock>
          )}
          <HypoOutputBox text={f.antitgDone === 'yes' && f.antitgValue ? `Anti-Tg — ${f.antitgValue} ${f.antitgUnit || 'IU/mL'}  (${f.antitgDate ? new Date(f.antitgDate).toLocaleDateString('en-IN') : ''})` : ''} />
        </>
      );

      // ── D8: CBC (full panel) ──
      // ── D10: Imaging ──
      case 'D10': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you had a thyroid ultrasound or any other thyroid imaging done?</div>
          <HypoRadioGroup value={f.imagingDone} onChange={set('imagingDone')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.imagingDone === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type of imaging (select all that apply)">
                <HypoMultiSelect value={f.imagingTypes} onChange={set('imagingTypes')} options={[
                  ['usg_thyroid', 'USG thyroid'], ['usg_neck', 'USG neck'],
                  ['tc99_scan', 'Thyroid radionuclide (Tc-99m) scan'],
                  ['ct_neck', 'CT scan neck'], ['mri_neck', 'MRI scan neck'], ['other', 'Other'],
                ]} />
              </HypoField>
              <HypoField label="Date of imaging"><HypoDateInput value={f.imagingDate} onChange={set('imagingDate')} /></HypoField>
              <HypoField label="Key findings (optional)"><HypoTextInput value={f.imagingFinding} onChange={set('imagingFinding')} placeholder="e.g. Heterogeneous echotexture, features of Hashimoto's" /></HypoField>
              <LabReportUpload
                patientId={patientId} episodeId={episodeId} fieldLabel="Thyroid imaging"
                category="scan_usg"
                enableExtract={false}
                reports={f.imagingReport ? [f.imagingReport] : []}
                onReportsChange={(arr) => set('imagingReport')(arr[arr.length - 1] || null)}
              />
            </HypoSubBlock>
          )}
          <HypoOutputBox text={f.imagingDone === 'yes' && f.imagingTypes.length ? `${f.imagingTypes.join(', ').replace(/_/g,' ')} done on ${f.imagingDate ? new Date(f.imagingDate).toLocaleDateString('en-IN') : ''}${f.imagingFinding ? ' — ' + f.imagingFinding : ''}` : ''} />
        </>
      );

      // ── E1: Cause ──
      case 'E1': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Do you know the cause of your hypothyroidism?</div>
          <HypoRadioGroup value={f.hypoCauseKnown} onChange={set('hypoCauseKnown')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.hypoCauseKnown === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Cause (select one)">
                <HypoRadioGroup value={f.hypoCause} onChange={set('hypoCause')} options={[
                  ['hashimotos', "Hashimoto's thyroiditis"],
                  ['post_rai', 'Post-radioiodine therapy'],
                  ['post_surgical', 'Post-surgical'],
                  ['congenital', 'Congenital'],
                  ['iodine_deficiency', 'Iodine deficiency'],
                  ['drug_induced', 'Drug-induced'],
                  ['unknown', 'Unknown / Not told'],
                ]} />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.hypoDuration} onChange={set('hypoDuration')} label="Since when / duration" />
              {f.hypoCause && (
                <HypoOutputBox text={`${
                  f.hypoCause === 'hashimotos' ? "Hashimoto's thyroiditis" :
                  f.hypoCause === 'post_rai' ? 'Post-radioiodine' :
                  f.hypoCause === 'post_surgical' ? 'Post-surgical' :
                  f.hypoCause === 'congenital' ? 'Congenital' :
                  f.hypoCause === 'iodine_deficiency' ? 'Iodine deficiency' :
                  f.hypoCause === 'drug_induced' ? 'Drug-induced' : 'Unknown'
                } Hypothyroidism ${formatDuration(f.hypoDuration)}`} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      // ── E2: Hashimoto's antibody results (only shown when E1's cause
      // was already set to "Hashimoto's thyroiditis" — so this no longer
      // re-asks "have you been confirmed", which let a patient contradict
      // what they'd just said one screen earlier) ──
      case 'E2': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Antibody results for Hashimoto's thyroiditis</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>If you've had these tests done, enter the value. Leave blank if not tested.</div>
          <HypoField label="Anti-TPO antibody">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <HypoTextInput type="number" min="0" value={f.hashimotosAntiTpoValue} onChange={set('hashimotosAntiTpoValue')}
                placeholder="IU/mL" style={{ width: 120, opacity: f.hashimotosAntiTpo === 'not_tested' ? 0.4 : 1, pointerEvents: f.hashimotosAntiTpo === 'not_tested' ? 'none' : 'auto' }} />
              <label style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.hashimotosAntiTpo === 'not_tested'}
                  onChange={e => set('hashimotosAntiTpo')(e.target.checked ? 'not_tested' : '')} />
                Not tested
              </label>
            </div>
          </HypoField>
          <HypoField label="Anti-Tg antibody">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <HypoTextInput type="number" min="0" value={f.hashimotosAntiTgValue} onChange={set('hashimotosAntiTgValue')}
                placeholder="IU/mL" style={{ width: 120, opacity: f.hashimotosAntiTg === 'not_tested' ? 0.4 : 1, pointerEvents: f.hashimotosAntiTg === 'not_tested' ? 'none' : 'auto' }} />
              <label style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.hashimotosAntiTg === 'not_tested'}
                  onChange={e => set('hashimotosAntiTg')(e.target.checked ? 'not_tested' : '')} />
                Not tested
              </label>
            </div>
          </HypoField>
          {(f.hashimotosAntiTpoValue || f.hashimotosAntiTgValue) && (
            <HypoOutputBox text={`Hashimoto's thyroiditis${f.hashimotosAntiTpoValue ? ` — Anti-TPO ${f.hashimotosAntiTpoValue} IU/mL` : ''}${f.hashimotosAntiTgValue ? `, Anti-Tg ${f.hashimotosAntiTgValue} IU/mL` : ''}`} />
          )}
        </>
      );

      // ── E3: Goitre ──
      case 'E3': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Do you have or have you been told you have a goitre?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>(Enlarged thyroid / swelling in the front of the neck)</div>
          <HypoRadioGroup value={f.goitre} onChange={set('goitre')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.goitre === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Size if known">
                <HypoRadioGroup value={f.goitreSize} onChange={set('goitreSize')} horizontal
                  options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['unsure', 'Unsure']]} />
              </HypoField>
              {f.goitreSize && <HypoOutputBox text={`${f.goitreSize.charAt(0).toUpperCase() + f.goitreSize.slice(1)}-sized goitre`} />}
            </HypoSubBlock>
          )}
        </>
      );

      // ── F symptom screens (standard pattern) ──
      case 'F1': return <HypoSymptomScreen id="F1"
        question="Do you experience unusual tiredness or fatigue?"
        statusKey="fatigue" durationKey="fatigueDuration" f={f} set={set}
        extra={<>
          <HypoField label="Severity">
            <HypoRadioGroup value={f.fatigueSeverity} onChange={set('fatigueSeverity')} horizontal
              options={[['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe']]} />
          </HypoField>
          <div style={{ fontSize: 12, fontWeight: 600, margin: '16px 0 8px', color: 'var(--text-secondary)' }}>
            Recommended investigations for this symptom
          </div>
          <HypoInvestigationPicker tests={['cbc', 'vitB12', 'vitD3', 'srCalcium']} rows={[['cbc', 'vitB12'], ['vitD3', 'srCalcium']]} f={f} set={set} patientId={patientId} episodeId={episodeId} />
          {(() => {
            const hb = parseFloat(f.cbcValues?.haemoglobin?.value);
            return !isNaN(hb) && hb < 10 ? (
              <>
                <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', margin: '8px 0' }}>
                  Haemoglobin below 10 — iron studies recommended.
                </div>
                <HypoInlineLab label="Serum Iron" field="srIron" unit="mcg/dL" f={f} set={set} />
                <HypoInlineLab label="Serum Ferritin" field="srFerritin" unit="ng/mL" f={f} set={set} />
                <HypoInlineLab label="TIBC" field="tibc" unit="mcg/dL" f={f} set={set} />
                <HypoInlineLab label="Transferrin Saturation" field="transferrinSat" unit="%" f={f} set={set} />
              </>
            ) : null;
          })()}
        </>}
        output={f.fatigue === 'yes' && f.fatigueSeverity
          ? `${f.fatigueSeverity.charAt(0).toUpperCase() + f.fatigueSeverity.slice(1)} tiredness ${formatDuration(f.fatigueDuration)}`
          : f.fatigue === 'no' ? 'No fatigue' : ''} />;

      case 'F2': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you noticed any unintentional change in your weight?</div>
          <HypoRadioGroup value={f.weightChange} onChange={set('weightChange')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.weightChange === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Direction">
                <HypoRadioGroup value={f.weightDirection} onChange={set('weightDirection')} horizontal
                  options={[['gained', 'Weight gained'], ['lost', 'Weight lost']]} />
              </HypoField>
              <HypoField label="How much (kg)">
                <HypoTextInput type="number" min="0" value={f.weightKg} onChange={set('weightKg')} style={{ width: 100 }} />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.weightDuration} onChange={set('weightDuration')} label="Since when" />
              {f.weightDirection && f.weightKg && (
                <HypoOutputBox text={`Weight ${f.weightDirection === 'gained' ? 'gain' : 'loss'} of ${f.weightKg} kg ${formatDurationOver(f.weightDuration)}`} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F3': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Has your appetite changed?</div>
          <HypoRadioGroup value={f.appetite} onChange={set('appetite')} options={[
            ['no_change', 'No change'], ['decreased', 'Decreased'], ['increased', 'Increased']
          ]} />
          {f.appetite && f.appetite !== 'no_change' && <HypoOutputBox text={`${f.appetite.charAt(0).toUpperCase() + f.appetite.slice(1)} appetite`} />}
        </>
      );

      case 'F4': return <HypoSymptomScreen id="F4"
        question="Do you feel unusually cold or have difficulty tolerating cold temperatures?"
        statusKey="cold" durationKey="coldDuration" f={f} set={set}
        extra={<HypoField label="Does it affect daily activities?">
          <HypoRadioGroup value={f.coldImpact} onChange={set('coldImpact')} horizontal options={[['yes', 'Yes'], ['no', 'No']]} />
        </HypoField>}
        output={f.cold === 'yes' ? `Intolerance to cold ${formatDuration(f.coldDuration)}` : ''} />;

      case 'F5': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you noticed any changes in your bowel habits?</div>
          <HypoRadioGroup value={f.bowel} onChange={set('bowel')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.bowel === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type (select one)">
                <HypoRadioGroup value={f.bowelType} onChange={set('bowelType')} options={[
                  ['constipation', 'Constipation'], ['diarrhoea', 'Diarrhoea'],
                  ['alternating', 'Alternating'], ['reduced_frequency', 'Reduced frequency'],
                ]} />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.bowelDuration} onChange={set('bowelDuration')} label="Since when" />
              {f.bowelType && <HypoOutputBox text={`${f.bowelType.charAt(0).toUpperCase() + f.bowelType.slice(1).replace('_', ' ')} ${formatDuration(f.bowelDuration)}`} />}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F6': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Do you experience any abdominal bloating, fullness, or discomfort?</div>
          <HypoRadioGroup value={f.abdominal} onChange={set('abdominal')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.abdominal === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type (select all that apply)">
                <HypoMultiSelect value={f.abdominalTypes} onChange={set('abdominalTypes')}
                  options={[['bloating', 'Bloating'], ['fullness', 'Fullness'], ['discomfort', 'Discomfort'], ['nausea', 'Nausea']]} />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.abdominalDuration} onChange={set('abdominalDuration')} label="Since when" />
              {f.abdominalTypes?.length > 0 && <HypoOutputBox text={`${f.abdominalTypes.join(', ')} of abdomen ${formatDuration(f.abdominalDuration)}`} />}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F7': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you noticed any changes in your skin?</div>
          <HypoRadioGroup value={f.skin} onChange={set('skin')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.skin === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type (select all that apply)">
                <HypoCheckPillGrid perRow={3} value={f.skinTypes} onChange={set('skinTypes')}
                  options={[['dryness', 'Dryness'], ['roughness', 'Roughness'], ['pallor', 'Pallor'], ['puffiness', 'Puffiness'], ['thickening', 'Thickening']]} />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.skinDuration} onChange={set('skinDuration')} label="Since when" />
              {f.skinTypes?.length > 0 && <HypoOutputBox text={`${f.skinTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')} of skin ${formatDuration(f.skinDuration)}`} />}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F8a': return <HypoSymptomScreen id="F8a"
        question="Do you have puffiness or swelling around your eyes? (periorbital oedema)"
        statusKey="periorbital" durationKey="periorbitalDuration" f={f} set={set}
        output={f.periorbital === 'yes' ? `Peri-orbital puffiness ${formatDuration(f.periorbitalDuration)}` : ''} />;

      case 'F8b': return <HypoSymptomScreen id="F8b"
        question="Do you have puffiness or swelling of the face? (facial oedema)"
        statusKey="facialOedema" durationKey="facialOedemaDuration" f={f} set={set}
        output={f.facialOedema === 'yes' ? `Facial puffiness ${formatDuration(f.facialOedemaDuration)}` : ''} />;

      case 'F9': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Do you have swelling of the legs or feet? (pedal oedema)</div>
          <HypoRadioGroup value={f.pedalOedema} onChange={set('pedalOedema')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.pedalOedema === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type">
                <HypoRadioGroup value={f.pedalOedemaType} onChange={set('pedalOedemaType')} horizontal
                  options={[['pitting', 'Pitting'], ['non_pitting', 'Non-pitting'], ['unsure', 'Unsure']]} />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.pedalOedemaDuration} onChange={set('pedalOedemaDuration')} label="Since when" />
              {f.pedalOedemaType && <HypoOutputBox text={`Pedal oedema (${f.pedalOedemaType.replace('_', '-')}) ${formatDuration(f.pedalOedemaDuration)}`} />}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F10': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you noticed any changes in your hair?</div>
          <HypoRadioGroup value={f.hair} onChange={set('hair')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.hair === 'yes' && (
            <HypoSubBlock>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Select all that apply. Enter duration for each.</div>
              {[['hair_loss', 'Hair loss'], ['thinning', 'Thinning'], ['dryness', 'Dryness'], ['coarsening', 'Coarsening'], ['eyebrow_loss', 'Loss of outer eyebrow (lateral third)']].map(([val, label]) => (
                <div key={val} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <input type="checkbox" checked={!!(f.hairItems || {})[val]?.selected}
                      onChange={e => set('hairItems')({ ...(f.hairItems || {}), [val]: { ...(f.hairItems?.[val] || {}), selected: e.target.checked } })} />
                    <span style={{ fontSize: 13 }}>{label}</span>
                  </div>
                  {(f.hairItems || {})[val]?.selected && (
                    <HypoDurationPicker minDate={f.dob} value={(f.hairItems || {})[val]?.duration || {}}
                      onChange={v => set('hairItems')({ ...(f.hairItems || {}), [val]: { ...(f.hairItems?.[val] || {}), duration: v } })}
                      label="" />
                  )}
                </div>
              ))}
              {Object.entries(f.hairItems || {}).filter(([, v]) => v?.selected).length > 0 && (
                <HypoOutputBox text={Object.entries(f.hairItems || {}).filter(([, v]) => v?.selected)
                  .map(([k, v]) => `${k.replace('_', ' ')} ${formatDuration(v.duration)}`).join('. ')} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F11': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you noticed any changes in your nails?</div>
          <HypoRadioGroup value={f.nails} onChange={set('nails')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.nails === 'yes' && (
            <HypoSubBlock>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Select all that apply. Enter duration for each.</div>
              {[['brittle', 'Brittle'], ['slow_growing', 'Slow growing'], ['ridged', 'Ridged'], ['thickened', 'Thickened']].map(([val, label]) => (
                <div key={val} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <input type="checkbox" checked={!!(f.nailItems || {})[val]?.selected}
                      onChange={e => set('nailItems')({ ...(f.nailItems || {}), [val]: { ...(f.nailItems?.[val] || {}), selected: e.target.checked } })} />
                    <span style={{ fontSize: 13 }}>{label}</span>
                  </div>
                  {(f.nailItems || {})[val]?.selected && (
                    <HypoDurationPicker minDate={f.dob} value={(f.nailItems || {})[val]?.duration || {}}
                      onChange={v => set('nailItems')({ ...(f.nailItems || {}), [val]: { ...(f.nailItems?.[val] || {}), duration: v } })}
                      label="" />
                  )}
                </div>
              ))}
              {Object.entries(f.nailItems || {}).filter(([, v]) => v?.selected).length > 0 && (
                <HypoOutputBox text={Object.entries(f.nailItems || {}).filter(([, v]) => v?.selected)
                  .map(([k, v]) => `${k.replace('_', ' ')} nails ${formatDuration(v.duration)}`).join('. ')} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F12': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you noticed any hoarseness or change in your voice?</div>
          <HypoRadioGroup value={f.hoarseness} onChange={set('hoarseness')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.hoarseness === 'yes' && (
            <HypoSubBlock>
              <HypoDurationPicker minDate={f.dob} value={f.hoarsenessDuration} onChange={set('hoarsenessDuration')} label="Since when" />
              <HypoField label="Pattern">
                <HypoRadioGroup value={f.hoarsenessPattern} onChange={set('hoarsenessPattern')} horizontal
                  options={[['constant', 'Constant'], ['intermittent', 'Intermittent']]} />
              </HypoField>
              {f.hoarsenessPattern && <HypoOutputBox text={`${f.hoarsenessPattern.charAt(0).toUpperCase() + f.hoarsenessPattern.slice(1)} hoarseness of voice ${formatDuration(f.hoarsenessDuration)}`} />}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F13': return <HypoSymptomScreen id="F13"
        question="Do you experience muscle cramps or aches?"
        statusKey="cramps" durationKey="crampsDuration" f={f} set={set}
        extra={<>
          <HypoInvestigationPicker tests={['vitD3', 'srCalcium']} rows={[['vitD3', 'srCalcium']]} f={f} set={set} patientId={patientId} episodeId={episodeId} />
        </>}
        output={f.cramps === 'yes' ? `Muscle cramps ${formatDuration(f.crampsDuration)}` : ''} />;

      case 'F14': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Do you feel a general weakness or heaviness in your muscles?</div>
          <HypoRadioGroup value={f.weakness} onChange={set('weakness')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.weakness === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Location">
                <HypoRadioGroup value={f.weaknessLocation} onChange={set('weaknessLocation')} horizontal
                  options={[['proximal', 'Proximal (upper arms / thighs)'], ['generalised', 'Generalised']]} />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.weaknessDuration} onChange={set('weaknessDuration')} label="Since when" />
              <div style={{ fontSize: 12, fontWeight: 600, margin: '16px 0 8px', color: 'var(--text-secondary)' }}>
                Recommended investigations for this symptom
              </div>
              <HypoInvestigationPicker tests={['cbc', 'vitB12', 'vitD3', 'srCalcium']} rows={[['cbc', 'vitB12'], ['vitD3', 'srCalcium']]} f={f} set={set} patientId={patientId} episodeId={episodeId} />
              {f.weaknessLocation && <HypoOutputBox text={`Weakness in ${f.weaknessLocation === 'proximal' ? 'both thigh / upper arm muscles' : 'generalised muscle weakness'} ${formatDuration(f.weaknessDuration)}`} />}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F15a': return <HypoSymptomScreen id="F15a"
        question="Do you experience difficulty concentrating?"
        statusKey="concentration" durationKey="concentrationDuration" f={f} set={set}
        extra={<HypoField label="Does it affect your work or daily life?">
          <HypoRadioGroup value={f.concentrationImpact} onChange={set('concentrationImpact')} horizontal options={[['yes', 'Yes'], ['no', 'No']]} />
        </HypoField>}
        output={f.concentration === 'yes' ? `Difficulty in concentrating ${formatDuration(f.concentrationDuration)}` : ''} />;

      case 'F15b': return <HypoSymptomScreen id="F15b"
        question="Do you experience problems with memory?"
        statusKey="memory" durationKey="memoryDuration" f={f} set={set}
        extra={<HypoField label="Does it affect your work or daily life?">
          <HypoRadioGroup value={f.memoryImpact} onChange={set('memoryImpact')} horizontal options={[['yes', 'Yes'], ['no', 'No']]} />
        </HypoField>}
        output={f.memory === 'yes' ? `Memory problems ${formatDuration(f.memoryDuration)}` : ''} />;

      case 'F16': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you been feeling depressed, low in mood, or emotionally flat?</div>
          <HypoRadioGroup value={f.depression} onChange={set('depression')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.depression === 'yes' && (
            <HypoSubBlock>
              <HypoDurationPicker minDate={f.dob} value={f.depressionDuration} onChange={set('depressionDuration')} label="Since when" />
              <HypoField label="Have you seen a doctor for this?">
                <HypoRadioGroup value={f.depressionSeenDoctor} onChange={set('depressionSeenDoctor')} horizontal options={[['yes', 'Yes'], ['no', 'No']]} />
              </HypoField>
              <HypoField label="Formally diagnosed with depression by a doctor?">
                <HypoRadioGroup value={f.depressionDiagnosed} onChange={set('depressionDiagnosed')} horizontal options={[['yes', 'Yes'], ['no', 'No']]} />
              </HypoField>
              {f.depressionDiagnosed === 'yes'
                ? <HypoOutputBox text={`Diagnosed case of depression ${formatDuration(f.depressionDuration)}`} />
                : f.depression === 'yes' && <HypoOutputBox text={`Low mood / depressive symptoms ${formatDuration(f.depressionDuration)}`} />}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F17': return <HypoSymptomScreen id="F17"
        question="Do you experience excessive daytime sleepiness or sleeping more than usual?"
        statusKey="hypersomnia" durationKey="hypersomniaDuration" f={f} set={set}
        output={f.hypersomnia === 'yes' ? `Excessive sleep ${formatDuration(f.hypersomniaDuration)}` : ''} />;

      case 'F18': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you noticed that your heart beats slowly, or been told you have a low pulse rate?</div>
          <HypoRadioGroup value={f.bradycardia} onChange={set('bradycardia')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.bradycardia === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Approximate resting pulse rate (bpm) — optional">
                <HypoTextInput type="number" min="20" max="150" value={f.bradycardiaPulse} onChange={set('bradycardiaPulse')} style={{ width: 100 }} placeholder="e.g. 52" />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.bradycardiaDuration} onChange={set('bradycardiaDuration')} label="Since when" />
              <HypoOutputBox text={`Bradycardia${f.bradycardiaPulse ? ` (${f.bradycardiaPulse} bpm)` : ''} ${formatDuration(f.bradycardiaDuration)}`} />
            </HypoSubBlock>
          )}
        </>
      );

      case 'F19': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Do you feel dizzy or lightheaded when you stand up quickly?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>(Positional giddiness — from sitting or lying down)</div>
          <HypoRadioGroup value={f.giddiness} onChange={set('giddiness')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.giddiness === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Frequency">
                <HypoRadioGroup value={f.giddinessFreq} onChange={set('giddinessFreq')} horizontal options={[
                  ['rarely', 'Rarely'], ['sometimes', 'Sometimes'],
                  ['often', 'Often'], ['every_time', 'Every time I stand'],
                ]} />
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.giddinessDuration} onChange={set('giddinessDuration')} label="Since when" />
              <HypoInvestigationPicker tests={['cbc', 'fbs', 'ppbs']} rows={[['cbc'], ['fbs', 'ppbs']]} f={f} set={set} patientId={patientId} episodeId={episodeId} />
              {f.giddinessFreq && <HypoOutputBox text={`Postural giddiness (${f.giddinessFreq.replace('_', ' ')}) ${formatDuration(f.giddinessDuration)}`} />}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F20': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you ever had a sudden loss of consciousness or black-out episode?</div>
          <HypoRadioGroup value={f.blackout} onChange={set('blackout')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.blackout === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Number of episodes">
                <HypoTextInput type="number" min="1" value={f.blackoutCount} onChange={set('blackoutCount')} style={{ width: 100 }} />
              </HypoField>
              <HypoField label="Date of most recent episode">
                <HypoDateInput value={f.blackoutLastDate} onChange={set('blackoutLastDate')} />
              </HypoField>
              <HypoField label="Were you assessed by a doctor after any episode?">
                <HypoRadioGroup value={f.blackoutAssessed} onChange={set('blackoutAssessed')} horizontal options={[['yes', 'Yes'], ['no', 'No']]} />
              </HypoField>
              {f.blackoutAssessed === 'yes' && (
                <HypoField label="What cause was identified?">
                  <HypoTextInput value={f.blackoutDx} onChange={set('blackoutDx')} placeholder="Cause identified (optional)" />
                </HypoField>
              )}
              {f.blackoutCount && f.blackoutLastDate && (
                <HypoOutputBox text={parseInt(f.blackoutCount) === 1
                  ? `Only one black-out episode on ${new Date(f.blackoutLastDate).toLocaleDateString('en-IN')}`
                  : `Multiple episodes of black-outs (${f.blackoutCount}) with last one on ${new Date(f.blackoutLastDate).toLocaleDateString('en-IN')}`} />
              )}
              <div style={{ fontSize: 12, fontWeight: 600, margin: '16px 0 8px', color: 'var(--text-secondary)' }}>
                Recommended investigations for this symptom
              </div>
              <HypoInvestigationPicker tests={['cbc', 'fbs', 'ppbs']} rows={[['cbc'], ['fbs', 'ppbs']]} f={f} set={set} patientId={patientId} episodeId={episodeId} />
            </HypoSubBlock>
          )}
        </>
      );

      case 'F21': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you experienced any hearing difficulties or ringing in the ears?</div>
          <HypoRadioGroup value={f.hearing} onChange={set('hearing')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.hearing === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type (select all that apply)">
                <HypoMultiSelect value={f.hearingTypes || []} onChange={set('hearingTypes')} options={[
                  ['reduced', 'Reduced hearing'], ['tinnitus', 'Tinnitus (ringing)'],
                ]} />
              </HypoField>
              {(f.hearingTypes || []).includes('reduced') && (
                <HypoDurationPicker minDate={f.dob} value={f.hearingReducedDuration} onChange={set('hearingReducedDuration')} label="Reduced hearing — since when" />
              )}
              {(f.hearingTypes || []).includes('tinnitus') && (
                <HypoDurationPicker minDate={f.dob} value={f.hearingTinnitusDuration} onChange={set('hearingTinnitusDuration')} label="Tinnitus — since when" />
              )}
              {(f.hearingTypes || []).length > 0 && (
                <HypoOutputBox text={[
                  (f.hearingTypes || []).includes('reduced') ? `Reduced hearing ${formatDuration(f.hearingReducedDuration)}` : '',
                  (f.hearingTypes || []).includes('tinnitus') ? `Tinnitus ${formatDuration(f.hearingTinnitusDuration)}` : '',
                ].filter(Boolean).join('. ')} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      case 'F22': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Do you have delayed or sluggish reflexes?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>(Noticed by yourself or pointed out by a doctor)</div>
          <HypoRadioGroup value={f.reflexes} onChange={set('reflexes')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.reflexes === 'yes' && (
            <HypoSubBlock>
              <HypoDurationPicker minDate={f.dob} value={f.reflexesDuration} onChange={set('reflexesDuration')} label="Since when" />
              <HypoOutputBox text={`Sluggishness of reflexes ${formatDuration(f.reflexesDuration)}`} />
            </HypoSubBlock>
          )}
        </>
      );

      case 'F23': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Do you have any of the following in your wrists or hands?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>(Carpal tunnel symptoms)</div>
          {[['pain', 'Pain'], ['numbness', 'Numbness'], ['tingling', 'Tingling']].map(([type, label]) => (
            <div key={type} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 500, minWidth: 90 }}>{label}</div>
                <HypoRadioGroup value={(f.carpalItems || {})[type]?.status || ''}
                  onChange={v => set('carpalItems')({ ...(f.carpalItems || {}), [type]: { ...(f.carpalItems?.[type] || {}), status: v } })}
                  options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} horizontal noMargin />
              </div>
              {(f.carpalItems || {})[type]?.status === 'yes' && (
                <HypoSubBlock>
                  <HypoField label="Which hand">
                    <HypoRadioGroup value={(f.carpalItems || {})[type]?.side || ''}
                      onChange={v => set('carpalItems')({ ...(f.carpalItems || {}), [type]: { ...(f.carpalItems?.[type] || {}), side: v } })}
                      horizontal options={[['right', 'Right'], ['left', 'Left'], ['both', 'Both']]} />
                  </HypoField>
                  <HypoDurationPicker minDate={f.dob} value={(f.carpalItems || {})[type]?.duration || {}}
                    onChange={v => set('carpalItems')({ ...(f.carpalItems || {}), [type]: { ...(f.carpalItems?.[type] || {}), duration: v } })}
                    label="" />
                </HypoSubBlock>
              )}
            </div>
          ))}
          {['numbness', 'tingling'].some(t => (f.carpalItems || {})[t]?.status === 'yes') && (
            <HypoInvestigationPicker tests={['cbc', 'vitB12']} rows={[['cbc', 'vitB12']]} f={f} set={set} patientId={patientId} episodeId={episodeId} />
          )}
          {Object.entries(f.carpalItems || {}).filter(([, v]) => v?.status === 'yes').length > 0 && (
            <HypoOutputBox text={Object.entries(f.carpalItems || {}).filter(([, v]) => v?.status === 'yes')
              .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} in ${v.side || '?'} wrist ${formatDuration(v.duration)}`).join('. ')} />
          )}
        </>
      );

      case 'F24': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Have you noticed any swelling or enlargement of your tongue?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>(Macroglossia)</div>
          <HypoRadioGroup value={f.macroglossia} onChange={set('macroglossia')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.macroglossia === 'yes' && (
            <HypoSubBlock>
              <HypoDurationPicker minDate={f.dob} value={f.macroglossiaDuration} onChange={set('macroglossiaDuration')} label="Since when" />
              <HypoOutputBox text={`Enlargement of tongue ${formatDuration(f.macroglossiaDuration)}`} />
            </HypoSubBlock>
          )}
          {f.macroglossia === 'no' && <HypoOutputBox text="No enlargement of tongue" />}
        </>
      );

      // ── F25: Acidity / retrosternal chest burn ──
      case 'F25': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Do you experience acidity or a burning sensation behind your chest (retrosternal burn)?</div>
          <HypoRadioGroup value={f.acidity} onChange={set('acidity')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.acidity === 'yes' && (
            <HypoSubBlock>
              <HypoDurationPicker minDate={f.dob} value={f.acidityDuration} onChange={set('acidityDuration')} label="Since when" />
              <HypoField label="Taking any medication for this?">
                <HypoRadioGroup value={f.acidityOnMed} onChange={v => {
                  set('acidityOnMed')(v);
                  if (v === 'yes' && !f.acidityMedName) {
                    setF(p => ({ ...p, acidityMedName: 'Pantoprazole', acidityMedDose: '40', acidityMedFreq: '1' }));
                  }
                }} horizontal options={[['no','No'],['unsure','Unsure'],['yes','Yes']]} />
              </HypoField>
              {f.acidityOnMed === 'yes' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <HypoField label="Medicine name"><HypoTextInput value={f.acidityMedName} onChange={set('acidityMedName')} placeholder="e.g. Pantoprazole" /></HypoField>
                  <HypoField label="Dose (mg)"><HypoTextInput type="number" min="0" value={f.acidityMedDose} onChange={set('acidityMedDose')} /></HypoField>
                  <HypoField label="Times per day"><HypoTextInput type="number" min="1" max="4" value={f.acidityMedFreq} onChange={set('acidityMedFreq')} /></HypoField>
                </div>
              )}
              {f.acidityOnMed === 'yes' && (
                <HypoDurationPicker minDate={f.dob} value={f.acidityMedSince} onChange={set('acidityMedSince')} label="Taking medication since" />
              )}
              <HypoOutputBox text={`Acidity / retrosternal burn ${formatDuration(f.acidityDuration)}${f.acidityOnMed === 'yes' && f.acidityMedName ? `. On Tab. ${f.acidityMedName}${f.acidityMedDose ? ` (${f.acidityMedDose} mg)` : ''}${f.acidityMedFreq ? ` — ${f.acidityMedFreq} times a day` : ''}.` : ''}`} />
            </HypoSubBlock>
          )}
        </>
      );

      // ── H1: Dyslipidaemia ──
      case 'H1': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you been diagnosed with high cholesterol or dyslipidaemia?</div>
          <HypoRadioGroup value={f.dyslipidaemia} onChange={set('dyslipidaemia')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.dyslipidaemia === 'yes' && (
            <HypoSubBlock>
              <HypoDurationPicker minDate={f.dob} value={f.dyslipidaemiaDuration} onChange={set('dyslipidaemiaDuration')} label="Since when" />
              <HypoField label="On medication to control cholesterol?">
                <HypoRadioGroup value={f.dyslipidaemiaOnMed} onChange={set('dyslipidaemiaOnMed')} horizontal options={[['no','No'],['unsure','Unsure'],['yes','Yes']]} />
              </HypoField>
              {f.dyslipidaemiaOnMed === 'yes' && (
                <HypoMedList field="dyslipidaemiaMeds" f={f} set={set} namePlaceholder="e.g. Atorvastatin"
                  defaultEntry={{ name: 'Atorvastatin', dose: '10', freq: '1' }} />
              )}
              <HypoOutputBox text={f.dyslipidaemia === 'yes' ? `Dyslipidaemia / Hypercholesterolaemia ${formatDuration(f.dyslipidaemiaDuration)}${f.dyslipidaemiaOnMed === 'yes' && f.dyslipidaemiaMeds?.length ? `. On ${formatMedList(f.dyslipidaemiaMeds)}.` : ''}` : ''} />
            </HypoSubBlock>
          )}
        </>
      );

      // ── H2: Anaemia ──
      case 'H2': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you been diagnosed with anaemia?</div>
          <HypoRadioGroup value={f.anaemia} onChange={set('anaemia')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.anaemia === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type if known (select all that apply)">
                <HypoCheckPillGrid perRow={2} value={f.anaemiaTypes || []} onChange={set('anaemiaTypes')} options={[
                  ['iron_deficiency', 'Iron deficiency'],
                  ['b12_deficiency', 'Vitamin B12 deficiency'],
                  ['folate_deficiency', 'Folate deficiency'],
                  ['other', 'Other'],
                  ['not_known', 'Not known'],
                ]} />
              </HypoField>
              <HypoField label="On medication?">
                <HypoRadioGroup value={f.anaemiaOnMed} onChange={set('anaemiaOnMed')} horizontal options={[['no','No'],['unsure','Unsure'],['yes','Yes']]} />
              </HypoField>
              {f.anaemiaOnMed === 'yes' && (
                <HypoMedList field="anaemiaMeds" f={f} set={set} namePlaceholder="e.g. Autrin, Folvite"
                  defaultEntries={(f.anaemiaTypes || []).map(t =>
                    t === 'b12_deficiency' ? { name: 'Methylcobalamin', dose: '500', freq: '1' } :
                    t === 'folate_deficiency' ? { name: 'Folvite', dose: '5', freq: '1' } :
                    t === 'iron_deficiency' ? { name: 'Autrin', dose: '300', freq: '1' } :
                    null
                  ).filter(Boolean)} />
              )}
              <HypoOutputBox text={(f.anaemiaTypes || []).length ? `K/c/o ${f.anaemiaTypes.map(t => t.replace(/_/g,' ')).join(' + ')} anaemia${f.anaemiaOnMed === 'yes' && f.anaemiaMeds?.length ? `. On ${formatMedList(f.anaemiaMeds)}.` : ''}` : ''} />
            </HypoSubBlock>
          )}
        </>
      );

      // ── H3: Diabetes ──
      case 'H3': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you been diagnosed with diabetes or high blood sugar?</div>
          <HypoRadioGroup value={f.diabetes} onChange={set('diabetes')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.diabetes === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[
                    ['type1', 'Type 1 diabetes'], ['type2', 'Type 2 diabetes'],
                    ['pre_diabetes', 'Pre-diabetes'], ['not_specified', 'Not specified'],
                  ].map(([val, label]) => (
                    <div key={val} onClick={() => set('diabetesType')(val)} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                      border: `1.5px solid ${f.diabetesType === val ? 'var(--teal-400)' : 'var(--border)'}`,
                      background: f.diabetesType === val ? 'var(--teal-50)' : 'var(--surface)',
                      color: f.diabetesType === val ? 'var(--teal-700)' : 'var(--text-primary)',
                      fontSize: 13, minHeight: 40, boxSizing: 'border-box',
                    }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                        border: `1.5px solid ${f.diabetesType === val ? 'var(--teal-500)' : 'var(--border-md)'}`,
                        background: f.diabetesType === val ? 'var(--teal-500)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {f.diabetesType === val && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      {label}
                    </div>
                  ))}
                </div>
              </HypoField>
              <HypoDurationPicker minDate={f.dob} value={f.diabetesDuration} onChange={set('diabetesDuration')} label="Since when" />
              <HypoField label="On medication?">
                <HypoRadioGroup value={f.diabetesOnMed} onChange={set('diabetesOnMed')} horizontal options={[['no','No'],['unsure','Unsure'],['yes','Yes']]} />
              </HypoField>
              {f.diabetesOnMed === 'yes' && (
                <HypoMedList field="diabetesMeds" f={f} set={set} namePlaceholder="e.g. Metformin" />
              )}
              <HypoOutputBox text={f.diabetesType ? `K/c/o ${f.diabetesType.replace(/_/g,' ')} ${formatDuration(f.diabetesDuration)}${f.diabetesOnMed === 'yes' && f.diabetesMeds?.length ? `. On ${formatMedList(f.diabetesMeds)}.` : ''}` : ''} />
            </HypoSubBlock>
          )}
        </>
      );

      // ── H4: PCOS/PMOS (female only) ──
      case 'H4': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you been diagnosed with PCOS or PMOS?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>Polycystic Ovarian Syndrome (PCOS) / Polyendocrine Metabolic Ovarian Syndrome (PMOS)</div>
          <HypoRadioGroup value={f.pcosPmos} onChange={set('pcosPmos')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.pcosPmos === 'yes' && (
            <HypoSubBlock>
              <HypoDurationPicker minDate={f.dob} value={f.pcosDuration} onChange={set('pcosDuration')} label="Since when" />
              <HypoField label="Are you taking any medicines for this?">
                <HypoRadioGroup value={f.pcosOnMed} onChange={set('pcosOnMed')} horizontal
                  options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
              </HypoField>
              {f.pcosOnMed === 'yes' && (
                <HypoMedList field="pcosMeds" f={f} set={set} namePlaceholder="e.g. Metformin" />
              )}
              {f.pcosDuration && (f.pcosDuration.date || f.pcosDuration.years || f.pcosDuration.months) && (
                <HypoOutputBox text={`K/c/o PCOS/PMOS ${formatDuration(f.pcosDuration)}${
                  f.pcosOnMed === 'yes' && f.pcosMeds?.length ? `, on ${formatMedList(f.pcosMeds)}` : ''
                }`} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      // ── H5: Infertility (female only; gated) ──
      case 'H5': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you experienced any difficulty conceiving? (Infertility)</div>
          <HypoRadioGroup value={f.infertility} onChange={set('infertility')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          <HypoOutputBox text={f.infertility === 'yes' ? 'Difficulty in conceiving reported' : f.infertility === 'no' ? 'No difficulty in conceiving' : ''} />
        </>
      );

      // ── H6: Hypertension ──
      case 'H6': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you been diagnosed with hypertension (high blood pressure)?</div>
          <HypoRadioGroup value={f.htn} onChange={set('htn')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.htn === 'yes' && (
            <HypoSubBlock>
              <HypoDurationPicker minDate={f.dob} value={f.htnDuration} onChange={set('htnDuration')} label="Since when" />
              <HypoField label="On medication for blood pressure?">
                <HypoRadioGroup value={f.htnOnMed} onChange={set('htnOnMed')} horizontal options={[['no','No'],['unsure','Unsure'],['yes','Yes']]} />
              </HypoField>
              {f.htnOnMed === 'yes' && (
                <HypoMedList field="htnMeds" f={f} set={set} namePlaceholder="e.g. Amlodipine, Telmisartan"
                  defaultEntry={{ name: 'Amlodipine', dose: '5', freq: '1' }} />
              )}
              <HypoOutputBox text={f.htn === 'yes' ? `Hypertension ${formatDuration(f.htnDuration)}${f.htnOnMed === 'yes' && f.htnMeds?.length ? `. On ${formatMedList(f.htnMeds)}.` : ''}` : ''} />
            </HypoSubBlock>
          )}
        </>
      );

      // ── H7: Osteoporosis / osteopenia ──
      case 'H7': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you been diagnosed with osteoporosis or osteopenia (low bone density)?</div>
          <HypoRadioGroup value={f.osteoporosis} onChange={set('osteoporosis')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.osteoporosis === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Confirmed by DEXA scan?">
                <HypoRadioGroup value={f.osteoporosisDEXA} onChange={set('osteoporosisDEXA')} horizontal options={[['no','No'],['yes','Yes'],['not_done','Not done']]} />
              </HypoField>
              <HypoField label="On bone-protection medication?">
                <HypoRadioGroup value={f.osteoporosisOnMed} onChange={v => {
                  set('osteoporosisOnMed')(v);
                  if (v === 'yes' && !f.osteoporosisMedName) {
                    setF(p => ({ ...p, osteoporosisMedName: 'Alendronate', osteoporosisMedDose: '70', osteoporosisMedTimes: '1' }));
                  }
                }} horizontal options={[['no','No'],['unsure','Unsure'],['yes','Yes']]} />
              </HypoField>
              {f.osteoporosisOnMed === 'yes' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <HypoField label="Medicine name"><HypoTextInput value={f.osteoporosisMedName} onChange={set('osteoporosisMedName')} placeholder="e.g. Alendronate, Calcium + Vit D" /></HypoField>
                  <HypoField label="Dose (mg)"><HypoTextInput type="number" value={f.osteoporosisMedDose} onChange={set('osteoporosisMedDose')} /></HypoField>
                  <HypoField label="Times per day"><HypoTextInput type="number" min="1" max="4" value={f.osteoporosisMedTimes} onChange={set('osteoporosisMedTimes')} /></HypoField>
                </div>
              )}
              {f.osteoporosisOnMed === 'yes' && (
                <HypoDurationPicker minDate={f.dob} value={f.osteoporosisMedSince} onChange={set('osteoporosisMedSince')} label="Taking medication since" />
              )}
              <HypoOutputBox text={`K/c/o Osteoporosis${f.osteoporosisDEXA === 'yes' ? ' — DEXA confirmed' : ''}${f.osteoporosisOnMed === 'yes' ? `. On bone-protection medication${f.osteoporosisMedName ? ': ' + f.osteoporosisMedName : ''}.` : ''}`} />
            </HypoSubBlock>
          )}
        </>
      );

      // ── H8: Family history — non-thyroid cancers & MEN syndromes ──
      case 'H8': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Is there a family history of cancer or endocrine tumours (other than thyroid disease)?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>e.g. MEN syndromes, parathyroid, pituitary, adrenal tumours, or other cancers</div>
          <HypoRadioGroup value={f.familyCancer} onChange={set('familyCancer')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.familyCancer === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type (select all that apply)">
                <HypoCheckPillGrid perRow={2} value={f.familyCancerTypes} onChange={set('familyCancerTypes')} options={[
                  ['men1', 'MEN1 (Multiple Endocrine Neoplasia type 1)'],
                  ['men2a', 'MEN2A (Multiple Endocrine Neoplasia type 2A)'],
                  ['men2b', 'MEN2B (Multiple Endocrine Neoplasia type 2B)'],
                  ['familial_nmtc', 'Familial non-medullary thyroid cancer (FNMTC)'],
                  ['parathyroid', 'Parathyroid tumour'],
                  ['pituitary', 'Pituitary tumour'],
                  ['adrenal', 'Adrenal tumour / Phaeochromocytoma'],
                  ['other_cancer', 'Other cancer'],
                ]} />
              </HypoField>
              <HypoField label="Which relative?"><HypoTextInput value={f.familyCancerRelative} onChange={set('familyCancerRelative')} placeholder="e.g. Mother, Maternal uncle" /></HypoField>
              <HypoOutputBox text={f.familyCancerTypes?.length ? `Family history: ${f.familyCancerTypes.map(t => t.replace(/_/g,' ')).join(', ')} — ${f.familyCancerRelative || 'relative not specified'}` : ''} />
            </HypoSubBlock>
          )}
        </>
      );

      // ── H9: Additional notes ──
      case 'H9': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Is there anything else about your thyroid condition or symptoms that you would like your doctor to know?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>This is optional</div>
          <textarea className="form-input" rows={5} style={{ resize: 'vertical', fontSize: 13 }}
            value={f.additionalNotes} onChange={e => set('additionalNotes')(e.target.value)}
            placeholder="Type anything additional here..." />
          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 20, marginBottom: 6 }}>Want to add any more reports, images, or documents?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Anything not covered by the questions above — old reports, discharge summaries, referral letters, etc.</div>
          <AdditionalDocumentsUploader patientId={patientId} episodeId={episodeId} category="other" />
        </>
      );

      default: return <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Screen {page?.id}</div>;
    }
  };

  if (!page) return null;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {draftLoadError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{draftLoadError}</span>
          <button onClick={loadDraft} className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>Retry</button>
        </div>
      )}
      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
          <span>{progress}% complete</span>
        </div>
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 4 }}>
          <div style={{ height: 4, background: 'var(--teal-400)', borderRadius: 4, width: `${progress}%`, transition: 'width .3s' }} />
        </div>
      </div>

      {/* Module badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 12,
          background: mc.bg, color: mc.text, border: `1px solid ${mc.border}` }}>
          {page.id}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{page.title}</span>
      </div>

      {/* Page content */}
      <div ref={pageContentRef} style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        {error && <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'var(--red-700)' }}>{error}</div>}
        {renderPage()}
        <HypoMissingPointer containerRef={pageContentRef} pageKey={page?.id}
          active={reviewMode && incompleteList.some(({ idx }) => idx === currentPage)} />
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: incompleteList.length > 0 ? 60 : 0 }}>
        <button className="btn btn-secondary" onClick={goPrev}>
          ← {currentPage === 0 ? 'Back' : 'Previous'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {lastSavedAt && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>✓ Saved</span>
          )}
          <button className="btn btn-primary" onClick={goNext} disabled={saving || yearInvalid}>
            {currentPage === totalPages - 1
              ? saving ? <Spinner size={14} color="#fff" /> : 'Submit questionnaire ✓'
              : reviewMode ? 'Next unanswered →' : 'Next →'}
          </button>
        </div>
      </div>

      {/* Item 3: fixed bottom strip listing every unanswered question —
          appears once Submit has been clicked and something's missing,
          disappears once everything's fixed (fully derived from
          incompleteList, so it reappears automatically if Submit is
          clicked again and something's still missing). */}
      {incompleteList.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
          background: '#fff', borderTop: '2px solid var(--red-300, #e6a3a3)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.10)', padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red-700, #a83232)', marginRight: 4 }}>
            {incompleteList.length} unanswered — jump to:
          </span>
          {incompleteList.map(({ p, idx }) => (
            <button key={p.id} onClick={() => { setError(''); setCurrentPage(idx); }}
              title={p.title}
              style={{
                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${idx === currentPage ? 'var(--teal-500)' : 'var(--red-300, #e6a3a3)'}`,
                background: idx === currentPage ? 'var(--teal-50)' : '#fff',
                color: idx === currentPage ? 'var(--teal-700)' : 'var(--red-700, #a83232)',
              }}>
              Q{idx + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Reusable standard symptom screen ────────────────────
const HypoSymptomScreen = ({ question, statusKey, durationKey, f, set, extra, output }) => (
  <>
    <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{question}</div>
    <HypoRadioGroup value={f[statusKey]} onChange={set(statusKey)}
      options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
    {f[statusKey] === 'yes' && (
      <HypoSubBlock>
        <HypoDurationPicker minDate={f.dob} value={f[durationKey]} onChange={set(durationKey)} label="Since when" />
        {extra}
        {output && <HypoOutputBox text={output} />}
      </HypoSubBlock>
    )}
  </>
);

// ─── Reusable lab screen ──────────────────────────────────
const HypoLabScreen = ({ patientId, episodeId, label, field, unit, unitOptions, f, set, reportKey, output }) => {
  const done = f[`${field}Done`];

  const handleExtract = (extracted) => {
    if (extracted.value != null) set(`${field}Value`)(extracted.value);
    if (extracted.unit != null && unitOptions) set(`${field}Unit`)(extracted.unit);
    if (extracted.date != null) set(`${field}Date`)(extracted.date);
    if (extracted.refLow != null) set(`${field}RefLow`)(extracted.refLow);
    if (extracted.refHigh != null) set(`${field}RefHigh`)(extracted.refHigh);
    if (extracted.labName != null) set(`${field}Lab`)(extracted.labName);
  };

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you had a {label} test done?</div>
      <HypoRadioGroup value={done} onChange={set(`${field}Done`)}
        options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
      {done === 'yes' && (
        <HypoSubBlock>
          <LabReportUpload
            patientId={patientId} episodeId={episodeId} fieldLabel={label}
            category="blood_report"
            reports={f[reportKey] || []}
            onReportsChange={set(reportKey)}
            onExtract={handleExtract}
          />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: 10 }}>— or enter manually —</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <HypoField label={`${label} value`}>
              <HypoTextInput type="number" min="0" step="0.01" value={f[`${field}Value`]} onChange={set(`${field}Value`)} />
            </HypoField>
            <HypoField label="Unit">
              {unitOptions
                ? <select className="form-input" style={{ fontSize: 12 }} value={f[`${field}Unit`] || ''} onChange={e => set(`${field}Unit`)(e.target.value)}>
                    <option value="">Select</option>
                    {unitOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                : <div className="form-input" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{unit}</div>
              }
            </HypoField>
            <HypoField label="Date of test">
              <HypoDateInput value={f[`${field}Date`]} onChange={set(`${field}Date`)} />
            </HypoField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <HypoField label="Ref range — Low"><HypoTextInput type="number" step="0.01" value={f[`${field}RefLow`]} onChange={set(`${field}RefLow`)} /></HypoField>
            <HypoField label="Ref range — High"><HypoTextInput type="number" step="0.01" value={f[`${field}RefHigh`]} onChange={set(`${field}RefHigh`)} /></HypoField>
          </div>
          <HypoField label="Laboratory name">
            <HypoTextInput value={f[`${field}Lab`] || ''} onChange={set(`${field}Lab`)} placeholder="Lab name (auto-filled from report)" />
          </HypoField>
          {f[`${field}Reports`]?.length > 1 && (
            <div style={{ fontSize: 11, color: 'var(--blue-600)', background: 'var(--blue-50)', borderRadius: 6, padding: '5px 10px', marginTop: 6 }}>
              Multiple reports from same lab → line graph will be shown automatically
            </div>
          )}
          {output && <HypoOutputBox text={output} />}
        </HypoSubBlock>
      )}
    </>
  );
};

// ─── CBC panel — click a component to expand its value/unit/ref-range fields ───
const CBC_SIMPLE_COMPONENTS = [
  ['haemoglobin', 'Haemoglobin', 'g/dL'],
  ['rbcCount', 'RBC count', 'million/µL'],
  ['haematocrit', 'Haematocrit (PCV)', '%'],
  ['mcv', 'MCV', 'fL'],
  ['mch', 'MCH', 'pg'],
  ['mchc', 'MCHC', 'g/dL'],
  ['rdw', 'RDW', '%'],
  ['wbcTotal', 'WBC (total count)', 'cells/µL'],
  ['plateletCount', 'Platelet count', 'lakh/µL'],
];
const CBC_DIFF_COMPONENTS = [
  ['diffNeutrophils', 'Neutrophils'],
  ['diffLymphocytes', 'Lymphocytes'],
  ['diffMonocytes', 'Monocytes'],
  ['diffEosinophils', 'Eosinophils'],
  ['diffBasophils', 'Basophils'],
];

const HypoCbcPanel = ({ f, set, patientId, episodeId }) => {
  const cbc = f.cbcValues || {};
  const setComponent = (key, patch) => set('cbcValues')({ ...cbc, [key]: { ...(cbc[key] || {}), ...patch } });

  return (
    <HypoSubBlock>
      <LabReportUpload
        patientId={patientId} episodeId={episodeId} fieldLabel="CBC"
        category="blood_report"
        reports={f.cbcReports || []}
        onReportsChange={set('cbcReports')}
        onExtract={(extracted) => {
          // Auto-fill maps whatever the extraction service recognizes onto
          // the matching component; anything it can't identify is left for
          // manual entry below.
          if (extracted.cbc) {
            set('cbcValues')({ ...cbc, ...extracted.cbc });
          }
          if (extracted.date != null) set('cbcDate')(extracted.date);
        }}
      />
      <HypoField label="Date of test"><HypoDateInput value={f.cbcDate} onChange={set('cbcDate')} /></HypoField>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '10px 0 6px' }}>All CBC components — enter what you have, leave the rest blank:</div>

      {CBC_SIMPLE_COMPONENTS.map(([key, label, defaultUnit]) => {
        const v = cbc[key] || {};
        return (
          <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              <HypoField label="Value"><HypoTextInput type="number" step="0.01" value={v.value} onChange={val => setComponent(key, { value: val })} /></HypoField>
              <HypoField label="Unit"><HypoTextInput value={v.unit || ''} onChange={val => setComponent(key, { unit: val })} placeholder={defaultUnit} /></HypoField>
              <HypoField label="Ref low"><HypoTextInput type="number" step="0.01" value={v.refLow} onChange={val => setComponent(key, { refLow: val })} /></HypoField>
              <HypoField label="Ref high"><HypoTextInput type="number" step="0.01" value={v.refHigh} onChange={val => setComponent(key, { refHigh: val })} /></HypoField>
            </div>
          </div>
        );
      })}

      <div style={{ fontSize: 12, fontWeight: 600, margin: '14px 0 6px', color: 'var(--text-secondary)' }}>WBC Differential</div>
      {CBC_DIFF_COMPONENTS.map(([key, label]) => {
        const v = cbc[key] || {};
        return (
          <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <HypoField label="Percentage (%)"><HypoTextInput type="number" step="0.1" value={v.pctValue} onChange={val => setComponent(key, { pctValue: val })} /></HypoField>
              <HypoField label="Ref low (%)"><HypoTextInput type="number" step="0.1" value={v.pctRefLow} onChange={val => setComponent(key, { pctRefLow: val })} /></HypoField>
              <HypoField label="Ref high (%)"><HypoTextInput type="number" step="0.1" value={v.pctRefHigh} onChange={val => setComponent(key, { pctRefHigh: val })} /></HypoField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              <HypoField label="Absolute count"><HypoTextInput type="number" step="1" value={v.countValue} onChange={val => setComponent(key, { countValue: val })} /></HypoField>
              <HypoField label="Unit"><HypoTextInput value={v.countUnit || ''} onChange={val => setComponent(key, { countUnit: val })} placeholder="cells/µL" /></HypoField>
              <HypoField label="Ref low"><HypoTextInput type="number" step="1" value={v.countRefLow} onChange={val => setComponent(key, { countRefLow: val })} /></HypoField>
              <HypoField label="Ref high"><HypoTextInput type="number" step="1" value={v.countRefHigh} onChange={val => setComponent(key, { countRefHigh: val })} /></HypoField>
            </div>
          </div>
        );
      })}
    </HypoSubBlock>
  );
};

// ─── Reusable inline single-value lab box — used both at its own D-module
// screen (TSH/T3/etc still work that way) and embedded directly inside a
// triggering symptom screen (F1/F13/F14/F19/F20/F23). Reads/writes the
// SAME shared f.<field>* state either way, so a value entered once shows
// up pre-filled everywhere else it's needed — no separate copies. ───
const HypoInlineLab = ({ label, field, f, set, unit }) => {
  const val = f[`${field}Value`];
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8 }}>
        <HypoField label="Value"><HypoTextInput type="number" step="0.01" value={val} onChange={set(`${field}Value`)} /></HypoField>
        <HypoField label="Unit"><HypoTextInput value={f[`${field}Unit`] || ''} onChange={set(`${field}Unit`)} placeholder={unit} /></HypoField>
        <HypoField label="Date"><HypoDateInput value={f[`${field}Date`]} onChange={set(`${field}Date`)} /></HypoField>
        <HypoField label="Ref low"><HypoTextInput type="number" step="0.01" value={f[`${field}RefLow`]} onChange={set(`${field}RefLow`)} /></HypoField>
        <HypoField label="Ref high"><HypoTextInput type="number" step="0.01" value={f[`${field}RefHigh`]} onChange={set(`${field}RefHigh`)} /></HypoField>
      </div>
    </div>
  );
};

// ─── Repeatable medicine list ("+ Add another medicine") — used by the
// 5 comorbidity screens (Dyslipidaemia, Anaemia, Diabetes, PCOS/PMOS,
// Hypertension). Mirrors the existing RAI repeatable-entry pattern. ───
const HypoMedList = ({ field, f, set, dosePlaceholder = 'e.g. 500', namePlaceholder = 'Medicine name', defaultEntry = null, defaultEntries = null }) => {
  const list = f[field] || [];
  const update = (i, patch) => set(field)(list.map((e, j) => j === i ? { ...e, ...patch } : e));
  const remove = (i) => set(field)(list.filter((_, j) => j !== i));
  const add = () => {
    if (list.length === 0 && defaultEntries && defaultEntries.length) {
      set(field)(defaultEntries.map(e => ({ ...e, since: {} })));
      return;
    }
    set(field)([...list, list.length === 0 && defaultEntry ? { ...defaultEntry, since: {} } : { name: '', dose: '', freq: '', since: {} }]);
  };

  return (
    <div style={{ marginBottom: 8 }}>
      {list.map((entry, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Medicine {i + 1}</div>
            <button type="button" onClick={() => remove(i)}
              style={{ background: 'none', border: 'none', color: 'var(--red-500)', cursor: 'pointer', fontSize: 12 }}>
              Remove
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <HypoField label="Medicine name">
              <HypoTextInput value={entry.name} onChange={v => update(i, { name: v })} placeholder={namePlaceholder} />
            </HypoField>
            <HypoField label="Dose (mg/mcg)">
              <HypoTextInput type="number" min="0" value={entry.dose} onChange={v => update(i, { dose: v })} placeholder={dosePlaceholder} />
            </HypoField>
            <HypoField label="Times per day">
              <HypoTextInput type="number" min="1" max="6" value={entry.freq} onChange={v => update(i, { freq: v })} />
            </HypoField>
          </div>
          <HypoDurationPicker minDate={f.dob} value={entry.since || {}} onChange={v => update(i, { since: v })} label="Taking since" />
        </div>
      ))}
      <button type="button" onClick={add}
        style={{ fontSize: 13, color: 'var(--teal-600)', background: 'none', border: '1px dashed var(--teal-300)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
        + Add {list.length ? 'another' : ''} medicine
      </button>
    </div>
  );
};

const HypoInvestigationPicker = ({ tests, rows, f, set, patientId, episodeId }) => {
  const META = {
    cbc:       { label: 'CBC (Complete Blood Count)' },
    vitB12:    { label: 'Vitamin B12' },
    vitD3:     { label: 'Vitamin D3 (25-OH)' },
    srCalcium: { label: 'Serum Calcium' },
    fbs:       { label: 'Blood Sugar — Fasting' },
    ppbs:      { label: 'Blood Sugar — Post-Prandial' },
  };
  const chosen = f.investigationsSelected || {};
  // Checked if clicked this session OR a value was already saved for it
  // (covers resuming a draft without needing a separate DB column).
  const isChecked = (key) => !!chosen[key] || (key === 'cbc'
    ? Object.values(f.cbcValues || {}).some(v => v?.value)
    : !!f[`${key}Value`]);
  const toggle = (key) => set('investigationsSelected')({ ...chosen, [key]: !isChecked(key) });
  // rows lets callers control exactly which tests land on which row
  // (e.g. CBC + Vit B12 on row 1, Vit D3 + Sr Calcium on row 2) instead
  // of everything free-flowing in one wrapped row.
  const rowGroups = rows || [tests];

  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, margin: '16px 0 8px', color: 'var(--text-secondary)' }}>
        Recommended investigations for this symptom — select tests done
      </div>
      {rowGroups.map((rowKeys, ri) => (
        <div key={ri} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {rowKeys.map(key => {
            const sel = isChecked(key);
            return (
              <div key={key} onClick={() => toggle(key)} style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                padding: '8px 14px', borderRadius: 8, flex: '1 1 0',
                border: `1.5px solid ${sel ? 'var(--teal-400)' : 'var(--border)'}`,
                background: sel ? 'var(--teal-50)' : 'var(--surface)',
                color: sel ? 'var(--teal-700)' : 'var(--text-primary)',
                fontSize: 13, minHeight: HYPO_OPTION_MIN_HEIGHT, boxSizing: 'border-box',
              }}>
                <div style={{
                  width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                  border: `1.5px solid ${sel ? 'var(--teal-500)' : 'var(--border-md)'}`,
                  background: sel ? 'var(--teal-500)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff',
                }}>{sel && '✓'}</div>
                {META[key].label}
              </div>
            );
          })}
        </div>
      ))}
      {tests.includes('cbc') && isChecked('cbc') && <HypoCbcPanel f={f} set={set} patientId={patientId} episodeId={episodeId} />}
      {tests.includes('vitB12') && isChecked('vitB12') && <HypoInlineLab label="Vitamin B12" field="vitB12" unit="pg/mL" f={f} set={set} />}
      {tests.includes('vitD3') && isChecked('vitD3') && <HypoInlineLab label="Vitamin D3 (25-OH)" field="vitD3" unit="ng/mL" f={f} set={set} />}
      {tests.includes('srCalcium') && isChecked('srCalcium') && <HypoInlineLab label="Serum Calcium" field="srCalcium" unit="mg/dL" f={f} set={set} />}
      {tests.includes('fbs') && isChecked('fbs') && <HypoInlineLab label="Blood Sugar — Fasting" field="fbs" unit="mg/dL" f={f} set={set} />}
      {tests.includes('ppbs') && isChecked('ppbs') && <HypoInlineLab label="Blood Sugar — Post-Prandial" field="ppbs" unit="mg/dL" f={f} set={set} />}
    </>
  );
};

// ─── DB mapping helpers ───────────────────────────────────
function mapFormToDb(f) {
  // ── CBC panel: value/unit/ref_low/ref_high per component, shared date+status ──
  const cbc = f.cbcValues || {};
  const cbcSimple = (key) => ({
    value: cbc[key]?.value ?? null,
    unit: cbc[key]?.unit ?? null,
    ref_low: cbc[key]?.refLow ?? null,
    ref_high: cbc[key]?.refHigh ?? null,
  });
  const cbcDiff = (key) => ({
    pct_value: cbc[key]?.pctValue ?? null,
    pct_ref_low: cbc[key]?.pctRefLow ?? null,
    pct_ref_high: cbc[key]?.pctRefHigh ?? null,
    count_value: cbc[key]?.countValue ?? null,
    count_unit: cbc[key]?.countUnit ?? null,
    count_ref_low: cbc[key]?.countRefLow ?? null,
    count_ref_high: cbc[key]?.countRefHigh ?? null,
  });
  const hb = cbcSimple('haemoglobin'), rbc = cbcSimple('rbcCount'), hct = cbcSimple('haematocrit'),
    mcv = cbcSimple('mcv'), mch = cbcSimple('mch'), mchc = cbcSimple('mchc'), rdw = cbcSimple('rdw'),
    wbc = cbcSimple('wbcTotal'), plt = cbcSimple('plateletCount');
  const neut = cbcDiff('diffNeutrophils'), lymph = cbcDiff('diffLymphocytes'), mono = cbcDiff('diffMonocytes'),
    eos = cbcDiff('diffEosinophils'), baso = cbcDiff('diffBasophils');

  return {
    // ═══ MODULE A ═══
    marital_status: f.maritalStatus || null,
    occupation: f.occupation || null,
    occupation_other: f.occupationOther || null,

    // ═══ MODULE B (reproductive — was fully dropped before; now wired) ═══
    hysterectomy_status: f.hysterectomy || null,
    hysterectomy_date_precision: f.hysterectomyDate?.date ? 'full' : (f.hysterectomyDate?.years ? 'year_only' : null),
    hysterectomy_date: f.hysterectomyDate?.date || null,
    hysterectomy_year: f.hysterectomyDate?.years || null,
    hysterectomy_month: f.hysterectomyDate?.months || null,
    hysterectomy_reason: f.hysterectomyReason || null,
    hysterectomy_reason_other: f.hysterectomyOther || null,
    menopause_status: f.menopauseStatus || null,
    menopause_years_ago: f.menopauseYears || null,
    menstrual_change_status: f.menstrualChange || null,
    menstrual_pattern: (f.menstrualChangeTypes || []).find(t => ['regular', 'irregular', 'skips_sometimes'].includes(t)) || null,
    menstrual_flow: (f.menstrualChangeTypes || []).filter(t => ['heavy', 'scanty', 'absent', 'prolonged'].includes(t)),
    menstrual_since_date: f.menstrualChangeDuration?.date || null,
    menstrual_years: f.menstrualChangeDuration?.years || null,
    menstrual_months: f.menstrualChangeDuration?.months || null,
    lmp_date: f.lmpDate || null,
    pregnancy_status: f.pregnant || null,
    edd_date: f.pregnant === 'yes' && f.lmpDate ? calcEDD(f.lmpDate) : null,

    // ═══ MODULE C — previously entirely dropped, now wired ═══
    thyroid_dx_status: f.thyroidDx || null,
    thyroid_dx_type: f.thyroidDxType || null,
    thyroid_dx_year: f.thyroidDxYear || null,
    thyroid_surgery_status: f.thyroidSurgery || null,
    thyroid_surgery_type: f.thyroidSurgeryType || null,
    thyroid_surgery_year: f.thyroidSurgeryYear || null,
    // RAI — repeatable, replaces the old single thyroidRaiYear field
    rai_administrations: (f.raiAdministrations || []).length ? f.raiAdministrations : null,
    thyroid_med_status: f.thyroidMed || null,
    thyroid_med_name: f.thyroidMedName || null,
    thyroid_med_brand: f.thyroidMedBrand || null,
    thyroid_med_dose: f.thyroidMedDose || null,
    thyroid_med_timing: f.thyroidMedTiming || null,
    thyroid_med_compliance: f.thyroidMedCompliance || null,
    thyroid_med_since_years: f.thyroidMedSince?.years || null,
    thyroid_med_since_months: f.thyroidMedSince?.months || null,
    liothyronine_brand: f.liothyronineBrand || null,
    liothyronine_name: f.liothyronineName || null,
    liothyronine_dose: f.liothyronineDose || null,
    liothyronine_timing: f.liothyronineTiming || null,
    liothyronine_compliance: f.liothyronineCompliance || null,
    liothyronine_since_years: f.liothyronineSince?.years || null,
    liothyronine_since_months: f.liothyronineSince?.months || null,
    liothyronine_dose_changed_status: f.liothyronineDoseChanged || null,
    liothyronine_dose_changed_date: f.liothyronineDoseChangedDate || null,
    liothyronine_dose_change_reason: f.liothyronineDoseChangedReason || null,
    family_thyroid_status: f.familyThyroid || null,
    family_thyroid_relations: (f.familyThyroidRelatives || []).length ? f.familyThyroidRelatives : null,
    // DB only holds one condition value per episode (pre-existing schema
    // limitation, not something this pass redesigns) — using the first
    // selected relative's condition as the representative value.
    family_thyroid_condition: f.familyThyroidRelatives?.length
      ? (f.familyThyroidConditions || {})[f.familyThyroidRelatives[0]] || null : null,
    autoimmune_status: f.autoimmune || null,
    autoimmune_conditions: Object.entries(f.autoimmuneItems || {}).filter(([, v]) => v?.selected).map(([k]) => k),
    autoimmune_other: (f.autoimmuneItems || {})['Other']?.detail || null,

    // ═══ MODULE D — lab panel ═══
    tsh_status: f.tshDone || null, tsh_value: f.tshValue || null, tsh_unit: f.tshUnit || null,
    tsh_date: f.tshDate || null, tsh_ref_low: f.tshRefLow || null, tsh_ref_high: f.tshRefHigh || null,
    t3_status: f.t3Done || null, t3_value: f.t3Value || null, t3_unit: f.t3Unit || null,
    t3_date: f.t3Date || null, t3_ref_low: f.t3RefLow || null, t3_ref_high: f.t3RefHigh || null,
    ft3_status: f.ft3Done || null, ft3_value: f.ft3Value || null, ft3_unit: f.ft3Unit || null,
    ft3_date: f.ft3Date || null, ft3_ref_low: f.ft3RefLow || null, ft3_ref_high: f.ft3RefHigh || null,
    t4_status: f.t4Done || null, t4_value: f.t4Value || null, t4_unit: f.t4Unit || null,
    t4_date: f.t4Date || null, t4_ref_low: f.t4RefLow || null, t4_ref_high: f.t4RefHigh || null,
    ft4_status: f.ft4Done || null, ft4_value: f.ft4Value || null, ft4_unit: f.ft4Unit || null,
    ft4_date: f.ft4Date || null, ft4_ref_low: f.ft4RefLow || null, ft4_ref_high: f.ft4RefHigh || null,
    antitpo_status: f.antitpoDone || null, antitpo_value: f.antitpoValue || null, antitpo_unit: f.antitpoUnit || null,
    antitpo_date: f.antitpoDate || null, antitpo_ref_low: f.antitpoRefLow || null, antitpo_ref_high: f.antitpoRefHigh || null,
    antitg_status: f.antitgDone || null, antitg_value: f.antitgValue || null, antitg_unit: f.antitgUnit || null,
    antitg_date: f.antitgDate || null, antitg_ref_low: f.antitgRefLow || null, antitg_ref_high: f.antitgRefHigh || null,
    // New investigations — status inferred from whether a value was
    // entered (these are now purely symptom-triggered inline entries,
    // no separate "tested/not tested" gate question)
    vit_b12_status: f.vitB12Value ? 'tested' : null, vit_b12_value: f.vitB12Value || null, vit_b12_unit: f.vitB12Unit || null,
    vit_b12_date: f.vitB12Date || null, vit_b12_ref_low: f.vitB12RefLow || null, vit_b12_ref_high: f.vitB12RefHigh || null,
    vit_d3_status: f.vitD3Value ? 'tested' : null, vit_d3_value: f.vitD3Value || null, vit_d3_unit: f.vitD3Unit || null,
    vit_d3_date: f.vitD3Date || null, vit_d3_ref_low: f.vitD3RefLow || null, vit_d3_ref_high: f.vitD3RefHigh || null,
    sr_iron_status: f.srIronValue ? 'tested' : null, sr_iron_value: f.srIronValue || null, sr_iron_unit: f.srIronUnit || null,
    sr_iron_date: f.srIronDate || null, sr_iron_ref_low: f.srIronRefLow || null, sr_iron_ref_high: f.srIronRefHigh || null,
    sr_ferritin_status: f.srFerritinValue ? 'tested' : null, sr_ferritin_value: f.srFerritinValue || null, sr_ferritin_unit: f.srFerritinUnit || null,
    sr_ferritin_date: f.srFerritinDate || null, sr_ferritin_ref_low: f.srFerritinRefLow || null, sr_ferritin_ref_high: f.srFerritinRefHigh || null,
    tibc_status: f.tibcValue ? 'tested' : null, tibc_value: f.tibcValue || null, tibc_unit: f.tibcUnit || null,
    tibc_date: f.tibcDate || null, tibc_ref_low: f.tibcRefLow || null, tibc_ref_high: f.tibcRefHigh || null,
    transferrin_sat_status: f.transferrinSatValue ? 'tested' : null, transferrin_sat_value: f.transferrinSatValue || null, transferrin_sat_unit: f.transferrinSatUnit || null,
    transferrin_sat_date: f.transferrinSatDate || null, transferrin_sat_ref_low: f.transferrinSatRefLow || null, transferrin_sat_ref_high: f.transferrinSatRefHigh || null,
    sr_calcium_status: f.srCalciumValue ? 'tested' : null, sr_calcium_value: f.srCalciumValue || null, sr_calcium_unit: f.srCalciumUnit || null,
    sr_calcium_date: f.srCalciumDate || null, sr_calcium_ref_low: f.srCalciumRefLow || null, sr_calcium_ref_high: f.srCalciumRefHigh || null,
    fbs_status: f.fbsValue ? 'tested' : null, fbs_value: f.fbsValue || null, fbs_unit: f.fbsUnit || null,
    fbs_date: f.fbsDate || null, fbs_ref_low: f.fbsRefLow || null, fbs_ref_high: f.fbsRefHigh || null,
    ppbs_status: f.ppbsValue ? 'tested' : null, ppbs_value: f.ppbsValue || null, ppbs_unit: f.ppbsUnit || null,
    ppbs_date: f.ppbsDate || null, ppbs_ref_low: f.ppbsRefLow || null, ppbs_ref_high: f.ppbsRefHigh || null,
    // CBC panel
    cbc_status: Object.values(f.cbcValues || {}).some(c => c?.value || c?.pctValue) ? 'tested' : null,
    cbc_date: f.cbcDate || null,
    cbc_haemoglobin_value: hb.value, cbc_haemoglobin_unit: hb.unit, cbc_haemoglobin_ref_low: hb.ref_low, cbc_haemoglobin_ref_high: hb.ref_high,
    cbc_rbc_count_value: rbc.value, cbc_rbc_count_unit: rbc.unit, cbc_rbc_count_ref_low: rbc.ref_low, cbc_rbc_count_ref_high: rbc.ref_high,
    cbc_haematocrit_value: hct.value, cbc_haematocrit_unit: hct.unit, cbc_haematocrit_ref_low: hct.ref_low, cbc_haematocrit_ref_high: hct.ref_high,
    cbc_mcv_value: mcv.value, cbc_mcv_unit: mcv.unit, cbc_mcv_ref_low: mcv.ref_low, cbc_mcv_ref_high: mcv.ref_high,
    cbc_mch_value: mch.value, cbc_mch_unit: mch.unit, cbc_mch_ref_low: mch.ref_low, cbc_mch_ref_high: mch.ref_high,
    cbc_mchc_value: mchc.value, cbc_mchc_unit: mchc.unit, cbc_mchc_ref_low: mchc.ref_low, cbc_mchc_ref_high: mchc.ref_high,
    cbc_rdw_value: rdw.value, cbc_rdw_unit: rdw.unit, cbc_rdw_ref_low: rdw.ref_low, cbc_rdw_ref_high: rdw.ref_high,
    cbc_wbc_total_value: wbc.value, cbc_wbc_total_unit: wbc.unit, cbc_wbc_total_ref_low: wbc.ref_low, cbc_wbc_total_ref_high: wbc.ref_high,
    cbc_platelet_count_value: plt.value, cbc_platelet_count_unit: plt.unit, cbc_platelet_count_ref_low: plt.ref_low, cbc_platelet_count_ref_high: plt.ref_high,
    cbc_diff_neutrophils_pct_value: neut.pct_value, cbc_diff_neutrophils_pct_ref_low: neut.pct_ref_low, cbc_diff_neutrophils_pct_ref_high: neut.pct_ref_high,
    cbc_diff_neutrophils_count_value: neut.count_value, cbc_diff_neutrophils_count_unit: neut.count_unit, cbc_diff_neutrophils_count_ref_low: neut.count_ref_low, cbc_diff_neutrophils_count_ref_high: neut.count_ref_high,
    cbc_diff_lymphocytes_pct_value: lymph.pct_value, cbc_diff_lymphocytes_pct_ref_low: lymph.pct_ref_low, cbc_diff_lymphocytes_pct_ref_high: lymph.pct_ref_high,
    cbc_diff_lymphocytes_count_value: lymph.count_value, cbc_diff_lymphocytes_count_unit: lymph.count_unit, cbc_diff_lymphocytes_count_ref_low: lymph.count_ref_low, cbc_diff_lymphocytes_count_ref_high: lymph.count_ref_high,
    cbc_diff_monocytes_pct_value: mono.pct_value, cbc_diff_monocytes_pct_ref_low: mono.pct_ref_low, cbc_diff_monocytes_pct_ref_high: mono.pct_ref_high,
    cbc_diff_monocytes_count_value: mono.count_value, cbc_diff_monocytes_count_unit: mono.count_unit, cbc_diff_monocytes_count_ref_low: mono.count_ref_low, cbc_diff_monocytes_count_ref_high: mono.count_ref_high,
    cbc_diff_eosinophils_pct_value: eos.pct_value, cbc_diff_eosinophils_pct_ref_low: eos.pct_ref_low, cbc_diff_eosinophils_pct_ref_high: eos.pct_ref_high,
    cbc_diff_eosinophils_count_value: eos.count_value, cbc_diff_eosinophils_count_unit: eos.count_unit, cbc_diff_eosinophils_count_ref_low: eos.count_ref_low, cbc_diff_eosinophils_count_ref_high: eos.count_ref_high,
    cbc_diff_basophils_pct_value: baso.pct_value, cbc_diff_basophils_pct_ref_low: baso.pct_ref_low, cbc_diff_basophils_pct_ref_high: baso.pct_ref_high,
    cbc_diff_basophils_count_value: baso.count_value, cbc_diff_basophils_count_unit: baso.count_unit, cbc_diff_basophils_count_ref_low: baso.count_ref_low, cbc_diff_basophils_count_ref_high: baso.count_ref_high,
    imaging_finding: f.imagingFinding || null,

    // ═══ MODULE E ═══
    hypo_cause_known: f.hypoCauseKnown === 'yes',
    cause: f.hypoCause || null,
    hypo_duration_date: f.hypoDuration?.date || null,
    hypo_duration_years: f.hypoDuration?.years || null,
    hypo_duration_months: f.hypoDuration?.months || null,
    hypo_duration_days: f.hypoDuration?.days || null,
    goitre_present: f.goitre === 'yes',
    goitre_size_value: f.goitreSize || null,
    hashimotos_confirmed: f.hypoCause === 'hashimotos',
    hashimotos_anti_tpo: f.hashimotosAntiTpo || null,
    hashimotos_anti_tg: f.hashimotosAntiTg || null,
    hashimotos_anti_tpo_value: f.hashimotosAntiTpoValue || null,
    hashimotos_anti_tg_value: f.hashimotosAntiTgValue || null,

    // ═══ MODULE F — symptoms (existing, unchanged) + NEW Acidity ═══
    sym_fatigue_status: f.fatigue || null,
    sym_fatigue_since_date: f.fatigueDuration?.date || null,
    sym_fatigue_years: f.fatigueDuration?.years || null,
    sym_fatigue_months: f.fatigueDuration?.months || null,
    sym_fatigue_days: f.fatigueDuration?.days || null,
    sym_fatigue_severity: f.fatigueSeverity || null,
    sym_weight_status: f.weightChange || null,
    sym_weight_direction: f.weightDirection || null,
    sym_weight_kg_val: f.weightKg || null,
    sym_weight_since_date: f.weightDuration?.date || null,
    sym_weight_years: f.weightDuration?.years || null,
    sym_weight_months: f.weightDuration?.months || null,
    sym_weight_days: f.weightDuration?.days || null,
    sym_appetite_status: f.appetite || null,
    sym_cold_status: f.cold || null,
    sym_cold_since_date: f.coldDuration?.date || null,
    sym_cold_years: f.coldDuration?.years || null,
    sym_cold_months: f.coldDuration?.months || null,
    sym_cold_days: f.coldDuration?.days || null,
    sym_cold_impact: f.coldImpact === 'yes',
    sym_bowel_status: f.bowel || null,
    sym_bowel_type: f.bowelType || null,
    sym_bowel_since_date: f.bowelDuration?.date || null,
    sym_bowel_years: f.bowelDuration?.years || null,
    sym_bowel_months: f.bowelDuration?.months || null,
    sym_bowel_days: f.bowelDuration?.days || null,
    sym_abdominal_status: f.abdominal || null,
    sym_abdominal_types: f.abdominalTypes?.length ? f.abdominalTypes : null,
    sym_abdominal_since_date: f.abdominalDuration?.date || null,
    sym_abdominal_years: f.abdominalDuration?.years || null,
    sym_abdominal_months: f.abdominalDuration?.months || null,
    sym_abdominal_days: f.abdominalDuration?.days || null,
    sym_skin_status: f.skin || null,
    sym_skin_types: f.skinTypes?.length ? f.skinTypes : null,
    sym_skin_since_date: f.skinDuration?.date || null,
    sym_skin_years: f.skinDuration?.years || null,
    sym_skin_months: f.skinDuration?.months || null,
    sym_skin_days: f.skinDuration?.days || null,
    sym_periorbital_status: f.periorbital || null,
    sym_periorbital_since_date: f.periorbitalDuration?.date || null,
    sym_periorbital_years: f.periorbitalDuration?.years || null,
    sym_periorbital_months: f.periorbitalDuration?.months || null,
    sym_periorbital_days: f.periorbitalDuration?.days || null,
    sym_facial_oedema_status: f.facialOedema || null,
    sym_facial_oedema_since_date: f.facialOedemaDuration?.date || null,
    sym_facial_oedema_years: f.facialOedemaDuration?.years || null,
    sym_facial_oedema_months: f.facialOedemaDuration?.months || null,
    sym_facial_oedema_days: f.facialOedemaDuration?.days || null,
    sym_pedal_oedema_status: f.pedalOedema || null,
    sym_pedal_oedema_type: f.pedalOedemaType || null,
    sym_pedal_oedema_since_date: f.pedalOedemaDuration?.date || null,
    sym_pedal_oedema_years: f.pedalOedemaDuration?.years || null,
    sym_pedal_oedema_months: f.pedalOedemaDuration?.months || null,
    sym_pedal_oedema_days: f.pedalOedemaDuration?.days || null,
    sym_hair_status: f.hair || null,
    sym_hair_data: f.hairItems && Object.keys(f.hairItems).length ? f.hairItems : null,
    sym_nail_status: f.nails || null,
    sym_nail_data: f.nailItems && Object.keys(f.nailItems).length ? f.nailItems : null,
    sym_hoarseness_status: f.hoarseness || null,
    sym_hoarseness_since_date: f.hoarsenessDuration?.date || null,
    sym_hoarseness_years: f.hoarsenessDuration?.years || null,
    sym_hoarseness_months: f.hoarsenessDuration?.months || null,
    sym_hoarseness_days: f.hoarsenessDuration?.days || null,
    sym_hoarseness_pattern: f.hoarsenessPattern || null,
    sym_cramp_status: f.cramps || null,
    sym_cramp_since_date: f.crampsDuration?.date || null,
    sym_cramp_years: f.crampsDuration?.years || null,
    sym_cramp_months: f.crampsDuration?.months || null,
    sym_cramp_days: f.crampsDuration?.days || null,
    sym_weakness_status: f.weakness || null,
    sym_weakness_location: f.weaknessLocation || null,
    sym_weakness_since_date: f.weaknessDuration?.date || null,
    sym_weakness_years: f.weaknessDuration?.years || null,
    sym_weakness_months: f.weaknessDuration?.months || null,
    sym_weakness_days: f.weaknessDuration?.days || null,
    sym_concentration_status: f.concentration || null,
    sym_concentration_since_date: f.concentrationDuration?.date || null,
    sym_concentration_years: f.concentrationDuration?.years || null,
    sym_concentration_months: f.concentrationDuration?.months || null,
    sym_concentration_days: f.concentrationDuration?.days || null,
    sym_concentration_impact: f.concentrationImpact === 'yes',
    sym_memory_status: f.memory || null,
    sym_memory_since_date: f.memoryDuration?.date || null,
    sym_memory_years: f.memoryDuration?.years || null,
    sym_memory_months: f.memoryDuration?.months || null,
    sym_memory_days: f.memoryDuration?.days || null,
    sym_memory_impact: f.memoryImpact === 'yes',
    sym_depression_status: f.depression || null,
    sym_depression_since_date: f.depressionDuration?.date || null,
    sym_depression_years: f.depressionDuration?.years || null,
    sym_depression_months: f.depressionDuration?.months || null,
    sym_depression_days: f.depressionDuration?.days || null,
    sym_depression_seen_doctor: f.depressionSeenDoctor === 'yes',
    sym_depression_diagnosed: f.depressionDiagnosed === 'yes',
    // Depression comorbidity/medication (separate columns from the sym_depression_*
    // symptom question above — this is "are you on treatment for it")
    depression_status: f.depression || null,
    depression_diagnosed: f.depressionDiagnosed === 'yes',
    depression_since_date: f.depressionDuration?.date || null,
    depression_years: f.depressionDuration?.years || null,
    depression_months: f.depressionDuration?.months || null,
    depression_days: f.depressionDuration?.days || null,
    depression_on_med: f.depressionOnMed || null,
    depression_med_name: f.depressionMedName || null,
    depression_med_dose: f.depressionMedDose || null,
    depression_med_freq: f.depressionMedFreq || null,
    depression_med_since_date: f.depressionMedSince?.date || null,
    depression_med_since_years: f.depressionMedSince?.years || null,
    depression_med_since_months: f.depressionMedSince?.months || null,
    sym_hypersomnia_status: f.hypersomnia || null,
    sym_hypersomnia_since_date: f.hypersomniaDuration?.date || null,
    sym_hypersomnia_years: f.hypersomniaDuration?.years || null,
    sym_hypersomnia_months: f.hypersomniaDuration?.months || null,
    sym_hypersomnia_days: f.hypersomniaDuration?.days || null,
    sym_bradycardia_status: f.bradycardia || null,
    sym_bradycardia_pulse_bpm: f.bradycardiaPulse || null,
    sym_bradycardia_since_date: f.bradycardiaDuration?.date || null,
    sym_bradycardia_years: f.bradycardiaDuration?.years || null,
    sym_bradycardia_months: f.bradycardiaDuration?.months || null,
    sym_bradycardia_days: f.bradycardiaDuration?.days || null,
    sym_giddiness_status: f.giddiness || null,
    sym_giddiness_freq: f.giddinessFreq || null,
    sym_giddiness_since_date: f.giddinessDuration?.date || null,
    sym_giddiness_years: f.giddinessDuration?.years || null,
    sym_giddiness_months: f.giddinessDuration?.months || null,
    sym_giddiness_days: f.giddinessDuration?.days || null,
    sym_blackout_status: f.blackout || null,
    sym_blackout_count: f.blackoutCount || null,
    sym_blackout_last_date: f.blackoutLastDate || null,
    sym_blackout_assessed: f.blackoutAssessed === 'yes',
    sym_blackout_dx: f.blackoutDx || null,
    sym_hearing_status: f.hearing || null,
    sym_hearing_data: (f.hearingTypes || []).length ? {
      types: f.hearingTypes,
      reduced: f.hearingReducedDuration || {},
      tinnitus: f.hearingTinnitusDuration || {},
    } : null,
    sym_reflexes_status: f.reflexes || null,
    sym_reflexes_since_date: f.reflexesDuration?.date || null,
    sym_reflexes_years: f.reflexesDuration?.years || null,
    sym_reflexes_months: f.reflexesDuration?.months || null,
    sym_reflexes_days: f.reflexesDuration?.days || null,
    sym_carpal_data: f.carpalItems && Object.keys(f.carpalItems).length ? f.carpalItems : null,
    sym_macroglossia_status: f.macroglossia || null,
    sym_macroglossia_since_date: f.macroglossiaDuration?.date || null,
    sym_macroglossia_years: f.macroglossiaDuration?.years || null,
    sym_macroglossia_months: f.macroglossiaDuration?.months || null,
    sym_macroglossia_days: f.macroglossiaDuration?.days || null,
    // Acidity / retrosternal chest burn — new symptom
    acidity_status: f.acidity || null,
    acidity_since_date: f.acidityDuration?.date || null,
    acidity_years: f.acidityDuration?.years || null,
    acidity_months: f.acidityDuration?.months || null,
    acidity_days: f.acidityDuration?.days || null,
    acidity_on_med: f.acidityOnMed || null,
    acidity_med_name: f.acidityMedName || null,
    acidity_med_dose: f.acidityMedDose || null,
    acidity_med_freq: f.acidityMedFreq || null,
    acidity_med_since_date: f.acidityMedSince?.date || null,
    acidity_med_since_years: f.acidityMedSince?.years || null,
    acidity_med_since_months: f.acidityMedSince?.months || null,

    // ═══ MODULE G — current treatment (merged into C3 above; thyroid_med_*
    // columns already carry this data — see MODULE C payload block) ═══
    on_treatment: !!(f.thyroidMed === 'yes' && (f.thyroidMedBrand || f.thyroidMedDose)),
    treatment_type: f.treatmentType || null,
    dose_changed_status: f.doseChanged || null,
    dose_last_changed_date: f.doseChangedDate || null,
    dose_change_reason_type: f.doseChangedReason || null,

    // ═══ MODULE H — comorbidities, now full name/dose/freq/since quartet ═══
    dyslipidaemia_status: f.dyslipidaemia || null,
    dyslipidaemia_since_date: f.dyslipidaemiaDuration?.date || null,
    dyslipidaemia_years: f.dyslipidaemiaDuration?.years || null,
    dyslipidaemia_months: f.dyslipidaemiaDuration?.months || null,
    dyslipidaemia_days: f.dyslipidaemiaDuration?.days || null,
    dyslipidaemia_on_med: f.dyslipidaemiaOnMed || null,
    dyslipidaemia_meds: f.dyslipidaemiaMeds && f.dyslipidaemiaMeds.length ? f.dyslipidaemiaMeds : null,

    anaemia_status: f.anaemia || null,
    anaemia_types: (f.anaemiaTypes || []).length ? f.anaemiaTypes : null,
    anaemia_since_date: f.anaemiaDuration?.date || null,
    anaemia_years: f.anaemiaDuration?.years || null,
    anaemia_months: f.anaemiaDuration?.months || null,
    anaemia_days: f.anaemiaDuration?.days || null,
    anaemia_on_med: f.anaemiaOnMed || null,
    anaemia_meds: f.anaemiaMeds && f.anaemiaMeds.length ? f.anaemiaMeds : null,

    diabetes_status: f.diabetes || null,
    diabetes_type: f.diabetesType || null,
    diabetes_since_date: f.diabetesDuration?.date || null,
    diabetes_years: f.diabetesDuration?.years || null,
    diabetes_months: f.diabetesDuration?.months || null,
    diabetes_days: f.diabetesDuration?.days || null,
    diabetes_on_med: f.diabetesOnMed || null,
    diabetes_meds: f.diabetesMeds && f.diabetesMeds.length ? f.diabetesMeds : null,

    // Hypertension — new comorbidity (H6)
    htn_status: f.htn || null,
    htn_since_date: f.htnDuration?.date || null,
    htn_years: f.htnDuration?.years || null,
    htn_months: f.htnDuration?.months || null,
    htn_days: f.htnDuration?.days || null,
    htn_on_med: f.htnOnMed || null,
    htn_meds: f.htnMeds && f.htnMeds.length ? f.htnMeds : null,

    pcos_status: f.pcosPmos || null,
    pcos_pmos_label: f.pcosPmosLabel || null,
    pcos_since_date: f.pcosDuration?.date || null,
    pcos_years: f.pcosDuration?.years || null,
    pcos_months: f.pcosDuration?.months || null,
    pcos_days: f.pcosDuration?.days || null,
    pcos_on_med: f.pcosOnMed || null,
    pcos_meds: f.pcosMeds && f.pcosMeds.length ? f.pcosMeds : null,

    has_infertility: f.infertility === 'yes',

    osteoporosis_status: f.osteoporosis || null,
    osteoporosis_dexa: f.osteoporosisDEXA || null,
    osteoporosis_since_date: f.osteoporosisDuration?.date || null,
    osteoporosis_years: f.osteoporosisDuration?.years || null,
    osteoporosis_months: f.osteoporosisDuration?.months || null,
    osteoporosis_days: f.osteoporosisDuration?.days || null,
    osteoporosis_on_med: f.osteoporosisOnMed || null,
    osteoporosis_med_name: f.osteoporosisMedName || null,
    osteoporosis_med_dose: f.osteoporosisMedDose || null,
    osteoporosis_med_freq: f.osteoporosisMedTimes || null,
    osteoporosis_med_since_date: f.osteoporosisMedSince?.date || null,
    osteoporosis_med_since_years: f.osteoporosisMedSince?.years || null,
    osteoporosis_med_since_months: f.osteoporosisMedSince?.months || null,

    family_cancer_status: f.familyCancer || null,
    family_cancer_types: f.familyCancerTypes?.length ? f.familyCancerTypes : null,
    family_cancer_relative: f.familyCancerRelative || null,

    additional_notes: f.additionalNotes || null,
  };
}

function mapDbToForm(r) {
  const cbcSimpleBack = (prefix) => ({
    value: r[`cbc_${prefix}_value`], unit: r[`cbc_${prefix}_unit`],
    refLow: r[`cbc_${prefix}_ref_low`], refHigh: r[`cbc_${prefix}_ref_high`],
  });
  const cbcDiffBack = (prefix) => ({
    pctValue: r[`cbc_diff_${prefix}_pct_value`], pctRefLow: r[`cbc_diff_${prefix}_pct_ref_low`],
    pctRefHigh: r[`cbc_diff_${prefix}_pct_ref_high`], countValue: r[`cbc_diff_${prefix}_count_value`],
    countUnit: r[`cbc_diff_${prefix}_count_unit`], countRefLow: r[`cbc_diff_${prefix}_count_ref_low`],
    countRefHigh: r[`cbc_diff_${prefix}_count_ref_high`],
  });

  return {
    // Module A
    maritalStatus: r.marital_status || '',
    occupation: r.occupation || '',
    occupationOther: r.occupation_other || '',

    // Module B
    hysterectomy: r.hysterectomy_status || '',
    hysterectomyDate: { date: r.hysterectomy_date, years: r.hysterectomy_year, months: r.hysterectomy_month },
    hysterectomyReason: r.hysterectomy_reason || '',
    hysterectomyOther: r.hysterectomy_reason_other || '',
    menopauseStatus: r.menopause_status || '',
    menopauseYears: r.menopause_years_ago || '',
    menstrualChange: r.menstrual_change_status || '',
    menstrualChangeTypes: [
      ...(r.menstrual_pattern ? [r.menstrual_pattern] : []),
      ...(r.menstrual_flow || []),
    ],
    menstrualChangeDuration: { date: r.menstrual_since_date, years: r.menstrual_years, months: r.menstrual_months },
    lmpDate: r.lmp_date || '',
    pregnant: r.pregnancy_status || '',

    // Module C
    thyroidDx: r.thyroid_dx_status || '',
    thyroidDxType: r.thyroid_dx_type || '',
    thyroidDxYear: r.thyroid_dx_year || '',
    thyroidSurgery: r.thyroid_surgery_status || '',
    thyroidSurgeryType: r.thyroid_surgery_type || '',
    thyroidSurgeryYear: r.thyroid_surgery_year || '',
    raiAdministrations: r.rai_administrations || [],
    thyroidMed: r.thyroid_med_status || '',
    thyroidMedName: r.thyroid_med_name || '',
    thyroidMedBrand: r.thyroid_med_brand || '',
    thyroidMedDose: r.thyroid_med_dose || '',
    thyroidMedTiming: r.thyroid_med_timing || '',
    thyroidMedCompliance: r.thyroid_med_compliance || '',
    thyroidMedSince: { years: r.thyroid_med_since_years, months: r.thyroid_med_since_months },
    liothyronineBrand: r.liothyronine_brand || '',
    liothyronineName: r.liothyronine_name || '',
    liothyronineDose: r.liothyronine_dose || '',
    liothyronineTiming: r.liothyronine_timing || '',
    liothyronineCompliance: r.liothyronine_compliance || '',
    liothyronineSince: { years: r.liothyronine_since_years, months: r.liothyronine_since_months },
    liothyronineDoseChanged: r.liothyronine_dose_changed_status || '',
    liothyronineDoseChangedDate: r.liothyronine_dose_changed_date || '',
    liothyronineDoseChangedReason: r.liothyronine_dose_change_reason || '',
    familyThyroid: r.family_thyroid_status || '',
    familyThyroidRelatives: r.family_thyroid_relations || [],
    familyThyroidConditions: r.family_thyroid_relations?.length && r.family_thyroid_condition
      ? { [r.family_thyroid_relations[0]]: r.family_thyroid_condition } : {},
    autoimmune: r.autoimmune_status || '',
    autoimmuneItems: (r.autoimmune_conditions || []).reduce((acc, cond) => ({ ...acc, [cond]: { selected: true } }), {}),

    // Module D — labs
    tshDone: r.tsh_status || '', tshValue: r.tsh_value || '', tshUnit: r.tsh_unit || '',
    tshDate: r.tsh_date || '', tshRefLow: r.tsh_ref_low || '', tshRefHigh: r.tsh_ref_high || '',
    t3Done: r.t3_status || '', t3Value: r.t3_value || '', t3Unit: r.t3_unit || '',
    t3Date: r.t3_date || '', t3RefLow: r.t3_ref_low || '', t3RefHigh: r.t3_ref_high || '',
    ft3Done: r.ft3_status || '', ft3Value: r.ft3_value || '', ft3Unit: r.ft3_unit || '',
    ft3Date: r.ft3_date || '', ft3RefLow: r.ft3_ref_low || '', ft3RefHigh: r.ft3_ref_high || '',
    t4Done: r.t4_status || '', t4Value: r.t4_value || '', t4Unit: r.t4_unit || '',
    t4Date: r.t4_date || '', t4RefLow: r.t4_ref_low || '', t4RefHigh: r.t4_ref_high || '',
    ft4Done: r.ft4_status || '', ft4Value: r.ft4_value || '', ft4Unit: r.ft4_unit || '',
    ft4Date: r.ft4_date || '', ft4RefLow: r.ft4_ref_low || '', ft4RefHigh: r.ft4_ref_high || '',
    antitpoDone: r.antitpo_status || '', antitpoValue: r.antitpo_value || '', antitpoUnit: r.antitpo_unit || '',
    antitpoDate: r.antitpo_date || '', antitpoRefLow: r.antitpo_ref_low || '', antitpoRefHigh: r.antitpo_ref_high || '',
    antitgDone: r.antitg_status || '', antitgValue: r.antitg_value || '', antitgUnit: r.antitg_unit || '',
    antitgDate: r.antitg_date || '', antitgRefLow: r.antitg_ref_low || '', antitgRefHigh: r.antitg_ref_high || '',
    vitB12Done: r.vit_b12_status || '', vitB12Value: r.vit_b12_value || '', vitB12Unit: r.vit_b12_unit || '',
    vitB12Date: r.vit_b12_date || '', vitB12RefLow: r.vit_b12_ref_low || '', vitB12RefHigh: r.vit_b12_ref_high || '',
    vitD3Done: r.vit_d3_status || '', vitD3Value: r.vit_d3_value || '', vitD3Unit: r.vit_d3_unit || '',
    vitD3Date: r.vit_d3_date || '', vitD3RefLow: r.vit_d3_ref_low || '', vitD3RefHigh: r.vit_d3_ref_high || '',
    srIronDone: r.sr_iron_status || '', srIronValue: r.sr_iron_value || '', srIronUnit: r.sr_iron_unit || '',
    srIronDate: r.sr_iron_date || '', srIronRefLow: r.sr_iron_ref_low || '', srIronRefHigh: r.sr_iron_ref_high || '',
    srFerritinDone: r.sr_ferritin_status || '', srFerritinValue: r.sr_ferritin_value || '', srFerritinUnit: r.sr_ferritin_unit || '',
    srFerritinDate: r.sr_ferritin_date || '', srFerritinRefLow: r.sr_ferritin_ref_low || '', srFerritinRefHigh: r.sr_ferritin_ref_high || '',
    tibcDone: r.tibc_status || '', tibcValue: r.tibc_value || '', tibcUnit: r.tibc_unit || '',
    tibcDate: r.tibc_date || '', tibcRefLow: r.tibc_ref_low || '', tibcRefHigh: r.tibc_ref_high || '',
    transferrinSatDone: r.transferrin_sat_status || '', transferrinSatValue: r.transferrin_sat_value || '', transferrinSatUnit: r.transferrin_sat_unit || '',
    transferrinSatDate: r.transferrin_sat_date || '', transferrinSatRefLow: r.transferrin_sat_ref_low || '', transferrinSatRefHigh: r.transferrin_sat_ref_high || '',
    srCalciumValue: r.sr_calcium_value || '', srCalciumUnit: r.sr_calcium_unit || '',
    srCalciumDate: r.sr_calcium_date || '', srCalciumRefLow: r.sr_calcium_ref_low || '', srCalciumRefHigh: r.sr_calcium_ref_high || '',
    fbsValue: r.fbs_value || '', fbsUnit: r.fbs_unit || '',
    fbsDate: r.fbs_date || '', fbsRefLow: r.fbs_ref_low || '', fbsRefHigh: r.fbs_ref_high || '',
    ppbsValue: r.ppbs_value || '', ppbsUnit: r.ppbs_unit || '',
    ppbsDate: r.ppbs_date || '', ppbsRefLow: r.ppbs_ref_low || '', ppbsRefHigh: r.ppbs_ref_high || '',
    cbcDone: r.cbc_status || '',
    cbcDate: r.cbc_date || '',
    cbcValues: {
      haemoglobin: cbcSimpleBack('haemoglobin'), rbcCount: cbcSimpleBack('rbc_count'),
      haematocrit: cbcSimpleBack('haematocrit'), mcv: cbcSimpleBack('mcv'), mch: cbcSimpleBack('mch'),
      mchc: cbcSimpleBack('mchc'), rdw: cbcSimpleBack('rdw'), wbcTotal: cbcSimpleBack('wbc_total'),
      plateletCount: cbcSimpleBack('platelet_count'),
      diffNeutrophils: cbcDiffBack('neutrophils'), diffLymphocytes: cbcDiffBack('lymphocytes'),
      diffMonocytes: cbcDiffBack('monocytes'), diffEosinophils: cbcDiffBack('eosinophils'),
      diffBasophils: cbcDiffBack('basophils'),
    },
    imagingFinding: r.imaging_finding || '',

    // Module E
    hypoCauseKnown: r.hypo_cause_known ? 'yes' : 'no',
    hypoCause: r.cause || '',
    hypoDuration: { date: r.hypo_duration_date, years: r.hypo_duration_years, months: r.hypo_duration_months, days: r.hypo_duration_days },
    goitre: r.goitre_present ? 'yes' : 'no',
    goitreSize: r.goitre_size_value || '',
    hashimotosAntiTpo: r.hashimotos_anti_tpo || '',
    hashimotosAntiTg: r.hashimotos_anti_tg || '',
    hashimotosAntiTpoValue: r.hashimotos_anti_tpo_value || '',
    hashimotosAntiTgValue: r.hashimotos_anti_tg_value || '',

    // Module F — symptoms
    fatigue: r.sym_fatigue_status || '',
    fatigueDuration: { date: r.sym_fatigue_since_date, years: r.sym_fatigue_years, months: r.sym_fatigue_months, days: r.sym_fatigue_days },
    fatigueSeverity: r.sym_fatigue_severity || '',
    weightChange: r.sym_weight_status || '',
    weightDirection: r.sym_weight_direction || '',
    weightKg: r.sym_weight_kg_val || '',
    weightDuration: { date: r.sym_weight_since_date, years: r.sym_weight_years, months: r.sym_weight_months, days: r.sym_weight_days },
    appetite: r.sym_appetite_status || '',
    cold: r.sym_cold_status || '',
    coldDuration: { date: r.sym_cold_since_date, years: r.sym_cold_years, months: r.sym_cold_months, days: r.sym_cold_days },
    coldImpact: r.sym_cold_impact ? 'yes' : 'no',
    bowel: r.sym_bowel_status || '',
    bowelType: r.sym_bowel_type || '',
    bowelDuration: { date: r.sym_bowel_since_date, years: r.sym_bowel_years, months: r.sym_bowel_months, days: r.sym_bowel_days },
    abdominal: r.sym_abdominal_status || '',
    abdominalTypes: r.sym_abdominal_types || [],
    abdominalDuration: { date: r.sym_abdominal_since_date, years: r.sym_abdominal_years, months: r.sym_abdominal_months, days: r.sym_abdominal_days },
    skin: r.sym_skin_status || '',
    skinTypes: r.sym_skin_types || [],
    skinDuration: { date: r.sym_skin_since_date, years: r.sym_skin_years, months: r.sym_skin_months, days: r.sym_skin_days },
    periorbital: r.sym_periorbital_status || '',
    periorbitalDuration: { date: r.sym_periorbital_since_date, years: r.sym_periorbital_years, months: r.sym_periorbital_months, days: r.sym_periorbital_days },
    facialOedema: r.sym_facial_oedema_status || '',
    facialOedemaDuration: { date: r.sym_facial_oedema_since_date, years: r.sym_facial_oedema_years, months: r.sym_facial_oedema_months, days: r.sym_facial_oedema_days },
    pedalOedema: r.sym_pedal_oedema_status || '',
    pedalOedemaType: r.sym_pedal_oedema_type || '',
    pedalOedemaDuration: { date: r.sym_pedal_oedema_since_date, years: r.sym_pedal_oedema_years, months: r.sym_pedal_oedema_months, days: r.sym_pedal_oedema_days },
    hair: r.sym_hair_status || '',
    hairItems: r.sym_hair_data || {},
    nails: r.sym_nail_status || '',
    nailItems: r.sym_nail_data || {},
    hoarseness: r.sym_hoarseness_status || '',
    hoarsenessDuration: { date: r.sym_hoarseness_since_date, years: r.sym_hoarseness_years, months: r.sym_hoarseness_months, days: r.sym_hoarseness_days },
    hoarsenessPattern: r.sym_hoarseness_pattern || '',
    cramps: r.sym_cramp_status || '',
    crampsDuration: { date: r.sym_cramp_since_date, years: r.sym_cramp_years, months: r.sym_cramp_months, days: r.sym_cramp_days },
    weakness: r.sym_weakness_status || '',
    weaknessLocation: r.sym_weakness_location || '',
    weaknessDuration: { date: r.sym_weakness_since_date, years: r.sym_weakness_years, months: r.sym_weakness_months, days: r.sym_weakness_days },
    concentration: r.sym_concentration_status || '',
    concentrationDuration: { date: r.sym_concentration_since_date, years: r.sym_concentration_years, months: r.sym_concentration_months, days: r.sym_concentration_days },
    concentrationImpact: r.sym_concentration_impact ? 'yes' : 'no',
    memory: r.sym_memory_status || '',
    memoryDuration: { date: r.sym_memory_since_date, years: r.sym_memory_years, months: r.sym_memory_months, days: r.sym_memory_days },
    memoryImpact: r.sym_memory_impact ? 'yes' : 'no',
    depression: r.sym_depression_status || '',
    depressionDuration: { date: r.sym_depression_since_date, years: r.sym_depression_years, months: r.sym_depression_months, days: r.sym_depression_days },
    depressionSeenDoctor: r.sym_depression_seen_doctor ? 'yes' : 'no',
    depressionDiagnosed: r.sym_depression_diagnosed ? 'yes' : 'no',
    depressionOnMed: r.depression_on_med || '',
    depressionMedName: r.depression_med_name || '',
    depressionMedDose: r.depression_med_dose || '',
    depressionMedFreq: r.depression_med_freq || '',
    depressionMedSince: { date: r.depression_med_since_date, years: r.depression_med_since_years, months: r.depression_med_since_months },
    hypersomnia: r.sym_hypersomnia_status || '',
    hypersomniaDuration: { date: r.sym_hypersomnia_since_date, years: r.sym_hypersomnia_years, months: r.sym_hypersomnia_months, days: r.sym_hypersomnia_days },
    bradycardia: r.sym_bradycardia_status || '',
    bradycardiaPulse: r.sym_bradycardia_pulse_bpm || '',
    bradycardiaDuration: { date: r.sym_bradycardia_since_date, years: r.sym_bradycardia_years, months: r.sym_bradycardia_months, days: r.sym_bradycardia_days },
    giddiness: r.sym_giddiness_status || '',
    giddinessFreq: r.sym_giddiness_freq || '',
    giddinessDuration: { date: r.sym_giddiness_since_date, years: r.sym_giddiness_years, months: r.sym_giddiness_months, days: r.sym_giddiness_days },
    blackout: r.sym_blackout_status || '',
    blackoutCount: r.sym_blackout_count || '',
    blackoutLastDate: r.sym_blackout_last_date || '',
    blackoutAssessed: r.sym_blackout_assessed ? 'yes' : 'no',
    blackoutDx: r.sym_blackout_dx || '',
    hearing: r.sym_hearing_status || '',
    hearingTypes: r.sym_hearing_data?.types || (r.sym_hearing_type
      ? (r.sym_hearing_type === 'both' ? ['reduced', 'tinnitus'] : [r.sym_hearing_type]) : []),
    hearingReducedDuration: r.sym_hearing_data?.reduced || { date: r.sym_hearing_since_date, years: r.sym_hearing_years, months: r.sym_hearing_months, days: r.sym_hearing_days },
    hearingTinnitusDuration: r.sym_hearing_data?.tinnitus || {},
    reflexes: r.sym_reflexes_status || '',
    reflexesDuration: { date: r.sym_reflexes_since_date, years: r.sym_reflexes_years, months: r.sym_reflexes_months, days: r.sym_reflexes_days },
    carpalItems: r.sym_carpal_data || {},
    macroglossia: r.sym_macroglossia_status || '',
    macroglossiaDuration: { date: r.sym_macroglossia_since_date, years: r.sym_macroglossia_years, months: r.sym_macroglossia_months, days: r.sym_macroglossia_days },
    acidity: r.acidity_status || '',
    acidityDuration: { date: r.acidity_since_date, years: r.acidity_years, months: r.acidity_months, days: r.acidity_days },
    acidityOnMed: r.acidity_on_med || '',
    acidityMedName: r.acidity_med_name || '',
    acidityMedDose: r.acidity_med_dose || '',
    acidityMedFreq: r.acidity_med_freq || '',
    acidityMedSince: { date: r.acidity_med_since_date, years: r.acidity_med_since_years, months: r.acidity_med_since_months },

    // Module G (medication itself now hydrated from thyroid_med_* in Module C, above)
    onTreatment: r.on_treatment ? 'yes' : 'no',
    treatmentType: r.treatment_type || '',
    doseChanged: r.dose_changed_status || '',
    doseChangedDate: r.dose_last_changed_date || '',
    doseChangedReason: r.dose_change_reason_type || '',

    // Module H — comorbidities
    dyslipidaemia: r.dyslipidaemia_status || '',
    dyslipidaemiaDuration: { date: r.dyslipidaemia_since_date, years: r.dyslipidaemia_years, months: r.dyslipidaemia_months, days: r.dyslipidaemia_days },
    dyslipidaemiaOnMed: r.dyslipidaemia_on_med || '',
    dyslipidaemiaMeds: r.dyslipidaemia_meds || (r.dyslipidaemia_med_name ? [{ name: r.dyslipidaemia_med_name, dose: r.dyslipidaemia_med_dose || '', freq: r.dyslipidaemia_med_freq || '', since: { date: r.dyslipidaemia_med_since_date, years: r.dyslipidaemia_med_since_years, months: r.dyslipidaemia_med_since_months } }] : []),

    anaemia: r.anaemia_status || '',
    anaemiaTypes: r.anaemia_types || (r.anaemia_type ? [r.anaemia_type] : []),
    anaemiaDuration: { date: r.anaemia_since_date, years: r.anaemia_years, months: r.anaemia_months, days: r.anaemia_days },
    anaemiaOnMed: r.anaemia_on_med || '',
    anaemiaMeds: r.anaemia_meds || (r.anaemia_med_name ? [{ name: r.anaemia_med_name, dose: r.anaemia_med_dose || '', freq: r.anaemia_med_freq || '', since: { date: r.anaemia_med_since_date, years: r.anaemia_med_since_years, months: r.anaemia_med_since_months } }] : []),

    diabetes: r.diabetes_status || '',
    diabetesType: r.diabetes_type || '',
    diabetesDuration: { date: r.diabetes_since_date, years: r.diabetes_years, months: r.diabetes_months, days: r.diabetes_days },
    diabetesOnMed: r.diabetes_on_med || '',
    diabetesMeds: r.diabetes_meds || (r.diabetes_med_name ? [{ name: r.diabetes_med_name, dose: r.diabetes_med_dose || '', freq: r.diabetes_med_freq || '', since: { date: r.diabetes_med_since_date, years: r.diabetes_med_since_years, months: r.diabetes_med_since_months } }] : []),

    htn: r.htn_status || '',
    htnDuration: { date: r.htn_since_date, years: r.htn_years, months: r.htn_months, days: r.htn_days },
    htnOnMed: r.htn_on_med || '',
    htnMeds: r.htn_meds || (r.htn_med_name ? [{ name: r.htn_med_name, dose: r.htn_med_dose || '', freq: r.htn_med_freq || '', since: { date: r.htn_med_since_date, years: r.htn_med_since_years, months: r.htn_med_since_months } }] : []),

    pcosPmos: r.pcos_status || '',
    pcosPmosLabel: r.pcos_pmos_label || '',
    pcosDuration: { date: r.pcos_since_date, years: r.pcos_years, months: r.pcos_months, days: r.pcos_days },
    pcosOnMed: r.pcos_on_med || '',
    pcosMeds: r.pcos_meds || (r.pcos_med_name ? [{ name: r.pcos_med_name, dose: r.pcos_med_dose || '', freq: r.pcos_med_freq || '', since: { date: r.pcos_med_since_date, years: r.pcos_med_since_years, months: r.pcos_med_since_months } }] : []),

    infertility: r.has_infertility ? 'yes' : 'no',

    osteoporosis: r.osteoporosis_status || '',
    osteoporosisDEXA: r.osteoporosis_dexa || '',
    osteoporosisDuration: { date: r.osteoporosis_since_date, years: r.osteoporosis_years, months: r.osteoporosis_months, days: r.osteoporosis_days },
    osteoporosisOnMed: r.osteoporosis_on_med || '',
    osteoporosisMedName: r.osteoporosis_med_name || '',
    osteoporosisMedDose: r.osteoporosis_med_dose || '',
    osteoporosisMedTimes: r.osteoporosis_med_freq || '',
    osteoporosisMedSince: { date: r.osteoporosis_med_since_date, years: r.osteoporosis_med_since_years, months: r.osteoporosis_med_since_months },

    familyCancer: r.family_cancer_status || '',
    familyCancerTypes: r.family_cancer_types || [],
    familyCancerRelative: r.family_cancer_relative || '',

    additionalNotes: r.additional_notes || '',
  };
}

// HyperQuestionnaire lives in its own standalone file (HyperQuestionnaire.js)
// — nothing to re-export here. PatientPortal.js (the only known consumer,
// confirmed) now imports it directly from that file.
