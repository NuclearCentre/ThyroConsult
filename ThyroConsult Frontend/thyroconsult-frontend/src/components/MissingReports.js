// MissingReports.js
// Scenario 1: Patient re-enters to upload reports they skipped during first visit.
// Shows list of D-module items where value was entered but report not uploaded.
// Clicking any item opens the upload screen for that specific test.

import React, { useEffect, useState } from 'react';
import { followUpAPI } from '../api';

const CONDITION_LABELS = {
  hypothyroidism:  'Hypothyroidism',
  hyperthyroidism: 'Hyperthyroidism',
  thyroid_cancer:  'CA Thyroid',
  nodule:          'Thyroid Nodule',
};

const MODULE_ICONS = {
  D1: 'ti-activity',
  D2: 'ti-droplet',
  D3: 'ti-droplet-half',
  D4: 'ti-droplet',
  D5: 'ti-droplet-half',
  D6: 'ti-microscope',
  D7: 'ti-microscope',
  D8: 'ti-atom',
  D9: 'ti-atom-2',
  D10: 'ti-scan',
};

export default function MissingReports({ episode, onBack }) {
  const [missing,     setMissing]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [activeKey,   setActiveKey]   = useState(null); // moduleKey being uploaded
  const [uploading,   setUploading]   = useState(false);
  const [uploadDone,  setUploadDone]  = useState({}); // moduleKey → true when uploaded this session
  const [submitDone,  setSubmitDone]  = useState(false);

  useEffect(() => {
    followUpAPI.getMissingReports(episode.id)
      .then(data => setMissing(data.missing || []))
      .finally(() => setLoading(false));
  }, [episode.id]);

  const handleFileUpload = async (moduleKey, file) => {
    if (!file) return;
    setUploading(true);
    try {
      await followUpAPI.uploadMissingReport(episode.id, moduleKey, file);
      setUploadDone(prev => ({ ...prev, [moduleKey]: true }));
      setActiveKey(null);
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitDone(true);
    onBack();
  };

  const remaining = missing.filter(m => !uploadDone[m.moduleKey]);

  if (submitDone) return null;

  // ── Upload screen for a specific test ──
  if (activeKey) {
    const item = missing.find(m => m.moduleKey === activeKey);
    return (
      <UploadScreen
        item={item}
        episodeId={episode.id}
        uploading={uploading}
        alreadyDone={uploadDone[activeKey]}
        onUpload={(file) => handleFileUpload(activeKey, file)}
        onBack={() => setActiveKey(null)}
      />
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '0 16px 40px' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '0.5px solid var(--border)', marginBottom: 18 }}>
        <button onClick={onBack} style={backBtnStyle}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Complete your visit</span>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 3 }}>Missing reports</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
        {CONDITION_LABELS[episode.condition_type] || episode.condition_type || 'Condition'} · First visit, {fmtDate(episode.submitted_at)}
      </div>

      {/* Info banner */}
      <div style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, marginBottom: 14 }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <span>Your questionnaire is complete but these reports were not uploaded. Uploading them helps the doctor give a more accurate online opinion.</span>
      </div>

      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.05em', marginBottom: 10 }}>
        TAP ANY ITEM TO UPLOAD
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading...</div>}

      {!loading && missing.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
          All reports have been uploaded. ✓
        </div>
      )}

      {missing.map(item => {
        const done = uploadDone[item.moduleKey];
        return (
          <div
            key={item.moduleKey}
            onClick={() => !done && setActiveKey(item.moduleKey)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', border: '0.5px solid var(--border)', borderRadius: 8,
              marginBottom: 8, background: 'var(--bg-primary)',
              cursor: done ? 'default' : 'pointer', opacity: done ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: done ? 'var(--bg-success)' : 'var(--bg-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                <i className={`ti ${done ? 'ti-check' : (MODULE_ICONS[item.moduleKey] || 'ti-file')}`}
                   style={{ color: done ? 'var(--text-success)' : 'var(--text-warning)' }}
                   aria-hidden="true" />
              </div>
              <div>
                <div style={{ fontSize: 13 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {done
                    ? 'Report uploaded ✓'
                    : item.enteredValue
                    ? `${item.moduleKey} · Value entered: ${item.enteredValue} · Report not uploaded`
                    : `${item.moduleKey} · Report not uploaded`
                  }
                </div>
              </div>
            </div>
            {!done && <i className="ti ti-chevron-right" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />}
          </div>
        );
      })}

      {/* Submit row */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '0.5px solid var(--border)' }}>
        <button onClick={onBack} style={secondaryBtnStyle}>
          Save &amp; exit
        </button>
        <button
          onClick={handleSubmit}
          disabled={remaining.length > 0}
          style={{ ...primaryBtnStyle, opacity: remaining.length > 0 ? 0.5 : 1, cursor: remaining.length > 0 ? 'not-allowed' : 'pointer' }}
        >
          Submit all uploaded <i className="ti ti-arrow-right" aria-hidden="true" />
        </button>
      </div>

      {remaining.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 6 }}>
          {remaining.length} report{remaining.length > 1 ? 's' : ''} still pending
        </div>
      )}
    </div>
  );
}

// ── Upload screen for a single test ──
function UploadScreen({ item, uploading, alreadyDone, onUpload, onBack }) {
  const [file, setFile] = useState(null);

  const handleChange = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
  };

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '0 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '0.5px solid var(--border)', marginBottom: 18 }}>
        <button onClick={onBack} style={backBtnStyle}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back to list
        </button>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Upload report</span>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 3 }}>{item?.label} report</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
        {item?.moduleKey} · Report upload
      </div>

      {item?.enteredValue && (
        <div style={{ background: 'var(--bg-info)', color: 'var(--text-info)', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <i className="ti ti-info-circle" style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true" />
          <span>Your entered value of <strong>{item.enteredValue}</strong> is saved. Upload the lab report for the doctor to verify.</span>
        </div>
      )}

      {alreadyDone ? (
        <div style={{ textAlign: 'center', padding: '30px 0', fontSize: 13, color: 'var(--text-success)' }}>
          <i className="ti ti-circle-check" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
          Report uploaded successfully
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Upload lab report</div>

          <label style={{ display: 'block', border: '1px dashed var(--border)', borderRadius: 8, padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 12 }}>
            <i className="ti ti-cloud-upload" style={{ fontSize: 28, display: 'block', marginBottom: 6 }} aria-hidden="true" />
            {file ? file.name : <>Tap to select file<br /><span style={{ fontSize: 11 }}>PDF, JPG, PNG — max 10 MB</span></>}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleChange} style={{ display: 'none' }} />
          </label>

          <button
            onClick={() => file && onUpload(file)}
            disabled={!file || uploading}
            style={{ ...primaryBtnStyle, opacity: (!file || uploading) ? 0.5 : 1, cursor: (!file || uploading) ? 'not-allowed' : 'pointer' }}
          >
            <i className="ti ti-upload" aria-hidden="true" />
            {uploading ? 'Uploading...' : 'Upload & save'}
          </button>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={onBack} style={secondaryBtnStyle}>Back</button>
      </div>
    </div>
  );
}

// ── Shared styles ──
const backBtnStyle = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', border: 'none', background: 'none', padding: 0 };
const primaryBtnStyle = { flex: 1, padding: '10px', background: 'var(--bg-info)', color: 'var(--text-info)', border: '0.5px solid var(--border-info)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
const secondaryBtnStyle = { padding: '10px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '0.5px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer' };

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
