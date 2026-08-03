/**
 * conditionController.js
 *
 * Handles all condition episode and questionnaire endpoints:
 *   - Condition selection (Step 5.5 of registration)
 *   - Episode creation / retrieval
 *   - Core questionnaire save / get
 *   - Hypothyroidism questionnaire save / get
 *   - Hyperthyroidism questionnaire save / get
 *   - Thyroid Cancer questionnaire save / get
 *   - Treatment history (all conditions)
 *   - Episode list for patient (all conditions)
 *
 * Follows exact same patterns as patientController.js:
 *   - query() from ../config/database
 *   - encryptPHI / decryptPHI from ../utils/encryption
 *   - logger.audit() for HIPAA trail
 */

const { query, transaction } = require('../config/database');
const { encryptPHI, decryptPHI } = require('../utils/encryption');
const { translateToEnglish } = require('../services/translationService');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────
// TRANSLATION — patient free text -> English for physician view
// (migration 019 — field_translations JSONB column per table)
// ─────────────────────────────────────────────────────────

// Columns per questionnaire table that may hold patient-authored free
// text in their own language. hypo_questionnaire and tc_questionnaire
// don't have "other/please specify" style columns as of this pass —
// add here if/when those questionnaires gain them.
const FREE_TEXT_FIELDS = {
  core_questionnaire: [
    'chief_complaint', 'sym_menstrual_changes', 'surgical_history_details',
    'allergies', 'occupation', 'sym_other', 'pmh_autoimmune_details',
    'pmh_autoimmune_other', 'hysterectomy_reason_other',
    'pmh_previous_thyroid_details', 'pmh_neck_radiation_details', 'pmh_other',
    'fh_thyroid_details', 'fh_thyroid_cancer_details', 'fh_autoimmune_details',
    'fh_other', 'radiation_exposure_details',
  ],
  hypo_questionnaire: [],
  hyper_questionnaire: [
    'graves_dermopathy_details', 'fnac_details', 'mtc_ret_mutation_details',
    'surveillance_notes',
  ],
  tc_questionnaire: [
    'fnac_details', 'mtc_ret_mutation_details', 'surveillance_notes',
  ],
  nodule_questionnaire: [
    'occupation_other', 'hysterectomy_reason_other', 'nodule_discovery_other',
    'outcomes_details', 'patient_concern_other', 'autoimmune_other',
    'radiation_exposure_other', 'additional_notes', 'opinion_trigger_other',
  ],
};

/**
 * Best-effort, non-blocking translation of whichever free-text fields
 * were part of THIS save into English, merged into field_translations.
 * Never throws — must never affect the patient's save response. Skipped
 * entirely if the patient's preferred_language is 'en' (nothing to do)
 * or if none of this save's fields are free-text fields with content.
 *
 * Called fire-and-forget (not awaited) from save*Questionnaire so AI
 * translation latency never delays the patient's save/autosave.
 */
async function translateFreeTextFields(table, episodeId, patientId, savedCols) {
  const fields = FREE_TEXT_FIELDS[table] || [];
  if (!fields.length) return;

  try {
    const patRow = await query('SELECT preferred_language FROM patients WHERE id = $1', [patientId]);
    const lang = patRow.rows[0]?.preferred_language || 'en';
    if (lang === 'en') return;

    const toTranslate = fields.filter(
      (f) => savedCols[f] !== undefined && savedCols[f] !== null && String(savedCols[f]).trim() !== ''
    );
    if (!toTranslate.length) return;

    const entries = {};
    for (const field of toTranslate) {
      try {
        const en = await translateToEnglish(String(savedCols[field]), lang);
        entries[field] = { en_ai: en, en_corrected: null, translated_at: new Date().toISOString() };
      } catch (fieldErr) {
        logger.error(`translateFreeTextFields: failed for ${table}.${field}`, {
          error: fieldErr.message, episodeId,
        });
        // Skip this field's entry. Physician falls back to seeing the raw
        // (non-English) value rather than nothing — see getEpisodeForReview.
      }
    }
    if (!Object.keys(entries).length) return;

    await query(
      `UPDATE ${table} SET field_translations = field_translations || $1::jsonb WHERE episode_id = $2`,
      [JSON.stringify(entries), episodeId]
    );
  } catch (err) {
    logger.error(`translateFreeTextFields error for ${table}`, { error: err.message, episodeId });
  }
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

/**
 * Build a SET clause dynamically.
 * encrypt: array of field names that need PHI encryption.
 */
function buildUpdate(body, fieldMap, encrypt = []) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = $${idx++}`);
      values.push(encrypt.includes(dbCol) ? encryptPHI(String(body[jsKey])) : body[jsKey]);
    }
  }
  return { fields, values, idx };
}

/** Safely decrypt a field — returns null if null/undefined */
const d = (val) => (val ? decryptPHI(val) : null);

// ─────────────────────────────────────────────────────────
// STEP 5.5 — CONDITION SELECTION
// ─────────────────────────────────────────────────────────

/**
 * POST /api/patients/:id/condition-selection
 * Body: { condition: 'hypothyroidism' | 'hyperthyroidism' | 'thyroid_cancer' | 'nodule' }
 *
 * Creates:
 *   1. patient_condition_selection row
 *   2. patient_condition_episodes row
 * (registration_step advancement removed — see payment reorder, this
 * always runs post-registration now)
 */
const selectCondition = async (req, res) => {
  const patientId = req.user.patientId;
  const { condition, doctorId } = req.body;

  const valid = ['hypothyroidism', 'hyperthyroidism', 'thyroid_cancer', 'nodule'];
  if (!valid.includes(condition)) {
    return res.status(400).json({ error: 'Invalid condition. Must be one of: ' + valid.join(', ') });
  }

  try {
    await transaction(async (client) => {
      // Upsert condition selection record
      await client.query(
        `INSERT INTO patient_condition_selection(patient_id, selected_condition, selected_at, completed)
         VALUES($1, $2, NOW(), TRUE)
         ON CONFLICT(patient_id) DO UPDATE
           SET selected_condition = EXCLUDED.selected_condition,
               selected_at        = NOW(),
               completed          = TRUE,
               updated_at         = NOW()`,
        [patientId, condition]
      );

      // Get the doctor assigned to this patient if not provided
      let assignedDoctorId = doctorId;
      if (!assignedDoctorId) {
        const patRow = await client.query(
          'SELECT primary_doctor_id FROM patients WHERE id = $1',
          [patientId]
        );
        assignedDoctorId = patRow.rows[0]?.primary_doctor_id || null;
      }

      // Create episode (upsert — patient can only have one episode per condition)
      await client.query(
        `INSERT INTO patient_condition_episodes(patient_id, condition, status, primary_doctor_id)
         VALUES($1, $2, 'active', $3)
         ON CONFLICT(patient_id, condition) DO UPDATE
           SET status            = 'active',
               primary_doctor_id = COALESCE(EXCLUDED.primary_doctor_id, patient_condition_episodes.primary_doctor_id),
               updated_at        = NOW()`,
        [patientId, condition, assignedDoctorId]
      );

      // registration_step advancement REMOVED (payment reorder). This used
      // to bump patients.registration_step to 6 for "Upload Reports" —
      // that step no longer exists. Condition selection now only ever
      // happens post-registration (Dashboard's "+ Add Condition" flow,
      // after Payment has already flipped registration_step to 6 and
      // registration_complete to TRUE in doctorAccountController.js), so this
      // guarded UPDATE (WHERE registration_step = 5) would already always
      // be a no-op by the time it runs. registration_step is now owned
      // entirely by authController.js/doctorAccountController.js's wizard.
    });

    logger.audit('CONDITION_SELECTED', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip,
      action_detail: `Selected condition: ${condition}`,
    });

    // Return the created episode
    const ep = await query(
      `SELECT * FROM patient_condition_episodes WHERE patient_id = $1 AND condition = $2`,
      [patientId, condition]
    );

    res.status(201).json({ message: 'Condition selected', episode: ep.rows[0] });
  } catch (err) {
    logger.error('selectCondition error', { error: err.message });
    res.status(500).json({ error: 'Failed to save condition selection' });
  }
};

/**
 * GET /api/patients/:id/condition-selection
 */
const getConditionSelection = async (req, res) => {
  try {
    const result = await query(
      `SELECT pcs.*, pce.id AS episode_id, pce.status AS episode_status,
              pce.questionnaire_status
       FROM patient_condition_selection pcs
       LEFT JOIN patient_condition_episodes pce
         ON pce.patient_id = pcs.patient_id AND pce.condition = pcs.selected_condition
       WHERE pcs.patient_id = $1`,
      [req.user.patientId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    logger.error('getConditionSelection error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch condition selection' });
  }
};

// ─────────────────────────────────────────────────────────
// EPISODES
// ─────────────────────────────────────────────────────────

/**
 * GET /api/patients/:id/episodes
 * Returns all condition episodes for a patient (with questionnaire status).
 */
const getEpisodes = async (req, res) => {
  const patientId = req.user.patientId || req.params.id;
  try {
    const result = await query(
      `SELECT pce.*,
              d.first_name AS doc_first, d.last_name AS doc_last,
              d.specialisation
       FROM patient_condition_episodes pce
       LEFT JOIN doctors d ON d.id = pce.primary_doctor_id
       WHERE pce.patient_id = $1
       ORDER BY pce.created_at DESC`,
      [patientId]
    );

    const episodes = result.rows.map(r => ({
      ...r,
      // Several frontend components (PatientPortal.js, PhysicianDashboard.js,
      // FollowUpVisit.js, MissingReports.js) read episode.condition_type and
      // episode.submitted_at, but patient_condition_episodes' real columns
      // are `condition` and `questionnaire_completed_at` — alias both here
      // so every consumer of this endpoint gets consistent field names.
      condition_type: r.condition,
      submitted_at: r.questionnaire_completed_at,
      doctorName: r.doc_first ? `Dr. ${d(r.doc_first)} ${d(r.doc_last)}` : null,
      doc_first: undefined,
      doc_last: undefined,
      diagnosedBy: d(r.diagnosed_by),
      diagnosed_by: undefined,
      diagnosisNotes: d(r.diagnosis_notes),
      diagnosis_notes: undefined,
    }));

    res.json({ episodes, total: episodes.length });
  } catch (err) {
    logger.error('getEpisodes error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch episodes' });
  }
};

/**
 * GET /api/patients/:id/episodes/:episodeId
 */
const getEpisode = async (req, res) => {
  try {
    const result = await query(
      `SELECT pce.*,
              d.first_name AS doc_first, d.last_name AS doc_last
       FROM patient_condition_episodes pce
       LEFT JOIN doctors d ON d.id = pce.primary_doctor_id
       WHERE pce.id = $1 AND pce.patient_id = $2`,
      [req.params.episodeId, req.user.patientId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Episode not found' });
    const r = result.rows[0];
    res.json({
      ...r,
      doctorName: r.doc_first ? `Dr. ${d(r.doc_first)} ${d(r.doc_last)}` : null,
      diagnosedBy: d(r.diagnosed_by),
      diagnosisNotes: d(r.diagnosis_notes),
    });
  } catch (err) {
    logger.error('getEpisode error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch episode' });
  }
};

// ─────────────────────────────────────────────────────────
// CORE QUESTIONNAIRE
// ─────────────────────────────────────────────────────────

/**
 * POST /api/patients/:id/episodes/:episodeId/core-questionnaire
 * Upserts the shared core questionnaire for an episode.
 */
const saveCoreQuestionnaire = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const { _currentSection, ...b } = req.body;

  // PHI fields that need encryption
  const phiFields = [
    'chief_complaint', 'sym_menstrual_changes', 'surgical_history_details',
    'allergies', 'occupation', 'diagnosed_by',
  ];

  try {
    // Verify episode belongs to patient
    const ep = await query(
      'SELECT id FROM patient_condition_episodes WHERE id = $1 AND patient_id = $2',
      [episodeId, patientId]
    );
    if (!ep.rows.length) return res.status(404).json({ error: 'Episode not found' });

    // Check if record exists
    const existing = await query(
      'SELECT id FROM core_questionnaire WHERE episode_id = $1',
      [episodeId]
    );

    const enc = (val, field) => (val !== undefined && val !== null && phiFields.includes(field))
      ? encryptPHI(String(val)) : val;

    const cols = {
      chief_complaint: enc(b.chiefComplaint, 'chief_complaint'),
      complaint_duration_value: b.complaintDurationValue,
      complaint_duration_unit: b.complaintDurationUnit,
      sym_fatigue: b.symFatigue,
      sym_weight_change: b.symWeightChange,
      sym_weight_kg: b.symWeightKg,
      sym_weight_duration_weeks: b.symWeightDurationWeeks,
      sym_neck_swelling: b.symNeckSwelling,
      sym_neck_swelling_side: b.symNeckSwellingSide,
      sym_neck_pain: b.symNeckPain,
      sym_difficulty_swallowing: b.symDifficultySwallowing,
      sym_voice_change: b.symVoiceChange,
      sym_breathlessness: b.symBreathlessness,
      sym_palpitations: b.symPalpitations,
      sym_heat_intolerance: b.symHeatIntolerance,
      sym_cold_intolerance: b.symColdIntolerance,
      sym_hair_loss: b.symHairLoss,
      sym_skin_changes: b.symSkinChanges,
      sym_bowel_changes: b.symBowelChanges,
      sym_menstrual_changes: enc(b.symMenstrualChanges, 'sym_menstrual_changes'),
      sym_mood_changes: b.symMoodChanges,
      sym_muscle_weakness: b.symMuscleWeakness,
      sym_joint_pain: b.symJointPain,
      sym_eye_changes: b.symEyeChanges,
      sym_other: b.symOther,
      height_cm: b.heightCm,
      weight_kg: b.weightKg,
      bmi: b.bmi,
      bp_systolic: b.bpSystolic,
      bp_diastolic: b.bpDiastolic,
      heart_rate: b.heartRate,
      temperature_celsius: b.temperatureCelsius,
      pmh_hypertension: b.pmhHypertension,
      pmh_diabetes: b.pmhDiabetes,
      pmh_cardiac: b.pmhCardiac,
      pmh_renal: b.pmhRenal,
      pmh_liver: b.pmhLiver,
      pmh_autoimmune: b.pmhAutoimmune,
      pmh_autoimmune_details: b.pmhAutoimmuneDetails,
      pmh_autoimmune_conditions: b.pmhAutoimmuneConditions?.length ? b.pmhAutoimmuneConditions : undefined,
      pmh_autoimmune_other: b.pmhAutoimmuneOther,
      pmh_hysterectomy: b.pmhHysterectomy,
      hysterectomy_date_precision: b.hysterectomyDatePrecision,
      hysterectomy_date: b.hysterectomyDate,
      hysterectomy_year: b.hysterectomyYear,
      hysterectomy_month: b.hysterectomyMonth,
      hysterectomy_reason: b.hysterectomyReason,
      hysterectomy_reason_other: b.hysterectomyReasonOther,
      pmh_previous_thyroid: b.pmhPreviousThyroid,
      pmh_previous_thyroid_details: b.pmhPreviousThyroidDetails,
      pmh_neck_radiation: b.pmhNeckRadiation,
      pmh_neck_radiation_details: b.pmhNeckRadiationDetails,
      pmh_other: b.pmhOther,
      surgical_history: b.surgicalHistory,
      surgical_history_details: enc(b.surgicalHistoryDetails, 'surgical_history_details'),
      fh_thyroid_disease: b.fhThyroidDisease,
      fh_thyroid_details: b.fhThyroidDetails,
      fh_thyroid_relations: b.fhThyroidRelations?.length ? b.fhThyroidRelations : undefined,
      fh_thyroid_condition: b.fhThyroidCondition,
      fh_thyroid_cancer: b.fhThyroidCancer,
      fh_thyroid_cancer_details: b.fhThyroidCancerDetails,
      fh_autoimmune: b.fhAutoimmune,
      fh_autoimmune_details: b.fhAutoimmuneDetails,
      fh_men_syndrome: b.fhMenSyndrome,
      fh_other: b.fhOther,
      current_medications: b.currentMedications ? JSON.stringify(b.currentMedications) : undefined,
      allergies: enc(b.allergies, 'allergies'),
      contrast_allergy: b.contrastAllergy,
      smoking_status: b.smokingStatus,
      smoking_pack_years: b.smokingPackYears,
      alcohol_status: b.alcoholStatus,
      occupation: enc(b.occupation, 'occupation'),
      radiation_exposure: b.radiationExposure,
      radiation_exposure_details: b.radiationExposureDetails,
      marital_status: b.maritalStatus,
      is_pregnant: b.isPregnant,
      is_breastfeeding: b.isBreastfeeding,
      gravida: b.gravida,
      para: b.para,
      last_menstrual_period: b.lastMenstrualPeriod,
      edd_date: b.eddDate,
      menopause_status: b.menopauseStatus,
      menopause_years_ago: b.menopauseYearsAgo,
      menstrual_change_status: b.menstrualChangeStatus,
      menstrual_pattern: b.menstrualPattern,
      menstrual_flow: b.menstrualFlow?.length ? b.menstrualFlow : undefined,
      menstrual_since_date: b.menstrualSinceDate,
      menstrual_years: b.menstrualYears,
      menstrual_months: b.menstrualMonths,
      prev_tsh_done: b.prevTshDone,
      prev_tsh_value: b.prevTshValue,
      prev_tsh_date: b.prevTshDate,
      prev_usg_done: b.prevUsgDone,
      prev_usg_date: b.prevUsgDate,
      prev_fnac_done: b.prevFnacDone,
      prev_fnac_result: b.prevFnacResult,
    };

    // Remove undefined values
    const defined = Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== undefined));
    if (_currentSection !== undefined) defined.current_section = _currentSection;

    if (existing.rows.length) {
      // UPDATE
      const sets = Object.keys(defined).map((k, i) => `${k} = $${i + 1}`);
      const vals = [...Object.values(defined), episodeId];
      await query(
        `UPDATE core_questionnaire SET ${sets.join(', ')}, updated_at = NOW()
         WHERE episode_id = $${vals.length}`,
        vals
      );
    } else {
      // INSERT
      const colNames = ['episode_id', 'patient_id', ...Object.keys(defined)];
      const placeholders = colNames.map((_, i) => `$${i + 1}`);
      const vals = [episodeId, patientId, ...Object.values(defined)];
      await query(
        `INSERT INTO core_questionnaire(${colNames.join(', ')}) VALUES(${placeholders.join(', ')})`,
        vals
      );
    }

    // Update questionnaire status on episode
    await query(
      `UPDATE patient_condition_episodes
       SET questionnaire_status = 'in_progress', updated_at = NOW()
       WHERE id = $1 AND questionnaire_status = 'not_started'`,
      [episodeId]
    );

    logger.audit('CORE_QUESTIONNAIRE_SAVED', {
      userId: req.user.id, userRole: req.user.role,
      patientId, ip: req.ip, resourceId: episodeId,
    });

    res.json({ message: 'Core questionnaire saved' });

    // Fire-and-forget — do not delay the save response on AI translation.
    translateFreeTextFields('core_questionnaire', episodeId, patientId, defined)
      .catch((e) => logger.error('translateFreeTextFields (core) error', { error: e.message }));
  } catch (err) {
    logger.error('saveCoreQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to save core questionnaire' });
  }
};

/**
 * GET /api/patients/:id/episodes/:episodeId/core-questionnaire
 */
const getCoreQuestionnaire = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM core_questionnaire WHERE episode_id = $1 AND patient_id = $2',
      [req.params.episodeId, req.user.patientId]
    );
    if (!result.rows.length) return res.json(null);

    const r = result.rows[0];
    res.json({
      ...r,
      chiefComplaint: d(r.chief_complaint),
      symMenstrualChanges: d(r.sym_menstrual_changes),
      surgicalHistoryDetails: d(r.surgical_history_details),
      allergies: d(r.allergies),
      occupation: d(r.occupation),
      currentMedications: r.current_medications || [],
    });
  } catch (err) {
    logger.error('getCoreQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch core questionnaire' });
  }
};

// ─────────────────────────────────────────────────────────
// HYPOTHYROIDISM QUESTIONNAIRE
// ─────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────
// HYPO_QUESTIONNAIRE — whitelist matches live schema after migrations
// 025 (lab panel / comorbidity / CBC / new-symptom standardization) and
// 026 (RAI extended to all 4 modules). Regenerate this list from
// information_schema.columns if the schema changes again — do not
// hand-edit column names here.
// ─────────────────────────────────────────────────────────
const HYPO_Q_COLUMNS = [
  'acidity_days', 'acidity_med_dose', 'acidity_med_freq', 'acidity_med_name',
  'acidity_med_since_date', 'acidity_med_since_months', 'acidity_med_since_years',
  'acidity_months', 'acidity_on_med', 'acidity_since_date', 'acidity_status', 'acidity_years',
  'additional_notes', 'anaemia_days', 'anaemia_meds',
  'anaemia_months', 'anaemia_on_med', 'anaemia_since_date', 'anaemia_status', 'anaemia_type',
  'anaemia_years', 'anti_tg_positive', 'anti_tpo_positive', 'antitg_date', 'antitg_ref_high',
  'antitg_ref_low', 'antitg_status', 'antitg_unit', 'antitg_value', 'antitpo_date',
  'antitpo_ref_high', 'antitpo_ref_low', 'antitpo_status', 'antitpo_unit', 'antitpo_value',
  'cause', 'cbc_date', 'cbc_diff_basophils_count_ref_high', 'cbc_diff_basophils_count_ref_low',
  'cbc_diff_basophils_count_unit', 'cbc_diff_basophils_count_value',
  'cbc_diff_basophils_pct_ref_high', 'cbc_diff_basophils_pct_ref_low',
  'cbc_diff_basophils_pct_value', 'cbc_diff_eosinophils_count_ref_high',
  'cbc_diff_eosinophils_count_ref_low', 'cbc_diff_eosinophils_count_unit',
  'cbc_diff_eosinophils_count_value', 'cbc_diff_eosinophils_pct_ref_high',
  'cbc_diff_eosinophils_pct_ref_low', 'cbc_diff_eosinophils_pct_value',
  'cbc_diff_lymphocytes_count_ref_high', 'cbc_diff_lymphocytes_count_ref_low',
  'cbc_diff_lymphocytes_count_unit', 'cbc_diff_lymphocytes_count_value',
  'cbc_diff_lymphocytes_pct_ref_high', 'cbc_diff_lymphocytes_pct_ref_low',
  'cbc_diff_lymphocytes_pct_value', 'cbc_diff_monocytes_count_ref_high',
  'cbc_diff_monocytes_count_ref_low', 'cbc_diff_monocytes_count_unit',
  'cbc_diff_monocytes_count_value', 'cbc_diff_monocytes_pct_ref_high',
  'cbc_diff_monocytes_pct_ref_low', 'cbc_diff_monocytes_pct_value',
  'cbc_diff_neutrophils_count_ref_high', 'cbc_diff_neutrophils_count_ref_low',
  'cbc_diff_neutrophils_count_unit', 'cbc_diff_neutrophils_count_value',
  'cbc_diff_neutrophils_pct_ref_high', 'cbc_diff_neutrophils_pct_ref_low',
  'cbc_diff_neutrophils_pct_value', 'cbc_haematocrit_ref_high', 'cbc_haematocrit_ref_low',
  'cbc_haematocrit_unit', 'cbc_haematocrit_value', 'cbc_haemoglobin_ref_high',
  'cbc_haemoglobin_ref_low', 'cbc_haemoglobin_unit', 'cbc_haemoglobin_value', 'cbc_mch_ref_high',
  'cbc_mch_ref_low', 'cbc_mch_unit', 'cbc_mch_value', 'cbc_mchc_ref_high', 'cbc_mchc_ref_low',
  'cbc_mchc_unit', 'cbc_mchc_value', 'cbc_mcv_ref_high', 'cbc_mcv_ref_low', 'cbc_mcv_unit',
  'cbc_mcv_value', 'cbc_platelet_count_ref_high', 'cbc_platelet_count_ref_low',
  'cbc_platelet_count_unit', 'cbc_platelet_count_value', 'cbc_rbc_count_ref_high',
  'cbc_rbc_count_ref_low', 'cbc_rbc_count_unit', 'cbc_rbc_count_value', 'cbc_rdw_ref_high',
  'cbc_rdw_ref_low', 'cbc_rdw_unit', 'cbc_rdw_value', 'cbc_status', 'cbc_wbc_total_ref_high',
  'cbc_wbc_total_ref_low', 'cbc_wbc_total_unit', 'cbc_wbc_total_value', 'depression_days',
  'depression_diagnosed', 'depression_med_dose', 'depression_med_freq', 'depression_med_name',
  'depression_med_since_date', 'depression_med_since_months', 'depression_med_since_years',
  'depression_months', 'depression_on_med', 'depression_since_date', 'depression_status',
  'depression_years', 'diabetes_days', 'diabetes_duration_months', 'diabetes_meds',
  'diabetes_months', 'diabetes_on_med',
  'diabetes_since_date', 'diabetes_status', 'diabetes_type', 'diabetes_years',
  'dose_change_reason_type', 'dose_changed_status', 'dose_last_changed_date', 'dose_last_changed_reason',
  'dyslipidaemia_days', 'dyslipidaemia_meds', 'dyslipidaemia_months',
  'dyslipidaemia_on_med', 'dyslipidaemia_since_date', 'dyslipidaemia_status',
  'dyslipidaemia_years', 'edd_date', 'family_cancer_relative', 'family_cancer_status',
  'family_cancer_types', 'ft3_date', 'ft3_ref_high', 'ft3_ref_low', 'ft3_status', 'ft3_unit',
  'ft3_value', 'ft4_date', 'ft4_ref_high', 'ft4_ref_low', 'ft4_status', 'ft4_unit', 'ft4_value',
  'goitre_present', 'goitre_size', 'goitre_size_value', 'has_infertility', 'hashimotos_anti_tg',
  'hashimotos_anti_tpo', 'hashimotos_anti_tg_value', 'hashimotos_anti_tpo_value', 'hashimotos_confirmed',
  'anaemia_types', 'htn_days', 'htn_meds',
  'htn_months', 'htn_on_med', 'htn_since_date', 'htn_status', 'htn_years', 'hypo_cause_known',
  'hypo_duration_date', 'hypo_duration_days', 'hypo_duration_months', 'hypo_duration_years',
  'hysterectomy_date', 'hysterectomy_date_precision', 'hysterectomy_month',
  'hysterectomy_reason', 'hysterectomy_reason_other', 'hysterectomy_status', 'hysterectomy_year',
  'imaging_finding', 'infertility_status', 'is_subclinical', 'lmp_date', 'marital_status',
  'menopause_status', 'menopause_years_ago', 'menstrual_change_status', 'menstrual_flow',
  'menstrual_months', 'menstrual_pattern', 'menstrual_since_date', 'menstrual_years',
  'next_review_date', 'occupation', 'occupation_other', 'on_treatment', 'osteoporosis_days',
  'osteoporosis_dexa', 'osteoporosis_med_dose', 'osteoporosis_med_freq', 'osteoporosis_med_name',
  'osteoporosis_med_since_date', 'osteoporosis_med_since_months', 'osteoporosis_med_since_years',
  'osteoporosis_months', 'osteoporosis_on_med', 'osteoporosis_since_date', 'osteoporosis_status',
  'osteoporosis_years', 'pcos_days', 'pcos_meds', 'pcos_months',
  'pcos_on_med', 'pcos_pmos_label', 'pcos_since_date', 'pcos_status', 'pcos_years',
  'pregnancy_status', 'rai_administrations', 'review_frequency', 'sr_ferritin_date',
  'sr_ferritin_ref_high', 'sr_ferritin_ref_low', 'sr_ferritin_status', 'sr_ferritin_unit',
  'sr_ferritin_value', 'sr_iron_date', 'sr_iron_ref_high', 'sr_iron_ref_low', 'sr_iron_status',
  'sr_iron_unit', 'sr_iron_value', 'sym_abdominal_days', 'sym_abdominal_months',
  'sym_abdominal_since_date', 'sym_abdominal_status', 'sym_abdominal_types',
  'sym_abdominal_years', 'sym_appetite_status', 'sym_blackout_assessed', 'sym_blackout_count',
  'sym_blackout_dx', 'sym_blackout_last_date', 'sym_blackout_status', 'sym_bowel_days',
  'sym_bowel_months', 'sym_bowel_since_date', 'sym_bowel_status', 'sym_bowel_type',
  'sym_bowel_years', 'sym_bradycardia_days', 'sym_bradycardia_months',
  'sym_bradycardia_pulse_bpm', 'sym_bradycardia_since_date', 'sym_bradycardia_status',
  'sym_bradycardia_years', 'sym_brittle_nails', 'sym_carpal_data', 'sym_carpal_tunnel',
  'sym_cognitive_impairment', 'sym_cold_days', 'sym_cold_impact', 'sym_cold_months',
  'sym_cold_since_date', 'sym_cold_status', 'sym_cold_years', 'sym_concentration_days',
  'sym_concentration_impact', 'sym_concentration_months', 'sym_concentration_since_date',
  'sym_concentration_status', 'sym_concentration_years', 'sym_cramp_days', 'sym_cramp_months',
  'sym_cramp_since_date', 'sym_cramp_status', 'sym_cramp_years', 'sym_delayed_reflexes',
  'sym_depression', 'sym_depression_days', 'sym_depression_diagnosed', 'sym_depression_months',
  'sym_depression_seen_doctor', 'sym_depression_since_date', 'sym_depression_status',
  'sym_depression_years', 'sym_dry_skin', 'sym_facial_oedema_days', 'sym_facial_oedema_months',
  'sym_facial_oedema_since_date', 'sym_facial_oedema_status', 'sym_facial_oedema_years',
  'sym_fatigue_days', 'sym_fatigue_months', 'sym_fatigue_severity', 'sym_fatigue_since_date',
  'sym_fatigue_status', 'sym_fatigue_years', 'sym_giddiness_days', 'sym_giddiness_freq',
  'sym_giddiness_months', 'sym_giddiness_since_date', 'sym_giddiness_status',
  'sym_giddiness_years', 'sym_hair_data', 'sym_hair_status', 'sym_hearing_days',
  'sym_hearing_months', 'sym_hearing_since_date', 'sym_hearing_status', 'sym_hearing_type',
  'sym_hearing_years', 'sym_hoarseness_days', 'sym_hoarseness_months', 'sym_hoarseness_pattern',
  'sym_hoarseness_since_date', 'sym_hoarseness_status', 'sym_hoarseness_years',
  'sym_hypersomnia_days', 'sym_hypersomnia_months', 'sym_hypersomnia_since_date',
  'sym_hypersomnia_status', 'sym_hypersomnia_years', 'sym_macroglossia',
  'sym_macroglossia_status', 'sym_macroglossia_days', 'sym_macroglossia_months', 'sym_macroglossia_since_date', 'sym_macroglossia_years', 'sym_memory_days', 'sym_memory_impact', 'sym_memory_months',
  'sym_memory_since_date', 'sym_memory_status', 'sym_memory_years', 'sym_myxoedema',
  'sym_nail_data', 'sym_nail_status', 'sym_pedal_oedema_days', 'sym_pedal_oedema_months',
  'sym_pedal_oedema_since_date', 'sym_pedal_oedema_status', 'sym_pedal_oedema_type',
  'sym_pedal_oedema_years', 'sym_periorbital_days', 'sym_periorbital_months',
  'sym_periorbital_puffiness', 'sym_periorbital_since_date', 'sym_periorbital_status',
  'sym_periorbital_years', 'sym_reflexes_days', 'sym_reflexes_months', 'sym_reflexes_since_date',
  'sym_reflexes_status', 'sym_reflexes_years', 'sym_skin_days', 'sym_skin_months',
  'sym_skin_since_date', 'sym_skin_status', 'sym_skin_types', 'sym_skin_years',
  'sym_weakness_days', 'sym_weakness_location', 'sym_weakness_months', 'sym_weakness_since_date',
  'sym_weakness_status', 'sym_weakness_years', 'sym_weight_days', 'sym_weight_direction',
  'sym_weight_kg_val', 'sym_weight_months', 'sym_weight_since_date', 'sym_weight_status',
  'sym_weight_years', 't3_date', 't3_ref_high', 't3_ref_low', 't3_status', 't3_unit', 't3_value',
  't4_date', 't4_ref_high', 't4_ref_low', 't4_status', 't4_unit', 't4_value', 'tg_date',
  'tg_ref_high', 'tg_ref_low', 'tg_status', 'tg_unit', 'tg_value', 'tgab_date', 'tgab_ref_high',
  'tgab_ref_low', 'tgab_status', 'tgab_unit', 'tgab_value', 'thyroid_med_brand',
  'thyroid_med_compliance', 'thyroid_med_dose', 'thyroid_med_name', 'thyroid_med_since_months',
  'thyroid_med_since_years', 'thyroid_med_status', 'thyroid_med_timing',
  'liothyronine_brand', 'liothyronine_name', 'liothyronine_dose', 'liothyronine_timing',
  'liothyronine_compliance', 'liothyronine_since_years', 'liothyronine_since_months',
  'liothyronine_dose_changed_status', 'liothyronine_dose_changed_date', 'liothyronine_dose_change_reason',
  'sym_hearing_data', 'tibc_date',
  'tibc_ref_high', 'tibc_ref_low', 'tibc_status', 'tibc_unit', 'tibc_value', 'trab_date',
  'trab_ref_high', 'trab_ref_low', 'trab_status', 'trab_unit', 'trab_value',
  'transferrin_sat_date', 'transferrin_sat_ref_high', 'transferrin_sat_ref_low',
  'transferrin_sat_status', 'transferrin_sat_unit', 'transferrin_sat_value',
  'treatment_start_date_val', 'treatment_start_months_val', 'treatment_start_years',
  'treatment_type', 'tsh_date', 'tsh_ref_high', 'tsh_ref_low', 'tsh_status', 'tsh_target',
  'tsh_unit', 'tsh_value', 'tsi_date', 'tsi_ref_high', 'tsi_ref_low', 'tsi_status', 'tsi_unit',
  'tsi_value', 'vit_b12_date', 'vit_b12_ref_high', 'vit_b12_ref_low', 'vit_b12_status',
  'vit_b12_unit', 'vit_b12_value', 'vit_d3_date', 'vit_d3_ref_high', 'vit_d3_ref_low',
  'vit_d3_status', 'vit_d3_unit', 'vit_d3_value'
];
const HYPO_Q_JSONB_COLUMNS = new Set(['rai_administrations', 'sym_carpal_data', 'sym_hair_data', 'sym_nail_data', 'sym_hearing_data', 'anaemia_meds', 'diabetes_meds', 'dyslipidaemia_meds', 'htn_meds', 'pcos_meds', 'anaemia_types']);

const saveHypoQuestionnaire = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const { _draft, _currentPage, ...body } = req.body;

  try {
    const ep = await query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND patient_id = $2 AND condition = 'hypothyroidism'`,
      [episodeId, patientId]
    );
    if (!ep.rows.length) return res.status(404).json({ error: 'Hypothyroidism episode not found' });

    const defined = {};
    for (const col of HYPO_Q_COLUMNS) {
      if (body[col] === undefined) continue;
      defined[col] = HYPO_Q_JSONB_COLUMNS.has(col) ? JSON.stringify(body[col]) : body[col];
    }
    defined.is_draft = !!_draft;
    if (_currentPage !== undefined) defined.current_page = _currentPage;

    const existing = await query(
      'SELECT id FROM hypo_questionnaire WHERE episode_id = $1', [episodeId]
    );

    const cols = Object.keys(defined);
    const vals = Object.values(defined);

    if (existing.rows.length) {
      const sets = cols.map((c, i) => `${c} = $${i + 1}`);
      await query(
        `UPDATE hypo_questionnaire SET ${sets.join(', ')}, updated_at = NOW() WHERE episode_id = $${cols.length + 1}`,
        [...vals, episodeId]
      );
    } else {
      const insertCols = ['episode_id', 'patient_id', ...cols];
      const placeholders = insertCols.map((_, i) => `$${i + 1}`);
      await query(
        `INSERT INTO hypo_questionnaire(${insertCols.join(', ')}) VALUES(${placeholders.join(', ')})`,
        [episodeId, patientId, ...vals]
      );
    }

    if (!_draft) await markQuestionnaireComplete(episodeId);

    logger.audit('HYPO_QUESTIONNAIRE_SAVED', {
      userId: req.user.id, userRole: req.user.role, patientId, ip: req.ip,
    });

    res.json({ message: 'Hypothyroidism questionnaire saved' });

    translateFreeTextFields('hypo_questionnaire', episodeId, patientId, defined)
      .catch((e) => logger.error('translateFreeTextFields (hypo) error', { error: e.message }));
  } catch (err) {
    logger.error('saveHypoQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to save hypo questionnaire' });
  }
};
const getHypoQuestionnaire = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM hypo_questionnaire WHERE episode_id = $1 AND patient_id = $2',
      [req.params.episodeId, req.user.patientId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    logger.error('getHypoQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch hypothyroidism questionnaire' });
  }
};

// ─────────────────────────────────────────────────────────
// HYPERTHYROIDISM QUESTIONNAIRE
// ─────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────
// HYPER_QUESTIONNAIRE — whitelist matches live schema after migrations
// 025 (lab panel / comorbidity / CBC / new-symptom standardization) and
// 026 (RAI extended to all 4 modules). Regenerate this list from
// information_schema.columns if the schema changes again — do not
// hand-edit column names here.
// ─────────────────────────────────────────────────────────
const HYPER_Q_COLUMNS = [
  'anaemia_meds', 'diabetes_meds', 'dyslipidaemia_meds', 'htn_meds', 'pcos_meds',
  'acidity_days', 'acidity_med_dose', 'acidity_med_freq', 'acidity_med_name',
  'acidity_med_since_date', 'acidity_med_since_months', 'acidity_med_since_years',
  'acidity_months', 'acidity_on_med', 'acidity_since_date', 'acidity_status', 'acidity_years',
  'acropathy_status', 'additional_notes', 'anaemia_days', 'anaemia_med_dose', 'anaemia_med_freq',
  'anaemia_med_name', 'anaemia_med_since_date', 'anaemia_med_since_months',
  'anaemia_med_since_years', 'anaemia_months', 'anaemia_on_med', 'anaemia_since_date',
  'anaemia_status', 'anaemia_types', 'anaemia_years', 'antibody_status', 'antitg_date',
  'antitg_ref_high', 'antitg_ref_low', 'antitg_status', 'antitg_unit', 'antitg_value',
  'antitpo_date', 'antitpo_ref_high', 'antitpo_ref_low', 'antitpo_status', 'antitpo_unit',
  'antitpo_value', 'atd_agranulocytosis_history', 'atd_block_replace', 'atd_compliance',
  'atd_dose_mg', 'atd_drug', 'atd_end_date', 'atd_frequency', 'atd_side_effects',
  'atd_start_date', 'autoimmune_data', 'autoimmune_status', 'beta_blocker_dose',
  'beta_blocker_freq', 'beta_blocker_name', 'beta_blocker_since_date',
  'beta_blocker_since_months', 'cause', 'cbc_date', 'cbc_diff_basophils_count_ref_high',
  'cbc_diff_basophils_count_ref_low', 'cbc_diff_basophils_count_unit',
  'cbc_diff_basophils_count_value', 'cbc_diff_basophils_pct_ref_high',
  'cbc_diff_basophils_pct_ref_low', 'cbc_diff_basophils_pct_value',
  'cbc_diff_eosinophils_count_ref_high', 'cbc_diff_eosinophils_count_ref_low',
  'cbc_diff_eosinophils_count_unit', 'cbc_diff_eosinophils_count_value',
  'cbc_diff_eosinophils_pct_ref_high', 'cbc_diff_eosinophils_pct_ref_low',
  'cbc_diff_eosinophils_pct_value', 'cbc_diff_lymphocytes_count_ref_high',
  'cbc_diff_lymphocytes_count_ref_low', 'cbc_diff_lymphocytes_count_unit',
  'cbc_diff_lymphocytes_count_value', 'cbc_diff_lymphocytes_pct_ref_high',
  'cbc_diff_lymphocytes_pct_ref_low', 'cbc_diff_lymphocytes_pct_value',
  'cbc_diff_monocytes_count_ref_high', 'cbc_diff_monocytes_count_ref_low',
  'cbc_diff_monocytes_count_unit', 'cbc_diff_monocytes_count_value',
  'cbc_diff_monocytes_pct_ref_high', 'cbc_diff_monocytes_pct_ref_low',
  'cbc_diff_monocytes_pct_value', 'cbc_diff_neutrophils_count_ref_high',
  'cbc_diff_neutrophils_count_ref_low', 'cbc_diff_neutrophils_count_unit',
  'cbc_diff_neutrophils_count_value', 'cbc_diff_neutrophils_pct_ref_high',
  'cbc_diff_neutrophils_pct_ref_low', 'cbc_diff_neutrophils_pct_value',
  'cbc_haematocrit_ref_high', 'cbc_haematocrit_ref_low', 'cbc_haematocrit_unit',
  'cbc_haematocrit_value', 'cbc_haemoglobin_ref_high', 'cbc_haemoglobin_ref_low',
  'cbc_haemoglobin_unit', 'cbc_haemoglobin_value', 'cbc_mch_ref_high', 'cbc_mch_ref_low',
  'cbc_mch_unit', 'cbc_mch_value', 'cbc_mchc_ref_high', 'cbc_mchc_ref_low', 'cbc_mchc_unit',
  'cbc_mchc_value', 'cbc_mcv_ref_high', 'cbc_mcv_ref_low', 'cbc_mcv_unit', 'cbc_mcv_value',
  'cbc_platelet_count_ref_high', 'cbc_platelet_count_ref_low', 'cbc_platelet_count_unit',
  'cbc_platelet_count_value', 'cbc_rbc_count_ref_high', 'cbc_rbc_count_ref_low',
  'cbc_rbc_count_unit', 'cbc_rbc_count_value', 'cbc_rdw_ref_high', 'cbc_rdw_ref_low',
  'cbc_rdw_unit', 'cbc_rdw_value', 'cbc_status', 'cbc_wbc_total_ref_high',
  'cbc_wbc_total_ref_low', 'cbc_wbc_total_unit', 'cbc_wbc_total_value', 'current_treatment_type',
  'definitive_tx_date', 'definitive_tx_status', 'definitive_tx_type', 'depression_days',
  'depression_diagnosed', 'depression_med_dose', 'depression_med_freq', 'depression_med_name',
  'depression_med_since_date', 'depression_med_since_months', 'depression_med_since_years',
  'depression_months', 'depression_on_med', 'depression_since_date', 'depression_status',
  'depression_years', 'dermopathy_since_months', 'dermopathy_status', 'diabetes_days',
  'diabetes_med_dose', 'diabetes_med_freq', 'diabetes_med_name', 'diabetes_med_since_date',
  'diabetes_med_since_months', 'diabetes_med_since_years', 'diabetes_months', 'diabetes_on_med',
  'diabetes_since_date', 'diabetes_since_months', 'diabetes_status', 'diabetes_type',
  'diabetes_years', 'dose_change_direction', 'dose_changed_date', 'dose_changed_reason',
  'dose_changed_status', 'dyslipidaemia_days', 'dyslipidaemia_med_dose',
  'dyslipidaemia_med_freq', 'dyslipidaemia_med_name', 'dyslipidaemia_med_since_date',
  'dyslipidaemia_med_since_months', 'dyslipidaemia_med_since_years', 'dyslipidaemia_months',
  'dyslipidaemia_on_med', 'dyslipidaemia_since_date', 'dyslipidaemia_since_months',
  'dyslipidaemia_status', 'dyslipidaemia_years', 'e3_fnac_date', 'e3_fnac_result',
  'e3_fnac_status', 'e3_nodule_size_cm', 'edd_date', 'family_cancer_relative',
  'family_cancer_status', 'family_cancer_types', 'family_thyroid_data', 'family_thyroid_status',
  'fnac_date', 'fnac_result', 'fnac_status', 'ft3_date', 'ft3_ref_high', 'ft3_ref_low',
  'ft3_status', 'ft3_unit', 'ft3_value', 'ft4_date', 'ft4_ref_high', 'ft4_ref_low', 'ft4_status',
  'ft4_unit', 'ft4_value', 'go_class', 'go_clinical_activity_score', 'go_diplopia',
  'go_proptosis_mm_left', 'go_proptosis_mm_right', 'go_treatment', 'go_visual_acuity_affected',
  'goitre_present', 'goitre_pressure_status', 'goitre_pressure_types', 'goitre_since_date',
  'goitre_since_months', 'goitre_size_label', 'goitre_type', 'graves_confirmed',
  'graves_dermopathy', 'graves_dermopathy_details', 'graves_ophthalmopathy', 'htn_days',
  'htn_med_dose', 'htn_med_freq', 'htn_med_name', 'htn_med_since_date', 'htn_med_since_months',
  'htn_med_since_years', 'htn_months', 'htn_on_med', 'htn_since_date', 'htn_status', 'htn_years',
  'hyper_cause_known', 'hyper_cause_since_date', 'hyper_cause_since_months', 'hyper_cause_type',
  'hysterectomy_date', 'hysterectomy_date_precision', 'hysterectomy_month',
  'hysterectomy_reason', 'hysterectomy_reason_other', 'hysterectomy_status', 'hysterectomy_year',
  'imaging_date', 'imaging_finding', 'imaging_status', 'imaging_types', 'infertility_status',
  'is_subclinical', 'lmp_date', 'marital_status', 'med_brand_name', 'med_compliance',
  'med_dose_mg', 'med_drug_name', 'med_since_date', 'med_since_months', 'med_status',
  'med_tablets_at_a_time', 'med_times_per_day', 'med_timing', 'menopause_status',
  'menopause_years_ago', 'menstrual_change_status', 'menstrual_flow', 'menstrual_months',
  'menstrual_pattern', 'menstrual_since_date', 'menstrual_years', 'monitoring_status',
  'next_review_date', 'next_review_date_val', 'occupation', 'occupation_other',
  'on_beta_blocker', 'on_treatment', 'ophthal_assessed', 'ophthal_findings',
  'ophthal_since_date', 'ophthal_since_months', 'ophthal_status', 'osteoporosis_days',
  'osteoporosis_dexa', 'osteoporosis_med_dose', 'osteoporosis_med_freq', 'osteoporosis_med_name',
  'osteoporosis_med_since_date', 'osteoporosis_med_since_months', 'osteoporosis_med_since_years',
  'osteoporosis_months', 'osteoporosis_on_med', 'osteoporosis_since_date', 'osteoporosis_status',
  'osteoporosis_years', 'pcos_days', 'pcos_label', 'pcos_med_dose', 'pcos_med_freq',
  'pcos_med_name', 'pcos_med_since_date', 'pcos_med_since_months', 'pcos_med_since_years',
  'pcos_months', 'pcos_on_med', 'pcos_since_date', 'pcos_since_months', 'pcos_status',
  'pcos_years', 'planned_treatment_duration', 'pregnancy_status', 'rai_administrations',
  'rai_count', 'rai_courses', 'rai_date', 'rai_developed_hypothyroidism', 'rai_dose_mci',
  'rai_outcome', 'rai_post_hypothyroid', 'rai_received', 'rai_uptake_date', 'rai_uptake_done',
  'rai_uptake_percent_24h', 'rai_uptake_percent_2h', 'review_frequency', 'review_frequency_val',
  'sr_ferritin_date', 'sr_ferritin_ref_high', 'sr_ferritin_ref_low', 'sr_ferritin_status',
  'sr_ferritin_unit', 'sr_ferritin_value', 'sr_iron_date', 'sr_iron_ref_high', 'sr_iron_ref_low',
  'sr_iron_status', 'sr_iron_unit', 'sr_iron_value', 'sym_af_confirmed', 'sym_af_med_data',
  'sym_af_months', 'sym_af_on_med', 'sym_af_since_date', 'sym_af_status', 'sym_anxiety',
  'sym_anxiety_diagnosed', 'sym_anxiety_months', 'sym_anxiety_seen_doctor',
  'sym_anxiety_since_date', 'sym_anxiety_status', 'sym_appetite_status',
  'sym_atrial_fibrillation', 'sym_blackout_assessed', 'sym_blackout_count', 'sym_blackout_dx',
  'sym_blackout_last_date', 'sym_blackout_status', 'sym_bowel_months', 'sym_bowel_since_date',
  'sym_bowel_status', 'sym_bowel_type', 'sym_concentration_impact', 'sym_concentration_months',
  'sym_concentration_since_date', 'sym_concentration_status', 'sym_cramp_months',
  'sym_cramp_since_date', 'sym_cramp_status', 'sym_dyspnoea_months', 'sym_dyspnoea_onset',
  'sym_dyspnoea_since_date', 'sym_dyspnoea_status', 'sym_excessive_sweating',
  'sym_facial_months', 'sym_facial_since_date', 'sym_facial_status', 'sym_fatigue_months',
  'sym_fatigue_severity', 'sym_fatigue_since_date', 'sym_fatigue_status',
  'sym_frequent_bowel_movements', 'sym_giddiness_freq', 'sym_giddiness_months',
  'sym_giddiness_since_date', 'sym_giddiness_status', 'sym_gynaecomastia', 'sym_hair_data',
  'sym_hair_status', 'sym_heat_impact', 'sym_heat_intolerance_severity', 'sym_heat_months',
  'sym_heat_since_date', 'sym_heat_status', 'sym_hoarseness_months', 'sym_hoarseness_pattern',
  'sym_hoarseness_since_date', 'sym_hoarseness_status', 'sym_increased_appetite', 'sym_insomnia',
  'sym_insomnia_months', 'sym_insomnia_since_date', 'sym_insomnia_status', 'sym_insomnia_types',
  'sym_irritability', 'sym_irritability_months', 'sym_irritability_since_date',
  'sym_irritability_status', 'sym_memory_impact', 'sym_memory_months', 'sym_memory_since_date',
  'sym_memory_status', 'sym_muscle_wasting', 'sym_myopathy_location', 'sym_myopathy_months',
  'sym_myopathy_since_date', 'sym_myopathy_status', 'sym_nail_data', 'sym_nail_status',
  'sym_osteoporosis_risk', 'sym_palp_assoc', 'sym_palp_months', 'sym_palp_pattern',
  'sym_palp_rate_bpm', 'sym_palp_since_date', 'sym_palp_status', 'sym_pedal_months',
  'sym_pedal_since_date', 'sym_pedal_status', 'sym_pedal_type', 'sym_periodic_paralysis',
  'sym_periorbital_features', 'sym_periorbital_months', 'sym_periorbital_since_date',
  'sym_periorbital_status', 'sym_proximal_myopathy', 'sym_skin_months', 'sym_skin_since_date',
  'sym_skin_status', 'sym_skin_types', 'sym_sweating_months', 'sym_sweating_pattern',
  'sym_sweating_since_date', 'sym_sweating_status', 'sym_tremor', 'sym_tremor_months',
  'sym_tremor_severity', 'sym_tremor_since_date', 'sym_tremor_triggers', 'sym_tremor_type_val',
  'sym_weight_direction', 'sym_weight_kg', 'sym_weight_months', 'sym_weight_since_date',
  'sym_weight_status', 't3_date', 't3_ref_high', 't3_ref_low', 't3_status', 't3_unit',
  't3_value', 't4_date', 't4_ref_high', 't4_ref_low', 't4_status', 't4_unit', 't4_value',
  'tg_date', 'tg_ref_high', 'tg_ref_low', 'tg_status', 'tg_unit', 'tg_value', 'tgab_date',
  'tgab_ref_high', 'tgab_ref_low', 'tgab_status', 'tgab_unit', 'tgab_value', 'thyroid_dx_status',
  'thyroid_dx_type', 'thyroid_dx_year', 'thyroid_med_brand', 'thyroid_med_compliance',
  'thyroid_med_dose', 'thyroid_med_name', 'thyroid_med_since_months', 'thyroid_med_since_years',
  'thyroid_med_status', 'thyroid_med_timing', 'thyroid_scan_date', 'thyroid_scan_done',
  'thyroid_scan_findings', 'thyroid_surgery_date', 'thyroid_surgery_side',
  'thyroid_surgery_status', 'thyroid_surgery_type', 'tibc_date', 'tibc_ref_high', 'tibc_ref_low',
  'tibc_status', 'tibc_unit', 'tibc_value', 'toxic_nodule_type', 'trab_date', 'trab_date_d4',
  'trab_date_new', 'trab_positive', 'trab_ref_high', 'trab_ref_low', 'trab_status',
  'trab_status_d8', 'trab_unit', 'trab_value', 'trab_value_d4', 'trab_value_new',
  'transferrin_sat_date', 'transferrin_sat_ref_high', 'transferrin_sat_ref_low',
  'transferrin_sat_status', 'transferrin_sat_unit', 'transferrin_sat_value', 'tsh_date',
  'tsh_ref_high', 'tsh_ref_low', 'tsh_status', 'tsh_target', 'tsh_unit', 'tsh_value', 'tsi_date',
  'tsi_ref_high', 'tsi_ref_low', 'tsi_status', 'tsi_unit', 'tsi_value', 'vit_b12_date',
  'vit_b12_ref_high', 'vit_b12_ref_low', 'vit_b12_status', 'vit_b12_unit', 'vit_b12_value',
  'vit_d3_date', 'vit_d3_ref_high', 'vit_d3_ref_low', 'vit_d3_status', 'vit_d3_unit',
  'vit_d3_value'
];
const HYPER_Q_JSONB_COLUMNS = new Set(['autoimmune_data', 'family_thyroid_data', 'rai_administrations', 'sym_af_med_data', 'sym_hair_data', 'sym_nail_data', 'anaemia_meds', 'diabetes_meds', 'dyslipidaemia_meds', 'htn_meds', 'pcos_meds']);

const saveHyperQuestionnaire = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const { _draft, _currentPage, ...body } = req.body;

  try {
    const ep = await query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND patient_id = $2 AND condition = 'hyperthyroidism'`,
      [episodeId, patientId]
    );
    if (!ep.rows.length) return res.status(404).json({ error: 'Hyperthyroidism episode not found' });

    const defined = {};
    for (const col of HYPER_Q_COLUMNS) {
      if (body[col] === undefined) continue;
      defined[col] = HYPER_Q_JSONB_COLUMNS.has(col) ? JSON.stringify(body[col]) : body[col];
    }
    defined.is_draft = !!_draft;
    if (_currentPage !== undefined) defined.current_page = _currentPage;

    const existing = await query(
      'SELECT id FROM hyper_questionnaire WHERE episode_id = $1', [episodeId]
    );

    const cols = Object.keys(defined);
    const vals = Object.values(defined);

    if (existing.rows.length) {
      const sets = cols.map((c, i) => `${c} = $${i + 1}`);
      await query(
        `UPDATE hyper_questionnaire SET ${sets.join(', ')}, updated_at = NOW() WHERE episode_id = $${cols.length + 1}`,
        [...vals, episodeId]
      );
    } else {
      const insertCols = ['episode_id', 'patient_id', ...cols];
      const placeholders = insertCols.map((_, i) => `$${i + 1}`);
      await query(
        `INSERT INTO hyper_questionnaire(${insertCols.join(', ')}) VALUES(${placeholders.join(', ')})`,
        [episodeId, patientId, ...vals]
      );
    }

    if (!_draft) await markQuestionnaireComplete(episodeId);

    logger.audit('HYPER_QUESTIONNAIRE_SAVED', {
      userId: req.user.id, userRole: req.user.role, patientId, ip: req.ip,
    });

    res.json({ message: 'Hyperthyroidism questionnaire saved' });

    translateFreeTextFields('hyper_questionnaire', episodeId, patientId, defined)
      .catch((e) => logger.error('translateFreeTextFields (hyper) error', { error: e.message }));
  } catch (err) {
    logger.error('saveHyperQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to save hyper questionnaire' });
  }
};
const getHyperQuestionnaire = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM hyper_questionnaire WHERE episode_id = $1 AND patient_id = $2',
      [req.params.episodeId, req.user.patientId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    logger.error('getHyperQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch hyperthyroidism questionnaire' });
  }
};

// ─────────────────────────────────────────────────────────
// THYROID CANCER QUESTIONNAIRE
// ─────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────
// TC_QUESTIONNAIRE — whitelist matches live schema after migrations
// 025 (lab panel / comorbidity / CBC / new-symptom standardization) and
// 026 (RAI extended to all 4 modules). Regenerate this list from
// information_schema.columns if the schema changes again — do not
// hand-edit column names here.
// ─────────────────────────────────────────────────────────
const TC_Q_COLUMNS = [
  'anaemia_meds', 'diabetes_meds', 'dyslipidaemia_meds', 'htn_meds', 'pcos_meds',
  'abdominal_months', 'abdominal_since_date', 'abdominal_status', 'abdominal_types',
  'abdominal_years', 'acidity_days', 'acidity_med_dose', 'acidity_med_freq', 'acidity_med_name',
  'acidity_med_since_date', 'acidity_med_since_months', 'acidity_med_since_years',
  'acidity_months', 'acidity_on_med', 'acidity_since_date', 'acidity_status', 'acidity_years',
  'additional_notes', 'anaemia_days', 'anaemia_med_dose', 'anaemia_med_freq', 'anaemia_med_name',
  'anaemia_med_since_date', 'anaemia_med_since_months', 'anaemia_med_since_years',
  'anaemia_months', 'anaemia_on_med', 'anaemia_since_date', 'anaemia_status', 'anaemia_type',
  'anaemia_years', 'anti_tg_at_diagnosis', 'antitg_date', 'antitg_ref_high', 'antitg_ref_low',
  'antitg_status', 'antitg_unit', 'antitg_value', 'antitpo_date', 'antitpo_ref_high',
  'antitpo_ref_low', 'antitpo_status', 'antitpo_unit', 'antitpo_value', 'appetite_status',
  'autoimmune_conditions', 'autoimmune_other', 'autoimmune_status', 'blackout_assessed',
  'blackout_count', 'blackout_dx', 'blackout_last_date', 'blackout_status',
  'bowel_change_status', 'bowel_months', 'bowel_since_date', 'bowel_type', 'bowel_years',
  'bradycardia_months', 'bradycardia_since_date', 'bradycardia_status', 'bradycardia_years',
  'ca_dx_year', 'ca_grade', 'ca_stage', 'ca_staged', 'ca_surgery_date', 'ca_surgery_side',
  'ca_surgery_type', 'ca_surgery_type_other', 'ca_thyroid_type', 'ca_thyroid_type_other',
  'calcitonin_at_diagnosis', 'cancer_type', 'carpal_tunnel_months', 'carpal_tunnel_side',
  'carpal_tunnel_since_date', 'carpal_tunnel_status', 'carpal_tunnel_symptoms',
  'carpal_tunnel_years', 'cbc_date', 'cbc_diff_basophils_count_ref_high',
  'cbc_diff_basophils_count_ref_low', 'cbc_diff_basophils_count_unit',
  'cbc_diff_basophils_count_value', 'cbc_diff_basophils_pct_ref_high',
  'cbc_diff_basophils_pct_ref_low', 'cbc_diff_basophils_pct_value',
  'cbc_diff_eosinophils_count_ref_high', 'cbc_diff_eosinophils_count_ref_low',
  'cbc_diff_eosinophils_count_unit', 'cbc_diff_eosinophils_count_value',
  'cbc_diff_eosinophils_pct_ref_high', 'cbc_diff_eosinophils_pct_ref_low',
  'cbc_diff_eosinophils_pct_value', 'cbc_diff_lymphocytes_count_ref_high',
  'cbc_diff_lymphocytes_count_ref_low', 'cbc_diff_lymphocytes_count_unit',
  'cbc_diff_lymphocytes_count_value', 'cbc_diff_lymphocytes_pct_ref_high',
  'cbc_diff_lymphocytes_pct_ref_low', 'cbc_diff_lymphocytes_pct_value',
  'cbc_diff_monocytes_count_ref_high', 'cbc_diff_monocytes_count_ref_low',
  'cbc_diff_monocytes_count_unit', 'cbc_diff_monocytes_count_value',
  'cbc_diff_monocytes_pct_ref_high', 'cbc_diff_monocytes_pct_ref_low',
  'cbc_diff_monocytes_pct_value', 'cbc_diff_neutrophils_count_ref_high',
  'cbc_diff_neutrophils_count_ref_low', 'cbc_diff_neutrophils_count_unit',
  'cbc_diff_neutrophils_count_value', 'cbc_diff_neutrophils_pct_ref_high',
  'cbc_diff_neutrophils_pct_ref_low', 'cbc_diff_neutrophils_pct_value',
  'cbc_haematocrit_ref_high', 'cbc_haematocrit_ref_low', 'cbc_haematocrit_unit',
  'cbc_haematocrit_value', 'cbc_haemoglobin_ref_high', 'cbc_haemoglobin_ref_low',
  'cbc_haemoglobin_unit', 'cbc_haemoglobin_value', 'cbc_mch_ref_high', 'cbc_mch_ref_low',
  'cbc_mch_unit', 'cbc_mch_value', 'cbc_mchc_ref_high', 'cbc_mchc_ref_low', 'cbc_mchc_unit',
  'cbc_mchc_value', 'cbc_mcv_ref_high', 'cbc_mcv_ref_low', 'cbc_mcv_unit', 'cbc_mcv_value',
  'cbc_platelet_count_ref_high', 'cbc_platelet_count_ref_low', 'cbc_platelet_count_unit',
  'cbc_platelet_count_value', 'cbc_rbc_count_ref_high', 'cbc_rbc_count_ref_low',
  'cbc_rbc_count_unit', 'cbc_rbc_count_value', 'cbc_rdw_ref_high', 'cbc_rdw_ref_low',
  'cbc_rdw_unit', 'cbc_rdw_value', 'cbc_status', 'cbc_wbc_total_ref_high',
  'cbc_wbc_total_ref_low', 'cbc_wbc_total_unit', 'cbc_wbc_total_value', 'cea_at_diagnosis',
  'cognition_months', 'cognition_since_date', 'cognition_status', 'cognition_years',
  'cold_intol_months', 'cold_intol_since_date', 'cold_intol_status', 'cold_intol_years',
  'core_biopsy_date', 'core_biopsy_done', 'core_biopsy_result', 'cytology_date',
  'cytology_result', 'cytology_status', 'cytology_types', 'delayed_reflexes_status',
  'depression_days', 'depression_diagnosed', 'depression_dx_status', 'depression_med_dose',
  'depression_med_freq', 'depression_med_name', 'depression_med_since_date',
  'depression_med_since_months', 'depression_med_since_years', 'depression_months',
  'depression_on_med', 'depression_since_date', 'depression_status', 'depression_treated',
  'depression_years', 'diabetes_days', 'diabetes_med_dose', 'diabetes_med_freq',
  'diabetes_med_name', 'diabetes_med_since_date', 'diabetes_med_since_months',
  'diabetes_med_since_years', 'diabetes_months', 'diabetes_on_med', 'diabetes_since_date',
  'diabetes_status', 'diabetes_years', 'dose_change_reason', 'dose_changed_status',
  'dose_last_changed_date', 'dyslipidaemia_days', 'dyslipidaemia_med_dose',
  'dyslipidaemia_med_freq', 'dyslipidaemia_med_name', 'dyslipidaemia_med_since_date',
  'dyslipidaemia_med_since_months', 'dyslipidaemia_med_since_years', 'dyslipidaemia_months',
  'dyslipidaemia_on_med', 'dyslipidaemia_since_date', 'dyslipidaemia_status',
  'dyslipidaemia_years', 'ebrt_date', 'ebrt_other', 'ebrt_regions', 'ebrt_status', 'edd_date',
  'extrathyroidal_extension', 'extrathyroidal_extent', 'facial_oedema_months',
  'facial_oedema_since_date', 'facial_oedema_status', 'facial_oedema_years',
  'family_cancer_relative', 'family_cancer_status', 'family_cancer_types', 'family_men_relative',
  'family_men_status', 'family_men_types', 'family_thyroid_condition',
  'family_thyroid_relations', 'family_thyroid_status', 'fatigue_months', 'fatigue_severity',
  'fatigue_since_date', 'fatigue_status', 'fatigue_years', 'fnac_date', 'fnac_details',
  'fnac_done', 'fnac_result', 'ft3_date', 'ft3_ref_high', 'ft3_ref_low', 'ft3_status',
  'ft3_unit', 'ft3_value', 'ft4_date', 'ft4_ref_high', 'ft4_ref_low', 'ft4_status', 'ft4_unit',
  'ft4_value', 'g1_on_treatment', 'hair_months', 'hair_since_date', 'hair_status', 'hair_types',
  'hair_years', 'hearing_months', 'hearing_since_date', 'hearing_status', 'hearing_type',
  'hearing_years', 'histopathology_date', 'histopathology_report', 'hoarseness_months',
  'hoarseness_pattern', 'hoarseness_since_date', 'hoarseness_status', 'hoarseness_years',
  'htn_days', 'htn_med_dose', 'htn_med_freq', 'htn_med_name', 'htn_med_since_date',
  'htn_med_since_months', 'htn_med_since_years', 'htn_months', 'htn_on_med', 'htn_since_date',
  'htn_status', 'htn_years', 'hypersomnia_months', 'hypersomnia_since_date',
  'hypersomnia_status', 'hypersomnia_years', 'hysterectomy_date', 'hysterectomy_date_precision',
  'hysterectomy_month', 'hysterectomy_reason', 'hysterectomy_reason_other',
  'hysterectomy_status', 'hysterectomy_year', 'imaging_date', 'imaging_finding',
  'imaging_status', 'imaging_types', 'infertility_status', 'laterality', 'leg_oedema_months',
  'leg_oedema_since_date', 'leg_oedema_status', 'leg_oedema_type', 'leg_oedema_years',
  'levo_brand', 'levo_compliance', 'levo_dose_mcg', 'levo_drug_name', 'levo_since_months',
  'levo_since_years', 'levo_timing', 'levothyroxine_brand', 'levothyroxine_compliance',
  'levothyroxine_dose_mcg', 'liothyronine_brand', 'liothyronine_name', 'liothyronine_dose',
  'liothyronine_timing', 'liothyronine_compliance', 'liothyronine_since_years',
  'liothyronine_since_months', 'liothyronine_dose_changed_status', 'liothyronine_dose_changed_date',
  'liothyronine_dose_change_reason', 'lmp_date', 'm_stage', 'macroglossia_status', 'marital_status',
  'memory_months', 'memory_since_date', 'memory_status', 'memory_years', 'menopause_status',
  'menopause_years_ago', 'menstrual_change_status', 'menstrual_flow', 'menstrual_months',
  'menstrual_pattern', 'menstrual_since_date', 'menstrual_years', 'metastasis_date',
  'metastasis_other', 'metastasis_sites', 'metastasis_status', 'mtc_calcitonin_elevated',
  'mtc_cea_elevated', 'mtc_family_screening_advised', 'mtc_men2_associated', 'mtc_men2_type',
  'mtc_ret_mutation', 'mtc_ret_mutation_details', 'multifocal', 'multifocal_count',
  'muscle_cramp_months', 'muscle_cramp_since_date', 'muscle_cramp_status', 'muscle_cramp_years',
  'muscle_weakness_location', 'muscle_weakness_months', 'muscle_weakness_since_date',
  'muscle_weakness_status', 'muscle_weakness_years', 'n_stage', 'nail_months', 'nail_since_date',
  'nail_status', 'nail_types', 'nail_years', 'neck_dissection_side', 'neck_dissection_status',
  'neck_dissection_type', 'next_rai_scan_date', 'next_review_date', 'next_tg_date',
  'next_usg_date', 'occupation', 'occupation_other', 'on_active_surveillance', 'on_chemotherapy',
  'on_external_beam_rt', 'on_targeted_therapy', 'on_tsh_suppression', 'osteoporosis_days',
  'osteoporosis_dexa', 'osteoporosis_med_dose', 'osteoporosis_med_freq', 'osteoporosis_med_name',
  'osteoporosis_med_since_date', 'osteoporosis_med_since_months', 'osteoporosis_med_since_years',
  'osteoporosis_months', 'osteoporosis_on_med', 'osteoporosis_since_date', 'osteoporosis_status',
  'osteoporosis_years', 'overall_stage', 'pcos_days', 'pcos_label', 'pcos_med_dose',
  'pcos_med_freq', 'pcos_med_name', 'pcos_med_since_date', 'pcos_med_since_months',
  'pcos_med_since_years', 'pcos_months', 'pcos_on_med', 'pcos_since_date', 'pcos_status',
  'pcos_years', 'periorbital_months', 'periorbital_since_date', 'periorbital_status',
  'periorbital_years', 'postural_giddiness_freq', 'postural_giddiness_months',
  'postural_giddiness_since_date', 'postural_giddiness_status', 'postural_giddiness_years',
  'pregnancy_status', 'pth_at_diagnosis', 'pulse_rate_bpm', 'rai_administrations', 'rai_cycles',
  'rai_last_date', 'rai_post_surgery_status', 'rai_purpose', 'rai_therapy_done',
  'rai_total_dose_mci', 'recurrence_date', 'recurrence_sites', 'recurrence_status',
  'risk_category', 'skin_months', 'skin_since_date', 'skin_status', 'skin_types', 'skin_years',
  'sr_calcium_at_diagnosis', 'sr_ferritin_date', 'sr_ferritin_ref_high', 'sr_ferritin_ref_low',
  'sr_ferritin_status', 'sr_ferritin_unit', 'sr_ferritin_value', 'sr_iron_date',
  'sr_iron_ref_high', 'sr_iron_ref_low', 'sr_iron_status', 'sr_iron_unit', 'sr_iron_value',
  'surgery_done', 'surveillance_date', 'surveillance_findings', 'surveillance_interval',
  'surveillance_notes', 'surveillance_status', 'surveillance_types', 'sym_bone_pain',
  'sym_cervical_lymphadenopathy', 'sym_dysphagia', 'sym_haemoptysis', 'sym_hard_fixed_nodule',
  'sym_hoarseness', 'sym_rapidly_growing_nodule', 'sym_stridor', 't3_date', 't3_ref_high',
  't3_ref_low', 't3_status', 't3_unit', 't3_value', 't4_date', 't4_ref_high', 't4_ref_low',
  't4_status', 't4_unit', 't4_value', 't_stage', 'targeted_tx_dose', 'targeted_tx_freq',
  'targeted_tx_name', 'targeted_tx_ongoing', 'targeted_tx_status', 'targeted_tx_stop_reason',
  'targeted_tx_unit', 'tg_at_diagnosis', 'tg_date', 'tg_ref_high', 'tg_ref_low', 'tg_status',
  'tg_stimulated', 'tg_unit', 'tg_value', 'tgab_date', 'tgab_ref_high', 'tgab_ref_low',
  'tgab_status', 'tgab_unit', 'tgab_value', 'thyroid_dx_status', 'thyroid_dx_type',
  'thyroid_dx_year', 'thyroid_med_brand', 'thyroid_med_compliance', 'thyroid_med_dose',
  'thyroid_med_name', 'thyroid_med_since_months', 'thyroid_med_since_years',
  'thyroid_med_status', 'thyroid_med_timing', 'thyroid_tx_status', 'thyroid_tx_type',
  'thyroid_tx_year', 'tibc_date', 'tibc_ref_high', 'tibc_ref_low', 'tibc_status', 'tibc_unit',
  'tibc_value', 'trab_date', 'trab_ref_high', 'trab_ref_low', 'trab_status', 'trab_unit',
  'trab_value', 'transferrin_sat_date', 'transferrin_sat_ref_high', 'transferrin_sat_ref_low',
  'transferrin_sat_status', 'transferrin_sat_unit', 'transferrin_sat_value', 'tsh_at_diagnosis',
  'tsh_date', 'tsh_ref_high', 'tsh_ref_low', 'tsh_status', 'tsh_suppression_indication',
  'tsh_suppression_target', 'tsh_unit', 'tsh_value', 'tsi_date', 'tsi_ref_high', 'tsi_ref_low',
  'tsi_status', 'tsi_unit', 'tsi_value', 'tumour_size_mm', 'vit_b12_date', 'vit_b12_ref_high',
  'vit_b12_ref_low', 'vit_b12_status', 'vit_b12_unit', 'vit_b12_value', 'vit_d3_at_diagnosis',
  'vit_d3_date', 'vit_d3_ref_high', 'vit_d3_ref_low', 'vit_d3_status', 'vit_d3_unit',
  'vit_d3_value', 'weight_change_status', 'weight_direction', 'weight_kg', 'weight_months',
  'weight_since_date', 'weight_years'
];
const TC_Q_JSONB_COLUMNS = new Set(['rai_administrations', 'anaemia_meds', 'diabetes_meds', 'dyslipidaemia_meds', 'htn_meds', 'pcos_meds']);

const saveTcQuestionnaire = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const { _draft, _currentPage, ...body } = req.body;

  try {
    const ep = await query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND patient_id = $2 AND condition = 'thyroid_cancer'`,
      [episodeId, patientId]
    );
    if (!ep.rows.length) return res.status(404).json({ error: 'Thyroid cancer episode not found' });

    const defined = {};
    for (const col of TC_Q_COLUMNS) {
      if (body[col] === undefined) continue;
      defined[col] = TC_Q_JSONB_COLUMNS.has(col) ? JSON.stringify(body[col]) : body[col];
    }
    defined.is_draft = !!_draft;
    if (_currentPage !== undefined) defined.current_page = _currentPage;

    const existing = await query(
      'SELECT id FROM tc_questionnaire WHERE episode_id = $1', [episodeId]
    );

    const cols = Object.keys(defined);
    const vals = Object.values(defined);

    if (existing.rows.length) {
      const sets = cols.map((c, i) => `${c} = $${i + 1}`);
      await query(
        `UPDATE tc_questionnaire SET ${sets.join(', ')}, updated_at = NOW() WHERE episode_id = $${cols.length + 1}`,
        [...vals, episodeId]
      );
    } else {
      const insertCols = ['episode_id', 'patient_id', ...cols];
      const placeholders = insertCols.map((_, i) => `$${i + 1}`);
      await query(
        `INSERT INTO tc_questionnaire(${insertCols.join(', ')}) VALUES(${placeholders.join(', ')})`,
        [episodeId, patientId, ...vals]
      );
    }

    if (!_draft) await markQuestionnaireComplete(episodeId);

    logger.audit('TC_QUESTIONNAIRE_SAVED', {
      userId: req.user.id, userRole: req.user.role, patientId, ip: req.ip,
    });

    res.json({ message: 'Thyroid cancer questionnaire saved' });

    translateFreeTextFields('tc_questionnaire', episodeId, patientId, defined)
      .catch((e) => logger.error('translateFreeTextFields (tc) error', { error: e.message }));
  } catch (err) {
    logger.error('saveTcQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to save tc questionnaire' });
  }
};
const getTcQuestionnaire = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM tc_questionnaire WHERE episode_id = $1 AND patient_id = $2',
      [req.params.episodeId, req.user.patientId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    logger.error('getTcQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch thyroid cancer questionnaire' });
  }
};

// ─────────────────────────────────────────────────────────
// THYROID NODULE QUESTIONNAIRE
// ─────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────
// NODULE_QUESTIONNAIRE — whitelist matches live schema after migrations
// 025 (lab panel / comorbidity / CBC / new-symptom standardization) and
// 026 (RAI extended to all 4 modules). Regenerate this list from
// information_schema.columns if the schema changes again — do not
// hand-edit column names here.
// ─────────────────────────────────────────────────────────
const NODULE_Q_COLUMNS = [
  'anaemia_meds', 'diabetes_meds', 'dyslipidaemia_meds', 'htn_meds', 'pcos_meds',
  'acidity_days', 'acidity_med_dose', 'acidity_med_freq', 'acidity_med_name',
  'acidity_med_since_date', 'acidity_med_since_months', 'acidity_med_since_years',
  'acidity_months', 'acidity_on_med', 'acidity_since_date', 'acidity_status', 'acidity_years',
  'additional_notes', 'anaemia_days', 'anaemia_med_dose', 'anaemia_med_freq', 'anaemia_med_name',
  'anaemia_med_since_date', 'anaemia_med_since_months', 'anaemia_med_since_years',
  'anaemia_months', 'anaemia_on_med', 'anaemia_since_date', 'anaemia_status', 'anaemia_type',
  'anaemia_years', 'antibody_status', 'antitg_date', 'antitg_ref_high', 'antitg_ref_low',
  'antitg_status', 'antitg_unit', 'antitg_value', 'antitpo_date', 'antitpo_ref_high',
  'antitpo_ref_low', 'antitpo_status', 'antitpo_unit', 'antitpo_value', 'anxiety_months',
  'anxiety_severity', 'anxiety_since_date', 'anxiety_status', 'anxiety_years',
  'appetite_change_status', 'appetite_direction', 'appetite_months', 'appetite_since_date',
  'appetite_years', 'autoimmune_conditions', 'autoimmune_other', 'autoimmune_status',
  'bethesda_category', 'bowel_change_status', 'bowel_months', 'bowel_since_date', 'bowel_type',
  'bowel_years', 'cbc_date', 'cbc_diff_basophils_count_ref_high',
  'cbc_diff_basophils_count_ref_low', 'cbc_diff_basophils_count_unit',
  'cbc_diff_basophils_count_value', 'cbc_diff_basophils_pct_ref_high',
  'cbc_diff_basophils_pct_ref_low', 'cbc_diff_basophils_pct_value',
  'cbc_diff_eosinophils_count_ref_high', 'cbc_diff_eosinophils_count_ref_low',
  'cbc_diff_eosinophils_count_unit', 'cbc_diff_eosinophils_count_value',
  'cbc_diff_eosinophils_pct_ref_high', 'cbc_diff_eosinophils_pct_ref_low',
  'cbc_diff_eosinophils_pct_value', 'cbc_diff_lymphocytes_count_ref_high',
  'cbc_diff_lymphocytes_count_ref_low', 'cbc_diff_lymphocytes_count_unit',
  'cbc_diff_lymphocytes_count_value', 'cbc_diff_lymphocytes_pct_ref_high',
  'cbc_diff_lymphocytes_pct_ref_low', 'cbc_diff_lymphocytes_pct_value',
  'cbc_diff_monocytes_count_ref_high', 'cbc_diff_monocytes_count_ref_low',
  'cbc_diff_monocytes_count_unit', 'cbc_diff_monocytes_count_value',
  'cbc_diff_monocytes_pct_ref_high', 'cbc_diff_monocytes_pct_ref_low',
  'cbc_diff_monocytes_pct_value', 'cbc_diff_neutrophils_count_ref_high',
  'cbc_diff_neutrophils_count_ref_low', 'cbc_diff_neutrophils_count_unit',
  'cbc_diff_neutrophils_count_value', 'cbc_diff_neutrophils_pct_ref_high',
  'cbc_diff_neutrophils_pct_ref_low', 'cbc_diff_neutrophils_pct_value',
  'cbc_haematocrit_ref_high', 'cbc_haematocrit_ref_low', 'cbc_haematocrit_unit',
  'cbc_haematocrit_value', 'cbc_haemoglobin_ref_high', 'cbc_haemoglobin_ref_low',
  'cbc_haemoglobin_unit', 'cbc_haemoglobin_value', 'cbc_mch_ref_high', 'cbc_mch_ref_low',
  'cbc_mch_unit', 'cbc_mch_value', 'cbc_mchc_ref_high', 'cbc_mchc_ref_low', 'cbc_mchc_unit',
  'cbc_mchc_value', 'cbc_mcv_ref_high', 'cbc_mcv_ref_low', 'cbc_mcv_unit', 'cbc_mcv_value',
  'cbc_platelet_count_ref_high', 'cbc_platelet_count_ref_low', 'cbc_platelet_count_unit',
  'cbc_platelet_count_value', 'cbc_rbc_count_ref_high', 'cbc_rbc_count_ref_low',
  'cbc_rbc_count_unit', 'cbc_rbc_count_value', 'cbc_rdw_ref_high', 'cbc_rdw_ref_low',
  'cbc_rdw_unit', 'cbc_rdw_value', 'cbc_status', 'cbc_wbc_total_ref_high',
  'cbc_wbc_total_ref_low', 'cbc_wbc_total_unit', 'cbc_wbc_total_value', 'cold_intol_months',
  'cold_intol_severity', 'cold_intol_since_date', 'cold_intol_status', 'cold_intol_years',
  'current_med_brand', 'current_med_compliance', 'current_med_dose', 'current_med_name',
  'current_med_since_months', 'current_med_since_years', 'current_med_status',
  'current_med_timing', 'cytology_date', 'cytology_status', 'cytology_types', 'depression_days',
  'depression_diagnosed', 'depression_med_dose', 'depression_med_freq', 'depression_med_name',
  'depression_med_since_date', 'depression_med_since_months', 'depression_med_since_years',
  'depression_months', 'depression_on_med', 'depression_since_date', 'depression_status',
  'depression_treated', 'depression_years', 'diabetes_days', 'diabetes_med_dose',
  'diabetes_med_freq', 'diabetes_med_name', 'diabetes_med_since_date',
  'diabetes_med_since_months', 'diabetes_med_since_years', 'diabetes_months', 'diabetes_on_med',
  'diabetes_since_date', 'diabetes_status', 'diabetes_type', 'diabetes_years',
  'doctor_advised_tests', 'doctor_consulted_date', 'doctor_consulted_status',
  'dyslipidaemia_days', 'dyslipidaemia_med_dose', 'dyslipidaemia_med_freq',
  'dyslipidaemia_med_name', 'dyslipidaemia_med_since_date', 'dyslipidaemia_med_since_months',
  'dyslipidaemia_med_since_years', 'dyslipidaemia_months', 'dyslipidaemia_on_med',
  'dyslipidaemia_since_date', 'dyslipidaemia_status', 'dyslipidaemia_years', 'dysphagia_months',
  'dysphagia_severity', 'dysphagia_since_date', 'dysphagia_status', 'dysphagia_type',
  'dysphagia_years', 'edd_date', 'family_men_relative', 'family_men_status', 'family_men_types',
  'family_thyroid_condition', 'family_thyroid_relations', 'family_thyroid_status',
  'fatigue_months', 'fatigue_severity', 'fatigue_since_date', 'fatigue_status', 'fatigue_years',
  'ft3_date', 'ft3_ref_high', 'ft3_ref_low', 'ft3_status', 'ft3_unit', 'ft3_value', 'ft4_date',
  'ft4_ref_high', 'ft4_ref_low', 'ft4_status', 'ft4_unit', 'ft4_value', 'hair_months',
  'hair_since_date', 'hair_status', 'hair_types', 'hair_years', 'hoarseness_months',
  'hoarseness_pattern', 'hoarseness_since_date', 'hoarseness_status', 'hoarseness_years',
  'htn_days', 'htn_med_dose', 'htn_med_freq', 'htn_med_name', 'htn_med_since_date',
  'htn_med_since_months', 'htn_med_since_years', 'htn_months', 'htn_on_med', 'htn_since_date',
  'htn_status', 'htn_years', 'hysterectomy_date', 'hysterectomy_date_precision',
  'hysterectomy_month', 'hysterectomy_reason', 'hysterectomy_reason_other',
  'hysterectomy_status', 'hysterectomy_year', 'imaging_date', 'imaging_status', 'imaging_types',
  'infertility_status', 'iodine_deficiency_months', 'iodine_deficiency_since_date',
  'iodine_deficiency_status', 'iodine_deficiency_years', 'iodine_med_months', 'iodine_med_name',
  'iodine_med_since_date', 'iodine_med_status', 'iodine_med_years', 'lmp_date', 'marital_status',
  'menopause_status', 'menopause_years_ago', 'menstrual_change_status', 'menstrual_flow',
  'menstrual_months', 'menstrual_pattern', 'menstrual_since_date', 'menstrual_years',
  'mgmt_plan_discussed', 'mgmt_plan_next_date', 'mgmt_plan_types', 'muscle_sx_months',
  'muscle_sx_since_date', 'muscle_sx_status', 'muscle_sx_types', 'muscle_sx_years',
  'muscle_weakness_location', 'neck_pain_months', 'neck_pain_severity', 'neck_pain_since_date',
  'neck_pain_status', 'neck_pain_types', 'neck_pain_years', 'nodule_cough_months',
  'nodule_cough_since_date', 'nodule_cough_status', 'nodule_cough_type', 'nodule_cough_years',
  'nodule_count', 'nodule_discovery_mode', 'nodule_discovery_other', 'nodule_duration_months',
  'nodule_duration_years', 'nodule_growth_direction', 'nodule_growth_months',
  'nodule_growth_rate', 'nodule_growth_years', 'nodule_noticed_date', 'nodule_size_change',
  'nodule_size_mm', 'nodule_treatment_completed', 'nodule_treatment_date',
  'nodule_treatment_status', 'nodule_treatment_types', 'nodule_visible_months',
  'nodule_visible_pattern', 'nodule_visible_since_date', 'nodule_visible_status',
  'nodule_visible_years', 'occupation', 'occupation_other', 'occupation_voice_dependent',
  'opinion_trigger', 'opinion_trigger_other', 'osteoporosis_days', 'osteoporosis_med_dose',
  'osteoporosis_med_freq', 'osteoporosis_med_name', 'osteoporosis_med_since_date',
  'osteoporosis_med_since_months', 'osteoporosis_med_since_years', 'osteoporosis_months',
  'osteoporosis_on_med', 'osteoporosis_since_date', 'osteoporosis_status', 'osteoporosis_years',
  'outcomes_details', 'outcomes_discussed', 'palp_tremor_months', 'palp_tremor_since_date',
  'palp_tremor_status', 'palp_tremor_types', 'palp_tremor_years', 'patient_concern_other',
  'pcos_days', 'pcos_label', 'pcos_med_dose', 'pcos_med_freq', 'pcos_med_name',
  'pcos_med_since_date', 'pcos_med_since_months', 'pcos_med_since_years', 'pcos_months',
  'pcos_on_med', 'pcos_since_date', 'pcos_status', 'pcos_years', 'pregnancy_status',
  'prior_advice_followed', 'prior_advice_not_followed_reason', 'prior_advice_status',
  'prior_advice_types', 'prior_opinion_date', 'prior_opinion_followed',
  'prior_opinion_specialty', 'prior_opinion_status', 'prior_opinion_summary',
  'radiation_exposure_other', 'radiation_exposure_status', 'radiation_exposure_types',
  'radiation_exposure_year', 'rai_administrations', 'repeat_usg_advised', 'repeat_usg_done',
  'repeat_usg_due_date', 'resp_months', 'resp_since_date', 'resp_symptom_status',
  'resp_symptom_trigger', 'resp_symptom_types', 'resp_years', 'skin_months', 'skin_since_date',
  'skin_status', 'skin_types', 'skin_years', 'sr_ferritin_date', 'sr_ferritin_ref_high',
  'sr_ferritin_ref_low', 'sr_ferritin_status', 'sr_ferritin_unit', 'sr_ferritin_value',
  'sr_iron_date', 'sr_iron_ref_high', 'sr_iron_ref_low', 'sr_iron_status', 'sr_iron_unit',
  'sr_iron_value', 't3_date', 't3_ref_high', 't3_ref_low', 't3_status', 't3_unit', 't3_value',
  't4_date', 't4_ref_high', 't4_ref_low', 't4_status', 't4_unit', 't4_value', 'tg_date',
  'tg_ref_high', 'tg_ref_low', 'tg_status', 'tg_unit', 'tg_value', 'tgab_date', 'tgab_ref_high',
  'tgab_ref_low', 'tgab_status', 'tgab_unit', 'tgab_value', 'thyroid_dx_status',
  'thyroid_dx_type', 'thyroid_dx_year', 'thyroid_med_brand', 'thyroid_med_compliance',
  'thyroid_med_dose', 'thyroid_med_name', 'thyroid_med_since_months', 'thyroid_med_since_years',
  'thyroid_med_status', 'thyroid_med_timing', 'thyroid_tx_status', 'thyroid_tx_type',
  'thyroid_tx_year', 'tibc_date', 'tibc_ref_high', 'tibc_ref_low', 'tibc_status', 'tibc_unit',
  'tibc_value', 'tirads_category', 'trab_date', 'trab_ref_high', 'trab_ref_low', 'trab_status',
  'trab_unit', 'trab_value', 'transferrin_sat_date', 'transferrin_sat_ref_high',
  'transferrin_sat_ref_low', 'transferrin_sat_status', 'transferrin_sat_unit',
  'transferrin_sat_value', 'tsh_date', 'tsh_ref_high', 'tsh_ref_low', 'tsh_status', 'tsh_unit',
  'tsh_value', 'tsi_date', 'tsi_ref_high', 'tsi_ref_low', 'tsi_status', 'tsi_unit', 'tsi_value',
  'vit_b12_date', 'vit_b12_ref_high', 'vit_b12_ref_low', 'vit_b12_status', 'vit_b12_unit',
  'vit_b12_value', 'vit_d3_date', 'vit_d3_ref_high', 'vit_d3_ref_low', 'vit_d3_status',
  'vit_d3_unit', 'vit_d3_value', 'voice_fatigue_status', 'weight_change_status',
  'weight_direction', 'weight_kg', 'weight_months', 'weight_since_date', 'weight_years'
];
const NODULE_Q_JSONB_COLUMNS = new Set(['rai_administrations', 'anaemia_meds', 'diabetes_meds', 'dyslipidaemia_meds', 'htn_meds', 'pcos_meds']);

const saveNoduleQuestionnaire = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const { _draft, _currentPage, ...body } = req.body;

  try {
    const ep = await query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND patient_id = $2 AND condition = 'nodule'`,
      [episodeId, patientId]
    );
    if (!ep.rows.length) return res.status(404).json({ error: 'Nodule episode not found' });

    const defined = {};
    for (const col of NODULE_Q_COLUMNS) {
      if (body[col] === undefined) continue;
      defined[col] = NODULE_Q_JSONB_COLUMNS.has(col) ? JSON.stringify(body[col]) : body[col];
    }
    defined.is_draft = !!_draft;
    if (_currentPage !== undefined) defined.current_page = _currentPage;

    const existing = await query(
      'SELECT id FROM nodule_questionnaire WHERE episode_id = $1', [episodeId]
    );

    const cols = Object.keys(defined);
    const vals = Object.values(defined);

    if (existing.rows.length) {
      const sets = cols.map((c, i) => `${c} = $${i + 1}`);
      await query(
        `UPDATE nodule_questionnaire SET ${sets.join(', ')}, updated_at = NOW() WHERE episode_id = $${cols.length + 1}`,
        [...vals, episodeId]
      );
    } else {
      const insertCols = ['episode_id', 'patient_id', ...cols];
      const placeholders = insertCols.map((_, i) => `$${i + 1}`);
      await query(
        `INSERT INTO nodule_questionnaire(${insertCols.join(', ')}) VALUES(${placeholders.join(', ')})`,
        [episodeId, patientId, ...vals]
      );
    }

    if (!_draft) await markQuestionnaireComplete(episodeId);

    logger.audit('NODULE_QUESTIONNAIRE_SAVED', {
      userId: req.user.id, userRole: req.user.role, patientId, ip: req.ip,
    });

    res.json({ message: 'Nodule questionnaire saved' });

    translateFreeTextFields('nodule_questionnaire', episodeId, patientId, defined)
      .catch((e) => logger.error('translateFreeTextFields (nodule) error', { error: e.message }));
  } catch (err) {
    logger.error('saveNoduleQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to save nodule questionnaire' });
  }
};
const getNoduleQuestionnaire = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM nodule_questionnaire WHERE episode_id = $1 AND patient_id = $2',
      [req.params.episodeId, req.user.patientId]
    );
    if (!result.rows.length) return res.json(null);
    const { id, episode_id, patient_id, is_draft, created_at, updated_at, ...answers } = result.rows[0];
    res.json({ ...answers, _draft: is_draft });
  } catch (err) {
    logger.error('getNoduleQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch nodule questionnaire' });
  }
};

// ─────────────────────────────────────────────────────────
// TREATMENT HISTORY
// ─────────────────────────────────────────────────────────

/** POST /api/patients/:id/episodes/:episodeId/hypo-treatment */
const addHypoTreatment = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const b = req.body;
  try {
    const result = await query(
      `INSERT INTO hypo_treatment_history
       (episode_id, patient_id, treatment_type, drug_name, brand_name, dose_mcg,
        frequency, start_date, end_date, reason_for_change, tsh_at_start, tsh_at_end, notes, recorded_by_doctor_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [episodeId, patientId, b.treatmentType, b.drugName, b.brandName, b.doseMcg,
       b.frequency, b.startDate, b.endDate, b.reasonForChange,
       b.tshAtStart, b.tshAtEnd, b.notes, req.user.role === 'doctor' ? req.user.id : null]
    );
    res.status(201).json({ message: 'Treatment record saved', id: result.rows[0].id });
  } catch (err) {
    logger.error('addHypoTreatment error', { error: err.message });
    res.status(500).json({ error: 'Failed to save treatment record' });
  }
};

/** POST /api/patients/:id/episodes/:episodeId/hyper-atd */
const addHyperAtd = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const b = req.body;
  try {
    const result = await query(
      `INSERT INTO hyper_atd_history
       (episode_id, patient_id, drug, dose_mg, frequency, start_date, end_date,
        reason_stopped, side_effects, agranulocytosis, hepatotoxicity,
        tsh_at_start, ft4_at_start, tsh_at_end, ft4_at_end, achieved_remission, notes, recorded_by_doctor_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [episodeId, patientId, b.drug, b.doseMg, b.frequency, b.startDate, b.endDate,
       b.reasonStopped, b.sideEffects, b.agranulocytosis, b.hepatotoxicity,
       b.tshAtStart, b.ft4AtStart, b.tshAtEnd, b.ft4AtEnd, b.achievedRemission, b.notes,
       req.user.role === 'doctor' ? req.user.id : null]
    );
    res.status(201).json({ message: 'ATD record saved', id: result.rows[0].id });
  } catch (err) {
    logger.error('addHyperAtd error', { error: err.message });
    res.status(500).json({ error: 'Failed to save ATD record' });
  }
};

/** POST /api/patients/:id/episodes/:episodeId/hyper-rai */
const addHyperRai = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const b = req.body;
  try {
    const result = await query(
      `INSERT INTO hyper_rai_history
       (episode_id, patient_id, dose_mci, administration_date, indication,
        pre_rai_tsh, pre_rai_ft4, pre_rai_trab, post_rai_tsh_value, post_rai_tsh_date,
        outcome, developed_hypothyroidism, hypothyroid_date, complications, notes, recorded_by_doctor_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [episodeId, patientId, b.doseMci, b.administrationDate, b.indication,
       b.preRaiTsh, b.preRaiFt4, b.preRaiTrab, b.postRaiTshValue, b.postRaiTshDate,
       b.outcome, b.developedHypothyroidism, b.hypothyroidDate,
       b.complications, b.notes, req.user.role === 'doctor' ? req.user.id : null]
    );
    res.status(201).json({ message: 'RAI record saved', id: result.rows[0].id });
  } catch (err) {
    logger.error('addHyperRai error', { error: err.message });
    res.status(500).json({ error: 'Failed to save RAI record' });
  }
};

/** POST /api/patients/:id/episodes/:episodeId/tc-surgery */
const addTcSurgery = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const b = req.body;
  try {
    const result = await query(
      `INSERT INTO tc_surgery_history
       (episode_id, patient_id, surgery_type, surgery_date, surgeon_name, hospital_name,
        tumour_size_mm, margins, lymph_nodes_removed, lymph_nodes_positive,
        capsular_invasion, vascular_invasion, perineural_invasion, extrathyroidal_extension,
        final_t_stage, final_n_stage, final_m_stage, final_overall_stage,
        histopathology_details, complications, post_op_calcium, post_op_pth,
        hypoparathyroidism, rln_injury, notes, recorded_by_doctor_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       RETURNING id`,
      [episodeId, patientId, b.surgeryType, b.surgeryDate,
       b.surgeonName ? encryptPHI(b.surgeonName) : null,
       b.hospitalName ? encryptPHI(b.hospitalName) : null,
       b.tumourSizeMm, b.margins, b.lymphNodesRemoved, b.lymphNodesPositive,
       b.capsularInvasion, b.vascularInvasion, b.perineuralInvasion, b.extrathyroidalExtension,
       b.finalTStage, b.finalNStage, b.finalMStage, b.finalOverallStage,
       b.histopathologyDetails, b.complications, b.postOpCalcium, b.postOpPth,
       b.hypoparathyroidism, b.rlnInjury, b.notes,
       req.user.role === 'doctor' ? req.user.id : null]
    );
    res.status(201).json({ message: 'Surgery record saved', id: result.rows[0].id });
  } catch (err) {
    logger.error('addTcSurgery error', { error: err.message });
    res.status(500).json({ error: 'Failed to save surgery record' });
  }
};

/** POST /api/patients/:id/episodes/:episodeId/tc-rai */
const addTcRai = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const b = req.body;
  try {
    const result = await query(
      `INSERT INTO tc_rai_history
       (episode_id, patient_id, round_number, dose_mci, administration_date, indication,
        pre_rai_tsh, pre_rai_tg, pre_rai_anti_tg, stimulation_method,
        whole_body_scan_done, whole_body_scan_findings, whole_body_scan_date,
        post_rai_tg, post_rai_tg_date, response, complications, notes, recorded_by_doctor_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [episodeId, patientId, b.roundNumber || 1, b.doseMci, b.administrationDate, b.indication,
       b.preRaiTsh, b.preRaiTg, b.preRaiAntiTg, b.stimulationMethod,
       b.wholeScanDone, b.wholeScanFindings, b.wholeScanDate,
       b.postRaiTg, b.postRaiTgDate, b.response, b.complications, b.notes,
       req.user.role === 'doctor' ? req.user.id : null]
    );
    res.status(201).json({ message: 'Cancer RAI record saved', id: result.rows[0].id });
  } catch (err) {
    logger.error('addTcRai error', { error: err.message });
    res.status(500).json({ error: 'Failed to save cancer RAI record' });
  }
};

// ─────────────────────────────────────────────────────────
// SCAN REPORTS
// ─────────────────────────────────────────────────────────

/** POST /api/patients/:id/episodes/:episodeId/scans */
const addScanReport = async (req, res) => {
  const patientId = req.user.patientId;
  const { episodeId } = req.params;
  const b = req.body;
  try {
    const result = await query(
      `INSERT INTO scan_reports
       (episode_id, patient_id, document_id, scan_type, scan_date, reporting_centre,
        radiologist_name, ai_extracted, findings, impression, doctor_notes,
        tirads_score, nodule_size_mm, nodule_count, lymph_node_involvement)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [episodeId, patientId, b.documentId, b.scanType, b.scanDate, b.reportingCentre,
       b.radiologistName ? encryptPHI(b.radiologistName) : null,
       b.aiExtracted || false,
       b.findings ? encryptPHI(b.findings) : null,
       b.impression ? encryptPHI(b.impression) : null,
       b.doctorNotes ? encryptPHI(b.doctorNotes) : null,
       b.tiradsScore, b.noduleSizeMm, b.noduleCount, b.lymphNodeInvolvement]
    );
    res.status(201).json({ message: 'Scan report saved', id: result.rows[0].id });
  } catch (err) {
    logger.error('addScanReport error', { error: err.message });
    res.status(500).json({ error: 'Failed to save scan report' });
  }
};

/** GET /api/patients/:id/episodes/:episodeId/scans */
const getScanReports = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, scan_type, scan_date, reporting_centre, ai_extracted,
              findings, impression, doctor_notes, tirads_score,
              nodule_size_mm, nodule_count, lymph_node_involvement, created_at
       FROM scan_reports
       WHERE episode_id = $1 AND patient_id = $2
       ORDER BY scan_date DESC`,
      [req.params.episodeId, req.user.patientId]
    );
    const scans = result.rows.map(r => ({
      ...r,
      findings: d(r.findings),
      impression: d(r.impression),
      doctorNotes: d(r.doctor_notes),
    }));
    res.json({ scans, total: scans.length });
  } catch (err) {
    logger.error('getScanReports error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch scan reports' });
  }
};

// ─────────────────────────────────────────────────────────
// DOCTOR PORTAL — condition summary view
// ─────────────────────────────────────────────────────────

/**
 * GET /api/doctors/:id/patients/:patientId/conditions
 * Used by the doctor portal to see all conditions and episode summaries.
 */
const getDoctorConditionView = async (req, res) => {
  const { patientId } = req.params;
  try {
    const result = await query(
      `SELECT * FROM v_patient_condition_summary WHERE patient_id = $1`,
      [patientId]
    );
    res.json({ conditions: result.rows });
  } catch (err) {
    logger.error('getDoctorConditionView error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch condition summary' });
  }
};

// ─────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────

async function markQuestionnaireComplete(episodeId) {
  // Check if both core + condition-specific questionnaire are filled
  const core = await query(
    'SELECT id FROM core_questionnaire WHERE episode_id = $1', [episodeId]
  );
  const ep = await query(
    'SELECT condition FROM patient_condition_episodes WHERE id = $1', [episodeId]
  );
  if (!ep.rows.length || !core.rows.length) return;

  const { condition } = ep.rows[0];
  const tableMap = {
    hypothyroidism: 'hypo_questionnaire',
    hyperthyroidism: 'hyper_questionnaire',
    thyroid_cancer: 'tc_questionnaire',
    nodule: 'nodule_questionnaire',
  };
  const condSpecific = await query(
    `SELECT id FROM ${tableMap[condition]} WHERE episode_id = $1`, [episodeId]
  );
  if (condSpecific.rows.length) {
    await query(
      `UPDATE patient_condition_episodes
       SET questionnaire_status = 'completed',
           questionnaire_completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [episodeId]
    );
  }
}

// ─────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────
module.exports = {
  selectCondition,
  getConditionSelection,
  getEpisodes,
  getEpisode,
  saveCoreQuestionnaire,
  getCoreQuestionnaire,
  saveHypoQuestionnaire,
  getHypoQuestionnaire,
  saveHyperQuestionnaire,
  getHyperQuestionnaire,
  saveTcQuestionnaire,
  getTcQuestionnaire,
  saveNoduleQuestionnaire,
  getNoduleQuestionnaire,
  addHypoTreatment,
  addHyperAtd,
  addHyperRai,
  addTcSurgery,
  addTcRai,
  addScanReport,
  getScanReports,
  getDoctorConditionView,
};
