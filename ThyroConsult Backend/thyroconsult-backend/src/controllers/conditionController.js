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
const logger = require('../utils/logger');

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
 *   3. Updates patients.registration_step to 6
 */
const selectCondition = async (req, res) => {
  const { id: patientId } = req.params;
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

      // Advance registration step to 6 (Upload Reports)
      await client.query(
        `UPDATE patients SET registration_step = 6, updated_at = NOW()
         WHERE id = $1 AND registration_step = 5`,
        [patientId]
      );
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
      [req.params.id]
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
  try {
    const result = await query(
      `SELECT pce.*,
              d.first_name AS doc_first, d.last_name AS doc_last,
              d.specialisation
       FROM patient_condition_episodes pce
       LEFT JOIN doctors d ON d.id = pce.primary_doctor_id
       WHERE pce.patient_id = $1
       ORDER BY pce.created_at DESC`,
      [req.params.id]
    );

    const episodes = result.rows.map(r => ({
      ...r,
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
      [req.params.episodeId, req.params.id]
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
  const { id: patientId, episodeId } = req.params;
  const b = req.body;

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
      [req.params.episodeId, req.params.id]
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

const saveHypoQuestionnaire = async (req, res) => {
  const { id: patientId, episodeId } = req.params;
  const b = req.body;

  try {
    const ep = await query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND patient_id = $2 AND condition = 'hypothyroidism'`,
      [episodeId, patientId]
    );
    if (!ep.rows.length) return res.status(404).json({ error: 'Hypothyroidism episode not found' });

    const existing = await query(
      'SELECT id FROM hypo_questionnaire WHERE episode_id = $1', [episodeId]
    );

    const cols = {
      cause: b.cause,
      is_subclinical: b.isSubclinical,
      goitre_present: b.goitrePresent,
      goitre_size: b.goitreSize,
      sym_myxoedema: b.symMyxoedema,
      sym_periorbital_puffiness: b.symPeriorbitalPuffiness,
      sym_macroglossia: b.symMacroglossia,
      sym_delayed_reflexes: b.symDelayedReflexes,
      sym_carpal_tunnel: b.symCarpalTunnel,
      sym_cognitive_impairment: b.symCognitiveImpairment,
      sym_depression: b.symDepression,
      sym_dry_skin: b.symDrySkin,
      sym_brittle_nails: b.symBrittleNails,
      on_treatment: b.onTreatment,
      treatment_type: b.treatmentType,
      levo_dose_mcg: b.levoDoseMcg,
      levo_brand: b.levoBrand,
      levo_timing: b.levoTiming,
      levo_compliance: b.levoCompliance,
      treatment_start_date: b.treatmentStartDate,
      dose_last_changed_date: b.doseLastChangedDate,
      dose_last_changed_reason: b.doseLastChangedReason,
      hashimotos_confirmed: b.hashimotosConfirmed,
      anti_tpo_positive: b.antiTpoPositive,
      anti_tg_positive: b.antiTgPositive,
      has_dyslipidaemia: b.hasDyslipidaemia,
      has_anaemia: b.hasAnaemia,
      has_pcos: b.hasPcos,
      has_infertility: b.hasInfertility,
      has_depression_diagnosed: b.hasDepressionDiagnosed,
      tsh_target: b.tshTarget,
      review_frequency: b.reviewFrequency,
      next_review_date: b.nextReviewDate,
    };

    const defined = Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== undefined));

    if (existing.rows.length) {
      const sets = Object.keys(defined).map((k, i) => `${k} = $${i + 1}`);
      const vals = [...Object.values(defined), episodeId];
      await query(
        `UPDATE hypo_questionnaire SET ${sets.join(', ')}, updated_at = NOW() WHERE episode_id = $${vals.length}`,
        vals
      );
    } else {
      const colNames = ['episode_id', 'patient_id', ...Object.keys(defined)];
      const placeholders = colNames.map((_, i) => `$${i + 1}`);
      await query(
        `INSERT INTO hypo_questionnaire(${colNames.join(', ')}) VALUES(${placeholders.join(', ')})`,
        [episodeId, patientId, ...Object.values(defined)]
      );
    }

    await markQuestionnaireComplete(episodeId);

    logger.audit('HYPO_QUESTIONNAIRE_SAVED', {
      userId: req.user.id, userRole: req.user.role, patientId, ip: req.ip,
    });

    res.json({ message: 'Hypothyroidism questionnaire saved' });
  } catch (err) {
    logger.error('saveHypoQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to save hypothyroidism questionnaire' });
  }
};

const getHypoQuestionnaire = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM hypo_questionnaire WHERE episode_id = $1 AND patient_id = $2',
      [req.params.episodeId, req.params.id]
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

const saveHyperQuestionnaire = async (req, res) => {
  const { id: patientId, episodeId } = req.params;
  const b = req.body;

  try {
    const ep = await query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND patient_id = $2 AND condition = 'hyperthyroidism'`,
      [episodeId, patientId]
    );
    if (!ep.rows.length) return res.status(404).json({ error: 'Hyperthyroidism episode not found' });

    const existing = await query(
      'SELECT id FROM hyper_questionnaire WHERE episode_id = $1', [episodeId]
    );

    const cols = {
      cause: b.cause,
      is_subclinical: b.isSubclinical,
      goitre_present: b.goitrePresent,
      goitre_type: b.goitreType,
      graves_confirmed: b.gravesConfirmed,
      trab_value: b.trabValue,
      trab_unit: b.trabUnit,
      trab_date: b.trabDate,
      graves_ophthalmopathy: b.gravesOphthalmopathy,
      go_class: b.goClass,
      go_clinical_activity_score: b.goClinicalActivityScore,
      go_proptosis_mm_right: b.goProtosisMmRight,
      go_proptosis_mm_left: b.goProtosisMmLeft,
      go_diplopia: b.goDiplopia,
      go_visual_acuity_affected: b.goVisualAcuityAffected,
      go_treatment: b.goTreatment,
      graves_dermopathy: b.gravesDermopathy,
      graves_dermopathy_details: b.gravesDermopathyDetails,
      sym_tremor: b.symTremor,
      sym_tremor_severity: b.symTremorSeverity,
      sym_excessive_sweating: b.symExcessiveSweating,
      sym_heat_intolerance_severity: b.symHeatIntoleranceSeverity,
      sym_anxiety: b.symAnxiety,
      sym_irritability: b.symIrritability,
      sym_insomnia: b.symInsomnia,
      sym_increased_appetite: b.symIncreasedAppetite,
      sym_frequent_bowel_movements: b.symFrequentBowelMovements,
      sym_muscle_wasting: b.symMuscleWasting,
      sym_proximal_myopathy: b.symProximalMyopathy,
      sym_periodic_paralysis: b.symPeriodicParalysis,
      sym_atrial_fibrillation: b.symAtrialFibrillation,
      sym_osteoporosis_risk: b.symOsteoporosisRisk,
      sym_gynaecomastia: b.symGynaecomastia,
      on_treatment: b.onTreatment,
      current_treatment_type: b.currentTreatmentType,
      atd_drug: b.atdDrug,
      atd_dose_mg: b.atdDoseMg,
      atd_frequency: b.atdFrequency,
      atd_start_date: b.atdStartDate,
      atd_end_date: b.atdEndDate,
      atd_compliance: b.atdCompliance,
      atd_side_effects: b.atdSideEffects,
      atd_agranulocytosis_history: b.atdAgranulocytosisHistory,
      atd_block_replace: b.atdBlockReplace,
      on_beta_blocker: b.onBetaBlocker,
      beta_blocker_name: b.betaBlockerName,
      beta_blocker_dose: b.betaBlockerDose,
      rai_received: b.raiReceived,
      rai_dose_mci: b.raiDoseMci,
      rai_date: b.raiDate,
      rai_outcome: b.raiOutcome,
      rai_developed_hypothyroidism: b.raiDevelopedHypothyroidism,
      rai_uptake_done: b.raiUptakeDone,
      rai_uptake_percent_2h: b.raiUptakePercent2h,
      rai_uptake_percent_24h: b.raiUptakePercent24h,
      rai_uptake_date: b.raiUptakeDate,
      thyroid_scan_done: b.thyroidScanDone,
      thyroid_scan_findings: b.thyroidScanFindings,
      thyroid_scan_date: b.thyroidScanDate,
      tsh_target: b.tshTarget,
      planned_treatment_duration: b.plannedTreatmentDuration,
      review_frequency: b.reviewFrequency,
      next_review_date: b.nextReviewDate,
    };

    const defined = Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== undefined));

    if (existing.rows.length) {
      const sets = Object.keys(defined).map((k, i) => `${k} = $${i + 1}`);
      const vals = [...Object.values(defined), episodeId];
      await query(
        `UPDATE hyper_questionnaire SET ${sets.join(', ')}, updated_at = NOW() WHERE episode_id = $${vals.length}`,
        vals
      );
    } else {
      const colNames = ['episode_id', 'patient_id', ...Object.keys(defined)];
      const placeholders = colNames.map((_, i) => `$${i + 1}`);
      await query(
        `INSERT INTO hyper_questionnaire(${colNames.join(', ')}) VALUES(${placeholders.join(', ')})`,
        [episodeId, patientId, ...Object.values(defined)]
      );
    }

    await markQuestionnaireComplete(episodeId);

    logger.audit('HYPER_QUESTIONNAIRE_SAVED', {
      userId: req.user.id, userRole: req.user.role, patientId, ip: req.ip,
    });

    res.json({ message: 'Hyperthyroidism questionnaire saved' });
  } catch (err) {
    logger.error('saveHyperQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to save hyperthyroidism questionnaire' });
  }
};

const getHyperQuestionnaire = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM hyper_questionnaire WHERE episode_id = $1 AND patient_id = $2',
      [req.params.episodeId, req.params.id]
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

const saveTcQuestionnaire = async (req, res) => {
  const { id: patientId, episodeId } = req.params;
  const b = req.body;

  try {
    const ep = await query(
      `SELECT id FROM patient_condition_episodes
       WHERE id = $1 AND patient_id = $2 AND condition = 'thyroid_cancer'`,
      [episodeId, patientId]
    );
    if (!ep.rows.length) return res.status(404).json({ error: 'Thyroid cancer episode not found' });

    const existing = await query(
      'SELECT id FROM tc_questionnaire WHERE episode_id = $1', [episodeId]
    );

    const cols = {
      cancer_type: b.cancerType,
      laterality: b.laterality,
      multifocal: b.multifocal,
      multifocal_count: b.multifocalCount,
      tumour_size_mm: b.tumourSizeMm,
      extrathyroidal_extension: b.extrathyroidalExtension,
      extrathyroidal_extent: b.extrathyroidalExtent,
      t_stage: b.tStage,
      n_stage: b.nStage,
      m_stage: b.mStage,
      overall_stage: b.overallStage,
      risk_category: b.riskCategory,
      fnac_done: b.fnacDone,
      fnac_date: b.fnacDate,
      fnac_result: b.fnacResult,
      fnac_details: b.fnacDetails,
      core_biopsy_done: b.coreBiopsyDone,
      core_biopsy_date: b.coreBiopsyDate,
      core_biopsy_result: b.coreBiopsyResult,
      histopathology_report: b.histopathologyReport,
      histopathology_date: b.histopathologyDate,
      sym_rapidly_growing_nodule: b.symRapidlyGrowingNodule,
      sym_hard_fixed_nodule: b.symHardFixedNodule,
      sym_cervical_lymphadenopathy: b.symCervicalLymphadenopathy,
      sym_hoarseness: b.symHoarseness,
      sym_dysphagia: b.symDysphagia,
      sym_stridor: b.symStridor,
      sym_bone_pain: b.symBonePain,
      sym_haemoptysis: b.symHaemoptysis,
      mtc_calcitonin_elevated: b.mtcCalcitoninElevated,
      mtc_cea_elevated: b.mtcCeaElevated,
      mtc_ret_mutation: b.mtcRetMutation,
      mtc_ret_mutation_details: b.mtcRetMutationDetails,
      mtc_family_screening_advised: b.mtcFamilyScreeningAdvised,
      mtc_men2_associated: b.mtcMen2Associated,
      mtc_men2_type: b.mtcMen2Type,
      tsh_at_diagnosis: b.tshAtDiagnosis,
      tg_at_diagnosis: b.tgAtDiagnosis,
      anti_tg_at_diagnosis: b.antiTgAtDiagnosis,
      calcitonin_at_diagnosis: b.calcitoninAtDiagnosis,
      cea_at_diagnosis: b.ceaAtDiagnosis,
      sr_calcium_at_diagnosis: b.srCalciumAtDiagnosis,
      vit_d3_at_diagnosis: b.vitD3AtDiagnosis,
      pth_at_diagnosis: b.pthAtDiagnosis,
      surgery_done: b.surgeryDone,
      rai_therapy_done: b.raiTherapyDone,
      on_tsh_suppression: b.onTshSuppression,
      on_external_beam_rt: b.onExternalBeamRt,
      on_targeted_therapy: b.onTargetedTherapy,
      on_chemotherapy: b.onChemotherapy,
      on_active_surveillance: b.onActiveSurveillance,
      tsh_suppression_target: b.tshSuppressionTarget,
      tsh_suppression_indication: b.tshSuppressionIndication,
      levothyroxine_dose_mcg: b.levothyroxineDoseMcg,
      levothyroxine_brand: b.levothyroxineBrand,
      levothyroxine_compliance: b.levothyroxineCompliance,
      surveillance_interval: b.surveillanceInterval,
      next_tg_date: b.nextTgDate,
      next_usg_date: b.nextUsgDate,
      next_rai_scan_date: b.nextRaiScanDate,
      next_review_date: b.nextReviewDate,
      surveillance_notes: b.surveillanceNotes,
    };

    const defined = Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== undefined));

    if (existing.rows.length) {
      const sets = Object.keys(defined).map((k, i) => `${k} = $${i + 1}`);
      const vals = [...Object.values(defined), episodeId];
      await query(
        `UPDATE tc_questionnaire SET ${sets.join(', ')}, updated_at = NOW() WHERE episode_id = $${vals.length}`,
        vals
      );
    } else {
      const colNames = ['episode_id', 'patient_id', ...Object.keys(defined)];
      const placeholders = colNames.map((_, i) => `$${i + 1}`);
      await query(
        `INSERT INTO tc_questionnaire(${colNames.join(', ')}) VALUES(${placeholders.join(', ')})`,
        [episodeId, patientId, ...Object.values(defined)]
      );
    }

    await markQuestionnaireComplete(episodeId);

    logger.audit('TC_QUESTIONNAIRE_SAVED', {
      userId: req.user.id, userRole: req.user.role, patientId, ip: req.ip,
    });

    res.json({ message: 'Thyroid cancer questionnaire saved' });
  } catch (err) {
    logger.error('saveTcQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to save thyroid cancer questionnaire' });
  }
};

const getTcQuestionnaire = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM tc_questionnaire WHERE episode_id = $1 AND patient_id = $2',
      [req.params.episodeId, req.params.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    logger.error('getTcQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch thyroid cancer questionnaire' });
  }
};

// ─────────────────────────────────────────────────────────
// THYROID NODULE QUESTIONNAIRE
// REWRITTEN this pass against migration 008's real schema (265
// columns total: 3 identity + 259 data + 3 audit) — supersedes the
// interim JSONB-blob version from the previous pass, which was only
// ever a stopgap before migration 008 was found.
//
// NoduleQuestionnaire.js's internal state uses snake_case keys that
// already match these column names 1:1 (confirmed via get("hysterectomy_
// status") etc. in the component), same pattern as Hyper — no camelCase
// transform layer needed, just a whitelist filter.
//
// CAVEAT: this whitelist matches migration 008 (i.e. the REVISED/
// deduplicated schema — J5/J6, no C4a/C5). The NoduleQuestionnaire.js
// reviewed in this session may still be the pre-revision version that
// also sends C4a/C5-named keys — those simply won't match any column
// here and will be silently dropped, not saved. Not fatal, but confirms
// we still need NoduleQuestionnaire_REVISED.js to close this out fully.
// ─────────────────────────────────────────────────────────

const NODULE_Q_COLUMNS = [
  // Module A
  'marital_status', 'occupation', 'occupation_other', 'occupation_voice_dependent',
  // Module B
  'hysterectomy_status', 'hysterectomy_date_precision', 'hysterectomy_date', 'hysterectomy_year',
  'hysterectomy_month', 'hysterectomy_reason', 'hysterectomy_reason_other',
  'menopause_status', 'menopause_years_ago',
  'menstrual_change_status', 'menstrual_pattern', 'menstrual_flow', 'menstrual_since_date',
  'menstrual_years', 'menstrual_months', 'lmp_date', 'pregnancy_status', 'edd_date',
  // Module E
  'nodule_discovery_mode', 'nodule_discovery_other', 'nodule_noticed_date',
  'nodule_duration_years', 'nodule_duration_months', 'nodule_size_change',
  'nodule_growth_direction', 'nodule_growth_rate', 'nodule_growth_years', 'nodule_growth_months',
  'doctor_consulted_status', 'doctor_consulted_date', 'doctor_advised_tests',
  'repeat_usg_advised', 'repeat_usg_done', 'repeat_usg_due_date',
  'opinion_trigger', 'opinion_trigger_other', // renamed from consultation_trigger(_other), migration 015
  // Module I
  'mgmt_plan_discussed', 'mgmt_plan_types', 'mgmt_plan_next_date',
  'outcomes_discussed', 'outcomes_details', 'patient_primary_concern', 'patient_concern_other',
  // Module D
  'tsh_status', 'tsh_value', 'tsh_date', 'tsh_ref_low', 'tsh_ref_high',
  'ft4_status', 'ft4_value', 'ft4_unit', 'ft4_date', 'ft4_ref_low', 'ft4_ref_high',
  'ft3_status', 'ft3_value', 'ft3_unit', 'ft3_date', 'ft3_ref_low', 'ft3_ref_high',
  'antibody_status', 'antitpo_value', 'antitpo_date', 'antitg_value', 'antitg_date',
  'imaging_status', 'imaging_types', 'imaging_date', 'nodule_size_mm', 'nodule_count',
  'tirads_category', 'cytology_status', 'cytology_types', 'cytology_date', 'bethesda_category',
  // Module C
  'thyroid_dx_status', 'thyroid_dx_type', 'thyroid_dx_year',
  'thyroid_tx_status', 'thyroid_tx_type', 'thyroid_tx_year',
  'thyroid_med_status', 'thyroid_med_name', 'thyroid_med_brand', 'thyroid_med_dose',
  'thyroid_med_timing', 'thyroid_med_compliance', 'thyroid_med_since_years', 'thyroid_med_since_months',
  'infertility_status',
  // Module F
  'nodule_treatment_status', 'nodule_treatment_types', 'nodule_treatment_date', 'nodule_treatment_completed',
  'prior_advice_status', 'prior_advice_types', 'prior_advice_followed', 'prior_advice_not_followed_reason',
  'prior_opinion_status', 'prior_opinion_specialty', 'prior_opinion_date', 'prior_opinion_summary', 'prior_opinion_followed',
  'current_med_status', 'current_med_name', 'current_med_brand', 'current_med_dose',
  'current_med_timing', 'current_med_compliance', 'current_med_since_years', 'current_med_since_months',
  // Module G
  'nodule_visible_status', 'nodule_visible_pattern', 'nodule_visible_since_date',
  'nodule_visible_years', 'nodule_visible_months',
  'neck_pain_status', 'neck_pain_types', 'neck_pain_severity', 'neck_pain_since_date',
  'neck_pain_years', 'neck_pain_months',
  'dysphagia_status', 'dysphagia_type', 'dysphagia_severity', 'dysphagia_since_date',
  'dysphagia_years', 'dysphagia_months',
  'resp_symptom_status', 'resp_symptom_types', 'resp_symptom_trigger', 'resp_since_date',
  'resp_years', 'resp_months',
  'hoarseness_status', 'hoarseness_pattern', 'hoarseness_since_date', 'hoarseness_years', 'hoarseness_months',
  'voice_fatigue_status',
  'nodule_cough_status', 'nodule_cough_type', 'nodule_cough_since_date', 'nodule_cough_years', 'nodule_cough_months',
  // Module H
  'fatigue_status', 'fatigue_severity', 'fatigue_since_date', 'fatigue_years', 'fatigue_months',
  'weight_change_status', 'weight_direction', 'weight_kg', 'weight_since_date', 'weight_years', 'weight_months',
  'appetite_change_status', 'appetite_direction', 'appetite_since_date', 'appetite_years', 'appetite_months',
  'cold_intol_status', 'cold_intol_severity', 'cold_intol_since_date', 'cold_intol_years', 'cold_intol_months',
  'bowel_change_status', 'bowel_type', 'bowel_since_date', 'bowel_years', 'bowel_months',
  'skin_status', 'skin_types', 'skin_since_date', 'skin_years', 'skin_months',
  'hair_status', 'hair_types', 'hair_since_date', 'hair_years', 'hair_months',
  'muscle_sx_status', 'muscle_sx_types', 'muscle_weakness_location', 'muscle_sx_since_date',
  'muscle_sx_years', 'muscle_sx_months',
  'depression_status', 'depression_diagnosed', 'depression_treated', 'depression_since_date',
  'depression_years', 'depression_months',
  'palp_tremor_status', 'palp_tremor_types', 'palp_tremor_since_date', 'palp_tremor_years', 'palp_tremor_months',
  'anxiety_status', 'anxiety_severity', 'anxiety_since_date', 'anxiety_years', 'anxiety_months',
  // Module J
  'dyslipidaemia_status', 'dyslipidaemia_since_date', 'dyslipidaemia_years', 'dyslipidaemia_months',
  'dyslipidaemia_on_med', 'dyslipidaemia_meds',
  'anaemia_status', 'anaemia_type',
  'diabetes_status', 'diabetes_type', 'diabetes_since_date', 'diabetes_years', 'diabetes_months', 'diabetes_meds',
  'htn_status', 'htn_since_date', 'htn_years', 'htn_months', 'htn_on_med', 'htn_meds',
  'pcos_label', 'pcos_status', 'pcos_since_date', 'pcos_years', 'pcos_months',
  'pcos_on_med', 'pcos_med_name', 'pcos_med_dose', 'pcos_med_freq',
  'autoimmune_status', 'autoimmune_conditions', 'autoimmune_other',
  'family_thyroid_status', 'family_thyroid_relations', 'family_thyroid_condition',
  'family_men_status', 'family_men_types', 'family_men_relative',
  'radiation_exposure_status', 'radiation_exposure_types', 'radiation_exposure_other', 'radiation_exposure_year',
  'iodine_deficiency_status', 'iodine_deficiency_since_date', 'iodine_deficiency_years', 'iodine_deficiency_months',
  'iodine_med_status', 'iodine_med_name', 'iodine_med_since_date', 'iodine_med_years', 'iodine_med_months',
  'additional_notes',
];

const NODULE_Q_JSONB_COLUMNS = new Set(['dyslipidaemia_meds', 'diabetes_meds', 'htn_meds']);

const saveNoduleQuestionnaire = async (req, res) => {
  const { id: patientId, episodeId } = req.params;
  const { _draft, ...body } = req.body;

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
  } catch (err) {
    logger.error('saveNoduleQuestionnaire error', { error: err.message });
    res.status(500).json({ error: 'Failed to save nodule questionnaire' });
  }
};

const getNoduleQuestionnaire = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM nodule_questionnaire WHERE episode_id = $1 AND patient_id = $2',
      [req.params.episodeId, req.params.id]
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
  const { id: patientId, episodeId } = req.params;
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
  const { id: patientId, episodeId } = req.params;
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
  const { id: patientId, episodeId } = req.params;
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
  const { id: patientId, episodeId } = req.params;
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
  const { id: patientId, episodeId } = req.params;
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
  const { id: patientId, episodeId } = req.params;
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
      [req.params.episodeId, req.params.id]
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
