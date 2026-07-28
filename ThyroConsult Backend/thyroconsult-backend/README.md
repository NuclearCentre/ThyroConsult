# ThyroConsult Backend

HIPAA-compliant thyroid consultation platform API — Node.js + Express + PostgreSQL.

---

## Security architecture

| Layer | Implementation |
|---|---|
| Data at rest | AES-256-GCM (all PHI fields individually encrypted) |
| Data in transit | TLS 1.3 (enforced in production) |
| PHI field-level | Separate `PHI_ENCRYPTION_KEY`, HMAC-SHA256 for searchable fields |
| Patient photos | Isolated `PHOTO_ENCRYPTION_KEY`, separate encrypted vault |
| Document storage | AES-256 + SHA-256 integrity hash per file |
| Authentication | RS256 JWT (15-min expiry) + refresh token rotation |
| Passwords | bcrypt (12 rounds) |
| Audit trail | Append-only audit_logs table — HIPAA 6-year retention |
| Rate limiting | 100 req/15 min general, 10 req/15 min auth, brute-force lockout |
| Row-level security | PostgreSQL RLS — patients only see their own data |

---

## Prerequisites

- Node.js ≥ 18
- PostgreSQL ≥ 14
- (Production) AWS account with KMS + S3

---

## Quick start (development)

### 1. Clone and install

```bash
git clone <repo>
cd thyroconsult-backend
npm install
```

### 2. Create PostgreSQL database

```sql
CREATE DATABASE thyroconsult;
CREATE USER thyroconsult_user WITH PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE thyroconsult TO thyroconsult_user;
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in every value. Generate secure keys:

```bash
# Generate encryption keys (run 3 times for 3 separate keys)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secrets (run twice)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Run migrations

```bash
npm run migrate
```

### 5. Seed initial data (admin + 2 demo doctors)

```bash
npm run seed
```

### 6. Start server

```bash
npm run dev       # development (nodemon)
npm start         # production
```

API is available at: `http://localhost:5000/api`

---

## API reference

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register/step1` | Patient personal info |
| POST | `/api/auth/register/send-otp` | Send OTP (mobile/whatsapp/email) |
| POST | `/api/auth/register/verify-otp` | Verify OTP |
| POST | `/api/auth/register/consent` | Save e-consent |
| POST | `/api/auth/register/photo` | Save live camera photo |
| POST | `/api/auth/register/select-doctor` | Choose doctor |
| POST | `/api/auth/login` | Login (patient/doctor/admin) |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout |

### Patient

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/patients/:id` | Patient, Doctor, Admin |
| PATCH | `/api/patients/:id` | Patient, Admin |
| GET | `/api/patients/:id/photo` | Patient, Doctor, Admin |
| GET | `/api/patients/:id/documents` | Patient, Doctor, Admin |
| POST | `/api/patients/:id/documents` | Patient, Doctor |
| GET | `/api/patients/:id/documents/:docId/download` | Patient, Doctor, Admin |
| GET | `/api/patients/:id/blood-values` | Patient, Doctor, Admin |
| POST | `/api/patients/:id/blood-values` | Doctor, Admin |
| GET | `/api/patients/:id/consultations` | Patient, Doctor, Admin |
| GET | `/api/patients/:id/invoices` | Patient, Admin |

### Doctor

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/doctors` | Public |
| GET | `/api/doctors/:id` | Public |
| GET | `/api/doctors/:id/appointments` | Doctor, Admin |
| GET | `/api/doctors/:id/patients/:patientId` | Doctor only |

### Appointments & Payments

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/appointments` | Patient |
| POST | `/api/consultations/:id/notes` | Doctor |
| POST | `/api/payments/webhook` | Razorpay (signed) |
| POST | `/api/payments/verify` | Patient |
| GET | `/api/payments/:id/invoice/download` | Patient, Admin |

### Admin

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/admin/stats` | Admin+ |
| GET | `/api/admin/patients` | Admin+ |
| GET | `/api/admin/doctors` | Admin+ |
| POST | `/api/admin/doctors` | Super admin |
| PATCH | `/api/admin/doctors/:id/status` | Super admin |
| GET | `/api/admin/audit-log` | Admin+ |
| GET | `/api/admin/audit-log/export` | Super admin |
| GET | `/api/admin/payments/report` | Admin+ |
| GET | `/api/admin/encryption/status` | Admin+ |

---

## Project structure

```
src/
├── config/
│   └── database.js          # PostgreSQL pool + transaction helper
├── controllers/
│   ├── authController.js    # Registration, login, OTP, tokens
│   ├── patientController.js # Profile, documents, reports, invoices
│   ├── doctorController.js  # Doctor views, appointments, payments
│   └── adminController.js   # Admin panel, audit log, stats
├── middleware/
│   ├── auth.js              # JWT verify, RBAC, PHI audit logging
│   └── security.js          # Helmet, CORS, rate limiting, file validation
├── routes/
│   └── index.js             # All route definitions with validation
├── services/
│   └── notificationService.js  # SMS, WhatsApp, Email OTP
├── utils/
│   ├── encryption.js        # AES-256-GCM, HMAC, photo encryption
│   └── logger.js            # Winston app + HIPAA audit logger
└── server.js                # Express app + graceful shutdown

migrations/
├── 001_schema.sql           # Complete database schema
├── migrate.js               # Migration runner
└── seed.js                  # Initial admin + demo doctors
```

---

## HIPAA compliance notes

- **PHI fields** (name, DOB, address, mobile, email, photo) are AES-256-GCM encrypted at the application layer before being written to the database — the database itself never holds plaintext PHI.
- **Searchable PHI** (mobile, email) uses a separate HMAC-SHA256 hash stored alongside the ciphertext — lookups use the hash, not the plaintext.
- **Patient photos** use a completely separate encryption key (`PHOTO_ENCRYPTION_KEY`) and are stored in an isolated folder — they are never mixed with clinical data.
- **Audit logs** are append-only at the database level (DELETE and UPDATE rules block modifications). Every PHI access is logged with user, role, patient ID, IP (partially masked), and timestamp.
- **Consent** is stored with a SHA-256 hash of the consent document version, a SHA-256 audit hash of the signing event, and the patient's digital signature — this provides non-repudiation.
- **JWT tokens** expire in 15 minutes. Refresh tokens rotate on every use and are invalidated on logout.
- **Brute-force** protection: 5 failed login attempts locks the account for 30 minutes. All lockout events are audit-logged.

---

## Production checklist

- [ ] Set `NODE_ENV=production`
- [ ] Generate unique 32-byte hex keys for `ENCRYPTION_KEY`, `PHI_ENCRYPTION_KEY`, `PHOTO_ENCRYPTION_KEY`
- [ ] Generate unique 64-byte hex secrets for `JWT_SECRET`, `JWT_REFRESH_SECRET`
- [ ] Enable PostgreSQL SSL: `DB_SSL=true`
- [ ] Set `STORAGE_TYPE=s3` and configure AWS KMS + S3
- [ ] Configure real Twilio credentials for SMS/WhatsApp
- [ ] Configure SMTP for email
- [ ] Set real Razorpay live keys
- [ ] Set up `FRONTEND_URL` and `ADMIN_URL` for CORS
- [ ] Sign Business Associate Agreement (BAA) with AWS/Azure/GCP
- [ ] Run `npm audit` before deployment
- [ ] Set up log rotation and ship audit logs to immutable storage (S3 with Object Lock)
- [ ] Enable PostgreSQL WAL archiving for point-in-time recovery
- [ ] Change `ADMIN_INITIAL_PASSWORD` on first login
