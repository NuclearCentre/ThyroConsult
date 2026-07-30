/**
 * ConditionSelection.js
 * Step 5.5 — rendered between Step 5 (Choose Doctor) and Step 6 (Upload Reports)
 *
 * Patient selects their condition. This:
 *   1. Calls POST /api/patients/:id/condition-selection
 *   2. Creates the episode in the DB
 *   3. Advances registration_step to 6
 *   4. Passes episodeId + condition back to RegisterPage
 */

import React, { useState } from 'react';
import { conditionAPI } from '../api';
import { Spinner, Alert } from './common/index';

const CONDITIONS = [
  {
    id: 'hypothyroidism',
    icon: '🔵',
    title: 'Hypothyroidism',
    subtitle: 'Underactive thyroid / Hashimoto\'s thyroiditis',
    symptoms: ['Fatigue & weight gain', 'Cold intolerance', 'Hair loss', 'Slow heart rate', 'Depression'],
    color: '#1a5fb4',
    bg: '#e8f0fb',
    border: '#a8c4f0',
  },
  {
    id: 'hyperthyroidism',
    icon: '🟠',
    title: 'Hyperthyroidism',
    subtitle: 'Overactive thyroid / Graves\' Disease',
    symptoms: ['Weight loss & anxiety', 'Rapid heartbeat', 'Heat intolerance', 'Tremors', 'Eye changes (Graves\')'],
    color: '#c8760a',
    bg: '#fef3e2',
    border: '#f9c46b',
  },
  {
    id: 'thyroid_cancer',
    icon: '🔴',
    title: 'Thyroid Cancer',
    subtitle: 'Papillary · Follicular · Medullary · Anaplastic',
    symptoms: ['Neck lump or nodule', 'Hoarseness of voice', 'Difficulty swallowing', 'Neck lymph nodes', 'Previously diagnosed'],
    color: '#a32d2d',
    bg: '#fdf0f0',
    border: '#e8a5a5',
  },
  {
    id: 'nodule',
    icon: '🟣',
    title: 'Thyroid Nodule',
    subtitle: 'Lump or swelling in the thyroid gland',
    symptoms: ['Neck lump or swelling', 'Difficulty swallowing', 'Voice changes', 'Rapidly growing nodule', 'Found on scan/ultrasound'],
    color: '#534AB7',
    bg: '#EEEDFE',
    border: '#c7c2f0',
  },
];

const ConditionSelection = ({ patientId, doctorId, onComplete, onBack }) => {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      // selectCondition takes a single body object — patientId isn't even
      // needed, the backend derives it from the JWT (req.user.patientId).
      // This previously called selectCondition(patientId, selected,
      // doctorId) against a (data) => post(...) signature, so `data`
      // silently became the raw patientId string and condition/doctorId
      // were dropped entirely — the backend always rejected it as an
      // invalid condition.
      const res = await conditionAPI.selectCondition({ condition: selected, doctorId });
      // Backend returns { message, episode } flat, not wrapped in .data.
      const { episode } = res;
      onComplete({ condition: selected, episodeId: episode.id });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save condition selection. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Select your thyroid condition</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Please select the condition for which you are seeking an online opinion.
        Your questionnaire will be tailored to your selection.
      </p>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      {/* ── Important notice ── */}
      <div style={{ padding: '10px 14px', background: '#fffde7', border: '1px solid #f9d923', borderRadius: 8, marginBottom: 20, fontSize: 12, color: '#7a6000', display: 'flex', gap: 8 }}>
        <span>ℹ️</span>
        <span>If you have more than one condition, select the one you are seeking an online opinion for today. You can register for other conditions later from your dashboard.</span>
      </div>

      {/* ── Condition cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {CONDITIONS.map(cond => (
          <div
            key={cond.id}
            onClick={() => setSelected(cond.id)}
            style={{
              padding: 16,
              border: `2px solid ${selected === cond.id ? cond.color : 'var(--border)'}`,
              borderRadius: 12,
              cursor: 'pointer',
              background: selected === cond.id ? cond.bg : 'var(--surface)',
              transition: 'all 0.15s',
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
            }}
          >
            {/* Selection circle */}
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 2,
              border: `2px solid ${selected === cond.id ? cond.color : 'var(--border-md)'}`,
              background: selected === cond.id ? cond.color : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {selected === cond.id && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 18 }}>{cond.icon}</span>
                <span style={{
                  fontSize: 15, fontWeight: 600,
                  color: selected === cond.id ? cond.color : 'var(--text-primary)',
                }}>
                  {cond.title}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {cond.subtitle}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {cond.symptoms.map(s => (
                  <span key={s} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 12,
                    background: selected === cond.id ? `${cond.color}18` : 'var(--gray-100)',
                    color: selected === cond.id ? cond.color : 'var(--text-secondary)',
                    border: `1px solid ${selected === cond.id ? cond.border : 'var(--border)'}`,
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Navigation ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn btn-primary btn-lg"
          onClick={handleConfirm}
          disabled={!selected || loading}
        >
          {loading ? <Spinner size={18} color="#fff" /> : 'Confirm & continue →'}
        </button>
      </div>
    </div>
  );
};

export default ConditionSelection;
