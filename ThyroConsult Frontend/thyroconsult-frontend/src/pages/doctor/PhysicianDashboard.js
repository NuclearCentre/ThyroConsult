// ============================================================
// Full path:
//   thyroconsult-frontend\src\pages\doctor\PhysicianDashboard.js
//
// Physician portal — English only, always.
// Landing page showing pending investigation reviews and
// follow-up visit reviews in two separate queues.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { physicianAPI } from '../../api';
import InvestigationReview from '../../components/physician/InvestigationReview';
import FollowUpReview      from '../../components/physician/FollowUpReview';

const CONDITION_COLORS = {
  hypo:   '#185FA5',
  hyper:  '#854F0B',
  tc:     '#993C1D',
  nodule: '#534AB7',
};

const CONDITION_LABELS = {
  hypo:   'Hypothyroidism',
  hyper:  'Hyperthyroidism',
  tc:     'CA Thyroid',
  nodule: 'Thyroid Nodule',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date)) / 86400000);
}

// ─────────────────────────────────────────────────────────────
export default function PhysicianDashboard({ doctor }) {
  const [pending,     setPending]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [activeView,  setActiveView]  = useState(null); // { type, episodeId, visitId? }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await physicianAPI.getPendingWork();
      setPending(data);
    } catch (err) {
      console.error('getPendingWork:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Route to child views ──
  if (activeView?.type === 'investigations') {
    return (
      <InvestigationReview
        episodeId={activeView.episodeId}
        onBack={() => { setActiveView(null); load(); }}
      />
    );
  }

  if (activeView?.type === 'followup') {
    return (
      <FollowUpReview
        episodeId={activeView.episodeId}
        visitId={activeView.visitId}
        onBack={() => { setActiveView(null); load(); }}
      />
    );
  }

  const invQueue     = pending?.investigationQueue     || [];
  const fupQueue     = pending?.followupQueue          || [];
  const missingInfo  = pending?.missingReportsInfo     || [];
  const totalPending = pending?.totalPending           || 0;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px 40px', fontFamily: 'system-ui, sans-serif' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 0', borderBottom: '1px solid #e8e8e8', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a2e' }}>ThyroConsult — Physician Portal</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Dr. {doctor?.name || 'Physician'}</div>
        </div>
        {totalPending > 0 && (
          <div style={{ background: '#FCEBEB', color: '#791F1F', fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20 }}>
            {totalPending} pending review{totalPending > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {loading && <div style={{ fontSize: 13, color: '#888', padding: '30px 0' }}>Loading pending reviews...</div>}

      {!loading && totalPending === 0 && missingInfo.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#27ae60', marginBottom: 6 }}>All clear</div>
          <div style={{ fontSize: 13, color: '#888' }}>No pending reviews at this time.</div>
        </div>
      )}

      {/* ── Investigation review queue ── */}
      {invQueue.length > 0 && (
        <>
          <QueueLabel
            label="Investigation reports to review"
            count={invQueue.length}
            color="#534AB7"
            hint="Patients have uploaded reports for investigations you advised — review and mark as done"
          />
          {invQueue.map(ep => (
            <EpisodeCard
              key={ep.episode_id}
              ep={ep}
              badge={{ label: `${ep.uploaded_investigation_count} report${ep.uploaded_investigation_count > 1 ? 's' : ''} uploaded`, bg: '#EEEDFE', color: '#3C3489' }}
              actionLabel="Review reports →"
              actionColor="#534AB7"
              urgency={daysSince(ep.patient_notified_at) > 3 ? 'high' : 'normal'}
              onAction={() => setActiveView({ type: 'investigations', episodeId: ep.episode_id })}
            />
          ))}
        </>
      )}

      {/* ── Follow-up review queue ── */}
      {fupQueue.length > 0 && (
        <>
          <QueueLabel
            label="Follow-up visits to review"
            count={fupQueue.length}
            color="#185FA5"
            hint="Patients have submitted follow-up visits with new lab results and symptom updates"
          />
          {fupQueue.map(ep => (
            <EpisodeCard
              key={ep.episode_id}
              ep={ep}
              badge={{ label: `${ep.pending_followup_count} follow-up submitted`, bg: '#E6F1FB', color: '#0C447C' }}
              actionLabel="Review follow-up →"
              actionColor="#185FA5"
              urgency={daysSince(ep.submitted_at) > 5 ? 'high' : 'normal'}
              onAction={() => setActiveView({ type: 'followup', episodeId: ep.episode_id })}
            />
          ))}
        </>
      )}

      {/* ── Missing reports info (no action needed, just awareness) ── */}
      {missingInfo.length > 0 && (
        <>
          <QueueLabel
            label="Incomplete first visits"
            count={missingInfo.length}
            color="#854F0B"
            hint="These patients submitted questionnaires but did not upload all lab reports — awaiting uploads"
          />
          {missingInfo.map(ep => (
            <EpisodeCard
              key={ep.episode_id}
              ep={ep}
              badge={{ label: 'Reports pending from patient', bg: '#FAEEDA', color: '#633806' }}
              actionLabel={null}
              actionColor={null}
              urgency="low"
              onAction={null}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ─── Queue section label ──
function QueueLabel({ label, count, color, hint }) {
  return (
    <div style={{ marginBottom: 10, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{label}</span>
        <span style={{ fontSize: 11, background: color, color: '#fff', borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>{count}</span>
      </div>
      <div style={{ fontSize: 11, color: '#aaa' }}>{hint}</div>
    </div>
  );
}

// ─── Episode card ──
function EpisodeCard({ ep, badge, actionLabel, actionColor, urgency, onAction }) {
  const color = CONDITION_COLORS[ep.condition_type] || '#888';
  const days  = daysSince(ep.patient_notified_at || ep.submitted_at);

  return (
    <div style={{ border: `1px solid ${urgency === 'high' ? '#E24B4A' : '#e8e8e8'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{ep.patient_name}</span>
          <span style={{ fontSize: 12, color: '#888' }}>· {ep.patient_age}y · {ep.gender}</span>
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
          {CONDITION_LABELS[ep.condition_type] || ep.condition_type}
          {ep.submitted_at && <span style={{ marginLeft: 8, color: '#aaa' }}>· Submitted {fmtDate(ep.submitted_at)}</span>}
          {days !== null && urgency === 'high' && (
            <span style={{ marginLeft: 8, color: '#791F1F', fontWeight: 500 }}>· {days} days waiting</span>
          )}
        </div>
        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: badge.bg, color: badge.color, fontWeight: 500 }}>
          {badge.label}
        </span>
      </div>
      {actionLabel && (
        <button
          onClick={onAction}
          style={{ flexShrink: 0, padding: '8px 16px', background: actionColor, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
