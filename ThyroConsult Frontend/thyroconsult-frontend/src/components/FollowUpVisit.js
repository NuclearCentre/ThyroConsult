// FollowUpVisit.js
// Scenario 3: Patient submits a follow-up visit after treatment.
// Three steps: new lab uploads → symptom delta → medication compliance.
// Attached to existing episode, not a new one.
// Payment must be confirmed before this screen is accessible (enforced by PatientDashboard).

import React, { useEffect, useState, useCallback } from 'react';
import { patientAPI } from '../api';

// Symptom sets per condition (shown in delta checklist)
const SYMPTOMS = {
  hypo: [
    'Fatigue', 'Weight change', 'Cold intolerance', 'Constipation',
    'Skin changes', 'Hair changes', 'Nail changes', 'Puffiness / swelling',
    'Leg swelling', 'Hoarseness', 'Muscle cramps', 'Weakness',
    'Memory / concentration', 'Mood / depression', 'Hypersomnia',
    'Slow pulse', 'Giddiness', 'Hearing changes',
  ],
  hyper: [
    'Fatigue', 'Weight change', 'Heat intolerance', 'Sweating',
    'Diarrhoea', 'Skin changes', 'Hair changes', 'Nail changes',
    'Tremors', 'Anxiety', 'Irritability', 'Insomnia',
    'Palpitations', 'Breathlessness', 'Eye symptoms',
    'Giddiness', 'Muscle weakness',
  ],
  tc: [
    'Fatigue', 'Weight change', 'Voice change / hoarseness',
    'Difficulty swallowing', 'Neck lump / swelling', 'Neck pain',
    'Breathing difficulty', 'Mood / anxiety',
  ],
  nodule: [
    'Visible lump / swelling', 'Neck pain / tightness',
    'Difficulty swallowing', 'Voice change / hoarseness',
    'Breathing difficulty', 'Fatigue', 'Weight change',
  ],
};

const LAB_TESTS = [
  { key: 'tsh',     label: 'TSH',              unit: 'mIU/L' },
  { key: 't3',      label: 'T3 (total)',        unit: 'nmol/L' },
  { key: 'ft3',     label: 'Free T3 (FT3)',     unit: 'pmol/L' },
  { key: 't4',      label: 'T4 (total)',        unit: 'nmol/L' },
  { key: 'ft4',     label: 'Free T4 (FT4)',     unit: 'pmol/L' },
  { key: 'antitpo', label: 'Anti-TPO',          unit: 'IU/mL' },
  { key: 'antitg',  label: 'Anti-Tg',           unit: 'IU/mL' },
  { key: 'imaging', label: 'Thyroid imaging',   unit: null },
];

const HYPER_EXTRA = [
  { key: 'trab', label: 'TRAb', unit: 'IU/L' },
  { key: 'tsi',  label: 'TSI',  unit: '%' },
];

const COMPLIANCE_OPTIONS = [
  { value: 'regular',    label: 'Yes, regularly',    color: 'var(--bg-success)', textColor: 'var(--text-success)' },
  { value: 'irregular',  label: 'Irregularly',       color: 'var(--bg-warning)', textColor: 'var(--text-warning)' },
  { value: 'stopped',    label: 'Stopped taking it', color: 'var(--bg-danger)',  textColor: 'var(--text-danger)'  },
];

export default function FollowUpVisit({ episode, onBack }) {
  const [visit,       setVisit]       = useState(null);   // follow_up_visits row
  const [step,        setStep]        = useState(1);      // 1 | 2 | 3
  const [labData,     setLabData]     = useState({});     // { tsh: { value, unit, date, file } }
  const [delta,       setDelta]       = useState({});     // { 'Fatigue': 'better' }
  const [newSymptoms, setNewSymptoms] = useState('');
  const [compliance,  setCompliance]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [uploading,   setUploading]   = useState(null);   // lab key currently uploading

  const condType = episode.condition_type;
  const symptoms = SYMPTOMS[condType] || SYMPTOMS.nodule;
  const labTests = condType === 'hyper'
    ? [...LAB_TESTS, ...HYPER_EXTRA]
    : LAB_TESTS;

  // ── Create or load draft visit ──
  useEffect(() => {
    const init = async () => {
      try {
        // Check for existing draft visit
        const visits = await patientAPI.getFollowUpVisits(patient.id, episode.id);
        const draft  = visits.find(v => v.status === 'draft');
        if (draft) {
          setVisit(draft);
          setLabData(draft.lab_data || {});
          setDelta(draft.symptom_delta || {});
          setNewSymptoms(draft.new_symptoms_text || '');
          setCompliance(draft.medication_compliance || '');
        } else {
          // Create new visit
          const newVisit = await patientAPI.createFollowUpVisit(patient.id, episode.id);
          setVisit(newVisit);
        }
      } catch (err) {
        console.error('FollowUpVisit init error:', err);
      }
    };
    init();
  }, [episode.id]);

  // ── Auto-save draft ──
  const saveDraft = useCallback(async () => {
    if (!visit) return;
    setSaving(true);
    try {
      await patientAPI.saveFollowUpDraft(patient.id, episode.id, visit.id, {
        labData,
        symptomDelta:         delta,
        newSymptomsText:      newSymptoms,
        medicationCompliance: compliance,
      });
    } finally {
      setSaving(false);
    }
  }, [visit, episode.id, labData, delta, newSymptoms, compliance]);

  // ── Lab value change ──
  const setLabField = (key, field, value) => {
    setLabData(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));
  };

  // ── Lab file upload ──
  const handleLabUpload = async (key, file) => {
    if (!file || !visit) return;
    setUploading(key);
    try {
      await patientAPI.uploadFollowUpLab(patient.id, episode.id, visit.id, {
        testKey:  key,
        value:    labData[key]?.value || '',
        unit:     labData[key]?.unit  || '',
        testDate: labData[key]?.date  || '',
        file,
      });
      setLabData(prev => ({ ...prev, [key]: { ...(prev[key] || {}), reportUploaded: true, fileName: file.name } }));
    } catch (err) {
      console.error('Lab upload error:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  // ── Symptom delta ──
  const setDeltaValue = (symptom, value) => {
    setDelta(prev => ({ ...prev, [symptom]: value }));
  };

  // ── Final submit ──
  const handleSubmit = async () => {
    if (!visit) return;
    setSubmitting(true);
    try {
      await saveDraft();
      await patientAPI.submitFollowUp(patient.id, episode.id, visit.id);
      setSubmitted(true);
    } catch (err) {
      console.error('Submit error:', err);
      alert('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '60px 16px', textAlign: 'center' }}>
        <i className="ti ti-circle-check" style={{ fontSize: 48, color: 'var(--text-success)', display: 'block', marginBottom: 16 }} />
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Follow-up submitted</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
          Your doctor has been notified and will review your update shortly.
        </div>
        <button onClick={onBack} style={{ ...primaryBtnStyle, display: 'inline-flex', padding: '10px 24px' }}>
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '0 16px 40px' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '0.5px solid var(--border)', marginBottom: 18 }}>
        <button onClick={onBack} style={backBtnStyle}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Follow-up visit</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {saving ? 'Saving...' : 'Draft saved'}
        </span>
      </div>

      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 3 }}>New follow-up visit</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
        Visit {visit?.visit_number || '2'} · Episode started {fmtDate(episode.submitted_at || episode.created_at)}
      </div>

      {/* Info note */}
      <div style={{ background: 'var(--bg-info)', color: 'var(--text-info)', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <i className="ti ti-info-circle" style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true" />
        <span>Only new reports and a symptom update are needed — no need to refill the full questionnaire.</span>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* ── STEP 1: Lab uploads ── */}
      {step === 1 && (
        <div style={{ border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.03em', marginBottom: 12 }}>
            STEP 1 — UPLOAD NEW REPORTS
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Upload any new test results since your last visit. All fields are optional.
          </div>

          {labTests.map(test => (
            <LabRow
              key={test.key}
              test={test}
              data={labData[test.key] || {}}
              uploading={uploading === test.key}
              onChange={(field, val) => setLabField(test.key, field, val)}
              onUpload={(file) => handleLabUpload(test.key, file)}
            />
          ))}

          <button
            onClick={() => { saveDraft(); setStep(2); }}
            style={{ ...primaryBtnStyle, width: '100%', marginTop: 14 }}
          >
            Next: Symptom update <i className="ti ti-arrow-right" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── STEP 2: Symptom delta ── */}
      {step === 2 && (
        <div style={{ border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.03em', marginBottom: 8 }}>
            STEP 2 — SYMPTOM UPDATE
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            How are your symptoms compared to your last visit?
          </div>

          {symptoms.map(symptom => (
            <DeltaRow
              key={symptom}
              symptom={symptom}
              value={delta[symptom] || ''}
              onChange={(val) => setDeltaValue(symptom, val)}
            />
          ))}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Any new symptoms to report?</div>
            <textarea
              value={newSymptoms}
              onChange={e => setNewSymptoms(e.target.value)}
              placeholder="e.g. Started getting headaches last week, noticed weight gain of 2 kg..."
              rows={3}
              style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => setStep(1)} style={secondaryBtnStyle}>
              <i className="ti ti-arrow-left" aria-hidden="true" /> Back
            </button>
            <button onClick={() => { saveDraft(); setStep(3); }} style={{ ...primaryBtnStyle, flex: 1 }}>
              Next: Medication compliance <i className="ti ti-arrow-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Compliance ── */}
      {step === 3 && (
        <div style={{ border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.03em', marginBottom: 8 }}>
            STEP 3 — MEDICATION COMPLIANCE
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Are you still taking your prescribed medication?
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {COMPLIANCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setCompliance(opt.value)}
                style={{
                  padding: '12px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  border: compliance === opt.value ? `1.5px solid ${opt.textColor}` : '0.5px solid var(--border)',
                  background: compliance === opt.value ? opt.color : 'var(--bg-primary)',
                  color: compliance === opt.value ? opt.textColor : 'var(--text-secondary)',
                  textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                  fontWeight: compliance === opt.value ? 500 : 400,
                }}
              >
                <i className={`ti ${compliance === opt.value ? 'ti-check' : 'ti-circle'}`} aria-hidden="true" />
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20, paddingTop: 14, borderTop: '0.5px solid var(--border)' }}>
            <button onClick={() => setStep(2)} style={secondaryBtnStyle}>
              <i className="ti ti-arrow-left" aria-hidden="true" /> Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={!compliance || submitting}
              style={{ ...primaryBtnStyle, flex: 1, background: 'var(--bg-success)', color: 'var(--text-success)', borderColor: 'var(--border-success)', opacity: (!compliance || submitting) ? 0.5 : 1, cursor: (!compliance || submitting) ? 'not-allowed' : 'pointer' }}
            >
              <i className="ti ti-send" aria-hidden="true" />
              {submitting ? 'Submitting...' : 'Submit follow-up'}
            </button>
          </div>

          {!compliance && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 6 }}>
              Please select a compliance option to submit
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step indicator ──
function StepIndicator({ current }) {
  const steps = ['New reports', 'Symptoms', 'Compliance'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
      {steps.map((label, i) => {
        const num  = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <React.Fragment key={num}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, background: done ? 'var(--bg-success)' : active ? 'var(--bg-info)' : 'var(--bg-secondary)', color: done ? 'var(--text-success)' : active ? 'var(--text-info)' : 'var(--text-tertiary)', flexShrink: 0 }}>
                {done ? <i className="ti ti-check" style={{ fontSize: 12 }} /> : num}
              </div>
              <span style={{ fontSize: 11, color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: active ? 500 : 400 }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 8px' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Lab row ──
function LabRow({ test, data, uploading, onChange, onUpload }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderBottom: '0.5px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13 }}>{test.label}</div>
          {data.reportUploaded && (
            <div style={{ fontSize: 11, color: 'var(--text-success)', marginTop: 2 }}>
              <i className="ti ti-check" /> {data.fileName || 'Report uploaded'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setExpanded(p => !p)} style={{ fontSize: 12, padding: '4px 10px', border: '0.5px solid var(--border)', borderRadius: 6, background: expanded ? 'var(--bg-secondary)' : 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            {expanded ? 'Done' : 'Add new'}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {test.unit !== null && (
            <>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>Value</div>
                <input type="number" value={data.value || ''} onChange={e => onChange('value', e.target.value)} style={inputStyle} placeholder="e.g. 2.4" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>Unit</div>
                <input type="text" value={data.unit || test.unit} onChange={e => onChange('unit', e.target.value)} style={inputStyle} />
              </div>
            </>
          )}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>Date of test</div>
            <input type="date" value={data.date || ''} onChange={e => onChange('date', e.target.value)} max={new Date().toISOString().split('T')[0]} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>Upload report</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 10px', border: '0.5px solid var(--border)', borderRadius: 6, cursor: uploading ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', opacity: uploading ? 0.6 : 1 }}>
              <i className="ti ti-upload" aria-hidden="true" />
              {uploading ? 'Uploading...' : data.reportUploaded ? 'Replace' : 'Upload'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => onUpload(e.target.files[0])} style={{ display: 'none' }} disabled={uploading} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Delta row ──
function DeltaRow({ symptom, value, onChange }) {
  const opts = [
    { v: 'better', label: 'Better', bg: '#EAF3DE', color: '#27500A' },
    { v: 'same',   label: 'Same',   bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' },
    { v: 'worse',  label: 'Worse',  bg: 'var(--bg-danger)', color: 'var(--text-danger)' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
      <div style={{ flex: 1, fontSize: 13 }}>{symptom}</div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {opts.map(opt => (
          <button
            key={opt.v}
            onClick={() => onChange(opt.v)}
            style={{ fontSize: 11, padding: '4px 9px', border: value === opt.v ? `1px solid ${opt.color}` : '0.5px solid var(--border)', borderRadius: 4, background: value === opt.v ? opt.bg : 'transparent', color: value === opt.v ? opt.color : 'var(--text-secondary)', cursor: 'pointer', fontWeight: value === opt.v ? 500 : 400 }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const backBtnStyle      = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', border: 'none', background: 'none', padding: 0 };
const primaryBtnStyle   = { padding: '10px', background: 'var(--bg-info)', color: 'var(--text-info)', border: '0.5px solid var(--border-info)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
const secondaryBtnStyle = { padding: '10px 14px', background: 'transparent', color: 'var(--text-secondary)', border: '0.5px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 };
const inputStyle        = { width: '100%', fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)' };

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
