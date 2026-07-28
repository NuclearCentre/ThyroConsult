import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      try { setUser(JSON.parse(storedUser)); } catch { localStorage.clear(); }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (identifier, password, role) => {
    const res = await authAPI.login(identifier, password, role);
    const { accessToken, refreshToken, userId, role: userRole } = res.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    const userData = { id: userId, role: userRole };
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      await authAPI.logout(refreshToken);
    } catch { /* silent */ } finally {
      localStorage.clear();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
