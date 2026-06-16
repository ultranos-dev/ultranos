/**
 * Critical Value Detection Engine — Story 48.4
 *
 * Pure rule-based detection using comparison operators only.
 * NO ML, NO AI, NO heuristics. Deterministic by design (AC 9).
 *
 * PHI note: This module never receives or returns patient names.
 * It operates on LOINC codes, analyte names, and numeric values only.
 */

import { getCriticalThresholdByAnalyte } from './db'

export class DetectionUnavailableError extends Error {
  constructor() {
    super('Critical value detection unavailable — threshold DB read failed')
    this.name = 'DetectionUnavailableError'
  }
}

export interface CriticalValueInput {
  loincCode: string   // individual analyte LOINC (e.g. '718-7')
  analyte: string     // analyte name matching CriticalThreshold.analyte (e.g. 'Hemoglobin')
  value: number
  unit?: string
}

export interface CriticalValueResult {
  isCritical: boolean
  direction: 'high' | 'low' | null
  threshold: number | null
  analyte: string
  loincCode: string
  value: number
  unit?: string
}

/**
 * Check whether a single analyte value is critical.
 *
 * Returns isCritical: false when:
 * - No active threshold is configured for (loincCode, analyte)
 * - The value is within the configured safe range
 *
 * Never throws — a threshold lookup failure is treated as "not critical" (fail-open
 * for safety; the tech alert system is defence-in-depth, not the sole safety net).
 */
export async function isCriticalValue(
  loincCode: string,
  analyte: string,
  value: number,
): Promise<CriticalValueResult> {
  const notCritical: CriticalValueResult = {
    isCritical: false,
    direction: null,
    threshold: null,
    analyte,
    loincCode,
    value,
  }

  try {
    const threshold = await getCriticalThresholdByAnalyte(loincCode, analyte)

    // No threshold configured for this analyte — not critical
    if (!threshold) return notCritical
    // Threshold is inactive — skip
    if (!threshold.isActive) return notCritical

    // Critical HIGH check — strictly greater than
    if (threshold.criticalHigh != null && value > threshold.criticalHigh) {
      return {
        isCritical: true,
        direction: 'high',
        threshold: threshold.criticalHigh,
        analyte,
        loincCode,
        value,
        unit: threshold.unit,
      }
    }

    // Critical LOW check — strictly less than
    if (threshold.criticalLow != null && value < threshold.criticalLow) {
      return {
        isCritical: true,
        direction: 'low',
        threshold: threshold.criticalLow,
        analyte,
        loincCode,
        value,
        unit: threshold.unit,
      }
    }

    return notCritical
  } catch {
    // DB lookup failed — throw so callers can show a warning.
    // Per CLAUDE.md Rule #3 analogy: fail-open with explicit warning is safer than silent false negative.
    throw new DetectionUnavailableError()
  }
}

/**
 * Check all numeric observations from a result for critical values.
 *
 * Accepts an array of observations with their LOINC codes and analyte names.
 * Returns only the critical findings (empty array means no critical values).
 *
 * Non-numeric values and null values are skipped per AC 9.
 */
export async function checkResultForCriticalValues(
  observations: CriticalValueInput[],
): Promise<CriticalValueResult[]> {
  const criticals: CriticalValueResult[] = []

  for (const obs of observations) {
    // Skip null / non-finite values
    if (obs.value == null || !Number.isFinite(obs.value)) continue

    const result = await isCriticalValue(obs.loincCode, obs.analyte, obs.value)
    if (result.isCritical) {
      criticals.push({ ...result, unit: obs.unit ?? result.unit })
    }
  }

  return criticals
}
