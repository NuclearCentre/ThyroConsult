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

const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { hmacHash, generateOTP } = require('../utils/encryption');
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

/**
 * Send an OTP and store its (bcrypt-hashed) value in otp_verifications.
 * @param {string} channel     — 'sms' | 'whatsapp' | 'email'
 * @param {string} destination — decrypted mobile/whatsapp number or email
 * @param {string} purpose     — e.g. 'mobile_verify' — matches otp_purpose enum
 * @param {string} ip
 */
async function sendOTP(channel, destination, purpose, ip) {
  const otp = generateOTP(6);
  const otpHash = await bcrypt.hash(otp, 10);
  const identifier = hmacHash(destination);
  const expiresMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
  const expiresAt = new Date(Date.now() + expiresMinutes * 60000);

  await pool.query(
    `INSERT INTO otp_verifications(identifier, purpose, otp_hash, expires_at, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [identifier, purpose, otpHash, expiresAt, ip]
  );

  // No SMS gateway is wired up (only WhatsApp/email have real providers
  // above) — and for local/dev testing without live Twilio/SendGrid/etc
  // credentials, log the OTP to the server console so it's actually
  // possible to complete Step 2 without a real inbox/phone.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV OTP] ${channel} OTP for ${destination} (${purpose}): ${otp}`);
  }

  if (channel === 'whatsapp') {
    await sendWhatsApp(destination, `Your ThyroConsult verification code is ${otp}. Valid for ${expiresMinutes} minutes.`);
  } else if (channel === 'email') {
    await sendEmail({
      to: destination,
      subject: 'Your ThyroConsult verification code',
      text: `Your verification code is ${otp}. Valid for ${expiresMinutes} minutes.`,
    });
  }
  // channel === 'sms': no provider configured — dev-console log above is
  // the only delivery path until an SMS gateway is added.

  return { sent: true };
}

/**
 * Verify an OTP against the most recent unverified row for this identifier+purpose.
 * @param {string} destinationRaw — decrypted mobile/whatsapp/email (NOT the hash)
 * @param {string} purpose
 * @param {string} otp
 * @returns {{ valid: boolean, reason?: string }}
 */
async function verifyOTP(destinationRaw, purpose, otp) {
  const identifier = hmacHash(destinationRaw);

  const { rows } = await pool.query(
    `SELECT id, otp_hash, expires_at, attempts, max_attempts, verified
     FROM otp_verifications
     WHERE identifier = $1 AND purpose = $2
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose]
  );

  if (!rows.length) return { valid: false, reason: 'No OTP was requested for this contact' };
  const row = rows[0];

  if (row.verified) return { valid: false, reason: 'OTP already used' };
  if (new Date(row.expires_at) < new Date()) return { valid: false, reason: 'OTP expired' };
  if (row.attempts >= row.max_attempts) return { valid: false, reason: 'Too many incorrect attempts — request a new OTP' };

  const match = await bcrypt.compare(otp, row.otp_hash);
  if (!match) {
    await pool.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    return { valid: false, reason: 'Incorrect OTP' };
  }

  await pool.query('UPDATE otp_verifications SET verified = TRUE, verified_at = NOW() WHERE id = $1', [row.id]);
  return { valid: true };
}

module.exports = { sendWhatsApp, sendEmail, notify, sendOTP, verifyOTP };
