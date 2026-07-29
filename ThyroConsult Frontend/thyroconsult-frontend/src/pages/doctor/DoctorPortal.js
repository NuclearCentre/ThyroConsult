import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { doctorAPI, patientAPI } from '../../api';
import { DoctorSidebar } from '../../components/common/Sidebar';
import { Badge, StatusBadge, EmptyState, Spinner, SectionHeader, HIPAABadge } from '../../components/common/index';
import { useAuth } from '../../context/AuthContext';

const DoctorLayout = ({ children, doctor }) => (
  <div className="app-shell">
    <DoctorSidebar doctor={doctor} />
    <main className="main-area">
      <div className="page-content">{children}</div>
    </main>
  </div>
);

// ─── Appointment queue + Patient detail (main view) ────────
const DoctorDashboard = ({ doctor }) => {
  const [appointments, setAppointments] = useState([]);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [patientDetail, setPatientDetail] = useState(null);
  const [patientDocs, setPatientDocs] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [bloodValues, setBloodValues] = useState([]);
  const [selectedTest, setSelectedTest] = useState('TSH');
  const [notes, setNotes] = useState({ chiefComplaint:'', diagnosis:'', doctorNotes:'', followUpNotes:'' });
  const [notesSaved, setNotesSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [weeklyStats, setWeeklyStats] = useState(null);
  const [extracting, setExtracting] = useState(null); // docId being extracted
  const [extractedResults, setExtractedResults] = useState({}); // docId → extracted data
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!doctor) return;
    doctorAPI.getAppointments(today)
      .then(r => { setAppointments(r.appointments || []); })
      .catch(() => {});
    doctorAPI.getWeeklyStats()
      .then(r => setWeeklyStats(r))
      .catch(() => {});
  }, [doctor]);

  const selectPatient = async (appt) => {
    setSelectedAppt(appt);
    setLoading(true);
    try {
      const [detail, docs, consults, bv] = await Promise.all([
        doctorAPI.getPatientView(doctor.id, appt.patient.id),
        patientAPI.getDocuments(appt.patient.id),
        patientAPI.getConsultations(appt.patient.id),
        patientAPI.getBloodValues(appt.patient.id, { testName: selectedTest }),
      ]);
      setPatientDetail(detail.data);
      setPatientDocs(docs.data.documents || []);
      setConsultations(consults.data.consultations || []);
      setBloodValues(bv.data.values || []);
      setPaymentInfo(appt.payment);
      setNotesSaved(false);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadBloodValues = async (test) => {
    if (!selectedAppt) return;
    setSelectedTest(test);
    const r = await patientAPI.getBloodValues(selectedAppt.patient.id, { testName: test });
    setBloodValues(r.data.values || []);
  };

  const saveNotes = async (consultationId) => {
    if (!consultationId) return;
    await doctorAPI.saveNotes(consultationId, notes);
    setNotesSaved(true);
  };

  const downloadDoc = async (docId, name, patientId) => {
    const res = await patientAPI.downloadDocument(patientId, docId);
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  };

  // ── AI report extraction ──────────────────────────────────
  const extractFromReport = async (doc, patientId) => {
    setExtracting(doc.id);
    try {
      // Fetch the document as base64
      const res = await patientAPI.downloadDocument(patientId, doc.id);
      const blob = new Blob([res.data]);
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });

      const isImage = /\.(jpg|jpeg|png)$/i.test(doc.originalName);
      const isPdf = /\.pdf$/i.test(doc.originalName);
      const mediaType = isImage ? (doc.originalName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg') : 'application/pdf';

      const messageContent = [
        {
          type: isPdf ? 'document' : 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text: `You are a medical report reader. Extract ALL pathology/lab test results from this report.
Return ONLY a JSON object (no markdown, no extra text) in this exact format:
{
  "labName": "name of the laboratory",
  "reportDate": "DD/MM/YYYY",
  "tests": [
    {
      "testName": "exact test name e.g. TSH, Free T3, Free T4, Haemoglobin",
      "value": "numeric value as string",
      "unit": "unit e.g. mIU/L, pg/mL",
      "normalRangeMin": "lower bound as string",
      "normalRangeMax": "upper bound as string",
      "normalRangeText": "full range text as printed e.g. 0.35 - 5.5"
    }
  ]
}
If you cannot find a field, use null. Extract every test result you can find.`
        }
      ];

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: messageContent }],
        }),
      });

      const data = await response.json();
      const text = data.content?.find(b => b.type === 'text')?.text || '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setExtractedResults(prev => ({ ...prev, [doc.id]: parsed }));
    } catch (err) {
      console.error('Extraction failed', err);
      setExtractedResults(prev => ({ ...prev, [doc.id]: { error: 'Could not extract data from this document.' } }));
    } finally {
      setExtracting(null);
    }
  };

  // ── Check if all blood values share same lab + same range ─
  const canShowLineGraph = (values) => {
    if (!values || values.length < 2) return false;
    const labs = new Set(values.map(v => (v.lab_name || '').trim().toLowerCase()));
    const ranges = new Set(values.map(v => `${v.reference_low}-${v.reference_high}`));
    return labs.size === 1 && ranges.size === 1;
  };

  const TESTS = ['TSH','Free T3','Free T4','Haemoglobin','Vitamin D','Anti-TPO'];

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h2 style={{ fontSize:'1.4rem' }}>Doctor dashboard</h2>
        <div style={{ display:'flex', gap:10 }}>
          <span className="badge badge-blue">Today: {today}</span>
          <HIPAABadge />
        </div>
      </div>

      {/* Stat row */}
      <div className="stat-grid" style={{ marginBottom:20 }}>
        <div className="stat-card"><div className="stat-label">Today's appointments</div><div className="stat-value">{appointments.length}</div></div>
        <div className="stat-card"><div className="stat-label">Pending review</div><div className="stat-value" style={{ color:'var(--amber-600)' }}>{appointments.filter(a => a.status === 'scheduled').length}</div></div>
        <div className="stat-card"><div className="stat-label">Completed today</div><div className="stat-value" style={{ color:'var(--teal-600)' }}>{appointments.filter(a => a.status === 'completed').length}</div></div>
        <div className="stat-card"><div className="stat-label">Opinion fee</div><div className="stat-value" style={{ fontSize:16, marginTop:4 }}>₹{doctor?.opinionFee?.toLocaleString('en-IN') || '—'}</div></div>
      </div>

      {/* Weekly opinions generated — new registrations vs follow-up */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div className="card-title" style={{ marginBottom:0 }}>Opinions generated this week</div>
          <span className="badge badge-blue">{weeklyStats?.total ?? 0} total</span>
        </div>
        {!weeklyStats ? (
          <div style={{ display:'flex', justifyContent:'center', padding:20 }}><Spinner /></div>
        ) : weeklyStats.total === 0 ? (
          <EmptyState icon="📈" title="No opinions generated yet this week" subtitle="" />
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div style={{ display:'flex', gap:16 }}>
              <div>
                <div style={{ fontSize:11, color:'var(--text-tertiary)', marginBottom:2 }}>New registrations</div>
                <div style={{ fontSize:22, fontWeight:600, color:'var(--teal-600)' }}>{weeklyStats.newRegistrations}</div>
              </div>
              <div>
                <div style={{ fontSize:11, color:'var(--text-tertiary)', marginBottom:2 }}>Follow-ups</div>
                <div style={{ fontSize:22, fontWeight:600, color:'var(--blue-600)' }}>{weeklyStats.followUps}</div>
              </div>
            </div>
            {weeklyStats.daily?.length > 0 && (
              <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:60 }}>
                {weeklyStats.daily.map(d => {
                  const dayTotal = d.newRegistrations + d.followUps;
                  const maxTotal = Math.max(...weeklyStats.daily.map(x => x.newRegistrations + x.followUps), 1);
                  return (
                    <div key={d.day} title={`${new Date(d.day).toLocaleDateString('en-IN', { weekday:'short' })}: ${d.newRegistrations} new, ${d.followUps} follow-up`} style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', height:'100%' }}>
                      <div style={{ display:'flex', flexDirection:'column-reverse', height:`${(dayTotal / maxTotal) * 100}%`, minHeight: dayTotal > 0 ? 4 : 0 }}>
                        <div style={{ background:'var(--teal-400)', height: dayTotal ? `${(d.newRegistrations / dayTotal) * 100}%` : 0, borderRadius:'2px 2px 0 0' }} />
                        <div style={{ background:'var(--blue-300)', flex:1, borderRadius: d.newRegistrations === 0 ? '2px 2px 0 0' : 0 }} />
                      </div>
                      <div style={{ fontSize:9, color:'var(--text-tertiary)', textAlign:'center', marginTop:3 }}>{new Date(d.day).toLocaleDateString('en-IN', { weekday:'narrow' })}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:20 }}>
        {/* Queue */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:600, fontSize:13 }}>Appointment queue</span>
            <span className="badge badge-blue">{appointments.length}</span>
          </div>
          {appointments.length === 0 ? <EmptyState icon="📅" title="No appointments today" subtitle="" /> : appointments.map(appt => (
            <div key={appt.id} onClick={() => selectPatient(appt)} style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', background: selectedAppt?.id === appt.id ? 'var(--teal-50)' : 'transparent', transition:'background 0.12s' }}>
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ width:36,height:36,borderRadius:'50%',background:'var(--blue-50)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'var(--blue-800)',flexShrink:0 }}>
                  {appt.patient.name.split(' ')[0][0]}{appt.patient.name.split(' ')[1]?.[0]}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{appt.patient.name}</div>
                  <div style={{ fontSize:11, color:'var(--text-tertiary)' }}>{appt.patient.code} · {appt.consultationType}</div>
                  <div style={{ marginTop:4, display:'flex', gap:6 }}>
                    <span className={`badge badge-${appt.payment?.status === 'confirmed' ? 'teal' : 'amber'}`} style={{ fontSize:10 }}>
                      {appt.payment?.status === 'confirmed' ? `✓ Paid ₹${appt.payment.amount?.toLocaleString('en-IN')}` : 'Payment pending'}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize:11, color:'var(--text-tertiary)', textAlign:'right' }}>
                  {new Date(appt.scheduledAt).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Patient detail */}
        <div>
          {!selectedAppt ? (
            <div className="card" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300 }}>
              <EmptyState icon="👆" title="Select a patient" subtitle="Click any appointment in the queue to view patient details" />
            </div>
          ) : loading ? (
            <div className="card" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300 }}><Spinner size={32} /></div>
          ) : (
            <>
              {/* Patient header */}
              <div className="card" style={{ marginBottom:16 }}>
                <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                  {/* Photo */}
                  <div style={{ width:68, height:68, borderRadius:'50%', background:'var(--teal-50)', border:'2px solid var(--teal-200)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden' }}>
                    <img src={`${process.env.REACT_APP_API_URL}/patients/${selectedAppt.patient.id}/photo`} alt="Patient" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
                    <span style={{ fontSize:24, color:'var(--teal-400)' }}>👤</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:16, fontWeight:600 }}>{patientDetail?.firstName} {patientDetail?.middleName || ''} {patientDetail?.lastName}</div>
                    <div style={{ fontSize:12, color:'var(--text-tertiary)', marginBottom:10 }}>{selectedAppt.patient.code} · {selectedAppt.consultationType} consultation</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                      {[['Age / DOB', patientDetail?.dob || '—'],['Gender', patientDetail?.gender || '—'],['Mobile', patientDetail?.mobile || '—'],['Email', patientDetail?.email || '—'],['Payment', paymentInfo?.status === 'confirmed' ? `✓ ₹${paymentInfo?.amount?.toLocaleString('en-IN')} paid` : 'Pending']].map(([label, val]) => (
                        <div key={label} style={{ fontSize:12 }}>
                          <div style={{ color:'var(--text-tertiary)', marginBottom:1 }}>{label}</div>
                          <div style={{ fontWeight:500, color: label === 'Payment' && paymentInfo?.status === 'confirmed' ? 'var(--teal-600)' : 'var(--text-primary)' }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {/* Address displayed in correct order */}
                    {patientDetail && (
                      <div style={{ marginTop:8, fontSize:12, color:'var(--text-secondary)', lineHeight:1.8 }}>
                        <span style={{ color:'var(--text-tertiary)', fontSize:11 }}>Address: </span>
                        {[patientDetail.addressLine1, patientDetail.addressLine2, patientDetail.village, patientDetail.taluka, patientDetail.city, patientDetail.district, patientDetail.state, patientDetail.pincode ? `PIN ${patientDetail.pincode}` : null].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <button className="btn btn-primary btn-sm">📹 Start consultation</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => saveNotes(consultations[0]?.id)}>📝 Save notes</button>
                    <button className="btn btn-secondary btn-sm">💊 Send prescription</button>
                  </div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                {/* Documents */}
                <div className="card">
                  <div className="card-title">Uploaded documents</div>
                  {patientDocs.length === 0 ? <EmptyState icon="📁" title="No documents uploaded" subtitle="" /> : patientDocs.map(doc => (
                    <div key={doc.id} style={{ borderBottom:'1px solid var(--border)', paddingBottom:8, marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                        <span>📄</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:120 }}>{doc.originalName}</div>
                          <div style={{ fontSize:10, color:'var(--text-tertiary)' }}>{doc.category} · {(doc.file_size_bytes/1024).toFixed(0)} KB</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => downloadDoc(doc.id, doc.originalName, selectedAppt.patient.id)} style={{ padding:'3px 7px', fontSize:11 }} title="Download">⬇</button>
                        {/\.(jpg|jpeg|png|pdf)$/i.test(doc.originalName) && (
                          <button className="btn btn-secondary btn-sm" style={{ fontSize:10, padding:'3px 7px', whiteSpace:'nowrap' }}
                            onClick={() => extractFromReport(doc, selectedAppt.patient.id)}
                            disabled={extracting === doc.id} title="Extract data using AI">
                            {extracting === doc.id ? '⏳' : '🤖 Extract'}
                          </button>
                        )}
                      </div>
                      {/* Extracted results */}
                      {extractedResults[doc.id] && !extractedResults[doc.id].error && (
                        <div style={{ marginTop:8, background:'var(--teal-50)', border:'1px solid var(--teal-200)', borderRadius:6, padding:8, fontSize:11 }}>
                          <div style={{ fontWeight:600, marginBottom:4, color:'var(--teal-800)' }}>
                            🤖 AI extracted — {extractedResults[doc.id].labName || 'Lab name not found'} · {extractedResults[doc.id].reportDate || 'Date not found'}
                          </div>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                            <thead>
                              <tr style={{ background:'var(--teal-100)' }}>
                                {['Test','Value','Unit','Normal range'].map(h => (
                                  <th key={h} style={{ padding:'3px 6px', textAlign:'left', borderBottom:'1px solid var(--teal-200)', color:'var(--teal-900)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(extractedResults[doc.id].tests || []).map((t, i) => (
                                <tr key={i} style={{ borderBottom:'1px solid var(--teal-100)' }}>
                                  <td style={{ padding:'3px 6px', fontWeight:500 }}>{t.testName}</td>
                                  <td style={{ padding:'3px 6px', color: parseFloat(t.value) > parseFloat(t.normalRangeMax) || parseFloat(t.value) < parseFloat(t.normalRangeMin) ? 'var(--red-600)' : 'var(--teal-700)', fontWeight:600 }}>{t.value}</td>
                                  <td style={{ padding:'3px 6px', color:'var(--text-tertiary)' }}>{t.unit}</td>
                                  <td style={{ padding:'3px 6px', color:'var(--text-secondary)' }}>{t.normalRangeText || `${t.normalRangeMin}–${t.normalRangeMax}`}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {extractedResults[doc.id]?.error && (
                        <div style={{ marginTop:6, fontSize:11, color:'var(--red-600)', background:'var(--red-50)', borderRadius:4, padding:'4px 8px' }}>
                          ⚠ {extractedResults[doc.id].error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Payment */}
                <div className="card">
                  <div className="card-title">Payment details</div>
                  {paymentInfo && (
                    <>
                      {[['Consultation fee','₹1,200'],['Platform fee','₹50'],['GST (18%)','₹225'],['Total paid',`₹${paymentInfo.amount?.toLocaleString('en-IN') || '—'}`]].map(([label, val]) => (
                        <div key={label} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
                          <span style={{ color:'var(--text-secondary)' }}>{label}</span>
                          <span style={{ fontWeight: label.includes('Total') ? 600 : 400 }}>{val}</span>
                        </div>
                      ))}
                      <div style={{ marginTop:10 }}>
                        <span className={`badge badge-${paymentInfo.status === 'confirmed' ? 'teal' : 'amber'}`}>{paymentInfo.status === 'confirmed' ? '✓ Razorpay confirmed' : 'Pending'}</span>
                        {paymentInfo.transactionId && <div style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:4 }}>Txn: {paymentInfo.transactionId}</div>}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Blood report trends */}
              <div className="card" style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div className="card-title" style={{ marginBottom:0 }}>Blood report trends</div>
                  {bloodValues.length >= 2 && !canShowLineGraph(bloodValues) && (
                    <span style={{ fontSize:11, color:'var(--amber-700)', background:'var(--amber-50)', padding:'2px 8px', borderRadius:20, border:'1px solid var(--amber-200)' }}>
                      ⚠ Multiple labs / ranges — showing table
                    </span>
                  )}
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                  {TESTS.map(t => (
                    <button key={t} onClick={() => loadBloodValues(t)} style={{ padding:'3px 12px', borderRadius:20, border:`1px solid ${selectedTest === t ? 'var(--blue-400)' : 'var(--border-md)'}`, background: selectedTest === t ? 'var(--blue-50)' : 'transparent', color: selectedTest === t ? 'var(--blue-800)' : 'var(--text-secondary)', fontSize:11, cursor:'pointer' }}>
                      {t}
                    </button>
                  ))}
                </div>
                {bloodValues.length < 2 ? (
                  <EmptyState icon="📊" title={`No ${selectedTest} data`} subtitle="Patient has not uploaded reports containing this value" />
                ) : canShowLineGraph(bloodValues) ? (
                  <>
                    <div style={{ fontSize:11, color:'var(--text-tertiary)', marginBottom:6 }}>
                      Lab: {bloodValues[0].lab_name} · Range: {bloodValues[0].reference_low}–{bloodValues[0].reference_high} {bloodValues[0].unit}
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={bloodValues.map(v => ({ date: new Date(v.report_date).toLocaleDateString('en-IN', { month:'short', year:'2-digit' }), value: parseFloat(v.value), abnormal: v.is_abnormal }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" tick={{ fontSize:9 }} />
                        <YAxis tick={{ fontSize:9 }} domain={['auto','auto']} />
                        <Tooltip formatter={(v) => [`${v} ${bloodValues[0].unit || ''}`, selectedTest]} contentStyle={{ fontSize:11 }} />
                        {bloodValues[0]?.reference_high && <ReferenceLine y={parseFloat(bloodValues[0].reference_high)} stroke="var(--red-200)" strokeDasharray="4 3" label={{ value:'High', fontSize:9, fill:'var(--red-400)' }} />}
                        {bloodValues[0]?.reference_low && <ReferenceLine y={parseFloat(bloodValues[0].reference_low)} stroke="var(--amber-200)" strokeDasharray="4 3" label={{ value:'Low', fontSize:9, fill:'var(--amber-600)' }} />}
                        <Line type="monotone" dataKey="value" stroke="var(--blue-400)" strokeWidth={2}
                          dot={(props) => { const { cx, cy, payload } = props; return <circle key={cx} cx={cx} cy={cy} r={4} fill={payload.abnormal ? 'var(--red-400)' : 'var(--blue-400)'} stroke="#fff" strokeWidth={1.5} />; }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  /* Different labs or ranges — show table instead */
                  <div style={{ overflowX:'auto' }}>
                    <div style={{ fontSize:11, color:'var(--amber-700)', marginBottom:8 }}>
                      Results are from different laboratories or have different reference ranges. A trend graph cannot be generated. Showing detailed table instead.
                    </div>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'var(--gray-50)' }}>
                          {['Date','Value','Unit','Normal range','Laboratory','Status'].map(h => (
                            <th key={h} style={{ padding:'6px 8px', textAlign:'left', borderBottom:'2px solid var(--border)', fontSize:11, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bloodValues.map((v, i) => (
                          <tr key={i} style={{ borderBottom:'1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--gray-50)' }}>
                            <td style={{ padding:'6px 8px', fontSize:11 }}>{new Date(v.report_date).toLocaleDateString('en-IN')}</td>
                            <td style={{ padding:'6px 8px', fontWeight:600, color: v.is_abnormal ? 'var(--red-600)' : 'var(--teal-700)' }}>{v.value}</td>
                            <td style={{ padding:'6px 8px', fontSize:11, color:'var(--text-tertiary)' }}>{v.unit || '—'}</td>
                            <td style={{ padding:'6px 8px', fontSize:11 }}>{v.reference_low && v.reference_high ? `${v.reference_low}–${v.reference_high}` : v.reference_range || '—'}</td>
                            <td style={{ padding:'6px 8px', fontSize:11, color:'var(--text-secondary)' }}>{v.lab_name || '—'}</td>
                            <td style={{ padding:'6px 8px' }}>
                              <span style={{ fontSize:10, padding:'2px 6px', borderRadius:10, background: v.is_abnormal ? 'var(--red-50)' : 'var(--teal-50)', color: v.is_abnormal ? 'var(--red-600)' : 'var(--teal-600)', border:`1px solid ${v.is_abnormal ? 'var(--red-200)' : 'var(--teal-200)'}` }}>
                                {v.is_abnormal ? '⚠ Abnormal' : '✓ Normal'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Consultation notes */}
              <div className="card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <div className="card-title" style={{ marginBottom:0 }}>Consultation notes</div>
                  {notesSaved && <span style={{ fontSize:12, color:'var(--teal-600)' }}>✓ Saved</span>}
                </div>
                {[['chiefComplaint','Chief complaint'],['diagnosis','Diagnosis'],['doctorNotes','Clinical notes & observations'],['followUpNotes','Follow-up instructions']].map(([key, label]) => (
                  <div className="form-group" key={key}>
                    <label className="form-label">{label}</label>
                    <textarea className="form-input" rows={key === 'doctorNotes' ? 3 : 2} value={notes[key]} onChange={e => setNotes(p => ({ ...p, [key]: e.target.value }))} placeholder={`Enter ${label.toLowerCase()}...`} style={{ resize:'vertical' }} />
                  </div>
                ))}
                {consultations.length > 0 && consultations[0].doctorNotes && (
                  <div style={{ background:'var(--gray-50)', borderRadius:'var(--radius-md)', padding:12, marginBottom:14 }}>
                    <div style={{ fontSize:12, fontWeight:500, marginBottom:4 }}>Previous notes — {consultations[0].completedAt ? new Date(consultations[0].completedAt).toLocaleDateString('en-IN') : '—'}</div>
                    <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6 }}>{consultations[0].doctorNotes}</div>
                  </div>
                )}
                <button className="btn btn-primary" onClick={() => saveNotes(consultations[0]?.id)}>💾 Save notes</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

// ─── Doctor portal ─────────────────────────────────────────
const DoctorPortal = () => {
  const { user } = useAuth();
  const [doctor, setDoctor] = useState(null);

  useEffect(() => {
    if (user?.id) doctorAPI.getProfile().then(r => setDoctor(r)).catch(() => {});
  }, [user]);

  return (
    <DoctorLayout doctor={doctor}>
      <Routes>
        <Route path="dashboard" element={<DoctorDashboard doctor={doctor} />} />
        <Route path="appointments" element={<DoctorDashboard doctor={doctor} />} />
        <Route path="*" element={<DoctorDashboard doctor={doctor} />} />
      </Routes>
    </DoctorLayout>
  );
};

export default DoctorPortal;
