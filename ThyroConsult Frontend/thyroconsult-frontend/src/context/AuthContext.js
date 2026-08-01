import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

// 15 minutes, per product decision (was 30 min in an earlier draft of this
// requirement — this is the current, final value).
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

// ─── Fixed-duration session timer — separate mechanism from idle timeout ──
// Starts a fresh countdown at login and does NOT reset on ordinary
// activity (mousemove, scroll, etc.) the way the idle timer above does —
// only an explicit "Continue" click on the warning resets it. This is
// the income-tax-India / government-portal pattern: even an actively-
// working patient gets forced to re-confirm periodically, as a second,
// independent layer on top of (not instead of) the 15-minute idle
// timeout — a patient who's idle for 15 minutes still gets logged out
// by that mechanism first, regardless of where this timer is.
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes, fixed, from login or last "Continue"
const SESSION_WARNING_LEAD_MS = 30 * 1000;  // show the "Continue?" prompt 30s before expiry

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const idleTimerRef = useRef(null);
  const userRef = useRef(null); // mirrors `user` for use inside the event-listener closures below

  // Fixed-duration session timer state
  const sessionTimerRef = useRef(null);
  const sessionWarningTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(30);

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

  // ─── 30-minute fixed session timer + "continue?" warning ──────────────
  // Deliberately does NOT listen to ACTIVITY_EVENTS — unlike the idle
  // timer above, ordinary use of the app does not reset this one. Only
  // an explicit click on "Continue" in the warning modal (continueSession
  // below) restarts the 30-minute window. This is intentional: it forces
  // periodic re-confirmation even for a continuously active patient,
  // as a second, independent layer over the idle timeout.
  const clearSessionTimers = useCallback(() => {
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    if (sessionWarningTimerRef.current) clearTimeout(sessionWarningTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  const scheduleSessionTimers = useCallback(() => {
    clearSessionTimers();
    setShowSessionWarning(false);

    sessionWarningTimerRef.current = setTimeout(() => {
      setWarningSecondsLeft(Math.round(SESSION_WARNING_LEAD_MS / 1000));
      setShowSessionWarning(true);
      // Live countdown shown in the modal — matches the
      // income-tax-India-style pattern of a visibly ticking warning.
      countdownIntervalRef.current = setInterval(() => {
        setWarningSecondsLeft(s => (s > 0 ? s - 1 : 0));
      }, 1000);
    }, SESSION_DURATION_MS - SESSION_WARNING_LEAD_MS);

    sessionTimerRef.current = setTimeout(() => {
      if (userRef.current) logout();
    }, SESSION_DURATION_MS);
  }, [clearSessionTimers, logout]);

  // "Continue" button in the warning modal — also proactively refreshes
  // the access token (not just restarting this timer), so the JWT itself
  // doesn't independently expire out from under a session the patient
  // just explicitly chose to keep.
  const continueSession = useCallback(() => {
    const refreshToken = sessionStorage.getItem('thyro_refresh_token');
    if (refreshToken) authAPI.refresh(refreshToken).catch(() => {});
    scheduleSessionTimers();
  }, [scheduleSessionTimers]);

  useEffect(() => {
    if (!user) { clearSessionTimers(); setShowSessionWarning(false); return; }
    scheduleSessionTimers();
    return clearSessionTimers;
  }, [user, scheduleSessionTimers, clearSessionTimers]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
      {showSessionWarning && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28,
            width: '100%', maxWidth: 380, textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⏱️</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
              Your session is about to expire
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              You'll be logged out in <strong>{warningSecondsLeft}</strong> second{warningSecondsLeft === 1 ? '' : 's'} unless you choose to continue.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={logout}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}
              >
                Log out now
              </button>
              <button
                onClick={continueSession}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: 'var(--teal-400)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Continue session
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
