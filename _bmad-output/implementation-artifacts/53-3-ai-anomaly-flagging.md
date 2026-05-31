# Story 53.3: AI Anomaly Flagging for Physician Review

Status: pending

## Story

As a lab system,
I want to detect statistical anomalies in result data and flag them for physician review,
So that potentially dangerous patterns are caught even when the tech is tired or overloaded.

## Context

Individual abnormal flags (H, HH, L, LL from Story 42.4) catch single-value deviations, but some dangerous patterns emerge only from **combinations** of values or **changes over time** — patterns a fatigued technician might miss. This story implements a statistical anomaly detection engine that operates on structured numeric result data (no PHI context) and flags unusual patterns for urgent physician review.

This is the first true AI/ML feature in Lab-Lite and is subject to CLAUDE.md's safety rules:
- **"All AI-generated clinical content requires a physician confirmation gate."** — The anomaly flag is never auto-committed to the patient record. It generates a notification to the ordering physician who must review and act.
- **The AI NEVER names a diagnosis.** Flags use the format: "This pattern warrants urgent physician review" — never "This is TTP" or "Suspect leukemia."
- **Confidence Inversion Principle (Story 53.5):** Lower confidence = LOUDER alert. A low-confidence flag triggers a full-screen red alert and auto-escalation.

The engine uses rule-based statistical detection (not deep learning) for transparency and offline capability. Pattern rules detect unusual value combinations and significant delta changes from prior results.

**PRD Requirements:** FR53 (brainstorm #15, #17)
**Dependencies:** Story 42.4 (Structured Result Data), Story 53.5 (Confidence Inversion Principle — cross-cutting), Story 42.5 (Result Authorization — notification to ordering physician)

## Acceptance Criteria

1. [ ] Given a result has been entered, when the anomaly detection engine reviews the structured result data, then it identifies: unusual combinations of values, patterns consistent with urgent conditions, and significant changes from prior results for the same patient.
2. [ ] The engine operates on numeric data only — no PHI context (no patient name, no demographics, no clinical notes). Input is `Record<string, number | null>` plus optional prior result values.
3. [ ] The AI NEVER names a diagnosis — flags use the format: "Statistical pattern flag — not a diagnosis. Clinical correlation required." with a description of the detected pattern (e.g., "Combination of elevated LDH, low haptoglobin, and elevated indirect bilirubin detected").
4. [ ] Anomaly flags are sent as priority notifications to the ordering physician via the existing notification system.
5. [ ] Each flag includes a confidence level (HIGH, MEDIUM, LOW) and the explicit disclaimer: "Statistical pattern flag — not a diagnosis. Clinical correlation required."
6. [ ] The Confidence Inversion Principle applies: HIGH confidence = subtle green indicator, MEDIUM = yellow with explanation, LOW = red full-screen alert with auto-escalation (Story 53.5).
7. [ ] The anomaly detection engine works offline (rule-based, no network dependency).
8. [ ] All anomaly detection events are logged in the AI Provenance Trail (Story 53.6) with model version, input description (no PHI), output, and confidence score.
9. [ ] Delta detection compares current results against the most recent prior result for the same patient (fetched from Dexie cache), flagging changes exceeding configurable thresholds.
10. [ ] The engine is extensible: new pattern rules can be added without modifying core logic.
11. [ ] Comprehensive tests cover: single-pattern detection, multi-pattern detection, delta detection, confidence level assignment, no-match (no flag), PHI-guard validation (no patient identifiers in any output).

## Tasks / Subtasks

- [ ] **Task 1: Anomaly Pattern Rule Model** (AC: 2, 3, 10)
  - [ ] Create `apps/lab-lite/src/lib/anomaly-rules.ts` with type definitions:
    ```typescript
    interface AnomalyRule {
      id: string                          // unique rule ID (e.g., 'ANOM-HEMO-001')
      name: string                        // human-readable rule name (no PHI)
      description: string                 // i18n key for pattern description shown to physician
      type: 'combination' | 'delta' | 'extreme'
      applicableTemplates: string[]       // LOINC codes of templates this rule applies to
      conditions: AnomalyCondition[]      // conditions for this rule (AND logic)
      confidence: ConfidenceLevel         // baseline confidence for this rule
      severity: 'urgent' | 'elevated' | 'notable'
    }

    interface AnomalyCondition {
      type: 'value_threshold' | 'value_combination' | 'delta_change'
      fieldCode: string                   // LOINC field code
      operator: 'gt' | 'lt' | 'gte' | 'lte' | 'between'
      value?: number
      valueRange?: { min: number; max: number }
      deltaPercent?: number               // for delta_change: % change threshold
      deltaDirection?: 'increase' | 'decrease' | 'either'
    }

    type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'
    ```
  - [ ] Export `ConfidenceLevel` type for cross-cutting use (Story 53.5).

- [ ] **Task 2: Seed Anomaly Rules** (AC: 1, 3)
  - [ ] Define initial rule set covering clinically significant patterns:
    - **Combination rules:**
      - Hemolytic anemia pattern: elevated LDH + low haptoglobin + elevated indirect bilirubin.
      - DIC pattern: low platelets + prolonged PT + elevated D-dimer + low fibrinogen.
      - Pancytopenia: low WBC + low RBC + low platelets simultaneously.
      - Tumor lysis syndrome: elevated potassium + elevated phosphate + elevated uric acid + low calcium.
    - **Delta rules:**
      - Hemoglobin drop > 3 g/dL from prior result (possible acute bleed).
      - Platelet drop > 50% from prior result (possible HIT or consumption).
      - Creatinine increase > 50% from prior result (acute kidney injury).
    - **Extreme rules:**
      - WBC > 100,000 (hyperviscosity risk).
      - Potassium > 7.0 (cardiac arrest risk).
  - [ ] Each rule has a pre-assigned confidence level based on specificity of the pattern.
  - [ ] Add i18n keys to `messages/en.json` under an `anomalyFlags` namespace. Pattern descriptions are clinical but never name diagnoses.

- [ ] **Task 3: Anomaly Detection Engine** (AC: 1, 2, 7, 9, 10)
  - [ ] Create `apps/lab-lite/src/lib/anomaly-engine.ts`.
  - [ ] Implement `detectAnomalies(input: AnomalyInput): AnomalyFlag[]`:
    ```typescript
    interface AnomalyInput {
      currentValues: Record<string, number | null>  // current result values
      priorValues?: Record<string, number | null>    // most recent prior result (if available)
      templateLoincCode: string                      // which template the result belongs to
    }

    interface AnomalyFlag {
      ruleId: string
      ruleName: string
      description: string           // i18n key — pattern description, NEVER a diagnosis
      confidence: ConfidenceLevel
      severity: 'urgent' | 'elevated' | 'notable'
      matchedConditions: string[]   // field codes that triggered the match
      disclaimer: string            // always: "Statistical pattern flag — not a diagnosis. Clinical correlation required."
    }
    ```
  - [ ] Filter rules by `applicableTemplates` matching `templateLoincCode`.
  - [ ] Evaluate combination and extreme rules against `currentValues`.
  - [ ] Evaluate delta rules against `currentValues` vs `priorValues` (skip if no prior).
  - [ ] Return all matching flags sorted by severity (urgent first).
  - [ ] PHI guard: function accepts only numeric values and LOINC codes — no patient identifiers in input or output.

- [ ] **Task 4: Prior Result Lookup** (AC: 9)
  - [ ] Create `apps/lab-lite/src/lib/prior-results.ts`.
  - [ ] Implement `getPriorResult(patientId: string, templateLoincCode: string): Record<string, number | null> | null`.
  - [ ] Query Dexie `lab_results` table for the most recent completed result for the same patient and template.
  - [ ] Extract numeric field values from the stored observations.
  - [ ] Returns `null` if no prior result exists (delta rules are skipped).
  - [ ] Note: `patientId` is used only for the Dexie query — it is NOT passed to the anomaly engine.

- [ ] **Task 5: Confidence Inversion UI Integration** (AC: 5, 6)
  - [ ] Create `apps/lab-lite/src/components/AnomalyFlagDisplay.tsx`.
  - [ ] Props: `flags: AnomalyFlag[]`.
  - [ ] Render flags with confidence-inverted UI (per Story 53.5):
    - HIGH confidence: subtle green badge with flag summary.
    - MEDIUM confidence: yellow banner with explanation text and pattern details.
    - LOW confidence: red full-screen overlay: "I cannot reliably assess this. Request human consultation." with auto-escalation indicator.
  - [ ] Each flag displays: pattern description, confidence level, severity, disclaimer text.
  - [ ] All text via `useTranslations('anomalyFlags')`.
  - [ ] RTL-compatible with logical CSS properties.

- [ ] **Task 6: Priority Notification to Ordering Physician** (AC: 4)
  - [ ] Extend the existing notification system (`apps/lab-lite/src/components/notifications/`) to support anomaly flag notifications.
  - [ ] Create notification payload:
    ```typescript
    {
      type: 'ANOMALY_FLAG',
      priority: flag.severity === 'urgent' ? 'critical' : 'high',
      title: 'Statistical Pattern Flag',
      body: flag.description,  // i18n key
      confidence: flag.confidence,
      ruleId: flag.ruleId,
      sampleId: string,        // for physician to locate the result
      disclaimer: flag.disclaimer
    }
    ```
  - [ ] Urgent flags trigger push notification (if available) in addition to in-app notification.
  - [ ] Notification routes physician to the result review page.

- [ ] **Task 7: Integration with Result Entry** (AC: 1, 8)
  - [ ] After result entry is completed (status changes to `preliminary`), invoke `detectAnomalies()`.
  - [ ] If flags are returned, display `AnomalyFlagDisplay` component and create physician notification.
  - [ ] Log each anomaly detection to the AI Provenance Trail (Story 53.6):
    ```typescript
    {
      modelVersion: 'rule-engine-v1.0.0',
      modelHash: null,  // not an ML model
      inputDescription: 'CBC result set, 7 numeric values',  // no PHI
      aiOutput: 'Flagged: ANOM-HEMO-001 (combination pattern)',
      confidenceScore: 0.85,
      techDecision: null,     // filled by 53.6 when tech acts
      physicianConfirmation: null,  // filled when physician reviews
      timestamp: hlcTimestamp
    }
    ```
  - [ ] Audit event via `reportAnomalyDetection()` in audit-client.ts.

- [ ] **Task 8: Tests** (AC: 11)
  - [ ] Unit tests for `detectAnomalies()`: single pattern match, multiple simultaneous matches, no match, delta detection with prior results, delta skipped when no prior.
  - [ ] Unit tests for confidence level assignment and severity sorting.
  - [ ] PHI guard tests: verify that `AnomalyFlag` output contains no patient identifiers, no raw result values (only field codes and rule IDs).
  - [ ] Integration test: result entry -> anomaly detection -> notification creation -> provenance logging.

## Dev Notes

- **CLAUDE.md safety rule: "All AI-generated clinical content requires a physician confirmation gate."** The anomaly flag is NEVER auto-committed to the patient record. It creates a notification for physician review. The physician must explicitly acknowledge or dismiss the flag.
- **NEVER name a diagnosis.** Flag descriptions say "Combination of elevated LDH, low haptoglobin, and elevated indirect bilirubin detected" — never "Hemolytic anemia detected." The disclaimer "Statistical pattern flag — not a diagnosis. Clinical correlation required." is mandatory on every flag.
- **Rule-based, not ML.** The anomaly engine uses deterministic threshold rules, not machine learning models. This ensures: (1) transparency — every flag can be traced to a specific rule, (2) offline capability — no model inference required, (3) auditability — rules are versioned and reviewable. The `modelVersion` in provenance is `rule-engine-v1.0.0` to distinguish from future ML-based anomaly detection.
- **Confidence Inversion Principle (Story 53.5):** This is a cross-cutting concern. The `AnomalyFlagDisplay` component must implement the inverted UI treatment. When 53.5 is implemented as a shared utility, this component should adopt it. Until then, the inversion logic is inline.
- **PHI isolation:** The anomaly engine receives `Record<string, number | null>` — structured numeric values only. Patient identifiers are stripped before invocation. The prior result lookup uses `patientId` for the Dexie query but does NOT pass it to the anomaly engine.
- **Delta detection requires prior results in Dexie.** If the patient has no prior results cached locally, delta rules are silently skipped — no "delta check unavailable" warning (unlike drug interaction checks, delta checks are supplementary, not safety-critical).
- **Extensibility:** New rules are added by appending to the `ANOMALY_RULES` array in `anomaly-rules.ts`. No core engine changes required. Rules can be versioned independently.

### References

- Epic 53 definition: `_bmad-output/planning-artifacts/epics.md` (Story 53.3)
- Confidence Inversion Principle: Story 53.5
- AI Provenance Trail: Story 53.6
- Result template data model: Story 42.4
- Notification system: `apps/lab-lite/src/components/notifications/`
- Audit client: `apps/lab-lite/src/lib/audit-client.ts`
- CLAUDE.md: "All AI-generated clinical content requires a physician confirmation gate"
- CLAUDE.md: "Drug interaction checks must never be skipped silently" (analogous pattern for AI flags)
