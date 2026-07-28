// src/routes/index.js
// Single routes file — complete replacement always

const express = require('express');
const router  = express.Router();

// ─── Middleware ───────────────────────────────────────────────────────────
const { verifyToken, requireRole, sessionTimeout, auditPhiAccess } = require('../middleware/auth');
const {
  authLimiter, otpLimiter, uploadLimiter, uploadDocument, uploadPhoto, handleUploadError,
} = require('../middleware/security');

// ─── Controllers ─────────────────────────────────────────────────────────
const authController         = require('../controllers/authController');
const patientController      = require('../controllers/patientController');
const doctorController       = require('../controllers/doctorController');
const adminController        = require('../controllers/adminController');
const conditionController    = require('../controllers/conditionController');
const paymentController      = require('../controllers/paymentController');
const followUpController     = require('../controllers/followUpController');
const physicianController    = require('../controllers/physicianController');
const receiptController      = require('../controllers/receiptController');
const opinionController      = require('../controllers/opinionController');
const adviseLetterController = require('../controllers/adviseLetterController');

// ═══════════════════════════════════════════════════════════════════════════
// AUTH — rate limited
// ═══════════════════════════════════════════════════════════════════════════

router.post('/auth/patient/register-step1',
  authLimiter, authController.registerPatientStep1);
router.post('/auth/patient/send-verification-otp',
  otpLimiter,  authLimiter, authController.sendVerificationOTPs);
router.post('/auth/patient/verify-contact-otp',
  authLimiter, authController.verifyContactOTP);
router.post('/auth/patient/consent',
  authLimiter, authController.saveConsent);
router.post('/auth/patient/photo',
  authLimiter, authController.savePhoto);
router.post('/auth/patient/select-doctor',
  authLimiter, authController.selectDoctor);

router.post('/auth/login',              authLimiter, authController.login); // unified: body.role = 'patient' | 'doctor' | 'admin' | 'super_admin'
router.post('/auth/refresh',            authLimiter, authController.refreshToken);
router.post('/auth/logout',             verifyToken, authController.logout);

// Public doctor list for patient doctor-selection (registration Step 5) —
// ADDED. No verifyToken: the rest of the registration wizard (Step 1-5,
// see /auth/patient/* above) is unauthenticated too, patientId is passed
// directly rather than via JWT at this stage. Matches doctorAPI.listDoctors
// added to src/api/index.js this session — that export previously called
// a /doctors path that had no route at all.
router.get('/doctors', doctorController.listDoctors);

// ═══════════════════════════════════════════════════════════════════════════
// PATIENT
// ═══════════════════════════════════════════════════════════════════════════

router.get ('/patient/profile',
  verifyToken, requireRole('patient'), patientController.getPatient);
router.put ('/patient/profile',
  verifyToken, requireRole('patient'), patientController.updatePatient);

router.post('/patient/photo',
  verifyToken, requireRole('patient'),
  uploadLimiter, uploadPhoto.single('photo'), handleUploadError,
  patientController.uploadPhoto);

router.get ('/patient/consents',
  verifyToken, requireRole('patient'), patientController.getConsents);
router.post('/patient/consents',
  verifyToken, requireRole('patient'), patientController.saveConsents);

router.post('/patient/documents',
  verifyToken, requireRole('patient'),
  uploadLimiter, uploadDocument.array('files', 5), handleUploadError,
  auditPhiAccess('patient_documents'),
  patientController.uploadDocument);
router.get ('/patient/documents/:episodeId',
  verifyToken, requireRole('patient'),
  auditPhiAccess('patient_documents'),
  patientController.getDocuments);

router.get ('/patient/episode/:episodeId/timeline',
  verifyToken, requireRole('patient'), opinionController.getEpisodeTimeline);

router.get ('/patient/episode/:episodeId/opinion',
  verifyToken, requireRole('patient'),
  auditPhiAccess('patient_opinion'),
  opinionController.getPatientOpinion);
router.post('/patient/opinion/:opinionId/acknowledge',
  verifyToken, requireRole('patient'), opinionController.acknowledgeOpinion);

router.get ('/patient/episode/:episodeId/advise-letter/status',
  verifyToken, requireRole('patient'), adviseLetterController.getLetterStatus);
router.get ('/patient/episode/:episodeId/advise-letter/download',
  verifyToken, requireRole('patient'),
  auditPhiAccess('advise_letter'),
  adviseLetterController.patientDownloadLetter);

// ═══════════════════════════════════════════════════════════════════════════
// CONDITIONS + QUESTIONNAIRES
// ═══════════════════════════════════════════════════════════════════════════

router.post('/condition/select',
  verifyToken, requireRole('patient'), conditionController.selectCondition);
router.get ('/condition/episode/:episodeId',
  verifyToken, conditionController.getEpisode);

router.get ('/condition/core/:patientId/:episodeId',
  verifyToken, conditionController.getCoreQuestionnaire);
router.post('/condition/core/:patientId/:episodeId',
  verifyToken, conditionController.saveCoreQuestionnaire);

router.get ('/condition/hypo/:patientId/:episodeId',
  verifyToken, conditionController.getHypoQuestionnaire);
router.post('/condition/hypo/:patientId/:episodeId',
  verifyToken, conditionController.saveHypoQuestionnaire);

router.get ('/condition/hyper/:patientId/:episodeId',
  verifyToken, conditionController.getHyperQuestionnaire);
router.post('/condition/hyper/:patientId/:episodeId',
  verifyToken, conditionController.saveHyperQuestionnaire);

router.get ('/condition/tc/:patientId/:episodeId',
  verifyToken, conditionController.getTcQuestionnaire);
router.post('/condition/tc/:patientId/:episodeId',
  verifyToken, conditionController.saveTcQuestionnaire);

// Nodule routes RE-ADDED. conditionController.js was given
// saveNoduleQuestionnaire/getNoduleQuestionnaire earlier this session —
// but THIS ROUTES FILE'S OWN COMMENT (now removed) said it found zero
// Nodule functions when it inspected the controller. That means either
// this routes file predates that fix, or the updated conditionController.js
// hasn't actually been saved to disk at
// D:\Thyroid Consultation Software\thyroconsult-backend\src\controllers\conditionController.js
// yet. CONFIRM THAT FILE IS SAVED before deploying this routes file, or
// the server will crash on startup the exact same way this file warns
// about elsewhere (undefined route handler).
router.get ('/condition/nodule/:patientId/:episodeId',
  verifyToken, conditionController.getNoduleQuestionnaire);
router.post('/condition/nodule/:patientId/:episodeId',
  verifyToken, conditionController.saveNoduleQuestionnaire);

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════

router.post('/payment/create-order',
  verifyToken, requireRole('patient'), paymentController.createOrder);
router.post('/payment/verify',
  verifyToken, requireRole('patient'), paymentController.verifyPayment);
router.post('/payment/webhook',
  paymentController.handleWebhook);

// /payment/followup/create-order and /payment/followup/verify — CORRECTION:
// paymentController.createOrder already handles S1/S2/S3 gating itself via
// its `scenario` body param (resolvePayment() branches on 's1'/'s2'/'s3'
// and writes to followup_payments) — this was NOT unbuilt work, the
// existing comment here was wrong. The frontend should call
// paymentAPI.createOrder({ episodeId, scenario, conditionType }) for
// follow-up payments too, not a separate endpoint. paymentAPI's
// createFollowUpOrder/verifyFollowUpPayment exports in src/api/index.js
// have no route and should be removed or aliased to createOrder/verifyPayment.

// S1/S2/S3 status check — ADDED. paymentController.getGateStatus is fully
// built (own doc comment: "Called by PatientDashboard on login for each
// active episode") but had NO route anywhere in this file. This is what
// followUpAPI.getStatus(episodeId) in src/api/index.js actually needs —
// not a followUpController function as originally assumed here.
router.get('/followup/status/:episodeId',
  verifyToken, requireRole('patient'), paymentController.getGateStatus);

router.get('/receipt/opinion/:paymentId',
  verifyToken, receiptController.downloadOpinionReceipt);
router.get('/receipt/followup/:fpId',
  verifyToken, receiptController.downloadFollowupReceipt);
router.get('/receipt/invoices',
  verifyToken, requireRole('patient'), receiptController.getPatientInvoices);
// Route paths and controller function name both corrected this pass:
// - /receipt/consultation/ -> /receipt/opinion/ (platform-language rule;
//   also now matches receiptAPI in src/api/index.js, already renamed)
// - receiptController.downloadConsultationReceipt -> downloadOpinionReceipt
//   (the controller function itself was renamed in an earlier pass — this
//   routes file was still referencing the old name, which would have
//   crashed on startup: "Route.get() requires a callback function but
//   got a [object Undefined]")
// - :followupPaymentId -> :fpId (receiptController reads req.params.fpId;
//   the old param name here didn't match)
// - patientId: receiptController now reads req.user.id (the logged-in
//   patient's own session), not a URL param — already fixed in
//   receiptController.js, this comment previously said "not fixed here"
//   which is now stale.

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP VISITS
// ═══════════════════════════════════════════════════════════════════════════

// GET /followup/status/:episodeId — see paymentController.getGateStatus,
// registered above under PAYMENTS (that's the function that actually
// implements this, not anything in followUpController).
router.post('/followup/missing-reports/:episodeId',
  verifyToken, requireRole('patient'), followUpController.uploadMissingReport);
router.post('/followup/investigation-upload/:episodeId',
  verifyToken, requireRole('patient'),
  uploadLimiter, uploadDocument.array('files', 5), handleUploadError,
  followUpController.uploadInvestigationReport);
router.post('/followup/visit/:episodeId',
  verifyToken, requireRole('patient'), followUpController.submitFollowUp);

// ═══════════════════════════════════════════════════════════════════════════
// PHYSICIAN — sessionTimeout on all write actions
// ═══════════════════════════════════════════════════════════════════════════

router.get ('/physician/queue',
  verifyToken, requireRole('doctor'), opinionController.getPhysicianQueue);
router.get ('/physician/episode/:episodeId',
  verifyToken, requireRole('doctor'), opinionController.getEpisodeForReview);

router.post('/physician/episode/:episodeId/opinion/draft',
  verifyToken, requireRole('doctor'), sessionTimeout, opinionController.saveDraftOpinion);
router.post('/physician/episode/:episodeId/opinion/submit',
  verifyToken, requireRole('doctor'), sessionTimeout, opinionController.submitOpinion);
router.put ('/physician/opinion/:opinionId/amend',
  verifyToken, requireRole('doctor'), sessionTimeout, opinionController.amendOpinion);
router.post('/physician/episode/:episodeId/close',
  verifyToken, requireRole('doctor'), sessionTimeout, opinionController.closeEpisode);
router.get ('/physician/investigations/master',
  verifyToken, requireRole('doctor'), opinionController.getInvestigationMaster);

router.post('/physician/episode/:episodeId/advise-letter/generate',
  verifyToken, requireRole('doctor'), sessionTimeout, adviseLetterController.generateLetter);
router.get ('/physician/episode/:episodeId/advise-letter/download',
  verifyToken, requireRole('doctor'), adviseLetterController.doctorDownloadLetter);

router.get ('/physician/pending',
  verifyToken, requireRole('doctor'), physicianController.getPendingWork);
router.get ('/physician/episode/:episodeId/summary',
  verifyToken, requireRole('doctor'), physicianController.getEpisodeSummary);
router.post('/physician/episode/:episodeId/advise-investigations',
  verifyToken, requireRole('doctor'), sessionTimeout, physicianController.adviseInvestigations);
router.get ('/physician/episode/:episodeId/investigations',
  verifyToken, requireRole('doctor'), physicianController.getEpisodeInvestigations);
router.put ('/physician/investigation/:investigationId',
  verifyToken, requireRole('doctor'), sessionTimeout, physicianController.updateInvestigation);
router.delete('/physician/investigation/:investigationId',
  verifyToken, requireRole('doctor'), sessionTimeout, physicianController.deleteInvestigation);
router.post('/physician/episode/:episodeId/mark-investigation-reviewed',
  verifyToken, requireRole('doctor'), sessionTimeout, physicianController.markInvestigationReviewed);
router.get ('/physician/followup/:episodeId',
  verifyToken, requireRole('doctor'), physicianController.getFollowUpVisit);
router.post('/physician/followup/:episodeId/review',
  verifyToken, requireRole('doctor'), sessionTimeout, physicianController.reviewFollowUpVisit);

// ═══════════════════════════════════════════════════════════════════════════
// DOCTOR (appointments)
// ═══════════════════════════════════════════════════════════════════════════

router.get ('/doctor/profile',
  verifyToken, requireRole('doctor'), doctorController.getDoctorProfile);
router.put ('/doctor/profile',
  verifyToken, requireRole('doctor'), sessionTimeout, doctorController.updateProfile);

router.get ('/doctor/appointments',
  verifyToken, requireRole('doctor'), doctorController.getDoctorAppointments);
router.get ('/doctor/appointment/:appointmentId',
  verifyToken, requireRole('doctor'), doctorController.getAppointmentDetail);
router.put ('/doctor/appointment/:appointmentId',
  verifyToken, requireRole('doctor'), sessionTimeout, doctorController.updateAppointment);

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — sessionTimeout on all write actions + PHI audit on patient access
// ═══════════════════════════════════════════════════════════════════════════

router.get ('/admin/dashboard',
  verifyToken, requireRole('admin'), adminController.getPlatformStats); // stopgap: no separate getDashboard exists, reusing getPlatformStats — dashboard and /admin/stats will return identical data until a distinct summary function is written
router.get ('/admin/patients',
  verifyToken, requireRole('admin'), adminController.listPatients);
// GET/PUT /admin/patient/:patientId REMOVED — adminController has no
// single-patient detail or update functions (listPatients only returns
// a paginated list).
router.get ('/admin/doctors',
  verifyToken, requireRole('admin'), adminController.listDoctors);
router.post('/admin/doctor',
  verifyToken, requireRole('admin'), sessionTimeout, adminController.createDoctor);
router.put ('/admin/doctor/:doctorId',
  verifyToken, requireRole('admin'), sessionTimeout, adminController.setDoctorStatus); // partial match only: setDoctorStatus toggles isActive, doesn't do a full profile update
// GET /admin/episodes REMOVED — adminController has no episode-listing function.
router.get ('/admin/stats',
  verifyToken, requireRole('admin'), adminController.getPlatformStats);
router.get ('/admin/condition-fees',
  verifyToken, requireRole('admin'), paymentController.getConditionFees);
router.put ('/admin/condition-fees/:conditionType',
  verifyToken, requireRole('admin'), sessionTimeout, paymentController.updateConditionFee);

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

router.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

module.exports = router;
