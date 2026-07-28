import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo, Alert, Spinner } from '../components/common/index';

const LoginPage = () => {
  const [role, setRole] = useState('patient');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(identifier, password, role);
      if (user.role === 'patient') navigate('/patient/dashboard');
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

        {/* HIPAA notice */}
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          🔒 HIPAA-compliant · End-to-end encrypted · Your data is protected
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
