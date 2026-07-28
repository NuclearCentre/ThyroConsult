/**
 * ConditionQuestionnaires.js
 * Condition-specific questionnaire — Part 2 of 2.
 * Three components in one file:
 *   <HypoQuestionnaire />   — Hypothyroidism
 *   <HyperQuestionnaire />  — Hyperthyroidism / Graves' Disease
 *   <TcQuestionnaire />     — Thyroid Cancer
 *
 * All follow the same props pattern:
 *   patientId, episodeId, patientGender, onComplete, onBack
 */

import React, { useState, useEffect, useCallback } from 'react';
import { conditionAPI } from '../api';
import { Spinner, Alert } from './common/index';

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
// ─── Shared UI primitives ─────────────────────────────────
const HypoField = ({ label, hint, children }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>}
    {children}
    {hint && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{hint}</div>}
  </div>
);

const HypoRadioGroup = ({ options, value, onChange, horizontal }) => (
  <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
    {options.map(([val, label]) => (
      <div key={val} onClick={() => onChange(val)} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
        border: `1.5px solid ${value === val ? 'var(--teal-400)' : 'var(--border)'}`,
        background: value === val ? 'var(--teal-50)' : 'var(--surface)',
        color: value === val ? 'var(--teal-700)' : 'var(--text-primary)',
        fontSize: 13, flex: horizontal ? '1 1 auto' : undefined,
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
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
    {options.map(([val, label]) => {
      const sel = value.includes(val);
      return (
        <div key={val} onClick={() => onChange(sel ? value.filter(v => v !== val) : [...value, val])} style={{
          padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12,
          border: `1px solid ${sel ? 'var(--teal-400)' : 'var(--border)'}`,
          background: sel ? 'var(--teal-50)' : 'transparent',
          color: sel ? 'var(--teal-700)' : 'var(--text-secondary)',
          fontWeight: sel ? 500 : 400,
        }}>{label}</div>
      );
    })}
  </div>
);

const HypoTextInput = ({ value, onChange, placeholder, type = 'text', min, max, step, style }) => (
  <input className="form-input" type={type} value={value || ''} min={min} max={max} step={step}
    onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ fontSize: 13, ...style }} />
);

const HypoDateInput = ({ value, onChange, maxDate }) => (
  <input className="form-input" type="date" value={value || ''}
    onChange={e => onChange(e.target.value)}
    max={maxDate || new Date().toISOString().split('T')[0]}
    style={{ fontSize: 13, width: 180 }} />
);

const HypoDurationPicker = ({ value = {}, onChange, label = 'Since when?' }) => (
  <HypoField label={label}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Date (if known)</div>
        <HypoDateInput value={value.date} onChange={v => onChange({ ...value, date: v })} />
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

const HypoOutputBox = ({ text }) => (
  <div style={{
    background: 'var(--teal-50)', border: '1px solid var(--teal-200)',
    borderRadius: 8, padding: '8px 12px', marginTop: 10,
  }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--teal-600)', marginBottom: 2 }}>GENERATED OUTPUT</div>
    <div style={{ fontSize: 12, color: 'var(--teal-800)', fontStyle: 'italic' }}>{text}</div>
  </div>
);

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

  // ── Form state ────────────────────────────────────────
  const [f, setF] = useState({
    // A — Demographics
    dob: '', sex: '', maritalStatus: '',

    // B — Menstrual
    hysterectomy: '', hysterectomyDate: {}, hysterectomyReason: '', hysterectomyOther: '',
    menopauseStatus: 'pre', menopauseYears: '',
    menstrualChange: '', menstrualChangeTypes: [], menstrualChangeDuration: {},
    lmpDate: '',
    pregnant: '', pregnancyWeeks: '',

    // C — Thyroid history
    thyroidDx: '', thyroidDxType: '', thyroidDxYear: '',
    thyroidSurgery: '', thyroidSurgeryType: '', thyroidSurgeryYear: '',
    thyroidRai: '', thyroidRaiYear: '',
    thyroidMed: '', thyroidMedName: '', thyroidMedBrand: '', thyroidMedDose: '',
    thyroidMedTiming: '', thyroidMedCompliance: '', thyroidMedSince: {},
    thyroidMedDoseChangedDate: '', thyroidMedDoseChangedReason: '',
    familyThyroid: '', familyThyroidRelatives: [], familyThyroidConditions: {},
    autoimmune: '', autoimmuneItems: {},

    // D — Labs
    tshDone: '', tshValue: '', tshDate: '', tshRefLow: '', tshRefHigh: '', tshLab: '', tshReports: [],
    ft4Done: '', ft4Value: '', ft4Unit: '', ft4Date: '', ft4RefLow: '', ft4RefHigh: '', ft4Reports: [],
    ft3Done: '', ft3Value: '', ft3Unit: '', ft3Date: '', ft3RefLow: '', ft3RefHigh: '', ft3Reports: [],
    antibodyDone: '', antitpoValue: '', antitpoDate: '', antitgValue: '', antitgDate: '', antibodyReports: [],
    imagingDone: '', imagingTypes: [], imagingDate: '', imagingReport: null,

    // E — Hypo specific
    hypoCauseKnown: '', hypoCause: '', hypoDuration: {},
    hashimotos: '', hashimotosAntiTpo: '', hashimotosAntiTg: '',
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
    hearing: '', hearingType: '', hearingDuration: {},
    reflexes: '', reflexesDuration: {},
    carpalItems: {},  // { pain: { present, side, duration }, numbness: {...}, tingling: {...} }
    macroglossia: '',

    // G — Treatment
    onTreatment: '', treatmentType: '', levoDrugName: '', levoBrand: '',
    levoDose: '', levoTiming: '', levoCompliance: '', levoSince: {},
    doseChanged: '', doseChangedDate: '', doseChangedReason: '',

    // H — Comorbidities
    dyslipidaemia: '', dyslipidaemiaDuration: {},
    anaemia: '', anaemiaType: '',
    pcosPmos: '', pcosPmosLabel: '', pcosDuration: {}, pcosOnMed: '',
    pcosMedName: '', pcosMedDose: '', pcosMedTimes: '',
    infertility: '',
    additionalNotes: '',
  });

  const set = key => val => setF(p => ({ ...p, [key]: val }));

  // ── Pre-fill from patient profile ─────────────────────
  useEffect(() => {
    if (patientGender) setF(p => ({ ...p, sex: patientGender }));
    if (patientDob) setF(p => ({ ...p, dob: patientDob }));
    if (patientId && episodeId) {
      conditionAPI.getHypoQ(patientId, episodeId)
        .then(res => { if (res.data && Object.keys(res.data).length) setF(p => ({ ...p, ...mapDbToForm(res.data) })); })
        .catch(() => {});
    }
  }, [patientId, episodeId, patientGender, patientDob]);

  // ── Reproductive gate helpers ─────────────────────────
  const isMale = f.sex === 'male';
  const isMarriedStatus = f.maritalStatus === 'married';
  const hadHysterectomy = f.hysterectomy === 'yes';
  const isPostMeno = f.menopauseStatus === 'post';
  const lmpDaysAgo = f.lmpDate
    ? Math.floor((new Date() - new Date(f.lmpDate)) / (1000 * 60 * 60 * 24)) : 0;
  const showPregnancy = !isMale && !hadHysterectomy && !isPostMeno && isMarriedStatus && lmpDaysAgo >= 31;

  // ── All pages definition ──────────────────────────────
  const allPages = [
    // ── MODULE A ──
    { id: 'A1', module: 'A', title: 'Date of birth' },
    { id: 'A2', module: 'A', title: 'Biological sex' },
    { id: 'A4', module: 'A', title: 'Marital status' },

    // ── MODULE B (female only) ──
    ...(isMale ? [] : [
      { id: 'B1', module: 'B', title: 'Hysterectomy' },
      { id: 'B2', module: 'B', title: 'Menopausal status' },
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
    { id: 'D1', module: 'D', title: 'TSH test' },
    { id: 'D2', module: 'D', title: 'Free T4 test' },
    { id: 'D3', module: 'D', title: 'Free T3 test' },
    { id: 'D4', module: 'D', title: 'Antibody tests (Anti-TPO / Anti-Tg)' },
    { id: 'D5', module: 'D', title: 'Thyroid imaging' },

    // ── MODULE E ──
    { id: 'E1', module: 'E', title: 'Cause of hypothyroidism' },
    ...(f.hypoCause === 'hashimotos' ? [{ id: 'E2', module: 'E', title: "Hashimoto's thyroiditis" }] : []),
    { id: 'E3', module: 'E', title: 'Goitre' },

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

    // ── MODULE G ──
    { id: 'G1', module: 'G', title: 'Current treatment' },
    ...(f.onTreatment === 'yes' ? [{ id: 'G2', module: 'G', title: 'Dose change' }] : []),

    // ── MODULE H ──
    { id: 'H1', module: 'H', title: 'Dyslipidaemia / high cholesterol' },
    { id: 'H2', module: 'H', title: 'Anaemia' },
    ...(!isMale ? [{ id: 'H3', module: 'H', title: 'PCOS / PMOS' }] : []),
    ...(!isMale && !hadHysterectomy && f.maritalStatus === 'married'
      ? [{ id: 'H4', module: 'H', title: 'Infertility' }] : []),
    { id: 'H6', module: 'H', title: 'Additional notes' },
  ];

  const totalPages = allPages.length;
  const page = allPages[currentPage];
  const progress = Math.round(((currentPage + 1) / totalPages) * 100);

  const goNext = () => {
    if (currentPage < totalPages - 1) setCurrentPage(p => p + 1);
    else handleSubmit();
  };
  const goPrev = () => {
    if (currentPage > 0) setCurrentPage(p => p - 1);
    else onBack?.();
  };

  // ── Save & submit ─────────────────────────────────────
  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await conditionAPI.saveHypoQ(patientId, episodeId, mapFormToDb(f));
      onComplete();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try { await conditionAPI.saveHypoQ(patientId, episodeId, mapFormToDb(f)); }
    catch (e) {}
    finally { setSaving(false); }
  };

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

      // ── A1: DOB ──
      case 'A1': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>What is your date of birth?</div>
          <HypoField label="Date of birth">
            <HypoDateInput value={f.dob} onChange={set('dob')} />
          </HypoField>
          {f.dob && (
            <HypoInfoNote text={`Age: ${Math.floor((new Date() - new Date(f.dob)) / (365.25 * 24 * 60 * 60 * 1000))} years`} />
          )}
        </>
      );

      // ── A2: Sex ──
      case 'A2': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>What is your biological sex?</div>
          <HypoRadioGroup value={f.sex} onChange={set('sex')} options={[['male', 'Male'], ['female', 'Female'], ['other', 'Other']]} />
          {f.sex === 'female' && <HypoInfoNote text="Menstrual / pregnancy module will be shown next" />}
        </>
      );

      // ── A4: Marital status ──
      case 'A4': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>What is your marital status?</div>
          <HypoRadioGroup value={f.maritalStatus} onChange={set('maritalStatus')} options={[
            ['married', 'Married'], ['unmarried', 'Unmarried'],
            ['divorced', 'Divorced'], ['widowed', 'Widowed'],
          ]} />
          {f.maritalStatus && f.maritalStatus !== 'married' && (
            <HypoSkipNote text="Pregnancy question (B5) will be hidden" />
          )}
          {f.maritalStatus && <HypoOutputBox text={f.maritalStatus.charAt(0).toUpperCase() + f.maritalStatus.slice(1)} />}
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
                <HypoDurationPicker value={f.hysterectomyDate} onChange={set('hysterectomyDate')} label="" />
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
          {f.hysterectomy === 'yes' && <HypoSkipNote text="Menstrual changes, LMP and pregnancy questions will be skipped" />}
        </>
      );

      // ── B2: Menopausal status ──
      case 'B2': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>What is your menopausal status?</div>
          <HypoRadioGroup value={f.menopauseStatus} onChange={set('menopauseStatus')} options={[
            ['pre', 'Pre-menopausal'],
            ['peri', 'Peri-menopausal'],
            ['post', 'Post-menopausal'],
          ]} />
          {f.menopauseStatus === 'post' && (
            <HypoSubBlock>
              <HypoField label="How many years ago did menopause occur?">
                <HypoTextInput type="number" min="0" value={f.menopauseYears} onChange={set('menopauseYears')} style={{ width: 100 }} placeholder="Years" />
              </HypoField>
              <HypoSkipNote text="LMP and pregnancy questions will be skipped" />
              {f.menopauseYears && <HypoOutputBox text={`Post-menopausal status since last ${f.menopauseYears} year${f.menopauseYears > 1 ? 's' : ''}`} />}
            </HypoSubBlock>
          )}
          {(f.menopauseStatus === 'pre' || f.menopauseStatus === 'peri') && (
            <HypoInfoNote text="Menstrual, LMP and pregnancy questions will follow" />
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
                  options={[['regular', 'Regular'], ['irregular', 'Irregular']]} horizontal />
              </HypoField>
              <HypoField label="Flow characteristics (select all that apply)">
                <HypoMultiSelect value={(f.menstrualChangeTypes || []).filter(t => ['heavy', 'scanty', 'absent', 'prolonged'].includes(t))}
                  onChange={vals => {
                    const reg = (f.menstrualChangeTypes || []).filter(t => ['regular', 'irregular'].includes(t));
                    set('menstrualChangeTypes')([...reg, ...vals]);
                  }}
                  options={[['heavy', 'Heavy'], ['scanty', 'Scanty'], ['absent', 'Absent'], ['prolonged', 'Prolonged']]} />
              </HypoField>
              <HypoDurationPicker value={f.menstrualChangeDuration} onChange={set('menstrualChangeDuration')} label="Duration of this change" />
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
            <HypoDateInput value={f.lmpDate} onChange={set('lmpDate')} />
          </HypoField>
          {f.lmpDate && <HypoOutputBox text={`LMP: ${new Date(f.lmpDate).toLocaleDateString('en-IN')}`} />}
        </>
      );

      // ── B5: Pregnancy ──
      case 'B5': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Are you currently pregnant or trying to conceive?</div>
          <HypoInfoNote text={`LMP was ${lmpDaysAgo} days ago — pregnancy question shown`} />
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
                <HypoTextInput type="number" min="1900" max={new Date().getFullYear()} value={f.thyroidDxYear} onChange={set('thyroidDxYear')} style={{ width: 100 }} />
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
                <HypoTextInput type="number" min="1900" max={new Date().getFullYear()} value={f.thyroidSurgeryYear} onChange={set('thyroidSurgeryYear')} style={{ width: 100 }} />
              </HypoField>
            </HypoSubBlock>
          )}
        </>
      );

      // ── C2b: RAI ──
      case 'C2b': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you received radioiodine (RAI) therapy in the past?</div>
          <HypoRadioGroup value={f.thyroidRai} onChange={set('thyroidRai')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.thyroidRai === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Year of RAI therapy">
                <HypoTextInput type="number" min="1900" max={new Date().getFullYear()} value={f.thyroidRaiYear} onChange={set('thyroidRaiYear')} style={{ width: 100 }} />
              </HypoField>
            </HypoSubBlock>
          )}
        </>
      );

      // ── C3: Medication ──
      case 'C3': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Are you currently taking any thyroid medication?</div>
          <HypoRadioGroup value={f.thyroidMed} onChange={set('thyroidMed')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.thyroidMed === 'yes' && (
            <HypoSubBlock>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <HypoField label="Drug name"><HypoTextInput value={f.thyroidMedName} onChange={set('thyroidMedName')} placeholder="e.g. Levothyroxine" /></HypoField>
                <HypoField label="Brand name"><HypoTextInput value={f.thyroidMedBrand} onChange={set('thyroidMedBrand')} placeholder="e.g. Eltroxin, Thyronorm" /></HypoField>
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
                  ['misses_sometimes', 'Misses sometimes'],
                ]} horizontal />
              </HypoField>
              <HypoDurationPicker value={f.thyroidMedSince} onChange={set('thyroidMedSince')} label="Taking since" />
              {f.thyroidMedBrand && f.thyroidMedDose && f.thyroidMedSince && (
                <HypoOutputBox text={`On Tab. ${f.thyroidMedBrand} — ${f.thyroidMedDose} mcg ${formatDuration(f.thyroidMedSince)}`} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

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
              {['Type 1 diabetes', 'Rheumatoid arthritis', 'Lupus (SLE)', 'Vitiligo', "Addison's disease", 'Other'].map(cond => (
                <div key={cond} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={!!(f.autoimmuneItems || {})[cond]?.selected}
                    onChange={e => set('autoimmuneItems')({ ...(f.autoimmuneItems || {}), [cond]: { ...(f.autoimmuneItems?.[cond] || {}), selected: e.target.checked } })}
                    style={{ marginTop: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>{cond}</div>
                    {(f.autoimmuneItems || {})[cond]?.selected && (
                      <HypoDurationPicker value={(f.autoimmuneItems || {})[cond]?.duration || {}}
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
      case 'D1': return <HypoLabScreen label="TSH" field="tsh" unit="mIU/L" f={f} set={set}
        unitOptions={null} reportKey="tshReports"
        output={f.tshValue ? `TSH — ${f.tshValue} mIU/L (${f.tshDate ? new Date(f.tshDate).toLocaleDateString('en-IN') : ''})` : ''} />;

      case 'D2': return <HypoLabScreen label="Free T4" field="ft4" unit="" f={f} set={set}
        unitOptions={[['pmol_l', 'pmol/L'], ['ng_dl', 'ng/dL']]} reportKey="ft4Reports"
        output={f.ft4Value ? `Free T4 — ${f.ft4Value} ${f.ft4Unit || ''} (${f.ft4Date ? new Date(f.ft4Date).toLocaleDateString('en-IN') : ''})` : ''} />;

      case 'D3': return <HypoLabScreen label="Free T3" field="ft3" unit="" f={f} set={set}
        unitOptions={[['pmol_l', 'pmol/L'], ['pg_ml', 'pg/mL']]} reportKey="ft3Reports"
        output={f.ft3Value ? `Free T3 — ${f.ft3Value} ${f.ft3Unit || ''} (${f.ft3Date ? new Date(f.ft3Date).toLocaleDateString('en-IN') : ''})` : ''} />;

      // ── D4: Antibodies ──
      case 'D4': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you had Anti-TPO or Anti-thyroglobulin (Anti-Tg) antibodies tested?</div>
          <HypoRadioGroup value={f.antibodyDone} onChange={set('antibodyDone')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.antibodyDone === 'yes' && (
            <HypoSubBlock>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>Either or both can be filled</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <HypoField label="Anti-TPO value"><HypoTextInput type="number" value={f.antitpoValue} onChange={set('antitpoValue')} placeholder="Value" /></HypoField>
                <HypoField label="Anti-TPO date"><HypoDateInput value={f.antitpoDate} onChange={set('antitpoDate')} /></HypoField>
                <HypoField label="Anti-Tg value"><HypoTextInput type="number" value={f.antitgValue} onChange={set('antitgValue')} placeholder="Value" /></HypoField>
                <HypoField label="Anti-Tg date"><HypoDateInput value={f.antitgDate} onChange={set('antitgDate')} /></HypoField>
              </div>
            </HypoSubBlock>
          )}
        </>
      );

      // ── D5: Imaging ──
      case 'D5': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you had a thyroid ultrasound or any other thyroid imaging done?</div>
          <HypoRadioGroup value={f.imagingDone} onChange={set('imagingDone')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.imagingDone === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Type of imaging (select all that apply)">
                <HypoMultiSelect value={f.imagingTypes} onChange={set('imagingTypes')} options={[
                  ['usg_thyroid', 'USG thyroid'], ['usg_neck', 'USG neck'],
                  ['thyroid_scan', 'Thyroid scan'], ['ct_neck', 'CT neck'], ['other', 'Other'],
                ]} />
              </HypoField>
              <HypoField label="Date of imaging"><HypoDateInput value={f.imagingDate} onChange={set('imagingDate')} /></HypoField>
              <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
                Upload imaging report (optional)
              </div>
            </HypoSubBlock>
          )}
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
              <HypoDurationPicker value={f.hypoDuration} onChange={set('hypoDuration')} label="Since when / duration" />
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
              {f.hypoCause === 'hashimotos' && <HypoInfoNote text="Hashimoto's confirmation questions will appear on the next screen" />}
            </HypoSubBlock>
          )}
        </>
      );

      // ── E2: Hashimoto's ──
      case 'E2': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you been confirmed to have Hashimoto's thyroiditis?</div>
          <HypoRadioGroup value={f.hashimotos} onChange={set('hashimotos')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.hashimotos === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Anti-TPO antibody result">
                <HypoRadioGroup value={f.hashimotosAntiTpo} onChange={set('hashimotosAntiTpo')} horizontal
                  options={[['positive', 'Positive'], ['negative', 'Negative'], ['not_tested', 'Not tested']]} />
              </HypoField>
              <HypoField label="Anti-Tg antibody result">
                <HypoRadioGroup value={f.hashimotosAntiTg} onChange={set('hashimotosAntiTg')} horizontal
                  options={[['positive', 'Positive'], ['negative', 'Negative'], ['not_tested', 'Not tested']]} />
              </HypoField>
              {f.hashimotosAntiTpo && (
                <HypoOutputBox text={`Hashimoto's thyroiditis — Anti-TPO ${f.hashimotosAntiTpo}${f.hashimotosAntiTg ? `, Anti-Tg ${f.hashimotosAntiTg}` : ''}`} />
              )}
            </HypoSubBlock>
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
              <HypoDurationPicker value={f.weightDuration} onChange={set('weightDuration')} label="Since when" />
              {f.weightDirection && f.weightKg && (
                <HypoOutputBox text={`Weight ${f.weightDirection === 'gained' ? 'gain' : 'loss'} of ${f.weightKg} kg ${formatDuration(f.weightDuration)}`} />
              )}
            </HypoSubBlock>
          )}
          {(f.weightChange === 'no' || f.weightChange === 'unsure') && <HypoSkipNote text="No/Unsure → next screen" />}
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
              <HypoDurationPicker value={f.bowelDuration} onChange={set('bowelDuration')} label="Since when" />
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
              <HypoDurationPicker value={f.abdominalDuration} onChange={set('abdominalDuration')} label="Since when" />
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
                <HypoMultiSelect value={f.skinTypes} onChange={set('skinTypes')}
                  options={[['dryness', 'Dryness'], ['roughness', 'Roughness'], ['pallor', 'Pallor'], ['puffiness', 'Puffiness'], ['thickening', 'Thickening']]} />
              </HypoField>
              <HypoDurationPicker value={f.skinDuration} onChange={set('skinDuration')} label="Since when" />
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
              <HypoDurationPicker value={f.pedalOedemaDuration} onChange={set('pedalOedemaDuration')} label="Since when" />
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
                    <HypoDurationPicker value={(f.hairItems || {})[val]?.duration || {}}
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
                    <HypoDurationPicker value={(f.nailItems || {})[val]?.duration || {}}
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
              <HypoDurationPicker value={f.hoarsenessDuration} onChange={set('hoarsenessDuration')} label="Since when" />
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
              <HypoDurationPicker value={f.weaknessDuration} onChange={set('weaknessDuration')} label="Since when" />
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
              <HypoDurationPicker value={f.depressionDuration} onChange={set('depressionDuration')} label="Since when" />
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
              <HypoDurationPicker value={f.bradycardiaDuration} onChange={set('bradycardiaDuration')} label="Since when" />
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
                <HypoRadioGroup value={f.giddinessFreq} onChange={set('giddinessFreq')} options={[
                  ['rarely', 'Rarely'], ['sometimes', 'Sometimes'],
                  ['often', 'Often'], ['every_time', 'Every time I stand'],
                ]} />
              </HypoField>
              <HypoDurationPicker value={f.giddinessDuration} onChange={set('giddinessDuration')} label="Since when" />
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
              <HypoField label="Type (select one)">
                <HypoRadioGroup value={f.hearingType} onChange={set('hearingType')} options={[
                  ['reduced', 'Reduced hearing'], ['tinnitus', 'Tinnitus (ringing)'], ['both', 'Both'],
                ]} />
              </HypoField>
              <HypoDurationPicker value={f.hearingDuration} onChange={set('hearingDuration')} label="Since when" />
              {f.hearingType && <HypoOutputBox text={`${f.hearingType === 'tinnitus' ? 'Tinnitus' : f.hearingType === 'reduced' ? 'Reduced hearing' : 'Reduced hearing and tinnitus'} ${formatDuration(f.hearingDuration)}`} />}
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
              <HypoDurationPicker value={f.reflexesDuration} onChange={set('reflexesDuration')} label="Since when" />
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
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{label}</div>
              <HypoRadioGroup value={(f.carpalItems || {})[type]?.status || ''}
                onChange={v => set('carpalItems')({ ...(f.carpalItems || {}), [type]: { ...(f.carpalItems?.[type] || {}), status: v } })}
                options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} horizontal />
              {(f.carpalItems || {})[type]?.status === 'yes' && (
                <HypoSubBlock>
                  <HypoField label="Which hand">
                    <HypoRadioGroup value={(f.carpalItems || {})[type]?.side || ''}
                      onChange={v => set('carpalItems')({ ...(f.carpalItems || {}), [type]: { ...(f.carpalItems?.[type] || {}), side: v } })}
                      horizontal options={[['right', 'Right'], ['left', 'Left'], ['both', 'Both']]} />
                  </HypoField>
                  <HypoDurationPicker value={(f.carpalItems || {})[type]?.duration || {}}
                    onChange={v => set('carpalItems')({ ...(f.carpalItems || {}), [type]: { ...(f.carpalItems?.[type] || {}), duration: v } })}
                    label="" />
                </HypoSubBlock>
              )}
            </div>
          ))}
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
          {f.macroglossia && <HypoOutputBox text={f.macroglossia === 'yes' ? 'Enlargement of tongue noted' : 'No enlargement of tongue'} />}
        </>
      );

      // ── G1: Treatment ──
      case 'G1': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Are you currently on treatment for hypothyroidism?</div>
          <HypoRadioGroup value={f.onTreatment} onChange={set('onTreatment')} options={[['no', 'No'], ['yes', 'Yes']]} />
          {f.onTreatment === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Treatment type">
                <HypoRadioGroup value={f.treatmentType} onChange={set('treatmentType')} options={[
                  ['levo_only', 'Levothyroxine only'],
                  ['lio_only', 'Liothyronine only'],
                  ['combination', 'Combination'],
                  ['other', 'Other'],
                ]} />
              </HypoField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <HypoField label="Drug name"><HypoTextInput value={f.levoDrugName} onChange={set('levoDrugName')} placeholder="e.g. Levothyroxine" /></HypoField>
                <HypoField label="Brand name"><HypoTextInput value={f.levoBrand} onChange={set('levoBrand')} placeholder="e.g. Thyronorm, Eltroxin" /></HypoField>
                <HypoField label="Current dose (mcg)"><HypoTextInput type="number" min="0" value={f.levoDose} onChange={set('levoDose')} /></HypoField>
              </div>
              <HypoField label="Timing">
                <HypoRadioGroup value={f.levoTiming} onChange={set('levoTiming')} horizontal options={[
                  ['before_breakfast', 'Before breakfast'],
                  ['after_breakfast', 'After breakfast'],
                  ['bedtime', 'Bedtime'],
                ]} />
              </HypoField>
              <HypoField label="Compliance">
                <HypoRadioGroup value={f.levoCompliance} onChange={set('levoCompliance')} horizontal options={[
                  ['regular', 'Regular'],
                  ['irregular', 'Irregular'],
                  ['misses_sometimes', 'Misses sometimes'],
                ]} />
              </HypoField>
              <HypoDurationPicker value={f.levoSince} onChange={set('levoSince')} label="Treatment started" />
              {f.levoBrand && f.levoDose && (
                <HypoOutputBox text={`On Tab. ${f.levoBrand} — ${f.levoDose} mcg ${formatDuration(f.levoSince)}`} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      // ── G2: Dose change ──
      case 'G2': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
            Has your <span style={{ color: 'var(--teal-600)' }}>{f.levoBrand || 'thyroid medication'}</span> dose been changed recently?
          </div>
          <HypoRadioGroup value={f.doseChanged} onChange={set('doseChanged')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.doseChanged === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Date of last dose change">
                <HypoDateInput value={f.doseChangedDate} onChange={set('doseChangedDate')} />
              </HypoField>
              <HypoField label="Reason for change">
                <HypoRadioGroup value={f.doseChangedReason} onChange={set('doseChangedReason')} options={[
                  ['tsh_increased', 'TSH increased'],
                  ['tsh_decreased', 'TSH decreased'],
                  ['pregnancy', 'Pregnancy'],
                  ['doctor_advice', "Doctor's advice / Other"],
                ]} />
              </HypoField>
              {f.doseChangedReason && f.doseChangedDate && (
                <HypoOutputBox text={`Dose of Tab. ${f.levoBrand || 'thyroid medication'} was ${
                  f.doseChangedReason === 'tsh_increased' ? 'increased' :
                  f.doseChangedReason === 'tsh_decreased' ? 'decreased' :
                  f.doseChangedReason === 'pregnancy' ? 'changed due to pregnancy' : 'changed on doctor\'s advice'
                } since ${new Date(f.doseChangedDate).toLocaleDateString('en-IN')} as ${
                  f.doseChangedReason === 'tsh_increased' ? 'TSH has increased' :
                  f.doseChangedReason === 'tsh_decreased' ? 'TSH has decreased' :
                  f.doseChangedReason === 'pregnancy' ? 'patient is pregnant' : "doctor's advice"
                }`} />
              )}
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
              <HypoDurationPicker value={f.dyslipidaemiaDuration} onChange={set('dyslipidaemiaDuration')} label="Since when" />
              <HypoOutputBox text={`Dyslipidaemia / Hypercholesterolaemia ${formatDuration(f.dyslipidaemiaDuration)}`} />
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
              <HypoField label="Type if known">
                <HypoRadioGroup value={f.anaemiaType} onChange={set('anaemiaType')} options={[
                  ['iron_deficiency', 'Iron deficiency'],
                  ['b12_deficiency', 'Vitamin B12 deficiency'],
                  ['folate_deficiency', 'Folate deficiency'],
                  ['other', 'Other'],
                  ['not_known', 'Not known'],
                ]} />
              </HypoField>
              {f.anaemiaType && <HypoOutputBox text={`K/c/o ${f.anaemiaType.replace('_', ' ')} anaemia`} />}
            </HypoSubBlock>
          )}
        </>
      );

      // ── H3: PCOS/PMOS ──
      case 'H3': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you been diagnosed with PCOS or PMOS?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>Polycystic Ovarian Syndrome (PCOS) / Polyendocrine Metabolic Ovarian Syndrome (PMOS)</div>
          <HypoRadioGroup value={f.pcosPmos} onChange={set('pcosPmos')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          {f.pcosPmos === 'yes' && (
            <HypoSubBlock>
              <HypoField label="Which diagnosis?">
                <HypoRadioGroup value={f.pcosPmosLabel} onChange={set('pcosPmosLabel')} horizontal
                  options={[['pcos', 'PCOS'], ['pmos', 'PMOS']]} />
              </HypoField>
              <HypoDurationPicker value={f.pcosDuration} onChange={set('pcosDuration')} label="Since when" />
              <HypoField label="Are you taking any medicines for this?">
                <HypoRadioGroup value={f.pcosOnMed} onChange={set('pcosOnMed')} horizontal
                  options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
              </HypoField>
              {f.pcosOnMed === 'yes' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <HypoField label="Medicine name"><HypoTextInput value={f.pcosMedName} onChange={set('pcosMedName')} placeholder="e.g. Metformin" /></HypoField>
                  <HypoField label="Dose (mg/mcg)"><HypoTextInput type="number" min="0" value={f.pcosMedDose} onChange={set('pcosMedDose')} /></HypoField>
                  <HypoField label="Times per day"><HypoTextInput type="number" min="1" max="6" value={f.pcosMedTimes} onChange={set('pcosMedTimes')} /></HypoField>
                </div>
              )}
              {f.pcosPmosLabel && (
                <HypoOutputBox text={`K/c/o ${f.pcosPmosLabel.toUpperCase()} ${formatDuration(f.pcosDuration)}${
                  f.pcosOnMed === 'yes' && f.pcosMedName ? `, on Tab. ${f.pcosMedName}${f.pcosMedDose ? ` (${f.pcosMedDose} mg)` : ''}${f.pcosMedTimes ? ` — ${f.pcosMedTimes} times a day` : ''}` : ''
                }`} />
              )}
            </HypoSubBlock>
          )}
        </>
      );

      // ── H4: Infertility ──
      case 'H4': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you experienced any difficulty conceiving? (Infertility)</div>
          <HypoRadioGroup value={f.infertility} onChange={set('infertility')} options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
          <HypoOutputBox text={f.infertility === 'yes' ? 'Difficulty in conceiving reported' : f.infertility === 'no' ? 'No difficulty in conceiving' : ''} />
        </>
      );

      // ── H6: Additional notes ──
      case 'H6': return (
        <>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Is there anything else about your thyroid condition or symptoms that you would like your doctor to know?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>This is optional</div>
          <textarea className="form-input" rows={5} style={{ resize: 'vertical', fontSize: 13 }}
            value={f.additionalNotes} onChange={e => set('additionalNotes')(e.target.value)}
            placeholder="Type anything additional here..." />
        </>
      );

      default: return <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Screen {page?.id}</div>;
    }
  };

  if (!page) return null;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
          <span>Question {currentPage + 1} of {totalPages}</span>
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
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        {error && <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'var(--red-700)' }}>{error}</div>}
        {renderPage()}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={goPrev}>
          ← {currentPage === 0 ? 'Back to condition selection' : 'Previous'}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleSaveDraft} disabled={saving}>
            {saving ? <Spinner size={14} /> : '💾 Save draft'}
          </button>
          <button className="btn btn-primary" onClick={goNext} disabled={saving}>
            {currentPage === totalPages - 1
              ? saving ? <Spinner size={14} color="#fff" /> : 'Submit questionnaire ✓'
              : 'Next →'}
          </button>
        </div>
      </div>
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
        <HypoDurationPicker value={f[durationKey]} onChange={set(durationKey)} label="Since when" />
        {extra}
        {output && <HypoOutputBox text={output} />}
      </HypoSubBlock>
    )}
    {(f[statusKey] === 'no' || f[statusKey] === 'unsure') && (
      <HypoSkipNote text="No / Unsure → next screen immediately" />
    )}
  </>
);

// ─── Reusable lab screen ──────────────────────────────────
const HypoLabScreen = ({ label, field, unit, unitOptions, f, set, reportKey, output }) => {
  const done = f[`${field}Done`];
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Have you had a {label} test done?</div>
      <HypoRadioGroup value={done} onChange={set(`${field}Done`)}
        options={[['no', 'No'], ['unsure', 'Unsure'], ['yes', 'Yes']]} />
      {done === 'yes' && (
        <HypoSubBlock>
          <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 12, textAlign: 'center', marginBottom: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
            Upload test report (JPG / PNG / PDF) — AI will auto-extract values
            <div style={{ marginTop: 6 }}>
              <button className="btn btn-ghost btn-sm">+ Add another report</button>
            </div>
          </div>
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

// ─── DB mapping helpers ───────────────────────────────────
function mapFormToDb(f) {
  return {
    hypo_cause_known: f.hypoCauseKnown === 'yes',
    cause: f.hypoCause || null,
    hypo_duration_date: f.hypoDuration?.date || null,
    hypo_duration_years: f.hypoDuration?.years || null,
    hypo_duration_months: f.hypoDuration?.months || null,
    hypo_duration_days: f.hypoDuration?.days || null,
    goitre_present: f.goitre === 'yes',
    goitre_size_value: f.goitreSize || null,
    hashimotos_confirmed: f.hashimotos === 'yes',
    hashimotos_anti_tpo: f.hashimotosAntiTpo || null,
    hashimotos_anti_tg: f.hashimotosAntiTg || null,
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
    sym_hair_data: f.hairItems && Object.keys(f.hairItems).length ? JSON.stringify(f.hairItems) : null,
    sym_nail_status: f.nails || null,
    sym_nail_data: f.nailItems && Object.keys(f.nailItems).length ? JSON.stringify(f.nailItems) : null,
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
    sym_hearing_type: f.hearingType || null,
    sym_hearing_since_date: f.hearingDuration?.date || null,
    sym_hearing_years: f.hearingDuration?.years || null,
    sym_hearing_months: f.hearingDuration?.months || null,
    sym_hearing_days: f.hearingDuration?.days || null,
    sym_reflexes_status: f.reflexes || null,
    sym_reflexes_since_date: f.reflexesDuration?.date || null,
    sym_reflexes_years: f.reflexesDuration?.years || null,
    sym_reflexes_months: f.reflexesDuration?.months || null,
    sym_reflexes_days: f.reflexesDuration?.days || null,
    sym_carpal_data: f.carpalItems && Object.keys(f.carpalItems).length ? JSON.stringify(f.carpalItems) : null,
    sym_macroglossia_status: f.macroglossia || null,
    on_treatment: f.onTreatment === 'yes',
    treatment_type: f.treatmentType || null,
    levo_drug_name: f.levoDrugName || null,
    levo_brand: f.levoBrand || null,
    levo_dose_mcg: f.levoDose || null,
    levo_timing: f.levoTiming || null,
    levo_compliance_val: f.levoCompliance || null,
    treatment_start_date_val: f.levoSince?.date || null,
    treatment_start_years: f.levoSince?.years || null,
    treatment_start_months_val: f.levoSince?.months || null,
    dose_changed_status: f.doseChanged || null,
    dose_last_changed_date: f.doseChangedDate || null,
    dose_change_reason_type: f.doseChangedReason || null,
    has_dyslipidaemia: f.dyslipidaemia === 'yes',
    dyslipidaemia_since_date: f.dyslipidaemiaDuration?.date || null,
    dyslipidaemia_years: f.dyslipidaemiaDuration?.years || null,
    dyslipidaemia_months: f.dyslipidaemiaDuration?.months || null,
    dyslipidaemia_days: f.dyslipidaemiaDuration?.days || null,
    has_anaemia: f.anaemia === 'yes',
    anaemia_type: f.anaemiaType || null,
    has_pcos: f.pcosPmos === 'yes',
    pcos_pmos_label: f.pcosPmosLabel || null,
    pcos_since_date: f.pcosDuration?.date || null,
    pcos_years: f.pcosDuration?.years || null,
    pcos_months: f.pcosDuration?.months || null,
    pcos_days: f.pcosDuration?.days || null,
    pcos_on_medication: f.pcosOnMed || null,
    pcos_med_name: f.pcosMedName || null,
    pcos_med_dose: f.pcosMedDose || null,
    pcos_med_times_per_day: f.pcosMedTimes || null,
    has_infertility: f.infertility === 'yes',
    additional_notes: f.additionalNotes || null,
  };
}

function mapDbToForm(r) {
  return {
    hypoCauseKnown: r.hypo_cause_known ? 'yes' : 'no',
    hypoCause: r.cause || '',
    hypoDuration: { date: r.hypo_duration_date, years: r.hypo_duration_years, months: r.hypo_duration_months, days: r.hypo_duration_days },
    goitre: r.goitre_present ? 'yes' : 'no',
    goitreSize: r.goitre_size_value || '',
    hashimotos: r.hashimotos_confirmed ? 'yes' : 'no',
    hashimotosAntiTpo: r.hashimotos_anti_tpo || '',
    hashimotosAntiTg: r.hashimotos_anti_tg || '',
    fatigue: r.sym_fatigue_status || '',
    fatigueDuration: { date: r.sym_fatigue_since_date, years: r.sym_fatigue_years, months: r.sym_fatigue_months, days: r.sym_fatigue_days },
    fatigueSeverity: r.sym_fatigue_severity || '',
    onTreatment: r.on_treatment ? 'yes' : 'no',
    treatmentType: r.treatment_type || '',
    levoDrugName: r.levo_drug_name || '',
    levoBrand: r.levo_brand || '',
    levoDose: r.levo_dose_mcg || '',
    levoTiming: r.levo_timing || '',
    levoCompliance: r.levo_compliance_val || '',
    levoSince: { date: r.treatment_start_date_val, years: r.treatment_start_years, months: r.treatment_start_months_val },
    doseChanged: r.dose_changed_status || '',
    doseChangedDate: r.dose_last_changed_date || '',
    doseChangedReason: r.dose_change_reason_type || '',
    dyslipidaemia: r.has_dyslipidaemia ? 'yes' : 'no',
    anaemia: r.has_anaemia ? 'yes' : 'no',
    anaemiaType: r.anaemia_type || '',
    pcosPmos: r.has_pcos ? 'yes' : 'no',
    pcosPmosLabel: r.pcos_pmos_label || '',
    pcosOnMed: r.pcos_on_medication || '',
    pcosMedName: r.pcos_med_name || '',
    pcosMedDose: r.pcos_med_dose || '',
    pcosMedTimes: r.pcos_med_times_per_day || '',
    infertility: r.has_infertility ? 'yes' : 'no',
    additionalNotes: r.additional_notes || '',
  };
}

// ═══════════════════════════════════════════════════════════
// HYPERTHYROIDISM / GRAVES' DISEASE QUESTIONNAIRE
// ── Replaced with full chatbot-style 1-question-per-page
//    component. Imported from HyperQuestionnaire.js
// ═══════════════════════════════════════════════════════════
export { default as HyperQuestionnaire } from './HyperQuestionnaire';

// THYROID CANCER QUESTIONNAIRE
// ═══════════════════════════════════════════════════════════
export const TcQuestionnaire = ({ patientId, episodeId, onComplete, onBack }) => {
  const [f, setF] = useState({
    cancerType: '', laterality: '', multifocal: false, multifocalCount: '',
    tumourSizeMm: '', extrathyroidalExtension: false, extrathyroidalExtent: '',
    tStage: '', nStage: '', mStage: '', overallStage: '', riskCategory: '',
    fnacDone: false, fnacDate: '', fnacResult: '', fnacDetails: '',
    coreBiopsyDone: false, coreBiopsyDate: '', coreBiopsyResult: '',
    histopathologyReport: '', histopathologyDate: '',
    symRapidlyGrowingNodule: false, symHardFixedNodule: false,
    symCervicalLymphadenopathy: false, symHoarseness: false,
    symDysphagia: 'none', symStridor: false, symBonePain: false, symHaemoptysis: false,
    mtcCalcitoninElevated: false, mtcCeaElevated: false,
    mtcRetMutation: false, mtcRetMutationDetails: '',
    mtcFamilyScreeningAdvised: false, mtcMen2Associated: false, mtcMen2Type: '',
    tshAtDiagnosis: '', tgAtDiagnosis: '', antiTgAtDiagnosis: '',
    calcitoninAtDiagnosis: '', ceaAtDiagnosis: '',
    srCalciumAtDiagnosis: '', vitD3AtDiagnosis: '', pthAtDiagnosis: '',
    surgeryDone: false, raiTherapyDone: false, onTshSuppression: false,
    onExternalBeamRt: false, onTargetedTherapy: false,
    onChemotherapy: false, onActiveSurveillance: false,
    tshSuppressionTarget: '', tshSuppressionIndication: '',
    levothyroxineDoseMcg: '', levothyroxineBrand: '', levothyroxineCompliance: '',
    surveillanceInterval: '', nextTgDate: '', nextUsgDate: '',
    nextRaiScanDate: '', nextReviewDate: '', surveillanceNotes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = k => v => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    conditionAPI.getTcQ(patientId, episodeId)
      .then(r => { if (r.data) setF(p => ({ ...p, ...r.data })); })
      .catch(() => {});
  }, [patientId, episodeId]);

  const save = async (andContinue = false) => {
    setSaving(true); setError('');
    try {
      await conditionAPI.saveTcQ(patientId, episodeId, f);
      if (andContinue) onComplete();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save. Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Thyroid Cancer — Condition-specific questions</h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>Part 2 of 2</p>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      <SectionTitle icon="🔴" title="Cancer Characterisation" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Type of thyroid cancer" required>
          <Select value={f.cancerType} onChange={set('cancerType')} options={[
            ['papillary', 'Papillary thyroid carcinoma (PTC)'],
            ['follicular', 'Follicular thyroid carcinoma (FTC)'],
            ['hurthle_cell', 'Hürthle cell carcinoma'],
            ['medullary', 'Medullary thyroid carcinoma (MTC)'],
            ['anaplastic', 'Anaplastic thyroid carcinoma'],
            ['poorly_differentiated', 'Poorly differentiated carcinoma'],
            ['other', 'Other / not yet confirmed'],
          ]} />
        </Field>
        <Field label="Side affected">
          <Select value={f.laterality} onChange={set('laterality')} options={[
            ['left', 'Left lobe'], ['right', 'Right lobe'],
            ['bilateral', 'Both lobes'], ['isthmus', 'Isthmus'],
          ]} />
        </Field>
        <Field label="Tumour size (mm)">
          <Input value={f.tumourSizeMm} onChange={set('tumourSizeMm')} type="number" min="0" step="0.5" />
        </Field>
      </div>
      <BoolRow label="Multifocal tumour (more than one tumour in the thyroid)?" value={f.multifocal} onChange={set('multifocal')} />
      {f.multifocal && (
        <Field label="Number of tumours">
          <Input value={f.multifocalCount} onChange={set('multifocalCount')} type="number" min="2" />
        </Field>
      )}
      <BoolRow label="Extrathyroidal extension (tumour growing outside the thyroid capsule)?" value={f.extrathyroidalExtension} onChange={set('extrathyroidalExtension')} />
      {f.extrathyroidalExtension && (
        <Field label="Extent">
          <Select value={f.extrathyroidalExtent} onChange={set('extrathyroidalExtent')} options={[
            ['minimal', 'Minimal / microscopic'],
            ['gross', 'Gross / macroscopic'],
          ]} />
        </Field>
      )}

      <SectionTitle icon="🏷️" title="TNM Staging" />
      <div style={{ padding: 12, background: 'var(--blue-50)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: 'var(--blue-700)' }}>
        ℹ️ Fill in if staging has been done by your surgeon / oncologist. Leave blank if not yet staged.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="T stage (tumour size/extent)">
          <Select value={f.tStage} onChange={set('tStage')} options={[
            ['T1a','T1a (≤1cm)'], ['T1b','T1b (1–2cm)'], ['T2','T2 (2–4cm)'],
            ['T3a','T3a (>4cm, intrathyroidal)'], ['T3b','T3b (extrathyroidal, strap muscles)'],
            ['T4a','T4a (gross extrathyroidal)'], ['T4b','T4b (encases carotid/mediastinum)'],
          ]} />
        </Field>
        <Field label="N stage (lymph nodes)">
          <Select value={f.nStage} onChange={set('nStage')} options={[
            ['N0','N0 (no nodal spread)'], ['N1a','N1a (central neck nodes)'],
            ['N1b','N1b (lateral neck nodes)'],
          ]} />
        </Field>
        <Field label="M stage (metastasis)">
          <Select value={f.mStage} onChange={set('mStage')} options={[
            ['M0','M0 (no distant metastasis)'], ['M1','M1 (distant metastasis present)'],
          ]} />
        </Field>
        <Field label="Overall stage">
          <Select value={f.overallStage} onChange={set('overallStage')} options={[
            ['I','Stage I'], ['II','Stage II'], ['III','Stage III'],
            ['IVA','Stage IVA'], ['IVB','Stage IVB'], ['IVC','Stage IVC'],
          ]} />
        </Field>
        <Field label="ATA Risk category">
          <Select value={f.riskCategory} onChange={set('riskCategory')} options={[
            ['very_low','Very low risk'], ['low','Low risk'],
            ['intermediate','Intermediate risk'], ['high','High risk'],
          ]} />
        </Field>
      </div>

      <SectionTitle icon="🔬" title="FNAC / Biopsy" />
      <BoolRow label="FNAC (fine needle aspiration cytology) done?" value={f.fnacDone} onChange={set('fnacDone')} />
      {f.fnacDone && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="FNAC date">
            <Input value={f.fnacDate} onChange={set('fnacDate')} type="date" max={new Date().toISOString().split('T')[0]} />
          </Field>
          <Field label="Bethesda category" hint="I=non-diagnostic, VI=malignant">
            <Select value={f.fnacResult} onChange={set('fnacResult')} options={[
              ['I','Bethesda I — Non-diagnostic'],
              ['II','Bethesda II — Benign'],
              ['III','Bethesda III — Atypia of undetermined significance'],
              ['IV','Bethesda IV — Follicular neoplasm'],
              ['V','Bethesda V — Suspicious for malignancy'],
              ['VI','Bethesda VI — Malignant'],
            ]} />
          </Field>
          <Field label="FNAC details / cell type" style={{ gridColumn: '1/-1' }}>
            <Input value={f.fnacDetails} onChange={set('fnacDetails')} placeholder="e.g. PTC, follicular pattern, colloid..." />
          </Field>
        </div>
      )}
      <BoolRow label="Histopathology report available?" value={!!f.histopathologyReport} onChange={v => v ? null : set('histopathologyReport')('')} />
      {f.histopathologyReport !== undefined && (
        <>
          <Field label="Histopathology findings">
            <textarea className="form-control" rows={3} style={{ fontSize: 13 }}
              value={f.histopathologyReport} onChange={e => set('histopathologyReport')(e.target.value)}
              placeholder="Key findings from surgical pathology report..." />
          </Field>
          <Field label="Date of histopathology report">
            <Input value={f.histopathologyDate} onChange={set('histopathologyDate')} type="date" max={new Date().toISOString().split('T')[0]} />
          </Field>
        </>
      )}

      <SectionTitle icon="🩺" title="Cancer-specific Symptoms" />
      <BoolRow label="Rapidly growing neck nodule" value={f.symRapidlyGrowingNodule} onChange={set('symRapidlyGrowingNodule')} />
      <BoolRow label="Hard, fixed (non-mobile) nodule in neck" value={f.symHardFixedNodule} onChange={set('symHardFixedNodule')} />
      <BoolRow label="Enlarged cervical lymph nodes (neck glands)" value={f.symCervicalLymphadenopathy} onChange={set('symCervicalLymphadenopathy')} />
      <BoolRow label="Hoarseness / change in voice" value={f.symHoarseness} onChange={set('symHoarseness')} />
      <SeveritySelect label="Difficulty swallowing (dysphagia) severity" value={f.symDysphagia} onChange={set('symDysphagia')} />
      <BoolRow label="Stridor (noisy breathing / high-pitched sound on breathing)" value={f.symStridor} onChange={set('symStridor')} />
      <BoolRow label="Bone pain (unexplained)" value={f.symBonePain} onChange={set('symBonePain')} hint="May indicate bone metastasis" />
      <BoolRow label="Haemoptysis (coughing blood)" value={f.symHaemoptysis} onChange={set('symHaemoptysis')} />

      {f.cancerType === 'medullary' && (
        <>
          <SectionTitle icon="🧬" title="Medullary Cancer (MTC) Specific" />
          <BoolRow label="Calcitonin elevated?" value={f.mtcCalcitoninElevated} onChange={set('mtcCalcitoninElevated')} />
          <BoolRow label="CEA (carcinoembryonic antigen) elevated?" value={f.mtcCeaElevated} onChange={set('mtcCeaElevated')} />
          <BoolRow label="RET proto-oncogene mutation present?" value={f.mtcRetMutation} onChange={set('mtcRetMutation')} />
          {f.mtcRetMutation && (
            <Field label="RET mutation details">
              <Input value={f.mtcRetMutationDetails} onChange={set('mtcRetMutationDetails')} placeholder="e.g. C634R, M918T..." />
            </Field>
          )}
          <BoolRow label="Family screening advised?" value={f.mtcFamilyScreeningAdvised} onChange={set('mtcFamilyScreeningAdvised')} />
          <BoolRow label="Associated with MEN2 syndrome?" value={f.mtcMen2Associated} onChange={set('mtcMen2Associated')} />
          {f.mtcMen2Associated && (
            <Field label="MEN2 type">
              <Select value={f.mtcMen2Type} onChange={set('mtcMen2Type')} options={[
                ['MEN2A', 'MEN2A (MTC + phaeochromocytoma + hyperparathyroidism)'],
                ['MEN2B', 'MEN2B (MTC + phaeochromocytoma + marfanoid)'],
              ]} />
            </Field>
          )}
        </>
      )}

      <SectionTitle icon="🧪" title="Biochemistry at Diagnosis" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[
          ['tshAtDiagnosis', 'TSH (mIU/L)', '0', '0.001'],
          ['tgAtDiagnosis', 'Thyroglobulin / Tg (ng/mL)', '0', '0.1'],
          ['antiTgAtDiagnosis', 'Anti-Tg antibody (IU/mL)', '0', '0.1'],
          ['calcitoninAtDiagnosis', 'Calcitonin (pg/mL)', '0', '0.1'],
          ['ceaAtDiagnosis', 'CEA (ng/mL)', '0', '0.01'],
          ['srCalciumAtDiagnosis', 'Sr. Calcium (mg/dL)', '0', '0.1'],
          ['vitD3AtDiagnosis', 'Vitamin D3 / 25-OH (ng/mL)', '0', '0.1'],
          ['pthAtDiagnosis', 'PTH — Parathyroid Hormone (pg/mL)', '0', '0.1'],
        ].map(([key, label, min, step]) => (
          <Field key={key} label={label}>
            <Input value={f[key]} onChange={set(key)} type="number" min={min} step={step} />
          </Field>
        ))}
      </div>

      <SectionTitle icon="🏥" title="Treatment Received" />
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>Which treatments have you received or are currently receiving?</p>
      <BoolRow label="Surgery (thyroidectomy)" value={f.surgeryDone} onChange={set('surgeryDone')} hint="Details can be added by your doctor in the treatment history section" />
      <BoolRow label="Radioiodine (RAI / I-131) therapy" value={f.raiTherapyDone} onChange={set('raiTherapyDone')} />
      <BoolRow label="TSH suppression therapy (high-dose Levothyroxine)" value={f.onTshSuppression} onChange={set('onTshSuppression')} />
      {f.onTshSuppression && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, paddingLeft: 12 }}>
          <Field label="TSH suppression target" hint="e.g. <0.1 for high risk">
            <Input value={f.tshSuppressionTarget} onChange={set('tshSuppressionTarget')} placeholder="e.g. <0.1 mIU/L" />
          </Field>
          <Field label="Levothyroxine dose (mcg)">
            <Input value={f.levothyroxineDoseMcg} onChange={set('levothyroxineDoseMcg')} type="number" min="0" step="12.5" />
          </Field>
          <Field label="Compliance">
            <Select value={f.levothyroxineCompliance} onChange={set('levothyroxineCompliance')} options={[
              ['good', 'Good'], ['poor', 'Poor'], ['irregular', 'Irregular'],
            ]} />
          </Field>
        </div>
      )}
      <BoolRow label="External beam radiotherapy (EBRT)" value={f.onExternalBeamRt} onChange={set('onExternalBeamRt')} />
      <BoolRow label="Targeted therapy (kinase inhibitors e.g. Sorafenib, Lenvatinib)" value={f.onTargetedTherapy} onChange={set('onTargetedTherapy')} />
      <BoolRow label="Chemotherapy" value={f.onChemotherapy} onChange={set('onChemotherapy')} />
      <BoolRow label="Active surveillance (watchful waiting — no treatment currently)" value={f.onActiveSurveillance} onChange={set('onActiveSurveillance')} />

      <SectionTitle icon="📅" title="Surveillance Plan" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Surveillance interval">
          <Select value={f.surveillanceInterval} onChange={set('surveillanceInterval')} options={[
            ['3_months', 'Every 3 months'], ['6_months', 'Every 6 months'],
            ['12_months', 'Yearly'], ['24_months', 'Every 2 years'],
          ]} />
        </Field>
        <Field label="Next Tg (thyroglobulin) test date">
          <Input value={f.nextTgDate} onChange={set('nextTgDate')} type="date" />
        </Field>
        <Field label="Next neck USG date">
          <Input value={f.nextUsgDate} onChange={set('nextUsgDate')} type="date" />
        </Field>
        <Field label="Next RAI scan date (if applicable)">
          <Input value={f.nextRaiScanDate} onChange={set('nextRaiScanDate')} type="date" />
        </Field>
        <Field label="Next specialist review date">
          <Input value={f.nextReviewDate} onChange={set('nextReviewDate')} type="date" />
        </Field>
      </div>
      <Field label="Surveillance notes">
        <textarea className="form-control" rows={2} style={{ fontSize: 13 }}
          value={f.surveillanceNotes} onChange={e => set('surveillanceNotes')(e.target.value)}
          placeholder="Any specific instructions from your doctor..." />
      </Field>

      <QuestionnaireFooter onBack={onBack} onSave={() => save(false)} saving={saving} onSaveAndContinue={() => save(true)} />
    </div>
  );
};
