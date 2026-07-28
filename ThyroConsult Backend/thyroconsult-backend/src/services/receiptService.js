// ============================================================
// Full path:
//   thyroconsult-backend\src\services\receiptService.js
//
// Generates PDF receipts for:
//   1. Initial online-opinion payment (from existing payments table)
//   2. Follow-up payments S1/S2/S3 (from followup_payments table)
//
// Uses: pdfkit (Node.js PDF generation)
// Install: npm install pdfkit
//
// Minor patient rule:
//   isMinor = true → "Received from [guardian] on behalf of [patient]
//                      for online opinion purpose"
//   isMinor = false → "Received from [patient] for online opinion purpose"
// ============================================================

const PDFDocument = require('pdfkit');
const path        = require('path');
const fs          = require('fs');

// ─── Brand config ────────────────────────────────────────────────────────────
const BRAND = {
  name:       'ThyroConsult',
  tagline:    'Specialist Thyroid Online Opinion Platform',
  address:    'ThyroConsult Healthcare Pvt. Ltd.',
  email:      'support@thyroconsult.in',
  website:    'www.thyroconsult.in',
  gstin:      '',          // fill in if GST registered
  primaryHex: '#185FA5',  // blue
  accentHex:  '#27ae60',  // green for "Paid" stamp
};

// ─── Condition labels ─────────────────────────────────────────────────────────
const CONDITION_LABELS = {
  hypo:   'Hypothyroidism',
  hyper:  'Hyperthyroidism',
  tc:     'CA Thyroid (Carcinoma Thyroid)',
  nodule: 'Thyroid Nodule',
};

// ─── Payment type descriptions ────────────────────────────────────────────────
const PAYMENT_TYPE_LABELS = {
  initial:      'Initial Online Opinion',
  s1_full:      'Report Upload Fee (post 14-day window)',
  s2_followup:  'Investigation Follow-up (50% rate)',
  s2_full:      'Investigation Follow-up (full fee)',
  s3_full:      'Follow-up Visit — Online Opinion',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRupees(paise) {
  const rupees = paise / 100;
  return `Rs. ${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtDateTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function generateReceiptNumber(prefix, id) {
  const short = String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
  const year  = new Date().getFullYear();
  return `${prefix}-${year}-${short}`;
}

// ─── Ensure output directory exists ──────────────────────────────────────────
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Draw header with logo text and branding ─────────────────────────────────
function drawHeader(doc) {
  const W = doc.page.width;
  const M = 50; // margin

  // Background bar
  doc.rect(0, 0, W, 90).fill('#F0F6FF');

  // Brand name
  doc.fillColor(BRAND.primaryHex)
     .font('Helvetica-Bold')
     .fontSize(22)
     .text(BRAND.name, M, 22);

  // Tagline
  doc.fillColor('#555')
     .font('Helvetica')
     .fontSize(9)
     .text(BRAND.tagline, M, 48);

  // Right side: contact
  doc.fillColor('#555')
     .font('Helvetica')
     .fontSize(8)
     .text(BRAND.email, 0, 28, { align: 'right', width: W - M })
     .text(BRAND.website, 0, 40, { align: 'right', width: W - M });

  doc.moveDown(0);
  doc.y = 100;
}

// ─── Draw "PAID" stamp ────────────────────────────────────────────────────────
function drawPaidStamp(doc) {
  const W = doc.page.width;
  doc.save();
  doc.rotate(-30, { origin: [W - 120, 200] });
  doc.rect(W - 185, 155, 130, 50)
     .lineWidth(3)
     .strokeColor(BRAND.accentHex)
     .stroke();
  doc.fillColor(BRAND.accentHex)
     .font('Helvetica-Bold')
     .fontSize(28)
     .text('PAID', W - 180, 162, { width: 120, align: 'center' });
  doc.restore();
}

// ─── Draw a section heading ───────────────────────────────────────────────────
function sectionHeading(doc, text) {
  doc.moveDown(0.5);
  doc.fillColor(BRAND.primaryHex)
     .font('Helvetica-Bold')
     .fontSize(9)
     .text(text.toUpperCase(), { characterSpacing: 0.5 });
  doc.moveTo(50, doc.y + 2)
     .lineTo(doc.page.width - 50, doc.y + 2)
     .lineWidth(0.5)
     .strokeColor('#C5D5E8')
     .stroke();
  doc.moveDown(0.3);
}

// ─── Draw a key-value row ─────────────────────────────────────────────────────
function kvRow(doc, label, value, bold = false) {
  const labelW = 180;
  const y = doc.y;
  doc.fillColor('#555')
     .font('Helvetica')
     .fontSize(9)
     .text(label, 50, y, { width: labelW });
  doc.fillColor('#111')
     .font(bold ? 'Helvetica-Bold' : 'Helvetica')
     .fontSize(9)
     .text(String(value || '—'), 50 + labelW, y, { width: 300 });
  doc.moveDown(0.4);
}

// ─── Draw fee table ───────────────────────────────────────────────────────────
function feeTable(doc, rows, totalLabel, totalValue) {
  const W   = doc.page.width;
  const M   = 50;
  const col1 = M;
  const col2 = W - M - 120;
  const colW = 120;

  // Header row
  doc.rect(M, doc.y, W - 2 * M, 20).fill('#EAF1FB');
  doc.fillColor(BRAND.primaryHex)
     .font('Helvetica-Bold')
     .fontSize(9)
     .text('Description', col1 + 4, doc.y - 16, { width: col2 - col1 - 4 });
  doc.text('Amount', col2, doc.y - 16, { width: colW, align: 'right' });
  doc.moveDown(0.3);

  // Data rows
  rows.forEach((row, i) => {
    const bg = i % 2 === 0 ? '#FAFCFF' : '#FFFFFF';
    doc.rect(M, doc.y - 2, W - 2 * M, 18).fill(bg);
    doc.fillColor('#333')
       .font('Helvetica')
       .fontSize(9)
       .text(row.label, col1 + 4, doc.y - 2, { width: col2 - col1 - 4 });
    doc.text(row.value, col2, doc.y - 2, { width: colW, align: 'right' });
    doc.moveDown(0.4);
  });

  // Total row
  doc.rect(M, doc.y - 2, W - 2 * M, 22).fill(BRAND.primaryHex);
  doc.fillColor('#FFFFFF')
     .font('Helvetica-Bold')
     .fontSize(10)
     .text(totalLabel, col1 + 4, doc.y - 2, { width: col2 - col1 - 4 });
  doc.text(totalValue, col2, doc.y - 2, { width: colW, align: 'right' });
  doc.moveDown(0.7);
}

// ─── Draw footer ─────────────────────────────────────────────────────────────
function drawFooter(doc, receiptNumber) {
  const W = doc.page.width;
  const footerY = doc.page.height - 60;

  doc.moveTo(50, footerY)
     .lineTo(W - 50, footerY)
     .lineWidth(0.5)
     .strokeColor('#C5D5E8')
     .stroke();

  doc.fillColor('#888')
     .font('Helvetica')
     .fontSize(7.5)
     .text(
       `This is a computer-generated receipt and does not require a signature. ` +
       `Receipt No: ${receiptNumber}`,
       50, footerY + 8, { width: W - 100, align: 'center' }
     )
     .text(
       `${BRAND.address} | ${BRAND.email} | ${BRAND.website}`,
       50, footerY + 20, { width: W - 100, align: 'center' }
     );

  if (BRAND.gstin) {
    doc.text(`GSTIN: ${BRAND.gstin}`, 50, footerY + 32, { width: W - 100, align: 'center' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Generate initial online-opinion receipt
// Called from patientController.downloadReceipt
//
// params:
//   payment  — row from existing `payments` table (UUID pk, appointment-based)
//   patient  — patient record (name, dob, address, guardian fields if minor)
//   doctor   — doctor record (name, specialisation)
//   appointment — appointment record (scheduled_at, condition)
//   isMinor  — boolean
//   outputPath — full path to write PDF file (optional; returns Buffer if null)
// ══════════════════════════════════════════════════════════════════════════════
function generateOpinionReceipt({ payment, patient, doctor, appointment, isMinor, outputPath }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
      Title:   'ThyroConsult — Online Opinion Receipt',
      Author:  BRAND.name,
      Subject: 'Payment Receipt',
    }});

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (outputPath) {
        ensureDir(outputPath);
        fs.writeFileSync(outputPath, buf);
      }
      resolve(buf);
    });

    const receiptNo = payment.invoice_number || generateReceiptNumber('TC', payment.id);

    // ── Header ──
    drawHeader(doc);
    drawPaidStamp(doc);

    // ── Receipt title ──
    doc.fillColor('#111')
       .font('Helvetica-Bold')
       .fontSize(14)
       .text('ONLINE OPINION RECEIPT', { align: 'center' });
    doc.fillColor('#555')
       .font('Helvetica')
       .fontSize(9)
       .text(`Receipt No: ${receiptNo}`, { align: 'center' });
    doc.moveDown(0.8);

    // ── Received from ──
    sectionHeading(doc, 'Received From');
    if (isMinor) {
      kvRow(doc, 'Received from',
        `${patient.guardian_name || 'Guardian'} on behalf of ${patient.name} (Minor)`, true);
      kvRow(doc, 'Purpose', 'Online opinion');
      kvRow(doc, 'Guardian relationship', patient.guardian_relationship || '—');
    } else {
      kvRow(doc, 'Received from', patient.name, true);
      kvRow(doc, 'Purpose', 'Online opinion');
    }
    kvRow(doc, 'Patient ID', String(patient.id).slice(0, 8).toUpperCase());
    if (patient.address_line1) {
      kvRow(doc, 'Address', [patient.address_line1, patient.city, patient.state, patient.pincode].filter(Boolean).join(', '));
    }

    // ── Appointment & doctor ──
    sectionHeading(doc, 'Online Opinion Details');
    kvRow(doc, 'Condition', CONDITION_LABELS[appointment?.condition_type] || appointment?.condition_type || '—');
    kvRow(doc, 'Physician', doctor ? `Dr. ${doctor.name}${doctor.specialisation ? ', ' + doctor.specialisation : ''}` : '—');
    kvRow(doc, 'Appointment date', fmtDate(appointment?.scheduled_at));
    kvRow(doc, 'Payment date', fmtDateTime(payment.paid_at));
    kvRow(doc, 'Payment method', payment.payment_method || 'Online (Razorpay)');
    kvRow(doc, 'Transaction ID', payment.razorpay_payment_id || payment.razorpay_order_id || '—');

    // ── Fee breakdown ──
    sectionHeading(doc, 'Fee Breakdown');
    const rows = [
      { label: 'Online opinion fee', value: fmtRupees((payment.opinion_fee || 0) * 100) },
      { label: 'Platform fee',       value: fmtRupees((payment.platform_fee || 0) * 100) },
      // GST intentionally omitted — doctors are exempt from charging GST
      // on online-opinion services.
    ];
    feeTable(doc, rows, 'Total Amount Paid', fmtRupees((payment.total_amount || 0) * 100));

    // ── Amount in words ──
    const totalRupees = Math.round(payment.total_amount || 0);
    kvRow(doc, 'Amount in words', `${rupeesInWords(totalRupees)} Only`);

    // ── Note ──
    doc.moveDown(0.5);
    doc.fillColor('#888')
       .font('Helvetica-Oblique')
       .fontSize(8)
       .text(
         'This receipt confirms payment received for an online opinion service. ' +
         'For queries, contact ' + BRAND.email,
         50, doc.y, { width: doc.page.width - 100 }
       );

    drawFooter(doc, receiptNo);
    doc.end();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Generate follow-up payment receipt
// Called from paymentController for S1/S2/S3 payments
//
// params:
//   payment   — row from `followup_payments` table
//   patient   — patient record
//   episode   — patient_condition_episodes row
//   isMinor   — boolean
//   outputPath — full path to write PDF (optional; returns Buffer if null)
// ══════════════════════════════════════════════════════════════════════════════
function generateFollowupReceipt({ payment, patient, episode, isMinor, outputPath }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
      Title:   'ThyroConsult — Follow-up Payment Receipt',
      Author:  BRAND.name,
      Subject: 'Follow-up Payment Receipt',
    }});

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (outputPath) {
        ensureDir(outputPath);
        fs.writeFileSync(outputPath, buf);
      }
      resolve(buf);
    });

    const receiptNo = generateReceiptNumber('TCF', payment.id);
    const conditionLabel = CONDITION_LABELS[payment.condition_type] || payment.condition_type;
    const paymentLabel   = PAYMENT_TYPE_LABELS[payment.payment_type] || payment.payment_type;
    const baseFeeRupees  = payment.base_fee_paise / 100;
    const paidRupees     = payment.amount_paise / 100;
    const discountRupees = baseFeeRupees - paidRupees;

    // ── Header ──
    drawHeader(doc);
    drawPaidStamp(doc);

    // ── Receipt title ──
    doc.fillColor('#111')
       .font('Helvetica-Bold')
       .fontSize(14)
       .text('ONLINE OPINION RECEIPT', { align: 'center' });
    doc.fillColor('#555')
       .font('Helvetica')
       .fontSize(9)
       .text(`Receipt No: ${receiptNo}`, { align: 'center' });
    doc.moveDown(0.8);

    // ── Received from ──
    sectionHeading(doc, 'Received From');
    if (isMinor) {
      kvRow(doc, 'Received from',
        `${patient.guardian_name || 'Guardian'} on behalf of ${patient.name} (Minor)`, true);
      kvRow(doc, 'Purpose', 'Online opinion');
      kvRow(doc, 'Guardian relationship', patient.guardian_relationship || '—');
    } else {
      kvRow(doc, 'Received from', patient.name, true);
      kvRow(doc, 'Purpose', 'Online opinion');
    }
    kvRow(doc, 'Patient ID', String(patient.id).slice(0, 8).toUpperCase());

    // ── Episode details ──
    sectionHeading(doc, 'Online Opinion Details');
    kvRow(doc, 'Condition', conditionLabel);
    kvRow(doc, 'Payment type', paymentLabel);
    kvRow(doc, 'Episode reference', String(episode.id).slice(0, 8).toUpperCase());
    kvRow(doc, 'Payment date', fmtDateTime(payment.paid_at));
    kvRow(doc, 'Payment method', 'Online (Razorpay)');
    kvRow(doc, 'Transaction ID', payment.razorpay_payment_id || payment.razorpay_order_id || '—');

    // ── Fee breakdown ──
    sectionHeading(doc, 'Fee Breakdown');
    const rows = [
      { label: 'Online opinion fee', value: fmtRupees(payment.base_fee_paise) },
    ];
    if (payment.discount_pct > 0) {
      rows.push({
        label: `Follow-up discount (${payment.discount_pct}%)`,
        value: `- ${fmtRupees(discountRupees * 100)}`,
      });
    }
    feeTable(doc, rows, 'Total Amount Paid', fmtRupees(payment.amount_paise));

    // ── Amount in words ──
    kvRow(doc, 'Amount in words', `${rupeesInWords(Math.round(paidRupees))} Only`);

    // ── Note ──
    doc.moveDown(0.5);
    doc.fillColor('#888')
       .font('Helvetica-Oblique')
       .fontSize(8)
       .text(
         'This receipt confirms follow-up payment received for an online opinion service. ' +
         'For queries, contact ' + BRAND.email,
         50, doc.y, { width: doc.page.width - 100 }
       );

    drawFooter(doc, receiptNo);
    doc.end();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER: Convert integer rupees to words (Indian numbering system)
// ══════════════════════════════════════════════════════════════════════════════
function rupeesInWords(amount) {
  if (amount === 0) return 'Zero Rupees';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
                 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
                 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
                'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertBelow100(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  }

  function convertBelow1000(n) {
    if (n < 100) return convertBelow100(n);
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertBelow100(n % 100) : '');
  }

  let result = '';
  const crore = Math.floor(amount / 10000000); amount %= 10000000;
  const lakh  = Math.floor(amount / 100000);   amount %= 100000;
  const thou  = Math.floor(amount / 1000);      amount %= 1000;
  const rem   = amount;

  if (crore) result += convertBelow100(crore)   + ' Crore ';
  if (lakh)  result += convertBelow100(lakh)    + ' Lakh ';
  if (thou)  result += convertBelow1000(thou)   + ' Thousand ';
  if (rem)   result += convertBelow1000(rem);

  return result.trim() + ' Rupees';
}

module.exports = {
  generateOpinionReceipt,
  generateFollowupReceipt,
};
