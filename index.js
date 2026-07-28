const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const { authenticate, authorize, authorizePatientAccess, auditPhiAccess, verifyRazorpayWebhook } = require('../middleware/auth');
const { authLimiter, otpLimiter, uploadLimiter, uploadDocument, uploadPhoto, handleUploadError } = require('../middleware/security');

const authCtrl = require('../controllers/authController');
const patientCtrl = require('../controllers/patientController');
const { downloadReceipt } = patientCtrl;
const { listDoctors, getDoctorProfile, getDoctorAppointments, getDoctorPatientView, saveConsultationNotes, bookAppointment, razorpayWebhook, verifyPayment, downloadInvoice } = require('../controllers/doctorController');
const adminCtrl = require('../controllers/adminController');
const conditionCtrl = require('../controllers/conditionController');

// ─── Validators ────────────────────────────────────────────
const registerStep1Validators = [
  body('firstName').trim().notEmpty().isLength({ max: 100 }),
  body('middleName').optional().trim().isLength({ max: 100 }),
  body('lastName').trim().notEmpty().isLength({ max: 100 }),
  body('mobile').trim().matches(/^\+?[0-9]{10,15}$/),
  body('whatsapp').trim().matches(/^\+?[0-9]{10,15}$/),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  body('gender').isIn(['male', 'female', 'other', 'prefer_not_to_say']),
  body('addressLine1').trim().notEmpty(),
  body('city').trim().notEmpty(),
  body('state').trim().notEmpty(),
  body('pincode').trim().matches(/^\d{6}$/),
];

const loginValidators = [
  body('identifier').trim().notEmpty(),
  body('password').notEmpty(),
  body('role').isIn(['patient', 'doctor', 'admin', 'super_admin']),
];

// ============================================================
// AUTH ROUTES — /api/auth
// ============================================================
const authRouter = express.Router();

authRouter.post('/register/step1', authLimiter, registerStep1Validators, authCtrl.registerPatientStep1);
authRouter.post('/register/send-otp', otpLimiter, [body('patientId').isUUID(), body('channel').isIn(['mobile','whatsapp','email'])], authCtrl.sendVerificationOTPs);
authRouter.post('/register/verify-otp', authLimiter, [body('patientId').isUUID(), body('channel').isIn(['mobile','whatsapp','email']), body('otp').isLength({min:6,max:6})], authCtrl.verifyContactOTP);
authRouter.post('/register/consent', authenticate, [body('patientId').isUUID(), body('consentType').isIn(['treatment','data_privacy','telemedicine','photo']), body('agreed').isBoolean()], authCtrl.saveConsent);
authRouter.post('/register/photo', authenticate, [body('patientId').isUUID(), body('photoBase64').notEmpty()], authCtrl.savePhoto);
authRouter.post('/register/select-doctor', authenticate, [body('patientId').isUUID(), body('doctorId').isUUID()], authCtrl.selectDoctor);
authRouter.post('/login', authLimiter, loginValidators, authCtrl.login);
authRouter.post('/refresh', [body('refreshToken').notEmpty()], authCtrl.refreshToken);
authRouter.post('/logout', authenticate, authCtrl.logout);

// ============================================================
// PATIENT ROUTES — /api/patients
// ============================================================
const patientRouter = express.Router();
patientRouter.use(authenticate);

// ── Existing patient routes (unchanged) ────────────────────
patientRouter.get('/:id', authorize('patient','doctor','admin','super_admin'), authorizePatientAccess, auditPhiAccess('patient_profile'), patientCtrl.getPatient);
patientRouter.patch('/:id', authorize('patient','admin','super_admin'), authorizePatientAccess, patientCtrl.updatePatient);
patientRouter.get('/:id/photo', authorize('patient','doctor','admin','super_admin'), authorizePatientAccess, auditPhiAccess('patient_photo'), patientCtrl.getPatientPhoto);
patientRouter.get('/:id/documents', authorize('patient','doctor','admin','super_admin'), authorizePatientAccess, auditPhiAccess('documents'), patientCtrl.getDocuments);
patientRouter.post('/:id/documents', authorize('patient','doctor'), authorizePatientAccess, uploadLimiter, uploadDocument.single('file'), handleUploadError, patientCtrl.uploadDocument);
patientRouter.get('/:id/documents/:docId/download', authorize('patient','doctor','admin','super_admin'), authorizePatientAccess, patientCtrl.downloadDocument);
patientRouter.get('/:id/blood-values', authorize('patient','doctor','admin','super_admin'), authorizePatientAccess, patientCtrl.getBloodReportValues);
patientRouter.post('/:id/blood-values', authorize('doctor','admin','super_admin'), authorizePatientAccess, patientCtrl.addBloodReportValue);
patientRouter.get('/:id/consultations', authorize('patient','doctor','admin','super_admin'), authorizePatientAccess, auditPhiAccess('consultations'), patientCtrl.getConsultations);
patientRouter.get('/:id/invoices', authorize('patient','admin','super_admin'), authorizePatientAccess, patientCtrl.getInvoices);
patientRouter.get('/:id/invoices/:paymentId/receipt', authorize('patient','admin','super_admin'), authorizePatientAccess, downloadReceipt);

// ── Language preference (from i18n session) ────────────────
patientRouter.patch('/:id/language',
  authorize('patient'),
  authorizePatientAccess,
  [body('language_preference').isIn(['en','hi','mr','ta','te','kn','ml','bn','gu','pa','or'])],
  async (req, res) => {
    const { query: dbQuery } = require('../config/database');
    try {
      await dbQuery(
        'UPDATE patients SET language_preference = $1, updated_at = NOW() WHERE id = $2',
        [req.body.language_preference, req.params.id]
      );
      res.json({ success: true, language_preference: req.body.language_preference });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save language preference' });
    }
  }
);

patientRouter.get('/:id/language',
  authorize('patient'),
  authorizePatientAccess,
  async (req, res) => {
    const { query: dbQuery } = require('../config/database');
    try {
      const result = await dbQuery(
        'SELECT language_preference FROM patients WHERE id = $1',
        [req.params.id]
      );
      res.json({ language_preference: result.rows[0]?.language_preference || 'en' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch language preference' });
    }
  }
);

// ── Condition selection (Step 5.5) ─────────────────────────
patientRouter.post('/:id/condition-selection',
  authorize('patient'),
  authorizePatientAccess,
  [body('condition').isIn(['hypothyroidism','hyperthyroidism','thyroid_cancer'])],
  conditionCtrl.selectCondition
);

patientRouter.get('/:id/condition-selection',
  authorize('patient','doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.getConditionSelection
);

// ── Condition episodes ─────────────────────────────────────
patientRouter.get('/:id/episodes',
  authorize('patient','doctor','admin','super_admin'),
  authorizePatientAccess,
  auditPhiAccess('episodes'),
  conditionCtrl.getEpisodes
);

patientRouter.get('/:id/episodes/:episodeId',
  authorize('patient','doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.getEpisode
);

// ── Core questionnaire ─────────────────────────────────────
patientRouter.post('/:id/episodes/:episodeId/core-questionnaire',
  authorize('patient','doctor'),
  authorizePatientAccess,
  auditPhiAccess('core_questionnaire'),
  conditionCtrl.saveCoreQuestionnaire
);

patientRouter.get('/:id/episodes/:episodeId/core-questionnaire',
  authorize('patient','doctor','admin','super_admin'),
  authorizePatientAccess,
  auditPhiAccess('core_questionnaire'),
  conditionCtrl.getCoreQuestionnaire
);

// ── Hypothyroidism questionnaire ───────────────────────────
patientRouter.post('/:id/episodes/:episodeId/hypo-questionnaire',
  authorize('patient','doctor'),
  authorizePatientAccess,
  conditionCtrl.saveHypoQuestionnaire
);

patientRouter.get('/:id/episodes/:episodeId/hypo-questionnaire',
  authorize('patient','doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.getHypoQuestionnaire
);

// ── Hyperthyroidism questionnaire ──────────────────────────
patientRouter.post('/:id/episodes/:episodeId/hyper-questionnaire',
  authorize('patient','doctor'),
  authorizePatientAccess,
  conditionCtrl.saveHyperQuestionnaire
);

patientRouter.get('/:id/episodes/:episodeId/hyper-questionnaire',
  authorize('patient','doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.getHyperQuestionnaire
);

// ── Thyroid cancer questionnaire ───────────────────────────
patientRouter.post('/:id/episodes/:episodeId/tc-questionnaire',
  authorize('patient','doctor'),
  authorizePatientAccess,
  conditionCtrl.saveTcQuestionnaire
);

patientRouter.get('/:id/episodes/:episodeId/tc-questionnaire',
  authorize('patient','doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.getTcQuestionnaire
);

// ── Treatment history routes ───────────────────────────────
patientRouter.post('/:id/episodes/:episodeId/hypo-treatment',
  authorize('doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.addHypoTreatment
);

patientRouter.post('/:id/episodes/:episodeId/hyper-atd',
  authorize('doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.addHyperAtd
);

patientRouter.post('/:id/episodes/:episodeId/hyper-rai',
  authorize('doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.addHyperRai
);

patientRouter.post('/:id/episodes/:episodeId/tc-surgery',
  authorize('doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.addTcSurgery
);

patientRouter.post('/:id/episodes/:episodeId/tc-rai',
  authorize('doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.addTcRai
);

// ── Scan reports ───────────────────────────────────────────
patientRouter.post('/:id/episodes/:episodeId/scans',
  authorize('patient','doctor'),
  authorizePatientAccess,
  conditionCtrl.addScanReport
);

patientRouter.get('/:id/episodes/:episodeId/scans',
  authorize('patient','doctor','admin','super_admin'),
  authorizePatientAccess,
  conditionCtrl.getScanReports
);

// ── Translation proxy ──────────────────────────────────────
patientRouter.post('/translate',
  authenticate,
  [body('texts').isArray(), body('target').isString()],
  async (req, res) => {
    const { translateBatch } = require('../services/translationService');
    const { texts, target } = req.body;
    if (!Array.isArray(texts) || texts.length > 50) {
      return res.status(400).json({ error: 'texts must be array of max 50 items' });
    }
    try {
      const translations = await translateBatch(texts, target);
      res.json({ translations, target });
    } catch (err) {
      res.status(500).json({ error: 'Translation failed', translations: texts });
    }
  }
);

// ============================================================
// DOCTOR ROUTES — /api/doctors
// ============================================================
const doctorRouter = express.Router();

doctorRouter.get('/', listDoctors);
doctorRouter.get('/:id', getDoctorProfile);
doctorRouter.get('/:id/appointments', authenticate, authorize('doctor','admin','super_admin'), getDoctorAppointments);
doctorRouter.get('/:id/patients/:patientId', authenticate, authorize('doctor'), auditPhiAccess('doctor_patient_view'), getDoctorPatientView);

// ── Doctor condition summary view (new) ────────────────────
doctorRouter.get('/:id/patients/:patientId/conditions',
  authenticate,
  authorize('doctor','admin','super_admin'),
  auditPhiAccess('condition_summary'),
  conditionCtrl.getDoctorConditionView
);

// ============================================================
// CONSULTATION ROUTES — /api/consultations
// ============================================================
const consultationRouter = express.Router();
consultationRouter.use(authenticate);
consultationRouter.post('/:id/notes', authorize('doctor'), saveConsultationNotes);

// ============================================================
// APPOINTMENT ROUTES — /api/appointments
// ============================================================
const appointmentRouter = express.Router();
appointmentRouter.post('/', authenticate, authorize('patient'), [
  body('patientId').isUUID(), body('doctorId').isUUID(),
  body('scheduledAt').isISO8601(),
  body('consultationType').optional().isIn(['video','audio','text']),
], bookAppointment);

// ============================================================
// PAYMENT ROUTES — /api/payments
// ============================================================
const paymentRouter = express.Router();
paymentRouter.post('/webhook', verifyRazorpayWebhook, razorpayWebhook);
paymentRouter.post('/verify', authenticate, [
  body('razorpayOrderId').notEmpty(),
  body('razorpayPaymentId').notEmpty(),
  body('razorpaySignature').notEmpty(),
], verifyPayment);
paymentRouter.get('/:id/invoice/download', authenticate, downloadInvoice);

// ============================================================
// ADMIN ROUTES — /api/admin
// ============================================================
const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('admin', 'super_admin'));

adminRouter.get('/stats', adminCtrl.getPlatformStats);
adminRouter.get('/patients', adminCtrl.listPatients);
adminRouter.get('/doctors', adminCtrl.listDoctors);
adminRouter.post('/doctors', authorize('super_admin'), adminCtrl.createDoctor);
adminRouter.patch('/doctors/:id/status', authorize('super_admin'), [body('isActive').isBoolean()], adminCtrl.setDoctorStatus);
adminRouter.get('/audit-log', adminCtrl.getAuditLog);
adminRouter.get('/audit-log/export', authorize('super_admin'), adminCtrl.exportAuditLog);
adminRouter.get('/payments/report', adminCtrl.getPaymentReport);
adminRouter.get('/encryption/status', adminCtrl.getEncryptionStatus);

// ─── Mount all routers ─────────────────────────────────────
router.use('/auth', authRouter);
router.use('/patients', patientRouter);
router.use('/doctors', doctorRouter);
router.use('/consultations', consultationRouter);
router.use('/appointments', appointmentRouter);
router.use('/payments', paymentRouter);
router.use('/admin', adminRouter);

// ─── Health check ──────────────────────────────────────────
router.get('/health', async (req, res) => {
  const { testConnection } = require('../config/database');
  const dbOk = await testConnection();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: require('../../package.json').version,
  });
});

module.exports = router;
