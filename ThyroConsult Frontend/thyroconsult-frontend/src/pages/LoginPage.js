import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo, Alert, Spinner } from '../components/common/index';
import { patientAPI } from '../api';

// Kept identical to PatientPortal.js's LANGUAGES / RegisterPage.js's
// REGISTRATION_LANGUAGES — no shared constants module exists yet between
// these three files, so this must be updated by hand in all three if the
// language list ever changes. See translationService.js's LANGUAGE_NAMES
// for the backend counterpart.
const LOGIN_LANGUAGES = [
  ['en', 'English'], ['hi', 'हिन्दी (Hindi)'], ['gu', 'ગુજરાતી (Gujarati)'],
  ['mr', 'मराठी (Marathi)'], ['ta', 'தமிழ் (Tamil)'], ['te', 'తెలుగు (Telugu)'],
  ['kn', 'ಕನ್ನಡ (Kannada)'], ['ml', 'മലയാളം (Malayalam)'],
  ['bn', 'বাংলা (Bengali)'], ['pa', 'ਪੰਜਾਬੀ (Punjabi)'],
  ['or', 'ଓଡ଼ିଆ (Odia)'], ['as', 'অসমীয়া (Assamese)'], ['ne', 'नेपाली (Nepali)'],
  ['mnib', 'মৈতৈলোন্ (Manipuri — Bengali script)'],
  ['mnim', 'ꯃꯤꯇꯩꯂꯣꯟ (Manipuri — Meitei script)'],
];

const LoginPage = () => {
  const [role, setRole] = useState('patient');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Login-screen language picker: we don't know who's logging in until
  // after they submit, so this can't show their actual current
  // preference. languageTouched tracks whether they consciously picked
  // something this session — only synced to their profile if true, so
  // an untouched default never silently overwrites an existing saved
  // preference (e.g. a patient who already has Hindi set, logging in
  // without touching this dropdown, must NOT get reset to English).
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const [languageTouched, setLanguageTouched] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(identifier, password, role);
      if (user.role === 'patient') {
        if (languageTouched) {
          // Best-effort — a failure here shouldn't block a successful
          // login. By this point login() has already set tokens, so
          // this call is authenticated as this patient.
          patientAPI.updateLanguage(preferredLanguage).catch(() => {});
        }
        navigate('/patient/dashboard');
      }
      else if (user.role === 'doctor') navigate('/doctor/dashboard');
      else navigate('/admin/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed. Please check your credentials.';
      setError(msg);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo & title */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Logo size="lg" />
          <h1 style={{ marginTop: 16, fontSize: '1.8rem', color: 'var(--text-primary)' }}>Welcome back</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginTop: 6 }}>Sign in to your account</p>
        </div>

        {/* Role tabs */}
        <div style={{ display: 'flex', background: 'var(--gray-100)', borderRadius: 'var(--radius-md)', padding: 4, marginBottom: 28, gap: 4 }}>
          {[['patient','Patient'], ['doctor','Doctor'], ['admin','Admin']].map(([val, label]) => (
            <button key={val} onClick={() => setRole(val)} style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', background: role === val ? 'var(--surface)' : 'transparent', color: role === val ? 'var(--teal-600)' : 'var(--text-tertiary)', boxShadow: role === val ? 'var(--shadow-sm)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Language picker — patient-only, per the platform rule that
            physician and admin portals stay English-only, always.
            Untouched = leave whatever's already saved on their profile
            alone (see languageTouched above). Styled to match the role
            tabs strip immediately above: light grey pill container,
            white/surface background for the control itself, light blue
            on hover. */}
        {role === 'patient' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--gray-100)', borderRadius: 'var(--radius-md)',
            padding: 4, marginBottom: 28,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)', paddingLeft: 8, whiteSpace: 'nowrap' }}>
              <span aria-hidden="true">🌐</span> Choose language
            </span>
            <select
              value={preferredLanguage}
              onChange={e => { setPreferredLanguage(e.target.value); setLanguageTouched(true); }}
              aria-label="Choose language"
              style={{
                flex: 1, border: 'none', borderRadius: 8, padding: '8px 10px',
                fontSize: 13, fontWeight: 500, color: 'var(--teal-600)',
                background: 'var(--surface)', boxShadow: 'var(--shadow-sm)',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--blue-50)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
            >
              {LOGIN_LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Form */}
        <div className="card" style={{ padding: 28 }}>
          {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">
                {role === 'patient' ? 'Mobile number or email' : 'Email address'}
              </label>
              <input className="form-input" type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={role === 'patient' ? '+91 XXXXX XXXXX or email' : 'your@email.com'} required autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input className="form-input" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required style={{ paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 14 }}>
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              {loading ? <Spinner size={18} color="#fff" /> : 'Sign in'}
            </button>
          </form>
          {role === 'patient' && (
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)', marginTop: 20 }}>
              New patient?{' '}
              <Link to="/register" style={{ color: 'var(--teal-600)', fontWeight: 500, textDecoration: 'none' }}>Create account</Link>
            </p>
          )}
        </div>

        {/* Security notice */}
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          🔒 End-to-end encrypted · Your data is protected
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
