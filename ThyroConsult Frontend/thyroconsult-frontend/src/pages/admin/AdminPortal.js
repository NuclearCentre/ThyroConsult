import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { adminAPI } from '../../api';
import { AdminSidebar } from '../../components/common/Sidebar';
import { Badge, StatusBadge, EmptyState, Spinner, SectionHeader } from '../../components/common/index';
import { useAuth } from '../../context/AuthContext';

const AdminLayout = ({ children }) => (
  <div className="app-shell">
    <AdminSidebar />
    <main className="main-area">
      <div className="page-content">{children}</div>
    </main>
  </div>
);

// ─── Admin Dashboard ───────────────────────────────────────
const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getPlatformStats().then(r => setStats(r)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={32} /></div>;

  const platform = stats?.platform || {};

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h2 style={{ fontSize:'1.4rem' }}>Platform overview</h2>
        <div style={{ display:'flex', gap:8 }}>
          <span className="badge badge-teal">✓ All systems operational</span>
          <span className="badge badge-indigo">Secure & Encrypted</span>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Total patients</div><div className="stat-value">{Number(platform.total_patients || 0).toLocaleString()}</div></div>
        <div className="stat-card"><div className="stat-label">Active doctors</div><div className="stat-value">{platform.active_doctors || 0}</div></div>
        <div className="stat-card"><div className="stat-label">Consultations this month</div><div className="stat-value">{Number(platform.consultations_this_month || 0).toLocaleString()}</div></div>
        <div className="stat-card"><div className="stat-label">Revenue this month</div><div className="stat-value" style={{ fontSize:18, marginTop:3 }}>₹{Number(platform.revenue_this_month || 0).toLocaleString('en-IN')}</div></div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
        {/* Alerts */}
        <div className="card">
          <div className="card-title">Recent alerts</div>
          {(stats?.recentAlerts || []).length === 0 ? <EmptyState icon="✅" title="No alerts" subtitle="All activity is normal" /> :
            (stats?.recentAlerts || []).slice(0,6).map((alert, i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', marginTop:4, flexShrink:0, background: alert.result === 'blocked' ? 'var(--red-400)' : 'var(--amber-200)' }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12 }}>{alert.action_detail || alert.event_type}</div>
                  <div style={{ fontSize:10, color:'var(--text-tertiary)' }}>{new Date(alert.timestamp).toLocaleTimeString('en-IN')}</div>
                </div>
                <span className={`badge badge-${alert.result === 'blocked' ? 'red' : 'amber'}`} style={{ fontSize:10 }}>{alert.result}</span>
              </div>
            ))
          }
        </div>

        {/* Audit log preview */}
        <div className="card">
          <div className="card-title">Live activity</div>
          <AuditLogPreview />
        </div>
      </div>
    </>
  );
};

const AuditLogPreview = () => {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    adminAPI.getAuditLog({ limit: 8 }).then(r => setLogs(r.logs || [])).catch(() => {});
  }, []);

  const eventColors = { LOGIN_SUCCESS:'teal', LOGIN_FAILED:'red', PHI_VIEWED:'blue', DOCUMENT_DOWNLOADED:'indigo', PAYMENT_CONFIRMED:'teal', AUDIT_LOG_EXPORTED:'amber', CONSENT_SIGNED:'teal' };

  return logs.length === 0 ? <EmptyState icon="📋" title="No recent activity" subtitle="" /> : (
    logs.map(log => (
      <div key={log.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:11 }}>
        <span style={{ color:'var(--text-tertiary)', width:50, flexShrink:0 }}>{new Date(log.timestamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}</span>
        <span style={{ flex:1, color:'var(--text-secondary)' }}>{log.user_role || '—'}</span>
        <span className={`badge badge-${eventColors[log.event_type] || 'gray'}`} style={{ fontSize:9 }}>{log.event_type?.replace(/_/g,' ')}</span>
        <span className={`badge badge-${log.result === 'success' ? 'teal' : 'red'}`} style={{ fontSize:9 }}>{log.result}</span>
      </div>
    ))
  );
};

// ─── Patient list ──────────────────────────────────────────
const PatientList = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    adminAPI.listPatients({ search: search || undefined }).then(r => setPatients(r.patients || [])).catch(() => {}).finally(() => setLoading(false));
  }, [search]);

  return (
    <>
      <SectionHeader title="Patient records" subtitle={`${patients.length} total`} />
      <div className="card">
        <div style={{ marginBottom:16 }}>
          <input className="form-input" placeholder="Search by mobile or email..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth:300 }} />
        </div>
        {loading ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div>
        : patients.length === 0 ? <EmptyState icon="🏥" title="No patients found" subtitle="" />
        : (
          <table className="data-table">
            <thead><tr><th>Patient code</th><th>Name</th><th>Gender</th><th>Reg. step</th><th>Verified</th><th>Joined</th></tr></thead>
            <tbody>
              {patients.map(p => (
                <tr key={p.id}>
                  <td style={{ color:'var(--teal-600)', fontWeight:500 }}>{p.patientCode}</td>
                  <td>{p.name}</td>
                  <td>{p.gender}</td>
                  <td><span className={`badge badge-${p.registrationComplete ? 'teal' : 'amber'}`}>{p.registrationComplete ? '✓ Complete' : `Step ${p.registrationStep}/7`}</span></td>
                  <td>
                    {p.mobileVerified && <span className="badge badge-teal" style={{ fontSize:9, marginRight:3 }}>📱</span>}
                    {p.emailVerified && <span className="badge badge-teal" style={{ fontSize:9 }}>✉</span>}
                  </td>
                  <td style={{ color:'var(--text-tertiary)' }}>{new Date(p.createdAt).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};

// ─── Doctor management ─────────────────────────────────────
const DoctorManagement = () => {
  const [doctors, setDoctors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', mobile:'', password:'', specialisation:'', qualifications:'', experienceYears:'', consultationFee:'1200' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminAPI.listDoctors().then(r => setDoctors(r.doctors || [])).catch(() => {});
  }, []);

  const toggleStatus = async (id, current) => {
    await adminAPI.setDoctorStatus(id, !current);
    setDoctors(prev => prev.map(d => d.id === id ? { ...d, isActive: !current } : d));
  };

  const createDoctor = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await adminAPI.createDoctor(form);
      setShowForm(false);
      const r = await adminAPI.listDoctors();
      setDoctors(r.doctors || []);
    } catch (err) { alert(err.response?.data?.error || 'Failed to create doctor'); }
    finally { setLoading(false); }
  };

  return (
    <>
      <SectionHeader title="Doctor management" action={<button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>+ Add doctor</button>} />

      {showForm && (
        <div className="card" style={{ marginBottom:20 }}>
          <h4 style={{ marginBottom:16 }}>Add new doctor</h4>
          <form onSubmit={createDoctor}>
            <div className="form-grid-2">
              {[['firstName','First name'],['lastName','Last name'],['email','Email'],['mobile','Mobile'],['password','Password'],['specialisation','Specialisation'],['qualifications','Qualifications'],['experienceYears','Years experience'],['consultationFee','Consultation fee (₹)']].map(([k, label]) => (
                <div className="form-group" key={k}>
                  <label className="form-label">{label}</label>
                  <input className="form-input" value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} type={k === 'password' ? 'password' : 'text'} required={['firstName','lastName','email','mobile','password'].includes(k)} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <Spinner size={16} color="#fff" /> : 'Create doctor'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {doctors.length === 0 ? <EmptyState icon="👨‍⚕️" title="No doctors" subtitle="Add doctors to the platform" /> : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Specialisation</th><th>Fee</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>
              {doctors.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight:500 }}>{d.name}</td>
                  <td style={{ color:'var(--text-secondary)' }}>{d.specialisation}</td>
                  <td>₹{d.consultationFee?.toLocaleString('en-IN')}</td>
                  <td><span className={`badge badge-${d.isActive ? 'teal' : 'red'}`}>{d.isActive ? 'Active' : 'Suspended'}</span></td>
                  <td style={{ color:'var(--text-tertiary)', fontSize:12 }}>{d.lastLoginAt ? new Date(d.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}</td>
                  <td>
                    <button className={`btn btn-sm ${d.isActive ? 'btn-danger' : 'btn-secondary'}`} onClick={() => toggleStatus(d.id, d.isActive)}>
                      {d.isActive ? '🔒 Suspend' : '✓ Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};

// ─── Full audit log ────────────────────────────────────────
const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    adminAPI.getAuditLog({ page, limit:20, eventType: filter || undefined })
      .then(r => { setLogs(r.logs || []); setTotal(r.total || 0); })
      .catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, [page, filter]);

  const exportLog = async () => {
    const blob = await adminAPI.exportAuditLog();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const EVENT_TYPES = ['','LOGIN_SUCCESS','LOGIN_FAILED','PHI_VIEWED','DOCUMENT_DOWNLOADED','PAYMENT_CONFIRMED','CONSENT_SIGNED','AUDIT_LOG_EXPORTED'];
  const eventBadge = { LOGIN_SUCCESS:'teal', LOGIN_FAILED:'red', PHI_VIEWED:'blue', DOCUMENT_DOWNLOADED:'indigo', PAYMENT_CONFIRMED:'teal', CONSENT_SIGNED:'teal', AUDIT_LOG_EXPORTED:'amber', PHOTO_VIEWED:'blue', UNAUTHORIZED_PHI_ACCESS:'red' };

  return (
    <>
      <SectionHeader title="Data access audit log" subtitle={`${total.toLocaleString()} total events`} action={
        <button className="btn btn-primary btn-sm" onClick={exportLog}>⬇ Export CSV</button>
      } />
      <div className="card">
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {EVENT_TYPES.map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{ padding:'4px 13px', borderRadius:20, border:`1px solid ${filter === t ? 'var(--indigo-400)' : 'var(--border-md)'}`, background: filter === t ? 'var(--indigo-50)' : 'transparent', color: filter === t ? 'var(--indigo-800)' : 'var(--text-secondary)', fontSize:11, cursor:'pointer' }}>
              {t || 'All events'}
            </button>
          ))}
        </div>
        {loading ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div> : (
          <table className="data-table">
            <thead><tr><th>Timestamp</th><th>User</th><th>Role</th><th>Event</th><th>Patient</th><th>IP</th><th>Result</th></tr></thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize:12, color:'var(--text-tertiary)', whiteSpace:'nowrap' }}>{new Date(log.timestamp).toLocaleString('en-IN')}</td>
                  <td style={{ fontSize:12 }}>{log.user_id?.slice(0,8) || '—'}</td>
                  <td><span className="badge badge-gray" style={{ fontSize:9 }}>{log.user_role || '—'}</span></td>
                  <td><span className={`badge badge-${eventBadge[log.event_type] || 'gray'}`} style={{ fontSize:9 }}>{log.event_type?.replace(/_/g,' ')}</span></td>
                  <td style={{ fontSize:11, color:'var(--indigo-600)' }}>{log.patient_id?.slice(0,8) || '—'}</td>
                  <td style={{ fontSize:11, color:'var(--text-tertiary)' }}>{log.ip_address || '—'}</td>
                  <td><span className={`badge badge-${log.result === 'success' ? 'teal' : log.result === 'blocked' ? 'red' : 'amber'}`} style={{ fontSize:9 }}>{log.result}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, fontSize:13 }}>
          <span style={{ color:'var(--text-tertiary)' }}>Showing {((page-1)*20)+1}–{Math.min(page*20,total)} of {total.toLocaleString()}</span>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page === 1}>← Prev</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p+1)} disabled={page*20 >= total}>Next →</button>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Encryption status ─────────────────────────────────────
const SecurityPanel = () => {
  const [status, setStatus] = useState(null);
  useEffect(() => { adminAPI.getEncryptionStatus().then(r => setStatus(r)).catch(() => {}); }, []);

  return (
    <>
      <SectionHeader title="Encryption & security" action={<span className="badge badge-teal">✓ All encryption active</span>} />
      {status && (
        <>
          <div style={{ background:'var(--indigo-900)', borderRadius:'var(--radius-lg)', padding:24, marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#CECBF6', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>🔒 Active encryption protocols</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {[['Data at rest', status.dataAtRest?.algorithm, status.dataAtRest?.scope],['Data in transit', status.dataInTransit?.algorithm, status.dataInTransit?.scope],['PHI field-level', status.phiFieldLevel?.algorithm, `${status.phiFieldLevel?.phiFields} PHI fields`],['Patient photos', status.photoVault?.algorithm, status.photoVault?.storage],['Document storage', status.documentStorage?.algorithm, 'All uploads'],['Auth tokens', status.authTokens?.algorithm, status.authTokens?.expiry]].map(([label, algo, detail]) => (
                <div key={label} style={{ background:'rgba(255,255,255,0.08)', borderRadius:10, padding:'12px 14px' }}>
                  <div style={{ fontSize:11, color:'#AFA9EC', marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#EEEDFE' }}>{algo}</div>
                  <div style={{ fontSize:11, color:'#5DCAA5', marginTop:3, display:'flex', alignItems:'center', gap:4 }}>✓ {detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            <div className="card">
              <div className="card-title">Security controls</div>
              {[['Two-factor auth (doctors)', true],['Two-factor auth (patients)', true],['IP rate limiting', true],['Auto-lock on idle (15 min)', true],['Brute-force lockout (5 tries)', true],['Data export requires approval', true],['PHI masking in logs', true],['Allow patient data download', false]].map(([label, on]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                  <span style={{ color:'var(--text-secondary)' }}>{label}</span>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked={on} readOnly />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-title">Key rotation schedule</div>
              {[['JWT signing key', '30 days', 'teal'],['Photo vault key', '90 days', 'teal'],['DB master key', 'AWS KMS auto-rotate', 'teal'],['SSL certificate', 'Annual (auto-renew)', 'teal'],['Backup encryption', 'Daily backup cycle', 'teal']].map(([comp, sched, variant]) => (
                <div key={comp} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                  <span>{comp}</span>
                  <span className={`badge badge-${variant}`} style={{ fontSize:10 }}>{sched}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
};

// ─── RBAC panel ────────────────────────────────────────────
const RolesPanel = () => {
  const [doctors, setDoctors] = useState([]);
  useEffect(() => { adminAPI.listDoctors().then(r => setDoctors(r.doctors || [])).catch(() => {}); }, []);

  const roles = [
    { name:'Super admin', variant:'indigo', perms:[['Full platform access',true],['View all PHI records',true],['Manage users & doctors',true],['Export audit logs',true],['Modify encryption settings',true],['Manage roles & permissions',true]]},
    { name:'Doctor', variant:'blue', perms:[["View own patients' PHI",true],['View patient documents',true],['View patient photo',true],['Write Opinion Notes',true],['Issue Opinion summary',true],["View other doctors' patients",false],['Access admin / billing',false]]},
    { name:'Patient', variant:'teal', perms:[['View own profile & records',true],['Upload own documents',true],['View own report trends',true],['Download own invoices',true],['Book appointments',true],["View other patients' data",false],['Access doctor or admin areas',false]]},
  ];

  return (
    <>
      <SectionHeader title="Role-based access control" action={<button className="btn btn-primary btn-sm">+ Add role</button>} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
        {roles.map(role => (
          <div className="card" key={role.name}>
            <div style={{ marginBottom:12 }}><span className={`badge badge-${role.variant}`}>{role.name}</span></div>
            {role.perms.map(([label, allowed]) => (
              <div key={label} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'4px 0', fontSize:12 }}>
                <span style={{ color: allowed ? 'var(--teal-600)' : 'var(--red-600)', flexShrink:0 }}>{allowed ? '✓' : '✗'}</span>
                <span style={{ color:'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-title">Active users</div>
        <table className="data-table">
          <thead><tr><th></th><th>Name</th><th>Role</th><th>Last login</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr>
              <td><div style={{ width:26, height:26, borderRadius:'50%', background:'var(--indigo-50)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600, color:'var(--indigo-800)' }}>SA</div></td>
              <td>Super Admin</td>
              <td><span className="badge badge-indigo" style={{ fontSize:10 }}>super_admin</span></td>
              <td style={{ fontSize:12, color:'var(--text-tertiary)' }}>Today</td>
              <td><span className="badge badge-teal">Active</span></td>
              <td><button className="btn btn-secondary btn-sm">✏ Edit</button></td>
            </tr>
            {doctors.map(d => (
              <tr key={d.id}>
                <td><div style={{ width:26, height:26, borderRadius:'50%', background:'var(--blue-50)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600, color:'var(--blue-800)' }}>{d.name?.split(' ')[1]?.[0]}{d.name?.split(' ')[2]?.[0]}</div></td>
                <td style={{ fontWeight:500 }}>{d.name}</td>
                <td><span className="badge badge-blue" style={{ fontSize:10 }}>doctor</span></td>
                <td style={{ fontSize:12, color:'var(--text-tertiary)' }}>{d.lastLoginAt ? new Date(d.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}</td>
                <td><span className={`badge badge-${d.isActive ? 'teal' : 'red'}`}>{d.isActive ? 'Active' : 'Suspended'}</span></td>
                <td style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-secondary btn-sm">✏ Edit</button>
                  <button className={`btn btn-sm ${d.isActive ? 'btn-danger' : 'btn-secondary'}`}>🔒</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ─── Admin portal ──────────────────────────────────────────
const AdminPortal = () => (
  <AdminLayout>
    <Routes>
      <Route path="dashboard" element={<AdminDashboard />} />
      <Route path="patients" element={<PatientList />} />
      <Route path="doctors" element={<DoctorManagement />} />
      <Route path="audit" element={<AuditLog />} />
      <Route path="security" element={<SecurityPanel />} />
      <Route path="roles" element={<RolesPanel />} />
      <Route path="*" element={<AdminDashboard />} />
    </Routes>
  </AdminLayout>
);

export default AdminPortal;
