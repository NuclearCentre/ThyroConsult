/**
 * opinionDownloadController.js
 *
 * Handles GET /api/patients/:patientId/opinions/:opinionId/download
 *
 * Request body:
 *   format   : 'en' | 'lang' | 'both'
 *   language : e.g. 'hi', 'ta', 'mr' (patient's selected language)
 *
 * PDF content:
 *   'en'   → English only (standard)
 *   'lang' → Translated language only (with disclaimer if auto-translated)
 *   'both' → English section, then translated section in same PDF
 *
 * ⚠️  Physician portal: doctors download opinions via a SEPARATE route
 *     (GET /api/doctor/opinions/:id/download) which always returns English.
 *     This controller is patient-side only.
 */

const PDFDocument = require('pdfkit');
const pool = require('../config/database');
const { translateText, getLangMeta } = require('../services/translationService');
const { decryptField } = require('../utils/encryption');

// ── PDF styling constants ──────────────────────────────────
const BRAND_COLOR = '#072654';
const ACCENT_COLOR = '#1a5fb4';
const PAGE_MARGIN = 50;

/**
 * Download opinion as PDF in selected format
 */
async function downloadOpinionPDF(req, res) {
  const { patientId, opinionId } = req.params;
  const { format = 'both', language = 'en' } = req.body;

  // Ensure the requesting patient matches the patientId
  if (req.user.id !== patientId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    // ── Fetch opinion from DB ────────────────────────────
    const opinionQuery = `
      SELECT
        o.id,
        o.opinion_text_en,
        o.created_at AS opinion_date,
        d.first_name  AS doc_first,
        d.last_name   AS doc_last,
        d.registration_number,
        d.specialization,
        p.first_name  AS pat_first,
        p.middle_name AS pat_middle,
        p.last_name   AS pat_last,
        p.dob,
        p.gender,
        p.patient_code
      FROM opinions o
      JOIN doctors d ON d.id = o.doctor_id
      JOIN patients p ON p.id = o.patient_id
      WHERE o.id = $1 AND o.patient_id = $2
    `;
    const result = await pool.query(opinionQuery, [opinionId, patientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Opinion not found' });
    }

    const row = result.rows[0];

    // Decrypt name fields
    const patName = [
      decryptField(row.pat_first),
      row.pat_middle ? decryptField(row.pat_middle) : '',
      decryptField(row.pat_last),
    ].filter(Boolean).join(' ');

    const docName = `Dr. ${decryptField(row.doc_first)} ${decryptField(row.doc_last)}`;
    const englishText = row.opinion_text_en;
    const opinionDate = new Date(row.opinion_date).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    // ── Get language metadata ────────────────────────────
    const langMeta = getLangMeta(language);

    // ── Translate if needed ──────────────────────────────
    let translatedText = null;
    if (format !== 'en' && language !== 'en') {
      translatedText = await translateText(englishText, language);
    }

    // ── Generate PDF ─────────────────────────────────────
    const pdfBuffer = await generateOpinionPDF({
      format,
      patName,
      docName,
      registration: row.registration_number,
      specialization: row.specialization,
      opinionDate,
      patientCode: row.patient_code,
      englishText,
      translatedText,
      langMeta,
    });

    // ── Send response ─────────────────────────────────────
    const langSuffix = format === 'en' ? 'EN' : format === 'lang' ? language.toUpperCase() : `EN_${language.toUpperCase()}`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ThyroConsult_Opinion_${row.patient_code}_${langSuffix}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);

  } catch (err) {
    console.error('[opinionDownload] Error:', err);
    res.status(500).json({ error: 'Failed to generate opinion PDF' });
  }
}

// ─────────────────────────────────────────────────────────
// PDF Generator
// ─────────────────────────────────────────────────────────
function generateOpinionPDF({
  format, patName, docName, registration, specialization,
  opinionDate, patientCode, englishText, translatedText, langMeta,
}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - PAGE_MARGIN * 2;

    // ── Header ─────────────────────────────────────────
    drawHeader(doc, W);

    // ── Patient info box ───────────────────────────────
    doc.moveDown(0.5);
    drawInfoBox(doc, W, {
      'Patient Name': patName,
      'Patient ID': patientCode,
      'Date of Opinion': opinionDate,
      'Specialist': `${docName} (${specialization || 'Thyroid Specialist'})`,
      'Reg. No.': registration,
    });

    // ── English section ────────────────────────────────
    if (format === 'en' || format === 'both') {
      doc.moveDown(1);
      drawSectionHeader(doc, W, 'Online Opinion — English Version', BRAND_COLOR);
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(11).fillColor('#222').text(englishText, {
        width: W,
        align: 'justify',
        lineGap: 4,
      });
    }

    // ── Translated section ─────────────────────────────
    if ((format === 'lang' || format === 'both') && translatedText) {
      if (format === 'both') {
        doc.addPage();
        drawHeader(doc, W);
        doc.moveDown(0.5);
      } else {
        doc.moveDown(1);
      }

      const sectionTitle = `Online Opinion — ${langMeta.nativeName} Version`;
      drawSectionHeader(doc, W, sectionTitle, ACCENT_COLOR);

      // Disclaimer for auto-translated languages
      if (langMeta.isAutoTranslated) {
        doc.moveDown(0.3);
        doc
          .rect(PAGE_MARGIN, doc.y, W, 30)
          .fill('#fff8dc');
        doc
          .fillColor('#7a6000')
          .fontSize(9)
          .text(
            '⚠  This is an automated translation. The English version is the official record and is legally binding.',
            PAGE_MARGIN + 8,
            doc.y - 26,
            { width: W - 16 }
          );
        doc.moveDown(1);
      }

      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(11).fillColor('#222').text(translatedText, {
        width: W,
        align: 'left',
        lineGap: 4,
      });
    }

    // ── Doctor signature block ─────────────────────────
    doc.moveDown(2);
    drawSignatureBlock(doc, W, docName, registration, opinionDate);

    // ── Footer ─────────────────────────────────────────
    drawFooter(doc);

    doc.end();
  });
}

// ─────────────────────────────────────────────────────────
// PDF Drawing Helpers
// ─────────────────────────────────────────────────────────

function drawHeader(doc, W) {
  doc
    .rect(PAGE_MARGIN - 10, 30, W + 20, 60)
    .fill(BRAND_COLOR);

  doc
    .fillColor('#ffffff')
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('ThyroConsult', PAGE_MARGIN, 48, { width: W * 0.6 });

  doc
    .fillColor('#a0c4ff')
    .fontSize(10)
    .font('Helvetica')
    .text('Online Thyroid Opinion Platform', PAGE_MARGIN, 72, { width: W * 0.6 });

  doc
    .fillColor('#ffffff')
    .fontSize(9)
    .text('ONLINE OPINION REPORT', PAGE_MARGIN + W * 0.6, 55, {
      width: W * 0.4,
      align: 'right',
    });

  doc.y = 110;
}

function drawInfoBox(doc, W, fields) {
  const startY = doc.y;
  const rowH = 18;
  const boxH = Object.keys(fields).length * rowH + 16;

  doc.rect(PAGE_MARGIN, startY, W, boxH).fill('#f4f6fa');
  doc.rect(PAGE_MARGIN, startY, W, boxH).stroke('#d0d8e8');

  let y = startY + 10;
  for (const [label, value] of Object.entries(fields)) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#444').text(label + ':', PAGE_MARGIN + 10, y, { width: 120, continued: false });
    doc.fontSize(9).font('Helvetica').fillColor('#111').text(value || '—', PAGE_MARGIN + 135, y, { width: W - 145 });
    y += rowH;
  }

  doc.y = startY + boxH + 6;
}

function drawSectionHeader(doc, W, title, color) {
  doc
    .rect(PAGE_MARGIN, doc.y, W, 26)
    .fill(color);
  doc
    .fillColor('#ffffff')
    .fontSize(11)
    .font('Helvetica-Bold')
    .text(title, PAGE_MARGIN + 10, doc.y - 21, { width: W - 20 });
  doc.y += 6;
}

function drawSignatureBlock(doc, W, docName, regNo, date) {
  const x = PAGE_MARGIN + W * 0.55;
  const y = doc.y;

  doc.moveTo(x, y).lineTo(x + W * 0.4, y).stroke('#999');
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(docName, x, y + 5, { width: W * 0.4 });
  doc.fontSize(9).font('Helvetica').fillColor('#555').text(`Reg. No: ${regNo || '—'}`, x, y + 18, { width: W * 0.4 });
  doc.fontSize(9).fillColor('#555').text(`Date: ${date}`, x, y + 30, { width: W * 0.4 });
}

function drawFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 30;
    doc
      .moveTo(PAGE_MARGIN, bottom - 10)
      .lineTo(doc.page.width - PAGE_MARGIN, bottom - 10)
      .stroke('#e0e0e0');
    doc
      .fontSize(8)
      .fillColor('#aaa')
      .text(
        'ThyroConsult — This online opinion is based solely on submitted reports and does not substitute an in-person medical consultation.',
        PAGE_MARGIN,
        bottom - 5,
        { width: doc.page.width - PAGE_MARGIN * 2, align: 'center' }
      );
    doc
      .text(`Page ${i + 1} of ${range.count}`, PAGE_MARGIN, bottom + 8, {
        width: doc.page.width - PAGE_MARGIN * 2,
        align: 'center',
      });
  }
}

module.exports = { downloadOpinionPDF };
