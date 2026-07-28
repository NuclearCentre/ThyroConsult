// ============================================================
// Full path:
//   thyroconsult-backend\src\services\notificationService.js
//
// Provider-agnostic notification service.
// Swap providers by changing .env — no code changes needed.
//
// WhatsApp providers supported (set WHATSAPP_PROVIDER in .env):
//   'twilio'    — Twilio WhatsApp API (default)
//   'meta'      — Meta Cloud API directly
//   'wati'      — WATI (WhatsApp Team Inbox)
//   'disabled'  — silently skip all WhatsApp sends
//
// Email providers supported (set EMAIL_PROVIDER in .env):
//   'nodemailer' — any SMTP (Gmail, Outlook, custom) (default)
//   'sendgrid'   — SendGrid API
//   'ses'        — AWS SES
//   'disabled'   — silently skip all email sends
//
// Required .env variables per provider — see PROVIDER SETUP
// section below for the full list.
//
// Install:
//   npm install nodemailer twilio        (basic setup)
//   npm install @sendgrid/mail           (if using SendGrid)
//   npm install @aws-sdk/client-ses      (if using AWS SES)
// ============================================================

// ─── PROVIDER SETUP (add to your .env file) ──────────────────
//
// WhatsApp — Twilio:
//   WHATSAPP_PROVIDER=twilio
//   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   TWILIO_AUTH_TOKEN=your_auth_token
//   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
//
// WhatsApp — Meta Cloud API:
//   WHATSAPP_PROVIDER=meta
//   META_WA_PHONE_NUMBER_ID=your_phone_number_id
//   META_WA_ACCESS_TOKEN=your_permanent_access_token
//
// WhatsApp — WATI:
//   WHATSAPP_PROVIDER=wati
//   WATI_API_URL=https://live-server-XXXX.wati.io
//   WATI_API_TOKEN=your_wati_api_token
//
// Email — Nodemailer / SMTP:
//   EMAIL_PROVIDER=nodemailer
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=587
//   SMTP_SECURE=false
//   SMTP_USER=your@gmail.com
//   SMTP_PASS=your_app_password
//   EMAIL_FROM="ThyroConsult <noreply@thyroconsult.in>"
//
// Email — SendGrid:
//   EMAIL_PROVIDER=sendgrid
//   SENDGRID_API_KEY=SG.xxxxxxxx
//   EMAIL_FROM=noreply@thyroconsult.in
//
// Email — AWS SES:
//   EMAIL_PROVIDER=ses
//   AWS_REGION=ap-south-1
//   AWS_ACCESS_KEY_ID=your_key
//   AWS_SECRET_ACCESS_KEY=your_secret
//   EMAIL_FROM=noreply@thyroconsult.in
// ─────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// WHATSAPP ADAPTERS
// ══════════════════════════════════════════════════════════════

async function sendWhatsAppTwilio(to, message) {
  const twilio = require('twilio');
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  const toWa = to.startsWith('whatsapp:') ? to : `whatsapp:+91${to.replace(/\D/g, '').slice(-10)}`;
  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
    to:   toWa,
    body: message,
  });
}

async function sendWhatsAppMeta(to, message) {
  const phoneId    = process.env.META_WA_PHONE_NUMBER_ID;
  const token      = process.env.META_WA_ACCESS_TOKEN;
  const toNum      = to.replace(/\D/g, '');
  const normalized = toNum.startsWith('91') ? toNum : `91${toNum.slice(-10)}`;

  const resp = await fetch(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   normalized,
        type: 'text',
        text: { body: message },
      }),
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Meta WA API error: ${JSON.stringify(err)}`);
  }
}

async function sendWhatsAppWati(to, message) {
  const apiUrl = process.env.WATI_API_URL;
  const token  = process.env.WATI_API_TOKEN;
  const toNum  = to.replace(/\D/g, '').slice(-10);

  const resp = await fetch(
    `${apiUrl}/api/v1/sendSessionMessage/${toNum}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ messageText: message }),
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`WATI API error: ${JSON.stringify(err)}`);
  }
}

// ══════════════════════════════════════════════════════════════
// EMAIL ADAPTERS
// ══════════════════════════════════════════════════════════════

let _nodemailerTransport = null;

function getNodemailerTransport() {
  if (!_nodemailerTransport) {
    const nodemailer = require('nodemailer');
    _nodemailerTransport = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT   || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return _nodemailerTransport;
}

async function sendEmailNodemailer({ to, subject, text, html }) {
  const transport = getNodemailerTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'ThyroConsult <noreply@thyroconsult.in>',
    to,
    subject,
    text,
    html: html || undefined,
  });
}

async function sendEmailSendGrid({ to, subject, text, html }) {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  await sgMail.send({
    from:    process.env.EMAIL_FROM || 'noreply@thyroconsult.in',
    to,
    subject,
    text,
    html:    html || text,
  });
}

async function sendEmailSES({ to, subject, text, html }) {
  const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
  const client = new SESClient({ region: process.env.AWS_REGION || 'ap-south-1' });
  await client.send(new SendEmailCommand({
    Source: process.env.EMAIL_FROM || 'noreply@thyroconsult.in',
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Text: { Data: text,        Charset: 'UTF-8' },
        Html: { Data: html || text, Charset: 'UTF-8' },
      },
    },
  }));
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Send a WhatsApp message.
 * @param {string} to      — phone number (Indian 10-digit or with country code)
 * @param {string} message — message body
 */
async function sendWhatsApp(to, message) {
  const provider = (process.env.WHATSAPP_PROVIDER || 'twilio').toLowerCase();

  if (provider === 'disabled' || !to) return;

  try {
    if (provider === 'twilio')   await sendWhatsAppTwilio(to, message);
    else if (provider === 'meta') await sendWhatsAppMeta(to, message);
    else if (provider === 'wati') await sendWhatsAppWati(to, message);
    else {
      console.warn(`notificationService: unknown WHATSAPP_PROVIDER "${provider}" — message not sent`);
      return;
    }
    console.log(`WhatsApp sent via ${provider} to ${to.slice(-4).padStart(10, '*')}`);
  } catch (err) {
    // Non-fatal — log but don't crash the calling request
    console.error(`WhatsApp send failed (${provider}):`, err.message || err);
  }
}

/**
 * Send an email.
 * @param {object} opts — { to, subject, text, html? }
 */
async function sendEmail({ to, subject, text, html }) {
  const provider = (process.env.EMAIL_PROVIDER || 'nodemailer').toLowerCase();

  if (provider === 'disabled' || !to) return;

  try {
    if (provider === 'nodemailer') await sendEmailNodemailer({ to, subject, text, html });
    else if (provider === 'sendgrid') await sendEmailSendGrid({ to, subject, text, html });
    else if (provider === 'ses')      await sendEmailSES({ to, subject, text, html });
    else {
      console.warn(`notificationService: unknown EMAIL_PROVIDER "${provider}" — email not sent`);
      return;
    }
    console.log(`Email sent via ${provider} to ${to.replace(/(?<=.{3}).(?=.*@)/g, '*')}`);
  } catch (err) {
    // Non-fatal
    console.error(`Email send failed (${provider}):`, err.message || err);
  }
}

/**
 * Send both WhatsApp and email from a template result.
 * template = { subject, text, whatsapp, html? }
 * recipient = { mobile, whatsapp, email }
 */
async function notify(recipient, template) {
  const waNumber = recipient.whatsapp || recipient.mobile;
  await Promise.allSettled([
    waNumber ? sendWhatsApp(waNumber, template.whatsapp || template.text) : Promise.resolve(),
    recipient.email ? sendEmail({ to: recipient.email, subject: template.subject, text: template.text, html: template.html }) : Promise.resolve(),
  ]);
}

module.exports = { sendWhatsApp, sendEmail, notify };
