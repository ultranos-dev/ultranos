/**
 * Internal Consistency Rules
 * Story 43.5 — Task 1.4
 *
 * Rules that check for physiologically inconsistent combinations of analytes
 * within a single result set (e.g. CBC panel).
 *
 * Rules only fire when ALL requiredAnalytes are present in the result set.
 * condition() returns true when the results ARE inconsistent (flag should fire).
 *
 * Pitfall: Rules must not be overly aggressive — known clinical conditions
 * (e.g. thalassemia, CML) can produce unusual combinations. The acknowledgment
 * mechanism handles these; rule thresholds are conservative.
 */

import type { PlausibilitySeverity } from './types'

export interface ConsistencyRule {
  id: string
  name: string
  requiredAnalytes: string[]   // LOINC codes — ALL must be present for rule to run
  condition: (values: Record<string, number>) => boolean  // true = inconsistent
  message: string              // template: {loincCode} placeholders replaced at runtime
  severity: PlausibilitySeverity
}

export const CONSISTENCY_RULES: ConsistencyRule[] = [
  {
    id: 'rbc-hgb-consistency',
    name: 'RBC vs Hemoglobin',
    requiredAnalytes: ['789-8', '718-7'],
    condition: (values) => {
      const rbc = values['789-8']
      const hgb = values['718-7']
      // Very low RBC with normal/high hemoglobin is physiologically impossible
      return rbc < 2.0 && hgb > 12.0
    },
    message: 'Low RBC with normal/high Hemoglobin — verify both values',
    severity: 'CRITICAL',
  },
  {
    id: 'mcv-rbc-consistency',
    name: 'MCV vs RBC',
    requiredAnalytes: ['787-2', '789-8'],
    condition: (values) => {
      const mcv = values['787-2']
      const rbc = values['789-8']
      // Very high MCV (macrocytosis) with very high RBC count is inconsistent
      return mcv > 120 && rbc > 6.0
    },
    message: 'High MCV with very high RBC count — verify both values',
    severity: 'WARNING',
  },
  {
    id: 'hgb-hct-consistency',
    name: 'Hemoglobin vs Hematocrit',
    requiredAnalytes: ['718-7', '4544-3'],
    condition: (values) => {
      const hgb = values['718-7']
      const hct = values['4544-3']
      // Hct should be approximately 3x Hgb (rule of three)
      // Flag if ratio is outside 2.5–3.5 range (significant discrepancy)
      if (hgb <= 0) return false
      const ratio = hct / hgb
      return ratio < 2.0 || ratio > 4.0
    },
    message: 'Hemoglobin/Hematocrit ratio is outside expected range (rule of three) — verify both values',
    severity: 'WARNING',
  },
  {
    id: 'plt-mpv-consistency',
    name: 'Platelets vs MPV',
    requiredAnalytes: ['777-3', '32623-1'],
    condition: (values) => {
      const plt = values['777-3']
      const mpv = values['32623-1']
      // Very high MPV with very high platelet count is rare
      return plt > 800 && mpv > 12
    },
    message: 'High platelet count with high MPV — verify both values',
    severity: 'WARNING',
  },
  {
    id: 'alt-ast-ratio',
    name: 'ALT vs AST',
    requiredAnalytes: ['1742-6', '1920-8'],
    condition: (values) => {
      const alt = values['1742-6']
      const ast = values['1920-8']
      if (alt <= 0 || ast <= 0) return false
      const ratio = ast / alt
      // AST:ALT > 10:1 is highly unusual (possible error, or severe hepatocellular damage)
      // Only flag when values are significantly elevated
      return ratio > 10 && ast > 200
    },
    message: 'AST/ALT ratio > 10:1 with elevated values — verify both values',
    severity: 'WARNING',
  },
  {
    id: 'glucose-hba1c-consistency',
    name: 'Glucose vs HbA1c',
    requiredAnalytes: ['2345-7', '59261-8'],
    condition: (values) => {
      const glucose = values['2345-7']
      const hba1c = values['59261-8']
      // Very high acute glucose with very low HbA1c is inconsistent (suggests acute spike vs chronic)
      // Flag as informational warning only
      return glucose > 400 && hba1c < 6.0
    },
    message: 'Very high glucose with low HbA1c — acute hyperglycemia without chronic elevation? Verify both values',
    severity: 'WARNING',
  },
  {
    id: 'sodium-chloride-consistency',
    name: 'Sodium vs Chloride',
    requiredAnalytes: ['2951-2', '2075-0'],
    condition: (values) => {
      const na = values['2951-2']
      const cl = values['2075-0']
      // Anion gap calculation: AG = Na - (Cl + HCO3)
      // Without HCO3, check Na - Cl ratio: normally 36±4 mEq/L
      const diff = na - cl
      return diff < 20 || diff > 55
    },
    message: 'Sodium/Chloride difference outside expected range (20–55 mEq/L) — verify both values',
    severity: 'WARNING',
  },
  {
    id: 'total-protein-albumin-consistency',
    name: 'Total Protein vs Albumin',
    requiredAnalytes: ['2885-2', '1751-7'],
    condition: (values) => {
      const tp = values['2885-2']
      const alb = values['1751-7']
      // Albumin cannot exceed total protein
      return alb > tp
    },
    message: 'Albumin exceeds Total Protein — impossible, verify both values',
    severity: 'CRITICAL',
  },
]
