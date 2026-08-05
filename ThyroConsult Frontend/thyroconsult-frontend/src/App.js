import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/global.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/patient/RegisterPage';
import PatientPortal from './pages/patient/PatientPortal';
import PhysicianPortal from './pages/doctor/PhysicianPortal';
import AdminPortal from './pages/admin/AdminPortal';
import { Spinner } from './components/common/index';

// ─── Protected route wrapper ───────────────────────────────
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <Spinner size={64} borderColor="#000" stripColor="#fff" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to correct portal based on role
    if (user.role === 'doctor') return <Navigate to="/doctor/dashboard" replace />;
    if (user.role === 'admin' || user.role === 'super_admin') return <Navigate to="/admin/stats" replace />;
    return <Navigate to="/patient/dashboard" replace />;
  }

  return children;
};

// ─── Root redirect based on role ──────────────────────────
const RootRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><Spinner size={64} borderColor="#000" stripColor="#fff" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'doctor') return <Navigate to="/doctor/dashboard" replace />;
  if (user.role === 'admin' || user.role === 'super_admin') return <Navigate to="/admin/stats" replace />;
  return <Navigate to="/patient/dashboard" replace />;
};

// ─── App ──────────────────────────────────────────────────
const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Patient portal */}
          <Route path="/patient/*" element={
            <ProtectedRoute allowedRoles={['patient']}>
              <PatientPortal />
            </ProtectedRoute>
          } />

          {/* Doctor portal */}
          <Route path="/doctor/*" element={
            <ProtectedRoute allowedRoles={['doctor']}>
              <PhysicianPortal />
            </ProtectedRoute>
          } />

          {/* Admin portal */}
          <Route path="/admin/*" element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
              <AdminPortal />
            </ProtectedRoute>
          } />

          {/* Root → redirect based on role */}
          <Route path="/" element={<RootRedirect />} />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
