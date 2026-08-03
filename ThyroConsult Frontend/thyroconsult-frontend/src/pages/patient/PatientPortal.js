import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts';
import { patientAPI, receiptAPI, paymentAPI, conditionAPI } from '../../api';
import { PatientSidebar } from '../../components/common/Sidebar';
import { Badge, StatusBadge, EmptyState, Spinner, SectionHeader, SecureBadge } from '../../components/common/index';
import { useAuth } from '../../context/AuthContext';
import ConditionSelection from '../../components/ConditionSelection';
import SelectDoctor from '../../components/SelectDoctor';
import { loadRazorpayScript } from '../../utils/loadRazorpay';
import { HypoQuestionnaire } from '../../components/HypoQuestionnaire';
import HyperQuestionnaire from '../../components/HyperQuestionnaire';
// TcQuestionnaire comes from its own standalone file — the old, much
// smaller dead stub that used to live inside ConditionQuestionnaires.js
// (which caused a materially incomplete questionnaire if pulled in by
// mistake) has since been removed entirely as part of that file's rename
// to HypoQuestionnaire.js. This import was already correct; noting the
// history so nobody re-adds a Tc import from the Hypo file later.
import TcQuestionnaire from '../../components/TcQuestionnaire';
import NoduleQuestionnaire from '../../components/NoduleQuestionnaire';
import PatientTimeline from '../../components/PatientTimeline';
import OpinionViewer from '../../components/OpinionViewer';

// ─── Condition constants ───────────────────────────────────
const CONDITION_LABELS = {
  hypothyroidism:  'Hypothyroidism',
  hyperthyroidism: "Hyperthyroidism (Graves')",
  thyroid_cancer:  'Thyroid Cancer',
};
const CONDITION_COLOURS = {
  hypothyroidism:  { bg: '#e8f0fb', border: '#a8c4f0', text: '#1a5fb4', icon: '🔵' },
  hyperthyroidism: { bg: '#fef3e2', border: '#f9c46b', text: '#c8760a', icon: '🟠' },
  thyroid_cancer:  { bg: '#fdf0f0', border: '#e8a5a5', text: '#a32d2d', icon: '🔴' },
};

// ─── Add Condition Flow (modal overlay) ───────────────────
const SUB = { SELECT: 'select', DOCTOR: 'doctor', PAYMENT: 'payment', CONDITION_Q: 'condition_q', DONE: 'done' };

const CONDITION_LABELS_FOR_PAYMENT = {
  hypothyroidism: 'Hypothyroidism',
  hyperthyroidism: 'Hyperthyroidism',
  thyroid_cancer: 'Thyroid Cancer',
  nodule: 'Thyroid Nodule',
};

const AddConditionFlow = ({ patient, resumeEpisode, onClose, onDone }) => {
  // resumeEpisode = { id, condition } when opened via "Resume" on an
  // existing in-progress episode — skips straight to the questionnaire,
  // since a resumed episode has necessarily already cleared Select
  // Doctor + Payment the first time through. Undefined/null for a
  // genuine "+ Add condition" click, which now starts at SELECT and
  // must go through DOCTOR and PAYMENT before reaching the questionnaire
  // — this is the actual fix: this modal used to skip straight from
  // ConditionSelection to the questionnaire, which is what let patients
  // through without seeing Select Doctor or Payment at all.
  const [sub, setSub]             = useState(resumeEpisode ? SUB.CONDITION_Q : SUB.SELECT);
  const [condition, setCondition] = useState(resumeEpisode?.condition || '');
  const [episodeId, setEpisodeId] = useState(resumeEpisode?.id || null);
  const [paying, setPaying]       = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const ConditionQComponent =
    condition === 'hypothyroidism'  ? HypoQuestionnaire  :
    condition === 'hyperthyroidism' ? HyperQuestionnaire :
    condition === 'thyroid_cancer'  ? TcQuestionnaire    :
    condition === 'nodule'          ? NoduleQuestionnaire : null;

  // NoduleQuestionnaire can call onComplete({ switchToHypo: true }) or
  // ({ switchToHyper: true }) instead of finishing normally, based on the
  // patient's TSH answer — same pattern RegisterPage.js already handles
  // for the initial registration flow. This modal (used for adding a
  // condition after registration) previously didn't import
  // NoduleQuestionnaire at all, so this path was unreachable here.
  const handleConditionQComplete = (result) => {
    if (result?.switchToHypo)  { setCondition('hypothyroidism');  return; }
    if (result?.switchToHyper) { setCondition('hyperthyroidism'); return; }
    setSub(SUB.DONE);
    onDone();
  };

  // ── Select Doctor step ──
  // ConditionSelection already created the episode with a provisional
  // doctor (patient's registration-time default, or none). Re-calling
  // selectCondition here with the doctor the patient actually chose
  // overwrites primary_doctor_id on the episode — its existing
  // ON CONFLICT...COALESCE logic only fills in a doctor if one isn't
  // already set, so this explicit re-call is what makes the patient's
  // choice here actually stick.
  const handleDoctorSelected = async (chosenDoctorId) => {
    try {
      await conditionAPI.selectCondition({ condition, doctorId: chosenDoctorId });
      setSub(SUB.PAYMENT);
    } catch (err) {
      console.error('Failed to assign chosen doctor to episode:', err);
      // Previously set paymentError here, but that's only ever rendered
      // inside the PAYMENT sub-step — since sub never advances past
      // DOCTOR on this path, the message was invisible, and SelectDoctor's
      // own "Continue to payment" button had no way to know the call
      // failed, so it stayed stuck showing its spinner forever. Re-throw
      // instead so SelectDoctor (still mounted, with its own always-
      // visible error banner) can catch and display it, and reset its
      // own button state.
      throw err;
    }
  };

  // ── Payment step ──
  // Uses the 'initial' scenario (paymentController.resolvePayment) —
  // this is a brand-new episode with no questionnaire content yet, gated
  // before the questionnaire is reachable at all. Distinct from the
  // S1/S2/S3 follow-up payments handled elsewhere in the dashboard.
  const handlePay = async () => {
    setPaying(true);
    setPaymentError('');
    try {
      await loadRazorpayScript();
      const order = await paymentAPI.createOrder({
        episodeId,
        scenario: 'initial',
        conditionType: condition,
      });

      // DEV-ONLY bypass fired server-side (paymentController.createOrder,
      // NODE_ENV !== 'production') — payment is already marked paid and
      // the episode already unlocked, nothing to check out. Skip straight
      // to the questionnaire rather than opening a Razorpay modal against
      // a fake order id, which would just fail in the browser.
      if (order.testMode) {
        console.warn('DEV MODE: payment bypassed —', order.message);
        setSub(SUB.CONDITION_Q);
        return;
      }

      const options = {
        key:      order.keyId,
        amount:   order.amountPaise,
        currency: 'INR',
        name:     'ThyroConsult',
        description: `Online opinion — ${CONDITION_LABELS_FOR_PAYMENT[condition]}`,
        order_id: order.orderId,
        prefill: {
          name:    patient?.firstName,
          email:   patient?.email,
          contact: patient?.mobile,
        },
        theme: { color: '#185FA5' },
        handler: async (response) => {
          await paymentAPI.verifyPayment({
            razorpayOrderId:   response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setSub(SUB.CONDITION_Q);
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => {
        setPaying(false);
        setPaymentError('Payment failed. Please try again.');
      });
      rzp.open();
    } catch (err) {
      console.error('Payment error:', err);
      // A 409 here means this episode's initial payment was already
      // completed — most likely reached via a stale "My Conditions" list
      // that didn't show the already-submitted condition, so the patient
      // clicked "+ Add condition" again for the same one. Surface that
      // plainly instead of a generic "please try again", which just
      // invites pointlessly retrying an already-paid order.
      if (err?.response?.status === 409) {
        setPaymentError('This condition has already been paid for and submitted — check "My Conditions" on your dashboard. If you don\'t see it there, please refresh the page.');
      } else {
        setPaymentError(err?.response?.data?.error || 'Could not start payment. Please try again.');
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'40px 16px' }}>
      <div style={{ background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:760, boxShadow:'0 8px 40px rgba(0,0,0,0.18)', minHeight:400 }}>
        {/* Header — just a close button; the questionnaire itself already
            shows its own progress bar, so a repeated title/step-tracker
            here was redundant on every single question screen. */}
        <div style={{ display:'flex', justifyContent:'flex-end', padding:'12px 16px' }}>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text-tertiary)', lineHeight:1 }}>×</button>
        </div>
        {/* Content */}
        <div style={{ padding:'0 28px 24px' }}>
          {sub === SUB.SELECT && (
            <ConditionSelection
              patientId={patient?.id}
              doctorId={patient?.primaryDoctorId}
              onComplete={({ condition: c, episodeId: eid }) => { setCondition(c); setEpisodeId(eid); setSub(SUB.DOCTOR); }}
            />
          )}
          {sub === SUB.DOCTOR && (
            <SelectDoctor
              condition={condition}
              onComplete={handleDoctorSelected}
              onBack={() => setSub(SUB.SELECT)}
            />
          )}
          {sub === SUB.PAYMENT && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom: 8 }}>Payment</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
                Complete payment to unlock the {CONDITION_LABELS_FOR_PAYMENT[condition]} questionnaire.
              </div>
              {paymentError && (
                <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
                  {paymentError}
                </div>
              )}
              <button className="btn btn-primary btn-lg" onClick={handlePay} disabled={paying}>
                {paying ? 'Opening payment…' : 'Pay & continue →'}
              </button>
            </div>
          )}
          {sub === SUB.CONDITION_Q && episodeId && ConditionQComponent && (
            <ConditionQComponent
              patientId={patient?.id}
              episodeId={episodeId}
              patientGender={patient?.gender}
              patientDob={patient?.dob}
              onComplete={handleConditionQComplete}
            />
          )}
          {sub === SUB.DONE && (
            <div style={{ textAlign:'center', padding:'40px 0' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:20, marginBottom:8 }}>Questionnaire submitted successfully</div>
              <div style={{ fontSize:14, color:'var(--text-secondary)', marginBottom:28 }}>Your doctor will review this before your online opinion session.</div>
              <button className="btn btn-primary" onClick={onClose}>Return to dashboard</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Episode status modal (timeline → opinion) ─────────────
// PatientTimeline.js and OpinionViewer.js were fully built but never
// imported/rendered anywhere in the app — patients had no UI path to see
// their episode status or read their online opinion. This modal is that
// path, opened from each episode card in "My conditions".
const EpisodeStatusModal = ({ episodeId, onClose }) => {
  const [opinionReady, setOpinionReady] = useState(false);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'40px 16px' }}>
      <div style={{ background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:760, boxShadow:'0 8px 40px rgba(0,0,0,0.18)', minHeight:300 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 28px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:17, fontWeight:600 }}>
            {opinionReady ? '📄 Your online opinion' : '⏳ Visit status'}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text-tertiary)', lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:'24px 28px' }}>
          {opinionReady ? (
            <OpinionViewer episodeId={episodeId} onAcknowledged={() => {}} />
          ) : (
            <PatientTimeline episodeId={episodeId} onOpinionReady={() => setOpinionReady(true)} />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── My Conditions page ────────────────────────────────────
const MyConditions = ({ patient, onAddCondition, onResumeCondition, conditionsRefreshKey }) => {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusEpisodeId, setStatusEpisodeId] = useState(null);

  const loadEpisodes = () => {
    if (!patient?.id) return;
    setLoading(true);
    setLoadError('');
    patientAPI.getEpisodes(patient.id)
      .then(eps => setEpisodes(eps || []))
      .catch(() => setLoadError('Could not load your conditions. Please try again — do not add a condition again without checking first.'))
      .finally(() => setLoading(false));
  };

  useEffect(loadEpisodes, [patient, conditionsRefreshKey]);

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:32 }}><Spinner /></div>;

  return (
    <>
      <SectionHeader title="My conditions" subtitle="Each condition has its own questionnaire and treatment history"
        action={<button className="btn btn-primary btn-sm" onClick={onAddCondition}>+ Add condition</button>}
      />
      {loadError ? (
        <div className="card" style={{ textAlign:'center', padding:'48px 24px' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:17, marginBottom:6, color: 'var(--red-700, #991b1b)' }}>Could not load your conditions</div>
          <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:20 }}>{loadError}</div>
          <button className="btn btn-secondary" onClick={loadEpisodes}>Retry</button>
        </div>
      ) : episodes.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:'48px 24px' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🩺</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:17, marginBottom:6 }}>No conditions added yet</div>
          <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:20 }}>Add your thyroid condition to begin your online opinion journey</div>
          <button className="btn btn-primary" onClick={onAddCondition}>+ Add condition</button>
        </div>
      ) : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16, marginBottom:16 }}>
            {episodes.map(ep => {
              const c = CONDITION_COLOURS[ep.condition_type] || CONDITION_COLOURS[ep.condition] || CONDITION_COLOURS.hypothyroidism;
              const label = CONDITION_LABELS[ep.condition_type] || CONDITION_LABELS[ep.condition] || ep.condition;
              const isComplete = ep.questionnaire_status === 'completed' || ep.core_q_complete;
              return (
                <div key={ep.id} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:12, padding:'18px 20px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:20 }}>{c.icon}</span>
                    <span style={{ fontWeight:600, color:c.text, fontSize:14 }}>{label}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:8 }}>
                    📅 Started: {ep.episode_start_date ? new Date(ep.episode_start_date).toLocaleDateString('en-IN') : ep.created_at ? new Date(ep.created_at).toLocaleDateString('en-IN') : '—'}
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                    {ep.core_q_complete || isComplete
                      ? <span className="badge badge-teal">✓ Core Q</span>
                      : <span className="badge badge-gray">Core Q pending</span>}
                    {ep.condition_q_complete || isComplete
                      ? <span className="badge badge-teal">✓ Condition Q</span>
                      : <span className="badge badge-gray">Condition Q pending</span>}
                  </div>
                  <StatusBadge status={ep.episode_status || ep.status || 'active'} />

                  {/* In-progress episode: jump straight back into the questionnaire
                      at its saved page — no more re-running condition selection. */}
                  {!isComplete && (
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 10, width: '100%' }}
                      onClick={() => onResumeCondition && onResumeCondition(ep)}
                    >
                      ▶ Resume
                    </button>
                  )}

                  {/* Completed episode: clearly marked submitted, still opens
                      the same status/opinion view as before on click. */}
                  {isComplete && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 10, width: '100%', color: 'var(--teal-700)' }}
                      onClick={() => setStatusEpisodeId(ep.id)}
                    >
                      ✓ Submitted — View status
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ textAlign:'right' }}>
            <button className="btn btn-ghost btn-sm" onClick={onAddCondition}>+ Add another condition</button>
          </div>
          {statusEpisodeId && (
            <EpisodeStatusModal episodeId={statusEpisodeId} onClose={() => setStatusEpisodeId(null)} />
          )}
        </>
      )}
    </>
  );
};

// ─── Shared layout wrapper ─────────────────────────────────
// Header bar added here (not just on the Dashboard route) so the
// language picker is reachable from every page in the patient portal —
// matches how Practo/Apollo/1mg keep it in a persistent top bar rather
// than buried in settings, and closer to how CoWIN/Ayushman Bharat-style
// government health portals treat language as a first-class, always-
// visible choice for a multilingual health audience.
const PatientLayout = ({ children, patient, onLanguageChange, keepAsDefault, onKeepAsDefaultChange, languageError }) => (
  <div className="app-shell">
    <PatientSidebar patient={patient} />
    <main className="main-area">
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        gap: 4, padding: '10px 20px', borderBottom: '1px solid var(--border)',
      }}>
        <LanguagePicker
          value={patient?.preferredLanguage || 'en'}
          onChange={onLanguageChange}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={keepAsDefault}
            onChange={e => onKeepAsDefaultChange(e.target.checked)}
            style={{ accentColor: 'var(--teal-400)', width: 13, height: 13 }}
          />
          Keep as default
        </label>
        {languageError && <div style={{ fontSize: 11, color: 'var(--red-600)' }}>{languageError}</div>}
      </div>
      <div className="page-content">{children}</div>
    </main>
  </div>
);

// ─── Dashboard overview ────────────────────────────────────
const Dashboard = ({ patient, opinions, invoices, onAddCondition, onResumeCondition, conditionsRefreshKey }) => {
  const [bloodValues, setBloodValues] = useState([]);
  useEffect(() => {
    if (patient) {
      patientAPI.getBloodValues({ testName: 'tsh' })
        .then(r => setBloodValues(r.values)).catch(() => {});
    }
  }, [patient]);

  const nextAppt = opinions.find(c => c.status === 'scheduled');

  return (
    <>
      <SectionHeader
        title={`Good day, ${patient?.firstName || ''}` }
        subtitle={new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        action={<SecureBadge />}
      />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total opinions</div>
          <div className="stat-value">{opinions.length}</div>
          <div className="stat-sub">Since registration</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Next appointment</div>
          <div className="stat-value" style={{ fontSize: 16, marginTop: 4 }}>{nextAppt ? new Date(nextAppt.completedAt || nextAppt.startedAt).toLocaleDateString('en-IN') : '—'}</div>
          <div className="stat-sub">{nextAppt ? 'Scheduled' : 'No upcoming'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total paid</div>
          <div className="stat-value" style={{ fontSize: 18, marginTop: 4 }}>
            ₹{invoices.filter(i => i.status === 'confirmed').reduce((s, i) => s + i.totalAmount, 0).toLocaleString('en-IN')}
          </div>
          <div className="stat-sub">{invoices.length} invoices</div>
        </div>
      </div>

      {/* My Conditions quick card */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div className="card-title" style={{ margin:0 }}>My conditions</div>
          <button className="btn btn-primary btn-sm" onClick={onAddCondition}>+ Add condition</button>
        </div>
        <ConditionsMiniList patientId={patient?.id} onResumeCondition={onResumeCondition} conditionsRefreshKey={conditionsRefreshKey} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Recent opinions</div>
          {opinions.slice(0,4).length === 0
            ? <EmptyState icon="📋" title="No opinions yet" subtitle="Your opinion history will appear here" />
            : opinions.slice(0,4).map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{c.doctorName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {c.completedAt ? new Date(c.completedAt).toLocaleDateString('en-IN') : '—'} · {c.type}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))
          }
        </div>

        <div className="card">
          <div className="card-title">TSH trend</div>
          {bloodValues.length < 2
            ? <EmptyState icon="📈" title="Not enough data" subtitle="Upload blood reports to see trends" />
            : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={bloodValues.map(v => ({ date: new Date(v.report_date).toLocaleDateString('en-IN', { month:'short', year:'2-digit' }), value: parseFloat(v.value), abnormal: v.is_abnormal }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={['auto','auto']} />
                  <Tooltip formatter={(v) => [`${v} mIU/L`, 'TSH']} />
                  <ReferenceLine y={4.0} stroke="var(--red-200)" strokeDasharray="4 3" label={{ value:'4.0', fontSize:9, fill:'var(--red-600)' }} />
                  <ReferenceLine y={0.4} stroke="var(--teal-100)" strokeDasharray="4 3" label={{ value:'0.4', fontSize:9, fill:'var(--teal-600)' }} />
                  <Line type="monotone" dataKey="value" stroke="var(--teal-400)" strokeWidth={2} dot={(props) => {
                    const { cx, cy, payload } = props;
                    return <circle key={cx} cx={cx} cy={cy} r={4} fill={payload.abnormal ? 'var(--red-400)' : 'var(--teal-400)'} stroke="#fff" strokeWidth={1.5} />;
                  }} />
                </LineChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </div>
    </>
  );
};

// ─── Report Trends ─────────────────────────────────────────
const ReportTrends = ({ patient }) => {
  const TESTS = ['TSH', 'Free T3', 'Free T4', 'Haemoglobin', 'Vitamin D', 'Vitamin B12', 'Anti-TPO', 'Cholesterol'];
  const [selectedTest, setSelectedTest] = useState('TSH');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!patient) return;
    setLoading(true);
    setLoadError('');
    patientAPI.getBloodValues({ testName: selectedTest })
      .then(r => setData(r.values))
      .catch(() => setLoadError('Could not load this trend. Please try again.'))
      .finally(() => setLoading(false));
  }, [patient, selectedTest, reloadTick]);

  const chartData = data.map(v => ({
    date: new Date(v.report_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }),
    value: parseFloat(v.value),
    refLow: v.reference_low ? parseFloat(v.reference_low) : undefined,
    refHigh: v.reference_high ? parseFloat(v.reference_high) : undefined,
    abnormal: v.is_abnormal,
    unit: v.unit,
  }));
  const latestRef = data[data.length - 1];

  return (
    <>
      <SectionHeader title="Report trends" subtitle="Values plotted from your uploaded blood reports" />
      <div className="card">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Select test to plot</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TESTS.map(t => (
              <button key={t} onClick={() => setSelectedTest(t)} style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${selectedTest === t ? 'var(--teal-400)' : 'var(--border-md)'}`, background: selectedTest === t ? 'var(--teal-50)' : 'transparent', color: selectedTest === t ? 'var(--teal-600)' : 'var(--text-secondary)', fontSize: 12, fontWeight: selectedTest === t ? 500 : 400, cursor: 'pointer', transition: 'all 0.12s' }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 500 }}>{selectedTest} {latestRef?.unit ? `(${latestRef.unit})` : ''}</div>
          {latestRef && (
            <div style={{ display: 'flex', gap: 8 }}>
              {latestRef.reference_low && latestRef.reference_high && (
                <span className="badge badge-gray">Normal: {latestRef.reference_low}–{latestRef.reference_high}</span>
              )}
              {latestRef && <span className={`badge badge-${latestRef.is_abnormal ? 'red' : 'teal'}`}>Latest: {latestRef.value} {latestRef.is_abnormal ? '↑' : '✓'}</span>}
            </div>
          )}
        </div>

        {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={28} /></div>
        : loadError
          ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 13, color: 'var(--red-700, #991b1b)', marginBottom: 12 }}>⚠️ {loadError}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setReloadTick(t => t + 1)}>Retry</button>
            </div>
          )
        : chartData.length < 2
          ? <EmptyState icon="📊" title="Not enough data" subtitle={`Upload blood reports containing ${selectedTest} values to see the trend graph`} />
          : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                  <Tooltip formatter={(v, n) => [v, selectedTest]} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartData[0]?.refHigh && <ReferenceLine y={chartData[0].refHigh} stroke="var(--red-200)" strokeDasharray="5 4" label={{ value: 'Upper', position: 'right', fontSize: 9, fill: 'var(--red-600)' }} />}
                  {chartData[0]?.refLow && <ReferenceLine y={chartData[0].refLow} stroke="var(--teal-100)" strokeDasharray="5 4" label={{ value: 'Lower', position: 'right', fontSize: 9, fill: 'var(--teal-600)' }} />}
                  <Line type="monotone" dataKey="value" name={selectedTest} stroke="var(--teal-400)" strokeWidth={2.5}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      return <circle key={`d-${cx}`} cx={cx} cy={cy} r={5} fill={payload.abnormal ? 'var(--red-400)' : 'var(--teal-400)'} stroke="#fff" strokeWidth={2} />;
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
              {latestRef?.is_abnormal && (
                <div className="alert alert-warning" style={{ marginTop: 12 }}>
                  ⚠️ Latest {selectedTest} value is outside the normal range. Your doctor has been notified. Please review at your next appointment.
                </div>
              )}
            </>
          )
        }
      </div>
    </>
  );
};

// ─── Invoices ──────────────────────────────────────────────
const Invoices = ({ patient, invoices }) => {
  const [invoiceDownloadError, setInvoiceDownloadError] = useState('');
  const downloadInvoice = async (paymentId, invoiceNumber) => {
    // patientAPI.downloadInvoice never existed — the real PDF receipt
    // download is receiptAPI.downloadOpinionReceipt. getBlob() (used
    // under the hood) returns the Blob directly, not wrapped in .data.
    setInvoiceDownloadError('');
    try {
      const blob = await receiptAPI.downloadOpinionReceipt(paymentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${invoiceNumber}.pdf`; a.click();
    } catch (err) {
      console.error('downloadInvoice error:', err);
      setInvoiceDownloadError('Could not download this receipt. Please try again.');
    }
  };

  return (
    <>
      <SectionHeader title="Invoices" subtitle="Auto-generated after each opinion" action={<span className="badge badge-blue">Download anytime</span>} />
      <div className="card">
        {invoiceDownloadError && (
          <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
            {invoiceDownloadError}
          </div>
        )}
        {invoices.length === 0 ? <EmptyState icon="🧾" title="No invoices yet" subtitle="Invoices appear here after each paid opinion" /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice no.</th><th>Date</th><th>Doctor</th><th>Amount</th><th>Status</th><th>Download</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ color: 'var(--teal-600)', fontWeight: 500 }}>{inv.invoiceNumber}</td>
                  <td>{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('en-IN') : '—'}</td>
                  <td>{inv.doctorName}</td>
                  <td style={{ fontWeight: 500 }}>₹{inv.totalAmount?.toLocaleString('en-IN')}</td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => downloadInvoice(inv.id, inv.invoiceNumber)}>⬇ Download</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {invoices.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total paid (all time)</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>₹{invoices.filter(i => i.status === 'confirmed').reduce((s, i) => s + i.totalAmount, 0).toLocaleString('en-IN')}</span>
          </div>
        )}
      </div>
    </>
  );
};

// ─── Conditions mini list (used inside Dashboard card) ─────
const ConditionsMiniList = ({ patientId, onResumeCondition, conditionsRefreshKey }) => {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusEpisodeId, setStatusEpisodeId] = useState(null);
  const loadEpisodes = () => {
    if (!patientId) return;
    setLoading(true);
    setLoadError('');
    patientAPI.getEpisodes(patientId)
      .then(eps => setEpisodes(eps || []))
      .catch(() => setLoadError('Could not load — please retry before adding a condition.'))
      .finally(() => setLoading(false));
  };
  useEffect(loadEpisodes, [patientId, conditionsRefreshKey]);
  if (loading) return <Spinner size={18} />;
  if (loadError) return (
    <div style={{ fontSize:13, color:'var(--red-700, #991b1b)', padding:'4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      ⚠️ {loadError}
      <button onClick={loadEpisodes} style={{ background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--red-700, #991b1b)', cursor: 'pointer', fontSize: 13 }}>Retry</button>
    </div>
  );
  if (episodes.length === 0) return (
    <div style={{ fontSize:13, color:'var(--text-tertiary)', padding:'4px 0' }}>No conditions added yet. Click "+ Add condition" to begin.</div>
  );
  return (
    <>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {episodes.map(ep => {
          const c = CONDITION_COLOURS[ep.condition_type] || CONDITION_COLOURS[ep.condition] || CONDITION_COLOURS.hypothyroidism;
          const label = CONDITION_LABELS[ep.condition_type] || CONDITION_LABELS[ep.condition] || ep.condition;
          const isComplete = ep.questionnaire_status === 'completed';
          return (
            <button
              key={ep.id}
              // Direct action, same as the buttons on the full My Conditions
              // page — no more navigating to a page that just asks again.
              onClick={() => isComplete ? setStatusEpisodeId(ep.id) : (onResumeCondition && onResumeCondition(ep))}
              title={isComplete ? 'View status / opinion' : 'Resume questionnaire'}
              style={{ background:c.bg, border:`1px solid ${c.border}`, color:c.text, borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:500, cursor:'pointer' }}
            >
              {c.icon} {label} {isComplete ? '· ✓ Submitted' : '· Resume'}
            </button>
          );
        })}
      </div>
      {statusEpisodeId && (
        <EpisodeStatusModal episodeId={statusEpisodeId} onClose={() => setStatusEpisodeId(null)} />
      )}
    </>
  );
};

// ─── Language picker (migration 019 — patients.preferred_language) ────────
// Drives both this portal's own i18n display language AND the target
// language for the physician's translated opinion (see OpinionViewer).
const LANGUAGES = [
  ['en', 'English'], ['hi', 'हिन्दी (Hindi)'], ['gu', 'ગુજરાતી (Gujarati)'],
  ['mr', 'मराठी (Marathi)'], ['ta', 'தமிழ் (Tamil)'], ['te', 'తెలుగు (Telugu)'],
  ['kn', 'ಕನ್ನಡ (Kannada)'], ['ml', 'മലയാളം (Malayalam)'],
  ['bn', 'বাংলা (Bengali)'], ['pa', 'ਪੰਜਾਬੀ (Punjabi)'],
  ['or', 'ଓଡ଼ିଆ (Odia)'], ['as', 'অসমীয়া (Assamese)'], ['ne', 'नेपाली (Nepali)'],
  // Manipuri (Meitei) has a genuine split-script situation: most written
  // Manipuri today (news, government, everyday typing) uses Bengali
  // script, since the traditional Meitei Mayek script was suppressed for
  // centuries and only reintroduced in Manipur's schools in 2021 — most
  // literate speakers weren't taught it. Offering both rather than
  // guessing which the patient actually reads.
  ['mnib', 'মৈতৈলোন্ (Manipuri — Bengali script)'],
  ['mnim', 'ꯃꯤꯇꯩꯂꯣꯟ (Manipuri — Meitei script)'],
];

const LanguagePicker = ({ value, onChange }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--gray-100)', borderRadius: 'var(--radius-md)', padding: 4,
  }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)', paddingLeft: 8, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true">🌐</span> Choose language
    </span>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label="Choose language"
      style={{
        border: 'none', borderRadius: 8, padding: '6px 10px',
        fontSize: 13, fontWeight: 500, color: 'var(--teal-600)',
        background: 'var(--surface)', boxShadow: 'var(--shadow-sm)',
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--blue-50)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
    >
      {LANGUAGES.map(([code, label]) => (
        <option key={code} value={code}>{label}</option>
      ))}
    </select>
  </div>
);

// ─── Main patient portal ───────────────────────────────────
const PatientPortal = () => {
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [opinions, setOpinions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCondition, setShowAddCondition] = useState(false);
  const [resumeTarget, setResumeTarget] = useState(null); // { id, condition } — set by "Resume" on an in-progress episode
  // Bumped every time the Add-Condition modal closes, so ConditionsMiniList
  // (which otherwise only fetches once on mount) knows to refetch. Without
  // this, a just-submitted or newly-added condition simply never appeared
  // in "My Conditions" — patients seeing nothing there would click "+ Add
  // condition" again for the SAME condition, which (since selectCondition
  // returns the existing episode rather than creating a duplicate) walked
  // them straight back into Payment for an episode that was already paid,
  // surfacing as "Could not start payment" from createOrder's 409.
  const [conditionsRefreshKey, setConditionsRefreshKey] = useState(0);

  const closeAddCondition = () => {
    setShowAddCondition(false);
    setResumeTarget(null); // so the next "+ Add condition" click starts fresh at SELECT, not stuck resuming the last episode
    setConditionsRefreshKey(k => k + 1);
  };

  // "Keep as default" starts TRUE — whatever was just fetched from the
  // server profile IS by definition the current saved default, so the
  // natural starting assumption is "further changes should keep updating
  // it" (matches the old always-persist behavior unless the patient
  // explicitly opts into session-only by unchecking).
  const [keepAsDefault, setKeepAsDefault] = useState(true);
  const [languageError, setLanguageError] = useState('');

  // Always updates the session's active language immediately (local
  // state only — no reload, so a session-only choice can't be
  // accidentally destroyed by re-fetching the still-unsaved server
  // value). Only persists to the server/DB if keepAsDefault is checked —
  // otherwise this change applies for the current session and reverts
  // to whatever's actually saved the next time they log in.
  const handleLanguageChange = (lang) => {
    setPatient(p => ({ ...p, preferredLanguage: lang }));
    setLanguageError('');
    if (keepAsDefault) {
      patientAPI.updateLanguage(lang).catch(() => setLanguageError('Could not save as default — please try again.'));
    }
  };

  // Toggling the checkbox itself: turning it ON persists whatever
  // language is currently active this session (covers "changed the
  // dropdown first, decided to keep it as default afterward"). Turning
  // it OFF just stops future changes from persisting — it does not
  // retroactively un-save anything already saved.
  const handleKeepAsDefaultChange = (checked) => {
    setKeepAsDefault(checked);
    setLanguageError('');
    if (checked && patient?.preferredLanguage) {
      patientAPI.updateLanguage(patient.preferredLanguage).catch(() => setLanguageError('Could not save as default — please try again.'));
    }
  };

  const resumeCondition = (ep) => {
    setResumeTarget({ id: ep.id, condition: ep.condition_type || ep.condition });
    setShowAddCondition(true);
  };

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      patientAPI.getProfile(),
      patientAPI.getOpinionHistory(),
      patientAPI.getInvoices(),
    ]).then(([p, c, i]) => {
      setPatient(p);
      setOpinions(c.opinions || []);
      setInvoices(i.invoices || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="loading-screen"><Spinner size={32} /></div>;

  return (
    <PatientLayout
      patient={patient}
      onLanguageChange={handleLanguageChange}
      keepAsDefault={keepAsDefault}
      onKeepAsDefaultChange={handleKeepAsDefaultChange}
      languageError={languageError}
    >
      {showAddCondition && (
        <AddConditionFlow
          patient={patient}
          resumeEpisode={resumeTarget}
          onClose={closeAddCondition}
          onDone={closeAddCondition}
        />
      )}
      <Routes>
        <Route path="dashboard" element={<Dashboard patient={patient} opinions={opinions} invoices={invoices} onAddCondition={() => setShowAddCondition(true)} onResumeCondition={resumeCondition} conditionsRefreshKey={conditionsRefreshKey} />} />
        <Route path="conditions" element={<MyConditions patient={patient} onAddCondition={() => setShowAddCondition(true)} onResumeCondition={resumeCondition} conditionsRefreshKey={conditionsRefreshKey} />} />
        <Route path="opinions" element={
          <>
            <SectionHeader title="Opinion history" />
            <div className="card">
              {opinions.length === 0 ? <EmptyState icon="📋" title="No opinions yet" subtitle="Your opinion history will appear here" /> : (
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Doctor</th><th>Type</th><th>Status</th><th>Diagnosis</th></tr></thead>
                  <tbody>
                    {opinions.map(c => (
                      <tr key={c.id}>
                        <td>{c.completedAt ? new Date(c.completedAt).toLocaleDateString('en-IN') : '—'}</td>
                        <td>{c.doctorName}</td>
                        <td><span className="badge badge-blue">{c.type}</span></td>
                        <td><StatusBadge status={c.status} /></td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.diagnosis || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        } />
        <Route path="trends" element={<ReportTrends patient={patient} />} />
        <Route path="invoices" element={<Invoices patient={patient} invoices={invoices} />} />
        <Route path="profile" element={
          <>
            <SectionHeader title="My profile" action={<SecureBadge />} />
            {patient && (
              <>
                <div className="card">
                  <div className="card-title">Personal details</div>
                  <div className="form-grid-2">
                    {[
                      ['Name', `${patient.firstName} ${patient.middleName || ''} ${patient.lastName}`],
                      ['Patient code', patient.patientCode],
                      ['Date of birth', patient.dob],
                      ['Gender', patient.gender],
                      ['Blood group', patient.bloodGroup || '—'],
                    ].map(([label, value]) => (
                      <div key={label} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 14 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Guardian details — only shown when actually on file (minor patients) */}
                {(patient.guardianName || patient.guardianRelation) && (
                  <div className="card" style={{ marginTop: 16 }}>
                    <div className="card-title">Guardian details</div>
                    <div className="form-grid-2">
                      {[
                        ['Guardian name', patient.guardianName || '—'],
                        ['Relation to patient', patient.guardianRelation || '—'],
                      ].map(([label, value]) => (
                        <div key={label} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 14 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="card" style={{ marginTop: 16 }}>
                  <div className="card-title">Contact</div>
                  <div className="form-grid-2">
                    {[
                      ['Mobile', patient.mobile, patient.mobileVerified],
                      ['WhatsApp', patient.whatsapp, patient.whatsappVerified],
                      ['Email', patient.email, patient.emailVerified],
                    ].map(([label, value, verified]) => (
                      <div key={label} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {value || '—'}
                          {value && (verified
                            ? <span style={{ fontSize: 11, color: 'var(--teal-600)' }}>✓ Verified</span>
                            : <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Unverified</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ marginTop: 16 }}>
                  <div className="card-title">Address</div>
                  <div className="form-grid-2">
                    {[
                      ['Address line 1', patient.address?.line1],
                      ['Address line 2', patient.address?.line2],
                      ['City', patient.address?.city],
                      ['State', patient.address?.state],
                      ['Pincode', patient.address?.pincode],
                    ].map(([label, value]) => (
                      <div key={label} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 14 }}>{value || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {/* Language setting moved to the persistent header (see
                PatientLayout) — shows on this page too, so a separate
                copy here would just be a second, potentially
                out-of-sync control for the same setting. */}
          </>
        } />
        <Route path="documents" element={
          <>
            <SectionHeader title="My documents" subtitle="All uploaded medical files" />
            <DocumentsPage patientId={user?.id} />
          </>
        } />
      </Routes>
    </PatientLayout>
  );
};

const CONDITION_FOLDER_LABELS = {
  hypothyroidism:  'Hypothyroidism',
  hyperthyroidism: "Hyperthyroidism (Graves')",
  thyroid_cancer:  'Thyroid Cancer',
  nodule:          'Thyroid Nodule',
};

const DocumentsPage = ({ patientId }) => {
  const [docs, setDocs] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const loadDocs = () => {
    if (!patientId) return;
    setLoading(true);
    setLoadError('');
    patientAPI.getDocuments(category || undefined)
      .then(r => setDocs(r.documents || []))
      .catch(() => setLoadError('Could not load documents. Please try again.'))
      .finally(() => setLoading(false));
  };

  useEffect(loadDocs, [patientId, category]);

  const download = async (docId, name) => {
    setDownloadError('');
    try {
      // getBlob() returns the Blob directly, not wrapped in .data.
      const blob = await patientAPI.downloadDocument(docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    } catch (err) {
      console.error('document download error:', err);
      setDownloadError('Could not download this document. Please try again.');
    }
  };

  const catLabels = { blood_report:'🩸 Blood reports', scan_usg:'📡 Scan/USG', prescription:'💊 Prescriptions', biopsy:'🔬 Biopsy', other:'📄 Other' };

  // ── Group into folders: by condition episode, then by opinion session ──
  // A document with no episodeId (rare — general upload outside any
  // questionnaire context) falls into an "Other uploads" folder. Within
  // an episode, documents with no opinionId yet belong to "Pending first
  // opinion"; once an opinion exists for that episode, later uploads
  // (e.g. doctor-requested missing/additional reports) group under that
  // opinion's own submission date/status instead — this is the literal
  // "folder named as that particular opinion, one per session" grouping.
  const folders = {};
  for (const doc of docs) {
    const episodeKey = doc.episodeId || '__none__';
    if (!folders[episodeKey]) {
      folders[episodeKey] = {
        label: doc.episodeCondition ? (CONDITION_FOLDER_LABELS[doc.episodeCondition] || doc.episodeCondition) : 'Other uploads',
        sessions: {},
      };
    }
    const sessionKey = doc.opinionId || '__pending__';
    if (!folders[episodeKey].sessions[sessionKey]) {
      folders[episodeKey].sessions[sessionKey] = {
        label: doc.opinionId
          ? `Opinion${doc.opinionSubmittedAt ? ' — ' + new Date(doc.opinionSubmittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}${doc.opinionStatus ? ` (${doc.opinionStatus})` : ''}`
          : 'Pending first opinion',
        docs: [],
      };
    }
    folders[episodeKey].sessions[sessionKey].docs.push(doc);
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['','All'],['blood_report','Blood reports'],['scan_usg','Scan/USG'],['prescription','Prescriptions'],['biopsy','Biopsy'],['other','Other']].map(([val, label]) => (
          <button key={val} onClick={() => setCategory(val)} style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${category === val ? 'var(--teal-400)' : 'var(--border-md)'}`, background: category === val ? 'var(--teal-50)' : 'transparent', color: category === val ? 'var(--teal-600)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>
      {(loadError || downloadError) && (
        <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {loadError || downloadError}
          {loadError && <button onClick={loadDocs} style={{ marginLeft: 10, background: 'none', border: 'none', textDecoration: 'underline', color: '#991b1b', cursor: 'pointer', fontSize: 13 }}>Retry</button>}
        </div>
      )}
      {loading ? <div style={{ display:'flex', justifyContent:'center', padding:32 }}><Spinner /></div>
      : loadError ? null
      : docs.length === 0 ? <EmptyState icon="📁" title="No documents" subtitle="Upload documents during registration or from this page" />
      : Object.entries(folders).map(([episodeKey, folder]) => (
        <div key={episodeKey} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <span>📁</span>{folder.label}
          </div>
          {Object.entries(folder.sessions).map(([sessionKey, session]) => (
            <div key={sessionKey} style={{ marginLeft: 20, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>{session.label}</div>
              {session.docs.map(doc => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 20 }}>📄</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {doc.fieldLabel ? `${doc.fieldLabel} — ` : ''}{doc.originalName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{catLabels[doc.category]} · {(doc.file_size_bytes / 1024).toFixed(0)} KB · {new Date(doc.created_at).toLocaleDateString('en-IN')}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => download(doc.id, doc.originalName)}>⬇</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default PatientPortal;
