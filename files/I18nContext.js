/**
 * ThyroConsult i18n System
 * ─────────────────────────────────────────────────────────
 * Patient portal: renders in selected language
 * Physician/Admin portal: always English (do NOT import this context there)
 *
 * Language preference: saved to DB via API + localStorage fallback
 * Translation: static JSON for EN/HI, LibreTranslate API for others (dev)
 * Swap to paid API in prod by updating REACT_APP_TRANSLATE_PROVIDER in .env
 * ─────────────────────────────────────────────────────────
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import en from './locales/en.json';
import hi from './locales/hi.json';

// ── Supported languages ────────────────────────────────────
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English',            nativeLabel: 'English',          static: true  },
  { code: 'hi', label: 'Hindi',              nativeLabel: 'हिन्दी',           static: true  },
  { code: 'mr', label: 'Marathi',            nativeLabel: 'मराठी',            static: false },
  { code: 'ta', label: 'Tamil',              nativeLabel: 'தமிழ்',            static: false },
  { code: 'te', label: 'Telugu',             nativeLabel: 'తెలుగు',          static: false },
  { code: 'kn', label: 'Kannada',            nativeLabel: 'ಕನ್ನಡ',           static: false },
  { code: 'ml', label: 'Malayalam',          nativeLabel: 'മലയാളം',          static: false },
  { code: 'bn', label: 'Bengali',            nativeLabel: 'বাংলা',           static: false },
  { code: 'gu', label: 'Gujarati',           nativeLabel: 'ગુજરાતી',        static: false },
  { code: 'pa', label: 'Punjabi',            nativeLabel: 'ਪੰਜਾਬੀ',         static: false },
  { code: 'or', label: 'Odia',               nativeLabel: 'ଓଡ଼ିଆ',          static: false },
];

// Static JSON bundles (only EN and HI — others use API)
const STATIC_BUNDLES = { en, hi };

// ── LibreTranslate language code mapping ──────────────────
// LibreTranslate uses ISO 639-1 codes; map our codes to theirs
const LT_LANG_MAP = {
  en: 'en', hi: 'hi', mr: 'mr', ta: 'ta', te: 'te',
  kn: 'kn', ml: 'ml', bn: 'bn', gu: 'gu', pa: 'pa', or: 'or',
};

// ── Translation cache (in-memory + localStorage) ─────────
const CACHE_PREFIX = 'tc_trans_';
const CACHE_VERSION = 'v1';

function cacheKey(langCode, namespace, key) {
  return `${CACHE_PREFIX}${CACHE_VERSION}_${langCode}_${namespace}_${key}`;
}

function getCached(langCode, namespace, key) {
  try {
    return localStorage.getItem(cacheKey(langCode, namespace, key));
  } catch {
    return null;
  }
}

function setCache(langCode, namespace, key, value) {
  try {
    localStorage.setItem(cacheKey(langCode, namespace, key), value);
  } catch {
    // storage full — silent fail
  }
}

// ── Deep-get helper for nested keys like "register.firstName" ─
function deepGet(obj, path) {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

// ── Interpolation: replace {{key}} with values ────────────
function interpolate(str, vars = {}) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ─────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [currentLang, setCurrentLangState] = useState(() => {
    return localStorage.getItem('tc_lang') || 'en';
  });

  // Stores dynamic translations fetched from API for non-static languages
  // Shape: { [langCode]: { [flatKey]: translatedString } }
  const [dynamicCache, setDynamicCache] = useState({});
  const [isTranslating, setIsTranslating] = useState(false);

  // Queue of keys pending translation (avoids duplicate API calls)
  const pendingRef = useRef(new Set());

  // ── Get the English string for a flat key ────────────
  const getEnglish = useCallback((key) => {
    return deepGet(en, key) ?? key;
  }, []);

  // ── Core translate function ───────────────────────────
  const t = useCallback((key, vars = {}) => {
    const lang = currentLang;

    // Always English for 'en'
    if (lang === 'en') {
      const val = deepGet(en, key);
      return interpolate(typeof val === 'string' ? val : key, vars);
    }

    // Static bundle for Hindi
    if (lang === 'hi') {
      const val = deepGet(hi, key);
      const result = typeof val === 'string' ? val : deepGet(en, key) ?? key;
      return interpolate(result, vars);
    }

    // Dynamic: check in-memory cache first
    if (dynamicCache[lang]?.[key]) {
      return interpolate(dynamicCache[lang][key], vars);
    }

    // Check localStorage cache
    const [ns, ...rest] = key.split('.');
    const cached = getCached(lang, ns, rest.join('.'));
    if (cached) {
      // Warm the in-memory cache
      setDynamicCache(prev => ({
        ...prev,
        [lang]: { ...(prev[lang] || {}), [key]: cached }
      }));
      return interpolate(cached, vars);
    }

    // Not cached yet — return English fallback and trigger async fetch
    if (!pendingRef.current.has(`${lang}:${key}`)) {
      pendingRef.current.add(`${lang}:${key}`);
      // Non-blocking: will update state when done
      translateKey(lang, key);
    }

    const fallback = deepGet(en, key);
    return interpolate(typeof fallback === 'string' ? fallback : key, vars);
  }, [currentLang, dynamicCache]); // eslint-disable-line

  // ── Translate a whole namespace upfront ───────────────
  // Call this when a page mounts to pre-warm all keys
  const preloadNamespace = useCallback(async (namespace) => {
    const lang = currentLang;
    if (lang === 'en' || lang === 'hi') return;

    const nsObj = en[namespace];
    if (!nsObj) return;

    // Flatten the namespace object to key: value pairs
    const pairs = flattenObject(nsObj, namespace);
    const uncached = pairs.filter(([k]) => !dynamicCache[lang]?.[k]);
    if (uncached.length === 0) return;

    setIsTranslating(true);
    try {
      const texts = uncached.map(([, v]) => v);
      const translated = await batchTranslate(texts, lang);
      const newEntries = {};
      uncached.forEach(([k], i) => {
        if (translated[i]) {
          newEntries[k] = translated[i];
          setCache(lang, namespace, k.replace(`${namespace}.`, ''), translated[i]);
        }
      });
      setDynamicCache(prev => ({
        ...prev,
        [lang]: { ...(prev[lang] || {}), ...newEntries }
      }));
    } catch (e) {
      console.warn('[i18n] Preload failed for namespace:', namespace, e);
    } finally {
      setIsTranslating(false);
    }
  }, [currentLang, dynamicCache]);

  // ── Translate a single key async ──────────────────────
  async function translateKey(lang, key) {
    const englishText = deepGet(en, key);
    if (!englishText || typeof englishText !== 'string') return;

    try {
      const [translated] = await batchTranslate([englishText], lang);
      if (translated) {
        const [ns, ...rest] = key.split('.');
        setCache(lang, ns, rest.join('.'), translated);
        setDynamicCache(prev => ({
          ...prev,
          [lang]: { ...(prev[lang] || {}), [key]: translated }
        }));
      }
    } catch {
      // silent — fallback to English is already shown
    } finally {
      pendingRef.current.delete(`${lang}:${key}`);
    }
  }

  // ── Translate long text (for doctor's advice) ─────────
  const translateText = useCallback(async (text, targetLang) => {
    if (!text || targetLang === 'en') return text;
    try {
      const [result] = await batchTranslate([text], targetLang);
      return result || text;
    } catch {
      return text; // fallback to English
    }
  }, []);

  // ── Change language ────────────────────────────────────
  const setLanguage = useCallback(async (langCode, patientId = null) => {
    localStorage.setItem('tc_lang', langCode);
    setCurrentLangState(langCode);

    // Persist to DB if patient is logged in
    if (patientId) {
      try {
        const token = localStorage.getItem('accessToken');
        await fetch(`${process.env.REACT_APP_API_URL}/api/patients/${patientId}/language`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ language_preference: langCode }),
        });
      } catch {
        // DB save failed — localStorage is sufficient for UX
      }
    }
  }, []);

  // ── Load saved language from DB on login ──────────────
  const loadLanguagePreference = useCallback(async (patientId) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/api/patients/${patientId}/language`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.language_preference) {
        localStorage.setItem('tc_lang', data.language_preference);
        setCurrentLangState(data.language_preference);
      }
    } catch {
      // use localStorage default
    }
  }, []);

  // ── Helper: is current lang non-static? ───────────────
  const isAutoTranslated = currentLang !== 'en' && currentLang !== 'hi';

  const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === currentLang) || SUPPORTED_LANGUAGES[0];

  return (
    <I18nContext.Provider value={{
      t,
      currentLang,
      langInfo,
      setLanguage,
      loadLanguagePreference,
      isTranslating,
      isAutoTranslated,
      translateText,
      preloadNamespace,
      getEnglish,
      SUPPORTED_LANGUAGES,
    }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

// ─────────────────────────────────────────────────────────
// Translation API — LibreTranslate (free, for testing)
// Swap REACT_APP_TRANSLATE_PROVIDER=google or =deepl for prod
// ─────────────────────────────────────────────────────────
async function batchTranslate(texts, targetLang) {
  const provider = process.env.REACT_APP_TRANSLATE_PROVIDER || 'libretranslate';

  if (provider === 'libretranslate') {
    return libretranslateBatch(texts, targetLang);
  }
  if (provider === 'google') {
    return googleTranslateBatch(texts, targetLang);
  }
  // Add more providers here
  return texts; // no-op fallback
}

// ── LibreTranslate (free API for dev/testing) ─────────────
async function libretranslateBatch(texts, targetLang) {
  const apiUrl = process.env.REACT_APP_LIBRETRANSLATE_URL || 'https://libretranslate.com';
  const apiKey = process.env.REACT_APP_LIBRETRANSLATE_KEY || '';
  const ltCode = LT_LANG_MAP[targetLang] || targetLang;

  // LibreTranslate free tier: translate one string at a time
  // For prod, use a self-hosted instance which supports batch
  const results = [];
  for (const text of texts) {
    try {
      const res = await fetch(`${apiUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: 'en',
          target: ltCode,
          api_key: apiKey,
        }),
      });
      const data = await res.json();
      results.push(data.translatedText || text);
    } catch {
      results.push(text);
    }
  }
  return results;
}

// ── Google Translate (prod) ───────────────────────────────
// Backend proxy is recommended to protect API key
async function googleTranslateBatch(texts, targetLang) {
  try {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${process.env.REACT_APP_API_URL}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ texts, target: targetLang, source: 'en' }),
    });
    const data = await res.json();
    return data.translations || texts;
  } catch {
    return texts;
  }
}

// ─────────────────────────────────────────────────────────
// Utility: flatten nested object to dot-notation keys
// { register: { firstName: "First Name" } }
// → [["register.firstName", "First Name"], ...]
// ─────────────────────────────────────────────────────────
function flattenObject(obj, prefix = '') {
  const result = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      result.push([fullKey, v]);
    } else if (typeof v === 'object' && v !== null) {
      result.push(...flattenObject(v, fullKey));
    }
  }
  return result;
}
