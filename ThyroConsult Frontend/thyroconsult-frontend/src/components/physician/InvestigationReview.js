// ============================================================
// Full path:
//   thyroconsult-frontend\src\components\physician\InvestigationReview.js
//
// Physician portal — English only.
// Allows the doctor to:
//   1. View uploaded investigation reports from patient
//   2. Mark each report as reviewed
//   3. Add further investigations if needed
//   4. Complete the review
// ============================================================

import React, { useEffect, useState } from 'react';
import { physicianAPI } from '../../api';

const CONDITION_LABELS = {
  hypothyroidism:  'Hypothyroidism',
  hyperthyroidism: 'Hyperthyroidism',
  thyroid_cancer:  'CA Thyroid',
  nodule:          'Thyroid Nodule',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────
export default function InvestigationReview({ episodeId, onBack }) {
  const [summary,       setSummary]       = useState(null);
  const [investigations,setInvestigations] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [reviewingId,   setReviewingId]   = useState(null);
  const [addingNew,     setAddingNew]     = useState(false);
  const [newTests,      setNewTests]      = useState([{ testName: '', notes: '' }]);
  const [saving,        setSaving]        = useState(false);
  const [done,          setDone]          = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [sum, invs] = await Promise.all([
          physicianAPI.getEpisodeSummary(episodeId),
          physicianAPI.getEpisodeInvestigations(episodeId),
        ]);
        setSummary(sum);
        setInvestigations(invs);
      } catch (err) {
        console.error('InvestigationReview load:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [episodeId]);

  const handleMarkReviewed = async (invId) => {
    setReviewingId(invId);
    try {
      await physicianAPI.markInvestigationReviewed(episodeId, invId);
      setInvestigations(prev =>
        prev.map(i => i.id === invId ? { ...i, status: 'reviewed' } : i)
      );
    } catch (err) {
      console.error('markReviewed:', err);
      alert('Could not mark as reviewed. Please try again.');
    } finally {
      setReviewingId(null);
    }
  };

  const handleAddTests = async () => {
    const valid = newTests.filter(t => t.testName.trim());
    if (!valid.length) return;
    setSaving(true);
    try {
      const result = await physicianAPI.adviseInvestigations(episodeId, valid);
      setInvestigations(prev => [...prev, ...result.investigations]);
      setNewTests([{ testName: '', notes: '' }]);
      setAddingNew(false);
    } catch (err) {
      console.error('adviseInvestigations:', err);
      alert('Could not save investigations. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (invId) => {
    if (!window.confirm('Remove this investigation?')) return;
    try {
      await physicianAPI.deleteInvestigation(episodeId, invId);
      setInvestigations(prev => prev.filter(i => i.id !== invId));
    } catch (err) {
      alert(err.message || 'Could not remove investigation.');
    }
  };

  const uploadedPending  = investigations.filter(i => i.status === 'uploaded');
  const reviewed         = investigations.filter(i => i.status === 'reviewed');
  const advised          = investigations.filter(i => i.status === 'pending');
  const allUploaded      = uploadedPending.length === 0;

  if (done) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '60px 20px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#27ae60', marginBottom: 6 }}>Review complete</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>All uploaded reports have been reviewed.</div>
        <button onClick={onBack} style={primBtn('#185FA5')}>Back to dashboard</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 20px 40px', fontFamily: 'system-ui, sans-serif' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 0', borderBottom: '1px solid #e8e8e8', marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 13, color: '#666', cursor: 'pointer', padding: 0 }}>← Back to dashboard</button>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Investigation Review</span>
        <div style={{ width: 120 }} />
      </div>

      {loading && <div style={{ fontSize: 13, color: '#888' }}>Loading...</div>}

      {!loading && summary && (
        <>
          {/* Patient info */}
          <div style={{ background: '#F8FAFE', border: '1px solid #e8e8e8', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{summary.episode.patient_name}</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              {CONDITION_LABELS[summary.episode.condition] || summary.episode.condition}
              {' · '}{summary.episode.patient_age}y · {summary.episode.gender}
              {' · '}Submitted {fmtDate(summary.episode.submitted_at)}
            </div>
          </div>

          {/* Uploaded reports awaiting review */}
          {uploadedPending.length > 0 && (
            <Section title={`Reports uploaded by patient (${uploadedPending.length} to review)`} color="#534AB7">
              {uploadedPending.map(inv => (
                <InvCard
                  key={inv.id}
                  inv={inv}
                  action={
                    <button
                      onClick={() => handleMarkReviewed(inv.id)}
                      disabled={reviewingId === inv.id}
                      style={primBtn('#27ae60', reviewingId === inv.id)}
                    >
                      {reviewingId === inv.id ? 'Marking...' : '✓ Mark reviewed'}
                    </button>
                  }
                />
              ))}
            </Section>
          )}

          {/* Reviewed reports */}
          {reviewed.length > 0 && (
            <Section title={`Reviewed (${reviewed.length})`} color="#27ae60">
              {reviewed.map(inv => (
                <InvCard key={inv.id} inv={inv} dimmed />
              ))}
            </Section>
          )}

          {/* Advised but not yet uploaded */}
          {advised.length > 0 && (
            <Section title={`Awaiting patient upload (${advised.length})`} color="#888">
              {advised.map(inv => (
                <InvCard
                  key={inv.id}
                  inv={inv}
                  dimmed
                  action={
                    inv.source === 'doctor' && inv.status === 'pending' ? (
                      <button
                        onClick={() => handleDelete(inv.id)}
                        style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #E24B4A', borderRadius: 6, background: 'none', color: '#E24B4A', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    ) : null
                  }
                />
              ))}
            </Section>
          )}

          {/* Add new investigations */}
          <div style={{ marginTop: 16, padding: '14px 16px', border: '1px solid #e8e8e8', borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Advise additional investigations</div>
            {addingNew ? (
              <>
                {newTests.map((t, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                    <input
                      value={t.testName}
                      onChange={e => { const arr = [...newTests]; arr[i].testName = e.target.value; setNewTests(arr); }}
                      placeholder="Investigation name (e.g. HbA1c)"
                      style={inputStyle}
                    />
                    <input
                      value={t.notes}
                      onChange={e => { const arr = [...newTests]; arr[i].notes = e.target.value; setNewTests(arr); }}
                      placeholder="Notes for patient (optional)"
                      style={inputStyle}
                    />
                    {i > 0 && (
                      <button onClick={() => setNewTests(newTests.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => setNewTests([...newTests, { testName: '', notes: '' }])} style={{ fontSize: 12, padding: '6px 12px', border: '1px dashed #534AB7', borderRadius: 6, color: '#534AB7', background: 'none', cursor: 'pointer' }}>+ Add another</button>
                  <button onClick={() => setAddingNew(false)} style={{ ...secBtn, fontSize: 12 }}>Cancel</button>
                  <button onClick={handleAddTests} disabled={saving} style={{ ...primBtn('#185FA5', saving), fontSize: 12, padding: '6px 14px' }}>{saving ? 'Saving...' : 'Save & notify patient'}</button>
                </div>
              </>
            ) : (
              <button onClick={() => setAddingNew(true)} style={{ fontSize: 13, padding: '7px 14px', border: '1px solid #534AB7', borderRadius: 8, color: '#534AB7', background: 'none', cursor: 'pointer' }}>
                + Advise investigation
              </button>
            )}
          </div>

          {/* Complete review button */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e8e8e8', display: 'flex', gap: 10 }}>
            <button onClick={onBack} style={secBtn}>Save & exit</button>
            <button
              onClick={() => setDone(true)}
              disabled={!allUploaded}
              style={{ ...primBtn('#27ae60', !allUploaded), flex: 1 }}
            >
              {allUploaded ? '✓ Complete review' : `${uploadedPending.length} report${uploadedPending.length > 1 ? 's' : ''} still pending review`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function InvCard({ inv, action, dimmed }) {
  const isDr = inv.source === 'doctor';
  return (
    <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: '10px 14px', marginBottom: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: dimmed ? 0.65 : 1 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: inv.notes ? 4 : 0 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{inv.test_name}</span>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: isDr ? '#EEEDFE' : '#f0f0f0', color: isDr ? '#3C3489' : '#666' }}>{isDr ? 'Dr. advised' : 'Patient added'}</span>
          {inv.status === 'reviewed' && <span style={{ fontSize: 10, color: '#27ae60', fontWeight: 600 }}>✓ Reviewed</span>}
          {inv.status === 'uploaded' && <span style={{ fontSize: 10, color: '#185FA5', fontWeight: 600 }}>📎 Report uploaded</span>}
        </div>
        {inv.notes && <div style={{ fontSize: 11, color: '#888' }}>{inv.notes}</div>}
        {inv.report_uploaded_at && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Uploaded {fmtDate(inv.report_uploaded_at)}</div>}
      </div>
      {action && <div style={{ marginLeft: 12, flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

const primBtn = (bg, disabled = false) => ({
  padding: '8px 18px', background: disabled ? '#ccc' : bg, color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
  cursor: disabled ? 'not-allowed' : 'pointer',
});
const secBtn = { padding: '8px 16px', background: 'transparent', color: '#555', border: '1px solid #ccc', borderRadius: 8, fontSize: 13, cursor: 'pointer' };
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d0d7e8', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' };
