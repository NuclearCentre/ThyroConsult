/**
 * SelectDoctor.js
 *
 * New screen in the "+ Add Condition" flow, between ConditionSelection
 * and Payment. Lets the patient pick a doctor per-opinion rather than
 * being locked to whoever they chose at registration — see
 * AddConditionFlow.js for the full sequence.
 *
 * Shows each doctor's ACTUAL fee for the condition just selected (via
 * paymentAPI.getDoctorFee, which checks doctor_fees first and falls back
 * to the condition_fees global default — see paymentController.js's
 * getDoctorFeeForPatient). This is deliberately NOT the same as
 * doctor.opinionFee from listDoctors — that's the flat registration-time
 * fee from a different, older payment pathway (doctorAccountController.js's
 * bookAppointment) and may not reflect what this condition actually costs
 * with this doctor.
 *
 * Props:
 *   condition   — 'hypothyroidism' | 'hyperthyroidism' | 'thyroid_cancer' | 'nodule'
 *   onComplete  — (doctorId) => void
 *   onBack      — () => void
 */

import React, { useState, useEffect } from 'react';
import { doctorAPI, paymentAPI } from '../api';
import { Spinner, Alert } from './common/index';

const CONDITION_LABELS = {
  hypothyroidism: 'Hypothyroidism',
  hyperthyroidism: 'Hyperthyroidism',
  thyroid_cancer: 'Thyroid Cancer',
  nodule: 'Thyroid Nodule',
};

const RUPEES = paise => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

const SelectDoctor = ({ condition, onComplete, onBack }) => {
  const [doctors, setDoctors] = useState([]);
  const [fees, setFees] = useState({}); // { [doctorId]: { baseFeePaise } | 'error' }
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    doctorAPI.listDoctors()
      .then(async (res) => {
        if (cancelled) return;
        const list = res.doctors || [];
        setDoctors(list);

        // Fetch this condition's actual fee for every doctor in parallel —
        // each doctor may have a custom override or fall back to default.
        const feeEntries = await Promise.all(
          list.map(d =>
            paymentAPI.getDoctorFee({ doctorId: d.id, conditionType: condition })
              .then(r => [d.id, { baseFeePaise: r.baseFeePaise }])
              .catch(() => [d.id, 'error'])
          )
        );
        if (!cancelled) setFees(Object.fromEntries(feeEntries));
      })
      .catch(() => { if (!cancelled) setError('Failed to load doctors. Please try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [condition]);

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    setError('');
    try {
      await onComplete(selected);
      // On success the parent switches away from this screen entirely,
      // so no need to reset confirming here — this component unmounts.
    } catch (err) {
      setConfirming(false);
      setError(err?.response?.data?.error || 'Could not confirm your doctor choice. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <Spinner size={24} />
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>Loading doctors…</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Select a doctor</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Choose which doctor you'd like to review your {CONDITION_LABELS[condition] || condition} opinion.
        You can choose a different doctor next time — this choice is just for this opinion.
      </p>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      {doctors.length === 0 && !error && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          No doctors are currently available. Please try again shortly.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {doctors.map(d => {
          const fee = fees[d.id];
          const isSel = selected === d.id;
          return (
            <div
              key={d.id}
              onClick={() => setSelected(d.id)}
              style={{
                padding: 16,
                border: `2px solid ${isSel ? '#185FA5' : 'var(--border)'}`,
                borderRadius: 12,
                cursor: 'pointer',
                background: isSel ? '#e8f0fb' : 'var(--surface)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: isSel ? '#185FA5' : 'var(--text-primary)' }}>
                    {d.name}
                  </span>
                  {d.isAvailableToday && (
                    <span style={{ fontSize: 10, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 10 }}>
                      Available today
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {d.specialisation} · {d.experienceYears} yrs experience
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {d.qualifications}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {fee === 'error' ? (
                  <span style={{ fontSize: 12, color: 'var(--red-500)' }}>Fee unavailable</span>
                ) : fee ? (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 700, color: isSel ? '#185FA5' : 'var(--text-primary)' }}>
                      {RUPEES(fee.baseFeePaise)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>for this opinion</div>
                  </>
                ) : (
                  <Spinner size={14} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {onBack && (
          <button className="btn btn-secondary" onClick={onBack} disabled={confirming}>
            ← Back
          </button>
        )}
        <button
          className="btn btn-primary btn-lg"
          onClick={handleConfirm}
          disabled={!selected || confirming}
          style={{ marginLeft: 'auto' }}
        >
          {confirming ? <Spinner size={18} color="#fff" /> : 'Continue to payment →'}
        </button>
      </div>
    </div>
  );
};

export default SelectDoctor;
