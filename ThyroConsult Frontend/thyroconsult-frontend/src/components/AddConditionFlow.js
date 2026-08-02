/**
 * AddConditionFlow.js
 *
 * NEW — orchestrates the full "+ Add Condition" sequence:
 *   Select Condition -> Select Doctor -> Payment -> Core Questionnaire
 *   -> Condition Questionnaire -> Submit
 *
 * This did not exist before (confirmed: PatientDashboard.js had no
 * "Add Condition" button, no import of ConditionSelection/CoreQuestionnaire
 * anywhere — the flow described in ConditionSelection.js's own header
 * comment was aspirational, never actually wired up). Built fresh rather
 * than extending anything.
 *
 * Mount this from PatientDashboard.js when the patient clicks
 * "+ Add Condition" — see the integration snippet at the bottom of this
 * file's comments for the minimal wiring needed there.
 *
 * Props:
 *   patient      — { id, gender, dob, name, email, phone } (from PatientDashboard's `patient` state)
 *   onDone       — () => void  (called on submit, or when patient exits early — return to dashboard)
 */

import React, { useState, useCallback } from 'react';
import { paymentAPI, conditionAPI } from '../api';
import { loadRazorpayScript } from '../utils/loadRazorpay';
import ConditionSelection from './ConditionSelection';
import SelectDoctor from './SelectDoctor';
import CoreQuestionnaire from './CoreQuestionnaire';
import HypoQuestionnaire from './HypoQuestionnaire';
import HyperQuestionnaire from './HyperQuestionnaire';
import TcQuestionnaire from './TcQuestionnaire';
import NoduleQuestionnaire from './NoduleQuestionnaire';
import { Spinner, Alert } from './common/index';

const CONDITION_LABELS = {
  hypothyroidism: 'Hypothyroidism',
  hyperthyroidism: 'Hyperthyroidism',
  thyroid_cancer: 'Thyroid Cancer',
  nodule: 'Thyroid Nodule',
};

const STEPS = {
  CONDITION:  'condition',
  DOCTOR:     'doctor',
  PAYMENT:    'payment',
  CORE_Q:     'core_questionnaire',
  CONDITION_Q:'condition_questionnaire',
};

const RUPEES = paise => `₹${(paise / 100).toLocaleString('en-IN')}`;

const AddConditionFlow = ({ patient, onDone }) => {
  const [step, setStep] = useState(STEPS.CONDITION);
  const [condition, setCondition] = useState(null);
  const [episodeId, setEpisodeId] = useState(null);
  const [doctorId, setDoctorId] = useState(null);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  // HyperQuestionnaire, TcQuestionnaire, and NoduleQuestionnaire all
  // require maritalStatus/hysterectomyDone as external props (confirmed
  // via their actual prop destructuring — only HypoQuestionnaire computes
  // this internally from its own state). Sourced from CoreQuestionnaire's
  // saved answers once Core completes.
  const [sharedDemographics, setSharedDemographics] = useState({ maritalStatus: null, hysterectomyDone: null });

  // ── Step 1: Select Condition ──
  // NOTE: ConditionSelection currently calls conditionAPI.selectCondition
  // immediately on confirm, creating the episode with whatever doctorId
  // prop it was given (or the patient's registration-time default if
  // none). Since doctor choice now happens in the NEXT step, this episode
  // gets created with a provisional/default doctor first, then
  // re-assigned once Select Doctor confirms — selectCondition's existing
  // ON CONFLICT...COALESCE logic on primary_doctor_id doesn't overwrite
  // a doctor once set, so the Select Doctor step calls it again explicitly
  // with the chosen doctorId to force the update (see handleDoctorSelected).
  const handleConditionSelected = useCallback(({ condition: cond, episodeId: epId }) => {
    setCondition(cond);
    setEpisodeId(epId);
    setStep(STEPS.DOCTOR);
  }, []);

  // ── Step 2: Select Doctor ──
  // Re-calls selectCondition with the chosen doctorId so it actually
  // overwrites primary_doctor_id on the episode this time — see note above.
  const handleDoctorSelected = useCallback(async (chosenDoctorId) => {
    setDoctorId(chosenDoctorId);
    try {
      await conditionAPI.selectCondition({ condition, doctorId: chosenDoctorId });
    } catch (err) {
      console.error('Failed to assign chosen doctor to episode:', err);
      // Non-fatal — the episode still has a doctor (the provisional one),
      // just not the one the patient just picked. Surface this rather
      // than silently continuing with the wrong doctor.
      setPaymentError('Could not confirm your doctor choice. Please try again.');
      return;
    }
    setStep(STEPS.PAYMENT);
  }, [condition]);

  // ── Step 3: Payment ──
  // Uses the NEW 'initial' scenario (see paymentController.js's
  // resolvePayment) — this is a brand-new episode with no questionnaire
  // content yet, so it's distinct from the S1/S2/S3 follow-up payments
  // PatientDashboard.js's handlePay already does for existing episodes.
  const handlePay = useCallback(async () => {
    setPaying(true);
    setPaymentError('');
    try {
      await loadRazorpayScript();
      const order = await paymentAPI.createOrder({
        episodeId,
        scenario: 'initial',
        conditionType: condition,
      });

      const options = {
        key:      order.keyId,
        amount:   order.amountPaise,
        currency: 'INR',
        name:     'ThyroConsult',
        description: `Online opinion — ${CONDITION_LABELS[condition]}`,
        order_id: order.orderId,
        prefill: {
          name:    patient.name,
          email:   patient.email,
          contact: patient.phone,
        },
        theme: { color: '#185FA5' },
        handler: async (response) => {
          await paymentAPI.verifyPayment({
            razorpayOrderId:   response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setStep(STEPS.CORE_Q);
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => {
        setPaying(false);
        setPaymentError('Payment failed. Please try again.');
      });
      rzp.open();
    } catch (err) {
      console.error('Payment error:', err);
      setPaymentError('Could not start payment. Please try again.');
    } finally {
      setPaying(false);
    }
  }, [episodeId, condition, patient]);

  // ── Step 4: Core Questionnaire ──
  // Hyper/TC/Nodule need maritalStatus + hysterectomyDone as props (see
  // note above) — CoreQuestionnaire.js confirms the actual saved field
  // names: marital_status and pmh_hysterectomy (raw columns, present in
  // getCoreQuestionnaire's response alongside its decrypted fields).
  const handleCoreComplete = useCallback(async () => {
    try {
      const core = await conditionAPI.getCoreQ(patient.id, episodeId);
      setSharedDemographics({
        maritalStatus: core?.marital_status || null,
        hysterectomyDone: !!core?.pmh_hysterectomy,
      });
    } catch (err) {
      console.error('Failed to fetch core questionnaire data:', err);
      // Non-fatal — Hyper/TC/Nodule will just show Module B questions
      // that redundantly re-ask what Core already captured, rather than
      // blocking the flow entirely.
    }
    setStep(STEPS.CONDITION_Q);
  }, [patient.id, episodeId]);

  // ── Step 5: Condition-specific questionnaire ──
  const handleQuestionnaireComplete = useCallback(() => {
    onDone && onDone();
  }, [onDone]);

  // ── Render ──
  if (step === STEPS.CONDITION) {
    return (
      <ConditionSelection
        patientId={patient.id}
        doctorId={null}
        onComplete={handleConditionSelected}
        onBack={onDone}
      />
    );
  }

  if (step === STEPS.DOCTOR) {
    return (
      <SelectDoctor
        condition={condition}
        onComplete={handleDoctorSelected}
        onBack={() => setStep(STEPS.CONDITION)}
      />
    );
  }

  if (step === STEPS.PAYMENT) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', padding: 32 }}>
        <h3 style={{ marginBottom: 8 }}>Payment</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
          Complete payment to unlock the {CONDITION_LABELS[condition]} questionnaire.
        </p>
        {paymentError && <Alert type="error" message={paymentError} style={{ marginBottom: 16 }} />}
        <button className="btn btn-primary btn-lg" onClick={handlePay} disabled={paying}>
          {paying ? <Spinner size={18} color="#fff" /> : 'Pay & continue →'}
        </button>
      </div>
    );
  }

  if (step === STEPS.CORE_Q) {
    return (
      <CoreQuestionnaire
        patientId={patient.id}
        episodeId={episodeId}
        condition={condition}
        patientGender={patient.gender}
        patientDob={patient.dob}
        onComplete={handleCoreComplete}
        onBack={() => setStep(STEPS.PAYMENT)}
      />
    );
  }

  if (step === STEPS.CONDITION_Q) {
    const commonProps = {
      patientId: patient.id,
      episodeId,
      patientGender: patient.gender,
      patientDob: patient.dob,
      onComplete: handleQuestionnaireComplete,
    };
    // Hypo computes marital status/hysterectomy internally from its own
    // saved state — passing these extra props is harmless but unused.
    // Hyper/TC/Nodule require them externally (see note above).
    const externalDemographics = {
      maritalStatus: sharedDemographics.maritalStatus,
      hysterectomyDone: sharedDemographics.hysterectomyDone,
    };
    if (condition === 'hypothyroidism')  return <HypoQuestionnaire {...commonProps} />;
    if (condition === 'hyperthyroidism') return <HyperQuestionnaire {...commonProps} {...externalDemographics} />;
    if (condition === 'thyroid_cancer')  return <TcQuestionnaire {...commonProps} {...externalDemographics} />;
    if (condition === 'nodule')          return <NoduleQuestionnaire {...commonProps} {...externalDemographics} />;
    return <div>Unknown condition: {condition}</div>;
  }

  return null;
};

export default AddConditionFlow;

/**
 * ── Integration into PatientDashboard.js ──
 *
 * PatientDashboard.js currently has no "+ Add Condition" button or any
 * reference to this flow at all. Minimal wiring needed there:
 *
 *   import AddConditionFlow from '../../components/AddConditionFlow';
 *   const [addingCondition, setAddingCondition] = useState(false);
 *
 *   // Somewhere in the dashboard's action bar:
 *   <ActionBtn onClick={() => setAddingCondition(true)}>+ Add Condition</ActionBtn>
 *
 *   // Render, replacing the normal dashboard view while active:
 *   if (addingCondition) {
 *     return (
 *       <AddConditionFlow
 *         patient={patient}
 *         onDone={() => { setAddingCondition(false); loadEpisodes(); }}
 *       />
 *     );
 *   }
 *
 * `loadEpisodes` is PatientDashboard's existing episode-refresh callback
 * (already used after payment elsewhere in that file) — reusing it here
 * means the new episode shows up immediately without a full page reload.
 */
