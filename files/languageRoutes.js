/**
 * languageRoutes.js
 *
 * Routes:
 *   PATCH /api/patients/:id/language          → save language preference to DB
 *   GET   /api/patients/:id/language          → get saved language preference
 *   POST  /api/translate                      → backend proxy for paid translation APIs
 *   POST  /api/patients/:id/opinions/:oid/download → bilingual PDF download
 *
 * Add to src/routes/index.js:
 *   const languageRoutes = require('./languageRoutes');
 *   router.use('/', languageRoutes);
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { translateBatch } = require('../services/translationService');
const { downloadOpinionPDF } = require('../controllers/opinionDownloadController');

// ── Save language preference ───────────────────────────────
router.patch('/patients/:id/language', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { language_preference } = req.body;

  // Only the patient themselves can update their language
  if (req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const VALID_LANGS = ['en','hi','mr','ta','te','kn','ml','bn','gu','pa','or'];
  if (!VALID_LANGS.includes(language_preference)) {
    return res.status(400).json({ error: 'Invalid language code' });
  }

  try {
    await pool.query(
      'UPDATE patients SET language_preference = $1, updated_at = NOW() WHERE id = $2',
      [language_preference, id]
    );
    res.json({ success: true, language_preference });
  } catch (err) {
    console.error('[languageRoutes] Save preference error:', err);
    res.status(500).json({ error: 'Failed to save language preference' });
  }
});

// ── Get language preference ────────────────────────────────
router.get('/patients/:id/language', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const result = await pool.query(
      'SELECT language_preference FROM patients WHERE id = $1',
      [id]
    );
    const lang = result.rows[0]?.language_preference || 'en';
    res.json({ language_preference: lang });
  } catch (err) {
    console.error('[languageRoutes] Get preference error:', err);
    res.status(500).json({ error: 'Failed to fetch language preference' });
  }
});

// ── Backend translation proxy (for Google/DeepL in prod) ───
// Keeps API keys server-side, never exposed to frontend
router.post('/translate', authenticateToken, async (req, res) => {
  const { texts, target, source = 'en' } = req.body;

  if (!Array.isArray(texts) || !target) {
    return res.status(400).json({ error: 'texts array and target language required' });
  }

  if (texts.length > 50) {
    return res.status(400).json({ error: 'Max 50 texts per request' });
  }

  try {
    const translations = await translateBatch(texts, target);
    res.json({ translations, source, target });
  } catch (err) {
    console.error('[languageRoutes] Translate error:', err);
    res.status(500).json({ error: 'Translation failed', translations: texts });
  }
});

// ── Bilingual opinion PDF download ─────────────────────────
router.post(
  '/patients/:patientId/opinions/:opinionId/download',
  authenticateToken,
  downloadOpinionPDF
);

module.exports = router;
