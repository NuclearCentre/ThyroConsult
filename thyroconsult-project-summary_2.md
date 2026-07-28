# ThyroConsult — Project Summary & Continuation Reference
> Use this file at the start of a new chat to resume work exactly where we left off.

---

## What this project is

A **HIPAA-compliant online thyroid opinion platform** built for an Indian medical practice. Three separate portals — Patient, Doctor, Admin — sharing one backend API.

> ⚠️ **Language rule — enforced everywhere:** Use **"online opinion"** at all times. Never use "consultation" or "consulted" anywhere on the platform — not in UI labels, button text, receipts, invoices, doctor notes, appointment types, or any generated documents.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Encryption | AES-256-GCM (at rest), TLS 1.3 (in transit) |
| Authentication | JWT (15-min expiry) + refresh token rotation |
| Payment | Razorpay (India) |
| OTP | Twilio (SMS + WhatsApp) + Nodemailer (email) |
| AI extraction | Anthropic API (claude-sonnet-4-20250514) |
| Hosting | Not decided — API URL is a single `.env` variable |

---

## Current status

| Stage | Status |
|---|---|
| Mockups — all 3 portals | ✅ Done & approved |
| Backend code | ✅ Built & packaged |
| Frontend code | ✅ Built & packaged |
| Local setup | ✅ Complete & running |
| PDF invoice generation | ⏳ Not started (currently plain text) |
| Deployment | ⏳ Not started |

### Local paths (Windows)
```
D:\Thyroid Consultation Software\
├── ThyroConsult Backend\thyroconsult-backend\
└── ThyroConsult Frontend\thyroconsult-frontend\
```

### Running locally
- Backend: `npm run dev` → port 5000
- Frontend: `npm start` → port 3002
- Backend `.env`: `FRONTEND_URL=http://localhost:3002`, `ADMIN_URL=http://localhost:3002`

### Seed credentials
| Portal | Email | Password |
|---|---|---|
| Admin | admin@thyroidcare.in | Admin@1234! |
| Doctor 1 | rsaxena@thyroidcare.in | Doctor@1234! |
| Doctor 2 | akumar@thyroidcare.in | Doctor@5678! |

---

## Delivered / edited files

| File | Location | Last edited |
|---|---|---|
| `RegisterPage.js` | `src/pages/patient/` | ✅ Full rewrite |
| `DoctorPortal.js` | `src/pages/doctor/` | ✅ Updated |

---

## RegisterPage — complete rules & logic

### Step 1 — Personal information

**Name fields (in this order):**
1. Salutation (dropdown) + First name (in full) — side by side
   - Salutation options: Mr. · Mrs. · Ms. · Miss · Master · Dr.
2. Father's/Mother's/Spouse's name + Relation dropdown — side by side (optional)
3. Last name / Family name

**DOB / Age:**
- DOB input: max date = today (no future dates)
- Age auto-calculates from DOB (years · months · days shown read-only)
- OR enter age directly (years / months / days in one line)
- If age entered instead of DOB: amber warning banner that DOB is approximate
- **Minor detection:** If calculated age < 18 years → `isMinor = true`

**Minor alert:**
- Amber banner: "Patient is a minor — guardian details are mandatory"
- Guardian section appears below password fields

**Gender:** dropdown (no blood group — removed)

**Address entry order (registration form only):**
State → District → City → Taluka/Tehsil → Village → Flat/House No. → Landmark → PIN Code
- Each field enabled only after the one above it is filled
- City dropdown linked to selected state
- "Others" option in city → free text box appears
- District dropdown linked to state
- PIN code: numeric only, exactly 6 digits

**Address display order (Doctor portal):**
Flat/House No. → Landmark → Village → Taluka → City → District → State → PIN

**Contacts:**
- Mobile: country code dropdown (default +91) + 10-digit number (numeric only)
- Live digit countdown if under 10 digits
- WhatsApp: same-as-mobile checkbox; separate country code; "Check WhatsApp" button; shows ✅ or ❌
- Email: must match `xxx@xxx.com` pattern
- Password: strength meter + 4 rules shown live (8 chars, uppercase, number, special char)
- Confirm password: live match/mismatch indicator

**Guardian section (minors only — mandatory):**
Fields: Salutation · First name · Father's/Mother's/Spouse's name + Relation · Last name · DOB · Gender
Address: checkbox "Same as patient's address" → auto-copies if ticked; otherwise full address fields

---

### Step 2 — Verify contacts

- Mobile: OTP via SMS → enter 6-digit OTP → "Mobile number verified"
- WhatsApp: OTP via WhatsApp → enter 6-digit OTP → "WhatsApp number verified"
- Email: verification link sent → on click → "Email address verified"
- All three must be verified before proceeding

---

### Step 3 — E-consent

**Adult patients — 3 consents:**
1. Treatment consent
2. Data privacy consent
3. Telemedicine consent

**Minor patients — 4 consents (guardian signs on behalf of minor):**
1. Treatment consent (on behalf of minor)
2. Data privacy consent (minor's PHI)
3. Telemedicine consent (guardian confirms physical presence at every session)
4. Guardian declaration & legal authority ← legally critical

**Minor consent rules:**
- Banner states guardian is signing on behalf of minor
- Consent text explicitly states guardian's legal authority
- Signature pad label: "guardian signs on behalf of minor"
- Guardian declaration is a 4th tab not present for adult patients

---

### Step 4 — Live photo(s)

**Adult:** Single live camera capture; no upload from device allowed.

**Minor:** Two mandatory live captures:
- Patient (minor) photo
- Guardian photo — confirms guardian is physically present at every online opinion session

**Two separate photo consents:**
1. Guardian consents to minor's photo being taken and stored
2. Guardian consents to their own photo being taken and stored

**Tab switcher** shown for minor registrations to switch between Patient and Guardian camera.

**Status tracker** shows which photos have been captured.

**Rule:** Guardian photo is always live (no upload) — this is how the doctor verifies the same guardian is present at every session.

---

### Step 5 — Choose doctor for online opinion

- Grid of available doctors with availability indicator
- Button label: "Confirm & continue" (not "consult")

---

### Step 6 — Upload reports (not "documents")

**Minor patients:**
- Amber banner: "You are uploading reports for a minor patient"
- Mandatory consent checkbox before any upload is enabled:
  "I, the legal guardian, confirm these reports belong to the minor and consent to their storage for online opinion purposes."
- Upload disabled until consent is checked

**All patients:**
- Categories: Blood reports · Scan/USG · Previous prescriptions · Biopsy · Other
- Formats: PDF, DOCX, JPG, PNG · Max 5 MB

---

### Step 7 — Payment

- Heading: "Online opinion fee payment"
- Fee breakdown: "Online opinion — Dr. Name" (not "Consultation")

**Minor patient receipt preview shown on screen:**
> "Received an amount of ₹XXX from [Guardian salutation + name] on behalf of [Patient salutation + name] for online opinion purpose."

**All receipts & invoices must use this format for minors.**

---

## DoctorPortal — rules & logic

### Patient address display
Always shown in reading order: Flat/House No. → Landmark → Village → Taluka → City → District → State → PIN

### AI report extraction
- 🤖 Extract button appears on every JPG/PNG/PDF document
- Calls Anthropic API (claude-sonnet-4-20250514)
- Extracts: lab name, report date, test name, value, unit, normal range min/max
- Results shown in colour-coded table (red = abnormal, teal = normal)
- Model: sends document as base64 (image or PDF)

### Blood trend graph — same-lab + same-range rule
- **Same lab name AND same reference range across all values** → Line graph with reference lines
- **Different lab name OR different reference range** → Table view instead, with columns: Date · Value · Unit · Normal range · Laboratory · Status
- Amber warning badge shown when table mode is active: "Multiple labs / ranges — showing table"

### Terminology
- "Online opinion" everywhere — never "consultation"
- Appointment type stored as `online_opinion`

---

## Design decisions (confirmed by user)

| Decision | Choice |
|---|---|
| Payment gateway | Razorpay (India) |
| Photo capture | Live camera only — no device upload — for both patient and guardian |
| All 3 contacts mandatory | Mobile + WhatsApp + Email |
| Photo mandatory | Cannot be skipped |
| Middle name | Replaced by Father's/Mother's/Spouse's name |
| DOB auto-calc | Amber banner if age entered instead of DOB |
| Salutation options | Mr · Mrs · Ms · Miss · Master · Dr |
| Blood group | Removed from registration |
| Minor age threshold | Under 18 years |
| Guardian photo | Always live — same rule as patient |
| Minor consent | 4 separate consent tabs (including Guardian declaration) |
| Minor report upload | Separate guardian consent required before upload |
| Minor payment receipt | "Received from [guardian] on behalf of [patient] for online opinion purpose" |
| Language | "Online opinion" everywhere — never "consultation" |
| Line graph rule | Only when same lab + same reference range |
| Different lab/range | Show detailed table instead of graph |
| API provider | Not decided — change one `.env` line when ready |

---

## Backend architecture

```
thyroconsult-backend/
├── src/
│   ├── config/database.js
│   ├── controllers/
│   │   ├── authController.js       # Registration, login, OTP, JWT
│   │   ├── patientController.js    # Profile, documents, reports, invoices
│   │   ├── doctorController.js     # Doctor views, appointments, payments
│   │   └── adminController.js      # Admin panel, audit log, stats
│   ├── middleware/
│   │   ├── auth.js                 # JWT verify, RBAC, PHI audit logging
│   │   └── security.js             # Helmet, CORS, rate limiting
│   ├── routes/index.js
│   ├── services/notificationService.js
│   ├── utils/
│   │   ├── encryption.js           # AES-256-GCM, HMAC, photo encryption
│   │   └── logger.js               # Winston + HIPAA audit trail
│   └── server.js
├── migrations/
│   ├── 001_schema.sql              # All 12 database tables
│   ├── migrate.js
│   └── seed.js
└── .env.example
```

### Security
- PHI fields (name, DOB, address, contacts) — AES-256-GCM encrypted at application layer
- Searchable PHI — HMAC-SHA256 hash stored alongside ciphertext
- Patient photos + guardian photos — separate encryption key, isolated storage
- Audit logs — append-only (PostgreSQL rules block UPDATE/DELETE)
- JWT — 15-min access + rotating refresh tokens
- Brute force — 5 attempts → 30-min lockout

---

## Frontend architecture

```
thyroconsult-frontend/
├── src/
│   ├── api/index.js                # Single file — change REACT_APP_API_URL to switch provider
│   ├── components/common/
│   │   ├── index.js                # Logo, Badge, Spinner, Alert, HIPAABadge etc.
│   │   └── Sidebar.js              # Three sidebars (patient/doctor/admin)
│   ├── context/AuthContext.js
│   ├── pages/
│   │   ├── LoginPage.js
│   │   ├── patient/RegisterPage.js # 7-step registration (fully rewritten)
│   │   ├── patient/PatientPortal.js
│   │   ├── doctor/DoctorPortal.js  # Updated with AI extraction + same-lab rule
│   │   └── admin/AdminPortal.js
│   ├── styles/global.css
│   └── App.js
└── .env.example
```

---

## Common Windows errors & fixes

| Error | Fix |
|---|---|
| `psql not recognised` | Add `C:\Program Files\PostgreSQL\16\bin` to PATH |
| Migration fails "permission denied" | `ALTER SCHEMA public OWNER TO thyroconsult_user;` + `GRANT ALL ON SCHEMA public TO thyroconsult_user;` + `ALTER DATABASE thyroconsult OWNER TO thyroconsult_user;` |
| Port 5000 in use | Change `PORT=5001` in backend `.env` |
| CORS blocked (wrong port) | Update `FRONTEND_URL` and `ADMIN_URL` in backend `.env` to match actual frontend port |
| npm install errors | Run PowerShell as Administrator |
| Path with spaces | Always wrap in double quotes: `cd "D:\Thyroid Consultation Software"` |
| CREATE DATABASE in transaction | Run `CREATE DATABASE` alone in pgAdmin, then run the GRANT statements separately |

---

## Backlog — what to build next

1. ✅ Local setup and testing — complete
2. ✅ Minor patient registration flow — complete
3. ✅ AI report extraction (Doctor portal) — complete
4. ✅ Same-lab line graph rule — complete
5. PDF invoice / receipt generation (printable, with correct minor receipt wording)
6. Appointment scheduling calendar (date/time picker)
7. Video session integration (Jitsi Meet or Daily.co)
8. Prescription PDF generation
9. WhatsApp notification templates (appointment reminders, report alerts)
10. Deployment (AWS / DigitalOcean / Railway)
11. HIPAA administrative documents (BAA, Privacy Policy, Risk Assessment)

---

*Last updated: after minor patient registration, guardian photo, 4-consent flow, same-lab graph rule, and AI report extraction session.*
