// src/api/index.js
// Single API file — complete replacement always
// Change REACT_APP_API_URL in .env to switch provider

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7000/api';

// ─── Token management ─────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('thyro_access_token');
}

function setTokens(access, refresh) {
  localStorage.setItem('thyro_access_token', access);
  if (refresh) localStorage.setItem('thyro_refresh_token', refresh);
}

function clearTokens() {
  localStorage.removeItem('thyro_access_token');
  localStorage.removeItem('thyro_refresh_token');
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // Auto-refresh on 401 — but only for requests that were actually
  // authenticated (i.e. we sent a token). A 401 on an unauthenticated call
  // like /auth/login just means "wrong credentials" and should bubble up
  // as a normal error for the caller to display — not trigger a session-
  // expiry redirect. Without this guard, every failed login attempt would
  // hard-navigate to /login (no refresh token exists yet on a fresh login),
  // wiping the form and the error message before it could ever be shown.
  if (response.status === 401 && token) {
    const refreshToken = localStorage.getItem('thyro_refresh_token');
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const { accessToken, refreshToken: newRefresh } = await refreshRes.json();
        setTokens(accessToken, newRefresh);
        headers.Authorization = `Bearer ${accessToken}`;
        response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
      } else {
        clearTokens();
        window.location.href = '/login';
        return;
      }
    } else {
      clearTokens();
      window.location.href = '/login';
      return;
    }
  }

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.message || 'Request failed');
    err.response = { status: response.status, data };
    throw err;
  }
  return data;
}

function get(path, params)   { return apiFetch(path + toQueryString(params), { method: 'GET' }); }
function post(path, body)    { return apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }); }
function put(path, body)     { return apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }); }
function del(path)           { return apiFetch(path, { method: 'DELETE' }); }

function toQueryString(params) {
  if (!params) return '';
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!usable.length) return '';
  return '?' + usable.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

// For non-JSON responses (e.g. CSV export) — apiFetch always calls
// response.json(), which throws on anything that isn't valid JSON.
async function getBlob(path, params) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${path}${toQueryString(params)}`, { headers });
  if (!response.ok) throw new Error('Request failed');
  return response.blob();
}

// ─── Auth ─────────────────────────────────────────────────────────────────

export const authAPI = {
  // Multi-step patient registration wizard
  registerStep1:  (data)                 => post('/auth/patient/register-step1', data),
  // data: { firstName, middleName, lastName, guardianName, guardianRelation,
  //         dob, dobAutoCalculated, gender, bloodGroup, addressLine1, addressLine2,
  //         city, state, pincode, mobile, whatsapp, email, password }

  sendVerificationOtp: (patientId, channel)      => post('/auth/patient/send-verification-otp', { patientId, channel }),
  // channel: 'mobile' | 'whatsapp' | 'email'

  verifyContactOtp:    (patientId, channel, otp) => post('/auth/patient/verify-contact-otp', { patientId, channel, otp }),

  saveConsent:    (patientId, consentType, agreed, signatureData) =>
    post('/auth/patient/consent', { patientId, consentType, agreed, signatureData }),

  savePhoto:      (patientId, photoBase64)       => post('/auth/patient/photo', { patientId, photoBase64 }),
  // photoBase64: base64-encoded JPEG/PNG from live camera capture — NOT multipart/FormData

  selectDoctor:   (patientId, doctorId)          => post('/auth/patient/select-doctor', { patientId, doctorId }),

  // Unified login — same endpoint for patient/doctor/admin, role tells the backend which table to check
  login:          (identifier, password, role)   => post('/auth/login', { identifier, password, role }),
  patientLogin:   (identifier, password)         => post('/auth/login', { identifier, password, role: 'patient' }),
  doctorLogin:    (identifier, password)         => post('/auth/login', { identifier, password, role: 'doctor' }),
  adminLogin:     (identifier, password)         => post('/auth/login', { identifier, password, role: 'admin' }),

  refresh:        (refreshToken)        => post('/auth/refresh', { refreshToken }),
  logout:         (refreshToken)        => post('/auth/logout', { refreshToken }),
  setTokens,
  clearTokens,
  getToken,
};

// ─── Patient ──────────────────────────────────────────────────────────────

export const patientAPI = {
  getProfile:     ()                    => get('/patient/profile'),
  updateProfile:  (data)                => put('/patient/profile', data),
  // Backend returns { episodes, total } — unwrap to the array here so
  // call sites (e.g. PatientDashboard.js) can use the result directly.
  getEpisodes:    (patientId)           => get(`/condition/episodes/${patientId}`).then(r => r.episodes),
  getConsents:    ()                    => get('/patient/consents'),
  saveConsents:   (consentType, agreed, signatureData) =>
    post('/patient/consents', { consentType, agreed, signatureData }),
  // Self-service — filters by the logged-in patient's own id, optional
  // category query. (There's also a separate, still-broken
  // /patient/documents/:episodeId route another caller may depend on —
  // left alone, not touched here.)
  getDocuments:   (category)            => get('/patient/documents', category ? { category } : undefined),
  downloadDocument: (docId)             => getBlob(`/patient/documents/download/${docId}`),
  // PatientPortal.js/DoctorPortal.js were calling these under the names
  // getConsultations/getInvoices/getBloodValues — none of which existed
  // anywhere in this file. The backend controller functions
  // (getPatientOpinions/getInvoices/getBloodReportValues) were fully
  // built but had no routes at all, so these silently failed on every
  // page load (Promise.all rejecting, swallowed by an empty .catch()).
  // Named getOpinionHistory here (not getConsultations) per the platform
  // language rule — "consultation" is banned everywhere on the platform.
  // The call sites in PatientPortal.js still say "consultation" in UI
  // text/variable names; that's a separate wording cleanup, flagged
  // separately, not fixed as part of this pass.
  getOpinionHistory: ()                 => get('/patient/opinions'),
  getInvoices:    ()                    => get('/patient/invoices'),
  getBloodValues: (params)              => get('/patient/blood-values', params),
  addBloodValue:  (data)                => post('/patient/blood-values', data),
  // Photo upload — multipart, use FormData directly (field name must be 'photo')
  uploadPhoto:    (formData)            => apiFetch('/patient/photo', {
    method: 'POST', body: formData, headers: { Authorization: `Bearer ${getToken()}` },
  }),
  // Document upload — multipart
  uploadDocument: (formData)            => apiFetch('/patient/documents', {
    method: 'POST', body: formData, headers: { Authorization: `Bearer ${getToken()}` },
  }),
};

// ─── Conditions + Questionnaires ──────────────────────────────────────────

export const conditionAPI = {
  selectCondition:  (data)                          => post('/condition/select', data),
  getEpisode:       (episodeId)                     => get(`/condition/episode/${episodeId}`),

  getCoreQ:         (patientId, episodeId)          => get(`/condition/core/${patientId}/${episodeId}`),
  saveCoreQ:        (patientId, episodeId, data)    => post(`/condition/core/${patientId}/${episodeId}`, data),

  getHypoQ:         (patientId, episodeId)          => get(`/condition/hypo/${patientId}/${episodeId}`),
  saveHypoQ:        (patientId, episodeId, data)    => post(`/condition/hypo/${patientId}/${episodeId}`, data),

  getHyperQ:        (patientId, episodeId)          => get(`/condition/hyper/${patientId}/${episodeId}`),
  saveHyperQ:       (patientId, episodeId, data)    => post(`/condition/hyper/${patientId}/${episodeId}`, data),

  getTcQ:           (patientId, episodeId)          => get(`/condition/tc/${patientId}/${episodeId}`),
  saveTcQ:          (patientId, episodeId, data)    => post(`/condition/tc/${patientId}/${episodeId}`, data),

  getNoduleQ:       (patientId, episodeId)          => get(`/condition/nodule/${patientId}/${episodeId}`),
  saveNoduleQ:      (patientId, episodeId, data)    => post(`/condition/nodule/${patientId}/${episodeId}`, data),
};

// ─── Opinion (patient-side) ───────────────────────────────────────────────

export const opinionAPI = {
  // Timeline
  getEpisodeTimeline:   (episodeId)       => get(`/patient/episode/${episodeId}/timeline`),

  // Read opinion
  getPatientOpinion:    (episodeId)       => get(`/patient/episode/${episodeId}/opinion`),

  // Acknowledge
  acknowledgeOpinion:   (opinionId)       => post(`/patient/opinion/${opinionId}/acknowledge`),

  // Investigation master (also used by OpinionWriter — doctor side)
  getInvestigationMaster: ()              => get('/physician/investigations/master'),
};

// ─── Physician (doctor-side opinion workflow) ─────────────────────────────

export const physicianAPI = {
  // Queue
  getPhysicianQueue:    ()                => get('/physician/queue'),

  // Episode review
  getEpisodeForReview:  (episodeId)       => get(`/physician/episode/${episodeId}`),

  // Opinion
  saveDraftOpinion:     (episodeId, data) => post(`/physician/episode/${episodeId}/opinion/draft`, data),
  submitOpinion:        (episodeId, data) => post(`/physician/episode/${episodeId}/opinion/submit`, data),
  amendOpinion:         (opinionId, data) => put(`/physician/opinion/${opinionId}/amend`, data),

  // Investigation master
  getInvestigationMaster: ()              => get('/physician/investigations/master'),

  // Close episode
  closeEpisode:         (episodeId)       => post(`/physician/episode/${episodeId}/close`),

  // Existing physician controller endpoints
  getPendingWork:       ()                => get('/physician/pending'),
  getEpisodeSummary:    (episodeId)       => get(`/physician/episode/${episodeId}/summary`),
  adviseInvestigations: (episodeId, data) => post(`/physician/episode/${episodeId}/advise-investigations`, data),
  getEpisodeInvestigations: (episodeId)   => get(`/physician/episode/${episodeId}/investigations`),
  updateInvestigation:  (id, data)        => put(`/physician/investigation/${id}`, data),
  deleteInvestigation:  (id)              => del(`/physician/investigation/${id}`),
  markInvestigationReviewed: (episodeId)  => post(`/physician/episode/${episodeId}/mark-investigation-reviewed`),
  getFollowUpVisit:     (episodeId)       => get(`/physician/followup/${episodeId}`),
  reviewFollowUpVisit:  (episodeId, data) => post(`/physician/followup/${episodeId}/review`, data),
};

// ─── Payments ─────────────────────────────────────────────────────────────

// ─── Appointments (initial booking) ────────────────────────────────────────
// Step 8 of registration books the FIRST appointment and creates the
// Razorpay order for it. This is a different endpoint/shape from
// paymentAPI.createOrder below, which is for S1/S2/S3 FOLLOW-UP payments
// only (episodeId/scenario/conditionType, not patientId/doctorId/scheduledAt).
export const appointmentAPI = {
  book:           (data) => post('/appointment/book', data),
  verifyPayment:  (data) => post('/appointment/verify-payment', data),
};

export const paymentAPI = {
  createOrder:          (data)            => post('/payment/create-order', data),
  verifyPayment:        (data)            => post('/payment/verify', data),
  createFollowUpOrder:  (data)            => post('/payment/followup/create-order', data),
  verifyFollowUpPayment:(data)            => post('/payment/followup/verify', data),
};

// ─── Receipts ─────────────────────────────────────────────────────────────

export const receiptAPI = {
  // These return raw PDF bytes, not JSON — apiFetch always calls
  // response.json() on its response, which throws a SyntaxError on binary
  // PDF data. getBlob() is the correct fetch wrapper for these; these two
  // never worked before this fix.
  downloadOpinionReceipt: (paymentId) =>
    getBlob(`/receipt/opinion/${paymentId}`),
  downloadFollowUpReceipt: (followupPaymentId) =>
    getBlob(`/receipt/followup/${followupPaymentId}`),
  getInvoiceList: () => get('/receipt/invoices'),
};

// ─── Advise Letter ────────────────────────────────────────────────────────

export const adviseLetterAPI = {
  // Doctor
  generate:       (episodeId) => post(`/physician/episode/${episodeId}/advise-letter/generate`),
  doctorDownload: (episodeId) => `${BASE_URL}/physician/episode/${episodeId}/advise-letter/download`,

  // Patient
  getStatus:      (episodeId) => get(`/patient/episode/${episodeId}/advise-letter/status`),
  patientDownload:(episodeId) => `${BASE_URL}/patient/episode/${episodeId}/advise-letter/download`,
};

// ─── Follow-up ────────────────────────────────────────────────────────────

export const followUpAPI = {
  getStatus:            (episodeId)       => get(`/followup/status/${episodeId}`),

  // Scenario 1 — missing reports
  // These didn't exist before — MissingReports.js was calling
  // patientAPI.getMissingReports/uploadMissingReport, which were never
  // defined anywhere in this file.
  getMissingReports:    (episodeId)             => get(`/followup/missing-reports/${episodeId}`),
  uploadMissingReport:  (episodeId, moduleKey, file) => {
    const formData = new FormData();
    formData.append('report', file);
    return apiFetch(`/followup/missing-reports/${episodeId}/${moduleKey}`, {
      method: 'POST', body: formData, headers: { Authorization: `Bearer ${getToken()}` },
    });
  },

  // Scenario 2 — advised investigations
  // None of these existed before — InvestigationUpload.js was calling
  // patientAPI.getInvestigations/addInvestigation/uploadInvestigationReport/
  // notifyDoctor, none of which were defined anywhere in this file.
  getInvestigations:    (episodeId)             => get(`/followup/investigations/${episodeId}`),
  addInvestigation:     (episodeId, data)       => post(`/followup/investigations/${episodeId}`, data),
  uploadInvestigationReport: (episodeId, invId, file) => {
    const formData = new FormData();
    formData.append('report', file);
    return apiFetch(`/followup/investigations/${episodeId}/${invId}/upload`, {
      method: 'POST', body: formData, headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  notifyDoctor:         (episodeId)             => post(`/followup/investigations/${episodeId}/notify-doctor`),

  // Scenario 3 — follow-up visits
  // None of these existed before either — FollowUpVisit.js was calling
  // patientAPI.getFollowUpVisits/createFollowUpVisit/saveFollowUpDraft/
  // uploadFollowUpLab/submitFollowUp, none of which were defined anywhere
  // in this file.
  getFollowUpVisits:    (episodeId)             => get(`/followup/visits/${episodeId}`),
  createFollowUpVisit:  (episodeId)             => post(`/followup/visits/${episodeId}`),
  saveFollowUpDraft:    (episodeId, visitId, data) => put(`/followup/visits/${episodeId}/${visitId}/draft`, data),
  uploadFollowUpLab:    (episodeId, visitId, { testKey, value, unit, testDate, file }) => {
    const formData = new FormData();
    formData.append('report', file);
    formData.append('testKey', testKey || '');
    formData.append('value', value || '');
    formData.append('unit', unit || '');
    formData.append('testDate', testDate || '');
    return apiFetch(`/followup/visits/${episodeId}/${visitId}/upload-lab`, {
      method: 'POST', body: formData, headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  submitFollowUp:       (episodeId, visitId)    => post(`/followup/visits/${episodeId}/${visitId}/submit`),
};

// ─── Doctor (appointments) ────────────────────────────────────────────────

export const doctorAPI = {
  listDoctors:          ()                => get('/doctors'),
  // ^ ADDED — RegisterPage.js's doctor-selection step (Step 5) calls this
  // for the public doctor list, but no matching export existed at all
  // before this fix; matches doctorController.listDoctors' own comment
  // ("GET /doctors — public list for patient doctor selection"), but the
  // exact route path is a best guess pending the routes file confirming it.
  getProfile:           ()                => get('/doctor/profile'),
  updateProfile:        (data)            => put('/doctor/profile', data),
  getAppointments:      (date)            => get('/doctor/appointments', { date }),
  getWeeklyStats:       ()                => get('/doctor/weekly-stats'),
  getAppointmentDetail: (id)              => get(`/doctor/appointment/${id}`),
  updateAppointment:    (id, data)        => put(`/doctor/appointment/${id}`, data),
};

// ─── Admin ────────────────────────────────────────────────────────────────

export const adminAPI = {
  getDashboard:         ()                => get('/admin/dashboard'),
  listPatients:         (params)          => get('/admin/patients', params),
  getPatient:           (id)              => get(`/admin/patient/${id}`),
  updatePatient:        (id, data)        => put(`/admin/patient/${id}`, data),
  listDoctors:          ()                => get('/admin/doctors'),
  createDoctor:         (data)            => post('/admin/doctor', data),
  updateDoctor:         (id, data)        => put(`/admin/doctor/${id}`, data),
  // setDoctorStatus reuses the same PUT /admin/doctor/:id route as
  // updateDoctor — the backend controller behind it (adminController.
  // setDoctorStatus) only toggles is_active from { isActive }, it doesn't
  // do a full profile update, so keep call sites using the right body shape.
  setDoctorStatus:      (id, isActive)    => put(`/admin/doctor/${id}`, { isActive }),
  listEpisodes:         ()                => get('/admin/episodes'),
  getPlatformStats:     ()                => get('/admin/stats'),
  getAuditLog:          (params)          => get('/admin/audit-log', params),
  exportAuditLog:       ()                => getBlob('/admin/audit-log/export'),
  getEncryptionStatus:  ()                => get('/admin/encryption-status'),
  getPaymentReport:     (params)          => get('/admin/payments/report', params),
};
