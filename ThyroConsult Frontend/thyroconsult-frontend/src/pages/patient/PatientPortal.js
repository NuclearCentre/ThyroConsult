import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts';
import { patientAPI, receiptAPI } from '../../api';
import { PatientSidebar } from '../../components/common/Sidebar';
import { Badge, StatusBadge, EmptyState, Spinner, SectionHeader, HIPAABadge } from '../../components/common/index';
import { useAuth } from '../../context/AuthContext';
import ConditionSelection from '../../components/ConditionSelection';
import { HypoQuestionnaire, HyperQuestionnaire, TcQuestionnaire } from '../../components/ConditionQuestionnaires';
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
const SUB = { SELECT: 'select', CONDITION_Q: 'condition_q', DONE: 'done' };

const AddConditionFlow = ({ patient, onClose, onDone }) => {
  const [sub, setSub]             = useState(SUB.SELECT);
  const [condition, setCondition] = useState('');
  const [episodeId, setEpisodeId] = useState(null);

  const ConditionQComponent =
    condition === 'hypothyroidism'  ? HypoQuestionnaire  :
    condition === 'hyperthyroidism' ? HyperQuestionnaire :
    condition === 'thyroid_cancer'  ? TcQuestionnaire    : null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'40px 16px' }}>
      <div style={{ background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:760, boxShadow:'0 8px 40px rgba(0,0,0,0.18)', minHeight:400 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 28px', borderBottom:'1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:17, fontWeight:600 }}>
              {sub === SUB.SELECT      && '📋 Select your condition'}
              {sub === SUB.CONDITION_Q && `🔬 ${CONDITION_LABELS[condition] || ''} specific questions`}
              {sub === SUB.DONE       && '✅ Questionnaire complete'}
            </div>
            <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:3 }}>Online opinion — adding new condition</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text-tertiary)', lineHeight:1 }}>×</button>
        </div>
        {/* Progress tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)' }}>
          {[{key:SUB.SELECT,label:'1. Condition'},{key:SUB.CONDITION_Q,label:'2. Questionnaire'}].map(({key,label}) => {
            const order = [SUB.SELECT, SUB.CONDITION_Q, SUB.DONE];
            const active = sub === key;
            const done   = order.indexOf(sub) > order.indexOf(key);
            return (
              <div key={key} style={{ flex:1, textAlign:'center', padding:'10px 0', fontSize:11, fontWeight:active?600:400, color:done?'var(--teal-600)':active?'var(--text-primary)':'var(--text-tertiary)', borderBottom:active?'2px solid var(--teal-500)':'2px solid transparent' }}>
                {done?'✓ ':''}{label}
              </div>
            );
          })}
        </div>
        {/* Content */}
        <div style={{ padding:'24px 28px' }}>
          {sub === SUB.SELECT && (
            <ConditionSelection
              patientId={patient?.id}
              doctorId={patient?.primaryDoctorId}
              onComplete={({ condition: c, episodeId: eid }) => { setCondition(c); setEpisodeId(eid); setSub(SUB.CONDITION_Q); }}
            />
          )}
          {sub === SUB.CONDITION_Q && episodeId && ConditionQComponent && (
            <ConditionQComponent
              patientId={patient?.id}
              episodeId={episodeId}
              patientGender={patient?.gender}
              patientDob={patient?.dob}
              onComplete={() => { setSub(SUB.DONE); onDone(); }}
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
const MyConditions = ({ patient, onAddCondition }) => {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [statusEpisodeId, setStatusEpisodeId] = useState(null);

  useEffect(() => {
    if (!patient?.id) return;
    patientAPI.getEpisodes(patient.id)
      .then(eps => setEpisodes(eps || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient]);

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:32 }}><Spinner /></div>;

  return (
    <>
      <SectionHeader title="My conditions" subtitle="Each condition has its own questionnaire and treatment history"
        action={<button className="btn btn-primary btn-sm" onClick={onAddCondition}>+ Add condition</button>}
      />
      {episodes.length === 0 ? (
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
                    {ep.core_q_complete || ep.questionnaire_status === 'completed'
                      ? <span className="badge badge-teal">✓ Core Q</span>
                      : <span className="badge badge-gray">Core Q pending</span>}
                    {ep.condition_q_complete || ep.questionnaire_status === 'completed'
                      ? <span className="badge badge-teal">✓ Condition Q</span>
                      : <span className="badge badge-gray">Condition Q pending</span>}
                  </div>
                  <StatusBadge status={ep.episode_status || ep.status || 'active'} />
                  {(ep.questionnaire_status === 'completed' || ep.core_q_complete) && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 10, width: '100%' }}
                      onClick={() => setStatusEpisodeId(ep.id)}
                    >
                      View status / opinion
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
const PatientLayout = ({ children, patient }) => (
  <div className="app-shell">
    <PatientSidebar patient={patient} />
    <main className="main-area">
      <div className="page-content">{children}</div>
    </main>
  </div>
);

// ─── Dashboard overview ────────────────────────────────────
const Dashboard = ({ patient, consultations, invoices, onAddCondition }) => {
  const [bloodValues, setBloodValues] = useState([]);
  useEffect(() => {
    if (patient) {
      patientAPI.getBloodValues({ testName: 'tsh' })
        .then(r => setBloodValues(r.values)).catch(() => {});
    }
  }, [patient]);

  const nextAppt = consultations.find(c => c.status === 'scheduled');
  const lastTSH = bloodValues[bloodValues.length - 1];

  return (
    <>
      <SectionHeader
        title={`Good day, ${patient?.firstName || ''}` }
        subtitle={new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        action={<HIPAABadge />}
      />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total consultations</div>
          <div className="stat-value">{consultations.length}</div>
          <div className="stat-sub">Since registration</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Next appointment</div>
          <div className="stat-value" style={{ fontSize: 16, marginTop: 4 }}>{nextAppt ? new Date(nextAppt.completedAt || nextAppt.startedAt).toLocaleDateString('en-IN') : '—'}</div>
          <div className="stat-sub">{nextAppt ? 'Scheduled' : 'No upcoming'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last TSH</div>
          <div className="stat-value" style={{ color: lastTSH?.is_abnormal ? 'var(--red-600)' : 'var(--teal-600)' }}>
            {lastTSH ? `${lastTSH.value} ${lastTSH.unit}` : '—'}
          </div>
          <div className="stat-sub" style={{ color: lastTSH?.is_abnormal ? 'var(--red-600)' : 'var(--text-tertiary)' }}>
            {lastTSH?.is_abnormal ? '⚠ Above range' : lastTSH ? 'Normal' : 'No data'}
          </div>
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
        <ConditionsMiniList patientId={patient?.id} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Recent consultations</div>
          {consultations.slice(0,4).length === 0
            ? <EmptyState icon="📋" title="No consultations yet" subtitle="Your consultation history will appear here" />
            : consultations.slice(0,4).map(c => (
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

  useEffect(() => {
    if (!patient) return;
    setLoading(true);
    patientAPI.getBloodValues({ testName: selectedTest })
      .then(r => setData(r.values))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient, selectedTest]);

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
  const downloadInvoice = async (paymentId, invoiceNumber) => {
    // patientAPI.downloadInvoice never existed — the real PDF receipt
    // download is receiptAPI.downloadOpinionReceipt. getBlob() (used
    // under the hood) returns the Blob directly, not wrapped in .data.
    const blob = await receiptAPI.downloadOpinionReceipt(paymentId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${invoiceNumber}.pdf`; a.click();
  };

  return (
    <>
      <SectionHeader title="Invoices" subtitle="Auto-generated after each consultation" action={<span className="badge badge-blue">Download anytime</span>} />
      <div className="card">
        {invoices.length === 0 ? <EmptyState icon="🧾" title="No invoices yet" subtitle="Invoices appear here after each paid consultation" /> : (
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
const ConditionsMiniList = ({ patientId }) => {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading]   = useState(true);
  useEffect(() => {
    if (!patientId) return;
    patientAPI.getEpisodes(patientId)
      .then(eps => setEpisodes(eps || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patientId]);
  if (loading) return <Spinner size={18} />;
  if (episodes.length === 0) return (
    <div style={{ fontSize:13, color:'var(--text-tertiary)', padding:'4px 0' }}>No conditions added yet. Click "+ Add condition" to begin.</div>
  );
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
      {episodes.map(ep => {
        const c = CONDITION_COLOURS[ep.condition_type] || CONDITION_COLOURS[ep.condition] || CONDITION_COLOURS.hypothyroidism;
        const label = CONDITION_LABELS[ep.condition_type] || CONDITION_LABELS[ep.condition] || ep.condition;
        return (
          <span key={ep.id} style={{ background:c.bg, border:`1px solid ${c.border}`, color:c.text, borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:500 }}>
            {c.icon} {label} {ep.questionnaire_status === 'completed' ? '✓' : '⏳'}
          </span>
        );
      })}
    </div>
  );
};

// ─── Main patient portal ───────────────────────────────────
const PatientPortal = () => {
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [consultations, setConsultations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCondition, setShowAddCondition] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      patientAPI.getProfile(),
      patientAPI.getOpinionHistory(),
      patientAPI.getInvoices(),
    ]).then(([p, c, i]) => {
      setPatient(p);
      setConsultations(c.opinions || []);
      setInvoices(i.invoices || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="loading-screen"><Spinner size={32} /></div>;

  return (
    <PatientLayout patient={patient}>
      {showAddCondition && (
        <AddConditionFlow
          patient={patient}
          onClose={() => setShowAddCondition(false)}
          onDone={() => setShowAddCondition(false)}
        />
      )}
      <Routes>
        <Route path="dashboard" element={<Dashboard patient={patient} consultations={consultations} invoices={invoices} onAddCondition={() => setShowAddCondition(true)} />} />
        <Route path="conditions" element={<MyConditions patient={patient} onAddCondition={() => setShowAddCondition(true)} />} />
        <Route path="consultations" element={
          <>
            <SectionHeader title="Consultation history" />
            <div className="card">
              {consultations.length === 0 ? <EmptyState icon="📋" title="No consultations" subtitle="Your consultation history will appear here" /> : (
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Doctor</th><th>Type</th><th>Status</th><th>Diagnosis</th></tr></thead>
                  <tbody>
                    {consultations.map(c => (
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
            <SectionHeader title="My profile" action={<HIPAABadge />} />
            {patient && (
              <div className="card">
                <div className="form-grid-2">
                  {[['Name', `${patient.firstName} ${patient.middleName || ''} ${patient.lastName}`],['Patient code', patient.patientCode],['Date of birth', patient.dob],['Gender', patient.gender],['Blood group', patient.bloodGroup || '—'],['Mobile', patient.mobile],['WhatsApp', patient.whatsapp],['Email', patient.email]].map(([label, value]) => (
                    <div key={label} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 14 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

const DocumentsPage = ({ patientId }) => {
  const [docs, setDocs] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);

  const loadDocs = () => {
    if (!patientId) return;
    setLoading(true);
    patientAPI.getDocuments(category || undefined)
      .then(r => setDocs(r.documents || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadDocs, [patientId, category]);

  const download = async (docId, name) => {
    // getBlob() returns the Blob directly, not wrapped in .data.
    const blob = await patientAPI.downloadDocument(docId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  };

  const catLabels = { blood_report:'🩸 Blood reports', scan_usg:'📡 Scan/USG', prescription:'💊 Prescriptions', biopsy:'🔬 Biopsy', other:'📄 Other' };

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['','All'],['blood_report','Blood reports'],['scan_usg','Scan/USG'],['prescription','Prescriptions'],['biopsy','Biopsy'],['other','Other']].map(([val, label]) => (
          <button key={val} onClick={() => setCategory(val)} style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${category === val ? 'var(--teal-400)' : 'var(--border-md)'}`, background: category === val ? 'var(--teal-50)' : 'transparent', color: category === val ? 'var(--teal-600)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>
      {loading ? <div style={{ display:'flex', justifyContent:'center', padding:32 }}><Spinner /></div>
      : docs.length === 0 ? <EmptyState icon="📁" title="No documents" subtitle="Upload documents during registration or from this page" />
      : docs.map(doc => (
        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 20 }}>📄</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.originalName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{catLabels[doc.category]} · {(doc.file_size_bytes / 1024).toFixed(0)} KB · {new Date(doc.created_at).toLocaleDateString('en-IN')}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => download(doc.id, doc.originalName)}>⬇</button>
        </div>
      ))}
    </div>
  );
};

export default PatientPortal;
