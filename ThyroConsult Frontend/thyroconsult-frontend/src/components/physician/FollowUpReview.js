// ============================================================
// Full path:
//   thyroconsult-frontend\src\components\physician\FollowUpReview.js
//
// Physician portal — English only.
// Doctor reviews:
//   - New lab values submitted by patient
//   - Symptom delta (Better/Same/Worse per symptom)
//   - Medication compliance
// Then records:
//   - Assessment notes
//   - Medication action (continue/increase/decrease/change/stop)
//   - Follow-up timeline
//   - Optional new investigations to advise
// ============================================================

import React, { useEffect, useState } from 'react';
import { physicianAPI } from '../../api';

const CONDITION_LABELS = {
  hypo:   'Hypothyroidism',
  hyper:  'Hyperthyroidism',
  tc:     'CA Thyroid',
  nodule: 'Thyroid Nodule',
};

const DELTA_COLORS = {
  better: { bg: '#EAF3DE', color: '#27500A', label: 'Better' },
  same:   { bg: '#f5f5f5', color: '#555',    label: 'Same'   },
  worse:  { bg: '#FCEBEB', color: '#791F1F', label: 'Worse'  },
};

const COMPLIANCE_LABELS = {
  regular:        { label: 'Regular',         color: '#27500A', bg: '#EAF3DE' },
  irregular:      { label: 'Irregular',       color: '#633806', bg: '#FAEEDA' },
  skips_sometimes:{ label: 'Skips sometimes', color: '#633806', bg: '#FAEEDA' },
  stopped:        { label: 'Stopped',         color: '#791F1F', bg: '#FCEBEB' },
};

const MED_ACTIONS = [
  { value: 'continue',  label: 'Continue same dose'      },
  { value: 'increase',  label: 'Increase dose'           },
  { value: 'decrease',  label: 'Decrease dose'           },
  { value: 'change',    label: 'Change medication'       },
  { value: 'stop',      label: 'Stop medication'         },
  { value: 'na',        label: 'Not applicable'          },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────
export default function FollowUpReview({ episodeId, onBack }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);

  // Assessment form state
  const [assessmentNotes,  setAssessmentNotes]  = useState('');
  const [medicationAction, setMedicationAction] = useState('continue');
  const [newDoseMcg,       setNewDoseMcg]       = useState('');
  const [newMedName,       setNewMedName]        = useState('');
  const [followUpMonths,   setFollowUpMonths]    = useState('3');
  const [additionalNotes,  setAdditionalNotes]  = useState('');
  const [newInvestigations,setNewInvestigations] = useState([]);
  const [addingInv,        setAddingInv]         = useState(false);
  const [newInvName,       setNewInvName]        = useState('');
  const [newInvNotes,      setNewInvNotes]       = useState('');
  const [submitting,       setSubmitting]        = useState(false);
  const [submitted,        setSubmitted]         = useState(false);
  const [error,            setError]             = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const sum = await physicianAPI.getEpisodeSummary(episodeId);
        // Get the latest submitted visit
        const submittedVisits = (sum.followUpVisits || []).filter(v => v.status === 'submitted');
        const visit = submittedVisits[submittedVisits.length - 1] || null;
        setData({ ...sum, visit });
      } catch (err) {
        console.error('FollowUpReview load:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [episodeId]);

  const addInvestigation = () => {
    if (!newInvName.trim()) return;
    setNewInvestigations(prev => [...prev, { testName: newInvName.trim(), notes: newInvNotes.trim() }]);
    setNewInvName('');
    setNewInvNotes('');
    setAddingInv(false);
  };

  const handleSubmit = async () => {
    if (!assessmentNotes.trim()) {
      setError('Assessment notes are required before submitting.');
      return;
    }
    if (!data?.visit?.id) {
      setError('No submitted visit found.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await physicianAPI.reviewFollowUpVisit(episodeId, data.visit.id, {
        assessmentNotes:      assessmentNotes.trim(),
        medicationAction,
        newDoseMcg:           newDoseMcg    || undefined,
        newMedName:           newMedName    || undefined,
        adviseInvestigations: newInvestigations,
        followUpInMonths:     parseInt(followUpMonths) || 3,
        additionalNotes:      additionalNotes.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      console.error('reviewFollowUpVisit:', err);
      setError('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '60px 20px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#27ae60', marginBottom: 6 }}>Review submitted</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Patient will be notified of your assessment.</div>
        <button onClick={onBack} style={primBtn('#185FA5')}>Back to dashboard</button>
      </div>
    );
  }

  const episode = data?.episode;
  const visit   = data?.visit;
  const labData = visit?.lab_data     || {};
  const delta   = visit?.symptom_delta || {};
  const compliance = visit?.medication_compliance;
  const newSymptoms = visit?.new_symptoms_text;

  const labKeys = Object.keys(labData);
  const deltaKeys = Object.keys(delta);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 20px 60px', fontFamily: 'system-ui, sans-serif' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 0', borderBottom: '1px solid #e8e8e8', marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 13, color: '#666', cursor: 'pointer', padding: 0 }}>← Back to dashboard</button>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Follow-up Review</span>
        <div style={{ width: 120 }} />
      </div>

      {loading && <div style={{ fontSize: 13, color: '#888' }}>Loading...</div>}

      {!loading && !visit && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: 13 }}>
          No submitted follow-up visit found for this episode.
        </div>
      )}

      {!loading && episode && visit && (
        <>
          {/* Patient info */}
          <div style={{ background: '#F8FAFE', border: '1px solid #e8e8e8', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{episode.patient_name}</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              {CONDITION_LABELS[episode.condition] || episode.condition}
              {' · '}{episode.patient_age}y · {episode.gender}
              {' · '}Visit {visit.visit_number} · Submitted {fmtDate(visit.submitted_at)}
            </div>
          </div>

          {/* ── SECTION 1: New lab values ── */}
          {labKeys.length > 0 && (
            <ReviewSection title="New lab results submitted">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {labKeys.map(key => {
                  const entry = labData[key];
                  return (
                    <div key={key} style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: '10px 12px', background: '#fff' }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{key.toUpperCase()}</div>
                      {entry.value ? (
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>
                          {entry.value} <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>{entry.unit || ''}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#aaa' }}>Value not entered</div>
                      )}
                      {entry.date && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{fmtDate(entry.date)}</div>}
                      {entry.reportPath && (
                        <div style={{ fontSize: 11, color: '#185FA5', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          📎 Report uploaded
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ReviewSection>
          )}

          {/* ── SECTION 2: Symptom delta ── */}
          {deltaKeys.length > 0 && (
            <ReviewSection title="Symptom update">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {deltaKeys.map(symptom => {
                  const val = delta[symptom];
                  const style = DELTA_COLORS[val] || {};
                  return (
                    <div key={symptom} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', border: '1px solid #f0f0f0', borderRadius: 6, background: '#fafafa' }}>
                      <span style={{ fontSize: 13, color: '#333' }}>{symptom}</span>
                      {val && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 12, background: style.bg, color: style.color }}>
                          {style.label || val}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {newSymptoms && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#FAEEDA', borderRadius: 8, fontSize: 13, color: '#633806' }}>
                  <strong>New symptoms reported:</strong> {newSymptoms}
                </div>
              )}
            </ReviewSection>
          )}

          {/* ── SECTION 3: Medication compliance ── */}
          {compliance && (
            <ReviewSection title="Medication compliance">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, background: COMPLIANCE_LABELS[compliance]?.bg || '#f5f5f5', color: COMPLIANCE_LABELS[compliance]?.color || '#333' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{COMPLIANCE_LABELS[compliance]?.label || compliance}</span>
              </div>
            </ReviewSection>
          )}

          {/* ── SECTION 4: Physician assessment (form) ── */}
          <ReviewSection title="Your assessment" highlighted>

            <FieldLabel>Assessment notes *</FieldLabel>
            <textarea
              value={assessmentNotes}
              onChange={e => setAssessmentNotes(e.target.value)}
              placeholder="e.g. TSH has normalised. Patient is tolerating dose well. Continue current dose..."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />

            <FieldLabel>Medication action</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {MED_ACTIONS.map(a => (
                <button
                  key={a.value}
                  onClick={() => setMedicationAction(a.value)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                    border: medicationAction === a.value ? '2px solid #185FA5' : '1px solid #d0d7e8',
                    background: medicationAction === a.value ? '#E6F1FB' : '#fff',
                    color: medicationAction === a.value ? '#0C447C' : '#555',
                    fontWeight: medicationAction === a.value ? 600 : 400,
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {(medicationAction === 'increase' || medicationAction === 'decrease') && (
              <div>
                <FieldLabel>New dose (mcg)</FieldLabel>
                <input type="number" value={newDoseMcg} onChange={e => setNewDoseMcg(e.target.value)} placeholder="e.g. 100" style={{ ...inputStyle, width: 160 }} />
              </div>
            )}

            {medicationAction === 'change' && (
              <div>
                <FieldLabel>New medication name</FieldLabel>
                <input value={newMedName} onChange={e => setNewMedName(e.target.value)} placeholder="e.g. Liothyronine" style={{ ...inputStyle, width: '100%' }} />
              </div>
            )}

            <FieldLabel>Follow up in (months)</FieldLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {['1','2','3','6','12'].map(m => (
                <button
                  key={m}
                  onClick={() => setFollowUpMonths(m)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                    border: followUpMonths === m ? '2px solid #185FA5' : '1px solid #d0d7e8',
                    background: followUpMonths === m ? '#E6F1FB' : '#fff',
                    color: followUpMonths === m ? '#0C447C' : '#555',
                    fontWeight: followUpMonths === m ? 600 : 400,
                  }}
                >
                  {m} mo
                </button>
              ))}
            </div>

            {/* Advise new investigations */}
            <FieldLabel>Advise new investigations (optional)</FieldLabel>
            {newInvestigations.map((inv, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '7px 12px', background: '#EEEDFE', borderRadius: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{inv.testName}{inv.notes ? ` — ${inv.notes}` : ''}</span>
                <button onClick={() => setNewInvestigations(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
            ))}
            {addingInv ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={newInvName} onChange={e => setNewInvName(e.target.value)} placeholder="Test name" style={{ ...inputStyle, flex: 2 }} />
                <input value={newInvNotes} onChange={e => setNewInvNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...inputStyle, flex: 2 }} />
                <button onClick={addInvestigation} style={primBtn('#534AB7')}>Add</button>
                <button onClick={() => setAddingInv(false)} style={secBtn}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingInv(true)} style={{ fontSize: 12, padding: '6px 12px', border: '1px dashed #534AB7', borderRadius: 6, color: '#534AB7', background: 'none', cursor: 'pointer', marginBottom: 12 }}>
                + Advise investigation
              </button>
            )}

            <FieldLabel>Additional notes for patient (optional)</FieldLabel>
            <textarea
              value={additionalNotes}
              onChange={e => setAdditionalNotes(e.target.value)}
              placeholder="Lifestyle advice, dietary recommendations, etc."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </ReviewSection>

          {/* Error */}
          {error && (
            <div style={{ background: '#FCEBEB', color: '#791F1F', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={onBack} style={secBtn}>Save & exit</button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ ...primBtn('#185FA5', submitting), flex: 1 }}
            >
              {submitting ? 'Submitting review...' : 'Submit review & notify patient'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ──
function ReviewSection({ title, children, highlighted }) {
  return (
    <div style={{ border: `1px solid ${highlighted ? '#C5D5E8' : '#e8e8e8'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16, background: highlighted ? '#F8FAFE' : '#fff' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#185FA5', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6, marginTop: 12 }}>{children}</div>;
}

const primBtn = (bg, disabled = false) => ({
  padding: '10px 20px', background: disabled ? '#ccc' : bg, color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
  cursor: disabled ? 'not-allowed' : 'pointer',
});
const secBtn = { padding: '10px 16px', background: 'transparent', color: '#555', border: '1px solid #ccc', borderRadius: 8, fontSize: 13, cursor: 'pointer' };
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #d0d7e8', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', marginBottom: 0 };
