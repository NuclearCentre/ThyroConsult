# ThyroConsult Frontend

React 18 frontend for the ThyroConsult HIPAA-compliant thyroid consultation platform.

---

## How to switch API provider later (it's one line)

Edit `.env`:
```
REACT_APP_API_URL=https://your-new-api-server.com/api
```

That's it. Every API call flows through `src/api/index.js` — nothing is hardcoded anywhere else.

---

## Quick start

```bash
cp .env.example .env
# Edit .env — set REACT_APP_API_URL and REACT_APP_RAZORPAY_KEY_ID

npm install
npm start
```

App runs at: `http://localhost:3000`

---

## Three portals in one app

| URL | Portal | Who uses it |
|---|---|---|
| `/login` | Shared login | All users — tab selects role |
| `/register` | Patient registration | New patients |
| `/patient/*` | Patient portal | Registered patients |
| `/doctor/*` | Doctor portal | Verified doctors |
| `/admin/*` | Admin console | Super admin / admin |

---

## Project structure

```
src/
├── api/
│   └── index.js              ← SINGLE FILE: all API calls, change base URL here
├── components/
│   └── common/
│       ├── index.js          ← Reusable UI components
│       └── Sidebar.js        ← Three sidebars (patient, doctor, admin)
├── context/
│   └── AuthContext.js        ← JWT auth state, login/logout
├── pages/
│   ├── LoginPage.js          ← Shared login (all 3 roles)
│   ├── patient/
│   │   ├── RegisterPage.js   ← 7-step HIPAA-compliant onboarding
│   │   └── PatientPortal.js  ← Dashboard, trends, invoices, documents
│   ├── doctor/
│   │   └── DoctorPortal.js   ← Queue, patient detail, notes, trends
│   └── admin/
│       └── AdminPortal.js    ← Stats, users, audit log, RBAC, security
├── styles/
│   └── global.css            ← Design system (DM Sans + DM Serif Display)
└── App.js                    ← Routes + protected route guards
```

---

## Key features per portal

### Patient portal
- 7-step onboarding: personal info → OTP verification (mobile + WhatsApp + email) → 3-tab e-consent with signature → live camera photo (no upload) → doctor selection → document upload (5 categories) → Razorpay payment
- DOB ↔ age auto-calculation with caveat banner when age is entered instead of DOB
- Auto-save indicator on all registration forms
- Dashboard with stat cards, TSH mini-trend, recent consultations, upcoming appointment
- Full report trend graphs (TSH, T3, T4, Haemoglobin, Vitamin D, B12, Anti-TPO, Cholesterol)
- Invoice table with per-row and bulk download
- Document library filtered by category

### Doctor portal
- Appointment queue for the day with payment status per patient
- Full patient view: live photo, all demographics, last TSH, contact details
- Per-patient document library with download
- Payment breakdown with Razorpay transaction ID
- Blood report trend graphs with selectable test parameter
- Consultation notes editor (chief complaint, diagnosis, clinical notes, follow-up)

### Admin portal
- Platform stats: total patients, doctors, monthly consultations, revenue
- Real-time alerts panel (failed logins, consent issues, payment problems)
- Live activity feed from audit log
- Patient list with registration status
- Doctor management: create, activate, suspend
- HIPAA audit log: paginated, filterable by event type, exportable CSV
- Encryption status panel (AES-256-GCM, TLS 1.3, key rotation schedules)
- Role-based access control (RBAC) with permission matrix

---

## Production checklist

- [ ] Set `REACT_APP_API_URL` to your live API endpoint
- [ ] Set `REACT_APP_RAZORPAY_KEY_ID` to your Razorpay live key
- [ ] Run `npm run build` to generate optimised production bundle
- [ ] Serve the `build/` folder from your web server (Nginx, Apache, CDN)
- [ ] Ensure HTTPS is enforced — the HIPAA badge is not just decorative
- [ ] Set `Content-Security-Policy` header on your web server
- [ ] Ensure `robots.txt` blocks indexing of the patient portal
