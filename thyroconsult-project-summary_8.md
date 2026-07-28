# ThyroConsult — Session 8 Summary
> Date: 25 June 2026 | Upload this + all previous summaries at the start of next session.

---

## Ports (unchanged)

| Service | Port |
|---|---|
| Backend | 7000 |
| Frontend | 7070 |

## Git Repository
- **Root:** `D:\Thyroid Consultation Software\ThyroConsult`
- **Branch:** `main`
- Always `cd` to repo root before any git command
- **All terminal commands: PowerShell only**

---

## What was accomplished today (Session 8)

| Task | Status |
|---|---|
| Async opinion workflow — full design decisions confirmed | ✅ Done |
| Migration 008 — `opinions`, `investigation_master`, `patient_acknowledgements`, `doctor_alert_log` | ✅ Done & verified in pgAdmin |
| Migration 009 — `advise_letter_pdf`, `advise_letter_generated_at`, `advise_letter_generated_by` on `opinions` | ✅ Done & verified in pgAdmin |
| `opinionController.js` — 10 endpoints (queue, review, draft, submit, amend, close, acknowledge, timeline, investigation master) | ✅ Done |
| `notificationScheduler.js` — doctor escalation cron (immediate → 0-24h → 3× 24-48h → 2-hourly 48-72h → stop) | ✅ Done |
| `notificationTemplates.js` — 11 templates including `opinionReady`, `doctorPendingOpinion`, `adviseLetterReady` | ✅ Done |
| `routes/index.js` — complete replacement with all opinion + advise letter routes | ✅ Done |
| `PhysicianQueue.js` — doctor queue with overdue/critical highlighting, auto-refresh | ✅ Done |
| `OpinionWriter.js` — 4-section structured opinion form + Generate Advise Letter button | ✅ Done |
| `PatientTimeline.js` — 5-step episode timeline with SLA notice | ✅ Done |
| `OpinionViewer.js` — patient reads opinion, acknowledges, downloads Advise Letter | ✅ Done |
| `api/index.js` — complete replacement with `opinionAPI`, `physicianAPI`, `adviseLetterAPI` | ✅ Done |
| `server.js` — scheduler wired in, JWT/AES strength checks, HTTPS enforcement | ✅ Done |
| `paymentController.js` — immediate doctor alert on payment confirmation | ✅ Done |
| `adviseLetterService.js` — pdfkit PDF generation (letterhead, 5 sections, footer, IST dates) | ✅ Done |
| `adviseLetterController.js` — generate, doctor download, patient download, status check | ✅ Done |
| Security hardening — auth.js naming mismatch fixed (`verifyToken`/`requireRole` added), `authorizePatientAccess` fixed to use `patient_condition_episodes`, `sessionTimeout` wired on all write routes, `authLimiter`/`otpLimiter`/`uploadLimiter` applied, `auditPhiAccess` on PHI routes | ✅ Done |
| node-cron installed | ✅ Done |
| Git push — single end-of-session push | ✅ Done |

---

## Files changed this session

### Backend (`thyroconsult-backend\src\`)

| File | Action |
|---|---|
| `controllers\opinionController.js` | NEW |
| `controllers\adviseLetterController.js` | NEW |
| `controllers\paymentController.js` | UPDATED — immediate doctor alert added |
| `services\notificationScheduler.js` | NEW |
| `services\notificationTemplates.js` | UPDATED — templates 9, 10, 11 added |
| `services\adviseLetterService.js` | NEW |
| `middleware\auth.js` | UPDATED — verifyToken/requireRole aliases, patientId fix, authorizePatientAccess fix |
| `routes\index.js` | UPDATED — all limiters wired, sessionTimeout on writes, PHI audit |
| `server.js` | UPDATED — scheduler, JWT/AES checks, HTTPS enforcement |

### Frontend (`thyroconsult-frontend\src\`)

| File | Action |
|---|---|
| `components\physician\PhysicianQueue.js` | NEW |
| `components\physician\OpinionWriter.js` | NEW |
| `components\PatientTimeline.js` | NEW |
| `components\OpinionViewer.js` | NEW |
| `api\index.js` | UPDATED — opinionAPI, physicianAPI, adviseLetterAPI added |

### Database

| Migration | Status |
|---|---|
| `008_opinion_workflow.sql` | ✅ Run & verified (4 tables) |
| `009_advise_letter.sql` | ✅ Run & verified (3 columns) |

---

## Doctor Alert Escalation Schedule (permanent rule)

| Window | Frequency | Time restriction |
|---|---|---|
| On payment | Immediate — fired by `paymentController` | Any time |
| 0–24 hours | Once | 9 am – 9 pm IST only |
| 24–48 hours | 3 times total | 9 am – 9 pm IST only |
| 48–72 hours | Every 2 hours | 9 am – 9 pm IST only |
| 72 hours+ | Stop — queue already flags red | — |

Alerts stop the moment doctor submits opinion (`alert_stopped = TRUE`).  
Scheduler runs every 30 minutes via `node-cron`.

---

## Opinion Workflow — architecture summary (permanent)

### Flow
1. Patient pays → immediate doctor alert (WhatsApp + email)
2. Patient fills questionnaire + uploads reports
3. Doctor sees episode in `PhysicianQueue` → opens `OpinionWriter`
4. Doctor writes 4-section opinion (Clinical Summary / Impression / Advice / Investigations) → saves draft → submits
5. Patient notified (WhatsApp + email) → reads in `OpinionViewer` → acknowledges
6. Doctor generates Advise Letter PDF → patient notified → patient downloads
7. Doctor closes episode → removed from queue

### Key rules
- Opinion editable by doctor until patient acknowledges
- Advise Letter: doctor manually triggers generation from `OpinionWriter`
- Advise Letter goes to both dashboards + patient notified via WhatsApp + email
- Patient download uses blob fetch (auth header passed, no URL token exposure)
- PDF stored as `BYTEA` in `opinions.advise_letter_pdf` — no disk write

---

## Security hardening — what was fixed (Session 8)

| Issue | Fix |
|---|---|
| `verifyToken` / `requireRole` not exported from auth.js | Added as aliases for `authenticate` / `authorize` |
| `req.user.patientId` never set | Added in `authenticate` for patient role |
| `authorizePatientAccess` checked wrong table (`appointments`) | Fixed to check `patient_condition_episodes` |
| `authLimiter` not applied to auth routes | Applied to all 5 auth routes |
| `otpLimiter` not applied | Applied to `/auth/patient/send-otp` |
| `uploadLimiter` not applied | Applied to all 3 upload routes |
| `sessionTimeout` exported but never used | Applied to all physician/admin write routes |
| `auditPhiAccess` not wired | Applied to patient documents, opinion, advise letter, admin patient routes |
| No JWT secret strength check at startup | Added — min 32 chars, rejects weak placeholders |
| No AES key strength check | Added — must be exactly 64 hex chars |
| No HTTPS enforcement | Added HTTP → HTTPS redirect in production |

---

## Pending items for next session

| Priority | Item | Notes |
|---|---|---|
| 1 | **Deployment** | AWS / DigitalOcean / Railway — not started |
| 2 | **HIPAA / data privacy documents** | Not started |
| 3 | **Admin portal UI** | Not started |
| 4 | **Patient portal i18n** | 10 Indian languages — not started |
| 5 | **Lab report auto-extraction** | Anthropic API (claude-sonnet-4-6) — not started |
| 6 | **Hypo H1 dyslipidaemia back-port** | Add medication sub-questions from Hyper H1 — not started |
| 7 | **Manual output audit** | Hypo + Hyper questionnaire physician output sentences — pending since Session 6 |
| 8 | **Receipt/PDF invoice generation** | patientController.js fix — pending since Session 3 |

---

## Permanent rules (carry forward always)

### Language
- **"online opinion"** everywhere — never "consultation" / "consulted" / "consult" in any UI, button, receipt, PDF, code, or DB value

### Portals
- Physician portal: **English only**
- Admin portal: **English only**
- Patient portal: patient's selected language (i18n — not yet built)

### Terminal
- **PowerShell only** for all commands

### Git
- Repo root: `D:\Thyroid Consultation Software\ThyroConsult`
- Branch: `main`
- **Single push at end of session only**
- Always `cd` to repo root before git commands

### API signatures (never change)
```js
conditionAPI.saveHypoQ(patientId, episodeId, data)
conditionAPI.saveHyperQ(patientId, episodeId, data)
conditionAPI.saveTcQ(patientId, episodeId, data)
```

### EDD formula
**EDD = LMP + 9 months + 7 days**

### Compliance wording
**Regular / Irregular / Skips sometimes** — everywhere, no exceptions

### Medication output
- All doses meal-adjacent → collapse to "after meals"
- Any dose at bedtime or before meal → list each timing individually

### Questionnaire rules
- 1 question per screen, no exceptions
- Yes → sub-questions expand on same screen
- No / Unsure → next screen immediately
- Physician output sentence auto-generated every screen (green italic)
- Save draft on every screen
- UI primitives: `Hypo` prefix for Hypo, `Hyper` for Hyper, `Tc` for TcQuestionnaire

### Migration order
001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009  
Always `GRANT ALL PRIVILEGES ON TABLE ... TO thyroconsult_user;` after creating/altering tables.

---

*Session 8 ended: 25 June 2026. Resume from Deployment next session.*
