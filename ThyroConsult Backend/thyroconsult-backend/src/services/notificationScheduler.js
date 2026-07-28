// src/services/notificationScheduler.js
// Doctor alert escalation schedule for pending online opinions
//
// Schedule:
//   Immediate  — fired by paymentController at payment time (not this cron)
//   0–24 h     — once, 9am–9pm IST
//   24–48 h    — 3 times total, 9am–9pm IST
//   48–72 h    — every 2 hours, 9am–9pm IST
//   72 h+      — stop (queue already flags red)
//   Stops immediately when doctor submits opinion (alert_stopped = TRUE)
//
// Cron runs every 30 minutes so it can catch 2-hour windows accurately.
// All time-window checks are done in IST (UTC+5:30).

const cron = require('node-cron');
const db   = require('../config/database');
const { notificationService }  = require('./notificationService');
const { notificationTemplates } = require('./notificationTemplates');

// ─── IST helpers ───────────────────────────────────────────────────────────

function nowIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000);
}

function isAllowedHour() {
  const h = nowIST().getUTCHours(); // after offset, UTC hour = IST hour
  return h >= 9 && h < 21;         // 9 am – 9 pm IST
}

function hoursSince(ts) {
  return (Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60);
}

// ─── Send alert + log it ───────────────────────────────────────────────────

async function sendDoctorAlert(doctor, episode, stage) {
  const template = notificationTemplates.doctorPendingOpinion(doctor, episode, stage);
  let success = true;
  let errorMessage = null;
  try {
    await notificationService.notify(
      { phone: doctor.phone, email: doctor.email },
      template
    );
  } catch (err) {
    success = false;
    errorMessage = err.message;
    console.error(`Alert send failed [${stage}] episode ${episode.id}:`, err.message);
  }

  await db.query(
    `INSERT INTO doctor_alert_log (episode_id, doctor_id, alert_stage, channel, success, error_message)
     VALUES ($1, $2, $3, 'both', $4, $5)`,
    [episode.id, doctor.id, stage, success, errorMessage]
  );

  return success;
}

// ─── Main escalation job ───────────────────────────────────────────────────

async function runEscalation() {
  try {
    // Fetch all episodes that:
    // - have been submitted by patient
    // - opinion NOT yet submitted by doctor (alert_stopped = FALSE)
    const result = await db.query(
      `SELECT
         pce.id, pce.submitted_at,
         pce.alert_immediate_sent,
         pce.alert_0_24h_sent,
         pce.alert_24_48h_count,
         pce.alert_48_72h_count,
         pce.alert_stopped,
         pce.primary_doctor_id,
         d.first_name  AS doc_first,
         d.last_name   AS doc_last,
         d.phone       AS doc_phone,
         d.email       AS doc_email,
         p.first_name  AS pat_first,
         p.last_name   AS pat_last,
         pce.condition_type
       FROM patient_condition_episodes pce
       JOIN doctors  d ON d.id  = pce.primary_doctor_id
       JOIN patients p ON p.id  = pce.patient_id
       WHERE pce.submitted_at IS NOT NULL
         AND pce.alert_stopped  = FALSE
         AND pce.episode_closed_at IS NULL`,
      []
    );

    const allowed = isAllowedHour();

    for (const row of result.rows) {
      const hours = hoursSince(row.submitted_at);

      const doctor  = { id: row.primary_doctor_id, phone: row.doc_phone, email: row.doc_email,
                         name: `Dr. ${row.doc_first} ${row.doc_last}` };
      const episode = { id: row.id, patientName: `${row.pat_first} ${row.pat_last}`,
                         conditionType: row.condition_type, submittedAt: row.submitted_at };

      // ── Stage: 72 h+ — stop all alerts ──────────────────────────────────
      if (hours >= 72) {
        await db.query(
          `UPDATE patient_condition_episodes SET alert_stopped = TRUE WHERE id = $1`,
          [row.id]
        );
        console.log(`[Scheduler] Episode ${row.id}: 72h passed — alerts stopped`);
        continue;
      }

      // ── Stage: 48–72 h — every 2 hours, allowed window only ─────────────
      if (hours >= 48) {
        if (!allowed) continue;

        // Each run is every 30 min; fire if count < floor((hours-48)/2)+1
        const expectedCount = Math.floor((hours - 48) / 2) + 1;
        if (row.alert_48_72h_count < expectedCount) {
          await sendDoctorAlert(doctor, episode, `48_72h_${row.alert_48_72h_count + 1}`);
          await db.query(
            `UPDATE patient_condition_episodes
             SET alert_48_72h_count = alert_48_72h_count + 1
             WHERE id = $1`,
            [row.id]
          );
          console.log(`[Scheduler] Episode ${row.id}: 48–72h alert #${row.alert_48_72h_count + 1}`);
        }
        continue;
      }

      // ── Stage: 24–48 h — 3 times total, allowed window only ─────────────
      if (hours >= 24) {
        if (!allowed) continue;
        if (row.alert_24_48h_count >= 3) continue;

        // Space the 3 alerts evenly across the 24h window (~8h apart),
        // but only fire when due and within allowed hours
        const expectedCount = Math.min(3, Math.floor((hours - 24) / 8) + 1);
        if (row.alert_24_48h_count < expectedCount) {
          await sendDoctorAlert(doctor, episode, `24_48h_${row.alert_24_48h_count + 1}`);
          await db.query(
            `UPDATE patient_condition_episodes
             SET alert_24_48h_count = alert_24_48h_count + 1
             WHERE id = $1`,
            [row.id]
          );
          console.log(`[Scheduler] Episode ${row.id}: 24–48h alert #${row.alert_24_48h_count + 1}`);
        }
        continue;
      }

      // ── Stage: 0–24 h — once, allowed window only ───────────────────────
      if (hours >= 1) { // wait at least 1 hour after immediate before sending
        if (!allowed) continue;
        if (row.alert_0_24h_sent) continue;

        await sendDoctorAlert(doctor, episode, '0_24h');
        await db.query(
          `UPDATE patient_condition_episodes SET alert_0_24h_sent = TRUE WHERE id = $1`,
          [row.id]
        );
        console.log(`[Scheduler] Episode ${row.id}: 0–24h alert sent`);
        continue;
      }
    }
  } catch (err) {
    console.error('[Scheduler] Escalation job error:', err);
  }
}

// ─── Start scheduler ───────────────────────────────────────────────────────

function startNotificationScheduler() {
  // Run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Scheduler] Running doctor alert escalation check...');
    await runEscalation();
  });

  console.log('[Scheduler] Doctor alert escalation scheduler started (every 30 min)');
}

module.exports = { startNotificationScheduler, runEscalation };
