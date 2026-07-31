import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

// 15 minutes, per product decision (was 30 min in an earlier draft of this
// requirement — this is the current, final value).
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const idleTimerRef = useRef(null);
  const userRef = useRef(null); // mirrors `user` for use inside the event-listener closures below

  useEffect(() => {
    const token = authAPI.getToken();
    const storedUser = sessionStorage.getItem('thyro_user');
    if (token && storedUser) {
      try { setUser(JSON.parse(storedUser)); } catch { sessionStorage.clear(); }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (identifier, password, role) => {
    const res = await authAPI.login(identifier, password, role);
    const { accessToken, refreshToken, userId, role: userRole } = res;
    authAPI.setTokens(accessToken, refreshToken);
    const userData = { id: userId, role: userRole };
    sessionStorage.setItem('thyro_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  // Hard redirect (not just clearing React state) is deliberate: it
  // guarantees every component fully remounts with fresh data on the next
  // login, rather than any component instance surviving with stale state
  // from the previous session. This also makes logout safe to call from
  // the idle-timer below, which fires outside of any component's render.
  const logout = useCallback(async () => {
    try {
      const refreshToken = sessionStorage.getItem('thyro_refresh_token');
      await authAPI.logout(refreshToken);
    } catch { /* silent */ } finally {
      authAPI.clearTokens();
      sessionStorage.removeItem('thyro_user');
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => { userRef.current = user; }, [user]);

  // ─── 15-minute idle timeout ───────────────────────────────────────────
  useEffect(() => {
    if (!user) return; // only run the idle timer while actually logged in

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (userRef.current) logout();
      }, IDLE_TIMEOUT_MS);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, resetTimer));

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [user, logout]);

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
