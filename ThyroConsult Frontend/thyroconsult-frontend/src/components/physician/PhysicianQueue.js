// src/components/physician/PhysicianQueue.js
// Doctor's pending opinion queue — sorted by submission time
// Overdue (48h+) highlighted orange; Critical (72h+) highlighted red

import React, { useState, useEffect, useCallback } from 'react';
import { physicianAPI } from '../../api/index';

const CONDITION_LABELS = {
  hypothyroidism: 'Hypothyroidism',
  hyperthyroidism: 'Hyperthyroidism',
  thyroid_cancer: 'CA Thyroid',
  thyroid_nodule: 'Thyroid Nodule',
};

const OPINION_STATUS_LABELS = {
  pending: 'Awaiting Opinion',
  draft:   'Draft Saved',
  submitted: 'Opinion Submitted',
  acknowledged: 'Patient Acknowledged',
};

function StatusBadge({ status }) {
  const colours = {
    pending:      { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
    draft:        { bg: '#eff6ff', text: '#1e40af', border: '#93c5fd' },
    submitted:    { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
    acknowledged: { bg: '#f5f3ff', text: '#4c1d95', border: '#c4b5fd' },
  };
  const c = colours[status] || colours.pending;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
    }}>
      {OPINION_STATUS_LABELS[status] || status}
    </span>
  );
}

function Hoursbadge({ hours, isOverdue, isCritical }) {
  let bg = '#f1f5f9', color = '#475569';
  if (isCritical) { bg = '#fee2e2'; color = '#991b1b'; }
  else if (isOverdue) { bg = '#fff7ed'; color = '#9a3412'; }

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 700,
      background: bg,
      color,
    }}>
      {isCritical ? '⚠ ' : isOverdue ? '⏰ ' : ''}{hours}h waiting
    </span>
  );
}

export default function PhysicianQueue({ onSelectEpisode }) {
  const [queue, setQueue]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState('all'); // all | pending | overdue
  const [refreshing, setRefreshing] = useState(false);

  const loadQueue = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await physicianAPI.getPhysicianQueue();
      setQueue(res.data || []);
    } catch (err) {
      setError('Failed to load queue. Please refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    // Auto-refresh every 5 minutes
    const interval = setInterval(() => loadQueue(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadQueue]);

  const filtered = queue.filter(ep => {
    if (filter === 'pending')  return ep.opinionStatus === 'pending' || ep.opinionStatus === 'draft';
    if (filter === 'overdue')  return ep.isOverdue;
    return true;
  });

  const overdueCount  = queue.filter(ep => ep.isOverdue && !ep.isCritical).length;
  const criticalCount = queue.filter(ep => ep.isCritical).length;
  const pendingCount  = queue.filter(ep => ep.opinionStatus === 'pending' || ep.opinionStatus === 'draft').length;

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 15 }}>
        Loading queue…
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto', padding: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
            Physician Queue
          </h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Pending online opinion requests
          </p>
        </div>
        <button
          onClick={() => loadQueue(true)}
          disabled={refreshing}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total in Queue', value: queue.length, color: '#3a7bd5', bg: '#eff6ff' },
          { label: 'Pending Opinion', value: pendingCount, color: '#92400e', bg: '#fef3c7' },
          { label: 'Overdue (48h+)', value: overdueCount, color: '#9a3412', bg: '#fff7ed' },
          { label: 'Critical (72h+)', value: criticalCount, color: '#991b1b', bg: '#fee2e2' },
        ].map(card => (
          <div key={card.label} style={{
            flex: '1 1 160px', padding: '14px 18px', borderRadius: 10,
            background: card.bg, border: `1px solid ${card.color}22`,
          }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'all',     label: 'All' },
          { key: 'pending', label: 'Pending / Draft' },
          { key: 'overdue', label: '⏰ Overdue' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: filter === tab.key ? 700 : 400,
              background: filter === tab.key ? '#3a7bd5' : '#f1f5f9',
              color: filter === tab.key ? '#fff' : '#475569',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Queue list */}
      {filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>
          {filter === 'overdue' ? 'No overdue cases.' : 'No cases in queue.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(ep => {
            const rowBg = ep.isCritical
              ? '#fff5f5'
              : ep.isOverdue
              ? '#fffbf5'
              : '#fff';
            const borderLeft = ep.isCritical
              ? '4px solid #ef4444'
              : ep.isOverdue
              ? '4px solid #f97316'
              : '4px solid #e2e8f0';

            return (
              <div
                key={ep.episodeId}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 20px', borderRadius: 10,
                  background: rowBg, border: '1px solid #e2e8f0',
                  borderLeft, cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                  flexWrap: 'wrap', gap: 12,
                }}
                onClick={() => onSelectEpisode && onSelectEpisode(ep)}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                {/* Patient info */}
                <div style={{ flex: '1 1 220px' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                    {ep.patientName}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                    {ep.age ? `${ep.age} yrs` : ''}{ep.age && ep.sex ? ' · ' : ''}{ep.sex || ''}
                    {(ep.age || ep.sex) ? ' · ' : ''}
                    {CONDITION_LABELS[ep.conditionType] || ep.conditionType}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Submitted: {ep.submittedAt
                      ? new Date(ep.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </div>
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Hoursbage hours={ep.hoursSinceSubmission} isOverdue={ep.isOverdue} isCritical={ep.isCritical} />
                  <StatusBadge status={ep.opinionStatus} />
                </div>

                {/* Action */}
                <button
                  onClick={e => { e.stopPropagation(); onSelectEpisode && onSelectEpisode(ep); }}
                  style={{
                    padding: '8px 20px', borderRadius: 8,
                    background: ep.isCritical ? '#ef4444' : '#3a7bd5',
                    color: '#fff', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ep.opinionStatus === 'draft' ? 'Continue Opinion' :
                   ep.opinionStatus === 'submitted' ? 'Amend / Close' :
                   ep.opinionStatus === 'acknowledged' ? 'Close Episode' :
                   'Write Opinion'}
                </button>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

// Fix: typo in component name inside render
function Hoursbage(props) { return <Hoursbadge {...props} />; }
