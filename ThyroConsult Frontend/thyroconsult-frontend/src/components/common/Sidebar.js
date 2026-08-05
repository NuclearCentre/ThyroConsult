import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Logo } from './index';
import { useAuth } from '../../context/AuthContext';
import { patientAPI } from '../../api';

const NavItem = ({ to, icon, label, badge, adminStyle }) => (
  <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
    <span style={{ fontSize: 16 }}>{icon}</span>
    <span style={{ flex: 1 }}>{label}</span>
    {badge && <span style={{ fontSize: 10, background: '#E24B4A', color: '#fff', borderRadius: 20, padding: '1px 6px' }}>{badge}</span>}
  </NavLink>
);

// Sidebar avatar — shows the patient's actual captured live photo when
// one exists, falling back to initials (the previous, only, behaviour)
// on any failure: no photo captured yet (404), network error, whatever.
// Re-fetches whenever patientCode changes, which is the one field in
// `patient` guaranteed to differ between profiles (switching into a
// relative, switching back) — avoids showing a stale photo held over
// from the previous profile.
const SidebarAvatar = ({ patient }) => {
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setPhotoUrl(null);
    patientAPI.getPhotoBlob()
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPhotoUrl(objectUrl);
      })
      .catch(() => { /* no photo on record yet, or fetch failed — initials fallback below covers it */ });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [patient?.patientCode]);

  if (photoUrl) {
    return (
      <img src={photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--teal-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--teal-800)', flexShrink: 0 }}>
      {patient.firstName?.[0]}{patient.lastName?.[0]}
    </div>
  );
};

// ─── Patient Sidebar ───────────────────────────────────────
export const PatientSidebar = ({ patient, onAddRelative }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <nav className="sidebar">
      <div style={{ padding: '18px 18px 14px' }}>
        <Logo />
        {patient && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
            <SidebarAvatar patient={patient} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{patient.firstName} {patient.lastName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{patient.patientCode}</div>
            </div>
          </div>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <NavItem to="/patient/dashboard" icon="⊞" label="Dashboard" />
        <NavItem to="/patient/conditions" icon="🩺" label="My Conditions" />
        <NavItem to="/patient/appointments" icon="📅" label="Appointments" />
        <NavItem to="/patient/opinions" icon="📋" label="Online Opinions" />
        <NavItem to="/patient/trends" icon="📈" label="Report Trends" />
        <NavItem to="/patient/documents" icon="📁" label="My Reports" />
        <NavItem to="/patient/invoices" icon="🧾" label="Invoices" />
        <NavItem to="/patient/profile" icon="👤" label="My Profile" />
        {/* Opens a modal, not a route — plain button styled to match
            NavItem rather than reusing it, since NavItem is built
            around react-router's NavLink. Only rendered when
            onAddRelative is provided (root account, not itself a
            managed relative profile — see PatientLayout). */}
        {onAddRelative && (
          <button
            onClick={onAddRelative}
            className="nav-item"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontSize: 16 }}>👪</span>
            <span style={{ flex: 1 }}>Opinion for relative</span>
          </button>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
        <button onClick={handleLogout} className="nav-item" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 14 }}>
          <span>⬅</span> Sign out
        </button>
      </div>
    </nav>
  );
};

// ─── Doctor Sidebar ────────────────────────────────────────
export const DoctorSidebar = ({ doctor }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <nav className="sidebar">
      <div style={{ padding: '18px 18px 14px' }}>
        <Logo />
        {doctor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 12px', background: 'var(--blue-50)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--blue-50)', border: '1px solid var(--blue-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--blue-800)', flexShrink: 0 }}>
              {doctor.firstName?.[0]}{doctor.lastName?.[0]}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Dr. {doctor.firstName} {doctor.lastName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{doctor.specialisation}</div>
            </div>
          </div>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <NavItem to="/doctor/dashboard" icon="⊞" label="Dashboard" />
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
        <button onClick={handleLogout} className="nav-item" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 14 }}>
          <span>⬅</span> Sign out
        </button>
      </div>
    </nav>
  );
};

// ─── Admin Sidebar ─────────────────────────────────────────
export const AdminSidebar = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <nav className="sidebar admin-sidebar">
      <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
        <Logo light />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '8px 10px', background: 'rgba(255,255,255,0.07)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--indigo-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#CECBF6' }}>SA</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#EEEDFE' }}>Super Admin</div>
            <div style={{ fontSize: 10, color: '#AFA9EC' }}>Full access</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <NavItem to="/admin/dashboard" icon="⊞" label="Dashboard" />
        <NavItem to="/admin/patients" icon="🏥" label="Patient records" />
        <NavItem to="/admin/doctors" icon="👨‍⚕️" label="Doctor management" />
        <NavItem to="/admin/payments" icon="💳" label="Payments & invoices" />
        <NavItem to="/admin/audit" icon="🔍" label="Data access audit log" />
        <NavItem to="/admin/security" icon="🔒" label="Encryption & security" />
        <NavItem to="/admin/roles" icon="🔑" label="Roles & permissions" />
        <NavItem to="/admin/alerts" icon="🔔" label="Alerts & notifications" />
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 0' }}>
        <button onClick={handleLogout} className="nav-item" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
          <span>⬅</span> Sign out
        </button>
      </div>
    </nav>
  );
};
