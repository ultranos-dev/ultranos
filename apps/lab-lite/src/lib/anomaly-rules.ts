/**
 * Anomaly Pattern Rule Model — Story 53.3: AI Anomaly Flagging
 *
 * Defines the type system for rule-based statistical anomaly detection in
 * structured lab result data. Rules are deterministic and offline-capable
 * (no ML inference, no network dependency).
 *
 * CLAUDE.md safety rules:
 * - The AI NEVER names a diagnosis. Descriptions use pattern language only.
 * - All AI-generated content requires a physician confirmation gate (AC: 4, 5).
 * - PHI guard: rules operate on numeric field codes only — no patient identifiers.
 *
 * Extensibility: new rules are appended to ANOMALY_RULES. No core engine changes.
 */

import { ConfidenceLevel } from './confidence'

export type { ConfidenceLevel }

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export type AnomalyConditionType =
  | 'value_threshold'
  | 'value_combination'
  | 'delta_change'

export type AnomalyOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'between'

export type AnomalySeverity = 'urgent' | 'elevated' | 'notable'

export interface AnomalyCondition {
  type: AnomalyConditionType
  fieldCode: string                        // template-internal code (e.g. 'wbc', 'ldh')
  operator: AnomalyOperator
  value?: number                           // for gt/lt/gte/lte operators
  valueRange?: { min: number; max: number } // for 'between' operator
  deltaPercent?: number                    // for delta_change: % change threshold (0–100)
  deltaDirection?: 'increase' | 'decrease' | 'either' // for delta_change
}

export interface AnomalyRule {
  id: string                  // unique rule ID (e.g. 'ANOM-HEMO-001')
  name: string                // human-readable name (no PHI)
  descriptionKey: string      // i18n key under anomalyFlags namespace
  type: 'combination' | 'delta' | 'extreme'
  applicableTemplates: string[]  // panel-level LOINC codes this rule applies to
  conditions: AnomalyCondition[] // ALL conditions must match (AND logic)
  confidence: ConfidenceLevel
  severity: AnomalySeverity
}

// ---------------------------------------------------------------------------
// Seed anomaly rules
// ---------------------------------------------------------------------------

export const ANOMALY_RULES: AnomalyRule[] = [
  // -------------------------------------------------------------------------
  // Combination rules — dangerous multi-analyte patterns
  // -------------------------------------------------------------------------

  {
    id: 'ANOM-HEMO-001',
    name: 'Hemolytic pattern — LDH/Haptoglobin/Bilirubin combination',
    descriptionKey: 'anomalyFlags.patterns.hemo001',
    type: 'combination',
    applicableTemplates: ['58410-2', '89398-0'],  // CBC, LFT panel
    confidence: ConfidenceLevel.MEDIUM,
    severity: 'urgent',
    conditions: [
      { type: 'value_threshold', fieldCode: 'ldh',            operator: 'gt',  value: 250 },
      { type: 'value_threshold', fieldCode: 'haptoglobin',    operator: 'lt',  value: 30 },
      { type: 'value_threshold', fieldCode: 'indirect_bili',  operator: 'gt',  value: 1.2 },
    ],
  },

  {
    id: 'ANOM-DIC-001',
    name: 'DIC pattern — platelets/PT/D-dimer/fibrinogen',
    descriptionKey: 'anomalyFlags.patterns.dic001',
    type: 'combination',
    applicableTemplates: ['58410-2', '34534-8'],  // CBC, coagulation panel
    confidence: ConfidenceLevel.MEDIUM,
    severity: 'urgent',
    conditions: [
      { type: 'value_threshold', fieldCode: 'platelets',  operator: 'lt',  value: 100 },
      { type: 'value_threshold', fieldCode: 'pt',         operator: 'gt',  value: 15 },
      { type: 'value_threshold', fieldCode: 'd_dimer',    operator: 'gt',  value: 2.0 },
      { type: 'value_threshold', fieldCode: 'fibrinogen', operator: 'lt',  value: 150 },
    ],
  },

  {
    id: 'ANOM-PANCY-001',
    name: 'Pancytopenia — simultaneous low WBC/RBC/platelets',
    descriptionKey: 'anomalyFlags.patterns.pancy001',
    type: 'combination',
    applicableTemplates: ['58410-2'],  // CBC
    confidence: ConfidenceLevel.HIGH,
    severity: 'urgent',
    conditions: [
      { type: 'value_threshold', fieldCode: 'wbc',      operator: 'lt', value: 4.0 },
      { type: 'value_threshold', fieldCode: 'rbc',      operator: 'lt', value: 3.5 },
      { type: 'value_threshold', fieldCode: 'platelets', operator: 'lt', value: 100 },
    ],
  },

  {
    id: 'ANOM-TLS-001',
    name: 'Tumor lysis pattern — K/Phosphate/Uric acid/Calcium combination',
    descriptionKey: 'anomalyFlags.patterns.tls001',
    type: 'combination',
    applicableTemplates: ['24323-8', '89398-0'],  // CMP, metabolic panel
    confidence: ConfidenceLevel.MEDIUM,
    severity: 'urgent',
    conditions: [
      { type: 'value_threshold', fieldCode: 'potassium',   operator: 'gt', value: 5.5 },
      { type: 'value_threshold', fieldCode: 'phosphate',   operator: 'gt', value: 5.0 },
      { type: 'value_threshold', fieldCode: 'uric_acid',   operator: 'gt', value: 8.0 },
      { type: 'value_threshold', fieldCode: 'calcium',     operator: 'lt', value: 8.0 },
    ],
  },

  // -------------------------------------------------------------------------
  // Delta rules — significant changes from prior result
  // -------------------------------------------------------------------------

  {
    id: 'ANOM-DELTA-HGB-001',
    name: 'Hemoglobin acute drop from prior (>3 g/dL)',
    descriptionKey: 'anomalyFlags.patterns.deltaHgb001',
    type: 'delta',
    applicableTemplates: ['58410-2'],  // CBC
    confidence: ConfidenceLevel.HIGH,
    severity: 'urgent',
    conditions: [
      {
        type: 'delta_change',
        fieldCode: 'hgb',
        operator: 'gt',
        deltaPercent: 0,           // absolute threshold — engine checks absolute value
        deltaDirection: 'decrease',
        value: 3,                  // absolute drop in g/dL
      },
    ],
  },

  {
    id: 'ANOM-DELTA-PLT-001',
    name: 'Platelet >50% drop from prior result',
    descriptionKey: 'anomalyFlags.patterns.deltaPlt001',
    type: 'delta',
    applicableTemplates: ['58410-2'],  // CBC
    confidence: ConfidenceLevel.HIGH,
    severity: 'urgent',
    conditions: [
      {
        type: 'delta_change',
        fieldCode: 'platelets',
        operator: 'gt',
        deltaPercent: 50,
        deltaDirection: 'decrease',
      },
    ],
  },

  {
    id: 'ANOM-DELTA-CREAT-001',
    name: 'Creatinine >50% increase from prior result',
    descriptionKey: 'anomalyFlags.patterns.deltaCr001',
    type: 'delta',
    applicableTemplates: ['24323-8', '58410-2'],  // CMP, CBC
    confidence: ConfidenceLevel.MEDIUM,
    severity: 'elevated',
    conditions: [
      {
        type: 'delta_change',
        fieldCode: 'creatinine',
        operator: 'gt',
        deltaPercent: 50,
        deltaDirection: 'increase',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Extreme value rules — life-threatening single-value thresholds
  // -------------------------------------------------------------------------

  {
    id: 'ANOM-EXTREME-WBC-001',
    name: 'Extreme leukocytosis (WBC >100,000 ×10³/µL)',
    descriptionKey: 'anomalyFlags.patterns.extremeWbc001',
    type: 'extreme',
    applicableTemplates: ['58410-2'],
    confidence: ConfidenceLevel.HIGH,
    severity: 'urgent',
    conditions: [
      { type: 'value_threshold', fieldCode: 'wbc', operator: 'gt', value: 100 },
    ],
  },

  {
    id: 'ANOM-EXTREME-K-001',
    name: 'Severe hyperkalemia (K⁺ >7.0 mEq/L)',
    descriptionKey: 'anomalyFlags.patterns.extremeK001',
    type: 'extreme',
    applicableTemplates: ['24323-8', '58410-2'],
    confidence: ConfidenceLevel.HIGH,
    severity: 'urgent',
    conditions: [
      { type: 'value_threshold', fieldCode: 'potassium', operator: 'gt', value: 7.0 },
    ],
  },
]
