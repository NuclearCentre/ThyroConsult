# ThyroConsult — Session 6 Summary
> Date: 14 June 2026 | Upload this + all previous summaries at the start of next session.

---

## Ports (unchanged)

| Service | Port |
|---|---|
| Backend | 7000 |
| Frontend | 7070 |

---

## What was accomplished today

| Task | Status |
|---|---|
| Hyperthyroid Questionnaire Schema — formatted as chatbot-style Word doc (1 question per page) | ✅ Done |
| 8 schema conflicts/gaps identified, resolved by user, and incorporated | ✅ Done |
| SQL migration `004_hyper_questionnaire_extended.sql` written | ✅ Done |
| `HyperQuestionnaire.js` — full chatbot component coded (Modules A–H, ~64 pages) | ✅ Done |
| `ConditionQuestionnaires.js` — old HyperQuestionnaire stub replaced with import/re-export | ✅ Done |
| GitHub repo set up: `https://github.com/NuclearCentre/ThyroConsult.git` | ✅ Done |
| All files pushed to GitHub (branch: main) | ✅ Done |
| Bug fix: `patientId` missing from `saveHyperQ` and `getHyperQ` API calls | ✅ Fixed & pushed |
| Bug fix: Load-on-mount `getHyperQ` added so drafts reload correctly | ✅ Fixed & pushed |
| Bug fix: H5 (infertility) now correctly hidden when hysterectomy answered Yes inside B1 | ✅ Fixed & pushed |
| Full audit completed — no further code issues found | ✅ Done |
| Standing rules summary written for instructions page | ✅ Done |

---

## GitHub commit history (today)

| Commit | Message |
|---|---|
| `678b088` | feat: Add full chatbot-style HyperQuestionnaire (Modules A–H) |
| `b9aba59` | fix: Pass patientId to saveHyperQ and getHyperQ API calls |
| `0e176ff` | fix: Thorough audit fixes (H5 gating, useMemo deps) |

---

## Current file locations (confirmed)

| File | Location |
|---|---|
| `HyperQuestionnaire.js` | `src/components/HyperQuestionnaire.js` |
| `ConditionQuestionnaires.js` | `src/components/ConditionQuestionnaires.js` |
| `004_hyper_questionnaire_extended.sql` | Run in pgAdmin ✅ (confirm before next session) |

---

## HyperQuestionnaire — architecture summary

### Component structure
- **File:** `src/components/HyperQuestionnaire.js` — standalone default export
- **Re-exported from:** `ConditionQuestionnaires.js` as `export { default as HyperQuestionnaire } from './HyperQuestionnaire'`
- **Props:** `{ episodeId, patientId, patientGender, maritalStatus, hysterectomyDone, onComplete }`
- **Self-contained:** manages its own page list, progress bar, navigation, save draft, submit
- All UI primitives prefixed `Hyper` (HyperField, HyperInput, HyperSelect, HyperRadioGroup, HyperCheckGroup, HyperYesNoUnsure, HyperDurationPicker, HyperOutputBox, HyperSectionCard, HyperMedBlock)

### Page count
| Module | Pages | Notes |
|---|---|---|
| A — Demographics | 3 | All patients |
| B — Menstrual/pregnancy/hysterectomy | 5 | Female only (skipped for male) |
| C — Thyroid disease & medication | 6 | C2a surgery + C2b RAI separate screens |
| D — Laboratory capture | 6 | D4=TRAb/TSI (hyper-specific), D5=Anti-TPO/Tg, D6=imaging |
| E — Hyper-specific | 5 | E2 only if Graves', E3 only if Toxic MNG/AFTN, E4 always |
| F — Symptoms | 26 | F8a+F8b split; F26 macroglossia removed |
| G — Treatment & monitoring | 4 | G3 gated by C3; G5 monitoring NEW |
| H — Comorbidities | 7 | H4+H5 female only; H8 osteoporosis NEW |
| **Total** | **~62 female / ~52 male** | Dynamic — varies by answers |

### Key branching rules
- **E1:** Graves' → E2 | Toxic MNG/AFTN → E3 | All others/No/Unsure → skip to E4
- **E4:** Always shown for ALL patients regardless of E1
- **E5:** Hidden if E3 FNAC = Yes (already captured there)
- **G3:** Only shown if C3 (medication) = Yes
- **H5:** Hidden if male OR hysterectomy = Yes (prop OR answered in B1) OR marital = Unmarried/Divorced/Widowed
- **C2b branch point:** If patient became hypothyroid after RAI → `onComplete({ switchToHypo: true })` — Hyper F module replaced by Hypo F1 onwards

### API calls (all correct as of last commit)
```js
conditionAPI.getHyperQ(patientId, episodeId)      // load-on-mount
conditionAPI.saveHyperQ(patientId, episodeId, data) // save draft + final submit
```

---

## Resolved schema decisions (permanent — do not reverse)

| Decision | Resolution |
|---|---|
| C2b → hypothyroid after RAI | Option B: Hyper F module replaced by Hypo F1 onwards. `onComplete({ switchToHypo: true })` fires. |
| G1 missing | C3 serves as gating condition for G3. No separate G1 question. |
| G3 dose change vs C3 duplication | Dose change fields REMOVED from C3. G3 is the dedicated dose change screen. G3 has a Direction field (increased/reduced) not present in Hypo G2. |
| E1 No/Unsure flow | Skip E2 and E3 → go directly to E4. Confirmed correct. |
| F26 macroglossia | REMOVED — not a feature of hyperthyroidism. |
| G5 monitoring question | ADDED — matches Hypo G3. Review frequency: Every 4–6 weeks / 3 months / 6 months / Other. |
| Compliance wording | Standardised: **Regular / Irregular / Skips sometimes** across ALL questionnaires. |
| Ophthalmologist wording | "Assessed by ophthalmologist" — never "Consulted" (language violation). |
| H1 dyslipidaemia | Full medication sub-questions added (name, dose, frequency, since when). Back-port this to Hypo H1 when updating that questionnaire. |
| H2 in Hyper | Diabetes (not anaemia — that's Hypo H2). |
| H8 osteoporosis | NEW in Hyper — relevant as thyrotoxicosis causes bone loss. Not in Hypo. |

---

## Cross-questionnaire differences to remember

| Feature | Hypo | Hyper |
|---|---|---|
| F4 | Cold intolerance | Heat intolerance |
| F17/F18 | Hypersomnia (sleeping too much) | Insomnia (sleeping too little) |
| F18/F19 | Bradycardia (slow pulse) | Palpitations / tachycardia |
| Skin types (F7) | Dryness/Roughness/Pallor/Puffiness/Thickening | Warm/Moist/Flushing/Itching/Pretibial thickening |
| Hair types (F10) | Loss/Thinning/Dryness/Coarsening/Lateral eyebrow loss | Loss/Thinning/Fineness/Silky texture/Softness |
| Nail types (F11) | Brittle/Slow growing/Ridged/Thickened | Brittle/Softening/Onycholysis/Fast growing |
| Hyper-only symptoms | — | Tremors (F15), Anxiety (F16), Irritability (F17), Insomnia (F18), Palpitations (F19), AF (F20), Dyspnoea (F23) |
| Hypo-only symptoms | Abdominal (F6), Hypersomnia (F17), Bradycardia (F18), Hearing (F21), Delayed reflexes (F22), Carpal tunnel (F23), Macroglossia (F24) | — |
| D4 | Anti-TPO + Anti-Tg | TRAb + TSI (hyper-specific) |
| D5 | Imaging | Anti-TPO + Anti-Tg |
| D6 | — | Imaging |
| H1 dyslipidaemia | No medication sub-questions | Full medication sub-questions |
| H2 | Anaemia | Diabetes |
| H3 | PCOS/PMOS | Anaemia |
| H4 | Infertility | PCOS/PMOS |
| H5 | Depression | Infertility |
| H6 | Additional notes | Depression |
| H8 | — | Osteoporosis (NEW) |
| H9 | — | Additional notes |

---

## What to do at the start of next session

### 1. Confirm 004 migration ran
In pgAdmin, run:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'hyper_questionnaire'
AND column_name = 'med_drug_name';
```
If it returns a row, migration ran. If not, run `004_hyper_questionnaire_extended.sql` first.

### 2. Manual output audit — Hypo + Hyper
The user will go through the questionnaires and flag output sentences that don't match the approved schema. For each one flagged:
- Identify which page/key is wrong
- Fix the output template string in the relevant component
- Push to GitHub immediately after each fix

### 3. Thyroid Cancer Questionnaire
Build the TcQuestionnaire as a chatbot-style component matching HyperQuestionnaire architecture:
- Replace the existing `TcQuestionnaire` stub inside `ConditionQuestionnaires.js` (lines 2142–2414 in the original)
- Same pattern: 1 question per page, self-contained, Tc-prefixed UI primitives
- User needs to provide the schema document first (same format as Hyper schema)
- SQL migration: `005_tc_questionnaire_extended.sql` will be needed

---

## Known issues / pending items

| Item | Status |
|---|---|
| 004_hyper_questionnaire_extended.sql — confirm ran in pgAdmin | ⏳ Confirm at session start |
| Manual output audit — Hypo questionnaire | ⏳ Next session |
| Manual output audit — Hyper questionnaire | ⏳ Next session |
| Thyroid Cancer Questionnaire — chatbot style | ⏳ Next session |
| Receipt/PDF invoice generation (patientController.js fix from Session 3) | ⏳ Still pending |
| Appointment scheduling calendar | ⬜ Not started |
| Video session integration (Jitsi / Daily.co) | ⬜ Not started |
| Prescription PDF generation | ⬜ Not started |
| WhatsApp notification templates | ⬜ Not started |
| Deployment (AWS / DigitalOcean / Railway) | ⬜ Not started |
| HIPAA administrative documents | ⬜ Not started |
| Hypo H1 dyslipidaemia — back-port medication sub-questions from Hyper H1 | ⬜ Not started |

---

## Critical rules — always carry forward

### Language
- **"online opinion"** everywhere. Never "consultation" / "consulted" / "consult" in any UI, button, receipt, PDF, code, or DB value.

### Physician portal
- **English only** — always. No i18n on doctor or admin portals.

### API signatures — always 3 arguments
```js
conditionAPI.saveHypoQ(patientId, episodeId, data)
conditionAPI.saveHyperQ(patientId, episodeId, data)
conditionAPI.saveTcQ(patientId, episodeId, data)
```
Never call with only `(episodeId, data)` — patientId is always first.

### Gender / reproductive rules
| Condition | Hidden |
|---|---|
| Male | All of Module B |
| Female + hysterectomy = Yes | B3, B4, B5, H5 |
| Female + Unmarried/Divorced/Widowed | B5, H5 |
| Female + post-menopausal | B4, B5 |

### Questionnaire rules
- 1 question per screen. Yes → expand on same screen. No/Unsure → next screen immediately.
- Duration: date picker preferred, OR years + months pickers.
- Physician output sentence auto-generated on every screen (green italic).
- Save draft on every screen.
- All primitives prefixed: `Hypo` for Hypo, `Hyper` for Hyper, `Tc` for TcQuestionnaire.
- CoreQuestionnaire is NOT part of Add Condition flow.

### GitHub
- Repo: `https://github.com/NuclearCentre/ThyroConsult.git` | Branch: `main`
- Push after every fix. Never leave uncommitted changes.

### Compliance wording (everywhere)
**Regular / Irregular / Skips sometimes**

### EDD formula
**EDD = LMP + 9 months + 7 days**

### Medication output
- All doses meal-adjacent → collapse to "after meals"
- Any dose at bedtime or before meal → list each timing individually

---

*Session ended: 14 June 2026. Resume from manual output audit + Thyroid Cancer Questionnaire.*
