// src/services/adviseLetterService.js
// Generates the ThyroConsult Advise Letter PDF using pdfkit
// Returns a Buffer — no disk write

const PDFDocument = require('pdfkit');

// ─── Colour palette ───────────────────────────────────────────────────────
const BRAND_BLUE   = '#1a56a0';
const BRAND_LIGHT  = '#e8f0fb';
const TEXT_DARK    = '#1a1a2e';
const TEXT_MID     = '#4a4a6a';
const TEXT_LIGHT   = '#7a7a9a';
const RULE_COLOUR  = '#ccd9f0';

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
}

function formatDateShort(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
}

function hRule(doc, y, colour = RULE_COLOUR) {
  doc.moveTo(50, y).lineTo(545, y).strokeColor(colour).lineWidth(0.5).stroke();
}

function sectionHeading(doc, text, y) {
  doc
    .rect(50, y, 495, 22)
    .fill(BRAND_LIGHT);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(BRAND_BLUE)
    .text(text.toUpperCase(), 58, y + 6);
  return y + 26;
}

function bodyText(doc, text, y, options = {}) {
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(TEXT_DARK)
    .text(text || '—', 58, y, { width: 479, lineGap: 3, ...options });
  return doc.y + 6;
}

// ─── Main generator ───────────────────────────────────────────────────────

/**
 * generateAdviseLetter({ patient, doctor, opinion, episode })
 *
 * patient : { name, age, sex, phone, email, guardianName? }
 * doctor  : { name, qualification, registrationNumber }
 * opinion : { clinicalSummary, impression, advice, investigations[], remarks, submittedAt }
 * episode : { conditionType, episodeId }
 *
 * Returns: Promise<Buffer>
 */
function generateAdviseLetter({ patient, doctor, opinion, episode }) {
  return new Promise((resolve, reject) => {
    try {
      const doc    = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      const chunks = [];
      doc.on('data',  chunk => chunks.push(chunk));
      doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
      doc.on('error', err   => reject(err));

      const pageW = 595.28;
      const pageH = 841.89;
      let y = 50;

      // ── Header band ──────────────────────────────────────────────────
      doc.rect(0, 0, pageW, 90).fill(BRAND_BLUE);

      // Platform name
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#ffffff')
        .text('ThyroConsult', 50, 22);

      // Tagline
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#c8d8f4')
        .text('Online Thyroid Opinion Platform', 50, 48);

      // Document title (right-aligned)
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#ffffff')
        .text('ADVISE LETTER', 0, 30, { align: 'right', width: pageW - 50 });

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#c8d8f4')
        .text(`Date: ${formatDate(opinion.submittedAt || new Date())}`, 0, 48, { align: 'right', width: pageW - 50 });

      y = 110;

      // ── Patient details strip ─────────────────────────────────────────
      doc.rect(50, y, 495, 48).fill(BRAND_LIGHT);

      doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND_BLUE).text('PATIENT DETAILS', 58, y + 6);

      const patLine = [
        patient.name,
        patient.age ? `${patient.age} yrs` : null,
        patient.sex || null,
      ].filter(Boolean).join('  ·  ');

      doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text(patLine, 58, y + 18);

      if (patient.guardianName) {
        doc.font('Helvetica').fontSize(9).fillColor(TEXT_MID)
          .text(`Guardian: ${patient.guardianName}`, 58, y + 32);
      }

      // Episode ref right side
      doc.font('Helvetica').fontSize(8).fillColor(TEXT_LIGHT)
        .text(`Ref: ${episode.episodeId}`, 0, y + 38, { align: 'right', width: pageW - 50 });

      y += 58;

      // ── Condition type pill ───────────────────────────────────────────
      const conditionLabel = {
        hypothyroidism:  'Hypothyroidism',
        hyperthyroidism: 'Hyperthyroidism',
        thyroid_cancer:  'CA Thyroid',
        thyroid_nodule:  'Thyroid Nodule',
      }[episode.conditionType] || episode.conditionType || '';

      if (conditionLabel) {
        doc.roundedRect(58, y, conditionLabel.length * 6.5 + 16, 18, 9).fill('#dbeafe');
        doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND_BLUE)
          .text(conditionLabel, 66, y + 5);
        y += 26;
      }

      y += 6;
      hRule(doc, y);
      y += 10;

      // ── Section 1: Clinical Summary ───────────────────────────────────
      y = sectionHeading(doc, '1.  Clinical Summary', y);
      y += 4;
      y = bodyText(doc, opinion.clinicalSummary, y);
      y += 8;

      // ── Section 2: Impression / Diagnosis ────────────────────────────
      y = sectionHeading(doc, '2.  Impression / Diagnosis', y);
      y += 4;
      y = bodyText(doc, opinion.impression, y);
      y += 8;

      // ── Section 3: Advice ─────────────────────────────────────────────
      y = sectionHeading(doc, '3.  Advice', y);
      y += 4;
      y = bodyText(doc, opinion.advice, y);
      y += 8;

      // ── Section 4: Advised Investigations ────────────────────────────
      const investigations = opinion.investigations || [];
      y = sectionHeading(doc, '4.  Advised Investigations', y);
      y += 4;

      if (investigations.length === 0) {
        y = bodyText(doc, 'No investigations advised at this time.', y);
      } else {
        // Group by category
        const grouped = {};
        for (const inv of investigations) {
          const cat = inv.category || 'Other';
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(inv);
        }

        for (const [category, items] of Object.entries(grouped)) {
          // Check page space
          if (y > pageH - 120) { doc.addPage(); y = 50; }

          doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MID)
            .text(category, 58, y);
          y = doc.y + 3;

          for (const item of items) {
            if (y > pageH - 100) { doc.addPage(); y = 50; }
            // Bullet
            doc.circle(66, y + 4, 2).fill(BRAND_BLUE);
            doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK)
              .text(item.name, 74, y, { width: 460 });
            if (item.note) {
              doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(TEXT_LIGHT)
                .text(`   Note: ${item.note}`, 74, doc.y, { width: 460 });
            }
            y = doc.y + 4;
          }
          y += 4;
        }
      }

      y += 4;

      // ── Section 5: Remarks (optional) ────────────────────────────────
      if (opinion.remarks && opinion.remarks.trim()) {
        if (y > pageH - 120) { doc.addPage(); y = 50; }
        y = sectionHeading(doc, '5.  Additional Remarks', y);
        y += 4;
        y = bodyText(doc, opinion.remarks, y);
        y += 8;
      }

      // ── Important notice ─────────────────────────────────────────────
      if (y > pageH - 150) { doc.addPage(); y = 50; }

      y += 4;
      hRule(doc, y);
      y += 10;

      doc.rect(50, y, 495, 42).fill('#fffbeb');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#92400e')
        .text('IMPORTANT NOTICE', 58, y + 6);
      doc.font('Helvetica').fontSize(8).fillColor('#78350f')
        .text(
          'This Advise Letter is an online opinion based on the information and reports submitted by the patient. ' +
          'It does not replace an in-person clinical examination. Please consult a physician in person for any ' +
          'emergency or if symptoms worsen.',
          58, y + 17, { width: 479 }
        );
      y += 52;

      // ── Doctor sign-off ───────────────────────────────────────────────
      if (y > pageH - 110) { doc.addPage(); y = 50; }

      y += 10;
      hRule(doc, y);
      y += 14;

      doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK)
        .text(`Dr. ${doctor.name}`, 58, y);
      y = doc.y + 3;

      if (doctor.qualification) {
        doc.font('Helvetica').fontSize(9).fillColor(TEXT_MID)
          .text(doctor.qualification, 58, y);
        y = doc.y + 3;
      }

      if (doctor.registrationNumber) {
        doc.font('Helvetica').fontSize(9).fillColor(TEXT_LIGHT)
          .text(`Reg. No.: ${doctor.registrationNumber}`, 58, y);
        y = doc.y + 3;
      }

      doc.font('Helvetica').fontSize(9).fillColor(TEXT_LIGHT)
        .text(`Date: ${formatDate(opinion.submittedAt || new Date())}`, 58, y + 4);

      // ── Footer on every page ──────────────────────────────────────────
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.rect(0, pageH - 30, pageW, 30).fill(BRAND_BLUE);
        doc.font('Helvetica').fontSize(7.5).fillColor('#c8d8f4')
          .text(
            'ThyroConsult — Online Thyroid Opinion Platform  |  www.thyroconsult.in',
            50, pageH - 20, { width: pageW - 100, align: 'left' }
          );
        doc.font('Helvetica').fontSize(7.5).fillColor('#c8d8f4')
          .text(
            `Page ${i + 1} of ${totalPages}`,
            0, pageH - 20, { width: pageW - 50, align: 'right' }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateAdviseLetter };
