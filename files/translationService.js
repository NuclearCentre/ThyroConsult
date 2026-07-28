/**
 * translationService.js
 * Backend translation service for ThyroConsult
 *
 * Used by:
 *   - opinionService.js — translates doctor's advice text when generating patient PDFs
 *   - Any backend endpoint that needs to return translated text
 *
 * ⚠️  The physician portal NEVER calls this service for display purposes.
 *     Physicians always see and work in English.
 *
 * Translation provider is controlled by TRANSLATE_PROVIDER env var:
 *   libretranslate  → free, open-source (default for dev/testing)
 *   google          → Google Cloud Translation API (recommended for prod)
 *   deepl           → DeepL API
 */

const fetch = require('node-fetch');

// ── Language code mapping ──────────────────────────────────
// Our codes → LibreTranslate codes
const LT_LANG_MAP = {
  en: 'en', hi: 'hi', mr: 'mr', ta: 'ta', te: 'te',
  kn: 'kn', ml: 'ml', bn: 'bn', gu: 'gu', pa: 'pa', or: 'or',
};

// Our codes → Google Translate codes
const GOOGLE_LANG_MAP = {
  en: 'en', hi: 'hi', mr: 'mr', ta: 'ta', te: 'te',
  kn: 'kn', ml: 'ml', bn: 'bn', gu: 'gu', pa: 'pa', or: 'or',
};

// Language display names in English (for PDF headers)
const LANG_NAMES = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu',
  kn: 'Kannada', ml: 'Malayalam', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', or: 'Odia',
};

// Language display names in the native language (for PDF headers)
const LANG_NATIVE_NAMES = {
  en: 'English', hi: 'हिन्दी', mr: 'मराठी', ta: 'தமிழ்', te: 'తెలుగు',
  kn: 'ಕನ್ನಡ', ml: 'മലയാളം', bn: 'বাংলা', gu: 'ગુજરાતી', pa: 'ਪੰਜਾਬੀ', or: 'ଓଡ଼ିଆ',
};

// ── Static language flag (HI has manually reviewed translation) ─
const STATIC_LANGS = ['en', 'hi'];

/**
 * Translate text from English to a target language.
 * Returns the original English text if translation fails.
 *
 * @param {string} text      English text to translate
 * @param {string} targetLang  Language code (e.g. 'hi', 'ta')
 * @returns {Promise<string>}
 */
async function translateText(text, targetLang) {
  if (!text || !targetLang || targetLang === 'en') return text;

  const provider = process.env.TRANSLATE_PROVIDER || 'libretranslate';

  try {
    if (provider === 'google') {
      return await googleTranslate(text, targetLang);
    }
    if (provider === 'deepl') {
      return await deeplTranslate(text, targetLang);
    }
    // Default: LibreTranslate
    return await libreTranslate(text, targetLang);
  } catch (err) {
    console.warn('[translationService] Translation failed, returning English:', err.message);
    return text; // Graceful fallback
  }
}

/**
 * Translate multiple texts at once.
 *
 * @param {string[]} texts
 * @param {string} targetLang
 * @returns {Promise<string[]>}
 */
async function translateBatch(texts, targetLang) {
  if (!texts?.length || targetLang === 'en') return texts;

  const provider = process.env.TRANSLATE_PROVIDER || 'libretranslate';

  try {
    if (provider === 'google') {
      return await googleTranslateBatch(texts, targetLang);
    }
    // LibreTranslate and DeepL: translate one by one
    return await Promise.all(texts.map(t => translateText(t, targetLang)));
  } catch {
    return texts;
  }
}

/**
 * Get language metadata for a given language code.
 */
function getLangMeta(code) {
  return {
    code,
    name: LANG_NAMES[code] || code,
    nativeName: LANG_NATIVE_NAMES[code] || code,
    isStatic: STATIC_LANGS.includes(code),
    isAutoTranslated: !STATIC_LANGS.includes(code) && code !== 'en',
    disclaimer: code !== 'en' && !STATIC_LANGS.includes(code)
      ? 'This is an automated translation. The English version is legally binding.'
      : null,
  };
}

// ─────────────────────────────────────────────────────────
// Provider: LibreTranslate (free / dev)
// ─────────────────────────────────────────────────────────
async function libreTranslate(text, targetLang) {
  const apiUrl = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com';
  const apiKey = process.env.LIBRETRANSLATE_KEY || '';
  const ltCode = LT_LANG_MAP[targetLang] || targetLang;

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

  if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.translatedText || text;
}

// ─────────────────────────────────────────────────────────
// Provider: Google Cloud Translation (prod)
// ─────────────────────────────────────────────────────────
async function googleTranslate(text, targetLang) {
  const apiKey = process.env.GOOGLE_TRANSLATE_KEY;
  if (!apiKey) throw new Error('GOOGLE_TRANSLATE_KEY not set');

  const code = GOOGLE_LANG_MAP[targetLang] || targetLang;
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'en', target: code, format: 'text' }),
  });

  if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`);
  const data = await res.json();
  return data.data?.translations?.[0]?.translatedText || text;
}

async function googleTranslateBatch(texts, targetLang) {
  const apiKey = process.env.GOOGLE_TRANSLATE_KEY;
  if (!apiKey) throw new Error('GOOGLE_TRANSLATE_KEY not set');

  const code = GOOGLE_LANG_MAP[targetLang] || targetLang;
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, source: 'en', target: code, format: 'text' }),
  });

  if (!res.ok) throw new Error(`Google Translate batch HTTP ${res.status}`);
  const data = await res.json();
  return (data.data?.translations || []).map(t => t.translatedText);
}

// ─────────────────────────────────────────────────────────
// Provider: DeepL (prod alternative)
// ─────────────────────────────────────────────────────────
async function deeplTranslate(text, targetLang) {
  const apiKey = process.env.DEEPL_KEY;
  if (!apiKey) throw new Error('DEEPL_KEY not set');

  // DeepL uses uppercase codes with regional variants
  const deeplCode = targetLang.toUpperCase();

  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      source_lang: 'EN',
      target_lang: deeplCode,
    }),
  });

  if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`);
  const data = await res.json();
  return data.translations?.[0]?.text || text;
}

module.exports = {
  translateText,
  translateBatch,
  getLangMeta,
  LANG_NAMES,
  LANG_NATIVE_NAMES,
  STATIC_LANGS,
};
