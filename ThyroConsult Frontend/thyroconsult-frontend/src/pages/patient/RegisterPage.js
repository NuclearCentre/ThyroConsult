import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import SignaturePad from 'react-signature-canvas';
import { authAPI, doctorAPI, patientAPI, appointmentAPI } from '../../api';
import { Logo, SecureBadge, Alert, Spinner } from '../../components/common/index';
import ConditionSelection from '../../components/ConditionSelection';
import CoreQuestionnaire from '../../components/CoreQuestionnaire';
import { HypoQuestionnaire, HyperQuestionnaire } from '../../components/ConditionQuestionnaires';
import TcQuestionnaire from '../../components/TcQuestionnaire';
// ^ TcQuestionnaire now imported from its own file — ConditionQuestionnaires.js
// still exports an older, much smaller TcQuestionnaire stub (~270 lines) under
// the same name; the real one lives standalone (1493 lines, same
// self-contained chatbot pattern as Hyper/Nodule, matches migration 010's
// "TcQuestionnaire_REVISED.js" reference). That old stub in
// ConditionQuestionnaires.js should probably be removed to prevent this
// mistake happening again — flagging rather than deleting it myself.
import NoduleQuestionnaire from '../../components/NoduleQuestionnaire';
import { loadRazorpayScript } from '../../utils/loadRazorpay';

// ── Steps now include 5.5 (condition), 5.6 (core Q), 5.7 (condition Q)
// These are sub-steps rendered inside the same step bar position
// The step bar shows 7 steps; 5.5/5.6/5.7 are sub-steps within step 6
const STEPS = [
  'Personal info',
  'Verify contacts',
  'E-consent',
  'Live photo',
  'Choose doctor',
  'Questionnaire',  // covers steps 5.5, 5.6, 5.7
  'Upload reports',
  'Payment'
];

// Sub-steps within the questionnaire phase
const SUB_STEP_CONDITION_SELECT = '5.5';
const SUB_STEP_CORE_Q           = '5.6';
const SUB_STEP_CONDITION_Q      = '5.7';

const CONSENT_TEXT = {
  treatment: `I, the undersigned, hereby consent to receive thyroid online opinion services from the licensed physicians at ThyroConsult. I understand that online opinions will be provided via this secure, encrypted platform. I acknowledge that I have been fully informed of the nature of the online opinion service, including its risks, benefits, and available alternatives. I understand my case will be documented and that records will be maintained securely in accordance with applicable medical record laws.`,
  data_privacy: `I consent to the secure collection, storage, and processing of my personal and health information in accordance with applicable data protection laws. I understand that my data will be encrypted using AES-256 standards and will only be accessible to my treating physician and authorised platform administrators. My data will not be sold, shared, or used for any purpose other than my medical care without my explicit written consent.`,
  telemedicine: `I understand and accept the limitations of online opinion services including the inability to perform physical examinations. I consent to receive online thyroid opinion via this platform. I acknowledge that in case of a medical emergency, I should contact emergency services immediately. I have been informed about the technology requirements and privacy measures in place.`,
};

const RegisterPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [subStep, setSubStep] = useState(null); // null | '5.5' | '5.6' | '5.7'
  const [patientId, setPatientId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const webcamRef = useRef(null);
  const sigPadRef = useRef(null);

  // ── Condition / questionnaire state ─────────────────────
  const [selectedCondition, setSelectedCondition] = useState(null);
  const [episodeId, setEpisodeId] = useState(null);
  const [patientGender, setPatientGender] = useState('');

  // Step 1 form state
  const [form, setForm] = useState({
    firstName: '', middleName: '', lastName: '',
    guardianName: '', guardianRelation: '',
    dob: '', age: { yy: '', mm: '', dd: '' }, dobAutoCalculated: false,
    gender: '', bloodGroup: '',
    addressLine1: '', addressLine2: '', city: '', state: '', pincode: '',
    mobile: '', whatsapp: '', email: '',
    password: '', confirmPassword: '',
  });

  // Step 2 verification state
  const [verification, setVerification] = useState({ mobile: false, whatsapp: false, email: false });
  const [otpValues, setOtpValues] = useState({ mobile: '', whatsapp: '', email: '' });
  const [otpSent, setOtpSent] = useState({ mobile: false, whatsapp: false, email: false });

  // Step 3 consents
  const [consents, setConsents] = useState({ treatment: false, data_privacy: false, telemedicine: false });

  // Step 4 photo
  const [photoCapture, setPhotoCapture] = useState(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // Step 5 doctors
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  // Step 7 documents
  const [documents, setDocuments] = useState([]);

  // Step 8 payment
  const [paymentData, setPaymentData] = useState(null);

  // ── DOB ↔ Age auto-calculation ────────────────────────
  const handleDOBChange = (dob) => {
    const d = new Date(dob);
    if (!isNaN(d)) {
      const now = new Date();
      let yy = now.getFullYear() - d.getFullYear();
      let mm = now.getMonth() - d.getMonth();
      let dd = now.getDate() - d.getDate();
      if (dd < 0) { mm--; dd += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
      if (mm < 0) { yy--; mm += 12; }
      setForm(f => ({ ...f, dob, dobAutoCalculated: false, age: { yy: String(yy), mm: String(mm), dd: String(dd) } }));
      setPatientGender(form.gender);
    } else {
      setForm(f => ({ ...f, dob }));
    }
  };

  const handleAgeChange = (field, val) => {
    const newAge = { ...form.age, [field]: val };
    setForm(f => ({ ...f, age: newAge, dobAutoCalculated: true }));
    const totalDays = (parseInt(newAge.yy) || 0) * 365 + (parseInt(newAge.mm) || 0) * 30 + (parseInt(newAge.dd) || 0);
    const approxDOB = new Date(Date.now() - totalDays * 86400000);
    setForm(f => ({ ...f, age: newAge, dob: approxDOB.toISOString().split('T')[0], dobAutoCalculated: true }));
  };

  // ── Auto-save handler ────────────────────────────────
  const triggerAutoSave = useCallback(() => {
    const now = new Date();
    setSavedAt(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
  }, []);

  useEffect(() => {
    if (step >= 1) { const t = setTimeout(triggerAutoSave, 1500); return () => clearTimeout(t); }
  }, [form, step, triggerAutoSave]);

  // ── Step 1: Submit personal info ────────────────────
  const submitStep1 = async () => {
    if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    setLoading(true); setError('');
    try {
      const res = await authAPI.registerStep1({
        firstName: form.firstName, middleName: form.middleName, lastName: form.lastName,
        guardianName: form.guardianName, guardianRelation: form.guardianRelation,
        dob: form.dob, dobAutoCalculated: form.dobAutoCalculated,
        gender: form.gender, bloodGroup: form.bloodGroup,
        addressLine1: form.addressLine1, addressLine2: form.addressLine2,
        city: form.city, state: form.state, pincode: form.pincode,
        mobile: form.mobile, whatsapp: form.whatsapp, email: form.email,
        password: form.password,
      });
      setPatientId(res.patientId);
      setPatientGender(form.gender);
      // Registration Step 1 now issues a token pair (see authController.js
      // registerPatientStep1) — store it so every subsequent call in this
      // wizard that hits a verifyToken-protected route (document upload at
      // Step 7, booking at Step 8) actually carries a valid Authorization
      // header instead of 401'ing with no refresh token to fall back on.
      authAPI.setTokens(res.accessToken, res.refreshToken);
      setStep(2);
    } catch (err) { setError(err.response?.data?.error || 'Registration failed'); }
    finally { setLoading(false); }
  };

  // ── Step 2: OTP ──────────────────────────────────────
  const sendOTP = async (channel) => {
    setLoading(true); setError('');
    try {
      await authAPI.sendVerificationOtp(patientId, channel);
      setOtpSent(prev => ({ ...prev, [channel]: true }));
    } catch (err) { setError(err.response?.data?.error || 'Failed to send OTP'); }
    finally { setLoading(false); }
  };

  const verifyOTP = async (channel) => {
    setLoading(true); setError('');
    try {
      const res = await authAPI.verifyContactOtp(patientId, channel, otpValues[channel]);
      setVerification(prev => ({ ...prev, [channel]: true }));
      if (res.allVerified) setTimeout(() => setStep(3), 600);
    } catch (err) { setError(err.response?.data?.error || 'Invalid OTP'); }
    finally { setLoading(false); }
  };

  // ── Step 3: Consents ─────────────────────────────────
  const submitConsents = async () => {
    if (!consents.treatment || !consents.data_privacy || !consents.telemedicine)
      return setError('Please accept all required consents');
    const sigData = sigPadRef.current?.isEmpty() ? null : sigPadRef.current?.toDataURL();
    setLoading(true); setError('');
    try {
      for (const [type, agreed] of Object.entries(consents)) {
        await authAPI.saveConsent(patientId, type, agreed, sigData);
      }
      setStep(4);
    } catch (err) { setError(err.response?.data?.error || 'Failed to save consents'); }
    finally { setLoading(false); }
  };

  // ── Step 4: Photo ────────────────────────────────────
  const capturePhoto = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    setPhotoCapture(imageSrc);
  };

  const submitPhoto = async () => {
    if (!photoCapture) return setError('Please capture your photo');
    if (!photoConsent) return setError('Please provide photo consent to continue');
    setLoading(true); setError('');
    try {
      await authAPI.savePhoto(patientId, photoCapture);
      setStep(5);
    } catch (err) { setError(err.response?.data?.error || 'Failed to save photo'); }
    finally { setLoading(false); }
  };

  // ── Step 5: Load doctors ─────────────────────────────
  useEffect(() => {
    if (step === 5) {
      doctorAPI.listDoctors().then(res => setDoctors(res.doctors)).catch(() => {});
    }
  }, [step]);

  const submitDoctorSelection = async () => {
    if (!selectedDoctor) return setError('Please select a doctor');
    setLoading(true); setError('');
    try {
      await authAPI.selectDoctor(patientId, selectedDoctor);
      // After doctor selection → go to condition selection (Step 5.5)
      setStep(6);
      setSubStep(SUB_STEP_CONDITION_SELECT);
    } catch (err) { setError(err.response?.data?.error || 'Failed to select doctor'); }
    finally { setLoading(false); }
  };

  // ── Step 5.5: Condition selected ─────────────────────
  const handleConditionSelected = ({ condition, episodeId: eid }) => {
    setSelectedCondition(condition);
    setEpisodeId(eid);
    setSubStep(SUB_STEP_CORE_Q);
  };

  // ── Step 5.6: Core questionnaire complete ────────────
  const handleCoreQComplete = () => {
    setSubStep(SUB_STEP_CONDITION_Q);
  };

  // ── Step 5.7: Condition questionnaire complete ────────
  const handleConditionQComplete = () => {
    setSubStep(null);
    setStep(7); // Upload reports
  };

  // ── Nodule-specific: TSH branch can switch to Hypo/Hyper mid-flow ──
  // NoduleQuestionnaire calls onComplete({ switchToHypo: true, data })
  // or ({ switchToHyper: true, data }) instead of finishing normally —
  // same pattern as Hyper's C2b RAI->Hypo switch. Stay on the condition
  // questionnaire sub-step, just swap which questionnaire renders.
  const handleNoduleComplete = (result) => {
    if (result?.switchToHypo) { setSelectedCondition('hypothyroidism'); return; }
    if (result?.switchToHyper) { setSelectedCondition('hyperthyroidism'); return; }
    handleConditionQComplete();
  };

  // ── Step 7: Upload document ──────────────────────────
  // NOTE: patientAPI.uploadDocument takes a single FormData and has no
  // upload-progress support (api/index.js uses plain fetch, not XHR, so
  // there's no progress event to hook). Progress now just jumps 0->100
  // on completion instead of animating — a UX downgrade from what this
  // code assumed, flagging rather than faking progress events.
  const handleFileUpload = async (file, category) => {
    const key = `${Date.now()}`;
    setDocuments(prev => [...prev, { key, name: file.name, category, status: 'uploading', progress: 0 }]);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('patientId', patientId);
      formData.append('category', category);
      await patientAPI.uploadDocument(formData);
      setDocuments(prev => prev.map(d => d.key === key ? { ...d, status: 'done', progress: 100 } : d));
    } catch {
      setDocuments(prev => prev.map(d => d.key === key ? { ...d, status: 'error' } : d));
    }
  };

  // ── Step 8: Razorpay ─────────────────────────────────
  const initiatePayment = async () => {
    setLoading(true); setError('');
    try {
      await loadRazorpayScript();
      const res = await appointmentAPI.book({
        doctorId: selectedDoctor,
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });
      const { razorpayOrderId, amount } = res;
      const options = {
        key: process.env.REACT_APP_RAZORPAY_KEY_ID,
        amount: amount * 100,
        currency: 'INR',
        name: 'ThyroConsult',
        description: 'Online thyroid opinion',
        order_id: razorpayOrderId,
        handler: async (response) => {
          await appointmentAPI.verifyPayment({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          navigate('/patient/dashboard');
        },
        theme: { color: '#072654' },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) { setError(err.response?.data?.error || 'Payment initiation failed'); }
    finally { setLoading(false); }
  };

  const fld = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));
  const allVerified = verification.mobile && verification.whatsapp && verification.email;

  // ── Which step number to highlight in progress bar ───
  // Sub-steps all show as step 6 in the bar
  const barStep = subStep ? 6 : step;

  // ── Condition label for display ──────────────────────
  const conditionLabel = {
    hypothyroidism: 'Hypothyroidism',
    hyperthyroidism: 'Hyperthyroidism / Graves\'',
    thyroid_cancer: 'Thyroid Cancer',
    nodule: 'Thyroid Nodule',
  }[selectedCondition] || '';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* ── Header ── */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <Logo />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SecureBadge />
          {savedAt && <span className="autosave">✓ Saved {savedAt}</span>}
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '36px 24px' }}>

        {/* ── Progress step bar ── */}
        <div className="step-bar">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < barStep ? 'done' : n === barStep ? 'active' : 'pending';
            return (
              <div key={n} className={`step-item ${state}`}>
                <div className="step-circle">{state === 'done' ? '✓' : n}</div>
                <div className="step-label">{label}</div>
              </div>
            );
          })}
        </div>

        {/* ── Sub-step indicator (for questionnaire phase) ── */}
        {subStep && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 14px', background: 'var(--blue-50)', borderRadius: 8, border: '1px solid var(--blue-200)' }}>
            <span style={{ fontSize: 12, color: 'var(--blue-700)', fontWeight: 500 }}>
              {subStep === SUB_STEP_CONDITION_SELECT && '📋 Step 6a — Select your condition'}
              {subStep === SUB_STEP_CORE_Q && `📝 Step 6b — General health questionnaire${conditionLabel ? ` · ${conditionLabel}` : ''}`}
              {subStep === SUB_STEP_CONDITION_Q && `🔬 Step 6c — ${conditionLabel} specific questions`}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {[SUB_STEP_CONDITION_SELECT, SUB_STEP_CORE_Q, SUB_STEP_CONDITION_Q].map((s, i) => (
                <div key={s} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: subStep === s ? 'var(--blue-600)' :
                    [SUB_STEP_CONDITION_SELECT, SUB_STEP_CORE_Q, SUB_STEP_CONDITION_Q].indexOf(subStep) > i
                      ? 'var(--teal-400)' : 'var(--border-md)'
                }} />
              ))}
            </div>
          </div>
        )}

        {error && !subStep && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        {/* ═══════════════════════════════════════════════════
            STEP 1 — Personal info (unchanged)
        ═══════════════════════════════════════════════════ */}
        {step === 1 && !subStep && (
          <div className="card">
            <div style={{ marginBottom: 20 }}>
              <h3>Personal information</h3>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>All fields marked <span style={{ color: 'var(--red-400)' }}>*</span> are required</p>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">First name <span style={{ color: 'var(--red-400)' }}>*</span></label>
                <input className="form-input" type="text" value={form.firstName} onChange={fld('firstName')} placeholder="First name" required />
              </div>
              <div className="form-group">
                <label className="form-label">Middle name</label>
                <input className="form-input" type="text" value={form.middleName} onChange={fld('middleName')} placeholder="Optional" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Last name / Family name <span style={{ color: 'var(--red-400)' }}>*</span></label>
              <input className="form-input" type="text" value={form.lastName} onChange={fld('lastName')} placeholder="Last name" required />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Date of birth <span style={{ color: 'var(--red-400)' }}>*</span></label>
                <input className="form-input" type="date" value={form.dob} max={new Date().toISOString().split('T')[0]}
                  onChange={e => handleDOBChange(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Age (auto-calculated)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['yy', 'Yrs'], ['mm', 'Mo'], ['dd', 'Days']].map(([field, placeholder]) => (
                    <input key={field} className="form-input" type="number" min="0"
                      value={form.age[field]} onChange={e => handleAgeChange(field, e.target.value)}
                      placeholder={placeholder} style={{ width: 60, textAlign: 'center' }} />
                  ))}
                </div>
                {form.dobAutoCalculated && (
                  <div className="alert alert-warning" style={{ marginTop: 6, fontSize: 11, padding: '4px 8px' }}>
                    ⚠ DOB is approximate — please enter actual DOB if available
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Gender <span style={{ color: 'var(--red-400)' }}>*</span></label>
              <select className="form-input" value={form.gender} onChange={fld('gender')} required>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

            <h4 style={{ marginBottom: 12, fontSize: 14 }}>Address</h4>
            <div className="form-group">
              <label className="form-label">State <span style={{ color: 'var(--red-400)' }}>*</span></label>
              <input className="form-input" type="text" value={form.state} onChange={fld('state')} placeholder="State" required />
            </div>
            <div className="form-group">
              <label className="form-label">City <span style={{ color: 'var(--red-400)' }}>*</span></label>
              <input className="form-input" type="text" value={form.city} onChange={fld('city')} placeholder="City" required />
            </div>
            <div className="form-group">
              <label className="form-label">Flat / House No., Street <span style={{ color: 'var(--red-400)' }}>*</span></label>
              <input className="form-input" type="text" value={form.addressLine1} onChange={fld('addressLine1')} placeholder="Flat no., building, street" required />
            </div>
            <div className="form-group">
              <label className="form-label">Landmark</label>
              <input className="form-input" type="text" value={form.addressLine2} onChange={fld('addressLine2')} placeholder="Landmark (optional)" />
            </div>
            <div className="form-group" style={{ maxWidth: 160 }}>
              <label className="form-label">PIN code <span style={{ color: 'var(--red-400)' }}>*</span></label>
              <input className="form-input" type="text" value={form.pincode} onChange={fld('pincode')} placeholder="6-digit PIN" maxLength={6} required />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

            <h4 style={{ marginBottom: 12, fontSize: 14 }}>Contact details</h4>
            <div className="form-group">
              <label className="form-label">Mobile number <span style={{ color: 'var(--red-400)' }}>*</span></label>
              <input className="form-input" type="tel" value={form.mobile} onChange={fld('mobile')} placeholder="+91 XXXXX XXXXX" required />
            </div>
            <div className="form-group">
              <label className="form-label">WhatsApp number <span style={{ color: 'var(--red-400)' }}>*</span></label>
              <input className="form-input" type="tel" value={form.whatsapp} onChange={fld('whatsapp')} placeholder="+91 XXXXX XXXXX" required />
            </div>
            <div className="form-group">
              <label className="form-label">Email address <span style={{ color: 'var(--red-400)' }}>*</span></label>
              <input className="form-input" type="email" value={form.email} onChange={fld('email')} placeholder="you@example.com" required />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Password <span style={{ color: 'var(--red-400)' }}>*</span></label>
                <input className="form-input" type="password" value={form.password} onChange={fld('password')} placeholder="Min 8 chars, 1 upper, 1 number, 1 symbol" required />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm password <span style={{ color: 'var(--red-400)' }}>*</span></label>
                <input className="form-input" type="password" value={form.confirmPassword} onChange={fld('confirmPassword')} placeholder="Repeat password" required />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-primary btn-lg" onClick={submitStep1} disabled={loading}>
                {loading ? <Spinner size={18} color="#fff" /> : 'Save & continue →'}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 2 — Verify contacts (unchanged)
        ═══════════════════════════════════════════════════ */}
        {step === 2 && !subStep && (
          <div className="card">
            <h3 style={{ marginBottom: 6 }}>Verify your contact details</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 24 }}>All three must be verified to continue <span style={{ color: 'var(--red-400)' }}>*</span></p>
            {[['mobile', '📱 Mobile', 'SMS'], ['whatsapp', '💬 WhatsApp', 'WhatsApp'], ['email', '✉️ Email', 'Email']].map(([ch, label, method]) => (
              <div key={ch} style={{ marginBottom: 20, padding: 16, border: `1px solid ${verification[ch] ? 'var(--teal-200)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: verification[ch] ? 'var(--teal-50)' : 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{label}</span>
                  {verification[ch]
                    ? <span className="badge badge-teal">✓ Verified</span>
                    : <button className="btn btn-secondary btn-sm" onClick={() => sendOTP(ch)} disabled={loading}>Send OTP via {method}</button>
                  }
                </div>
                {!verification[ch] && otpSent[ch] && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                    <input className="form-input" placeholder="6-digit OTP" maxLength={6} value={otpValues[ch]}
                      onChange={e => setOtpValues(p => ({ ...p, [ch]: e.target.value }))} style={{ maxWidth: 140 }} />
                    <button className="btn btn-primary btn-sm" onClick={() => verifyOTP(ch)} disabled={loading || otpValues[ch].length < 6}>
                      {loading ? <Spinner size={14} color="#fff" /> : 'Verify'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary btn-lg" onClick={() => setStep(3)} disabled={!allVerified}>Continue →</button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 3 — E-consent (unchanged)
        ═══════════════════════════════════════════════════ */}
        {step === 3 && !subStep && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <h3>Electronic consent form</h3>
            </div>
            {Object.entries(CONSENT_TEXT).map(([type, text]) => {
              const labels = { treatment: 'Treatment consent', data_privacy: 'Data privacy', telemedicine: 'Telemedicine consent' };
              return (
                <div key={type} style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                  <div style={{ fontWeight: 500, marginBottom: 10, fontSize: 14 }}>{labels[type]} <span style={{ color: 'var(--red-400)' }}>*</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--gray-50)', borderRadius: 8, padding: 12, maxHeight: 100, overflowY: 'auto', lineHeight: 1.7, marginBottom: 12 }}>{text}</div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={consents[type]} onChange={e => setConsents(p => ({ ...p, [type]: e.target.checked }))}
                      style={{ marginTop: 2, accentColor: 'var(--teal-400)', width: 15, height: 15 }} />
                    I have read and agree to the {labels[type].toLowerCase()}
                  </label>
                </div>
              );
            })}
            <div style={{ marginTop: 20, marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Digital signature <span style={{ color: 'var(--red-400)' }}>*</span></div>
            <div style={{ border: '1px dashed var(--border-md)', borderRadius: 'var(--radius-md)', background: 'var(--gray-50)', marginBottom: 8 }}>
              <SignaturePad ref={sigPadRef} canvasProps={{ width: 600, height: 80, style: { borderRadius: 10 } }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => sigPadRef.current?.clear()}>Clear signature</button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Timestamp, IP address, and document hash are recorded for compliance and audit purposes.</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
              <button className="btn btn-primary btn-lg" onClick={submitConsents} disabled={loading || !Object.values(consents).every(Boolean)}>
                {loading ? <Spinner size={18} color="#fff" /> : 'Accept & continue →'}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 4 — Live photo (unchanged)
        ═══════════════════════════════════════════════════ */}
        {step === 4 && !subStep && (
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>Live photo for medical record <span style={{ color: 'var(--red-400)', fontSize: 18 }}>*</span></h3>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>A live camera photo is required. Upload from device is not permitted.</p>
            <div className="alert alert-error" style={{ marginBottom: 20 }}>📷 This step is mandatory and cannot be skipped. Your photo is used solely for patient identification by your doctor.</div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, marginBottom: 20, padding: 14, border: `1px solid ${photoConsent ? 'var(--teal-200)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: photoConsent ? 'var(--teal-50)' : 'transparent' }}>
              <input type="checkbox" checked={photoConsent} onChange={e => setPhotoConsent(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--teal-400)', width: 15, height: 15 }} />
              <span>I consent to my photograph being captured via live camera and stored securely as part of my medical record. <span style={{ color: 'var(--red-400)' }}>*</span></span>
            </label>
            {!photoCapture ? (
              <div style={{ background: '#1A1A18', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 16, position: 'relative' }}>
                <Webcam ref={webcamRef} screenshotFormat="image/jpeg" style={{ width: '100%', display: 'block' }} onUserMedia={() => setCameraReady(true)} mirrored />
                {cameraReady && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: '#9FE1CB', background: 'rgba(0,0,0,0.4)', padding: '2px 8px', borderRadius: 20 }}>● LIVE</span>
                    <span style={{ fontSize: 12, color: '#9FE1CB', flex: 1, textAlign: 'center' }}>Centre your face within the frame</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ position: 'relative', marginBottom: 16, textAlign: 'center' }}>
                <img src={photoCapture} alt="Captured" style={{ width: '100%', maxWidth: 400, borderRadius: 'var(--radius-lg)', border: '3px solid var(--teal-400)' }} />
                <div className="badge badge-teal" style={{ position: 'absolute', top: 12, left: 12 }}>✓ Photo captured</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {!photoCapture
                ? <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={capturePhoto} disabled={!cameraReady || !photoConsent}>📷 Capture photo</button>
                : <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setPhotoCapture(null)}>↺ Retake</button>
              }
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16 }}>🔒 Photo is AES-256 encrypted, stored in an isolated vault, and every access is audit-logged.</p>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-secondary" onClick={() => setStep(3)}>← Back</button>
              <button className="btn btn-primary btn-lg" onClick={submitPhoto} disabled={loading || !photoCapture || !photoConsent}>
                {loading ? <Spinner size={18} color="#fff" /> : 'Confirm & continue →'}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 5 — Choose doctor (unchanged)
        ═══════════════════════════════════════════════════ */}
        {step === 5 && !subStep && (
          <div className="card">
            <h3 style={{ marginBottom: 20 }}>Select your doctor</h3>
            {doctors.length === 0 ? <div style={{ textAlign: 'center', padding: 24 }}><Spinner size={24} /></div> : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {doctors.map(doc => (
                  <div key={doc.id} onClick={() => setSelectedDoctor(doc.id)} style={{ padding: 16, border: `1.5px solid ${selectedDoctor === doc.id ? 'var(--teal-400)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', cursor: 'pointer', background: selectedDoctor === doc.id ? 'var(--teal-50)' : 'var(--surface)', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--blue-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--blue-800)', flexShrink: 0 }}>
                        {doc.name?.split(' ')[1]?.[0]}{doc.name?.split(' ')[2]?.[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{doc.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{doc.specialisation} · {doc.experienceYears} yrs</div>
                        <div style={{ fontSize: 11, color: doc.isAvailableToday ? 'var(--teal-600)' : 'var(--text-tertiary)', marginTop: 3 }}>
                          {doc.isAvailableToday ? '✓ Available today' : '○ Next available slot'}
                        </div>
                      </div>
                      {selectedDoctor === doc.id && <span style={{ color: 'var(--teal-400)', fontSize: 18 }}>✓</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-secondary" onClick={() => setStep(4)}>← Back</button>
              <button className="btn btn-primary btn-lg" onClick={submitDoctorSelection} disabled={loading || !selectedDoctor}>
                {loading ? <Spinner size={18} color="#fff" /> : 'Confirm & continue →'}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 5.5 — Condition selection (NEW)
        ═══════════════════════════════════════════════════ */}
        {step === 6 && subStep === SUB_STEP_CONDITION_SELECT && (
          <ConditionSelection
            patientId={patientId}
            doctorId={selectedDoctor}
            onComplete={handleConditionSelected}
            onBack={() => { setSubStep(null); setStep(5); }}
          />
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 5.6 — Core questionnaire (NEW)
        ═══════════════════════════════════════════════════ */}
        {step === 6 && subStep === SUB_STEP_CORE_Q && episodeId && (
          <CoreQuestionnaire
            patientId={patientId}
            episodeId={episodeId}
            condition={selectedCondition}
            patientGender={patientGender}
            patientDob={form.dob}
            onComplete={handleCoreQComplete}
            onBack={() => setSubStep(SUB_STEP_CONDITION_SELECT)}
          />
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 5.7 — Condition-specific questionnaire (NEW)
        ═══════════════════════════════════════════════════ */}
        {step === 6 && subStep === SUB_STEP_CONDITION_Q && episodeId && (
          <>
            {selectedCondition === 'hypothyroidism' && (
              <HypoQuestionnaire
                patientId={patientId}
                episodeId={episodeId}
                onComplete={handleConditionQComplete}
                onBack={() => setSubStep(SUB_STEP_CORE_Q)}
              />
            )}
            {selectedCondition === 'hyperthyroidism' && (
              <HyperQuestionnaire
                patientId={patientId}
                episodeId={episodeId}
                patientGender={patientGender}
                onComplete={handleConditionQComplete}
                onBack={() => setSubStep(SUB_STEP_CORE_Q)}
              />
            )}
            {selectedCondition === 'thyroid_cancer' && (
              // Same gap as Nodule below: maritalStatus/hysterectomyDone
              // aren't tracked in RegisterPage's state, so they pass through
              // as undefined -> component's internal defaults apply.
              <TcQuestionnaire
                patientId={patientId}
                episodeId={episodeId}
                patientDob={form.dob}
                patientGender={patientGender}
                onComplete={handleConditionQComplete}
                onBack={() => setSubStep(SUB_STEP_CORE_Q)}
              />
            )}
            {selectedCondition === 'nodule' && (
              // NOTE: maritalStatus/hysterectomyDone aren't tracked anywhere
              // in RegisterPage's state today — Nodule uses them to decide
              // whether to show B4/B5/J4c, so they'll fall back to the
              // component's internal defaults (effectively "unmarried/no
              // hysterectomy") until this page collects them. patientDob is
              // available from Step 1 and passed through.
              <NoduleQuestionnaire
                patientId={patientId}
                episodeId={episodeId}
                patientDob={form.dob}
                patientGender={patientGender}
                onComplete={handleNoduleComplete}
                onBack={() => setSubStep(SUB_STEP_CORE_Q)}
              />
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 7 — Upload reports (was step 6)
        ═══════════════════════════════════════════════════ */}
        {step === 7 && !subStep && (
          <div className="card">
            <h3 style={{ marginBottom: 6 }}>Upload medical reports</h3>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>PDF, Word, JPG, PNG · Max 5 MB per file · Reports are encrypted on upload</p>

            {['blood_report', 'scan_usg', 'prescription', 'biopsy', 'other'].map(cat => {
              const labels = { blood_report: '🩸 Blood reports', scan_usg: '📡 Scan / USG / RAI scan', prescription: '💊 Prescriptions', biopsy: '🔬 Biopsy / FNAC / Histopathology', other: '📄 Other' };
              return (
                <div key={cat} style={{ marginBottom: 14, padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>{labels[cat]}</div>
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', border: '1px dashed var(--border-md)', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'var(--gray-50)' }}>
                    <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => Array.from(e.target.files).forEach(f => handleFileUpload(f, cat))} />
                    <span style={{ fontSize: 22, marginBottom: 4 }}>☁</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Click to upload or drag & drop</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>PDF, DOCX, JPG, PNG · max 5 MB</span>
                  </label>
                  {documents.filter(d => d.category === cat).map(doc => (
                    <div key={doc.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, marginTop: 8, fontSize: 12 }}>
                      <span>📄</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                      {doc.status === 'uploading' && <span style={{ fontSize: 11, color: 'var(--teal-600)' }}>{doc.progress}%</span>}
                      {doc.status === 'done' && <span style={{ color: 'var(--teal-600)' }}>✓</span>}
                      {doc.status === 'error' && <span style={{ color: 'var(--red-600)' }}>✗</span>}
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => { setStep(6); setSubStep(SUB_STEP_CONDITION_Q); }}>← Back to questionnaire</button>
              <button className="btn btn-primary btn-lg" onClick={() => setStep(8)}>Continue to payment →</button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 8 — Payment (was step 7)
        ═══════════════════════════════════════════════════ */}
        {step === 8 && !subStep && (
          <div className="card">
            <h3 style={{ marginBottom: 20 }}>Online opinion fee payment</h3>
            {doctors.find(d => d.id === selectedDoctor) && (() => {
              const doc = doctors.find(d => d.id === selectedDoctor);
              const fee = doc.opinionFee || 500;
              const platform = 50;
              const total = fee + platform;
              return (
                <>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
                    {[
                      [`Online opinion — ${doc.name}`, fee],
                      ['Platform fee', platform],
                    ].map(([label, amt]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                        <span>₹{amt.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 600, paddingTop: 10, marginTop: 4 }}>
                      <span>Total payable</span><span>₹{total.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                  <div className="alert alert-info">🔒 Payment processed via Razorpay. Your card details are never stored on our servers (PCI-DSS Level 1).</div>
                  <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', background: '#072654' }} onClick={initiatePayment} disabled={loading}>
                    {loading ? <Spinner size={18} color="#fff" /> : `💳 Pay ₹${total.toLocaleString('en-IN')} via Razorpay`}
                  </button>
                  <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>UPI · Cards · Net Banking · Wallets supported</p>
                </>
              );
            })()}
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setStep(7)}>← Back</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default RegisterPage;
