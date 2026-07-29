// PatientDashboard.js
// Patient portal landing page after login.
// Shows timeline of all episodes, deadline banners, payment walls.
// Scenarios handled:
//   S1 — missing reports: free ≤14d, full fee >14d
//   S2 — advised investigations: 50% ≤28d, full fee >28d
//   S3 — follow-up visit: always full fee

import React, { useEffect, useState, useCallback } from 'react';
import { patientAPI } from '../api';
import MissingReports      from './MissingReports';
import InvestigationUpload from './InvestigationUpload';
import FollowUpVisit       from './FollowUpVisit';
import { loadRazorpayScript } from '../../utils/loadRazorpay';

const CONDITION_LABELS = {
  hypothyroidism:  'Hypothyroidism',
  hyperthyroidism: 'Hyperthyroidism',
  thyroid_cancer:  'CA Thyroid',
  nodule:          'Thyroid Nodule',
};

const CONDITION_COLORS = {
  hypothyroidism:  '#185FA5',
  hyperthyroidism: '#854F0B',
  thyroid_cancer:  '#993C1D',
  nodule:          '#534AB7',
};

const RUPEES = paise => `₹ ${(paise / 100).toLocaleString('en-IN')}`;

// ─────────────────────────────────────────────────────────────
export default function PatientDashboard({ patient }) {
  const [episodes,    setEpisodes]    = useState([]);
  const [gateStatus,  setGateStatus]  = useState({});  // episodeId → gate object
  const [loading,     setLoading]     = useState(true);
  const [activeView,  setActiveView]  = useState(null); // { type, episodeId }
  const [payingFor,   setPayingFor]   = useState(null); // episodeId currently processing payment

  // ── Load all episodes ──
  const loadEpisodes = useCallback(async () => {
    setLoading(true);
    try {
      const eps = await patientAPI.getEpisodes(patient.id);
      setEpisodes(eps);

      // Fetch gate status for each active episode
      const statusMap = {};
      await Promise.all(
        eps
          .filter(ep => ep.status !== 'reviewed')
          .map(async ep => {
            try {
              statusMap[ep.id] = await patientAPI.getGateStatus(ep.id);
            } catch {
              statusMap[ep.id] = null;
            }
          })
      );
      setGateStatus(statusMap);
    } finally {
      setLoading(false);
    }
  }, [patient.id]);

  useEffect(() => { loadEpisodes(); }, [loadEpisodes]);

  // ── Razorpay checkout ──
  const handlePay = useCallback(async (episode, gate) => {
    setPayingFor(episode.id);
    try {
      await loadRazorpayScript();
      const order = await patientAPI.createPaymentOrder({
        episodeId:     episode.id,
        scenario:      gate.scenario,
        conditionType: episode.condition,
      });

      if (order.free) {
        await loadEpisodes();
        return;
      }

      const options = {
        key:      order.keyId,
        amount:   order.amountPaise,
        currency: 'INR',
        name:     'ThyroConsult',
        description: `Online opinion — ${CONDITION_LABELS[episode.condition]}`,
        order_id: order.orderId,
        prefill: {
          name:  patient.name,
          email: patient.email,
          contact: patient.phone,
        },
        theme: { color: '#185FA5' },
        handler: async (response) => {
          // Verify client-side (belt-and-braces alongside webhook)
          await patientAPI.verifyPayment({
            razorpayOrderId:   response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          // Reload to reflect unlocked state
          await loadEpisodes();
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => setPayingFor(null));
      rzp.open();
    } catch (err) {
      console.error('Payment error:', err);
    } finally {
      setPayingFor(null);
    }
  }, [patient, loadEpisodes]);

  // ── Navigate into a scenario ──
  const openView = (type, episodeId) => setActiveView({ type, episodeId });
  const closeView = () => { setActiveView(null); loadEpisodes(); };

  // ── Child view router ──
  if (activeView) {
    const ep = episodes.find(e => e.id === activeView.episodeId);
    if (activeView.type === 's1') return <MissingReports patient={patient} episode={ep} onBack={closeView} />;
    if (activeView.type === 's2') return <InvestigationUpload patient={patient} episode={ep} onBack={closeView} />;
    if (activeView.type === 's3') return <FollowUpVisit patient={patient} episode={ep} onBack={closeView} />;
  }

  const activeEpisodes    = episodes.filter(ep => ep.status !== 'reviewed');
  const completedEpisodes = episodes.filter(ep => ep.status === 'reviewed');

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '0 16px 40px' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '0.5px solid var(--border)', marginBottom: 20 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>ThyroConsult</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{patient.name}</span>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: '#185FA5' }}>
            {patient.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>My consultations</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>
        Tap an action on any visit to continue
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading...</div>}

      {/* ── Active episodes ── */}
      {activeEpisodes.length > 0 && (
        <>
          <SectionLabel>ACTIVE</SectionLabel>
          {activeEpisodes.map(ep => (
            <EpisodeCard
              key={ep.id}
              episode={ep}
              gate={gateStatus[ep.id]}
              paying={payingFor === ep.id}
              onPay={() => handlePay(ep, gateStatus[ep.id])}
              onOpen={openView}
            />
          ))}
        </>
      )}

      {/* ── Completed episodes ── */}
      {completedEpisodes.length > 0 && (
        <>
          <SectionLabel>COMPLETED</SectionLabel>
          {completedEpisodes.map(ep => (
            <EpisodeCard
              key={ep.id}
              episode={ep}
              gate={null}
              paying={false}
              onPay={null}
              onOpen={openView}
              completed
            />
          ))}
        </>
      )}

      {!loading && episodes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
          No consultations yet.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EpisodeCard
// Renders one timeline card with banner + payment wall if needed
// ─────────────────────────────────────────────────────────────
function EpisodeCard({ episode, gate, paying, onPay, onOpen, completed }) {
  const color = CONDITION_COLORS[episode.condition] || '#888';
  const label = CONDITION_LABELS[episode.condition] || episode.condition;

  const needsPayment = gate?.paymentRequired !== null && gate?.paymentRequired !== undefined;
  const isLocked     = needsPayment && !completed;

  return (
    <div style={{ border: '0.5px solid var(--border)', borderRadius: 12, marginBottom: 12, background: 'var(--bg-primary)', overflow: 'hidden' }}>

      {/* ── Deadline / payment banner ── */}
      {gate && !completed && <DeadlineBanner gate={gate} episode={episode} />}

      {/* ── Payment wall ── */}
      {isLocked && (
        <PaymentWall
          gate={gate}
          episode={episode}
          paying={paying}
          onPay={onPay}
        />
      )}

      {/* ── Card body ── */}
      <div style={{ padding: '12px 14px', opacity: isLocked ? 0.5 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, marginRight: 6, verticalAlign: 'middle' }} />
              {label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              First visit · {fmtDate(episode.questionnaire_completed_at || episode.created_at)}
            </div>
          </div>
          <StatusBadge episode={episode} gate={gate} completed={completed} />
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {episodeStatusNote(episode, gate, completed)}
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
          {!completed && gate?.scenario === 's1' && (
            <ActionBtn primary onClick={() => onOpen('s1', episode.id)} icon="ti-upload">
              {isLocked ? 'Pay to unlock upload' : 'Upload missing reports'}
            </ActionBtn>
          )}
          {!completed && gate?.scenario === 's2' && (
            <ActionBtn primary onClick={() => onOpen('s2', episode.id)} icon="ti-flask">
              {isLocked ? 'Pay to upload reports' : 'Upload investigation reports'}
            </ActionBtn>
          )}
          {!completed && !gate?.scenario && (
            <ActionBtn primary onClick={() => onOpen('s3', episode.id)} icon="ti-plus">
              Start follow-up visit
            </ActionBtn>
          )}
          {completed && (
            <>
              <ActionBtn icon="ti-file-text">View report</ActionBtn>
              <ActionBtn primary onClick={() => onOpen('s3', episode.id)} icon="ti-plus">
                Start new follow-up
              </ActionBtn>
            </>
          )}
        </div>

        {isLocked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
            <i className="ti ti-lock" aria-hidden="true" />
            Complete payment above to unlock
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DeadlineBanner — shown when within free/discount window
// ─────────────────────────────────────────────────────────────
function DeadlineBanner({ gate, episode }) {
  const { warningLevel, daysLeft, scenario, paymentRequired } = gate;
  if (!warningLevel || paymentRequired) return null; // payment wall replaces banner

  const isUrgent  = warningLevel === 'urgent';
  const bgColor   = isUrgent ? 'var(--bg-danger)'  : scenario === 's2' ? 'var(--bg-info)' : 'var(--bg-warning)';
  const textColor = isUrgent ? 'var(--text-danger)' : scenario === 's2' ? 'var(--text-info)' : 'var(--text-warning)';
  const icon      = isUrgent ? 'ti-alert-triangle'  : 'ti-clock';

  let title, body;
  if (scenario === 's1') {
    title = isUrgent
      ? `Only ${daysLeft} day${daysLeft === 1 ? '' : 's'} left — upload now to avoid extra charge`
      : `${daysLeft} days left to upload at no extra charge`;
    body = isUrgent
      ? `After the deadline, uploading will require payment of the full online opinion fee.`
      : `Upload your missing reports before the deadline to complete your visit for free.`;
  } else if (scenario === 's2') {
    title = `Follow-up fee applies — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left at 50% rate`;
    body  = `Pay the follow-up rate (50% of original fee) before the 28-day window closes. After that, the full fee applies.`;
  }

  return (
    <div style={{ background: bgColor, color: textColor, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12 }}>
      <i className={`ti ${icon}`} style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <div>
        <div style={{ fontWeight: 500, marginBottom: 2 }}>{title}</div>
        <div>{body}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PaymentWall — shown when payment is required
// ─────────────────────────────────────────────────────────────
function PaymentWall({ gate, episode, paying, onPay }) {
  const { paymentRequired, baseFee, scenario } = gate;
  if (!paymentRequired) return null;

  const { type, discountPct, amountPaise } = paymentRequired;

  const reasonMap = {
    s1_full:     '14-day free upload window has expired',
    s2_followup: 'Doctor-advised investigation upload — within 28-day window',
    s2_full:     '28-day follow-up discount window has expired',
    s3_full:     'New follow-up visit — full online opinion fee applies',
  };

  return (
    <div style={{ borderBottom: '0.5px solid var(--border)', padding: '14px 14px 12px', background: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-credit-card" style={{ color: 'var(--text-danger)', fontSize: 18 }} aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Payment required</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            {CONDITION_LABELS[episode.condition]} · {fmtDate(episode.questionnaire_completed_at)}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
        <i className="ti ti-info-circle" aria-hidden="true" />
        {reasonMap[type]}
      </div>

      {/* Fee breakdown */}
      <FeeRow label="Online opinion fee" value={RUPEES(baseFee)} muted={discountPct > 0} strike={discountPct > 0} />
      {discountPct > 0 && (
        <FeeRow label={`Follow-up discount (${discountPct}%)`} value={`— ${RUPEES(baseFee - amountPaise)}`} muted />
      )}
      {discountPct === 0 && type !== 's3_full' && (
        <FeeRow label="Follow-up discount" value="Not applicable" muted />
      )}
      <FeeRow label="Amount due" value={RUPEES(amountPaise)} bold />

      <button
        onClick={onPay}
        disabled={paying}
        style={{ width: '100%', padding: '10px', background: 'var(--bg-success)', color: 'var(--text-success)', border: '0.5px solid var(--border-success)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: paying ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, opacity: paying ? 0.7 : 1 }}
      >
        <i className="ti ti-lock-open" aria-hidden="true" />
        {paying ? 'Opening payment...' : `Pay ${RUPEES(amountPaise)} to continue`}
      </button>

      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <i className="ti ti-shield-check" aria-hidden="true" />
        Secured by Razorpay
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────
function FeeRow({ label, value, muted, bold, strike }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: muted ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 500 : 400, textDecoration: strike ? 'line-through' : 'none', color: muted ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function StatusBadge({ episode, gate, completed }) {
  if (completed) return <Badge bg="#F1EFE8" color="#5F5E5A">Reviewed</Badge>;
  if (gate?.paymentRequired) return <Badge bg="var(--bg-danger)" color="var(--text-danger)">Payment due</Badge>;
  if (gate?.scenario === 's1') return <Badge bg="var(--bg-warning)" color="var(--text-warning)">Incomplete</Badge>;
  if (gate?.scenario === 's2') return <Badge bg="var(--bg-info)" color="var(--text-info)">Investigations advised</Badge>;
  return <Badge bg="#EEEDFE" color="#3C3489">Follow-up due</Badge>;
}

function Badge({ bg, color, children }) {
  return (
    <span style={{ background: bg, color, fontSize: 11, padding: '3px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {children}
    </span>
  );
}

function ActionBtn({ children, onClick, primary, icon }) {
  return (
    <button
      onClick={onClick}
      style={{ fontSize: 12, padding: '5px 11px', border: `0.5px solid ${primary ? 'var(--border-info)' : 'var(--border)'}`, borderRadius: 8, background: primary ? 'var(--bg-info)' : 'transparent', color: primary ? 'var(--text-info)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
    >
      {icon && <i className={`ti ${icon}`} aria-hidden="true" />}
      {children}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.05em', margin: '14px 0 8px' }}>
      {children}
    </div>
  );
}

function episodeStatusNote(episode, gate, completed) {
  if (completed)                    return 'Online opinion given · No pending actions';
  if (!gate)                        return 'No pending actions';
  if (gate.paymentRequired)         return gate.scenario === 's2'
    ? 'Pay to upload investigation reports advised by your doctor'
    : gate.scenario === 's1'
    ? 'Free upload window expired — payment required to submit reports'
    : 'Pay to submit your follow-up visit';
  if (gate.scenario === 's1')       return `${gate.missing?.length || ''} reports not yet uploaded`;
  if (gate.scenario === 's2')       return 'Investigations advised — pay and upload reports';
  return 'Treatment ongoing · Submit follow-up with new reports and symptom update';
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
