// src/components/physician/OpinionWriter.js
// Doctor writes / amends structured opinion
// Sections: Clinical Summary | Impression | Advice | Investigations + Remarks

import React, { useState, useEffect, useCallback } from 'react';
import { physicianAPI, adviseLetterAPI } from '../../api/index';

// ─── Tiny reusable field ──────────────────────────────────────────────────

function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
        {hint && <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function Textarea({ value, onChange, placeholder, minRows = 4 }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '10px 12px', borderRadius: 8,
        border: '1px solid #d1d5db', fontSize: 14,
        color: '#111827', resize: 'vertical',
        fontFamily: 'system-ui, sans-serif', lineHeight: 1.6,
        outline: 'none',
      }}
      onFocus={e => e.target.style.border = '1px solid #3a7bd5'}
      onBlur={e => e.target.style.border = '1px solid #d1d5db'}
    />
  );
}

// ─── Investigation picker ─────────────────────────────────────────────────

function InvestigationPicker({ selected, onChange }) {
  const [masterList, setMasterList]   = useState({});
  const [loadingList, setLoadingList] = useState(true);
  const [customInput, setCustomInput] = useState('');
  const [customNote, setCustomNote]   = useState('');
  const [searchTerm, setSearchTerm]   = useState('');

  useEffect(() => {
    physicianAPI.getInvestigationMaster()
      .then(res => setMasterList(res.data || {}))
      .catch(() => setMasterList({}))
      .finally(() => setLoadingList(false));
  }, []);

  const isSelected = (id) => selected.some(s => s.id === id);

  const toggle = (item, category) => {
    if (isSelected(item.id)) {
      onChange(selected.filter(s => s.id !== item.id));
    } else {
      onChange([...selected, { id: item.id, name: item.name, category, is_custom: false, note: '' }]);
    }
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    const customId = `custom_${Date.now()}`;
    onChange([...selected, { id: customId, name: trimmed, category: 'Custom', is_custom: true, note: customNote.trim() }]);
    setCustomInput('');
    setCustomNote('');
  };

  const removeSelected = (id) => onChange(selected.filter(s => s.id !== id));

  const updateNote = (id, note) => {
    onChange(selected.map(s => s.id === id ? { ...s, note } : s));
  };

  const allTests = Object.entries(masterList).flatMap(([cat, tests]) =>
    tests.map(t => ({ ...t, category: cat }))
  );
  const filtered = searchTerm.trim()
    ? allTests.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : null;

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        placeholder="Search tests…"
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '8px 12px', borderRadius: 8,
          border: '1px solid #d1d5db', fontSize: 13,
          marginBottom: 12,
        }}
      />

      {loadingList ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading investigation list…</div>
      ) : (
        <div style={{
          maxHeight: 280, overflowY: 'auto',
          border: '1px solid #e5e7eb', borderRadius: 8,
          padding: '8px 0', marginBottom: 12,
        }}>
          {(filtered ? [{ cat: 'Search Results', tests: filtered }]
                     : Object.entries(masterList).map(([cat, tests]) => ({ cat, tests }))).map(({ cat, tests }) => (
            <div key={cat}>
              <div style={{
                padding: '6px 14px', fontSize: 11, fontWeight: 700,
                color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1,
                background: '#f9fafb',
              }}>
                {cat}
              </div>
              {tests.map(item => (
                <label key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 14px', cursor: 'pointer', fontSize: 13,
                  background: isSelected(item.id) ? '#eff6ff' : 'transparent',
                  transition: 'background 0.1s',
                }}>
                  <input
                    type="checkbox"
                    checked={isSelected(item.id)}
                    onChange={() => toggle(item, cat)}
                    style={{ accentColor: '#3a7bd5', width: 15, height: 15 }}
                  />
                  <span style={{ color: '#111827' }}>{item.name}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Custom test */}
      <div style={{
        border: '1px dashed #d1d5db', borderRadius: 8,
        padding: 12, marginBottom: 16, background: '#fafafa',
      }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          ADD CUSTOM TEST
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input
            type="text"
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            placeholder="Test name…"
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 6,
              border: '1px solid #d1d5db', fontSize: 13,
            }}
            onKeyDown={e => e.key === 'Enter' && addCustom()}
          />
          <button onClick={addCustom} style={{
            padding: '7px 16px', borderRadius: 6,
            background: '#3a7bd5', color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            Add
          </button>
        </div>
        <input
          type="text"
          value={customNote}
          onChange={e => setCustomNote(e.target.value)}
          placeholder="Note for this test (optional)…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '7px 10px', borderRadius: 6,
            border: '1px solid #d1d5db', fontSize: 13,
          }}
        />
      </div>

      {/* Selected list */}
      {selected.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
            SELECTED ({selected.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selected.map(item => (
              <div key={item.id} style={{
                padding: '8px 12px', borderRadius: 7,
                background: '#eff6ff', border: '1px solid #bfdbfe',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
                    {item.is_custom && <span style={{ fontSize: 10, background: '#dbeafe', padding: '1px 5px', borderRadius: 4, marginRight: 6 }}>CUSTOM</span>}
                    {item.name}
                  </span>
                  <button
                    onClick={() => removeSelected(item.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
                <input
                  type="text"
                  value={item.note}
                  onChange={e => updateNote(item.id, e.target.value)}
                  placeholder="Specific instruction for this test (optional)…"
                  style={{
                    marginTop: 6, width: '100%', boxSizing: 'border-box',
                    padding: '5px 8px', borderRadius: 5,
                    border: '1px solid #bfdbfe', fontSize: 12, background: '#fff',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────

function SectionCard({ number, title, children, accent = '#3a7bd5' }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 12,
      overflow: 'hidden', marginBottom: 20,
    }}>
      <div style={{
        padding: '12px 20px',
        background: accent + '0d',
        borderBottom: `2px solid ${accent}22`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: '50%',
          background: accent, color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {number}
        </span>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{title}</span>
      </div>
      <div style={{ padding: '20px 20px 4px' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Translation correction section (migration 019) ───────────────────────
// Only the free-text fields that FREE_TEXT_FIELDS (conditionController.js)
// can ever translate show up here — this mirrors that list exactly so a
// mismatch between frontend/backend surfaces immediately as a missing label
// rather than silently.
const CONDITION_TABLE_MAP = {
  hypothyroidism:  'hypo_questionnaire',
  hyperthyroidism: 'hyper_questionnaire',
  thyroid_cancer:  'tc_questionnaire',
  nodule:          'nodule_questionnaire',
};

const FIELD_LABELS = {
  // core_questionnaire
  chief_complaint: 'Chief complaint',
  sym_menstrual_changes: 'Menstrual changes',
  surgical_history_details: 'Surgical history details',
  allergies: 'Allergies',
  occupation: 'Occupation',
  sym_other: 'Other symptoms',
  pmh_autoimmune_details: 'Autoimmune history details',
  pmh_autoimmune_other: 'Other autoimmune condition',
  hysterectomy_reason_other: 'Hysterectomy reason (other)',
  pmh_previous_thyroid_details: 'Previous thyroid diagnosis details',
  pmh_neck_radiation_details: 'Neck radiation history details',
  pmh_other: 'Other past medical history',
  fh_thyroid_details: 'Family thyroid history details',
  fh_thyroid_cancer_details: 'Family thyroid cancer details',
  fh_autoimmune_details: 'Family autoimmune history details',
  fh_other: 'Other family history',
  radiation_exposure_details: 'Radiation exposure details',
  // hyper_questionnaire / tc_questionnaire (shared field names)
  graves_dermopathy_details: "Graves' dermopathy details",
  fnac_details: 'FNAC details',
  mtc_ret_mutation_details: 'RET mutation details',
  surveillance_notes: 'Surveillance notes',
  // nodule_questionnaire
  occupation_other: 'Occupation (other)',
  nodule_discovery_other: 'Nodule discovery — other',
  outcomes_details: 'Outcomes details',
  patient_concern_other: "Patient's primary concern (other)",
  autoimmune_other: 'Other autoimmune condition',
  radiation_exposure_other: 'Radiation exposure (other)',
  additional_notes: 'Additional notes',
  opinion_trigger_other: 'Reason for seeking opinion (other)',
};

function fieldLabel(field) {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

function TranslationReviewSection({ episodeId, questionnaire, conditionType }) {
  const table = CONDITION_TABLE_MAP[conditionType];
  const translations = questionnaire?.field_translations || {};
  const fields = Object.keys(translations);

  const [drafts,  setDrafts]  = useState(() => {
    const initial = {};
    fields.forEach(f => { initial[f] = translations[f]?.en_corrected ?? translations[f]?.en_ai ?? ''; });
    return initial;
  });
  const [saving,  setSaving]  = useState({});
  const [savedOk, setSavedOk] = useState({});

  if (!table || fields.length === 0) return null; // nothing to translate — patient's language is English, or condition unrecognised

  const saveCorrection = async (field) => {
    setSaving(s => ({ ...s, [field]: true }));
    setSavedOk(s => ({ ...s, [field]: false }));
    try {
      await physicianAPI.correctFieldTranslation(episodeId, table, field, drafts[field]);
      setSavedOk(s => ({ ...s, [field]: true }));
    } catch (err) {
      alert('Could not save this correction. Please try again.');
    } finally {
      setSaving(s => ({ ...s, [field]: false }));
    }
  };

  return (
    <SectionCard number="🌐" title="Patient's Translated Answers" accent="#0891b2">
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        The patient answered these in their own language. Shown below is the AI's English
        translation — edit and save any that read awkwardly or need clinical correction. Your
        correction is saved separately from the AI's original output.
      </p>
      {fields.map(field => (
        <Field key={field} label={fieldLabel(field)}>
          <Textarea
            value={drafts[field]}
            onChange={(val) => { setDrafts(d => ({ ...d, [field]: val })); setSavedOk(s => ({ ...s, [field]: false })); }}
            minRows={2}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <button
              onClick={() => saveCorrection(field)}
              disabled={saving[field]}
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: '1px solid #0891b2', background: '#fff', color: '#0891b2',
                cursor: saving[field] ? 'wait' : 'pointer',
              }}
            >
              {saving[field] ? 'Saving…' : 'Save correction'}
            </button>
            {savedOk[field] && <span style={{ fontSize: 12, color: '#166534' }}>✓ Saved</span>}
          </div>
        </Field>
      ))}
    </SectionCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export default function OpinionWriter({ episodeId, existingOpinion, questionnaire, conditionType, onSaved, onSubmitted, onBack }) {
  const [form, setForm] = useState({
    clinicalSummary: '',
    impression:      '',
    advice:          '',
    investigations:  [],
    remarks:         '',
  });
  const [saving,           setSaving]           = useState(false);
  const [submitting,       setSubmitting]        = useState(false);
  const [errors,           setErrors]            = useState({});
  const [savedMsg,         setSavedMsg]          = useState('');
  const [isAmending,       setIsAmending]        = useState(false);
  const [generatingLetter, setGeneratingLetter]  = useState(false);
  const [letterMsg,        setLetterMsg]         = useState('');
  const [letterGenerated,  setLetterGenerated]   = useState(
    !!(existingOpinion?.adviseLetterGeneratedAt)
  );

  useEffect(() => {
    if (existingOpinion) {
      setForm({
        clinicalSummary: existingOpinion.clinicalSummary || '',
        impression:      existingOpinion.impression      || '',
        advice:          existingOpinion.advice          || '',
        investigations:  existingOpinion.investigations  || [],
        remarks:         existingOpinion.remarks         || '',
      });
      setIsAmending(existingOpinion.status === 'submitted');
    }
  }, [existingOpinion]);

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  const validate = () => {
    const e = {};
    if (!form.clinicalSummary.trim()) e.clinicalSummary = 'Required before submitting';
    if (!form.impression.trim())      e.impression      = 'Required before submitting';
    if (!form.advice.trim())          e.advice          = 'Required before submitting';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveDraft = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      if (isAmending) {
        await physicianAPI.amendOpinion(existingOpinion.opinionId, form);
        setSavedMsg('Amendment saved.');
      } else {
        await physicianAPI.saveDraftOpinion(episodeId, form);
        setSavedMsg('Draft saved.');
      }
      onSaved && onSaved();
    } catch (err) {
      setSavedMsg('Save failed — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await physicianAPI.submitOpinion(episodeId, form);
      onSubmitted && onSubmitted();
    } catch (err) {
      setErrors({ submit: err?.response?.data?.message || 'Submission failed — please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = existingOpinion?.status === 'acknowledged';

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 780, margin: '0 auto', padding: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#64748b' }}
        >
          ←
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
            {isLocked ? 'Online Opinion (Read-only)' :
             isAmending ? 'Amend Online Opinion' :
             existingOpinion?.status === 'draft' ? 'Continue Draft Opinion' :
             'Write Online Opinion'}
          </h2>
          {isLocked && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              Patient has acknowledged this opinion — no further changes allowed.
            </p>
          )}
          {isAmending && !isLocked && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#92400e', background: '#fef3c7', padding: '4px 10px', borderRadius: 6, display: 'inline-block' }}>
              ⚠ Opinion already submitted — amendments will update the patient's view until acknowledged.
            </p>
          )}
        </div>
      </div>

      {/* Patient's translated free-text answers, if any needed translation */}
      <TranslationReviewSection episodeId={episodeId} questionnaire={questionnaire} conditionType={conditionType} />

      {/* Section 1 — Clinical Summary */}
      <SectionCard number="1" title="Clinical Summary" accent="#3a7bd5">
        <Field label="Clinical Summary" required hint="Summarise the patient's presentation and history">
          <Textarea
            value={form.clinicalSummary}
            onChange={set('clinicalSummary')}
            placeholder="e.g. 42-year-old female presenting with fatigue, weight gain, and cold intolerance for 6 months. TSH elevated at 12.4 mIU/L…"
            minRows={5}
          />
          {errors.clinicalSummary && <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0' }}>{errors.clinicalSummary}</p>}
        </Field>
      </SectionCard>

      {/* Section 2 — Impression */}
      <SectionCard number="2" title="Impression / Diagnosis" accent="#7c3aed">
        <Field label="Clinical Impression" required hint="Your diagnostic conclusion">
          <Textarea
            value={form.impression}
            onChange={set('impression')}
            placeholder="e.g. Primary hypothyroidism — likely autoimmune (Hashimoto's thyroiditis) based on elevated Anti-TPO and clinical picture…"
            minRows={4}
          />
          {errors.impression && <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0' }}>{errors.impression}</p>}
        </Field>
      </SectionCard>

      {/* Section 3 — Advice */}
      <SectionCard number="3" title="Advice" accent="#059669">
        <Field label="Treatment & Lifestyle Advice" required hint="Medication, diet, lifestyle, follow-up">
          <Textarea
            value={form.advice}
            onChange={set('advice')}
            placeholder="e.g. Start Levothyroxine 50 mcg once daily on empty stomach, 30 minutes before breakfast. Avoid soy products and calcium within 4 hours of dose. Review TSH in 6–8 weeks…"
            minRows={6}
          />
          {errors.advice && <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0' }}>{errors.advice}</p>}
        </Field>
      </SectionCard>

      {/* Section 4 — Investigations */}
      <SectionCard number="4" title="Advised Investigations" accent="#d97706">
        <Field label="Investigations" hint="Select from list or add custom">
          <InvestigationPicker
            selected={form.investigations}
            onChange={set('investigations')}
          />
        </Field>
      </SectionCard>

      {/* Remarks */}
      <div style={{ marginBottom: 24 }}>
        <Field label="Additional Remarks" hint="Optional — any other notes for the patient">
          <Textarea
            value={form.remarks}
            onChange={set('remarks')}
            placeholder="Any additional instructions, reassurances, or notes…"
            minRows={3}
          />
        </Field>
      </div>

      {/* Submit error */}
      {errors.submit && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {errors.submit}
        </div>
      )}

      {/* Saved message */}
      {savedMsg && (
        <div style={{
          padding: 10, background: '#f0fdf4', color: '#166534',
          borderRadius: 8, marginBottom: 16, fontSize: 13,
        }}>
          ✓ {savedMsg}
        </div>
      )}

      {/* Action buttons */}
      {!isLocked && (
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={saveDraft}
            disabled={saving}
            style={{
              padding: '10px 24px', borderRadius: 8,
              border: '1px solid #d1d5db', background: '#fff',
              color: '#374151', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            {saving ? 'Saving…' : isAmending ? 'Save Amendment' : 'Save Draft'}
          </button>
          <button
            onClick={submit}
            disabled={submitting || isAmending}
            title={isAmending ? 'Use Save Amendment for already-submitted opinions' : ''}
            style={{
              padding: '10px 28px', borderRadius: 8,
              background: isAmending ? '#94a3b8' : '#3a7bd5',
              color: '#fff', border: 'none',
              cursor: isAmending ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700,
            }}
          >
            {submitting ? 'Submitting…' :
             isAmending  ? 'Already Submitted' :
             'Submit Online Opinion'}
          </button>
        </div>
      )}

      {/* ── Generate Advise Letter — shown only after opinion submitted ── */}
      {(isAmending || isLocked) && (
        <div style={{
          marginTop: 28,
          padding: '20px 24px',
          borderRadius: 10,
          border: `2px solid ${letterGenerated ? '#86efac' : '#fcd34d'}`,
          background: letterGenerated ? '#f0fdf4' : '#fffbeb',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6,
            color: letterGenerated ? '#15803d' : '#92400e' }}>
            {letterGenerated ? '✓ Advise Letter Generated' : '📄 Generate Advise Letter'}
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 13,
            color: letterGenerated ? '#166534' : '#78350f' }}>
            {letterGenerated
              ? 'The Advise Letter has been generated and sent to the patient. You can regenerate it or download it below.'
              : 'Generate the Advise Letter PDF for this patient. It will be saved to both dashboards and the patient will be notified via WhatsApp and email.'}
          </p>

          {letterMsg && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
              background: letterMsg.includes('successfully') ? '#dcfce7' : '#fee2e2',
              color:      letterMsg.includes('successfully') ? '#166534' : '#991b1b',
            }}>
              {letterMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                setGeneratingLetter(true);
                setLetterMsg('');
                try {
                  await adviseLetterAPI.generate(episodeId);
                  setLetterGenerated(true);
                  setLetterMsg('Advise Letter generated successfully. Patient has been notified.');
                } catch (err) {
                  setLetterMsg(err?.response?.data?.message || 'Failed to generate Advise Letter.');
                } finally {
                  setGeneratingLetter(false);
                }
              }}
              disabled={generatingLetter}
              style={{
                padding: '9px 22px', borderRadius: 8,
                background: '#d97706', color: '#fff',
                border: 'none', cursor: generatingLetter ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 700,
              }}
            >
              {generatingLetter ? 'Generating…' : letterGenerated ? 'Regenerate Letter' : 'Generate Advise Letter'}
            </button>

            {letterGenerated && (
              <button
                onClick={() => {
                  window.open(
                    `${process.env.REACT_APP_API_URL}/physician/episode/${episodeId}/advise-letter/download`,
                    '_blank'
                  );
                }}
                style={{
                  padding: '9px 22px', borderRadius: 8,
                  background: '#fff', color: '#15803d',
                  border: '1px solid #86efac',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                ⬇ Download PDF
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
