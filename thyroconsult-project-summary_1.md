# ThyroConsult — Project Summary & Continuation Reference
> Use this file at the start of a new chat to resume work exactly where we left off.

---

## What this project is

A **HIPAA-compliant online thyroid consultation platform** built for an Indian medical practice. It has three separate portals — Patient, Doctor, and Admin — all sharing one backend API.

**Tech stack decided:**
- Frontend: React 18
- Backend: Node.js + Express
- Database: PostgreSQL
- Encryption: AES-256-GCM (at rest), TLS 1.3 (in transit)
- Authentication: JWT (15-min expiry) + refresh token rotation
- Payment: Razorpay (India)
- OTP: Twilio (SMS + WhatsApp) + Nodemailer (email)
- Hosting: Not decided yet — **API URL is a single .env variable**, swap anytime

---

## Current status

| Stage | Status |
|---|---|
| Mockups — Patient registration (7 screens) | ✅ Done & approved |
| Mockups — Patient dashboard | ✅ Done & approved |
| Mockups — Doctor dashboard | ✅ Done & approved |
| Mockups — Admin panel | ✅ Done & approved |
| Backend code | ✅ Built & packaged |
| Frontend code | ✅ Built & packaged |
| Local setup | 🔄 In progress — stuck at PostgreSQL database creation step |
| PDF invoice generation | ⏳ Not started (currently plain text) |
| Deployment | ⏳ Not started |

---

## Delivered files

Both files were downloaded by the user:

| File | Contents |
|---|---|
| `thyroconsult-backend.tar.gz` | Complete Node.js/Express/PostgreSQL backend |
| `thyroconsult-frontend.tar.gz` | Complete React 18 frontend (3 portals) |

---

## Project folder on user's machine

```
D:\Thyroid Consultation Software\
├── thyroconsult-backend\
└── thyroconsult-frontend\
```

User is on **Windows**. Node.js and PostgreSQL are both installed.

---

## Where we got stuck

The user was following the local setup guide and got to **Step 3 — creating the PostgreSQL database**. They were unsure how to run the SQL commands. The last message gave them two options:

- **Option A**: Use pgAdmin 4 (visual, recommended)
- **Option B**: Use psql command line

We were waiting for them to confirm which PostgreSQL version they have installed (to give exact psql path) and whether they succeeded with database creation.

**Next immediate step** once database is created:

```sql
CREATE USER thyroconsult_user WITH PASSWORD 'StrongPass@123';
GRANT ALL PRIVILEGES ON DATABASE thyroconsult TO thyroconsult_user;
-- then connect to thyroconsult database and run:
GRANT ALL ON SCHEMA public TO thyroconsult_user;
```

---

## Full local setup checklist

### Step 1 — Verify installations
```powershell
node --version   # must be v18+
npm --version
psql --version
```

### Step 2 — Extract archives
Extract both `.tar.gz` files into `D:\Thyroid Consultation Software\`

### Step 3 — Create PostgreSQL database ← USER IS HERE
```sql
CREATE DATABASE thyroconsult;
CREATE USER thyroconsult_user WITH PASSWORD 'StrongPass@123';
GRANT ALL PRIVILEGES ON DATABASE thyroconsult TO thyroconsult_user;
\c thyroconsult
GRANT ALL ON SCHEMA public TO thyroconsult_user;
```

### Step 4 — Configure backend .env
Copy `thyroconsult-backend\.env.example` → rename to `.env`

Fill in these fields:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=thyroconsult
DB_USER=thyroconsult_user
DB_PASSWORD=StrongPass@123
```

Generate encryption keys (run 3 times, use each output once):
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
```
ENCRYPTION_KEY=<output 1>
PHI_ENCRYPTION_KEY=<output 2>
PHOTO_ENCRYPTION_KEY=<output 3>
```

Generate JWT secrets (run 2 times):
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
```
JWT_SECRET=<output 1>
JWT_REFRESH_SECRET=<output 2>
```

Leave Twilio, Razorpay, SMTP fields as placeholders — OTPs print to console in dev mode.

### Step 5 — Run migrations & seed
```powershell
cd "D:\Thyroid Consultation Software\thyroconsult-backend"
npm install
npm run migrate
npm run seed
```

Expected seed output:
```
✓ Admin created: admin@thyroidcare.in / Admin@1234!
✓ Doctor 1: Dr. Rohini Saxena (rsaxena@thyroidcare.in / Doctor@1234!)
✓ Doctor 2: Dr. Arvind Kumar (akumar@thyroidcare.in / Doctor@5678!)
```

### Step 6 — Start backend
```powershell
npm run dev
# Should show: ThyroConsult API running on port 5000
```

### Step 7 — Configure & start frontend
Open a second PowerShell window:
```powershell
cd "D:\Thyroid Consultation Software\thyroconsult-frontend"
```
Copy `.env.example` → `.env`, set:
```
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_RAZORPAY_KEY_ID=rzp_test_placeholder
```
Then:
```powershell
npm install
npm start
# Opens browser at http://localhost:3000
```

### Step 8 — Test credentials
| Portal | URL | Login |
|---|---|---|
| Patient registration | `http://localhost:3000/register` | Create new account |
| Patient login | `http://localhost:3000/login` (Patient tab) | Your new account |
| Doctor login | `http://localhost:3000/login` (Doctor tab) | `rsaxena@thyroidcare.in` / `Doctor@1234!` |
| Admin login | `http://localhost:3000/login` (Admin tab) | `admin@thyroidcare.in` / `Admin@1234!` |

**OTP during testing:** Not sent via SMS — look in the backend console window for:
```
[DEV] SMS to +91XXXXXXXXXX: Your ThyroConsult verification code is: XXXXXX
```

---

## Common Windows errors & fixes

| Error | Fix |
|---|---|
| `psql not recognised` | Add `C:\Program Files\PostgreSQL\16\bin` to Windows PATH |
| Migration fails "permission denied" | Run `GRANT ALL ON SCHEMA public TO thyroconsult_user;` |
| Port 5000 in use | Change `PORT=5001` in backend `.env` |
| npm install errors | Run PowerShell as Administrator |
| Path with spaces error | Always wrap paths in double quotes: `cd "D:\Thyroid Consultation Software"` |

---

## Backend architecture (for reference)

```
thyroconsult-backend/
├── src/
│   ├── config/database.js          # PostgreSQL pool
│   ├── controllers/
│   │   ├── authController.js       # Registration, login, OTP, JWT
│   │   ├── patientController.js    # Profile, documents, reports, invoices
│   │   ├── doctorController.js     # Doctor views, appointments, payments
│   │   └── adminController.js      # Admin panel, audit log, stats
│   ├── middleware/
│   │   ├── auth.js                 # JWT verify, RBAC, PHI audit logging
│   │   └── security.js             # Helmet, CORS, rate limiting, file validation
│   ├── routes/index.js             # All routes with validation
│   ├── services/
│   │   └── notificationService.js  # SMS, WhatsApp, Email OTP
│   ├── utils/
│   │   ├── encryption.js           # AES-256-GCM, HMAC, photo encryption
│   │   └── logger.js               # Winston + HIPAA audit trail
│   └── server.js
├── migrations/
│   ├── 001_schema.sql              # All 12 database tables
│   ├── migrate.js                  # Migration runner
│   └── seed.js                     # Initial admin + 2 doctors
└── .env.example
```

### Key security decisions
- PHI fields (name, DOB, address, contacts) — AES-256-GCM encrypted at application layer
- Searchable PHI (mobile, email) — HMAC-SHA256 hash stored alongside ciphertext
- Patient photos — completely separate encryption key, isolated storage folder
- Audit logs — append-only at DB level (PostgreSQL rules block UPDATE/DELETE)
- JWT — 15-min access token + rotating refresh tokens
- Brute force — 5 failed attempts locks account for 30 minutes

---

## Frontend architecture (for reference)

```
thyroconsult-frontend/
├── src/
│   ├── api/index.js                # ← SINGLE FILE: change REACT_APP_API_URL to switch provider
│   ├── components/common/
│   │   ├── index.js                # Reusable components (Logo, Badge, Spinner, etc.)
│   │   └── Sidebar.js              # Three sidebars (patient/doctor/admin)
│   ├── context/AuthContext.js      # JWT auth state
│   ├── pages/
│   │   ├── LoginPage.js            # Shared login (3-tab role selector)
│   │   ├── patient/
│   │   │   ├── RegisterPage.js     # 7-step onboarding
│   │   │   └── PatientPortal.js    # Dashboard, trends, invoices, documents
│   │   ├── doctor/
│   │   │   └── DoctorPortal.js     # Queue, patient detail, notes, trends
│   │   └── admin/
│   │       └── AdminPortal.js      # Stats, users, audit log, RBAC, security
│   ├── styles/global.css           # Design system (DM Sans + DM Serif Display)
│   └── App.js                      # Routes + protected route guards
└── .env.example
```

---

## Patient registration — 7 steps (all implemented)

1. **Personal info** — First, middle (optional), last name · Father/Mother/Spouse name (optional) · DOB↔Age auto-calculation (amber warning if age entered instead of DOB) · Gender · Blood group · Full address · Mobile + WhatsApp + Email (all mandatory)
2. **Verify contacts** — OTP via SMS, WhatsApp, AND Email — all three must be verified
3. **E-consent** — 3-tab consent (Treatment, Data Privacy, Telemedicine) · Digital signature pad · SHA-256 audit hash · HIPAA §164.508 compliant
4. **Live photo** — Mandatory, live camera only, no upload option · Separate photo consent checkbox · AES-256 encrypted to isolated vault
5. **Choose doctor** — Select from active verified doctors with availability indicator
6. **Upload documents** — 5 categories (Blood reports, Scan/USG, Prescriptions, Biopsy, Other) · PDF/Word/JPG/PNG · 5MB limit · Auto-save
7. **Payment** — Razorpay integration · Fee breakdown with GST · UPI/Cards/NetBanking/Wallets

---

## What to build next (backlog)

1. ✅ Local setup and testing — **in progress**
2. PDF invoice generation (currently plain text, upgrade to proper PDF)
3. Appointment scheduling calendar (date/time picker for booking)
4. Video consultation integration (Jitsi Meet or Daily.co)
5. Prescription PDF generation
6. WhatsApp notification templates (appointment reminders, report alerts)
7. Deployment to hosting provider (AWS / DigitalOcean / Railway)
8. HIPAA administrative documents (BAA, Privacy Policy, Risk Assessment)

---

## Design decisions to remember

- **Payment gateway**: Razorpay (India) — confirmed by user
- **Photo**: Live camera only (no upload) — confirmed by user
- **All 3 contacts mandatory**: Mobile + WhatsApp + Email — confirmed by user
- **Photo is mandatory**: Cannot be skipped — confirmed by user
- **Middle name**: Optional field — confirmed by user
- **DOB auto-calc**: If age entered, show amber caveat banner — confirmed by user
- **API provider**: Not decided — change one line in `.env` when ready

---

*This document was generated at the end of the initial build session. Resume from the PostgreSQL database creation step.*
