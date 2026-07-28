// src/services/notificationTemplates.js
// All notification templates for ThyroConsult
// Usage: notificationTemplates.templateName(args) → { whatsapp: { body }, email: { subject, html } }

const notificationTemplates = {

  // ── 1. Patient uploaded reports (S1) ─────────────────────────────────────
  patientReportUploaded: (patient) => ({
    whatsapp: {
      body: `Hello ${patient.name},\n\nThank you for uploading your reports on ThyroConsult. Our panel doctor will review your details and provide an online opinion within 48–72 hours.\n\nYou will be notified once the opinion is ready.\n\nThyroConsult Team`
    },
    email: {
      subject: 'Reports received — ThyroConsult',
      html: `<p>Dear ${patient.name},</p>
             <p>Thank you for uploading your reports. Our panel doctor will review your details and provide an online opinion within <strong>48–72 hours</strong>.</p>
             <p>You will receive a notification once your online opinion is ready.</p>
             <p>Regards,<br/>ThyroConsult Team</p>`
    }
  }),

  // ── 2. Doctor advised investigations ─────────────────────────────────────
  investigationsAdvised: (patient, investigations) => ({
    whatsapp: {
      body: `Hello ${patient.name},\n\nOur panel doctor has advised the following investigations for your case:\n\n${investigations.map(i => `• ${i}`).join('\n')}\n\nPlease upload the reports at your earliest convenience through your ThyroConsult patient portal.\n\nThyroConsult Team`
    },
    email: {
      subject: 'Investigations advised — ThyroConsult',
      html: `<p>Dear ${patient.name},</p>
             <p>Our panel doctor has advised the following investigations for your case:</p>
             <ul>${investigations.map(i => `<li>${i}</li>`).join('')}</ul>
             <p>Please upload the reports through your patient portal at your earliest convenience.</p>
             <p>Regards,<br/>ThyroConsult Team</p>`
    }
  }),

  // ── 3. Doctor notified — patient uploaded investigation reports ───────────
  patientNotifiedDoctor: (doctor, patient) => ({
    whatsapp: {
      body: `Dear ${doctor.name},\n\nPatient ${patient.name} has uploaded the advised investigation reports on ThyroConsult. Please log in to review the reports.\n\nThyroConsult Team`
    },
    email: {
      subject: `Investigation reports uploaded — ${patient.name} — ThyroConsult`,
      html: `<p>Dear ${doctor.name},</p>
             <p>Patient <strong>${patient.name}</strong> has uploaded the advised investigation reports. Please log in to your physician portal to review them.</p>
             <p>Regards,<br/>ThyroConsult Team</p>`
    }
  }),

  // ── 4. Doctor notified — follow-up submitted ─────────────────────────────
  followUpSubmittedToDoctor: (doctor, patient) => ({
    whatsapp: {
      body: `Dear ${doctor.name},\n\nA follow-up submission from patient ${patient.name} is awaiting your review on ThyroConsult. Please log in to your physician portal.\n\nThyroConsult Team`
    },
    email: {
      subject: `Follow-up submission awaiting review — ${patient.name} — ThyroConsult`,
      html: `<p>Dear ${doctor.name},</p>
             <p>Patient <strong>${patient.name}</strong> has submitted a follow-up visit. Please log in to review it.</p>
             <p>Regards,<br/>ThyroConsult Team</p>`
    }
  }),

  // ── 5. Patient notified — follow-up review complete ──────────────────────
  followUpReviewComplete: (patient) => ({
    whatsapp: {
      body: `Hello ${patient.name},\n\nOur panel doctor has reviewed your follow-up submission and the assessment is now available in your ThyroConsult patient portal.\n\nThyroConsult Team`
    },
    email: {
      subject: 'Follow-up review complete — ThyroConsult',
      html: `<p>Dear ${patient.name},</p>
             <p>Our panel doctor has reviewed your follow-up submission. The assessment is now available in your patient portal.</p>
             <p>Regards,<br/>ThyroConsult Team</p>`
    }
  }),

  // ── 6. Payment confirmed ──────────────────────────────────────────────────
  paymentConfirmed: (patient, amount) => ({
    whatsapp: {
      body: `Hello ${patient.name},\n\nYour payment of ₹${amount} has been received. You can now proceed to fill in your medical details on ThyroConsult.\n\nThyroConsult Team`
    },
    email: {
      subject: 'Payment confirmed — ThyroConsult',
      html: `<p>Dear ${patient.name},</p>
             <p>Your payment of <strong>₹${amount}</strong> has been received. Please log in to your patient portal to fill in your medical details.</p>
             <p>Regards,<br/>ThyroConsult Team</p>`
    }
  }),

  // ── 7. Missing reports reminder ───────────────────────────────────────────
  missingReportsReminder: (patient) => ({
    whatsapp: {
      body: `Hello ${patient.name},\n\nOur panel doctor has noted that some reports are missing from your case. Please upload the missing reports through your ThyroConsult patient portal to proceed.\n\nThyroConsult Team`
    },
    email: {
      subject: 'Missing reports — action required — ThyroConsult',
      html: `<p>Dear ${patient.name},</p>
             <p>Our panel doctor has noted that some reports are missing from your case. Please log in and upload the missing reports to proceed.</p>
             <p>Regards,<br/>ThyroConsult Team</p>`
    }
  }),

  // ── 8. Patient acknowledged opinion ──────────────────────────────────────
  patientAcknowledgedOpinion: (doctor, patient) => ({
    whatsapp: {
      body: `Dear ${doctor.name},\n\nPatient ${patient.name} has acknowledged the online opinion on ThyroConsult. You may now close the episode from your physician portal.\n\nThyroConsult Team`
    },
    email: {
      subject: `Opinion acknowledged — ${patient.name} — ThyroConsult`,
      html: `<p>Dear ${doctor.name},</p>
             <p>Patient <strong>${patient.name}</strong> has acknowledged the online opinion. You may now close the episode from your physician portal.</p>
             <p>Regards,<br/>ThyroConsult Team</p>`
    }
  }),

  // ── 9. Online opinion ready (patient notification) ────────────────────────
  opinionReady: (patient) => ({
    whatsapp: {
      body: `Hello ${patient.name},\n\nGreat news! Our panel doctor has completed your online opinion on ThyroConsult. Please log in to your patient portal to read the opinion and acknowledge it.\n\nThyroConsult Team`
    },
    email: {
      subject: 'Your online opinion is ready — ThyroConsult',
      html: `<p>Dear ${patient.name},</p>
             <p>Our panel doctor has completed your <strong>online opinion</strong>. Please log in to your patient portal to read the full opinion and acknowledge it.</p>
             <p><em>Once you acknowledge, the opinion will be locked and saved permanently for your records.</em></p>
             <p>Regards,<br/>ThyroConsult Team</p>`
    }
  }),

  // ── 10. Doctor pending opinion escalation alert ───────────────────────────
  doctorPendingOpinion: (doctor, episode, stage) => {
    const stageMessages = {
      '0_24h':    'A reminder that a patient is awaiting your online opinion.',
      '24_48h_1': 'This is the first reminder — a patient has been waiting over 24 hours for your online opinion.',
      '24_48h_2': 'Second reminder — please review the pending case at your earliest convenience.',
      '24_48h_3': 'Third reminder — the patient has been waiting for over 24 hours. Please log in and submit the online opinion.',
    };

    const isLate = stage.startsWith('48_72h');
    const baseMsg = isLate
      ? `URGENT: A patient has been waiting over 48 hours for your online opinion. Please respond immediately.`
      : (stageMessages[stage] || 'A patient is awaiting your online opinion.');

    const body = `Dear ${doctor.name},\n\n${baseMsg}\n\nPatient: ${episode.patientName}\nCondition: ${episode.conditionType}\nSubmitted: ${new Date(episode.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\nPlease log in to your ThyroConsult physician portal to review and submit the online opinion.\n\nThyroConsult Team`;

    const urgencyLabel = isLate ? '⚠️ URGENT — ' : '';

    return {
      whatsapp: { body },
      email: {
        subject: `${urgencyLabel}Pending online opinion — ${episode.patientName} — ThyroConsult`,
        html: `<p>Dear ${doctor.name},</p>
               <p>${isLate ? '<strong style="color:red;">⚠️ URGENT:</strong>' : ''} ${baseMsg}</p>
               <table style="border-collapse:collapse;margin:12px 0;">
                 <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Patient</td><td>${episode.patientName}</td></tr>
                 <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Condition</td><td>${episode.conditionType}</td></tr>
                 <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Submitted at</td><td>${new Date(episode.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</td></tr>
               </table>
               <p>Please log in to your physician portal to review and submit the online opinion.</p>
               <p>Regards,<br/>ThyroConsult Team</p>`
      }
    };
  },

  // ── 11. Advise Letter ready (patient notification) ────────────────────────
  adviseLetterReady: (patient) => ({
    whatsapp: {
      body: `Hello ${patient.name},\n\nYour Advise Letter from our panel doctor is now ready on ThyroConsult. Please log in to your patient portal to download it.\n\nThyroConsult Team`
    },
    email: {
      subject: 'Your Advise Letter is ready for download — ThyroConsult',
      html: `<p>Dear ${patient.name},</p>
             <p>Your <strong>Advise Letter</strong> from our panel doctor is now ready. Please log in to your patient portal to download it.</p>
             <p>You can find the download button on your episode page under <em>Online Opinion</em>.</p>
             <p>Regards,<br/>ThyroConsult Team</p>`
    }
  }),

};

module.exports = { notificationTemplates };
