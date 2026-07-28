# ThyroConsult — Session 5 Summary
> Date: 09 June 2026 | Upload this + all previous summaries at the start of next session.

---

## Ports (unchanged from Session 4)

| Service | Port |
|---|---|
| Backend | 7000 |
| Frontend | 7070 |

---

## Critical rules — carry forward always

### Language rule
- Use **"online opinion"** everywhere — NEVER "consultation" in any UI, button, receipt, PDF, or code

### Physician portal language
- Physician portal: **English ONLY — always**
- Patient portal: selected language (10 Indian languages)

### Gender / reproductive question rules (fixed permanently)
| Condition | Questions to skip |
|---|---|
| Patient gender = Male | Hysterectomy · Pregnancy · LMP · Menstruation — ALL hidden |
| Female + hysterectomy = Yes | Pregnancy · LMP · Menstruation hidden (hysterectomy shown) |
| Female + marital status = Unmarried / Divorced / Widowed | Pregnancy questions hidden (LMP + menstruation still shown) |

### EDD formula (fixed permanently)
**EDD = LMP + 9 months + 7 days**
Example: LMP 20/05/2026 → EDD 27/02/2027

---

## What was accomplished today

### 1. Test patient seed script
- Created `seed_test_patient.js` (backend root)
- Seeds 3 fully verified patients — no OTP needed, go straight to dashboard
- Credentials: mobile +919800000001 / +919800000002 / +919800000003, password Test@1234!

### 2. PatientPortal.js — My Conditions section added
- Added `AddConditionFlow` modal overlay
- Added `MyConditions` page component
- Added `ConditionsMiniList` mini component (shown inside Dashboard card)
- Added "+ Add condition" button on Dashboard and My Conditions page
- Added `conditions` route in sidebar
- **IMPORTANT**: `AddConditionFlow` now has only 2 steps — SELECT → CONDITION_Q (no CoreQuestionnaire in between). The new HypoQuestionnaire handles everything internally.

### 3. Sidebar.js — Patient sidebar updated
- Added: 🩺 My Conditions (links to /patient/conditions)
- Renamed: Consultations → Online Opinions
- Renamed: My Documents → My Reports

### 4. CoreQuestionnaire.js — Gender rules applied
- Added `maritalStatus` field to Social History section
- Added `pmhHysterectomy` field to Past Medical History (female only)
- Male → obstetric section hidden entirely
- Female + hysterectomy → pregnancy, LMP, menstruation hidden; amber notice shown
- Female + unmarried/divorced/widowed → pregnancy questions hidden, LMP still shown
- Fixed duplicate mood bug (was appearing twice in original)
- **Chief Complaint section kept** — it was always part of the original design (8 sections total)

### 5. DB permissions fix
- All new tables from 002_multi_condition_schema.sql were missing GRANT permissions
- Fix: run this in pgAdmin:
```sql
GRANT ALL PRIVILEGES ON TABLE patient_condition_episodes TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE patient_condition_selection TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE core_questionnaire TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hypo_questionnaire TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hyper_questionnaire TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE tc_questionnaire TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hypo_treatment_history TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hyper_atd_history TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hyper_rai_history TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE hyper_surgery_history TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE tc_surgery_history TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE tc_rai_history TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE tc_systemic_treatment TO thyroconsult_user;
GRANT ALL PRIVILEGES ON TABLE scan_reports TO thyroconsult_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO thyroconsult_user;
```

---

## New project: Hypothyroidism Questionnaire (Chatbot-style)

### Design principles (approved by user — fixed permanently)
- **1 question per screen**
- Yes → sub-questions expand on the SAME screen
- No / Unsure → next screen immediately
- Date picker used for all durations (gives days / months / years)
- Auto-generated physician-style output sentence on every screen
- Rule-based engine, structured variables
- This questionnaire **replaces** both CoreQuestionnaire + old HypoQuestionnaire for hypothyroidism
- Hyperthyroidism and Thyroid Cancer schemas to be provided by user later

### Files delivered today
| File | Location | Purpose |
|---|---|---|
| `ConditionQuestionnaires.js` | `src/components/` | Full replacement — new HypoQuestionnaire + unchanged Hyper + TC |
| `003_hypo_questionnaire_extended.sql` | Run in pgAdmin | Adds all new columns to hypo_questionnaire table |
| `PatientPortal.js` | `src/pages/patient/` | Fixed AddConditionFlow — 2 steps only |
| `CoreQuestionnaire.js` | `src/components/` | Gender rules applied |
| `Sidebar.js` | `src/components/common/` | My Conditions added |
| `seed_test_patient.js` | Backend root | Test patients without OTP |

### Schema approved — complete page count
| Module | Pages | Notes |
|---|---|---|
| A — Demographics | 3 | Height/weight removed by user |
| B — Menstrual/pregnancy/hysterectomy | 5 | Female only |
| C — Thyroid disease & medication history | 6 | C2 split into C2a (surgery) + C2b (RAI) |
| D — Thyroid laboratory capture | 5 | All with upload + AI extraction + line graph |
| E — Hypothyroidism specific | 3 | E4 (subclinical) deleted; E2 only shown if Hashimoto's selected at E1 |
| F — Symptoms | 26 | F8 split into F8a + F8b; F15 split into F15a + F15b |
| G — Treatment & monitoring | 2 | G3 deleted by user |
| H — Comorbidities & finish | 5 | H5 deleted (repeat); H3 expanded to PCOS/PMOS |
| **Total** | **~55 max (female) / ~44 (male)** | |

---

## Detailed schema — all approved changes

### Module A
- A3 (height/weight) — **removed** by user
- A4 (marital status) — output: show selected value only e.g. "Married"
- Pregnancy (B5) hidden if Unmarried / Divorced / Widowed (not just Unmarried)

### Module B
- B1 (hysterectomy): add date of surgery (month+year picker) + reason (radio: Excessive bleeding / Prolapse / Cancer of uterus/cervix / Others→free text). Output: "H/o Hysterectomy for [reason] X years ago"
- B2: Changed to 3-way radio — Pre-menopausal (default) / Peri-menopausal / Post-menopausal. Post-menopausal → ask years since menopause + skip B4/B5. Output only for post-menopausal: "Post-menopausal status since last X years"
- B3: Two groups — Regular/Irregular AND Heavy/Scanty/Absent/Prolonged. Output: "Irregular heavy flow since last 6 months"
- B4: Output: "LMP: 20/05/2026"
- B5: Shown only if LMP ≥ 31 days ago. Auto-calculate EDD (LMP + 9 months + 7 days). Output: "EDD: 27/02/2027"

### Module C
- C2: Split into two separate screens — C2a (thyroid surgery) and C2b (RAI therapy)
- C4: Relatives expanded — Immediate (Mother/Father/Brother/Sister/Son/Daughter) + Paternal side + Maternal side (Grandfather/Grandmother/Uncle/Aunt/Cousin brother/Cousin sister each). Option to add more. Each relative gets own condition dropdown. Output: "Mother and Cousin Sister"
- C5: Multi-select conditions each with duration. Output: "Type 1 diabetes since 5 years. Rheumatoid arthritis since 1 year."

### Module D
- D1–D4: Upload test report (JPG/PNG/PDF) + AI auto-extraction (lab name, test value, date, normal range) + manual entry + "Add another report" button. Multiple reports from same lab → line graph automatically. Output: "TSH — 0.56 mIU/L (01/05/2026)"
- D5: Multi-select imaging types. Add report upload option.

### Module E
- E1: Add duration picker (date/years/months/days). Output: "Congenital Hypothyroidism since 27 years". Branching: Hashimoto's selected → go to E2. All others → skip E2, go to E3.
- E2: Shown ONLY when Hashimoto's selected at E1. Output: "Hashimoto's thyroiditis — Anti-TPO positive"
- E3: Output: "Medium-sized goitre"
- E4 (subclinical): **Deleted**

### Module F — all symptoms
- All use: No/Unsure/Yes → Yes expands duration (date picker / years+months+days) on same screen
- No/Unsure → next screen immediately
- F7: "Yellowish tinge" removed from skin options
- F8: Split into F8a (periorbital — around eyes) and F8b (facial puffiness) — separate screens, separate outputs
- F10: Duration picker against EACH selected hair type individually
- F11: Changed to multi-select. Duration picker against each type individually
- F12: "rdiobutton" in document = radiobutton (select one): Constant / Intermittent
- F15: Split into F15a (difficulty concentrating) and F15b (memory problems) — separate screens
- F19: Duration supports days (e.g. "since last 15 days") — date picker handles this
- F22 (delayed reflexes): Duration picker added
- F23 (carpal tunnel): 3 sub-questions on SAME screen — Pain / Numbness / Tingling — each with side (Right/Left/Both) and duration
- F24 (macroglossia): Output generated even for No — "No enlargement of tongue"

### Module G (2 pages — G3 deleted)
- G1: Drug name auto-carried from C3. Compliance options: Regular / Irregular / Misses sometimes. Output: "On Tab. Thyronorm — 62.5 mcg since last 8 years and 7 months"
- G2: Question text auto-detects drug name from G1: "Has your [Tab. Thyronorm] dose been changed recently?" Reason for change: radiobutton — TSH increased / TSH decreased / Pregnancy / Doctor's advice or Other. Output: "Dose of Tab. Thyronorm was decreased since 20/05/2026 as TSH has decreased"
- G3: **Deleted**

### Module H (5 pages — H5 deleted)
- H1: Add duration picker when Yes. Output: "Dyslipidaemia / Hypercholesterolaemia since last 5 years"
- H2: Output: "K/c/o Iron deficiency anaemia"
- H3: Expanded to PCOS / PMOS (Polyendocrine Metabolic Ovarian Syndrome). Add duration. Add sub-question: medicines? If yes → name (text) + dose (numeric) + times per day (numeric). Output: "K/c/o PCOS since last 10 years, on Tab. Metformin (500 mg) — 2 times a day"
- H4: Hidden if hysterectomy = Yes OR Unmarried OR Divorced OR Widowed. Output: "No difficulty in conceiving" (even for No)
- H5: **Deleted** — repeat of F16
- H6: Free text, optional

---

## Architecture notes (important for next session)

### How AddConditionFlow works now
```
Patient clicks "+ Add condition"
    ↓
Step 1: ConditionSelection.js — picks Hypo/Hyper/Cancer
    ↓
Step 2: HypoQuestionnaire (or Hyper/TC) — handles EVERYTHING internally
    ↓
Done screen
```
**CoreQuestionnaire is NO LONGER part of the Add Condition flow.** It was removed from AddConditionFlow because HypoQuestionnaire now contains all modules A–H internally including all history, symptoms, treatment, comorbidities.

### HypoQuestionnaire internal structure
- Self-contained: manages its own page list, progress bar, navigation
- All 55 screens rendered via `renderPage()` switch statement
- `allPages` array is computed dynamically — female-only pages excluded for males, E2 only included when Hashimoto's selected, G2 only when on treatment, etc.
- All Hypo-specific UI primitives are prefixed `Hypo` (HypoField, HypoRadioGroup etc.) to avoid conflicts with shared helpers in ConditionQuestionnaires.js
- Saves to `hypo_questionnaire` table via `conditionAPI.saveHypoQ()`
- Save draft available on every screen

### ConditionQuestionnaires.js structure
```
Lines 1–96:     Shared helpers (Field, Input, Select, BoolRow, SectionTitle, etc.)
Lines 97–1865:  HypoQuestionnaire (new — complete A–H)
Lines 1866+:    HyperQuestionnaire (unchanged from original)
Lines 2144+:    TcQuestionnaire (unchanged from original)
```

---

## Pending items (backlog)

### Hypothyroidism questionnaire
- Test end-to-end on the app — start fresh registration and go through all screens
- AI report extraction for D1–D4 (backend integration with Anthropic API for lab report parsing)
- Line graph for multiple reports from same lab (D1–D4)
- Physician-style summary generation at end of questionnaire

### Hyperthyroidism questionnaire
- User to provide schema document (same format as hypo)

### Thyroid Cancer questionnaire
- User to provide schema document

### Remaining original backlog
- ⏳ Receipt/PDF invoice generation (patientController.js fix from Session 3 — still pending)
- ⬜ Appointment scheduling calendar
- ⬜ Video session integration (Jitsi / Daily.co)
- ⬜ Prescription PDF generation
- ⬜ WhatsApp notification templates
- ⬜ Deployment (AWS / DigitalOcean / Railway)
- ⬜ HIPAA administrative documents

---

## Files currently on user's machine (confirmed working)

| File | Path |
|---|---|
| PatientPortal.js | src/pages/patient/ |
| Sidebar.js | src/components/common/ |
| CoreQuestionnaire.js | src/components/ |
| ConditionQuestionnaires.js | src/components/ |
| ConditionSelection.js | src/components/ |
| RegisterPage.js | src/pages/patient/ |
| conditionController.js | src/controllers/ |
| seed_test_patient.js | backend root |
| 003_hypo_questionnaire_extended.sql | run in pgAdmin ✅ |

---

## Lesson for next session — DO NOT repeat these mistakes

1. **Never rewrite a file from scratch** when the task is to make targeted changes. Always read the original file first, make surgical edits only.
2. **Never deliver a standalone component** and tell the user to "replace" a multi-export file — always combine correctly and deliver the complete file.
3. **Always check what a component exports** before modifying — ConditionQuestionnaires.js has 3 exports, not 1.
4. **When adding primitives to a shared file**, always prefix them to avoid naming conflicts (e.g. HypoField, not Field).
5. **The AddConditionFlow no longer uses CoreQuestionnaire** — do not add it back.
6. **HypoQuestionnaire is self-contained** — it handles A through H internally. Do not split it or route through CoreQuestionnaire.

---

*Session ended: 09 June 2026. Resume from "Test end-to-end on the app" above.*
