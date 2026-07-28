# Thyroid Chatbot Project -- Master Session Summary

## Purpose

Develop a rule-based, consumer-facing thyroid assessment chatbot that
asks one question at a time and dynamically branches based on patient
responses.

## Core Design Principles

-   One question per screen.
-   Dynamic skip logic and branching.
-   Rule-based engine (initial version).
-   Structured variables plus clinician-readable summaries.
-   Use date pickers and years/months wherever specified.
-   Generate a final physician-style summary.

## Standard Question Pattern

1.  Ask question.
2.  Options: No / Unsure / Yes.
3.  If No or Unsure, proceed as defined.
4.  If Yes, ask follow-up details.
5.  Store memory variables.
6.  Auto-generate summary sentence.
7.  Continue to next node.

## Modules Covered

-   Demographics
-   Menstrual, pregnancy and hysterectomy logic
-   Thyroid disease and medication history
-   Thyroid laboratory capture
-   Fatigue
-   Weight and appetite
-   Bowel habits
-   Abdominal symptoms
-   Cold intolerance
-   Skin symptoms
-   Hair and nail changes
-   Facial and leg edema
-   Hoarseness
-   Muscle cramps and weakness
-   Neurocognitive and psychological symptoms
-   Pulse assessment
-   Positional giddiness
-   Black-out episodes

## Variable Convention

-   `<FEATURE>`{=html}\_STATUS
-   `<FEATURE>`{=html}\_DURATION_YEARS
-   `<FEATURE>`{=html}\_DURATION_MONTHS
-   `<FEATURE>`{=html}\_TOTAL_MONTHS
-   `<FEATURE>`{=html}\_SUMMARY

## Workflow

-   Design schema first.
-   Review and approve.
-   Generate code only after approval.
-   Maintain stable question IDs and branching rules.

## Long-term Goal

Produce a comprehensive Functional Requirement Specification for a
clinician-grade thyroid assessment chatbot with decision trees, rule
engine, and final report generation.
