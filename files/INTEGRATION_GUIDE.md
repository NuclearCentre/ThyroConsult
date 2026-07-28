# ThyroConsult — i18n Integration Guide
## How to wire the multilingual system into your existing codebase

---

## Files delivered

| File | Goes to |
|---|---|
| `frontend/src/i18n/locales/en.json` | `src/i18n/locales/en.json` (NEW folder) |
| `frontend/src/i18n/locales/hi.json` | `src/i18n/locales/hi.json` |
| `frontend/src/i18n/I18nContext.js` | `src/i18n/I18nContext.js` |
| `frontend/src/components/LanguageSelector.js` | `src/components/LanguageSelector.js` |
| `frontend/src/components/TranslationDisclaimer.js` | `src/components/TranslationDisclaimer.js` |
| `frontend/src/components/OpinionDownload.js` | `src/components/OpinionDownload.js` |
| `backend/src/services/translationService.js` | `src/services/translationService.js` |
| `backend/src/controllers/opinionDownloadController.js` | `src/controllers/opinionDownloadController.js` |
| `backend/src/routes/languageRoutes.js` | `src/routes/languageRoutes.js` |
| `backend/migrations/add_language_preference.sql` | Run in pgAdmin |

---

## Step 1 — Database migration

Open pgAdmin → thyroconsult database → Query Tool.
Run the entire contents of `add_language_preference.sql`.

You should see: `language_preference | character varying | 'en'`

---

## Step 2 — Backend .env additions

Add these to `D:\Thyroid Consultation Software\ThyroConsult Backend\thyroconsult-backend\.env`:

```env
# Translation provider: libretranslate (free/dev) | google (prod) | deepl (prod)
TRANSLATE_PROVIDER=libretranslate

# LibreTranslate (free, for testing — no key required for public instance)
LIBRETRANSLATE_URL=https://libretranslate.com
LIBRETRANSLATE_KEY=

# Google Cloud Translation (fill in when going to prod)
GOOGLE_TRANSLATE_KEY=

# DeepL (alternative for prod)
DEEPL_KEY=
```

---

## Step 3 — Wire backend routes

Open `src/routes/index.js` and add:

```js
const languageRoutes = require('./languageRoutes');

// Add this line alongside your other router.use() calls:
router.use('/api', languageRoutes);
```

---

## Step 4 — Frontend .env additions

Add to `D:\Thyroid Consultation Software\ThyroConsult Frontend\thyroconsult-frontend\.env`:

```env
# Translation provider: libretranslate (free/dev) | google (backend-proxy, prod)
REACT_APP_TRANSLATE_PROVIDER=libretranslate

# LibreTranslate public instance (free, rate limited — fine for testing)
REACT_APP_LIBRETRANSLATE_URL=https://libretranslate.com
REACT_APP_LIBRETRANSLATE_KEY=

# Backend URL (already set)
REACT_APP_API_URL=http://localhost:7000
```

---

## Step 5 — Wrap App.js with I18nProvider

Open `src/App.js` and wrap the patient routes only:

```jsx
import { I18nProvider } from './i18n/I18nContext';

// ✅ Wrap ONLY the patient portal routes
// ❌ Do NOT wrap doctor or admin routes

function App() {
  return (
    <Router>
      <Routes>
        {/* Patient routes — wrapped in i18n */}
        <Route path="/patient/*" element={
          <I18nProvider>
            <PatientApp />
          </I18nProvider>
        } />

        {/* Doctor routes — NO i18n wrapper, always English */}
        <Route path="/doctor/*" element={<DoctorApp />} />

        {/* Admin routes — NO i18n wrapper, always English */}
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </Router>
  );
}
```

If your app doesn't have this split yet, wrap just the patient layout component instead:

```jsx
// In PatientLayout.js or wherever patient pages are rendered:
import { I18nProvider } from '../i18n/I18nContext';

export default function PatientLayout({ children }) {
  return (
    <I18nProvider>
      {/* your existing patient layout */}
      {children}
    </I18nProvider>
  );
}
```

---

## Step 6 — Add language selector to patient navbar

Open your patient navbar component and add:

```jsx
import LanguageSelector from '../components/LanguageSelector';
import { useAuth } from '../context/AuthContext'; // your existing auth context

// Inside the navbar JSX, next to the logout button:
const { patient } = useAuth();

<LanguageSelector mode="nav" patientId={patient?.id} />
```

---

## Step 7 — Add language selector to Step 1 of registration

Open `src/pages/patient/RegisterPage.js`.

At the very top of Step 1 (before the name fields), add:

```jsx
import LanguageSelector from '../../components/LanguageSelector';

// Inside step 1 render, as the FIRST element:
{step === 1 && (
  <>
    <LanguageSelector mode="page" />
    {/* ... rest of step 1 fields ... */}
  </>
)}
```

---

## Step 8 — Use t() in patient pages

Replace hardcoded English strings with the `t()` function. Example:

```jsx
// Before:
import { useI18n } from '../../i18n/I18nContext';

// After:
const { t } = useI18n();

// Before: <label>First Name</label>
// After:  <label>{t('register.firstName')}</label>

// Before: <button>Next</button>
// After:  <button>{t('register.next')}</button>
```

Key mappings to replace in RegisterPage.js:
```
"First Name"          → t('register.firstName')
"Last Name"           → t('register.lastName')
"Date of Birth"       → t('register.dob')
"Next"                → t('register.next')
"Back"                → t('register.back')
"Guardian Details"    → t('register.guardian')
"Minor Patient"       → t('register.minor')
"This field is required" → t('register.required')
```

For consent text (Step 3), replace the hardcoded strings with:
```jsx
const { t } = useI18n();

// Tab titles:
t('consent.tab1')  // "Consent for Online Opinion"
t('consent.tab2')  // "Privacy & Data Policy"
// etc.

// Consent body text (the long paragraphs):
t('consent.content.consent1_body')
t('consent.content.consent2_body')
// etc.
```

---

## Step 9 — Add disclaimer to translated pages

On any page that shows translated content:

```jsx
import TranslationDisclaimer from '../components/TranslationDisclaimer';

// At the top of the page content (inside the render):
<TranslationDisclaimer />
```

It auto-hides when language is English or Hindi.

---

## Step 10 — Load language on patient login

In your patient login success handler, add:

```jsx
import { useI18n } from '../../i18n/I18nContext';

const { loadLanguagePreference } = useI18n();

// After successful login:
await loadLanguagePreference(patient.id);
```

---

## Step 11 — Replace opinion download button

In the patient dashboard where you show a doctor's opinion, replace the download button with:

```jsx
import OpinionDownload from '../../components/OpinionDownload';

<OpinionDownload
  opinionId={opinion.id}
  patientId={patient.id}
/>
```

---

## Step 12 — DOCTOR PORTAL — no changes needed

The doctor portal does NOT need any i18n changes.
- All patient data shown on doctor side stays in English (it's stored as English in the DB).
- Doctor's advice is typed and stored in English only.
- The translation only happens at PDF generation time for the patient.

**Just make sure you do NOT import I18nProvider or useI18n in any doctor-side component.**

---

## Testing checklist

After wiring everything:

1. ☐ Open patient registration → language tiles appear at top of Step 1
2. ☐ Select Hindi → all labels switch to Hindi
3. ☐ Select Tamil → labels show English with "(Translating...)" spinner briefly
4. ☐ Tamil labels translate and appear (may take a few seconds on first load)
5. ☐ Navbar shows language selector with current language name
6. ☐ Login as test patient → language preference loads from DB
7. ☐ Change language in navbar → page re-renders in new language
8. ☐ Close browser, reopen → language preference remembered
9. ☐ Consent tab text translates correctly
10. ☐ Download opinion as "both" → PDF has English section + Hindi/Tamil section
11. ☐ Auto-translate disclaimer appears for Tamil/Telugu etc., NOT for Hindi
12. ☐ Doctor portal → no language selector, all English ✓
13. ☐ Doctor viewing patient details → all in English ✓

---

## LibreTranslate rate limits (testing)

The free public LibreTranslate instance at libretranslate.com:
- Rate limit: ~5 requests/minute on the free tier
- For testing: this is fine since translations are cached after first load
- For prod: either self-host LibreTranslate (Docker, free) or switch to Google Translate

**Self-hosting LibreTranslate (recommended for testing at scale):**
```bash
docker run -it -p 5000:5000 libretranslate/libretranslate
```
Then set: `LIBRETRANSLATE_URL=http://localhost:5000` (no key needed)

---

## Switching to paid API for production

Change ONE line in `.env`:

```env
# Dev:
TRANSLATE_PROVIDER=libretranslate

# Prod (Google):
TRANSLATE_PROVIDER=google
GOOGLE_TRANSLATE_KEY=your_key_here
```

No code changes required.

---

## Adding more languages later

1. Add the language to `SUPPORTED_LANGUAGES` array in `I18nContext.js`
2. If you want manual translation: add a new JSON file in `src/i18n/locales/` and import it
3. If AI translation is fine: just add the code — the API handles it automatically

---

*Generated: Session 3 — Multilingual system*
