// src/components/OpinionViewer.js
// Patient reads the submitted online opinion and acknowledges it

import React, { useState, useEffect } from 'react';
import { opinionAPI, adviseLetterAPI, authAPI } from '../api/index';

function Section({ title, accent, children }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 10,
      overflow: 'hidden', marginBottom: 16,
    }}>
      <div style={{
        padding: '10px 16px',
        background: accent + '12',
        borderBottom: `2px solid ${accent}30`,
        fontWeight: 700, fontSize: 13,
        color: accent, textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {title}
      </div>
      <div style={{ padding: '14px 16px', fontSize: 14, color: '#1f2937', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

function InvestigationList({ investigations }) {
  if (!investigations || investigations.length === 0) {
    return <p style={{ color: '#9ca3af', margin: 0 }}>No investigations advised.</p>;
  }

  const grouped = investigations.reduce((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            {category}
          </div>
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '6px 0', borderBottom: '1px solid #f3f4f6',
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: '#dbeafe', color: '#1d4ed8',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
              }}>✓</span>
              <div>
                <span style={{ fontWeight: 600, color: '#111827' }}>{item.name}</span>
                {item.is_custom && (
                  <span style={{
                    fontSize: 10, background: '#fef3c7', color: '#92400e',
                    padding: '1px 5px', borderRadius: 4, marginLeft: 6,
                  }}>Custom</span>
                )}
                {item.note && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    Note: {item.note}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function OpinionViewer({ episodeId, onAcknowledged }) {
  const [opinion,    setOpinion]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [acking,     setAcking]     = useState(false);
  const [ackError,   setAckError]   = useState(null);
  const [confirmed,  setConfirmed]  = useState(false);
  const [letterReady, setLetterReady] = useState(false);
  // migration 019 — physician has submitted, but the translation into the
  // patient's preferred language hasn't succeeded yet. Distinct from
  // `opinion === null` with no flag, which means the doctor hasn't
  // submitted an opinion at all yet.
  const [translationPending, setTranslationPending] = useState(false);

  useEffect(() => {
    if (!episodeId) return;

    let cancelled = false;
    let pollTimer = null;

    const fetchOpinion = (isPoll) => {
      opinionAPI.getPatientOpinion(episodeId)
        .then(res => {
          if (cancelled) return;
          if (res.data) {
            setOpinion(res.data);
            setTranslationPending(false);
          } else if (res.translationPending) {
            setTranslationPending(true);
            // Keep checking in the background — translation retries
            // server-side and this picks it up without the patient having
            // to manually refresh the page.
            pollTimer = setTimeout(() => fetchOpinion(true), 15000);
          } else {
            setTranslationPending(false);
          }
        })
        .catch(() => { if (!cancelled) setError('Failed to load opinion.'); })
        .finally(() => { if (!cancelled && !isPoll) setLoading(false); });
    };

    fetchOpinion(false);

    // Check advise letter status (non-fatal)
    adviseLetterAPI.getStatus(episodeId)
      .then(res => { if (!cancelled) setLetterReady(res.ready || false); })
      .catch(() => {});

    return () => { cancelled = true; if (pollTimer) clearTimeout(pollTimer); };
  }, [episodeId]);

  const acknowledge = async () => {
    if (!opinion?.opinionId) return;
    setAcking(true);
    setAckError(null);
    try {
      await opinionAPI.acknowledgeOpinion(opinion.opinionId);
      setOpinion(prev => ({ ...prev, status: 'acknowledged', acknowledgedAt: new Date().toISOString() }));
      onAcknowledged && onAcknowledged();
    } catch (err) {
      setAckError(err?.response?.data?.message || 'Failed to acknowledge. Please try again.');
    } finally {
      setAcking(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Loading online opinion…</div>;
  }

  if (error) {
    return <div style={{ padding: 16, color: '#ef4444', fontSize: 14 }}>{error}</div>;
  }

  if (!opinion && translationPending) {
    return (
      <div style={{
        padding: 32, textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🌐</div>
        <div style={{ fontSize: 15, color: '#64748b', fontWeight: 600 }}>
          Your doctor's opinion is ready
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>
          It's being translated into your selected language — this page will
          update automatically in a few moments. No need to refresh.
        </div>
      </div>
    );
  }

  if (!opinion) {
    return (
      <div style={{
        padding: 32, textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 15, color: '#64748b', fontWeight: 600 }}>
          Your online opinion is being prepared
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>
          Our panel doctor will complete the review within 48–72 hours.
          You will be notified via WhatsApp and email once it is ready.
        </div>
      </div>
    );
  }

  const isAcknowledged = opinion.status === 'acknowledged';

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '0 auto', padding: 24 }}>

      {/* Header */}
      <div style={{
        padding: '16px 20px', borderRadius: 10,
        background: 'linear-gradient(135deg, #3a7bd5, #2563eb)',
        color: '#fff', marginBottom: 24,
      }}>
        <div style={{ fontSize: 12, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1 }}>
          Online Opinion
          {opinion.language && opinion.language !== 'en' && (
            <span style={{ marginLeft: 8, opacity: 0.75, textTransform: 'none', letterSpacing: 0 }}>
              (translated for you)
            </span>
          )}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
          {opinion.doctorName}
          {opinion.qualification && (
            <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.85, marginLeft: 8 }}>
              {opinion.qualification}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          Opinion date:{' '}
          {opinion.submittedAt
            ? new Date(opinion.submittedAt).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: '2-digit', month: 'long', year: 'numeric',
              })
            : '—'}
          {opinion.lastAmendedAt && opinion.lastAmendedAt !== opinion.submittedAt && (
            <span style={{ marginLeft: 12, opacity: 0.7 }}>
              (Last updated:{' '}
              {new Date(opinion.lastAmendedAt).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: '2-digit', month: 'short', year: 'numeric',
              })})
            </span>
          )}
        </div>
        {isAcknowledged && (
          <div style={{
            marginTop: 10, display: 'inline-block',
            background: 'rgba(255,255,255,0.2)', padding: '3px 12px',
            borderRadius: 20, fontSize: 12,
          }}>
            ✓ Acknowledged by you on{' '}
            {new Date(opinion.acknowledgedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* Sections */}
      <Section title="Clinical Summary" accent="#3a7bd5">
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{opinion.clinicalSummary || '—'}</p>
      </Section>

      <Section title="Impression / Diagnosis" accent="#7c3aed">
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{opinion.impression || '—'}</p>
      </Section>

      <Section title="Advice" accent="#059669">
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{opinion.advice || '—'}</p>
      </Section>

      <Section title="Advised Investigations" accent="#d97706">
        <InvestigationList investigations={opinion.investigations} />
      </Section>

      {opinion.remarks && (
        <Section title="Additional Remarks" accent="#6b7280">
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{opinion.remarks}</p>
        </Section>
      )}

      {/* Disclaimer */}
      <div style={{
        padding: '12px 16px', borderRadius: 8,
        background: '#f8fafc', border: '1px solid #e2e8f0',
        fontSize: 12, color: '#64748b', lineHeight: 1.6, marginTop: 8, marginBottom: 24,
      }}>
        <strong>Important:</strong> This is an online opinion provided for informational purposes only and is based on the information and reports submitted. It does not replace an in-person clinical examination. Please consult a physician in person for any emergency or if symptoms worsen.
      </div>

      {/* Acknowledge section */}
      {!isAcknowledged ? (
        <div style={{
          padding: '20px 24px', borderRadius: 10,
          border: '2px solid #3a7bd5', background: '#eff6ff',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1e40af', marginBottom: 12 }}>
            Acknowledge this Online Opinion
          </div>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            cursor: 'pointer', fontSize: 13, color: '#1f2937', marginBottom: 16,
          }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#3a7bd5', width: 16, height: 16, flexShrink: 0 }}
            />
            <span>
              I have read and understood the online opinion provided by {opinion.doctorName}.
              I understand that acknowledging this will lock the opinion for my records
              and the doctor will be notified.
            </span>
          </label>

          {ackError && (
            <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
              {ackError}
            </div>
          )}

          <button
            onClick={acknowledge}
            disabled={!confirmed || acking}
            style={{
              padding: '10px 28px', borderRadius: 8,
              background: confirmed && !acking ? '#3a7bd5' : '#93c5fd',
              color: '#fff', border: 'none',
              cursor: confirmed && !acking ? 'pointer' : 'not-allowed',
              fontSize: 14, fontWeight: 700,
              transition: 'background 0.2s',
            }}
          >
            {acking ? 'Acknowledging…' : 'I Acknowledge this Opinion'}
          </button>
        </div>
      ) : (
        <div style={{
          padding: '16px 20px', borderRadius: 10,
          background: '#f0fdf4', border: '1px solid #86efac',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 24 }}>✅</span>
          <div>
            <div style={{ fontWeight: 700, color: '#15803d', fontSize: 14 }}>
              Opinion Acknowledged
            </div>
            <div style={{ color: '#166534', fontSize: 13 }}>
              You acknowledged this opinion on{' '}
              {new Date(opinion.acknowledgedAt).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: '2-digit', month: 'long', year: 'numeric',
              })}.
              This opinion is now saved permanently in your records.
            </div>
          </div>
        </div>
      )}

      {/* ── Advise Letter download ── */}
      {letterReady && (
        <div style={{
          marginTop: 20, padding: '16px 20px', borderRadius: 10,
          border: '1px solid #fcd34d', background: '#fffbeb',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e' }}>
              📄 Advise Letter Available
            </div>
            <div style={{ fontSize: 13, color: '#78350f', marginTop: 3 }}>
              Your Advise Letter from the doctor is ready to download.
            </div>
          </div>
          <button
            onClick={() => {
              const token = authAPI.getToken();
              const url   = adviseLetterAPI.patientDownload(episodeId);
              // Fetch as blob so auth header is sent
              fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.blob())
                .then(blob => {
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `ThyroConsult_AdviseLetter.pdf`;
                  a.click();
                })
                .catch(() => alert('Download failed. Please try again.'));
            }}
            style={{
              padding: '9px 22px', borderRadius: 8,
              background: '#d97706', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            ⬇ Download Advise Letter
          </button>
        </div>
      )}

    </div>
  );
}
