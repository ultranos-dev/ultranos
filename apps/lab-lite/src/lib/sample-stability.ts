/**
 * Sample stability windows and helpers.
 *
 * Based on standard clinical laboratory guidelines (WHO, CLSI).
 * All windows are in minutes from sample receipt/collection.
 * Used by the prioritization engine for urgency scoring.
 *
 * CLAUDE.md Rule #1: No PHI in this module — purely scientific constants.
 */

/**
 * Maps LOINC code → maximum stability window in minutes.
 * Source: WHO laboratory quality management system guidance + CLSI standards.
 */
export const SAMPLE_STABILITY_MAP: Record<string, number> = {
  '82803-4': 30,    // Blood Gas (arterial) — ice transport, immediate analysis
  '630-4': 120,     // Urine Culture — bacterial overgrowth if delayed
  '58410-2': 360,   // CBC (EDTA whole blood) — platelet clumping after 6hr
  '57698-3': 480,   // Lipid Panel (serum) — stable when separated
  '4548-4': 1440,   // HbA1c (EDTA) — very stable
  '51990-0': 240,   // Basic Metabolic Panel (serum) — glucose/potassium drift
  '24325-3': 480,   // Liver Function Tests (serum) — bilirubin is light-sensitive
  '3016-3': 480,    // TSH (serum) — stable at room temp
  '24356-8': 120,   // Urinalysis — crystal/cell degradation
  '1558-6': 240,    // Fasting Blood Glucose (fluoride) — glycolysis continues
  '5902-2': 240,    // Coagulation / PT-INR (citrate) — must centrifuge within 1hr
  '4537-7': 240,    // ESR (EDTA) — must be at room temp
  '600-7': 120,     // Blood Culture — must reach incubator quickly
  '49581-7': 30,    // CSF Analysis — cell count degrades rapidly
}

/** Default stability window for LOINC codes not in the map (8 hours). */
export const DEFAULT_STABILITY_MINUTES = 480

/**
 * Returns the stability window in minutes for a given LOINC code.
 * Falls back to DEFAULT_STABILITY_MINUTES for unknown tests.
 */
export function getStabilityWindowMinutes(loincCode: string): number {
  return SAMPLE_STABILITY_MAP[loincCode] ?? DEFAULT_STABILITY_MINUTES
}

export type StabilityStatus = 'safe' | 'warning' | 'critical' | 'expired'

export interface StabilityInfo {
  status: StabilityStatus
  remainingMinutes: number
}

/**
 * Compute stability status given when the sample was received and its window.
 *
 * Thresholds:
 *   expired  — remainingMinutes <= 0
 *   critical — remainingMinutes <= 15 (pulsing red badge)
 *   warning  — remainingMinutes <= 60 (amber badge)
 *   safe     — remainingMinutes > 60  (green badge)
 */
export function getStabilityStatus(
  receivedAt: string,
  stabilityMinutes: number,
): StabilityInfo {
  const elapsed = (Date.now() - new Date(receivedAt).getTime()) / 60_000
  const remaining = Math.max(0, stabilityMinutes - elapsed)

  if (remaining <= 0) return { status: 'expired', remainingMinutes: 0 }
  if (remaining <= 15) return { status: 'critical', remainingMinutes: Math.ceil(remaining) }
  if (remaining <= 60) return { status: 'warning', remainingMinutes: Math.ceil(remaining) }
  return { status: 'safe', remainingMinutes: Math.ceil(remaining) }
}
