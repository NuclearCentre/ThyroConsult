# ThyroConsult — Full UI Translation (i18n) Plan
**Status:** Scoping only — not yet built. Reference this before starting implementation.
**Builds on:** the AI-translation pipeline already shipped (migration 019) — patient free-text answers → English for the doctor, doctor's opinion → patient's language. This plan is a *different, larger* layer: translating the app's own static UI (labels, buttons, questionnaire text) into the patient's selected language.

---

## 1. What's already built vs. what this covers

| Already shipped (migration 019) | This plan (not yet built) |
|---|---|
| Patient's own typed free-text answers → English, for the doctor | Every static label/button/heading in the app UI |
| Doctor's opinion → patient's language | All question text across Core + Hypo + Hyper + TC + Nodule questionnaires |
| Content is **per-patient, dynamic**, stored in the DB (`field_translations`, `opinions.*_translated`) | Content is **the same for every patient**, static — doesn't belong in the DB, belongs in the frontend build |

These are genuinely separate systems. The first translates *content the patient or doctor wrote*. This one translates *the app itself*.

---

## 2. Two-tier scope

### Tier A — Static UI chrome
Sidebar labels, "Sign out", dashboard headings ("Good day, X"), stat card labels ("Total Opinions", "Next Appointment"), button text, form field labels outside the questionnaires themselves. Smaller (a few hundred short strings), high visual impact, good first deliverable.

**Files known to need string-extraction work** (from what's been uploaded so far — there may be more not yet seen):
- `PatientPortal.js` (Dashboard, My Conditions, Opinion history, Profile — headings/labels)
- `Sidebar.js` (nav labels — **not yet uploaded**, needed before starting)
- `LoginPage.js`, `RegisterPage.js` (**not yet uploaded**)
- `ConditionSelection.js` (the "Add condition" picker screen)
- `common/index.js` (shared components: `SectionHeader`, `EmptyState`, `Badge` labels, etc. — mostly take text as props from callers, so the real work is at each call site, not in this file)

### Tier B — Questionnaire content
Every question, hint, option label, and validation message across `CoreQuestionnaire.js`, `ConditionQuestionnaires.js` (Hypo + Hyper), `TcQuestionnaire.js`, `NoduleQuestionnaire.js`. This is **substantially larger** than Tier A — Hypo alone is 400+ lines of UI in a single file; across all five questionnaires this is realistically **thousands** of individual strings once hints, option labels, and validation messages are counted, not just the visible questions.

---

## 3. Recommended architecture

### 3.1 Translation key system
Extract every UI string into a key, e.g.:
```
dashboard.goodDay        → "Good day"
sidebar.signOut          → "Sign out"
hypo.a1.question         → "What is your date of birth?"
hypo.a1.hint             → "Enter the exact date if you know it"
```
All app **logic** (branching rules, field names, API payloads, DB columns) stays keyed in English/internal IDs exactly as today — only the **display text** swaps per language. This is important: it means none of your branching logic, validation rules, or backend contracts need to change, only what's rendered.

### 3.2 Pre-translate once, cache as static files — not live API calls
Given the volume (thousands of strings × 10 languages), translating at render time via the Claude API would be slow, expensive per-render, and could produce *inconsistent* wording for the same label across different sessions. Instead:

1. A one-time (then re-run-on-change) **batch script** — not part of the running app — extracts every English string, calls the Claude API once per language, and writes the result to static JSON files: `src/i18n/en.json`, `src/i18n/gu.json`, `src/i18n/hi.json`, etc.
2. The app reads from these bundled JSON files via a small `useTranslation()`-style hook, keyed off `patient.preferredLanguage`. Zero runtime API calls, instant rendering, works offline once loaded.
3. **Regeneration trigger**: the script only needs re-running for languages whose English source strings actually changed — track this with a content hash per key, not a full re-translation every time.

This is a genuinely different mechanism from migration 019's pipeline (which *must* be live/dynamic, since it's translating content that doesn't exist until a specific patient writes it). Worth being clear about that distinction when you're reviewing this later.

### 3.3 Physician-side preview toggle (per your decision this session)
When a patient's `preferred_language !== 'en'`, `OpinionWriter` gets a **language toggle** so the physician can see exactly what the patient saw/will see — not just the translated free-text answers (already built), but the full questionnaire UI itself, rendered read-only, in the patient's language, using the same Tier B dictionary.

This needs a new **review/preview mode** on the questionnaire components themselves (`HypoQuestionnaire`, `HyperQuestionnaire`, `TcQuestionnaire`, `NoduleQuestionnaire`) — a mode that is:
- Read-only (no editing, no save calls)
- Pre-filled with the patient's actual stored answers
- Rendered using the Tier B translation dictionary for the toggled language instead of English

This reuses the existing per-question components' layout/branching logic (so behavior stays consistent with what the patient actually experienced) but adds a new rendering path — real but scoped work, not a rebuild.

---

## 4. Suggested rollout order

1. **Tier A (static chrome)** — smallest, most visible win. Start here.
2. **Core Questionnaire (Tier B)** — shared intake, run before every condition, so translating it benefits all four conditions at once.
3. **Hypo Questionnaire (Tier B)** — matches your current testing priority (item 2 from the original session).
4. **Physician preview toggle for Hypo specifically** — validate the review-mode pattern on one questionnaire before replicating.
5. **Hyper / TC / Nodule (Tier B)** + their physician toggles — once the Hypo pattern is proven out.

---

## 5. Things to decide before implementation starts

- **Clinical-accuracy review**: AI-translated medical terminology (symptom names, medication instructions, investigation names) should ideally get a native-speaking clinician's review pass before going live — an AI translation error in a *questionnaire question* is a different risk profile than in a casual UI label. Worth deciding whether that review happens before or after initial deployment, and who does it.
- **Locale-formatted numbers/dates**: dates currently render as `en-IN` (e.g. `toLocaleDateString('en-IN', ...)` throughout `PatientPortal.js`) — decide whether these should also localize per language, or stay in a consistent Indian-English date format regardless of UI language (common choice for medical records, for consistency/legal purposes).
- **Missing files needed to actually start**: `Sidebar.js`, `LoginPage.js`, `RegisterPage.js`, `ConditionSelection.js` haven't been uploaded yet — needed for a complete Tier A string inventory before the batch-translation script can run meaningfully.
- **Library vs. custom**: this plan assumes a small custom dictionary/hook system (consistent with the rest of this hand-rolled codebase, no new dependency). An alternative is adopting `react-i18next` (battle-tested, more features like pluralization) at the cost of a new dependency and some rework of how components currently receive text. Recommend the custom approach unless there's a reason to want the extra features.

---

## 6. Not in scope for this plan
- Translating PDF outputs (Advise Letter) — already has its own translation-at-generation-time model from migration 019, unaffected by this.
- Translating physician-facing screens themselves — stays English-only throughout, per your standing platform rule ("Physician portal: English only, always"). The only physician-facing exception is the new preview *toggle*, which is physician **choosing** to view the patient's version, not the physician's own UI changing language.
