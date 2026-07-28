/**
 * CoreQuestionnaire.js
 * Shared questionnaire section — filled once per episode for ALL conditions.
 * Covers: chief complaint, general symptoms, vitals, past/family/surgical history,
 *         medications, allergies, social history, obstetric history.
 *
 * Props:
 *   patientId    — string UUID
 *   episodeId    — string UUID
 *   condition    — 'hypothyroidism' | 'hyperthyroidism' | 'thyroid_cancer'
 *   patientGender — 'male' | 'female' | 'other'
 *   onComplete   — () => void (called after successful save)
 *   onBack       — () => void
 */

import React, { useState, useEffect } from 'react';
import { conditionAPI } from '../api';
import { Spinner, Alert } from './common/index';

// ── Reusable field components ─────────────────────────────
const Field = ({ label, required, children, hint }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
      {label} {required && <span style={{ color: 'var(--red-600)' }}>*</span>}
    </label>
    {children}
    {hint && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{hint}</div>}
  </div>
);

const Input = ({ value, onChange, type = 'text', placeholder, max, min, style }) => (
  <input
    className="form-control"
    type={type}
    value={value || ''}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    max={max} min={min}
    style={{ fontSize: 13, ...style }}
  />
);

const Select = ({ value, onChange, options, placeholder = 'Select...' }) => (
  <select className="form-control" value={value || ''} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }}>
    <option value="">{placeholder}</option>
    {options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
  </select>
);

const FreqSelect = ({ value, onChange, label }) => (
  <Field label={label}>
    <Select value={value} onChange={onChange} options={[
      ['never','Never'], ['occasionally','Occasionally'], ['frequently','Frequently'], ['always','Always']
    ]} />
  </Field>
);

const BoolRow = ({ label, value, onChange }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
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
);

const SectionTitle = ({ title, icon }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', padding: '14px 0 8px', borderBottom: '2px solid var(--border)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
    <span>{icon}</span>{title}
  </div>
);

// ── Medication entry row ──────────────────────────────────
const MedRow = ({ med, onChange, onRemove }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
    <input className="form-control" style={{ fontSize: 12 }} placeholder="Drug name" value={med.name || ''} onChange={e => onChange({ ...med, name: e.target.value })} />
    <input className="form-control" style={{ fontSize: 12 }} placeholder="Dose" value={med.dose || ''} onChange={e => onChange({ ...med, dose: e.target.value })} />
    <input className="form-control" style={{ fontSize: 12 }} placeholder="Frequency" value={med.frequency || ''} onChange={e => onChange({ ...med, frequency: e.target.value })} />
    <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-400)', fontSize: 16, padding: '0 4px' }}>×</button>
  </div>
);

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────
const CoreQuestionnaire = ({ patientId, episodeId, condition, patientGender, onComplete, onBack }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState(0);

  const [f, setF] = useState({
    // Chief complaint
    chiefComplaint: '', complaintDurationValue: '', complaintDurationUnit: 'months',
    // General symptoms
    symFatigue: 'never', symWeightChange: '', symWeightKg: '', symWeightDurationWeeks: '',
    symNeckSwelling: false, symNeckSwellingSide: '',
    symNeckPain: 'never', symDifficultySwallowing: 'never', symVoiceChange: false,
    symBreathlessness: 'never', symPalpitations: 'never',
    symHeatIntolerance: false, symColdIntolerance: false,
    symHairLoss: 'never', symSkinChanges: '', symBowelChanges: '',
    symMenstrualChanges: '', symMoodChanges: '', symMuscleWeakness: 'never',
    symJointPain: 'never', symEyeChanges: false, symOther: '',
    // Vitals
    heightCm: '', weightKg: '', bmi: '',
    bpSystolic: '', bpDiastolic: '', heartRate: '', temperatureCelsius: '',
    // PMH
    pmhHypertension: false, pmhDiabetes: false, pmhCardiac: false,
    pmhRenal: false, pmhLiver: false, pmhAutoimmune: false, pmhAutoimmuneDetails: '',
    pmhAutoimmuneConditions: [], pmhAutoimmuneOther: '',
    pmhHysterectomy: false,
    hysterectomyDatePrecision: 'full', hysterectomyDate: '', hysterectomyYear: '', hysterectomyMonth: '',
    hysterectomyReason: '', hysterectomyReasonOther: '',
    pmhPreviousThyroid: false, pmhPreviousThyroidDetails: '',
    pmhNeckRadiation: false, pmhNeckRadiationDetails: '', pmhOther: '',
    // Surgical
    surgicalHistory: false, surgicalHistoryDetails: '',
    // Family history
    fhThyroidDisease: false, fhThyroidDetails: '', fhThyroidRelations: [], fhThyroidCondition: '',
    fhThyroidCancer: false,
    fhThyroidCancerDetails: '', fhAutoimmune: false, fhAutoimmuneDetails: '',
    fhMenSyndrome: false, fhOther: '',
    // Medications
    currentMedications: [], allergies: '', contrastAllergy: false,
    // Social
    maritalStatus: '',
    smokingStatus: '', smokingPackYears: '', alcoholStatus: '',
    occupation: '', radiationExposure: false, radiationExposureDetails: '',
    // Obstetric
    menopauseStatus: 'pre', menopauseYearsAgo: '',
    menstrualChangeStatus: '', menstrualPattern: '', menstrualFlow: [],
    menstrualSinceDate: '', menstrualYears: '', menstrualMonths: '',
    isPregnant: false, isBreastfeeding: false, gravida: '', para: '', lastMenstrualPeriod: '', eddDate: '',
    // Previous investigations
    prevTshDone: false, prevTshValue: '', prevTshDate: '',
    prevUsgDone: false, prevUsgDate: '',
    prevFnacDone: false, prevFnacResult: '',
  });

  const set = (key) => (val) => setF(p => ({ ...p, [key]: val }));

  // ── Gender / reproductive visibility rules ────────────
  const isMale          = patientGender === 'male';
  const hadHysterectomy = f.pmhHysterectomy === true;
  const isUnmarried     = f.maritalStatus === 'unmarried';
  const showObstetric   = !isMale;                              // male → hide entire obstetric section
  const showPregnancyQns = showObstetric && !hadHysterectomy && !isUnmarried; // hysterectomy OR unmarried → hide pregnancy
  const showLMP         = !isMale && !hadHysterectomy;          // male or hysterectomy → hide LMP
  const showMenstrualSym = !isMale && !hadHysterectomy;         // male or hysterectomy → hide menstrual symptom

  // ── Auto-calculate BMI ────────────────────────────────
  useEffect(() => {
    const h = parseFloat(f.heightCm), w = parseFloat(f.weightKg);
    if (h > 0 && w > 0) {
      setF(p => ({ ...p, bmi: (w / Math.pow(h / 100, 2)).toFixed(1) }));
    }
  }, [f.heightCm, f.weightKg]);

  // ── Auto-calculate & persist EDD (LMP + 9 months + 7 days) ────
  useEffect(() => {
    if (f.isPregnant && f.lastMenstrualPeriod) {
      const d = new Date(f.lastMenstrualPeriod);
      d.setMonth(d.getMonth() + 9);
      d.setDate(d.getDate() + 7);
      setF(p => ({ ...p, eddDate: d.toISOString().split('T')[0] }));
    } else if (!f.isPregnant && f.eddDate) {
      setF(p => ({ ...p, eddDate: '' }));
    }
  }, [f.isPregnant, f.lastMenstrualPeriod]);

  // ── Load existing data ────────────────────────────────
  useEffect(() => {
    if (!patientId || !episodeId) return;
    conditionAPI.getCoreQ(patientId, episodeId)
      .then(res => { if (res.data) setF(p => ({ ...p, ...mapDbToForm(res.data) })); })
      .catch(() => {});
  }, [patientId, episodeId]);

  const handleSave = async (andContinue = false) => {
    setSaving(true); setError('');
    try {
      await conditionAPI.saveCoreQ(patientId, episodeId, f);
      if (andContinue) onComplete();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    'Chief complaint',
    'General symptoms',
    'Vital signs',
    'Past medical history',
    'Family history',
    'Medications',
    'Social history',
    'Previous investigations',
  ];

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Medical questionnaire — Part 1 of 2</h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
        General health history — shared for all conditions
      </p>

      {/* ── Section progress tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {sections.map((s, i) => (
          <button key={i} onClick={() => setActiveSection(i)} style={{
            padding: '4px 10px', borderRadius: 20, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer',
            border: `1px solid ${activeSection === i ? 'var(--teal-400)' : 'var(--border)'}`,
            background: activeSection === i ? 'var(--teal-50)' : 'transparent',
            color: activeSection === i ? 'var(--teal-600)' : 'var(--text-secondary)',
            fontWeight: activeSection === i ? 600 : 400,
          }}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      {/* ── Section 0: Chief complaint ── */}
      {activeSection === 0 && (
        <div>
          <SectionTitle icon="📋" title="Chief Complaint" />
          <Field label="What is your main concern / reason for seeking an online opinion?" required>
            <textarea className="form-control" rows={3} style={{ fontSize: 13, resize: 'vertical' }}
              value={f.chiefComplaint} onChange={e => set('chiefComplaint')(e.target.value)}
              placeholder="Describe your main symptom or concern in your own words..." />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Duration — how long have you had this problem?">
              <Input value={f.complaintDurationValue} onChange={set('complaintDurationValue')} type="number" min="0" placeholder="e.g. 6" />
            </Field>
            <Field label="Unit">
              <Select value={f.complaintDurationUnit} onChange={set('complaintDurationUnit')} options={[
                ['days','Days'], ['weeks','Weeks'], ['months','Months'], ['years','Years']
              ]} />
            </Field>
          </div>
        </div>
      )}

      {/* ── Section 1: General symptoms ── */}
      {activeSection === 1 && (
        <div>
          <SectionTitle icon="🩺" title="General Symptoms" />
          <FreqSelect label="Fatigue / tiredness" value={f.symFatigue} onChange={set('symFatigue')} />
          <Field label="Weight change">
            <Select value={f.symWeightChange} onChange={set('symWeightChange')} options={[
              ['gained','Weight gained'], ['lost','Weight lost'], ['no_change','No change']
            ]} />
          </Field>
          {f.symWeightChange && f.symWeightChange !== 'no_change' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="How much weight (kg)?">
                <Input value={f.symWeightKg} onChange={set('symWeightKg')} type="number" min="0" placeholder="kg" />
              </Field>
              <Field label="Over how many weeks?">
                <Input value={f.symWeightDurationWeeks} onChange={set('symWeightDurationWeeks')} type="number" min="0" />
              </Field>
            </div>
          )}
          <BoolRow label="Neck swelling or visible lump" value={f.symNeckSwelling} onChange={set('symNeckSwelling')} />
          {f.symNeckSwelling && (
            <Field label="Which side?">
              <Select value={f.symNeckSwellingSide} onChange={set('symNeckSwellingSide')} options={[
                ['left','Left'], ['right','Right'], ['bilateral','Both sides']
              ]} />
            </Field>
          )}
          <FreqSelect label="Neck pain" value={f.symNeckPain} onChange={set('symNeckPain')} />
          <FreqSelect label="Difficulty swallowing" value={f.symDifficultySwallowing} onChange={set('symDifficultySwallowing')} />
          <BoolRow label="Change in voice / hoarseness" value={f.symVoiceChange} onChange={set('symVoiceChange')} />
          <FreqSelect label="Breathlessness / shortness of breath" value={f.symBreathlessness} onChange={set('symBreathlessness')} />
          <FreqSelect label="Palpitations / fast heartbeat" value={f.symPalpitations} onChange={set('symPalpitations')} />
          <BoolRow label="Heat intolerance (feeling unusually warm)" value={f.symHeatIntolerance} onChange={set('symHeatIntolerance')} />
          <BoolRow label="Cold intolerance (feeling unusually cold)" value={f.symColdIntolerance} onChange={set('symColdIntolerance')} />
          <FreqSelect label="Hair loss" value={f.symHairLoss} onChange={set('symHairLoss')} />
          <Field label="Any skin changes? (dryness, puffiness, colour change)">
            <Input value={f.symSkinChanges} onChange={set('symSkinChanges')} placeholder="Describe if any..." />
          </Field>
          <Field label="Bowel changes">
            <Select value={f.symBowelChanges} onChange={set('symBowelChanges')} options={[
              ['normal','Normal'], ['constipation','Constipation'], ['diarrhoea','Diarrhoea / loose stools']
            ]} />
          </Field>
          {showMenstrualSym && (
            <Field label="Menstrual cycle changes (irregular, heavy, absent)">
              <Input value={f.symMenstrualChanges} onChange={set('symMenstrualChanges')} placeholder="Describe if any..." />
            </Field>
          )}
          <FreqSelect label="Mood changes / depression / anxiety" value={f.symMoodChanges} onChange={set('symMoodChanges')} />
          <FreqSelect label="Muscle weakness" value={f.symMuscleWeakness} onChange={set('symMuscleWeakness')} />
          <FreqSelect label="Joint pain" value={f.symJointPain} onChange={set('symJointPain')} />
          <BoolRow label="Eye changes (bulging, dryness, double vision)" value={f.symEyeChanges} onChange={set('symEyeChanges')} />
          <Field label="Any other symptoms not listed above">
            <Input value={f.symOther} onChange={set('symOther')} placeholder="Describe..." />
          </Field>
        </div>
      )}

      {/* ── Section 2: Vital signs ── */}
      {activeSection === 2 && (
        <div>
          <SectionTitle icon="❤️" title="Vital Signs (at time of filling this form)" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Height (cm)">
              <Input value={f.heightCm} onChange={set('heightCm')} type="number" min="50" max="250" />
            </Field>
            <Field label="Weight (kg)">
              <Input value={f.weightKg} onChange={set('weightKg')} type="number" min="1" max="300" />
            </Field>
            <Field label="BMI (auto-calculated)">
              <Input value={f.bmi} onChange={() => {}} style={{ background: 'var(--gray-50)', color: 'var(--text-secondary)' }} />
            </Field>
            <Field label="Heart rate (beats/min)">
              <Input value={f.heartRate} onChange={set('heartRate')} type="number" min="30" max="250" />
            </Field>
            <Field label="BP — Systolic (mmHg)">
              <Input value={f.bpSystolic} onChange={set('bpSystolic')} type="number" min="60" max="300" />
            </Field>
            <Field label="BP — Diastolic (mmHg)">
              <Input value={f.bpDiastolic} onChange={set('bpDiastolic')} type="number" min="30" max="200" />
            </Field>
            <Field label="Temperature (°C)" hint="Normal: 36.1–37.2 °C">
              <Input value={f.temperatureCelsius} onChange={set('temperatureCelsius')} type="number" min="30" max="45" step="0.1" />
            </Field>
          </div>
        </div>
      )}

      {/* ── Section 3: Past medical history ── */}
      {activeSection === 3 && (
        <div>
          <SectionTitle icon="📁" title="Past Medical History" />
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>Do you have or have you ever been diagnosed with any of the following?</p>
          <BoolRow label="Hypertension (high blood pressure)" value={f.pmhHypertension} onChange={set('pmhHypertension')} />
          <BoolRow label="Diabetes mellitus" value={f.pmhDiabetes} onChange={set('pmhDiabetes')} />
          <BoolRow label="Heart disease / cardiac condition" value={f.pmhCardiac} onChange={set('pmhCardiac')} />
          <BoolRow label="Kidney / renal disease" value={f.pmhRenal} onChange={set('pmhRenal')} />
          <BoolRow label="Liver disease" value={f.pmhLiver} onChange={set('pmhLiver')} />
          <BoolRow label="Autoimmune disease (e.g. rheumatoid arthritis, lupus)" value={f.pmhAutoimmune} onChange={set('pmhAutoimmune')} />
          {f.pmhAutoimmune && (
            <Field label="Which condition(s)? (select all that apply)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[['type1_diabetes','Type 1 diabetes'],['rheumatoid_arthritis','Rheumatoid arthritis'],['lupus',"Lupus (SLE)"],['vitiligo','Vitiligo'],['addisons',"Addison's disease"],['other','Other']].map(([val, label]) => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={f.pmhAutoimmuneConditions.includes(val)}
                      onChange={e => set('pmhAutoimmuneConditions')(e.target.checked
                        ? [...f.pmhAutoimmuneConditions, val]
                        : f.pmhAutoimmuneConditions.filter(v => v !== val))} />
                    {label}
                  </label>
                ))}
              </div>
              {f.pmhAutoimmuneConditions.includes('other') && (
                <Input value={f.pmhAutoimmuneOther} onChange={set('pmhAutoimmuneOther')} placeholder="Please specify" style={{ marginTop: 8 }} />
              )}
            </Field>
          )}
          {!isMale && (
            <>
              <BoolRow label="Hysterectomy (surgical removal of uterus)" value={f.pmhHysterectomy} onChange={set('pmhHysterectomy')} />
              {f.pmhHysterectomy && (
                <div style={{ paddingLeft: 12, marginBottom: 12 }}>
                  <Field label="How well do you know the date of surgery?">
                    <Select value={f.hysterectomyDatePrecision} onChange={set('hysterectomyDatePrecision')} options={[
                      ['full','Exact date'], ['month_year','Month & year'], ['year_only','Year only'],
                    ]} />
                  </Field>
                  {f.hysterectomyDatePrecision === 'full' && (
                    <Field label="Date of surgery">
                      <Input value={f.hysterectomyDate} onChange={set('hysterectomyDate')} type="date" max={new Date().toISOString().split('T')[0]} />
                    </Field>
                  )}
                  {f.hysterectomyDatePrecision === 'month_year' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field label="Month">
                        <Select value={f.hysterectomyMonth} onChange={set('hysterectomyMonth')} options={['1','2','3','4','5','6','7','8','9','10','11','12'].map((m,i) => [m, ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]])} />
                      </Field>
                      <Field label="Year">
                        <Input value={f.hysterectomyYear} onChange={set('hysterectomyYear')} type="number" min="1950" max={new Date().getFullYear()} placeholder="e.g. 2019" />
                      </Field>
                    </div>
                  )}
                  {f.hysterectomyDatePrecision === 'year_only' && (
                    <Field label="Year">
                      <Input value={f.hysterectomyYear} onChange={set('hysterectomyYear')} type="number" min="1950" max={new Date().getFullYear()} placeholder="e.g. 2019" />
                    </Field>
                  )}
                  <Field label="Reason for hysterectomy">
                    <Select value={f.hysterectomyReason} onChange={set('hysterectomyReason')} options={[
                      ['excessive_bleeding','Excessive bleeding'], ['prolapse','Prolapse of uterus'],
                      ['cancer','Cancer of uterus / cervix'], ['other','Others'],
                    ]} />
                  </Field>
                  {f.hysterectomyReason === 'other' && (
                    <Field label="Please specify">
                      <Input value={f.hysterectomyReasonOther} onChange={set('hysterectomyReasonOther')} />
                    </Field>
                  )}
                </div>
              )}
            </>
          )}
          <BoolRow label="Previous thyroid disease or treatment" value={f.pmhPreviousThyroid} onChange={set('pmhPreviousThyroid')} />
          {f.pmhPreviousThyroid && (
            <Field label="Details of previous thyroid condition / treatment">
              <Input value={f.pmhPreviousThyroidDetails} onChange={set('pmhPreviousThyroidDetails')} />
            </Field>
          )}
          <BoolRow label="Previous radiation to neck or chest" value={f.pmhNeckRadiation} onChange={set('pmhNeckRadiation')} />
          {f.pmhNeckRadiation && (
            <Field label="Details of radiation treatment">
              <Input value={f.pmhNeckRadiationDetails} onChange={set('pmhNeckRadiationDetails')} />
            </Field>
          )}
          <Field label="Any other significant medical history">
            <Input value={f.pmhOther} onChange={set('pmhOther')} placeholder="Optional..." />
          </Field>

          <SectionTitle icon="🔪" title="Surgical History" />
          <BoolRow label="Have you had any surgery in the past?" value={f.surgicalHistory} onChange={set('surgicalHistory')} />
          {f.surgicalHistory && (
            <Field label="Details of surgery (type, year, hospital)">
              <textarea className="form-control" rows={2} style={{ fontSize: 13 }}
                value={f.surgicalHistoryDetails} onChange={e => set('surgicalHistoryDetails')(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      {/* ── Section 4: Family history ── */}
      {activeSection === 4 && (
        <div>
          <SectionTitle icon="👨‍👩‍👧" title="Family History" />
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>Does any blood relative (parent, sibling, child) have any of the following?</p>
          <BoolRow label="Thyroid disease (any type)" value={f.fhThyroidDisease} onChange={set('fhThyroidDisease')} />
          {f.fhThyroidDisease && (
            <div style={{ paddingLeft: 12, marginBottom: 12 }}>
              <Field label="Which relative(s)? (select all that apply)">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                  {[['mother','Mother'],['father','Father'],['brother','Brother'],['sister','Sister'],['son','Son'],['daughter','Daughter'],['paternal_grandfather','Paternal grandfather'],['paternal_grandmother','Paternal grandmother'],['maternal_grandfather','Maternal grandfather'],['maternal_grandmother','Maternal grandmother'],['uncle','Uncle'],['aunt','Aunt'],['cousin','Cousin']].map(([val, label]) => (
                    <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={f.fhThyroidRelations.includes(val)}
                        onChange={e => set('fhThyroidRelations')(e.target.checked
                          ? [...f.fhThyroidRelations, val]
                          : f.fhThyroidRelations.filter(v => v !== val))} />
                      {label}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Condition">
                <Select value={f.fhThyroidCondition} onChange={set('fhThyroidCondition')} options={[
                  ['hypothyroidism','Hypothyroidism'], ['hyperthyroidism','Hyperthyroidism'],
                  ['thyroid_cancer','Thyroid cancer'], ['goitre','Goitre'],
                  ['thyroid_nodule','Thyroid nodule'], ['others','Others'],
                ]} />
              </Field>
              <Field label="Additional notes (optional)">
                <Input value={f.fhThyroidDetails} onChange={set('fhThyroidDetails')} />
              </Field>
            </div>
          )}
          <BoolRow label="Thyroid cancer" value={f.fhThyroidCancer} onChange={set('fhThyroidCancer')} />
          {f.fhThyroidCancer && (
            <Field label="Which relative? Type of cancer if known?">
              <Input value={f.fhThyroidCancerDetails} onChange={set('fhThyroidCancerDetails')} />
            </Field>
          )}
          <BoolRow label="Any autoimmune disease" value={f.fhAutoimmune} onChange={set('fhAutoimmune')} />
          {f.fhAutoimmune && (
            <Field label="Which relative? Which condition?">
              <Input value={f.fhAutoimmuneDetails} onChange={set('fhAutoimmuneDetails')} />
            </Field>
          )}
          {condition === 'thyroid_cancer' && (
            <BoolRow label="MEN syndrome (Multiple Endocrine Neoplasia) in family" value={f.fhMenSyndrome} onChange={set('fhMenSyndrome')} />
          )}
          <Field label="Any other significant family history">
            <Input value={f.fhOther} onChange={set('fhOther')} placeholder="Optional..." />
          </Field>
        </div>
      )}

      {/* ── Section 5: Medications ── */}
      {activeSection === 5 && (
        <div>
          <SectionTitle icon="💊" title="Current Medications" />
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>List all medications you are currently taking, including supplements and vitamins.</p>

          {f.currentMedications.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6, marginBottom: 4 }}>
                {['Drug name', 'Dose', 'Frequency', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>{h}</span>
                ))}
              </div>
              {f.currentMedications.map((med, i) => (
                <MedRow key={i} med={med}
                  onChange={updated => {
                    const meds = [...f.currentMedications];
                    meds[i] = updated;
                    set('currentMedications')(meds);
                  }}
                  onRemove={() => set('currentMedications')(f.currentMedications.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>
          )}

          <button className="btn btn-secondary btn-sm" onClick={() =>
            set('currentMedications')([...f.currentMedications, { name: '', dose: '', frequency: '' }])
          }>
            + Add medication
          </button>

          <div style={{ marginTop: 20 }}>
            <Field label="Known drug allergies" hint="List any medications you are allergic to">
              <Input value={f.allergies} onChange={set('allergies')} placeholder="e.g. Penicillin, Aspirin, or None" />
            </Field>
            <BoolRow label="Allergy to contrast dye (iodine-based, used in CT scans)" value={f.contrastAllergy} onChange={set('contrastAllergy')} />
          </div>
        </div>
      )}

      {/* ── Section 6: Social history ── */}
      {activeSection === 6 && (
        <div>
          <SectionTitle icon="🧑‍💼" title="Social History" />
          <Field label="Marital status">
            <Select value={f.maritalStatus} onChange={set('maritalStatus')} options={[
              ['married','Married'], ['unmarried','Unmarried'], ['divorced','Divorced'], ['widowed','Widowed']
            ]} />
          </Field>
          <Field label="Smoking status">
            <Select value={f.smokingStatus} onChange={set('smokingStatus')} options={[
              ['never','Never smoked'], ['ex','Ex-smoker'], ['current','Current smoker']
            ]} />
          </Field>
          {f.smokingStatus === 'current' || f.smokingStatus === 'ex' ? (
            <Field label="Pack years (packs/day × years smoked)" hint="Leave blank if unsure">
              <Input value={f.smokingPackYears} onChange={set('smokingPackYears')} type="number" min="0" />
            </Field>
          ) : null}
          <Field label="Alcohol consumption">
            <Select value={f.alcoholStatus} onChange={set('alcoholStatus')} options={[
              ['never','Never'], ['occasional','Occasional (social)'], ['regular','Regular']
            ]} />
          </Field>
          <Field label="Occupation">
            <Input value={f.occupation} onChange={set('occupation')} placeholder="e.g. Teacher, Farmer, Office worker..." />
          </Field>
          <BoolRow label="Significant radiation exposure (occupational or other)" value={f.radiationExposure} onChange={set('radiationExposure')} />
          {f.radiationExposure && (
            <Field label="Details of radiation exposure">
              <Input value={f.radiationExposureDetails} onChange={set('radiationExposureDetails')} />
            </Field>
          )}

          {showObstetric && (
            <>
              <SectionTitle icon="🤱" title="Obstetric History" />
              <Field label="Menopausal status">
                <Select value={f.menopauseStatus} onChange={set('menopauseStatus')} options={[
                  ['pre','Pre-menopausal'], ['peri','Peri-menopausal'], ['post','Post-menopausal'],
                ]} />
              </Field>
              {f.menopauseStatus === 'post' && (
                <Field label="How many years since menopause?">
                  <Input value={f.menopauseYearsAgo} onChange={set('menopauseYearsAgo')} type="number" min="0" placeholder="e.g. 3" />
                </Field>
              )}
              {showMenstrualSym && (
                <>
                  <BoolRow label="Changes in menstrual cycle" value={f.menstrualChangeStatus === 'yes'} onChange={v => set('menstrualChangeStatus')(v ? 'yes' : 'no')} />
                  {f.menstrualChangeStatus === 'yes' && (
                    <div style={{ paddingLeft: 12, marginBottom: 12 }}>
                      <Field label="Pattern">
                        <Select value={f.menstrualPattern} onChange={set('menstrualPattern')} options={[['regular','Regular'],['irregular','Irregular']]} />
                      </Field>
                      <Field label="Flow (select all that apply)">
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          {[['heavy','Heavy'],['scanty','Scanty'],['absent','Absent'],['prolonged','Prolonged']].map(([val, label]) => (
                            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                              <input type="checkbox" checked={f.menstrualFlow.includes(val)}
                                onChange={e => set('menstrualFlow')(e.target.checked ? [...f.menstrualFlow, val] : f.menstrualFlow.filter(v => v !== val))} />
                              {label}
                            </label>
                          ))}
                        </div>
                      </Field>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <Field label="Since when (date, if known)">
                          <Input value={f.menstrualSinceDate} onChange={set('menstrualSinceDate')} type="date" max={new Date().toISOString().split('T')[0]} />
                        </Field>
                        <Field label="Years">
                          <Input value={f.menstrualYears} onChange={set('menstrualYears')} type="number" min="0" />
                        </Field>
                        <Field label="Months">
                          <Input value={f.menstrualMonths} onChange={set('menstrualMonths')} type="number" min="0" max="11" />
                        </Field>
                      </div>
                    </div>
                  )}
                </>
              )}
              {showPregnancyQns && (
                <>
                  <BoolRow label="Currently pregnant" value={f.isPregnant} onChange={set('isPregnant')} />
                  <BoolRow label="Currently breastfeeding" value={f.isBreastfeeding} onChange={set('isBreastfeeding')} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Gravida (total pregnancies)">
                      <Input value={f.gravida} onChange={set('gravida')} type="number" min="0" />
                    </Field>
                    <Field label="Para (deliveries)">
                      <Input value={f.para} onChange={set('para')} type="number" min="0" />
                    </Field>
                  </div>
                </>
              )}
              {showLMP && (
                <Field label="Last menstrual period (LMP)">
                  <Input value={f.lastMenstrualPeriod} onChange={set('lastMenstrualPeriod')} type="date" max={new Date().toISOString().split('T')[0]} />
                </Field>
              )}
              {f.isPregnant && f.eddDate && (
                <div style={{ padding: '10px 14px', background: '#f0faf4', border: '1px solid #a8d5b5', borderRadius: 8, fontSize: 13, color: '#1a4a2e', marginBottom: 12 }}>
                  Expected Date of Delivery (EDD): <strong>{new Date(f.eddDate).toLocaleDateString('en-GB')}</strong>
                </div>
              )}
              {hadHysterectomy && (
                <div style={{ padding: '10px 14px', background: '#fffde7', border: '1px solid #f9d923', borderRadius: 8, fontSize: 12, color: '#7a6000' }}>
                  ℹ️ Pregnancy, LMP and menstruation questions are not applicable following hysterectomy.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Section 7: Previous investigations ── */}
      {activeSection === 7 && (
        <div>
          <SectionTitle icon="🔬" title="Previous Investigations" />
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>Have you had any of the following tests done previously?</p>

          <BoolRow label="TSH (thyroid stimulating hormone) test" value={f.prevTshDone} onChange={set('prevTshDone')} />
          {f.prevTshDone && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingLeft: 12 }}>
              <Field label="Last TSH value (mIU/L)">
                <Input value={f.prevTshValue} onChange={set('prevTshValue')} type="number" min="0" step="0.01" />
              </Field>
              <Field label="Date of test">
                <Input value={f.prevTshDate} onChange={set('prevTshDate')} type="date" max={new Date().toISOString().split('T')[0]} />
              </Field>
            </div>
          )}

          <BoolRow label="Thyroid ultrasound (USG)" value={f.prevUsgDone} onChange={set('prevUsgDone')} />
          {f.prevUsgDone && (
            <Field label="Date of USG" style={{ paddingLeft: 12 }}>
              <Input value={f.prevUsgDate} onChange={set('prevUsgDate')} type="date" max={new Date().toISOString().split('T')[0]} />
            </Field>
          )}

          <BoolRow label="FNAC (fine needle aspiration cytology)" value={f.prevFnacDone} onChange={set('prevFnacDone')} />
          {f.prevFnacDone && (
            <Field label="FNAC result" style={{ paddingLeft: 12 }}>
              <Input value={f.prevFnacResult} onChange={set('prevFnacResult')} placeholder="e.g. Bethesda III, benign, malignant..." />
            </Field>
          )}

          {/* Save & continue */}
          <div style={{ marginTop: 24, padding: 16, background: 'var(--teal-50)', border: '1px solid var(--teal-200)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--teal-700)', marginBottom: 12 }}>
              ✅ You have completed Part 1 of the questionnaire. Click "Save & continue" to proceed to the condition-specific questions.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => handleSave(true)} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? <Spinner size={18} color="#fff" /> : 'Save & continue to condition-specific questions →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Section navigation footer ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-secondary" onClick={() => activeSection === 0 ? onBack() : setActiveSection(s => s - 1)}>
          ← {activeSection === 0 ? 'Back to condition selection' : 'Previous section'}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? <Spinner size={16} /> : '💾 Save draft'}
          </button>
          {activeSection < sections.length - 1 && (
            <button className="btn btn-primary" onClick={() => setActiveSection(s => s + 1)}>
              Next section →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Map DB snake_case → camelCase for pre-filling ────────
function mapDbToForm(r) {
  return {
    chiefComplaint: r.chief_complaint || '',
    complaintDurationValue: r.complaint_duration_value || '',
    complaintDurationUnit: r.complaint_duration_unit || 'months',
    symFatigue: r.sym_fatigue || 'never',
    symWeightChange: r.sym_weight_change || '',
    symWeightKg: r.sym_weight_kg || '',
    symNeckSwelling: r.sym_neck_swelling || false,
    symNeckSwellingSide: r.sym_neck_swelling_side || '',
    symNeckPain: r.sym_neck_pain || 'never',
    symDifficultySwallowing: r.sym_difficulty_swallowing || 'never',
    symVoiceChange: r.sym_voice_change || false,
    symBreathlessness: r.sym_breathlessness || 'never',
    symPalpitations: r.sym_palpitations || 'never',
    symHeatIntolerance: r.sym_heat_intolerance || false,
    symColdIntolerance: r.sym_cold_intolerance || false,
    symHairLoss: r.sym_hair_loss || 'never',
    symSkinChanges: r.sym_skin_changes || '',
    symBowelChanges: r.sym_bowel_changes || '',
    symMenstrualChanges: r.sym_menstrual_changes || '',
    symMoodChanges: r.sym_mood_changes || '',
    symMuscleWeakness: r.sym_muscle_weakness || 'never',
    symJointPain: r.sym_joint_pain || 'never',
    symEyeChanges: r.sym_eye_changes || false,
    symOther: r.sym_other || '',
    heightCm: r.height_cm || '',
    weightKg: r.weight_kg || '',
    bmi: r.bmi || '',
    bpSystolic: r.bp_systolic || '',
    bpDiastolic: r.bp_diastolic || '',
    heartRate: r.heart_rate || '',
    temperatureCelsius: r.temperature_celsius || '',
    pmhHypertension: r.pmh_hypertension || false,
    pmhDiabetes: r.pmh_diabetes || false,
    pmhCardiac: r.pmh_cardiac || false,
    pmhRenal: r.pmh_renal || false,
    pmhLiver: r.pmh_liver || false,
    pmhAutoimmune: r.pmh_autoimmune || false,
    pmhAutoimmuneDetails: r.pmh_autoimmune_details || '',
    pmhAutoimmuneConditions: r.pmh_autoimmune_conditions || [],
    pmhAutoimmuneOther: r.pmh_autoimmune_other || '',
    pmhHysterectomy: r.pmh_hysterectomy || false,
    hysterectomyDatePrecision: r.hysterectomy_date_precision || 'full',
    hysterectomyDate: r.hysterectomy_date || '',
    hysterectomyYear: r.hysterectomy_year || '',
    hysterectomyMonth: r.hysterectomy_month || '',
    hysterectomyReason: r.hysterectomy_reason || '',
    hysterectomyReasonOther: r.hysterectomy_reason_other || '',
    pmhPreviousThyroid: r.pmh_previous_thyroid || false,
    pmhPreviousThyroidDetails: r.pmh_previous_thyroid_details || '',
    pmhNeckRadiation: r.pmh_neck_radiation || false,
    pmhNeckRadiationDetails: r.pmh_neck_radiation_details || '',
    pmhOther: r.pmh_other || '',
    surgicalHistory: r.surgical_history || false,
    surgicalHistoryDetails: r.surgical_history_details || '',
    fhThyroidDisease: r.fh_thyroid_disease || false,
    fhThyroidDetails: r.fh_thyroid_details || '',
    fhThyroidRelations: r.fh_thyroid_relations || [],
    fhThyroidCondition: r.fh_thyroid_condition || '',
    fhThyroidCancer: r.fh_thyroid_cancer || false,
    fhThyroidCancerDetails: r.fh_thyroid_cancer_details || '',
    fhAutoimmune: r.fh_autoimmune || false,
    fhAutoimmuneDetails: r.fh_autoimmune_details || '',
    fhMenSyndrome: r.fh_men_syndrome || false,
    fhOther: r.fh_other || '',
    currentMedications: r.current_medications || [],
    allergies: r.allergies || '',
    contrastAllergy: r.contrast_allergy || false,
    maritalStatus: r.marital_status || '',
    smokingStatus: r.smoking_status || '',
    smokingPackYears: r.smoking_pack_years || '',
    alcoholStatus: r.alcohol_status || '',
    occupation: r.occupation || '',
    radiationExposure: r.radiation_exposure || false,
    radiationExposureDetails: r.radiation_exposure_details || '',
    isPregnant: r.is_pregnant || false,
    isBreastfeeding: r.is_breastfeeding || false,
    gravida: r.gravida || '',
    para: r.para || '',
    lastMenstrualPeriod: r.last_menstrual_period || '',
    eddDate: r.edd_date || '',
    menopauseStatus: r.menopause_status || 'pre',
    menopauseYearsAgo: r.menopause_years_ago || '',
    menstrualChangeStatus: r.menstrual_change_status || '',
    menstrualPattern: r.menstrual_pattern || '',
    menstrualFlow: r.menstrual_flow || [],
    menstrualSinceDate: r.menstrual_since_date || '',
    menstrualYears: r.menstrual_years || '',
    menstrualMonths: r.menstrual_months || '',
    prevTshDone: r.prev_tsh_done || false,
    prevTshValue: r.prev_tsh_value || '',
    prevTshDate: r.prev_tsh_date || '',
    prevUsgDone: r.prev_usg_done || false,
    prevUsgDate: r.prev_usg_date || '',
    prevFnacDone: r.prev_fnac_done || false,
    prevFnacResult: r.prev_fnac_result || '',
  };
}

export default CoreQuestionnaire;
