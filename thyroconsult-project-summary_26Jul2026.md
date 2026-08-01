# ThyroConsult — Session Summary
**Purpose:** Continuity document for the next session. Covers everything built, fixed, and still open.

---

## 1. Quick status

| Area | Status |
|---|---|
| Nodule questionnaire (DB + frontend) | ✅ Rebuilt to match real component, 4 bugs fixed |
| TC "Part 2" (cancer staging, live) | ✅ Confirmed working end-to-end, no changes needed |
| TC "Part 1" / CoreQuestionnaire (live) | ✅ Upgraded to detailed spec, backend wired up |
| Standalone `TcQuestionnaire.js` | ⚠️ Confirmed **dead code** — not imported anywhere |
| `routes/index.js` | ✅ Fixed — 0 mismatches across all 11 controllers |
| `authController.js` / registration wizard | ✅ Routes + frontend API client now match |
| Hypo questionnaire save (`mapFormToDb`) | 🔴 **Not fixed** — drops ~40% of collected data |
| Hyper / Nodule "is it actually live?" | 🔴 **Never verified** the way TC was |
| Admin panel gaps | 🔴 Several routes removed, real functions never existed |
| Payment follow-up gating (S1/S2/S3) | 🔴 No backend implementation at all |
| `RegisterPage.js` | ⚠️ **Never reviewed** — may still call old API names |

---

## 2. Files delivered this session

All in `/mnt/user-data/outputs/` from this conversation — re-download if needed, they won't persist to next session.

### Database migrations
| File | What it does | Run? |
|---|---|---|
| `008_nodule_questionnaire.sql` | Creates `nodule_questionnaire` table, field-for-field matched to the real `NoduleQuestionnaire.js` (not the Word doc guess from earlier drafts). Adds `'nodule'` to `condition_type` enum. | ✅ Yes, whenever Nodule goes live |
| `009_module_b_reproductive_history.sql` | Adds hysterectomy (partial-date-aware), menopause, menstrual, LMP, pregnancy, EDD, marital_status columns to `hypo_questionnaire`, `hyper_questionnaire`, `tc_questionnaire` | ✅ Yes |
| `010_tc_questionnaire_rebuild.sql` | Adds 283 columns to `tc_questionnaire` matching the **standalone** `TcQuestionnaire.js` | ❌ **DO NOT RUN** — built for confirmed-dead code (see §3) |
| `011_core_questionnaire_detail.sql` | Adds hysterectomy detail, itemized autoimmune, itemized family thyroid history, menopause, structured menstrual, `edd_date`, and previously-orphaned `marital_status`/`pmh_hysterectomy` to `core_questionnaire` | ✅ Yes |

**Migration order:** `009` → `011` → `008` (009 before 011 doesn't strictly matter, but both should run before `008` only because `008` is newest; realistically all three are independent of each other and can run in any order relative to one another, just not before `002`–`004`/`006`).

**Known gap:** migration `005` was never located across the whole session (`001`–`004`, `006`, `007` all accounted for). Live DB was cross-checked directly via `information_schema` exports, so this hasn't blocked anything, but it's still an unexplained hole in your migration history.

### Frontend
| File | What changed |
|---|---|
| `NoduleQuestionnaire.js` | Removed duplicate family/autoimmune screens (`C4a`/`C5`, kept `J5`/`J6`), removed DOB/sex re-collection (now via `patientDob`/`patientGender` props), added hysterectomy partial-date picker, added persisted EDD |
| `TcQuestionnaire.js` (standalone) | Same 4 fixes as above applied — **but this file is dead code, see §3.** Edits are harmless but currently pointless unless this file gets wired in later |
| `CoreQuestionnaire.js` | Upgraded Module B/C to detailed spec: hysterectomy partial-date, itemized autoimmune checklist, itemized family thyroid history (relatives + condition), menopause status (new), structured menstrual change block (new), persisted EDD. Fixed 2 pre-existing read-back typos (`symMenstrualChanges`, `surgicalHistoryDetails`) |
| `index.js` (`src/api/index.js`) | Added `getCoreQ`/`saveCoreQ` (were completely missing). Rebuilt `authAPI` to match the real multi-step registration wizard instead of a nonexistent simple flow. Restored `patientAPI.getConsents/saveConsents/uploadPhoto` |

### Backend
| File | What changed |
|---|---|
| `conditionController.js` | `saveCoreQuestionnaire`'s field mapping extended to match `CoreQuestionnaire.js`'s new fields. Fixed 2 orphaned fields (`pmh_hysterectomy`, `marital_status` — were read by frontend, never saved) |
| `routes/index.js` | Fixed the crash and everything behind it — see §4 |
| `patientController.js` | Added real implementations: `getConsents`, `saveConsents`, `uploadPhoto` (multipart, mirrors `authController.savePhoto`'s image pipeline). Fixed `getPatient`/`updatePatient` — were reading `req.params.id`, which is `undefined` on the self-service `/patient/profile` route |
| `doctorController.js` | Added real implementations: `updateProfile`, `getAppointmentDetail`, `updateAppointment`. Same `req.params.id` bug fixed in `getDoctorProfile`/`getDoctorAppointments` |

---

## 3. Key architectural discovery: two `TcQuestionnaire` components

- **`ConditionQuestionnaires.js`'s internal `TcQuestionnaire`** ("Part 2 of 2") — confirmed live via `grep -rn "TcQuestionnaire"` across the actual codebase. Single-page form, camelCase state, saves via a real `saveTcQuestionnaire` mapping in `conditionController.js` that matches the live `tc_questionnaire` table exactly. **Fully working, no action needed.**
- **Standalone `TcQuestionnaire.js`** — chatbot-style, snake_case, modules A–J. **Confirmed nowhere in the codebase imports it.** Migration `010` was built for this file before that was known — don't run it.
- This live component only handles cancer staging/labs/treatment. Demographics/reproductive/history (Modules A/B/C) come from **`CoreQuestionnaire.js`** ("Part 1 of 2") beforehand — which is why that file got the detailed upgrade this session.

**Open question carried over:** the same live-vs-dead check was never done for `HyperQuestionnaire.js` or `NoduleQuestionnaire.js`. It's possible one or both are also unused drafts, in which case parts of migrations `008`/`009` (the Hyper portions) may be premature. **Recommended first step next session:** run the same PowerShell search:
```powershell
Get-ChildItem -Path "D:\Thyroid Consultation Software\" -Filter *.js -Recurse | Select-String -Pattern "HyperQuestionnaire"
Get-ChildItem -Path "D:\Thyroid Consultation Software\" -Filter *.js -Recurse | Select-String -Pattern "NoduleQuestionnaire"
```

---

## 4. The `routes/index.js` crash chain (all fixed)

What started as one crash (`sendPatientOtp` undefined) turned out to be a systemic pattern: **8 of 11 controllers** had routes calling function names that didn't match what the controller actually exported. Cross-checked every controller's real exports against every route call with a script; fixed all real renames, removed/flagged routes with no backing function at all so they fail loudly in review rather than crash in production. Final state: **0 mismatches** across all 11 controllers.

Full list of what got renamed vs. what's still missing is in the individual file comments (each fix has an inline note explaining why).

---

## 5. Remaining work, prioritized

### 🔴 High priority
1. **Hypo's `mapFormToDb` silently drops Modules A, B, C, and D** before saving — patients fill these out, none of it reaches the database. This is the single biggest data-loss bug found this session and hasn't been touched yet. Location: `ConditionQuestionnaires.js`, the `mapFormToDb()` function used by `HypoQuestionnaire`.
2. **Confirm whether `HyperQuestionnaire.js` and `NoduleQuestionnaire.js` are actually live** (see §3). This determines whether the Hyper portions of migration `009` matter yet, and whether Nodule (`008`) is ready to go live or still needs the condition added to `ConditionSelection.js`'s card list first.
3. **Review `RegisterPage.js`** — never seen this session. It may still call the old, wrong `authAPI` function names (`sendOtp`, `verifyOtp`, `doctorLogin`, `adminLogin`) instead of the rebuilt ones (`registerStep1`, `sendVerificationOtp`, `verifyContactOtp`, unified `login`, etc.). This is likely the last piece needed to make registration actually work end-to-end.

### 🟡 Medium priority
4. **Admin panel gaps** — no single-patient detail/update endpoint, no episode listing, `/admin/dashboard` currently just duplicates `/admin/stats`, and "update doctor" only toggles active/suspended rather than full profile editing.
5. **Follow-up payment gating (S1/S2/S3)** — migration `007`'s fee-gating logic (free within 14 days, 50% within 28 days, full fee after) has no backend functions behind it. `createFollowUpOrder`/`verifyFollowUpPayment` don't exist.
6. **Follow-up status endpoint** — nothing computes the missing-reports/investigation/follow-up deadline status described in `007`'s comments.
7. **Receipt routes will 404 at runtime** (not crash) — `receiptController`'s functions expect `patientId` in the URL, but neither the routes nor the frontend `receiptAPI` provide one. Needs a decision: add `:id` everywhere, or switch the controller to use `req.user.id`.

### 🟢 Lower priority / cleanup
8. **Consent types for minors** — `consent_type` enum still only has `('treatment', 'data_privacy', 'telemedicine', 'photo')`. No distinct guardian-signed consent type exists yet, despite the standing rule requiring 4 consents for minors vs. 3 for adults including a Guardian Declaration.
9. **Legacy video-consultation tables** (`appointments`, `consultations` with `session_link`, `consultation_type ENUM('video','audio','text')`) — still live, still referenced by `doctorController`, likely vestigial from an earlier product pivot. Never confirmed whether still needed.
10. **`Doctor_Database_Fields.txt` spec fields never migrated** — salutation, DOB, profile photo URL, sub-specialization, and most of that original field list don't exist on the live `doctors` table. Aspirational only.
11. **`consultation_fee` naming** on the live `doctors` table still uses the word "consultation" — same platform-language issue flagged for other tables early on, not yet fixed here.

---

## 6. Useful reference for next session

- **Live DB ground truth**: obtained via direct `information_schema.columns` + `pg_enum` export from pgAdmin, not from migration files alone (several migration files turned out to be stale/conflicting drafts — always prefer the live export if in doubt).
- **`condition_type` enum values**: `hypothyroidism`, `hyperthyroidism`, `thyroid_cancer`, `nodule` (added this session).
- **Pattern to watch for going forward**: this session found the *same* "two people built the same feature differently and it was never reconciled" bug at least 4 times (TC frontend, auth backend, condition routes, admin routes). Worth treating as a standing risk — anytime a new file is reviewed, check whether an older, non-matching version already exists elsewhere before assuming it's new.
