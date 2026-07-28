/**
 * LanguageSelector component
 *
 * Two modes:
 *   mode="nav"   → compact dropdown in the navbar (shows flag + native label)
 *   mode="page"  → full card for Step 1 of registration (shows all 10 languages as tiles)
 *
 * Usage:
 *   import LanguageSelector from '../components/LanguageSelector';
 *   <LanguageSelector mode="nav" patientId={patient?.id} />
 *   <LanguageSelector mode="page" onSelect={() => goToNextStep()} />
 */

import React, { useState, useRef, useEffect } from 'react';
import { useI18n, SUPPORTED_LANGUAGES } from '../i18n/I18nContext';

// Language → flag emoji mapping (Unicode regional indicators)
const FLAG = {
  en: '🇬🇧', hi: '🇮🇳', mr: '🇮🇳', ta: '🇮🇳', te: '🇮🇳',
  kn: '🇮🇳', ml: '🇮🇳', bn: '🇮🇳', gu: '🇮🇳', pa: '🇮🇳', or: '🇮🇳',
};

// ─────────────────────────────────────────────────────────
// Navbar compact selector
// ─────────────────────────────────────────────────────────
function NavLanguageSelector({ patientId }) {
  const { currentLang, setLanguage, isTranslating, SUPPORTED_LANGUAGES: langs } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = langs.find(l => l.code === currentLang) || langs[0];

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = async (code) => {
    setOpen(false);
    await setLanguage(code, patientId);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid var(--border-color, #ddd)',
          background: 'var(--bg-secondary, #f5f5f5)',
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--text-primary, #1a1a1a)',
          fontFamily: 'inherit',
        }}
        title="Change language"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ fontSize: 16 }}>{FLAG[currentLang] || '🌐'}</span>
        <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current.nativeLabel}
        </span>
        {isTranslating && (
          <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--primary, #072654)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
        )}
        <span style={{ fontSize: 10, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 200,
            maxHeight: 340,
            overflowY: 'auto',
            background: 'var(--bg-primary, #fff)',
            border: '1px solid var(--border-color, #ddd)',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            zIndex: 9999,
            padding: '4px 0',
          }}
        >
          {langs.map(lang => (
            <button
              key={lang.code}
              role="option"
              aria-selected={lang.code === currentLang}
              onClick={() => handleSelect(lang.code)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 14px',
                border: 'none',
                background: lang.code === currentLang ? 'var(--bg-secondary, #f0f4ff)' : 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text-primary, #1a1a1a)',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{FLAG[lang.code]}</span>
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: lang.code === currentLang ? 600 : 400 }}>{lang.nativeLabel}</span>
                {lang.nativeLabel !== lang.label && (
                  <span style={{ fontSize: 11, color: 'var(--text-secondary, #888)', marginLeft: 6 }}>
                    {lang.label}
                  </span>
                )}
              </span>
              {lang.code === currentLang && <span style={{ color: '#072654', fontSize: 14 }}>✓</span>}
              {!lang.static && (
                <span style={{ fontSize: 10, color: '#999', flexShrink: 0 }}>AI</span>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Page / registration step selector (full tiles)
// ─────────────────────────────────────────────────────────
function PageLanguageSelector({ onSelect, patientId }) {
  const { currentLang, setLanguage, t } = useI18n();

  const handleSelect = async (code) => {
    await setLanguage(code, patientId);
    if (onSelect) onSelect(code);
  };

  return (
    <div style={{ padding: '20px 0' }}>
      <p style={{
        fontSize: 14,
        color: 'var(--text-secondary, #666)',
        marginBottom: 16,
        textAlign: 'center',
      }}>
        {t('lang.select')} / Please select your preferred language
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 10,
      }}>
        {SUPPORTED_LANGUAGES.map(lang => (
          <button
            key={lang.code}
            onClick={() => handleSelect(lang.code)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '14px 10px',
              borderRadius: 10,
              border: lang.code === currentLang
                ? '2px solid #072654'
                : '1px solid var(--border-color, #e0e0e0)',
              background: lang.code === currentLang
                ? 'rgba(7, 38, 84, 0.06)'
                : 'var(--bg-secondary, #fafafa)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 26 }}>{FLAG[lang.code]}</span>
            <span style={{
              fontSize: 14,
              fontWeight: lang.code === currentLang ? 600 : 400,
              color: lang.code === currentLang ? '#072654' : 'var(--text-primary, #1a1a1a)',
            }}>
              {lang.nativeLabel}
            </span>
            {lang.nativeLabel !== lang.label && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary, #888)' }}>
                {lang.label}
              </span>
            )}
            {!lang.static && (
              <span style={{
                fontSize: 10,
                color: '#999',
                background: '#f0f0f0',
                padding: '1px 5px',
                borderRadius: 4,
              }}>
                Auto-translated
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Auto-translate disclaimer */}
      {currentLang !== 'en' && currentLang !== 'hi' && (
        <div style={{
          marginTop: 16,
          padding: '10px 14px',
          background: '#fff8e1',
          border: '1px solid #ffcc02',
          borderRadius: 8,
          fontSize: 12,
          color: '#7a6000',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>ℹ️</span>
          <span>{t('lang.disclaimer')}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────
export default function LanguageSelector({ mode = 'nav', ...props }) {
  if (mode === 'page') return <PageLanguageSelector {...props} />;
  return <NavLanguageSelector {...props} />;
}

export { NavLanguageSelector, PageLanguageSelector };
