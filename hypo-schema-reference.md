# Hypothyroidism Questionnaire — Full Reference
**File:** `HypoQuestionnaire.js` | **DB table:** `hypo_questionnaire`
**Purpose:** documents every screen, every skip/branch condition, and the full column schema — for tracking overlapping questions and their skip dependencies as the questionnaire evolves.

---

## 1. Page flow, in display order, with skip conditions

Pages not listed as conditional always show. `hadHysterectomy` = `hysterectomy === 'yes'` (B1). `isPostMeno` = `menopauseStatus === 'post'` (B2, now unreachable when hadHysterectomy is true — see below).

### Module A — Demographics
| ID | Title | Skip condition |
|---|---|---|
| A3 | Marital status | — |
| A4 | Occupation | — |

### Module B — Reproductive (female only — entire module hidden if `sex === 'male'`)
| ID | Title | Skip condition |
|---|---|---|
| B1 | Hysterectomy | — |
| B2 | Menopausal status | **Skipped if `hadHysterectomy`** (added this session — a patient who's had a hysterectomy can't meaningfully answer a menstrual-cycle-based menopause question) |
| B3 | Menstrual cycle changes | Skipped if `hadHysterectomy` OR `isPostMeno` |
| B4 | Last menstrual period (LMP) | Skipped if `hadHysterectomy` OR `isPostMeno` |
| B5 | Pregnancy | Shown only if: not male, not hysterectomy, not post-menopausal, married, AND `lmpDaysAgo >= 31` |

**Overlap risk:** B2 skip means `menopauseStatus` is never set for hysterectomy patients — `isPostMeno` therefore evaluates `false` for them permanently. This is safe today because every place `isPostMeno` is used is always AND-ed with `!hadHysterectomy` first (B3/B4/B5 all check hysterectomy separately), so the short-circuit is correct. **If a future change ever uses `isPostMeno` alone without also checking `hadHysterectomy`, it will silently misbehave for hysterectomy patients.**

### Module C — Prior thyroid history
| ID | Title | Skip condition |
|---|---|---|
| C1 | Previous thyroid diagnosis | — |
| C2a | Thyroid surgery | — |
| C2b | Radioiodine (RAI) therapy | — (now a repeatable dose+date list, not a single year field) |
| C3 | Current thyroid medication | — |
| C4 | Family history of thyroid disease | — |
| C5 | Autoimmune conditions | — |

**Derived-cause side effect:** if C2a's surgery type is `'total'`, or C2b's RAI = yes, or C1's diagnosis type is hypothyroidism, then E1 (cause) is auto-answered (`hypoCauseKnown='yes'`) via a `useEffect` — E1 itself isn't skipped from the page list, but its answer gets pre-filled from these upstream answers.

### Module D — Investigations
| ID | Title | Notes |
|---|---|---|
| D1 | TSH | Standalone screen, not symptom-gated |
| D2 | T3 (total) | Standalone |
| D3 | Free T3 | Standalone |
| D4 | T4 (total) | Standalone |
| D5 | Free T4 | Standalone |
| D6 | Anti-TPO | Standalone |
| D7 | Anti-Tg | Standalone |
| D10 | Thyroid imaging | Standalone |

**CBC, Vitamin B12, Vitamin D3, Serum Calcium, Iron studies (Sr. Iron/Sr. Ferritin/TIBC/Transferrin Sat), and Blood Sugar (Fasting/PP) are NOT standalone D-module screens anymore** — as of this session they were removed from the fixed page sequence entirely and are now embedded inline, purely symptom-triggered (see section 2). A patient who answers "No" to every trigger symptom will never be asked these at all.

### Module E — Cause / clinical findings
| ID | Title | Skip condition |
|---|---|---|
| E1 | Cause | Answer may be pre-filled by C-module answers (see above); page itself isn't removed from the list |
| E2 | Hashimoto's confirmation | Conditional on E1 |
| E3 | Goitre | — |

### Module F — Symptoms
25 screens (F1–F25), each independent unless noted in section 2 (investigation triggers) below.

### Module G — Current treatment
| ID | Title | Notes |
|---|---|---|
| G1 | Current thyroid medication | **Gate question removed this session** ("Are you currently on treatment?"). Medication fields now shown unconditionally — leave blank if not on treatment. `on_treatment` is now *derived* (`!!(levoBrand \|\| levoDose \|\| levoDrugName)`), not asked directly. |
| G2 | Dose change | Now shown whenever medication fields are filled (derived the same way G1's gate used to work), not gated on the old `onTreatment==='yes'` state which no longer gets set by any question. |

### Module H — Comorbidities
| ID | Title | Skip condition |
|---|---|---|
| H1 | Dyslipidaemia | — |
| H2 | Anaemia | — |
| H3 | Diabetes | — |
| H4 | PCOS/PMOS | Female only |
| H5 | Difficulty conceiving | Female, not hysterectomy, married |
| H6 | Hypertension | — (added this session) |
| H7 | Osteoporosis | — |
| H8 | Family history — non-thyroid cancers | — |
| H9 | Additional notes | — (free text, no validator — always "complete") |

---

## 2. Investigation trigger matrix (added this session)

Investigations below are **not** separate screens — they're embedded directly inside the triggering symptom's own screen, appearing the moment the symptom is answered "Yes." Because every trigger reads/writes the *same* shared state fields (`f.cbcValues`, `f.vitB12Value`, etc. — not per-trigger copies), a value entered once is pre-filled everywhere else it's shown. Overlapping triggers are intentional, not a bug — a patient who says "Yes" to both Fatigue and Weakness will see the CBC/B12/D3/Calcium panel twice, once per screen, already filled in the second time.

| Trigger symptom (page) | Investigations shown | Conditional extra |
|---|---|---|
| F1 — Fatigue | CBC, Vit B12, Vit D3, Sr. Calcium | **If Haemoglobin < 10** (from the CBC just entered): also show Sr. Iron, Sr. Ferritin, TIBC, Transferrin Saturation |
| F13 — Muscle cramps/aches | Vit D3, Sr. Calcium | — |
| F14 — General weakness/heaviness | CBC, Vit B12, Vit D3, Sr. Calcium | — |
| F19 — Positional giddiness | CBC, Blood Sugar (Fasting), Blood Sugar (PP) | — |
| F20 — Blackout episodes | CBC, Blood Sugar (Fasting), Blood Sugar (PP) | — |
| F23 — Numbness/tingling (carpal tunnel) | CBC, Vit B12 | Only if numbness OR tingling specifically = yes (not pain alone) |

**Known overlap, by design:**
- CBC appears on 5 different trigger screens (F1, F14, F19, F20, F23)
- Vit B12 appears on 3 (F1, F14, F23)
- Vit D3 + Sr. Calcium appear together on 2 (F1 via weakness synonym, F13, F14)

---

## 3. Full column schema

# Hypothyroidism Questionnaire — Full Schema Reference
**Table:** `hypo_questionnaire` | **Total data columns:** 502 (+ 8 system/audit columns not listed here)
**As of:** migrations through 030 (Sr. Calcium + Blood Sugar)

---

## A — Demographics (3 columns)

- `marital_status`
- `occupation`
- `occupation_other`

## B — Reproductive (female only) (18 columns)

- `edd_date`
- `hysterectomy_date`
- `hysterectomy_date_precision`
- `hysterectomy_month`
- `hysterectomy_reason`
- `hysterectomy_reason_other`
- `hysterectomy_status`
- `hysterectomy_year`
- `lmp_date`
- `menopause_status`
- `menopause_years_ago`
- `menstrual_change_status`
- `menstrual_flow`
- `menstrual_months`
- `menstrual_pattern`
- `menstrual_since_date`
- `menstrual_years`
- `pregnancy_status`

## C — Prior history (9 columns)

- `rai_administrations`
- `thyroid_med_brand`
- `thyroid_med_compliance`
- `thyroid_med_dose`
- `thyroid_med_name`
- `thyroid_med_since_months`
- `thyroid_med_since_years`
- `thyroid_med_status`
- `thyroid_med_timing`

## D — Thyroid function / antibody labs (48 columns)

- `anti_tg_positive`
- `anti_tpo_positive`
- `antitg_date`
- `antitg_ref_high`
- `antitg_ref_low`
- `antitg_status`
- `antitg_unit`
- `antitg_value`
- `antitpo_date`
- `antitpo_ref_high`
- `antitpo_ref_low`
- `antitpo_status`
- `antitpo_unit`
- `antitpo_value`
- `ft3_date`
- `ft3_ref_high`
- `ft3_ref_low`
- `ft3_status`
- `ft3_unit`
- `ft3_value`
- `ft4_date`
- `ft4_ref_high`
- `ft4_ref_low`
- `ft4_status`
- `ft4_unit`
- `ft4_value`
- `hashimotos_anti_tg`
- `hashimotos_anti_tpo`
- `hashimotos_confirmed`
- `t3_date`
- `t3_ref_high`
- `t3_ref_low`
- `t3_status`
- `t3_unit`
- `t3_value`
- `t4_date`
- `t4_ref_high`
- `t4_ref_low`
- `t4_status`
- `t4_unit`
- `t4_value`
- `tsh_date`
- `tsh_ref_high`
- `tsh_ref_low`
- `tsh_status`
- `tsh_target`
- `tsh_unit`
- `tsh_value`

## D — CBC panel (73 columns)

- `cbc_date`
- `cbc_diff_basophils_count_ref_high`
- `cbc_diff_basophils_count_ref_low`
- `cbc_diff_basophils_count_unit`
- `cbc_diff_basophils_count_value`
- `cbc_diff_basophils_pct_ref_high`
- `cbc_diff_basophils_pct_ref_low`
- `cbc_diff_basophils_pct_value`
- `cbc_diff_eosinophils_count_ref_high`
- `cbc_diff_eosinophils_count_ref_low`
- `cbc_diff_eosinophils_count_unit`
- `cbc_diff_eosinophils_count_value`
- `cbc_diff_eosinophils_pct_ref_high`
- `cbc_diff_eosinophils_pct_ref_low`
- `cbc_diff_eosinophils_pct_value`
- `cbc_diff_lymphocytes_count_ref_high`
- `cbc_diff_lymphocytes_count_ref_low`
- `cbc_diff_lymphocytes_count_unit`
- `cbc_diff_lymphocytes_count_value`
- `cbc_diff_lymphocytes_pct_ref_high`
- `cbc_diff_lymphocytes_pct_ref_low`
- `cbc_diff_lymphocytes_pct_value`
- `cbc_diff_monocytes_count_ref_high`
- `cbc_diff_monocytes_count_ref_low`
- `cbc_diff_monocytes_count_unit`
- `cbc_diff_monocytes_count_value`
- `cbc_diff_monocytes_pct_ref_high`
- `cbc_diff_monocytes_pct_ref_low`
- `cbc_diff_monocytes_pct_value`
- `cbc_diff_neutrophils_count_ref_high`
- `cbc_diff_neutrophils_count_ref_low`
- `cbc_diff_neutrophils_count_unit`
- `cbc_diff_neutrophils_count_value`
- `cbc_diff_neutrophils_pct_ref_high`
- `cbc_diff_neutrophils_pct_ref_low`
- `cbc_diff_neutrophils_pct_value`
- `cbc_haematocrit_ref_high`
- `cbc_haematocrit_ref_low`
- `cbc_haematocrit_unit`
- `cbc_haematocrit_value`
- `cbc_haemoglobin_ref_high`
- `cbc_haemoglobin_ref_low`
- `cbc_haemoglobin_unit`
- `cbc_haemoglobin_value`
- `cbc_mch_ref_high`
- `cbc_mch_ref_low`
- `cbc_mch_unit`
- `cbc_mch_value`
- `cbc_mchc_ref_high`
- `cbc_mchc_ref_low`
- `cbc_mchc_unit`
- `cbc_mchc_value`
- `cbc_mcv_ref_high`
- `cbc_mcv_ref_low`
- `cbc_mcv_unit`
- `cbc_mcv_value`
- `cbc_platelet_count_ref_high`
- `cbc_platelet_count_ref_low`
- `cbc_platelet_count_unit`
- `cbc_platelet_count_value`
- `cbc_rbc_count_ref_high`
- `cbc_rbc_count_ref_low`
- `cbc_rbc_count_unit`
- `cbc_rbc_count_value`
- `cbc_rdw_ref_high`
- `cbc_rdw_ref_low`
- `cbc_rdw_unit`
- `cbc_rdw_value`
- `cbc_status`
- `cbc_wbc_total_ref_high`
- `cbc_wbc_total_ref_low`
- `cbc_wbc_total_unit`
- `cbc_wbc_total_value`

## D — Other investigations (symptom-triggered, inline) (78 columns)

- `fbs_date`
- `fbs_ref_high`
- `fbs_ref_low`
- `fbs_status`
- `fbs_unit`
- `fbs_value`
- `ppbs_date`
- `ppbs_ref_high`
- `ppbs_ref_low`
- `ppbs_status`
- `ppbs_unit`
- `ppbs_value`
- `sr_calcium_date`
- `sr_calcium_ref_high`
- `sr_calcium_ref_low`
- `sr_calcium_status`
- `sr_calcium_unit`
- `sr_calcium_value`
- `sr_ferritin_date`
- `sr_ferritin_ref_high`
- `sr_ferritin_ref_low`
- `sr_ferritin_status`
- `sr_ferritin_unit`
- `sr_ferritin_value`
- `sr_iron_date`
- `sr_iron_ref_high`
- `sr_iron_ref_low`
- `sr_iron_status`
- `sr_iron_unit`
- `sr_iron_value`
- `tg_date`
- `tg_ref_high`
- `tg_ref_low`
- `tg_status`
- `tg_unit`
- `tg_value`
- `tgab_date`
- `tgab_ref_high`
- `tgab_ref_low`
- `tgab_status`
- `tgab_unit`
- `tgab_value`
- `tibc_date`
- `tibc_ref_high`
- `tibc_ref_low`
- `tibc_status`
- `tibc_unit`
- `tibc_value`
- `trab_date`
- `trab_ref_high`
- `trab_ref_low`
- `trab_status`
- `trab_unit`
- `trab_value`
- `transferrin_sat_date`
- `transferrin_sat_ref_high`
- `transferrin_sat_ref_low`
- `transferrin_sat_status`
- `transferrin_sat_unit`
- `transferrin_sat_value`
- `tsi_date`
- `tsi_ref_high`
- `tsi_ref_low`
- `tsi_status`
- `tsi_unit`
- `tsi_value`
- `vit_b12_date`
- `vit_b12_ref_high`
- `vit_b12_ref_low`
- `vit_b12_status`
- `vit_b12_unit`
- `vit_b12_value`
- `vit_d3_date`
- `vit_d3_ref_high`
- `vit_d3_ref_low`
- `vit_d3_status`
- `vit_d3_unit`
- `vit_d3_value`

## D — Imaging (1 columns)

- `imaging_finding`

## E — Cause / clinical findings (10 columns)

- `cause`
- `goitre_present`
- `goitre_size`
- `goitre_size_value`
- `hypo_cause_known`
- `hypo_duration_date`
- `hypo_duration_days`
- `hypo_duration_months`
- `hypo_duration_years`
- `is_subclinical`

## F — Symptoms (sym_*) (138 columns)

- `sym_abdominal_days`
- `sym_abdominal_months`
- `sym_abdominal_since_date`
- `sym_abdominal_status`
- `sym_abdominal_types`
- `sym_abdominal_years`
- `sym_appetite_status`
- `sym_blackout_assessed`
- `sym_blackout_count`
- `sym_blackout_dx`
- `sym_blackout_last_date`
- `sym_blackout_status`
- `sym_bowel_days`
- `sym_bowel_months`
- `sym_bowel_since_date`
- `sym_bowel_status`
- `sym_bowel_type`
- `sym_bowel_years`
- `sym_bradycardia_days`
- `sym_bradycardia_months`
- `sym_bradycardia_pulse_bpm`
- `sym_bradycardia_since_date`
- `sym_bradycardia_status`
- `sym_bradycardia_years`
- `sym_brittle_nails`
- `sym_carpal_data`
- `sym_carpal_tunnel`
- `sym_cognitive_impairment`
- `sym_cold_days`
- `sym_cold_impact`
- `sym_cold_months`
- `sym_cold_since_date`
- `sym_cold_status`
- `sym_cold_years`
- `sym_concentration_days`
- `sym_concentration_impact`
- `sym_concentration_months`
- `sym_concentration_since_date`
- `sym_concentration_status`
- `sym_concentration_years`
- `sym_cramp_days`
- `sym_cramp_months`
- `sym_cramp_since_date`
- `sym_cramp_status`
- `sym_cramp_years`
- `sym_delayed_reflexes`
- `sym_depression`
- `sym_depression_days`
- `sym_depression_diagnosed`
- `sym_depression_months`
- `sym_depression_seen_doctor`
- `sym_depression_since_date`
- `sym_depression_status`
- `sym_depression_years`
- `sym_dry_skin`
- `sym_facial_oedema_days`
- `sym_facial_oedema_months`
- `sym_facial_oedema_since_date`
- `sym_facial_oedema_status`
- `sym_facial_oedema_years`
- `sym_fatigue_days`
- `sym_fatigue_months`
- `sym_fatigue_severity`
- `sym_fatigue_since_date`
- `sym_fatigue_status`
- `sym_fatigue_years`
- `sym_giddiness_days`
- `sym_giddiness_freq`
- `sym_giddiness_months`
- `sym_giddiness_since_date`
- `sym_giddiness_status`
- `sym_giddiness_years`
- `sym_hair_data`
- `sym_hair_status`
- `sym_hearing_days`
- `sym_hearing_months`
- `sym_hearing_since_date`
- `sym_hearing_status`
- `sym_hearing_type`
- `sym_hearing_years`
- `sym_hoarseness_days`
- `sym_hoarseness_months`
- `sym_hoarseness_pattern`
- `sym_hoarseness_since_date`
- `sym_hoarseness_status`
- `sym_hoarseness_years`
- `sym_hypersomnia_days`
- `sym_hypersomnia_months`
- `sym_hypersomnia_since_date`
- `sym_hypersomnia_status`
- `sym_hypersomnia_years`
- `sym_macroglossia`
- `sym_macroglossia_status`
- `sym_memory_days`
- `sym_memory_impact`
- `sym_memory_months`
- `sym_memory_since_date`
- `sym_memory_status`
- `sym_memory_years`
- `sym_myxoedema`
- `sym_nail_data`
- `sym_nail_status`
- `sym_pedal_oedema_days`
- `sym_pedal_oedema_months`
- `sym_pedal_oedema_since_date`
- `sym_pedal_oedema_status`
- `sym_pedal_oedema_type`
- `sym_pedal_oedema_years`
- `sym_periorbital_days`
- `sym_periorbital_months`
- `sym_periorbital_puffiness`
- `sym_periorbital_since_date`
- `sym_periorbital_status`
- `sym_periorbital_years`
- `sym_reflexes_days`
- `sym_reflexes_months`
- `sym_reflexes_since_date`
- `sym_reflexes_status`
- `sym_reflexes_years`
- `sym_skin_days`
- `sym_skin_months`
- `sym_skin_since_date`
- `sym_skin_status`
- `sym_skin_types`
- `sym_skin_years`
- `sym_weakness_days`
- `sym_weakness_location`
- `sym_weakness_months`
- `sym_weakness_since_date`
- `sym_weakness_status`
- `sym_weakness_years`
- `sym_weight_days`
- `sym_weight_direction`
- `sym_weight_kg_val`
- `sym_weight_months`
- `sym_weight_since_date`
- `sym_weight_status`
- `sym_weight_years`

## F — Acidity symptom + medication (12 columns)

- `acidity_days`
- `acidity_med_dose`
- `acidity_med_freq`
- `acidity_med_name`
- `acidity_med_since_date`
- `acidity_med_since_months`
- `acidity_med_since_years`
- `acidity_months`
- `acidity_on_med`
- `acidity_since_date`
- `acidity_status`
- `acidity_years`

## G — Current treatment (13 columns)

- `dose_change_reason_type`
- `dose_last_changed_date`
- `dose_last_changed_reason`
- `levo_brand`
- `levo_compliance_val`
- `levo_dose_mcg`
- `levo_drug_name`
- `levo_timing`
- `on_treatment`
- `treatment_start_date_val`
- `treatment_start_months_val`
- `treatment_start_years`
- `treatment_type`

## H — Comorbidities (96 columns)

- `anaemia_days`
- `anaemia_med_dose`
- `anaemia_med_freq`
- `anaemia_med_name`
- `anaemia_med_since_date`
- `anaemia_med_since_months`
- `anaemia_med_since_years`
- `anaemia_months`
- `anaemia_on_med`
- `anaemia_since_date`
- `anaemia_status`
- `anaemia_type`
- `anaemia_years`
- `depression_days`
- `depression_diagnosed`
- `depression_med_dose`
- `depression_med_freq`
- `depression_med_name`
- `depression_med_since_date`
- `depression_med_since_months`
- `depression_med_since_years`
- `depression_months`
- `depression_on_med`
- `depression_since_date`
- `depression_status`
- `depression_years`
- `diabetes_days`
- `diabetes_duration_months`
- `diabetes_med_dose`
- `diabetes_med_freq`
- `diabetes_med_name`
- `diabetes_med_since_date`
- `diabetes_med_since_months`
- `diabetes_med_since_years`
- `diabetes_months`
- `diabetes_on_med`
- `diabetes_since_date`
- `diabetes_status`
- `diabetes_type`
- `diabetes_years`
- `dyslipidaemia_days`
- `dyslipidaemia_med_dose`
- `dyslipidaemia_med_freq`
- `dyslipidaemia_med_name`
- `dyslipidaemia_med_since_date`
- `dyslipidaemia_med_since_months`
- `dyslipidaemia_med_since_years`
- `dyslipidaemia_med_times`
- `dyslipidaemia_months`
- `dyslipidaemia_on_med`
- `dyslipidaemia_since_date`
- `dyslipidaemia_status`
- `dyslipidaemia_years`
- `family_cancer_relative`
- `family_cancer_status`
- `family_cancer_types`
- `has_infertility`
- `htn_days`
- `htn_med_dose`
- `htn_med_freq`
- `htn_med_name`
- `htn_med_since_date`
- `htn_med_since_months`
- `htn_med_since_years`
- `htn_months`
- `htn_on_med`
- `htn_since_date`
- `htn_status`
- `htn_years`
- `infertility_status`
- `osteoporosis_days`
- `osteoporosis_dexa`
- `osteoporosis_med_dose`
- `osteoporosis_med_freq`
- `osteoporosis_med_name`
- `osteoporosis_med_since_date`
- `osteoporosis_med_since_months`
- `osteoporosis_med_since_years`
- `osteoporosis_months`
- `osteoporosis_on_med`
- `osteoporosis_since_date`
- `osteoporosis_status`
- `osteoporosis_years`
- `pcos_days`
- `pcos_med_dose`
- `pcos_med_freq`
- `pcos_med_name`
- `pcos_med_since_date`
- `pcos_med_since_months`
- `pcos_med_since_years`
- `pcos_months`
- `pcos_on_med`
- `pcos_pmos_label`
- `pcos_since_date`
- `pcos_status`
- `pcos_years`

## H — Notes (1 columns)

- `additional_notes`

## Other / uncategorized (2 columns)

- `next_review_date`
- `review_frequency`

