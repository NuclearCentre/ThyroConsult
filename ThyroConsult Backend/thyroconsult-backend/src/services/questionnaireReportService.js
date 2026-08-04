// ============================================================
// Full path:
//   thyroconsult-backend\src\services\questionnaireReportService.js
//
// PILOT (item 3): generates a single PDF listing every question the
// patient answered, in questionnaire page order, for physician review.
// Currently wired for Hypo only — Hyper/TC/Nodule formatters +
// wiring follow once this pilot is confirmed correct.
//
// Reuses the exact same pdfkit conventions as receiptService.js
// (brand header, section headings, footer, fonts, colors) so this
// looks like it belongs to the same document family. The small
// header/footer/section-heading helpers are duplicated here rather
// than imported, to avoid touching the working receipt code.
// ============================================================

const PDFDocument = require('pdfkit');
const { formatHypoAnswers } = require('./hypoReportFormatter');

// ─── Brand config — identical to receiptService.js ─────────────────────────
const BRAND = {
  name: 'ThyroConsult',
  tagline: 'Specialist Thyroid Online Opinion Platform',
  email: 'support@thyroconsult.in',
  website: 'www.thyroconsult.in',
  primaryHex: '#185FA5',
  accentHex: '#27ae60',
};

const CONDITION_LABELS = {
  hypothyroidism: 'Hypothyroidism',
  hyperthyroidism: 'Hyperthyroidism',
  thyroid_cancer: 'CA Thyroid (Carcinoma Thyroid)',
  nodule: 'Thyroid Nodule',
};

const MODULE_LABELS = {
  A: 'Demographics', B: 'Reproductive History', C: 'Thyroid History',
  D: 'Laboratory Investigations', E: 'Cause & Goitre', F: 'Symptoms',
  H: 'Comorbidities & Additional Notes',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function drawHeader(doc) {
  const W = doc.page.width;
  const M = 50;
  doc.rect(0, 0, W, 90).fill('#F0F6FF');
  doc.fillColor(BRAND.primaryHex).font('Helvetica-Bold').fontSize(22).text(BRAND.name, M, 22);
  doc.fillColor('#555').font('Helvetica').fontSize(9).text(BRAND.tagline, M, 48);
  doc.fillColor('#555').font('Helvetica').fontSize(8)
     .text(BRAND.email, 0, 28, { align: 'right', width: W - M })
     .text(BRAND.website, 0, 40, { align: 'right', width: W - M });
  doc.y = 100;
}

function sectionHeading(doc, text) {
  ensureSpace(doc, 40);
  doc.moveDown(0.5);
  doc.fillColor(BRAND.primaryHex).font('Helvetica-Bold').fontSize(9)
     .text(text.toUpperCase(), { characterSpacing: 0.5 });
  doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2)
     .lineWidth(0.5).strokeColor('#C5D5E8').stroke();
  doc.moveDown(0.3);
}

function drawFooter(doc, refNumber) {
  const W = doc.page.width;
  const footerY = doc.page.height - 40;
  // pdfkit auto-paginates a text() call whose target y falls inside the
  // page's bottom margin zone, even when given an explicit position —
  // confirmed by testing. Zero the margin for this one call so the
  // footer can't itself spawn a spurious trailing blank page.
  const originalBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.moveTo(50, footerY).lineTo(W - 50, footerY).lineWidth(0.5).strokeColor('#C5D5E8').stroke();
  doc.fillColor('#888').font('Helvetica').fontSize(7.5)
     .text(`Reference: ${refNumber} — Compiled from patient-submitted questionnaire responses.`,
       50, footerY + 8, { width: W - 100, align: 'center' });
  doc.page.margins.bottom = originalBottom;
}

// Ensures there's room for at least `minSpace` more points before the
// footer zone; if not, starts a new page and redraws the header.
function ensureSpace(doc, minSpace) {
  if (doc.y > doc.page.height - 70 - minSpace) {
    doc.addPage();
    drawHeader(doc);
  }
}

function kvLine(doc, label, value) {
  ensureSpace(doc, 20);
  doc.fillColor('#555').font('Helvetica').fontSize(9).text(label, 50, doc.y, { continued: true, width: 500 });
  doc.fillColor('#111').font('Helvetica-Bold').text(` ${value || '—'}`);
  doc.moveDown(0.3);
}

// One question/answer pair — bold question, regular answer below it.
// Measures actual wrapped height first so long free-text answers (e.g.
// Additional Notes) don't get a page-break estimate that's too small.
function qaBlock(doc, question, answer) {
  const width = doc.page.width - 100;
  doc.font('Helvetica-Bold').fontSize(9);
  const qHeight = doc.heightOfString(question, { width });
  doc.font('Helvetica').fontSize(9);
  const aHeight = doc.heightOfString(answer, { width });
  ensureSpace(doc, qHeight + aHeight + 12);
  doc.fillColor('#333').font('Helvetica-Bold').fontSize(9).text(question, 50, doc.y, { width });
  doc.fillColor('#111').font('Helvetica').fontSize(9).text(answer, 50, doc.y + 1, { width });
  doc.moveDown(0.6);
}

const FORMATTERS = {
  hypothyroidism: formatHypoAnswers,
  // hyperthyroidism / thyroid_cancer / nodule formatters added once
  // this pilot is confirmed correct and replicated.
};

const PAGE_MODULE = {}; // filled from hypoReportFormatter's PAGES below
try {
  const { PAGES } = require('./hypoReportFormatter');
  PAGES.forEach(p => { PAGE_MODULE[p.id] = p.id.replace(/[0-9a-z]/g, ''); });
} catch (e) { /* non-fatal */ }

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC: generate the compiled questionnaire-answers PDF
//
// params:
//   episode   — patient_condition_episodes row (needs .condition, .id)
//   patient   — { name, age, gender } (decrypted already by caller)
//   row       — the raw questionnaire row (SELECT * FROM hypo_questionnaire...)
//   outputPath — optional disk path; returns Buffer either way
// ══════════════════════════════════════════════════════════════════════════
function generateQuestionnaireReport({ episode, patient, row, outputPath }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: {
      Title: 'ThyroConsult — Patient Questionnaire Summary',
      Author: BRAND.name,
      Subject: 'Patient Questionnaire Summary',
    }});

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (outputPath) {
        const fs = require('fs'); const path = require('path');
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputPath, buf);
      }
      resolve(buf);
    });

    const formatter = FORMATTERS[episode.condition];
    if (!formatter) {
      // Condition not yet supported by this pilot — still produce a
      // valid (if minimal) PDF rather than throwing, so the caller's
      // route doesn't 500 on an unreplicated condition.
      drawHeader(doc);
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(14)
         .text('PATIENT QUESTIONNAIRE SUMMARY', { align: 'center' });
      doc.moveDown();
      doc.fillColor('#888').font('Helvetica-Oblique').fontSize(9)
         .text(`This report is not yet available for ${CONDITION_LABELS[episode.condition] || episode.condition}. Currently only Hypothyroidism is supported (pilot).`, { align: 'center' });
      drawFooter(doc, String(episode.id).slice(0, 8).toUpperCase());
      doc.end();
      return;
    }

    const answers = formatter(row);
    const refNumber = `QR-${String(episode.id).slice(0, 8).toUpperCase()}`;

    drawHeader(doc);
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(14)
       .text('PATIENT QUESTIONNAIRE SUMMARY', { align: 'center' });
    doc.fillColor('#555').font('Helvetica').fontSize(9)
       .text(`Reference: ${refNumber}`, { align: 'center' });
    doc.moveDown(0.8);

    sectionHeading(doc, 'Patient Details');
    kvLine(doc, 'Name:', patient.name);
    kvLine(doc, 'Age / Gender:', `${patient.age ?? '—'} / ${patient.gender || '—'}`);
    kvLine(doc, 'Condition:', CONDITION_LABELS[episode.condition] || episode.condition);
    kvLine(doc, 'Report generated:', fmtDate(new Date()));

    let currentModule = null;
    answers.forEach(({ id, question, answer }) => {
      const mod = PAGE_MODULE[id] || '';
      if (mod !== currentModule) {
        currentModule = mod;
        sectionHeading(doc, MODULE_LABELS[mod] || `Module ${mod}`);
      }
      qaBlock(doc, question, answer);
    });

    if (!answers.length) {
      doc.fillColor('#888').font('Helvetica-Oblique').fontSize(9)
         .text('No questionnaire answers found for this episode.');
    }

    // Footer goes on whichever page content actually ended on — do NOT
    // ensureSpace/addPage here, or a footer-sized "page break" would
    // itself create a trailing blank page under the footer.
    drawFooter(doc, refNumber);
    doc.end();
  });
}

module.exports = { generateQuestionnaireReport };
