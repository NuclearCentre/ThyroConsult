/**
 * invoiceService.js
 * ThyroConsult — PDF Receipt Generation
 *
 * Generates a printable payment receipt after Razorpay payment.
 * Handles both adult and minor patients with correct wording per project rules.
 *
 * Usage:
 *   const { generateReceipt } = require('./invoiceService');
 *   const pdfBuffer = await generateReceipt(data);
 *
 * Install dependency (run once in backend root):
 *   npm install pdfkit
 *
 * Place this file at:
 *   thyroconsult-backend/src/services/invoiceService.js
 */

const PDFDocument = require('pdfkit');

// ── Colour palette ────────────────────────────────────────────────────────────
const COLOR = {
  teal:       '#1D9E75',
  tealDark:   '#156B52',
  tealLight:  '#E8F8F3',
  gray900:    '#111827',
  gray600:    '#4B5563',
  gray400:    '#9CA3AF',
  gray100:    '#F3F4F6',
  amber:      '#D97706',
  amberLight: '#FFFBEB',
  white:      '#FFFFFF',
};

/**
 * generateReceipt(data) → Promise<Buffer>
 *
 * @param {Object} data
 * @param {string}  data.receiptNo           - e.g. 'TC-2026-000123'
 * @param {string}  data.receiptDate         - formatted date string e.g. '02 Jun 2026'
 * @param {boolean} data.isMinor             - true if patient is under 18
 *
 * @param {string}  data.patientName         - full name with salutation
 * @param {string}  data.patientAddress      - single-line formatted address
 *
 * @param {string}  [data.guardianName]      - required when isMinor = true
 * @param {string}  [data.guardianRelation]  - e.g. 'Father', 'Mother'
 *
 * @param {string}  data.doctorName          - full name with salutation
 * @param {string}  data.doctorRegNo         - medical registration number
 *
 * @param {number}  data.opinionFee          - doctor's fee in INR
 * @param {number}  data.platformFee         - platform fee in INR
 * @param {number}  data.total               - total amount paid in INR
 *                                              (GST intentionally omitted — doctors
 *                                              are exempt from charging GST on
 *                                              online-opinion services)
 *
 * @param {string}  data.razorpayTxnId       - Razorpay payment ID
 *
 * @returns {Promise<Buffer>} PDF as a Node.js Buffer
 */
function generateReceipt(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;   // 595.28
      const MARGIN = 40;
      const CONTENT_W = W - MARGIN * 2;
      let y = 0;

      // ── Helpers ────────────────────────────────────────────────────────────

      /** Filled rounded rectangle */
      const fillRect = (x, ry, w, h, color, radius = 4) => {
        doc.save()
           .roundedRect(x, ry, w, h, radius)
           .fill(color)
           .restore();
      };

      /** Stroked rounded rectangle (no fill) */
      const strokeRect = (x, ry, w, h, color, lineWidth = 1, radius = 4) => {
        doc.save()
           .roundedRect(x, ry, w, h, radius)
           .lineWidth(lineWidth)
           .stroke(color)
           .restore();
      };

      /** Simple text helper */
      const drawText = (text, x, ty, opts = {}) => {
        const { font = 'Helvetica', size = 10, color = COLOR.gray900, align = 'left', width } = opts;
        doc.save()
           .font(font)
           .fontSize(size)
           .fillColor(color);
        const textOpts = { lineBreak: false };
        if (width) textOpts.width = width;
        if (align === 'right')  doc.text(text, x - (width || 200), ty, { ...textOpts, align: 'right', width: width || 200 });
        else if (align === 'center') doc.text(text, x, ty, { ...textOpts, align: 'center' });
        else doc.text(text, x, ty, textOpts);
        doc.restore();
      };

      /** Format INR with commas */
      const inr = (n) => `Rs.${Number(n).toLocaleString('en-IN')}`;

      // ── Header band ────────────────────────────────────────────────────────
      fillRect(0, 0, W, 90, COLOR.tealDark);

      // Logo circle
      fillRect(MARGIN, 18, 44, 44, COLOR.white, 22);
      drawText('TC', MARGIN + 22, 34, { font: 'Helvetica-Bold', size: 16, color: COLOR.tealDark, align: 'center', width: 0 });
      // override center manually since drawText center needs a width
      doc.save().font('Helvetica-Bold').fontSize(16).fillColor(COLOR.tealDark)
         .text('TC', MARGIN, 34, { width: 44, align: 'center', lineBreak: false })
         .restore();

      doc.save().font('Helvetica-Bold').fontSize(18).fillColor(COLOR.white)
         .text('ThyroConsult', MARGIN + 54, 20, { lineBreak: false }).restore();
      doc.save().font('Helvetica').fontSize(10).fillColor('#A7F3D0')
         .text('Thyroid Online Opinion Platform', MARGIN + 54, 44, { lineBreak: false }).restore();

      // Secure badge
      fillRect(W - 130, 18, 90, 22, '#0D7A59', 4);
      doc.save().font('Helvetica-Bold').fontSize(7).fillColor(COLOR.white)
         .text('SECURE & ENCRYPTED', W - 130, 25, { width: 90, align: 'center', lineBreak: false }).restore();

      y = 108;

      // ── Receipt title ──────────────────────────────────────────────────────
      doc.save().font('Helvetica-Bold').fontSize(16).fillColor(COLOR.tealDark)
         .text('PAYMENT RECEIPT', MARGIN, y, { lineBreak: false }).restore();

      doc.save().font('Helvetica-Bold').fontSize(10).fillColor(COLOR.gray600)
         .text(`Receipt No: ${data.receiptNo}`, MARGIN, y, { width: CONTENT_W, align: 'right', lineBreak: false }).restore();

      y += 16;
      doc.save().font('Helvetica').fontSize(9).fillColor(COLOR.gray400)
         .text(`Date: ${data.receiptDate}`, MARGIN, y, { width: CONTENT_W, align: 'right', lineBreak: false }).restore();

      y += 14;
      doc.save().moveTo(MARGIN, y).lineTo(W - MARGIN, y).lineWidth(1.5).stroke(COLOR.teal).restore();
      y += 16;

      // ── Minor banner ───────────────────────────────────────────────────────
      if (data.isMinor) {
        fillRect(MARGIN, y, CONTENT_W, 32, COLOR.amberLight, 4);
        strokeRect(MARGIN, y, CONTENT_W, 32, COLOR.amber, 1, 4);
        doc.save().font('Helvetica-Bold').fontSize(8).fillColor(COLOR.amber)
           .text('MINOR PATIENT', MARGIN + 10, y + 6, { lineBreak: false }).restore();
        const minorLine = `Received an amount of ${inr(data.total)} from ${data.guardianName} on behalf of ${data.patientName} for online opinion purpose.`;
        doc.save().font('Helvetica').fontSize(8).fillColor(COLOR.amber)
           .text(minorLine, MARGIN + 10, y + 18, { width: CONTENT_W - 20, lineBreak: false }).restore();
        y += 46;
      }

      // ── Two-column: Patient | Doctor ───────────────────────────────────────
      const COL_W = (CONTENT_W - 16) / 2;
      const BOX_H = 94;

      // Patient box
      fillRect(MARGIN, y, COL_W, BOX_H, COLOR.gray100, 6);
      doc.save().font('Helvetica-Bold').fontSize(8).fillColor(COLOR.tealDark)
         .text('PATIENT DETAILS', MARGIN + 10, y + 10, { lineBreak: false }).restore();
      doc.save().font('Helvetica-Bold').fontSize(11).fillColor(COLOR.gray900)
         .text(data.patientName, MARGIN + 10, y + 24, { lineBreak: false }).restore();
      let addrY = y + 38;
      if (data.isMinor) {
        doc.save().font('Helvetica-Oblique').fontSize(8).fillColor(COLOR.gray400)
           .text('(Minor patient)', MARGIN + 10, addrY, { lineBreak: false }).restore();
        addrY += 12;
      }
      doc.save().font('Helvetica').fontSize(8).fillColor(COLOR.gray600)
         .text(data.patientAddress || '', MARGIN + 10, addrY, { width: COL_W - 20, lineBreak: true }).restore();

      // Doctor box
      const docX = MARGIN + COL_W + 16;
      fillRect(docX, y, COL_W, BOX_H, COLOR.gray100, 6);
      doc.save().font('Helvetica-Bold').fontSize(8).fillColor(COLOR.tealDark)
         .text('DOCTOR DETAILS', docX + 10, y + 10, { lineBreak: false }).restore();
      doc.save().font('Helvetica-Bold').fontSize(11).fillColor(COLOR.gray900)
         .text(data.doctorName, docX + 10, y + 24, { lineBreak: false }).restore();
      doc.save().font('Helvetica').fontSize(8).fillColor(COLOR.gray600)
         .text(`Reg. No: ${data.doctorRegNo}`, docX + 10, y + 40, { lineBreak: false }).restore();
      doc.save().font('Helvetica').fontSize(8).fillColor(COLOR.gray600)
         .text('Thyroid Specialist', docX + 10, y + 52, { lineBreak: false }).restore();
      doc.save().font('Helvetica').fontSize(8).fillColor(COLOR.gray400)
         .text('ThyroConsult Platform', docX + 10, y + 64, { lineBreak: false }).restore();

      y += BOX_H + 14;

      // ── Guardian box (minor only) ──────────────────────────────────────────
      if (data.isMinor) {
        fillRect(MARGIN, y, CONTENT_W, 58, COLOR.amberLight, 6);
        strokeRect(MARGIN, y, CONTENT_W, 58, COLOR.amber, 1, 6);
        doc.save().font('Helvetica-Bold').fontSize(8).fillColor(COLOR.amber)
           .text('LEGAL GUARDIAN', MARGIN + 10, y + 10, { lineBreak: false }).restore();
        doc.save().font('Helvetica-Bold').fontSize(11).fillColor(COLOR.gray900)
           .text(data.guardianName, MARGIN + 10, y + 24, { lineBreak: false }).restore();
        doc.save().font('Helvetica').fontSize(8).fillColor(COLOR.gray600)
           .text(`Relation: ${data.guardianRelation || 'Guardian'}`, MARGIN + 10, y + 38, { lineBreak: false }).restore();
        doc.save().font('Helvetica-Oblique').fontSize(8).fillColor(COLOR.gray400)
           .text('(Paying on behalf of minor patient)', MARGIN + 10, y + 50, { lineBreak: false }).restore();
        y += 72;
      }

      // ── Fee breakdown ──────────────────────────────────────────────────────
      doc.save().font('Helvetica-Bold').fontSize(9).fillColor(COLOR.tealDark)
         .text('FEE BREAKDOWN', MARGIN, y, { lineBreak: false }).restore();
      y += 14;

      // Table header
      fillRect(MARGIN, y, CONTENT_W, 22, COLOR.teal, 3);
      doc.save().font('Helvetica-Bold').fontSize(9).fillColor(COLOR.white)
         .text('Description', MARGIN + 10, y + 6, { lineBreak: false }).restore();
      doc.save().font('Helvetica-Bold').fontSize(9).fillColor(COLOR.white)
         .text('Amount', MARGIN, y + 6, { width: CONTENT_W - 10, align: 'right', lineBreak: false }).restore();
      y += 22;

      const rows = [
        [`Online opinion - ${data.doctorName}`, data.opinionFee],
        ['Platform fee', data.platformFee],
        // GST intentionally omitted — doctors are exempt from charging GST
        // on online-opinion services.
      ];
      rows.forEach(([label, amt], i) => {
        const bg = i % 2 === 0 ? COLOR.white : COLOR.gray100;
        fillRect(MARGIN, y, CONTENT_W, 22, bg);
        doc.save().moveTo(MARGIN, y).lineTo(W - MARGIN, y).lineWidth(0.5).stroke('#E5E7EB').restore();
        doc.save().font('Helvetica').fontSize(9).fillColor(COLOR.gray900)
           .text(label, MARGIN + 10, y + 6, { lineBreak: false }).restore();
        doc.save().font('Helvetica').fontSize(9).fillColor(COLOR.gray900)
           .text(inr(amt), MARGIN, y + 6, { width: CONTENT_W - 10, align: 'right', lineBreak: false }).restore();
        y += 22;
      });

      // Total row
      fillRect(MARGIN, y, CONTENT_W, 26, COLOR.tealLight, 3);
      strokeRect(MARGIN, y, CONTENT_W, 26, COLOR.teal, 1, 3);
      doc.save().font('Helvetica-Bold').fontSize(10).fillColor(COLOR.tealDark)
         .text('TOTAL PAID', MARGIN + 10, y + 7, { lineBreak: false }).restore();
      doc.save().font('Helvetica-Bold').fontSize(12).fillColor(COLOR.tealDark)
         .text(inr(data.total), MARGIN, y + 7, { width: CONTENT_W - 10, align: 'right', lineBreak: false }).restore();
      y += 40;

      // ── Payment info ───────────────────────────────────────────────────────
      fillRect(MARGIN, y, CONTENT_W, 42, COLOR.gray100, 4);
      doc.save().font('Helvetica-Bold').fontSize(8).fillColor(COLOR.gray600)
         .text('PAYMENT INFORMATION', MARGIN + 10, y + 10, { lineBreak: false }).restore();
      doc.save().font('Helvetica').fontSize(8).fillColor(COLOR.gray600)
         .text(`Method: Razorpay  |  Transaction ID: ${data.razorpayTxnId}  |  Status: PAID`, MARGIN + 10, y + 24, { lineBreak: false }).restore();
      y += 56;

      // ── Footer ─────────────────────────────────────────────────────────────
      doc.save().moveTo(MARGIN, y).lineTo(W - MARGIN, y).lineWidth(0.5).stroke(COLOR.gray400).restore();
      y += 12;
      doc.save().font('Helvetica-Oblique').fontSize(8).fillColor(COLOR.gray400)
         .text('This is a computer-generated receipt and does not require a physical signature.', MARGIN, y, { width: CONTENT_W, align: 'center', lineBreak: false }).restore();
      y += 12;
      doc.save().font('Helvetica').fontSize(8).fillColor(COLOR.gray400)
         .text('ThyroConsult  |  Thyroid Online Opinion Platform', MARGIN, y, { width: CONTENT_W, align: 'center', lineBreak: false }).restore();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateReceipt };
