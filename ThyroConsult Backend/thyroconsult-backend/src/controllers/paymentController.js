// ============================================================
// Full path:
//   thyroconsult-backend\src\controllers\paymentController.js
// ============================================================

const Razorpay = require('razorpay');
const crypto   = require('crypto');
const { pool } = require('../config/database');
const { notificationService }   = require('../services/notificationService');
const { notificationTemplates } = require('../services/notificationTemplates');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// patient_condition_episodes.condition stores the full-word enum values
// ('hypothyroidism' etc, from migration 002's condition_type ENUM TYPE —
// note that's a TYPE name, not this column's name, which is just
// `condition`). condition_fees.condition_type stores short codes
// ('hypo'/'hyper'/'tc'/'nodule', seeded in migration 007). These two
// never matched before this fix — only 'nodule' happened to be spelled
// the same both ways, so every hypo/hyper/tc fee lookup was throwing
// "No active fee configured for: hypothyroidism" etc.
const CONDITION_SHORT_CODE = {
  hypothyroidism: 'hypo',
  hyperthyroidism: 'hyper',
  thyroid_cancer: 'tc',
  nodule: 'nodule',
};

// ─────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────

// Days elapsed since questionnaire was submitted for this episode
// NOTE: patient_condition_episodes.submitted_at exists as a column (added
// in migration 007) but is never written to anywhere in the codebase — it
// is always NULL. The column that actually gets set when the patient
// finishes the questionnaire is questionnaire_completed_at (set in
// conditionController.js). Reading submitted_at here silently made
// getDaysElapsed() always return null, which meant resolvePayment() always
// fell through to the "full fee" branch for S1 — patients were being
// charged even inside the 14-day free window.
async function getDaysElapsed(episodeId) {
  const { rows } = await pool.query(
    `SELECT questionnaire_completed_at FROM patient_condition_episodes WHERE id = $1`,
    [episodeId]
  );
  if (!rows[0] || !rows[0].questionnaire_completed_at) return null;
  return Math.floor(
    (Date.now() - new Date(rows[0].questionnaire_completed_at).getTime()) / 86400000
  );
}

// Fetch base fee in paise for a condition type from condition_fees table
async function getBaseFee(conditionType) {
  const { rows } = await pool.query(
    `SELECT base_fee_paise FROM condition_fees
     WHERE condition_type = $1 AND is_active = TRUE`,
    [conditionType]
  );
  if (!rows[0]) throw new Error(`No active fee configured for: ${conditionType}`);
  return rows[0].base_fee_paise;
}

// Resolve payment requirement based on scenario and days elapsed.
// Returns null if no payment needed, otherwise { type, discountPct, amountPaise }
//   S1: ≤14 days → free (null) | >14 days → full fee
//   S2: ≤28 days → 50% fee    | >28 days → full fee
//   S3: always   → full fee
function resolvePayment(scenario, daysElapsed, baseFee) {
  if (scenario === 's1') {
    if (daysElapsed !== null && daysElapsed <= 14) return null;
    return { type: 's1_full', discountPct: 0, amountPaise: baseFee };
  }
  if (scenario === 's2') {
    if (daysElapsed !== null && daysElapsed <= 28) {
      return { type: 's2_followup', discountPct: 50, amountPaise: Math.round(baseFee / 2) };
    }
    return { type: 's2_full', discountPct: 0, amountPaise: baseFee };
  }
  if (scenario === 's3') {
    return { type: 's3_full', discountPct: 0, amountPaise: baseFee };
  }
  throw new Error(`Unknown scenario: ${scenario}`);
}

// Shared episode unlock — called by both webhook and verify
async function unlockEpisode(episodeId, paymentType) {
  if (paymentType === 's1_full') {
    await pool.query(
      `UPDATE patient_condition_episodes SET has_missing_reports = FALSE WHERE id = $1`,
      [episodeId]
    );
  } else if (paymentType === 's2_followup' || paymentType === 's2_full') {
    await pool.query(
      `UPDATE patient_condition_episodes SET investigation_payment_done = TRUE WHERE id = $1`,
      [episodeId]
    );
  } else if (paymentType === 's3_full') {
    await pool.query(
      `UPDATE patient_condition_episodes SET followup_payment_done = TRUE WHERE id = $1`,
      [episodeId]
    );
  }
}

// Send immediate doctor alert after payment confirmed
// Non-fatal — errors are logged but do not affect payment response
async function sendImmediateDoctorAlert(episodeId) {
  try {
    const { rows } = await pool.query(
      `SELECT
         pce.condition AS condition_type,
         pce.alert_immediate_sent,
         p.first_name  AS pat_first,
         p.last_name   AS pat_last,
         d.id          AS doctor_id,
         d.first_name  AS doc_first,
         d.last_name   AS doc_last,
         d.phone       AS doc_phone,
         d.email       AS doc_email
       FROM patient_condition_episodes pce
       JOIN patients p ON p.id  = pce.patient_id
       JOIN doctors  d ON d.id  = pce.primary_doctor_id
       WHERE pce.id = $1`,
      [episodeId]
    );

    if (!rows[0]) return;
    const row = rows[0];

    // Skip if already sent (safety guard against double-fire from verify + webhook)
    if (row.alert_immediate_sent) return;

    const doctor = {
      name:  `Dr. ${row.doc_first} ${row.doc_last}`,
      phone: row.doc_phone,
      email: row.doc_email,
    };

    const episode = {
      id:            episodeId,
      patientName:   `${row.pat_first} ${row.pat_last}`,
      conditionType: row.condition_type,
      submittedAt:   new Date(),
    };

    const template = notificationTemplates.doctorPendingOpinion(doctor, episode, 'immediate');

    await notificationService.notify(
      { phone: row.doc_phone, email: row.doc_email },
      template
    );

    // Mark sent so scheduler does not double-send
    await pool.query(
      `UPDATE patient_condition_episodes
       SET alert_immediate_sent = TRUE
       WHERE id = $1`,
      [episodeId]
    );

    // Log in doctor_alert_log
    await pool.query(
      `INSERT INTO doctor_alert_log (episode_id, doctor_id, alert_stage, channel, success)
       VALUES ($1, $2, 'immediate', 'both', TRUE)`,
      [episodeId, row.doctor_id]
    );

  } catch (err) {
    // Non-fatal — log and continue
    console.error('sendImmediateDoctorAlert error (non-fatal):', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/payments/gate-status/:episodeId
// Called by PatientDashboard on login for each active episode.
// Returns: scenario, daysElapsed, daysLeft, warningLevel,
//          paymentRequired (null = no payment needed)
// ─────────────────────────────────────────────────────────────
async function getGateStatus(req, res) {
  try {
    const { episodeId } = req.params;
    const patientId     = req.user.patientId;

    const { rows: epRows } = await pool.query(
      `SELECT id, patient_id, condition, submitted_at, status,
              has_missing_reports, has_advised_investigations,
              investigation_payment_done, followup_payment_done
       FROM patient_condition_episodes
       WHERE id = $1 AND patient_id = $2`,
      [episodeId, patientId]
    );
    if (!epRows[0]) return res.status(404).json({ error: 'Episode not found' });
    const ep = epRows[0];

    const daysElapsed = ep.submitted_at
      ? Math.floor((Date.now() - new Date(ep.submitted_at).getTime()) / 86400000)
      : null;

    // condition_fees uses short codes — translate the episode's full-word
    // condition before looking up the fee (see CONDITION_SHORT_CODE above).
    const baseFee = await getBaseFee(CONDITION_SHORT_CODE[ep.condition] || ep.condition);

    // Check for existing successful payment on this episode
    const { rows: paidRows } = await pool.query(
      `SELECT id, payment_type, amount_paise, paid_at
       FROM followup_payments
       WHERE episode_id = $1 AND status = 'paid'
       ORDER BY paid_at DESC LIMIT 1`,
      [episodeId]
    );
    const lastPaid = paidRows[0] || null;

    // Determine which scenario applies to this episode right now
    let scenario = null;
    if (ep.has_missing_reports && ep.status !== 'complete') scenario = 's1';
    else if (ep.has_advised_investigations && !ep.investigation_payment_done) scenario = 's2';
    else if (!ep.has_missing_reports && !ep.has_advised_investigations
              && !['draft','created','incomplete'].includes(ep.status)) scenario = 's3';

    let paymentRequired = null;
    let daysLeft        = null;
    let warningLevel    = null; // null | 'info' | 'warn' | 'urgent'

    if (scenario === 's1' && !lastPaid) {
      if (daysElapsed !== null && daysElapsed <= 14) {
        daysLeft        = 14 - daysElapsed;
        paymentRequired = null;
        warningLevel    = daysLeft <= 3 ? 'urgent' : 'warn';
      } else {
        paymentRequired = resolvePayment('s1', daysElapsed, baseFee);
        warningLevel    = 'urgent';
      }
    } else if (scenario === 's2' && !lastPaid) {
      paymentRequired = resolvePayment('s2', daysElapsed, baseFee);
      daysLeft        = daysElapsed !== null && daysElapsed <= 28 ? 28 - daysElapsed : 0;
      warningLevel    = daysElapsed !== null && daysElapsed <= 28 ? 'info' : 'urgent';
    } else if (scenario === 's3') {
      paymentRequired = resolvePayment('s3', daysElapsed, baseFee);
      warningLevel    = 'info';
    }

    res.json({
      episodeId,
      conditionType:  ep.condition,
      scenario,
      daysElapsed,
      daysLeft,
      baseFee,
      warningLevel,
      paymentRequired,
      lastPaid,
    });
  } catch (err) {
    console.error('getGateStatus error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/payments/create-order
// Body: { episodeId, scenario, conditionType }
// Creates a Razorpay order, saves a 'created' row to followup_payments table.
// ─────────────────────────────────────────────────────────────
async function createOrder(req, res) {
  try {
    const { episodeId, scenario, conditionType } = req.body;
    const patientId = req.user.patientId;

    // Prevent duplicate: block if already paid for this episode
    const { rows: existing } = await pool.query(
      `SELECT id FROM followup_payments WHERE episode_id = $1 AND status = 'paid'`,
      [episodeId]
    );
    if (existing[0]) {
      return res.status(409).json({ error: 'Payment already completed for this episode' });
    }

    const daysElapsed = await getDaysElapsed(episodeId);
    // conditionType arrives from the client here — normalize in case it's
    // sent as the full-word episode value rather than condition_fees'
    // short code (haven't yet confirmed which the frontend actually sends).
    const feeCode      = CONDITION_SHORT_CODE[conditionType] || conditionType;
    const baseFee      = await getBaseFee(feeCode);
    const resolved     = resolvePayment(scenario, daysElapsed, baseFee);

    // S1 within free window — no payment needed
    if (!resolved) {
      return res.json({ free: true, message: 'No payment required — within free window' });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount:   resolved.amountPaise,
      currency: 'INR',
      receipt:  `ep${episodeId}_${scenario}_${Date.now()}`,
      notes: {
        patient_id:     String(patientId),
        episode_id:     String(episodeId),
        condition_type: conditionType,
        scenario,
        payment_type:   resolved.type,
      },
    });

    // Save pending order to DB
    const { rows } = await pool.query(
      `INSERT INTO followup_payments
         (patient_id, episode_id, payment_type, condition_type,
          base_fee_paise, discount_pct, amount_paise,
          razorpay_order_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'created')
       RETURNING id`,
      [
        patientId, episodeId, resolved.type, conditionType,
        baseFee, resolved.discountPct, resolved.amountPaise, order.id,
      ]
    );

    res.json({
      orderId:     order.id,
      amountPaise: resolved.amountPaise,
      currency:    'INR',
      paymentDbId: rows[0].id,
      keyId:       process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('createOrder error:', err);
    res.status(500).json({ error: 'Could not create payment order' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/payments/verify
// Called client-side after Razorpay checkout closes.
// Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature }
// Belt-and-braces alongside webhook — safe to call even if webhook
// already marked it paid (WHERE status != 'paid' prevents double-write).
// ─────────────────────────────────────────────────────────────
async function verifyPayment(req, res) {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (razorpaySignature !== expected) {
      return res.status(400).json({ error: 'Payment verification failed — signature mismatch' });
    }

    const { rows } = await pool.query(
      `UPDATE followup_payments
       SET status              = 'paid',
           razorpay_payment_id = $1,
           razorpay_signature  = $2,
           paid_at             = NOW()
       WHERE razorpay_order_id = $3 AND status != 'paid'
       RETURNING episode_id, payment_type`,
      [razorpayPaymentId, razorpaySignature, razorpayOrderId]
    );

    if (rows[0]) {
      await unlockEpisode(rows[0].episode_id, rows[0].payment_type);
      // Fire immediate doctor alert (non-fatal — will not affect payment response)
      await sendImmediateDoctorAlert(rows[0].episode_id);
    }

    res.json({ verified: true });
  } catch (err) {
    console.error('verifyPayment error:', err);
    res.status(500).json({ error: 'Verification error' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/webhook/razorpay
// Razorpay server-to-server webhook — payment.captured event.
// No JWT auth — verified by HMAC signature instead.
// Must be registered in Razorpay dashboard with RAZORPAY_WEBHOOK_SECRET.
// ─────────────────────────────────────────────────────────────
async function handleWebhook(req, res) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body      = JSON.stringify(req.body);

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (signature !== expected) {
      console.warn('Webhook: invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (req.body.event !== 'payment.captured') {
      return res.json({ status: 'ignored' });
    }

    const payment = req.body.payload.payment.entity;

    const { rows } = await pool.query(
      `UPDATE followup_payments
       SET status              = 'paid',
           razorpay_payment_id = $1,
           paid_at             = NOW()
       WHERE razorpay_order_id = $2 AND status != 'paid'
       RETURNING episode_id, payment_type`,
      [payment.id, payment.order_id]
    );

    if (rows[0]) {
      await unlockEpisode(rows[0].episode_id, rows[0].payment_type);
      // Fire immediate doctor alert (non-fatal — alert_immediate_sent guard prevents double send)
      await sendImmediateDoctorAlert(rows[0].episode_id);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// ─────────────────────────────────────────────────────────────
// ADMIN — GET /api/admin/condition-fees
// Returns all per-condition fees for admin portal fee management.
// ─────────────────────────────────────────────────────────────
async function getConditionFees(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, condition_type, base_fee_paise,
              ROUND(base_fee_paise::numeric / 100, 2) AS base_fee_rupees,
              is_active, updated_at
       FROM condition_fees ORDER BY condition_type`
    );
    res.json(rows);
  } catch (err) {
    console.error('getConditionFees error:', err);
    res.status(500).json({ error: 'Could not fetch fees' });
  }
}

// ─────────────────────────────────────────────────────────────
// ADMIN — PUT /api/admin/condition-fees/:conditionType
// Body: { baseFeeRupees }  — admin enters ₹, stored as paise.
// ─────────────────────────────────────────────────────────────
async function updateConditionFee(req, res) {
  try {
    const { conditionType } = req.params;
    const { baseFeeRupees } = req.body;

    if (!baseFeeRupees || Number(baseFeeRupees) <= 0) {
      return res.status(400).json({ error: 'Fee must be a positive number' });
    }

    const paise = Math.round(Number(baseFeeRupees) * 100);

    await pool.query(
      `UPDATE condition_fees
       SET base_fee_paise = $1, updated_by = $2, updated_at = NOW()
       WHERE condition_type = $3`,
      [paise, req.user.id, conditionType]
    );

    res.json({
      success: true,
      conditionType,
      baseFeeRupees: Number(baseFeeRupees),
      paise,
    });
  } catch (err) {
    console.error('updateConditionFee error:', err);
    res.status(500).json({ error: 'Could not update fee' });
  }
}

module.exports = {
  getGateStatus,
  createOrder,
  verifyPayment,
  handleWebhook,
  getConditionFees,
  updateConditionFee,
};
