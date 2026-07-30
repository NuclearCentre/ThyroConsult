// InvestigationUpload.js
// Scenario 2: Patient uploads reports for investigations advised by doctor,
// and can also add their own investigations manually.

import React, { useEffect, useState } from 'react';
import { followUpAPI } from '../api';

export default function InvestigationUpload({ episode, onBack }) {
  const [investigations, setInvestigations] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState('pending'); // 'pending' | 'uploaded'
  const [addingNew,      setAddingNew]      = useState(false);
  const [newTestName,    setNewTestName]    = useState('');
  const [newNotes,       setNewNotes]       = useState('');
  const [saving,         setSaving]         = useState(false);
  const [uploadingId,    setUploadingId]    = useState(null);
  const [notifying,      setNotifying]      = useState(false);
  const [notified,       setNotified]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await followUpAPI.getInvestigations(episode.id);
      setInvestigations(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [episode.id]);

  const pending  = investigations.filter(i => i.status === 'pending');
  const uploaded = investigations.filter(i => i.status !== 'pending');

  const handleAddInvestigation = async () => {
    if (!newTestName.trim()) return;
    setSaving(true);
    try {
      await followUpAPI.addInvestigation(episode.id, { testName: newTestName.trim(), notes: newNotes.trim() });
      setNewTestName('');
      setNewNotes('');
      setAddingNew(false);
      await load();
    } catch (err) {
      console.error('Add investigation error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (invId, file) => {
    if (!file) return;
    setUploadingId(invId);
    try {
      await followUpAPI.uploadInvestigationReport(episode.id, invId, file);
      await load();
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploadingId(null);
    }
  };

  const handleNotifyDoctor = async () => {
    setNotifying(true);
    try {
      await followUpAPI.notifyDoctor(episode.id);
      setNotified(true);
    } finally {
      setNotifying(false);
    }
  };

  const displayList = activeTab === 'pending' ? pending : uploaded;

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '0 16px 40px' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '0.5px solid var(--border)', marginBottom: 18 }}>
        <button onClick={onBack} style={backBtnStyle}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Investigation reports</span>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 3 }}>Investigation reports</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
        Upload reports for investigations advised by your doctor
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border)', marginBottom: 14 }}>
        {[['pending', `Pending (${pending.length})`], ['uploaded', `Uploaded (${uploaded.length})`]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{ fontSize: 12, padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', color: activeTab === key ? 'var(--text-info)' : 'var(--text-secondary)', borderBottom: activeTab === key ? '2px solid var(--border-info)' : '2px solid transparent', marginBottom: -1, fontWeight: activeTab === key ? 500 : 400 }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading...</div>}

      {/* Investigation list */}
      {displayList.map(inv => (
        <InvestigationItem
          key={inv.id}
          inv={inv}
          uploading={uploadingId === inv.id}
          onUpload={(file) => handleUpload(inv.id, file)}
        />
      ))}

      {displayList.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
          {activeTab === 'pending' ? 'No pending uploads.' : 'No reports uploaded yet.'}
        </div>
      )}

      {/* Add investigation */}
      {activeTab === 'pending' && (
        <>
          {addingNew ? (
            <div style={{ border: '0.5px solid var(--border)', borderRadius: 8, padding: 14, marginTop: 4, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Add investigation</div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Test name *</label>
                <input
                  type="text"
                  value={newTestName}
                  onChange={e => setNewTestName(e.target.value)}
                  placeholder="e.g. HbA1c, Lipid profile"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="Any context for the doctor"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setAddingNew(false)} style={secondaryBtnStyle}>Cancel</button>
                <button onClick={handleAddInvestigation} disabled={!newTestName.trim() || saving} style={{ ...primaryBtnStyle, flex: 1, opacity: (!newTestName.trim() || saving) ? 0.5 : 1 }}>
                  {saving ? 'Saving...' : 'Add'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingNew(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
              <i className="ti ti-plus" aria-hidden="true" /> Add another investigation
            </button>
          )}

          {/* Notify doctor */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '0.5px solid var(--border)' }}>
            <button onClick={onBack} style={secondaryBtnStyle}>Save &amp; exit</button>
            <button
              onClick={handleNotifyDoctor}
              disabled={notifying || notified || uploaded.length === 0}
              style={{ ...primaryBtnStyle, flex: 1, opacity: (notified || uploaded.length === 0) ? 0.6 : 1, cursor: (notified || uploaded.length === 0) ? 'not-allowed' : 'pointer' }}
            >
              <i className={`ti ${notified ? 'ti-check' : 'ti-send'}`} aria-hidden="true" />
              {notified ? 'Doctor notified' : notifying ? 'Notifying...' : 'Notify doctor when done'}
            </button>
          </div>

          {uploaded.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 6 }}>
              Upload at least one report before notifying the doctor
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InvestigationItem({ inv, uploading, onUpload }) {
  const isDrAdvised = inv.source === 'doctor';
  return (
    <div style={{ border: '0.5px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, background: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: inv.status === 'pending' ? 8 : 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 13 }}>{inv.test_name}</span>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: isDrAdvised ? '#EEEDFE' : 'var(--bg-secondary)', color: isDrAdvised ? '#3C3489' : 'var(--text-secondary)' }}>
              {isDrAdvised ? 'Dr. advised' : 'Self-added'}
            </span>
          </div>
          {inv.notes && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {isDrAdvised ? `Note: ${inv.notes}` : inv.notes}
            </div>
          )}
          {inv.status !== 'pending' && (
            <div style={{ fontSize: 11, color: 'var(--text-success)', marginTop: 2 }}>
              <i className="ti ti-check" aria-hidden="true" /> Uploaded {fmtDate(inv.report_uploaded_at)}
            </div>
          )}
        </div>

        {inv.status === 'pending' && (
          <label style={{ flexShrink: 0, fontSize: 12, padding: '5px 11px', border: '0.5px solid var(--border-info)', borderRadius: 8, background: 'var(--bg-info)', color: 'var(--text-info)', cursor: uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: uploading ? 0.6 : 1 }}>
            <i className="ti ti-upload" aria-hidden="true" />
            {uploading ? 'Uploading...' : 'Upload'}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => onUpload(e.target.files[0])} style={{ display: 'none' }} disabled={uploading} />
          </label>
        )}
      </div>
    </div>
  );
}

const backBtnStyle    = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', border: 'none', background: 'none', padding: 0 };
const primaryBtnStyle = { padding: '10px', background: 'var(--bg-info)', color: 'var(--text-info)', border: '0.5px solid var(--border-info)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
const secondaryBtnStyle = { padding: '10px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '0.5px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer' };
const inputStyle = { width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)' };

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
