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

  // Auto-refresh on 401
  if (response.status === 401) {
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

function get(path)           { return apiFetch(path, { method: 'GET' }); }
function post(path, body)    { return apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }); }
function put(path, body)     { return apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }); }
function del(path)           { return apiFetch(path, { method: 'DELETE' }); }

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
  logout:         ()                    => post('/auth/logout'),
  setTokens,
  clearTokens,
  getToken,
};

// ─── Patient ──────────────────────────────────────────────────────────────

export const patientAPI = {
  getProfile:     ()                    => get('/patient/profile'),
  updateProfile:  (data)                => put('/patient/profile', data),
  getConsents:    ()                    => get('/patient/consents'),
  saveConsents:   (consentType, agreed, signatureData) =>
    post('/patient/consents', { consentType, agreed, signatureData }),
  getDocuments:   (episodeId)           => get(`/patient/documents/${episodeId}`),
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

export const paymentAPI = {
  createOrder:          (data)            => post('/payment/create-order', data),
  verifyPayment:        (data)            => post('/payment/verify', data),
  createFollowUpOrder:  (data)            => post('/payment/followup/create-order', data),
  verifyFollowUpPayment:(data)            => post('/payment/followup/verify', data),
};

// ─── Receipts ─────────────────────────────────────────────────────────────

export const receiptAPI = {
  // These open PDFs — use window.open with token in URL or fetch as blob
  // NOTE: this URL has no patientId — receiptController.js's functions
  // currently read patientId from req.params.id, which won't exist on
  // this route. They need to read req.user.id instead (fixed this pass,
  // see receiptController.js).
  downloadOpinionReceipt: (paymentId) =>
    apiFetch(`/receipt/opinion/${paymentId}`, { method: 'GET' }),
  downloadFollowUpReceipt: (followupPaymentId) =>
    apiFetch(`/receipt/followup/${followupPaymentId}`, { method: 'GET' }),
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
  submitMissingReports: (episodeId, data) => post(`/followup/missing-reports/${episodeId}`, data),
  uploadInvestigations: (episodeId, formData) => apiFetch(
    `/followup/investigation-upload/${episodeId}`,
    { method: 'POST', body: formData, headers: { Authorization: `Bearer ${getToken()}` } }
  ),
  submitFollowUpVisit:  (episodeId, data) => post(`/followup/visit/${episodeId}`, data),
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
  getAppointments:      ()                => get('/doctor/appointments'),
  getAppointmentDetail: (id)              => get(`/doctor/appointment/${id}`),
  updateAppointment:    (id, data)        => put(`/doctor/appointment/${id}`, data),
};

// ─── Admin ────────────────────────────────────────────────────────────────

export const adminAPI = {
  getDashboard:         ()                => get('/admin/dashboard'),
  listPatients:         ()                => get('/admin/patients'),
  getPatient:           (id)              => get(`/admin/patient/${id}`),
  updatePatient:        (id, data)        => put(`/admin/patient/${id}`, data),
  listDoctors:          ()                => get('/admin/doctors'),
  createDoctor:         (data)            => post('/admin/doctor', data),
  updateDoctor:         (id, data)        => put(`/admin/doctor/${id}`, data),
  listEpisodes:         ()                => get('/admin/episodes'),
  getPlatformStats:     ()                => get('/admin/stats'),
};
