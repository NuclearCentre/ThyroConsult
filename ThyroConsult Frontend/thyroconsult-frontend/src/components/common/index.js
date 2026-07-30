import React from 'react';

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
export const Spinner = ({ size = 20, color = 'var(--teal-400)' }) => (
  <div style={{ width: size, height: size, border: `2px solid var(--border-md)`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
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
