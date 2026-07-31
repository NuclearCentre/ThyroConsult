// src/services/translationService.js
//
// Wraps the Anthropic API for the platform's translation pipeline:
//   1. translateToEnglish   — patient free-text (any language) -> English,
//                              used before a physician ever sees the field.
//   2. translateOpinionToPatientLanguage — physician's English opinion
//                              (clinical_summary/impression/advice/remarks)
//      -> patient's preferred_language, translated once at submit/amend time.
//
// NOTE: if the codebase already has an Anthropic API client set up for the
// existing AI-extraction feature (see conditionController.js references to
// ai_extracted / AI report extraction), that client/key setup should be
// reused here rather than duplicated — this file assumes a fresh
// ANTHROPIC_API_KEY env var since no existing AI service file was available
// to check against.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const LANGUAGE_NAMES = {
  en: 'English',
  hi: 'Hindi',
  gu: 'Gujarati',
  mr: 'Marathi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  bn: 'Bengali',
  pa: 'Punjabi',
};

/**
 * Low-level call to Claude. Throws on any failure — callers are
 * responsible for catching and setting the appropriate status
 * ('failed' on opinions, or simply skipping the field_translations
 * entry for questionnaire free text).
 */
async function callClaude(systemPrompt, userText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error('Anthropic API returned no text content');
  }
  return textBlock.text.trim();
}

/**
 * Translate a single patient-authored free-text field into English.
 * sourceLang is the patient's preferred_language code (e.g. 'gu').
 * Returns the English string. Throws on failure — caller decides
 * whether to skip storing a field_translations entry for this field.
 */
async function translateToEnglish(text, sourceLang) {
  if (!text || !text.trim()) return '';
  if (sourceLang === 'en') return text; // nothing to do

  const sourceName = LANGUAGE_NAMES[sourceLang] || sourceLang;
  const system = `You are a medical translator for a thyroid telehealth platform. ` +
    `Translate the patient's ${sourceName} text into clear, clinically accurate English. ` +
    `This is a short patient-entered questionnaire field, not a document — output ONLY the ` +
    `translated text, no preamble, no explanation, no quotation marks.`;

  return callClaude(system, text);
}

/**
 * Translate the physician's opinion fields (all authored in English, per
 * platform rule) into the patient's preferred_language, in a single API
 * call rather than one call per field.
 *
 * fields: { clinicalSummary, impression, advice, remarks } — any may be
 *         null/undefined (remarks is optional).
 * targetLang: patient's preferred_language code.
 *
 * Returns { clinicalSummary, impression, advice, remarks } translated.
 * Throws on failure — caller (opinionController) sets translation_status
 * = 'failed' and does not block the physician's submission.
 */
async function translateOpinionToPatientLanguage(fields, targetLang) {
  const targetName = LANGUAGE_NAMES[targetLang] || targetLang;

  const system = `You are a medical translator for a thyroid telehealth platform. ` +
    `Translate the physician's English clinical opinion into clear, respectful ${targetName} ` +
    `suitable for a patient to read. Preserve medical meaning exactly — do not simplify, ` +
    `add, or omit clinical content. You will receive a JSON object with the keys ` +
    `clinical_summary, impression, advice, remarks (remarks may be null). ` +
    `Respond with ONLY a JSON object with the same four keys, translated, and null preserved ` +
    `as null. No markdown fences, no preamble.`;

  const payload = JSON.stringify({
    clinical_summary: fields.clinicalSummary ?? null,
    impression: fields.impression ?? null,
    advice: fields.advice ?? null,
    remarks: fields.remarks ?? null,
  });

  const raw = await callClaude(system, payload);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned); // let this throw — caller catches

  return {
    clinicalSummary: parsed.clinical_summary ?? null,
    impression: parsed.impression ?? null,
    advice: parsed.advice ?? null,
    remarks: parsed.remarks ?? null,
  };
}

module.exports = {
  LANGUAGE_NAMES,
  translateToEnglish,
  translateOpinionToPatientLanguage,
};
