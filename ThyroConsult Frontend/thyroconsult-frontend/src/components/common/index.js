import React from 'react';
import ThyroidLoader from './ThyroidLoader';
import { patientAPI } from '../../api';

// ─── Logo ──────────────────────────────────────────────────
export const Logo = ({ size = 'md', light = false }) => {
  const sizes = { sm: '14px', md: '16px', lg: '20px' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: sizes[size], color: light ? '#CECBF6' : 'var(--teal-600)' }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8z" fill={light ? '#7F77DD' : 'var(--teal-400)'} opacity="0.2"/>
        <path d="M10 5v3M10 12v3M7 10H4M16 10h-3M8.5 7.5l-2-2M13.5 12.5l-2-2M11.5 7.5l2-2M6.5 12.5l2-2" stroke={light ? '#CECBF6' : 'var(--teal-600)'} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      ThyroConsult
    </div>
  );
};

// ─── Secure Badge ──────────────────────────────────────────
export const SecureBadge = () => (
  <span className="hipaa-badge">
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M6 1L1.5 3v3c0 2.76 1.98 5.34 4.5 6 2.52-.66 4.5-3.24 4.5-6V3L6 1z" fill="var(--teal-400)" opacity="0.2"/>
      <path d="M4 6l1.5 1.5L8 4" stroke="var(--teal-600)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    Secure & Encrypted
  </span>
);

// ─── Spinner ───────────────────────────────────────────────
// Was a plain CSS-spun ring; now the ThyroConsult thyroid mark with a dark
// strip tracing its outline. Same `size`/`color` props as before, so every
// existing <Spinner size={32} /> call site keeps working unchanged — plus
// a new `active` prop: pass active={false} once the operation completes
// and the strip stops moving and fades out.
export const Spinner = ({ size = 20, color = 'var(--teal-400)', active = true }) => (
  <ThyroidLoader size={size} color={color} active={active} />
);

// ─── Loading Screen ────────────────────────────────────────
export const LoadingScreen = ({ message = 'Loading...' }) => (
  <div className="loading-screen">
    <Logo />
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Spinner size={28} />
      <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{message}</span>
    </div>
  </div>
);

// ─── Alert ─────────────────────────────────────────────────
export const Alert = ({ type = 'info', children, onClose }) => (
  <div className={`alert alert-${type}`}>
    <span style={{ flex: 1 }}>{children}</span>
    {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: 16 }}>×</button>}
  </div>
);

// ─── Badge ─────────────────────────────────────────────────
export const Badge = ({ variant = 'gray', children }) => (
  <span className={`badge badge-${variant}`}>{children}</span>
);

// ─── Avatar ────────────────────────────────────────────────
export const Avatar = ({ name = '?', size = 36, color = 'teal' }) => {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colors = {
    teal: { bg: 'var(--teal-50)', color: 'var(--teal-800)' },
    blue: { bg: 'var(--blue-50)', color: 'var(--blue-800)' },
    indigo: { bg: 'var(--indigo-50)', color: 'var(--indigo-800)' },
    amber: { bg: 'var(--amber-50)', color: 'var(--amber-800)' },
  };
  const c = colors[color] || colors.teal;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: c.bg, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.33, fontWeight: 600, flexShrink: 0 }}>
      {initials}
    </div>
  );
};

// ─── Icon Button ───────────────────────────────────────────
export const IconButton = ({ onClick, title, children, variant = 'default' }) => (
  <button onClick={onClick} title={title} style={{ width: 30, height: 30, border: '1px solid var(--border-md)', borderRadius: 6, background: variant === 'danger' ? 'var(--red-50)' : 'var(--surface)', color: variant === 'danger' ? 'var(--red-600)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}>
    {children}
  </button>
);

// ─── Empty State ───────────────────────────────────────────
export const EmptyState = ({ icon, title, subtitle }) => (
  <div className="empty-state">
    <div className="empty-state-icon">{icon}</div>
    <div style={{ fontWeight: 500, marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 13 }}>{subtitle}</div>
  </div>
);

// ─── AutoSave indicator ────────────────────────────────────
export const AutoSave = ({ savedAt }) => {
  if (!savedAt) return null;
  return (
    <span className="autosave">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="var(--teal-600)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      Saved {savedAt}
    </span>
  );
};

// ─── Section Header ────────────────────────────────────────
export const SectionHeader = ({ title, subtitle, action }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
    <div>
      <h2 style={{ fontSize: '1.4rem', marginBottom: 2 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

// ─── Status Badge ──────────────────────────────────────────
export const StatusBadge = ({ status }) => {
  const map = {
    completed: ['teal', 'Completed'],
    scheduled: ['blue', 'Scheduled'],
    in_progress: ['amber', 'In Progress'],
    cancelled: ['red', 'Cancelled'],
    pending: ['amber', 'Pending'],
    confirmed: ['teal', 'Confirmed'],
    failed: ['red', 'Failed'],
    refunded: ['gray', 'Refunded'],
    no_show: ['gray', 'No Show'],
  };
  const [variant, label] = map[status] || ['gray', status];
  return <Badge variant={variant}>{label}</Badge>;
};

// ─── Lab Report Upload ──────────────────────────────────────
// The single, shared upload widget used by every questionnaire (Hypo,
// Hyper, and TC/Nodule once wired) next to any lab-value / investigation
// question (TSH, T3, T4, Tg, anti-TPO, USG, CT, PET-CT, treatment
// prescription, etc.). Multi-file, tagged with episodeId + fieldLabel
// server-side (see patientController.uploadDocument + migration 022) so
// it shows up correctly labeled — e.g. "TSH — TSH_report.pdf" — on the
// physician side. Each uploaded report gets a "🤖 Auto-fill from this
// report" action that runs documentExtractionService (Anthropic API,
// vision) and hands the result back via onExtract for the caller to drop
// into its own value/unit/date/refLow/refHigh/lab fields — the patient
// can still edit anything before saving.
//
// Deliberately used as-is (not condition-prefixed) by both
// HypoQuestionnaire.js and HyperQuestionnaire.js — this was previously
// two near-identical copies (HypoLabReportUpload / HyperLabReportUpload)
// living in each file; consolidated here so the upload experience is
// visually and behaviorally identical across every module, per explicit
// request. This does NOT change either questionnaire's own question
// order, branching, or sequence — only the upload widget itself moved.
//
// Controlled component: `reports` / `onReportsChange` follow the same
// pattern each questionnaire already uses for its own fields (backed by
// that questionnaire's own state — e.g. f.tshReports for Hypo,
// data.tsh_reports for Hyper) so uploaded report references persist
// through each questionnaire's existing autosave/resume mechanism.
//
// NOTE: there is currently no document-delete endpoint on the backend
// (documents table has an is_deleted column, but nothing sets it) — "+
// Add another report" just uploads more, it doesn't replace/remove
// anything already on file. Harmless (physician sees every dated
// version), but worth knowing.
export const LabReportUpload = ({ patientId, episodeId, fieldLabel, category = 'blood_report', reports = [], onReportsChange, onExtract, enableExtract = true }) => {
  const [uploading, setUploading] = React.useState(false);
  const [extractingId, setExtractingId] = React.useState(null);
  const [error, setError] = React.useState('');

  const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) { setError('Only PDF, JPG or PNG accepted'); continue; }
      if (file.size > 5 * 1024 * 1024) { setError('File exceeds 5MB limit'); continue; }
      setUploading(true); setError('');
      try {
        const formData = new FormData();
        formData.append('document', file);
        formData.append('patientId', patientId);
        formData.append('category', category);
        if (episodeId) formData.append('episodeId', episodeId);
        formData.append('fieldLabel', fieldLabel);
        const res = await patientAPI.uploadDocument(formData);
        onReportsChange([...(reports || []), { documentId: res.documentId, fileName: file.name }]);
      } catch (err) {
        setError(err.response?.data?.error || 'Upload failed');
      } finally {
        setUploading(false);
      }
    }
  };

  const runExtract = async (documentId) => {
    setExtractingId(documentId); setError('');
    try {
      const res = await patientAPI.extractDocumentFields(documentId, fieldLabel);
      if (!res.found) {
        setError(`Couldn't find "${fieldLabel}" on that report — please enter values manually`);
      } else if (onExtract) {
        onExtract(res);
      }
    } catch (err) {
      setError('Auto-fill failed — please enter values manually');
    } finally {
      setExtractingId(null);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 12,
        border: '1px dashed var(--border-md)', borderRadius: 'var(--radius-md)',
        cursor: uploading ? 'default' : 'pointer', background: 'var(--gray-50)',
        fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center',
      }}>
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={uploading}
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        {uploading
          ? <><Spinner size={14} /> Uploading…</>
          : <>📎 Upload {fieldLabel} report (JPG / PNG / PDF){enableExtract ? ' — AI can auto-extract values' : ''}</>}
      </label>

      {reports?.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {reports.map(r => (
            <div key={r.documentId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid var(--teal-200)', borderRadius: 'var(--radius-md)', background: 'var(--teal-50)', fontSize: 12 }}>
              <span>📄</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fileName}</span>
              <span style={{ color: 'var(--teal-600)' }}>✓</span>
              {enableExtract && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={extractingId === r.documentId}
                  onClick={() => runExtract(r.documentId)}>
                  {extractingId === r.documentId ? <Spinner size={12} /> : '🤖 Auto-fill from this'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {reports?.length >= 1 && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, color: 'var(--teal-600)', cursor: 'pointer' }}>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={uploading}
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
          + Add another report
        </label>
      )}

      {error && <div style={{ fontSize: 11, color: 'var(--red-600)', marginTop: 4 }}>{error}</div>}
    </div>
  );
};

// ─── Additional Documents Uploader ─────────────────────────
// The catch-all at the end of a questionnaire — "want to add any more
// details?" — for uploading any number of extra reports/images/other
// documents that don't map to a specific question above. Multi-file,
// repeatable ("+ Add more"), each file uploads and shows its own
// progress/status independently.
export const AdditionalDocumentsUploader = ({ patientId, episodeId, category = 'other' }) => {
  const [items, setItems] = React.useState([]); // { key, fileName, status: 'uploading'|'done'|'error', error, documentId }

  const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

  const uploadOne = async (file) => {
    const key = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setItems(p => [...p, { key, fileName: file.name, status: 'error', error: 'Only PDF, JPG or PNG accepted' }]);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setItems(p => [...p, { key, fileName: file.name, status: 'error', error: 'Exceeds 5MB limit' }]);
      return;
    }

    setItems(p => [...p, { key, fileName: file.name, status: 'uploading' }]);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('patientId', patientId);
      formData.append('category', category);
      if (episodeId) formData.append('episodeId', episodeId);
      formData.append('fieldLabel', 'Additional document');

      const res = await patientAPI.uploadDocument(formData);
      setItems(p => p.map(i => i.key === key ? { ...i, status: 'done', documentId: res.documentId } : i));
    } catch (err) {
      setItems(p => p.map(i => i.key === key
        ? { ...i, status: 'error', error: err.response?.data?.error || 'Upload failed' }
        : i));
    }
  };

  const handleFiles = (fileList) => {
    Array.from(fileList || []).forEach(uploadOne);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <label style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16,
        border: '1px dashed var(--border-md)', borderRadius: 'var(--radius-md)',
        cursor: 'pointer', background: 'var(--gray-50)',
      }}>
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        <span style={{ fontSize: 22, marginBottom: 4 }}>☁</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Click to upload — any additional reports, images, or documents</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>PDF, JPG, PNG · max 5MB each · select multiple at once, or add more below</span>
      </label>

      {items.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>
              <span>📄</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.fileName}</span>
              {item.status === 'uploading' && <Spinner size={12} />}
              {item.status === 'done' && <span style={{ color: 'var(--teal-600)' }}>✓</span>}
              {item.status === 'error' && <span style={{ color: 'var(--red-600)' }} title={item.error}>✗ {item.error}</span>}
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12, color: 'var(--teal-600)', cursor: 'pointer' }}>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
          + Add more
        </label>
      )}
    </div>
  );
};
