# ThyroConsult — Session Summary (27 Jul 2026)

**Purpose:** Continuity document for the next session. Covers everything found, decided, and still open.
**Follows on from:** `thyroconsult-project-summary\\\_26Jul2026.md`

\---

## 1\. Quick status

|Area|Status|
|-|-|
|Nodule live/dead check|✅ Confirmed **dead** — no card in `ConditionSelection.js`, no import anywhere, no render case in `RegisterPage.js`|
|Hyper live/dead check|✅ Confirmed **live** — imported + rendered directly by `RegisterPage.js`|
|Migration `009` applied to live DB?|🔴 **Confirmed NOT applied** to any of the 3 tables (checked via live schema exports)|
|Hyper `hidePregnancy` bug|🔴 Found, not yet fixed — uses dead props instead of its own internal state|
|Hyper missing `onBack` prop|🔴 Found, not yet fixed — component doesn't accept it, so no back-navigation from Hyper's first screen|
|Hypo `mapFormToDb` data-loss bug|🔴 Confirmed, scope fully mapped, **not yet fixed** — needs new migration first|
|Architecture decision: self-contained questionnaires|✅ **Decided** — every condition module (Hypo/Hyper/Nodule/TC) must independently capture full demographics/complaints/history/investigations/treatment, regardless of what CoreQuestionnaire also asks. No reliance on Core's data to skip screens.|
|TC Module A/B/C/D|🔴 **Decided it's in scope**, but requires new frontend screens (not just backend) — explicitly deferred to a later session|
|New migration for Hypo + TC (Module C/D completion)|🔴 Not yet written — planned, waiting on `conditionController.js`|
|`conditionController.js` field whitelist check|🔴 Not yet reviewed this session — needed before finalizing any save-path fix|
|`RegisterPage.js` `authAPI` naming|🔴 Not yet resolved — still need `src/api/index.js` to confirm|

\---

## 2\. Files reviewed this session

|File|Full path|Outcome|
|-|-|-|
|`ConditionSelection.js`|`D:\\\\Thyroid Consultation Software\\\\ThyroConsult Frontend\\\\thyroconsult-frontend\\\\src\\\\components\\\\ConditionSelection.js`|Only 3 condition cards (`hypothyroidism`, `hyperthyroidism`, `thyroid\\\_cancer`) — no `nodule` card|
|`ConditionQuestionnaires.js`|`D:\\\\Thyroid Consultation Software\\\\ThyroConsult Frontend\\\\thyroconsult-frontend\\\\src\\\\components\\\\ConditionQuestionnaires.js`|Contains `HypoQuestionnaire`, re-exports `HyperQuestionnaire` from standalone file, contains `TcQuestionnaire`. `mapFormToDb()` (line \~1836) drops Modules A, B, C, D entirely, plus H3/H7/H8|
|`HyperQuestionnaire.js`|`D:\\\\Thyroid Consultation Software\\\\ThyroConsult Frontend\\\\thyroconsult-frontend\\\\src\\\\components\\\\HyperQuestionnaire.js`|Standalone, chatbot-style, snake\_case state matching DB columns 1:1. No transform layer — saves `{ ...data, draft }` directly. `hidePregnancy` bug at line 174. No `onBack` param in signature.|
|`NoduleQuestionnaire.js`|`D:\\\\Thyroid Consultation Software\\\\ThyroConsult Frontend\\\\thyroconsult-frontend\\\\src\\\\components\\\\NoduleQuestionnaire.js`|Exists, well-formed, but confirmed unreachable — not imported by `RegisterPage.js` or `ConditionQuestionnaires.js`|
|`RegisterPage.js`|`D:\\\\Thyroid Consultation Software\\\\ThyroConsult Frontend\\\\thyroconsult-frontend\\\\src\\\\pages\\\\RegisterPage.js`|Renders `CoreQuestionnaire` unconditionally before every condition questionnaire (all 4 conditions). Passes incomplete props to `HypoQuestionnaire` (missing `patientGender`/`patientDob` — turned out to be fine, self-contained is correct) and `HyperQuestionnaire` (missing `maritalStatus`/`hysterectomyDone` — turned out to be dead props anyway, real fix is inside Hyper itself)|
|`database.js`|`D:\\\\Thyroid Consultation Software\\\\thyroconsult-backend\\\\config\\\\database.js` (assumed — confirm path)|Standard pg Pool wrapper, nothing actionable found|
|`009\\\_module\\\_b\\\_reproductive\\\_history.sql`|`D:\\\\Thyroid Consultation Software\\\\thyroconsult-backend\\\\migrations\\\\009\\\_module\\\_b\\\_reproductive\\\_history.sql`|File itself is correct and idempotent (`IF NOT EXISTS`) — but confirmed **never run** against live DB|
|`hypo\\\_questionnaire` live schema|export `data-1785145334885.csv`|244 columns. No Module A (marital\_status)/B(reproductive)/C(thyroid history/family/autoimmune) columns at all. Module D has almost nothing (no TSH, no FT3/FT4, single `imaging\\\_finding` field). H3/H7/H8 (diabetes/osteoporosis/family cancer) already fully present.|
|`hyper\\\_questionnaire` live schema|export `hyper\\\_questionnaire\\\_schema.csv`|321 columns. Far more complete — full Module C and D already exist (`thyroid\\\_dx\\\_\\\*`, `thyroid\\\_surgery\\\_\\\*`, `family\\\_thyroid\\\_\\\*`, `autoimmune\\\_\\\*`, `tsh\\\_\\\*`, `ft3\\\_\\\*`, `ft4\\\_\\\*`, `imaging\\\_\\\*`). Only missing Module B reproductive fields (same gap as Hypo — migration `009` never ran here either).|
|`tc\\\_questionnaire` live schema|export `tc\\\_questionnaire\\\_schema.csv`|67 columns. Zero Module A/B/C fields — only cancer staging/labs/treatment. Confirms TC currently relies entirely on `CoreQuestionnaire`, consistent with last session's "no changes needed" verdict — which is now superseded by today's scope decision.|

\---

## 3\. Key decisions made this session

1. **Architecture: every condition questionnaire is fully self-contained.** Confirmed explicitly by you: *"whichever module he enters, all data are very much required come what may."* This overrides any temptation to have Hypo/Hyper/TC rely on `CoreQuestionnaire`'s data to skip their own screens. Applies to **all four conditions, including TC.**
2. **TC now needs its own Module A/B/C/D**, matching Hypo/Hyper. This is **new frontend screen-building**, not a backend fix — TC's live component has never asked these questions. Explicitly deferred to a later session; not started.
3. **Hyper's `hidePregnancy` bug is a plain code bug, not an architecture question.** Hyper already collects its own `marital\\\_status`/`hysterectomy\\\_status` internally — the bug is that `hidePregnancy` reads dead external props instead of its own state. Simple fix once we're back in the file.

\---

## 4\. Confirmed bugs (found, not yet fixed)

|Bug|File|Location|Fix|
|-|-|-|-|
|`hidePregnancy` always `false`|`HyperQuestionnaire.js`|Line 174|Change `maritalStatus`/`hysterectomyDone` props to read from internal `get("marital\\\_status")` / `get("hysterectomy\\\_status")` state instead|
|No back-navigation from Hyper's first screen|`HyperQuestionnaire.js`|Function signature line 172|Add `onBack` to the destructured props and wire it in|
|`mapFormToDb` drops Modules A, B, C, D + H3/H7/H8|`ConditionQuestionnaires.js`|Function at line \~1836|Blocked on new migration (see §5) — cannot fix mapping to columns that don't exist yet|

\---

## 5\. Next session — concrete next steps, in order

1. **Confirm migration `009` has been run** against the live DB (all 3 tables). If not run yet, run it first — it's `IF NOT EXISTS`, safe regardless of current state.
2. **I still need `conditionController.js`** to check whether the backend save functions (`saveHypoQuestionnaire`, `saveHyperQuestionnaire`, `saveTcQuestionnaire`) whitelist/drop fields independently of the frontend. Full path needed:
`D:\\\\Thyroid Consultation Software\\\\thyroconsult-backend\\\\controllers\\\\conditionController.js`
3. **Write new migration** — Module C (thyroid dx/surgery/RAI history, family thyroid history, autoimmune) + Module D (TSH, FT3, FT4, full imaging fields) + `occupation`/`occupation\\\_other` — for `hypo\\\_questionnaire` and `tc\\\_questionnaire`, matching Hyper's already-proven column naming so all three tables end up consistent.
4. **Fix `mapFormToDb`** in `ConditionQuestionnaires.js` (Hypo) once the new columns exist.
5. **Fix Hyper's two bugs** (`hidePregnancy`, missing `onBack`).
6. **Resolve `authAPI` naming** in `RegisterPage.js` — still need `src/api/index.js` (full path: `D:\\\\Thyroid Consultation Software\\\\ThyroConsult Frontend\\\\thyroconsult-frontend\\\\src\\\\api\\\\index.js`) to confirm whether `registerStep1`, `sendOTP`, `verifyOTP`, `saveConsent`, `savePhoto`, `selectDoctor` match what's actually exported, since last session's summary claimed different rebuilt names.
7. **Scope + build TC's new Module A/B/C/D screens** in `TcQuestionnaire.js` — separate, larger task; not started.
8. **Everything still carried over from the 26 Jul summary, untouched this session:**

   * Admin panel gaps (single-patient detail, episode listing, real dashboard, full doctor profile edit)
   * Follow-up payment gating (S1/S2/S3) — `createFollowUpOrder`/`verifyFollowUpPayment` don't exist
   * Follow-up status endpoint (missing-reports/investigation/deadline computation)
   * Receipt route `patientId` decision (add `:id` to routes vs. use `req.user.id`)
   * Minor guardian consent type missing from `consent\\\_type` enum
   * Legacy video-consultation tables — still unconfirmed whether dead
   * `Doctor\\\_Database\\\_Fields.txt` fields never migrated
   * `consultation\\\_fee` naming on `doctors` table — platform-language violation, not yet fixed
   * Migration `005` still unaccounted for (unexplained gap in migration history)

\---

## 6\. Standing rule reminder

Always give full paths — both when requesting files and when delivering updated ones — to avoid file mix-ups. Applied throughout this session; carry into next session too.

