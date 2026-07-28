// src/components/PatientTimeline.js
// 5-step episode timeline shown on patient dashboard
// Steps: Paid → Submitted → Doctor Reviewing → Opinion Ready → Closed

import React, { useState, useEffect } from 'react';
import { opinionAPI } from '../api/index';

const STEP_ICONS = {
  paid:          '💳',
  submitted:     '📋',
  reviewing:     '🔍',
  opinion_ready: '📄',
  closed:        '✅',
};

function TimelineStep({ step, isLast, index }) {
  const { completed, inProgress, label, detail, timestamp } = step;

  const circleColor = completed
    ? '#16a34a'
    : inProgress
    ? '#3a7bd5'
    : '#d1d5db';

  const lineColor = completed ? '#16a34a' : '#e5e7eb';

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* Spine */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: circleColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
          boxShadow: inProgress ? `0 0 0 4px ${circleColor}22` : 'none',
          transition: 'all 0.3s',
        }}>
          {completed
            ? <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>✓</span>
            : inProgress
            ? <span style={{ fontSize: 16 }}>{STEP_ICONS[step.key]}</span>
            : <span style={{ color: '#9ca3af', fontSize: 16 }}>{index + 1}</span>}
        </div>
        {!isLast && (
          <div style={{
            width: 2, flex: 1, minHeight: 32,
            background: lineColor,
            margin: '4px 0',
            transition: 'background 0.3s',
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{ paddingBottom: isLast ? 0 : 28, paddingTop: 6 }}>
        <div style={{
          fontWeight: 700, fontSize: 14,
          color: completed ? '#15803d' : inProgress ? '#1d4ed8' : '#9ca3af',
        }}>
          {label}
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>
          {detail}
        </div>
        {timestamp && (
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            {new Date(timestamp).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })} IST
          </div>
        )}
        {inProgress && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 8, padding: '4px 12px', borderRadius: 20,
            background: '#eff6ff', border: '1px solid #bfdbfe',
            fontSize: 12, color: '#1d4ed8', fontWeight: 600,
          }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#3a7bd5', animation: 'pulse 1.5s infinite' }} />
            In progress
          </div>
        )}
      </div>
    </div>
  );
}

export default function PatientTimeline({ episodeId, onOpinionReady }) {
  const [steps,   setSteps]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!episodeId) return;
    setLoading(true);
    opinionAPI.getEpisodeTimeline(episodeId)
      .then(res => {
        setSteps(res.data?.steps || []);
        // Notify parent if opinion is ready
        const opinionStep = res.data?.steps?.find(s => s.key === 'opinion_ready');
        if (opinionStep?.completed && onOpinionReady) onOpinionReady();
      })
      .catch(() => setError('Could not load timeline.'))
      .finally(() => setLoading(false));
  }, [episodeId, onOpinionReady]);

  if (loading) {
    return <div style={{ padding: 20, color: '#94a3b8', fontSize: 14 }}>Loading timeline…</div>;
  }

  if (error) {
    return <div style={{ padding: 12, color: '#ef4444', fontSize: 14 }}>{error}</div>;
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* SLA notice — shown while reviewing */}
      {steps.find(s => s.key === 'reviewing' && s.inProgress) && (
        <div style={{
          padding: '12px 16px', borderRadius: 8,
          background: '#fffbeb', border: '1px solid #fcd34d',
          marginBottom: 20, fontSize: 13, color: '#92400e',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>ℹ️</span>
          <div>
            <strong>Your case is under review.</strong><br />
            Our panel doctor will provide an online opinion within <strong>48–72 hours</strong> of submission.
            You will be notified via WhatsApp and email as soon as it is ready.
          </div>
        </div>
      )}

      {steps.map((step, i) => (
        <TimelineStep
          key={step.key}
          step={step}
          index={i}
          isLast={i === steps.length - 1}
        />
      ))}
    </div>
  );
}
