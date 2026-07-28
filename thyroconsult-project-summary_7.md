# ThyroConsult — Development Session Summary
**Date:** Wednesday, 24 June 2026  
**Repo:** https://github.com/NuclearCentre/ThyroConsult.git (branch: `main`)  
**Local path:** `D:\Thyroid Consultation Software\`

---

## Standing Rules (permanent — carry into every session)

- **"Online opinion"** everywhere — never "consultation / consult / consulted" in any UI label, button, code comment, DB value, or PDF
- **Every file given is always a complete replacement** — no partial files, no "paste this section", no manual edits ever
- **Physician portal: English only, always** — no i18n on doctor or admin portals
- **1 question per screen** in all questionnaires — no exceptions
- **Compliance wording:** Regular / Irregular / Skips sometimes — exactly these three, everywhere
- **EDD = LMP + 9 months + 7 days**
- **API signatures always 3 args:** `conditionAPI.saveHypoQ(patientId, episodeId, data)` — never `(episodeId, data)`
- **DB table is `patient_condition_episodes`** (not `episodes`); all PKs are UUID
- **Follow-up payments table is `followup_payments`** (not `payments` — existing `payments` table is appointment-based, 23 cols, UUID pk)
- **`require('../config/database')`** — not `../db`
- Always `git push` after every session

---

## Database — Current State

**PostgreSQL database:** `thyroconsult`  
**User:** `thyroconsult_user`

### All 37 tables (as of end of session)

Original 33 tables + 4 new from migration 007:

| Table | Notes |
|---|---|
| `_migrations` | |
| `admins` | UUID pk |
| `appointments` | UUID pk |
| `audit_logs` | |
| `blood_report_values` | |
| `consents` | |
| `consultations` | |
| `core_questionnaire` | |
| `doctors` | UUID pk |
| `documents` | |
| `hyper_atd_history` | |
| `hyper_questionnaire` | |
| `hyper_rai_history` | |
| `hyper_surgery_history` | |
| `hypo_questionnaire` | |
| `hypo_treatment_history` | |
| `lab_parameters` | |
| `notifications` | |
| `otp_verifications` | |
| `patient_condition_episodes` | UUID pk — 8 new cols added by migration 007 |
| `patient_condition_selection` | |
| `patients` | UUID pk |
| `payments` | UUID pk — appointment-based, 23 cols — DO NOT TOUCH |
| `prescriptions` | |
| `refresh_tokens` | |
| `scan_reports` | |
| `tc_questionnaire` | |
| `tc_rai_history` | |
| `tc_surgery_history` | |
| `tc_systemic_treatment` | |
| `v_consultation_stats` | view |
| `v_patient_condition_summary` | view |
| `v_platform_stats` | view |
| `condition_fees` | **NEW — migration 007** |
| `followup_payments` | **NEW — migration 007** |
| `follow_up_visits` | **NEW — migration 007** |
| `advised_investigations` | **NEW — migration 007** |

### New columns on `patient_condition_episodes` (migration 007)

`submitted_at`, `has_missing_reports`, `has_advised_investigations`, `investigation_payment_done`, `investigation_review_pending`, `followup_payment_done`, `followup_review_pending`, `patient_notified_at`

### Migration status

| Migration | File in repo | Run in DB |
|---|---|---|
| 001 | ❌ missing from repo | ✅ |
| 002 | ❌ missing from repo | ✅ |
| 003 | ❌ missing from repo | ✅ |
| 004 | ✅ | ✅ |
| 005 | ❌ missing from repo | ✅ |
| 006 | ✅ | ✅ |
| 007 | ✅ | ✅ |

> **Action needed (low priority):** Reverse-engineer migrations 001, 002, 003, 005 from the live DB so the repo has a complete migration history.

---

## Files Produced Today

### Backend — `thyroconsult-backend\`

| File | Path | Status |
|---|---|---|
| Migration 007 (v3 — corrected UUIDs) | `migrations\007_followup_payments.sql` | ✅ Run in DB |
| paymentController | `src\controllers\paymentController.js` | ✅ |
| followUpController | `src\controllers\followUpController.js` | ✅ |
| physicianController | `src\controllers\physicianController.js` | ✅ |
| receiptController | `src\controllers\receiptController.js` | ✅ |
| receiptService | `src\services\receiptService.js` | ✅ |
| notificationService | `src\services\notificationService.js` | ✅ |
| notificationTemplates | `src\services\notificationTemplates.js` | ✅ |
| routes index (complete) | `src\routes\index.js` | ✅ |

### Frontend — `thyroconsult-frontend\`

| File | Path | Status |
|---|---|---|
| api/index.js (complete) | `src\api\index.js` | ✅ |
| TcQuestionnaire | `src\components\TcQuestionnaire.js` | ✅ |
| NoduleQuestionnaire | `src\components\NoduleQuestionnaire.js` | ✅ |
| PatientDashboard | `src\pages\patient\PatientDashboard.js` | ✅ |
| PhysicianDashboard | `src\pages\doctor\PhysicianDashboard.js` | ✅ |
| MissingReports | `src\components\MissingReports.js` | ✅ |
| InvestigationUpload | `src\components\InvestigationUpload.js` | ✅ |
| FollowUpVisit | `src\components\FollowUpVisit.js` | ✅ |
| InvestigationReview | `src\components\physician\InvestigationReview.js` | ✅ |
| FollowUpReview | `src\components\physician\FollowUpReview.js` | ✅ |

---

## What Was Completed Today

### 1. Database — Migration 007 ✅
- **Problem discovered & fixed:** migration used `SERIAL INTEGER` PKs and referenced non-existent `episodes` and `users` tables. Actual DB uses UUID PKs throughout; episodes table is `patient_condition_episodes`; users are `admins`/`doctors`.
- **Also fixed:** `payments` table collision — existing `payments` is appointment-based. Follow-up payments renamed to `followup_payments` throughout.
- Created 4 new tables, 8 new columns on `patient_condition_episodes`. All verified in pgAdmin.

### 2. TcQuestionnaire (CA Thyroid) ✅
- **1,489 lines, 34/34 audit checks passed**
- Brand colour: `#d35400` (burnt orange)
- Page order: A → D5a/D5b (imaging/FNAC before E) → E1–E11 → B → C → D1–D7 → F1–F24 → G1–G2 → H1–H9
- Tc-prefixed UI primitives
- Unified H module (same as Hypo & Hyper)
- C4a (thyroid family history) + C4b (MEN/FNMTC syndromes) both included
- All gender/hysterectomy/menopause skip rules
- E4 neck dissection gated by surgery actually being done

### 3. NoduleQuestionnaire (Thyroid Nodule) ✅
- **1,607 lines, 45/46 audit checks passed** (1 false positive — string quote style)
- Brand colour: `#534AB7` (purple)
- **TSH branch at Q13 (critical routing point):**
  - TSH > upper ref → `onComplete({ switchToHypo: true })`
  - TSH < lower ref → `onComplete({ switchToHyper: true })`
  - TSH normal → continue Q14–Q48
- Page order: A → E (discovery) → I (plan/concern) → D (TSH branch) → D (labs, normal TSH only) → B → C → F (prior treatment) → G (local symptoms) → H (systemic, normal TSH only) → J
- Nodule-specific features: TIRADS category, Bethesda classification, RLN involvement alert, voice profession flag cross-reference
- Module J instead of unified H — includes radiation exposure (J7), iodine deficiency (J8), iodine medications (J9)
- Q8 (repeat USG) conditional on incidental imaging discovery + doctor consulted
- Two-step TSH branch confirmation before routing away

### 4. Receipt / PDF Invoice Generation ✅
- **`receiptService.js`** — pdfkit-based PDF generation
  - Consultation receipt (from existing `payments` table)
  - Follow-up receipt (from `followup_payments` table)
  - Branded header, diagonal PAID stamp, fee breakdown table
  - `rupeesInWords()` — Indian numbering (Lakh, Crore) — 6/6 unit tests passed
  - Minor patient rule: "Received from [Guardian] on behalf of [Patient] (Minor) for online opinion purpose"
  - Streams directly to browser — no disk write required
- **`receiptController.js`** — 3 endpoints: consultation receipt, follow-up receipt, patient invoices list
- `npm install pdfkit` — already done

### 5. Physician Portal ✅
- **`physicianController.js`** — 9 endpoints (separate from `doctorController.js` which handles appointments)
  - `getPendingWork` — pending queue grouped: investigation review / follow-up review / missing reports info
  - `getEpisodeSummary` — full episode data for physician review
  - `adviseInvestigations` — creates rows in `advised_investigations`, notifies patient
  - `getEpisodeInvestigations`, `updateInvestigation`, `deleteInvestigation`
  - `markInvestigationReviewed` — clears flag when all done
  - `getFollowUpVisit`, `reviewFollowUpVisit` — saves assessment, notifies patient
- **`PhysicianDashboard.js`** — two-queue landing page with urgency highlighting (3+ days = red)
- **`InvestigationReview.js`** — review uploaded reports, mark reviewed, add further investigations
- **`FollowUpReview.js`** — lab grid, symptom delta (Better/Same/Worse), compliance badge, medication action buttons, follow-up timeline, submit assessment

### 6. Notifications ✅
- **`notificationService.js`** — provider-agnostic adapter pattern
  - WhatsApp: `WHATSAPP_PROVIDER=twilio|meta|wati|disabled`
  - Email: `EMAIL_PROVIDER=nodemailer|sendgrid|ses|disabled`
  - `notify(recipient, template)` — sends both channels simultaneously, non-fatal errors
  - Set both to `disabled` until credentials are ready — nothing crashes
- **`notificationTemplates.js`** — 8 templates:
  1. `patientReportUploaded` — patient confirmation after S1 upload
  2. `investigationsAdvised` — patient notified when doctor advises tests
  3. `patientNotifiedDoctor` — physician notified when patient uploads investigation reports
  4. `followUpSubmittedToDoctor` — physician notified of follow-up submission
  5. `followUpReviewedByDoctor` — patient notified of physician's assessment
  6. `missingReportsReminder` — patient deadline reminder (template ready, cron needed)
  7. `paymentConfirmed` — patient payment confirmation (template ready, wire to payment flow)
  8. `investigationUploadReminder` — patient reminder to upload (template ready, cron needed)
- **All TODO markers replaced** in `followUpController.js` and `physicianController.js`

---

## Architecture Decisions Made Today

| Decision | Outcome |
|---|---|
| `doctorController` vs `physicianController` | Keep separate — doctorController = appointments/booking; physicianController = follow-up review workflow |
| Module H for CA Thyroid | Unified H module (same as Hypo & Hyper) |
| Module J for Thyroid Nodule | Use schema doc's J module (not unified H) — radiation/iodine risk factors are clinically essential |
| C4 family history for CA Thyroid | Both C4a (thyroid disease) AND C4b (MEN/FNMTC) |
| CA Thyroid page order | Schema document order: A → D5a/D5b → E → B → C → D → F → G → H |
| Notification providers | Provider-agnostic — swap via .env, no code changes |
| Receipt generation | pdfkit streaming — no disk write, no temp files |
| Partial files vs complete files | **Rule established:** always complete replacement files — never partial |

---

## ENV Variables Required (not yet set)

```env
# Razorpay (follow-up payments)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# WhatsApp — set provider then add credentials
WHATSAPP_PROVIDER=disabled         # twilio | meta | wati | disabled
# Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
# Meta: META_WA_PHONE_NUMBER_ID, META_WA_ACCESS_TOKEN
# WATI: WATI_API_URL, WATI_API_TOKEN

# Email — set provider then add credentials
EMAIL_PROVIDER=disabled            # nodemailer | sendgrid | ses | disabled
EMAIL_FROM=ThyroConsult <noreply@thyroconsult.in>
# Nodemailer: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
# SendGrid: SENDGRID_API_KEY
# SES: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
```

---

## npm Packages Installed Today

| Package | Location | Purpose |
|---|---|---|
| `pdfkit` | backend | PDF receipt generation |

---

## Pending Items — In Priority Order

### Immediate next session

1. **Security hardening**
   - Helmet.js (HTTP security headers)
   - CORS lockdown (whitelist only frontend origin)
   - Rate limiting (already has authLimiter/otpLimiter — extend to all routes)
   - Input sanitisation (express-validator already used — audit coverage)
   - SQL injection audit (all queries use parameterised — verify no raw interpolation)
   - JWT secret strength check
   - AES-256-GCM key rotation mechanism
   - HTTPS/SSL enforcement (redirect HTTP → HTTPS)

2. **Appointment scheduling calendar**
   - Doctor availability management (available slots, days off)
   - Patient-facing calendar picker
   - Double-booking prevention
   - IST timezone handling throughout

3. **Video session integration**
   - Jitsi Meet (open source, self-hostable) or Daily.co
   - Room creation on appointment confirmation
   - JWT room tokens with expiry
   - Session recording (optional)

4. **Prescription PDF generation**
   - Doctor writes prescription after consultation
   - PDF with letterhead, drug name, dose, frequency, duration
   - Digital signature placeholder
   - Download by patient from portal

5. **Deployment**
   - Target: AWS / DigitalOcean / Railway
   - Environment: Node 18+, PostgreSQL 15, SSL termination
   - PM2 process manager for backend
   - Nginx reverse proxy
   - SSL via Let's Encrypt / ACM
   - DB backup strategy

6. **HIPAA/data privacy administrative documents**
   - Business Associate Agreement template
   - Privacy Policy
   - Terms of Service
   - Data retention and deletion policy

### Backlog (lower priority)

- Notification cron jobs for reminder triggers (templates ready — need node-cron or pg_cron)
- `paymentConfirmed` notification wired to Razorpay webhook (template ready)
- Missing migrations 001, 002, 003, 005 — document from live DB
- Admin portal UI (currently only backend admin routes exist)
- Patient portal i18n — 10 Indian languages (backend translation proxy route exists)
- Lab report auto-extraction (Anthropic API — `claude-sonnet-4-6` — already planned)
- Multi-doctor support (currently single primary_doctor_id per episode)
- Audit log viewer in admin portal
- Analytics dashboard (v_platform_stats, v_consultation_stats views already exist)

---

## File Location Reference

```
thyroconsult-backend\
  migrations\
    007_followup_payments.sql
  src\
    controllers\
      authController.js
      patientController.js
      doctorController.js        ← appointments, booking, appointment payments
      adminController.js
      conditionController.js
      paymentController.js       ← follow-up payment gating (S1/S2/S3)
      followUpController.js      ← S1/S2/S3 follow-up flow
      physicianController.js     ← physician review workflow
      receiptController.js       ← PDF receipt download
    services\
      receiptService.js          ← pdfkit PDF generation
      notificationService.js     ← WhatsApp + email (provider-agnostic)
      notificationTemplates.js   ← 8 notification templates
      translationService.js      ← i18n (existing)
    routes\
      index.js                   ← single routes file (complete replacement always)
    middleware\
      auth.js
      security.js
    config\
      database.js
    utils\
      encryption.js              ← AES-256-GCM
      logger.js

thyroconsult-frontend\
  src\
    api\
      index.js                   ← single API file (complete replacement always)
    components\
      HyperQuestionnaire.js
      ConditionQuestionnaires.js ← HypoQuestionnaire + re-exports Hyper + TcQuestionnaire
      TcQuestionnaire.js         ← CA Thyroid (1489 lines)
      NoduleQuestionnaire.js     ← Thyroid Nodule (1607 lines)
      MissingReports.js          ← S1 patient component
      InvestigationUpload.js     ← S2 patient component
      FollowUpVisit.js           ← S3 patient component
      physician\
        InvestigationReview.js   ← physician investigation review
        FollowUpReview.js        ← physician follow-up review
    pages\
      patient\
        PatientDashboard.js
      doctor\
        PhysicianDashboard.js
      admin\
        (pending)
```

---

## Questionnaire Status

| Condition | Component | Lines | Audit | Brand colour |
|---|---|---|---|---|
| Hypothyroidism | `HypoQuestionnaire` (in ConditionQuestionnaires.js) | ~900 | ✅ | `#3a7bd5` blue |
| Hyperthyroidism | `HyperQuestionnaire.js` | 1,455 | ✅ | `#3a7bd5` blue |
| CA Thyroid | `TcQuestionnaire.js` | 1,489 | 34/34 ✅ | `#d35400` burnt orange |
| Thyroid Nodule | `NoduleQuestionnaire.js` | 1,607 | 45/46 ✅ | `#534AB7` purple |

---

## Follow-up Payment Scenarios

| Scenario | Trigger | Fee | Table |
|---|---|---|---|
| S1 | Missing reports, ≤14 days | Free | — |
| S1 | Missing reports, >14 days | Full fee | `followup_payments` |
| S2 | Doctor-advised investigations, ≤28 days | 50% fee | `followup_payments` |
| S2 | Doctor-advised investigations, >28 days | Full fee | `followup_payments` |
| S3 | Follow-up visit | Full fee | `followup_payments` |

---

*End of session summary — 24 June 2026*
