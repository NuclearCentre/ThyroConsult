// src/services/opinionSummaryService.js
//
// AI-assisted "key findings" summary for the physician review screen.
// Deliberately produces a short bullet list of clinically relevant
// findings pulled from the patient's questionnaire answers — NOT a full
// draft opinion. The physician reads this, then writes their own
// clinical_summary/impression/advice in OpinionWriter.js; this is a
// reading aid, not a ghostwriter (explicit product decision).
//
// Reuses the same Claude client (callClaude) as translationService.js
// rather than duplicating the fetch/error-handling setup.

const { callClaude } = require('./translationService');

const CONDITION_LABELS = {
  hypothyroidism: 'Hypothyroidism',
  hyperthyroidism: 'Hyperthyroidism',
  thyroid_cancer: 'CA Thyroid (Carcinoma Thyroid)',
  nodule: 'Thyroid Nodule',
};

/**
 * formattedAnswers: [{ id, question, answer }] — same shape produced by
 * formatHypoAnswers/formatHyperAnswers.
 * conditionKey: 'hyperthyroidism' etc, used only for the label in the
 * prompt so the model doesn't need to guess the condition from context.
 * Returns a plain array of bullet-point strings (no numbering/markdown
 * bullets — the frontend renders the list, the model just supplies text).
 */
async function generateKeyFindings(formattedAnswers, conditionKey) {
  if (!Array.isArray(formattedAnswers) || !formattedAnswers.length) return [];

  const conditionLabel = CONDITION_LABELS[conditionKey] || conditionKey;
  const qaText = formattedAnswers.map(a => `${a.question}: ${a.answer}`).join('\n');

  const system = `You are assisting a thyroid specialist physician who is about to write a clinical ` +
    `opinion for a patient with suspected/known ${conditionLabel}. You will receive the patient's own ` +
    `questionnaire answers, one per line. Extract the clinically significant findings only — ignore ` +
    `entries that say "No" or "Unsure" with nothing further, and ignore purely administrative or ` +
    `demographic entries unless they carry clinical weight (e.g. pregnancy status, relevant family ` +
    `history). Do NOT invent, infer, or add any diagnosis, treatment recommendation, or interpretation ` +
    `beyond what the answers literally state. Do NOT write a summary paragraph or a draft opinion. ` +
    `Respond with ONLY a JSON array of short bullet-point strings (plain text, no markdown, no leading ` +
    `dashes or bullet characters — the frontend adds those), each stating one finding concisely in ` +
    `clinical shorthand a physician would recognise (e.g. "TSH suppressed at 0.02 mIU/L (15 Jan 2026)", ` +
    `"Palpitations x3 months, associated with exertion", "K/c/o Graves' disease, TRAb positive"). ` +
    `Order the bullets roughly by clinical priority (lab abnormalities and the primary complaint first, ` +
    `comorbidities and history later). No markdown fences, no preamble, no trailing commentary — the ` +
    `JSON array is the entire response.`;

  const raw = await callClaude(system, qaText);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned); // let this throw — caller catches and surfaces a clean error
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of findings');
  return parsed.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim());
}

module.exports = { generateKeyFindings };
