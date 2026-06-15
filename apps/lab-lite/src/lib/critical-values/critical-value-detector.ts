/**
 * Story 43.7 — Critical Value Detector for Pre-Release Checklist
 *
 * Bridges the authorization workflow (Story 42.5) with the critical value
 * checklist gate. Derives critical findings from LL/HH abnormality flags
 * when actual numeric observation values are not available at authorization time.
 *
 * All computation is offline — reads thresholds from Dexie (with fallback to
 * in-memory defaults). No network dependency.
 *
 * PHI: This module never receives or returns patient names/IDs. It operates
 * on LOINC codes, analyte names, and clinical thresholds only.
 */

import { getCriticalThresholdByAnalyte } from '../db'
import { DEFAULT_CRITICAL_THRESHOLDS } from './default-thresholds'
import type { CriticalValueMatch, CriticalValueThreshold } from './types'
import type { AbnormalityFlag } from '../../types/authorization'

export interface ResultObservation {
  loincCode: string
  analyte: string
  abnormalityFlags: AbnormalityFlag[]
}

/**
 * Detect critical values from a set of result observations.
 *
 * Uses DB-configured thresholds (lab overrides take precedence),
 * falling back to in-memory defaults when DB has no entry.
 *
 * Critical is defined as having an LL (critical low) or HH (critical high) flag.
 * Returns an empty array when no critical values are detected.
 *
 * Never throws — threshold lookup failures are treated as "not critical" (fail-open
 * per CLAUDE.md: the checklist system is defence-in-depth).
 */
export async function detectCriticalValues(
  observations: ResultObservation[],
): Promise<CriticalValueMatch[]> {
  const matches: CriticalValueMatch[] = []

  for (const obs of observations) {
    const hasLL = obs.abnormalityFlags.includes('LL')
    const hasHH = obs.abnormalityFlags.includes('HH')

    if (!hasLL && !hasHH) continue

    const threshold = await resolveThreshold(obs.loincCode, obs.analyte)
    if (!threshold || !threshold.isActive) continue

    if (hasLL && threshold.criticalLow != null) {
      matches.push({
        loincCode: obs.loincCode,
        analyte: threshold.analyte,
        direction: 'LOW',
        threshold: threshold.criticalLow,
        unit: threshold.unit,
      })
    }

    if (hasHH && threshold.criticalHigh != null) {
      matches.push({
        loincCode: obs.loincCode,
        analyte: threshold.analyte,
        direction: 'HIGH',
        threshold: threshold.criticalHigh,
        unit: threshold.unit,
      })
    }
  }

  return matches
}

/**
 * Resolve threshold for a given analyte, preferring DB-stored (lab override)
 * over in-memory defaults (AC: #1 — lab-specific overrides first).
 */
async function resolveThreshold(
  loincCode: string,
  analyte: string,
): Promise<CriticalValueThreshold | undefined> {
  try {
    const dbThreshold = await getCriticalThresholdByAnalyte(loincCode, analyte)
    if (dbThreshold) return dbThreshold
  } catch {
    // DB lookup failed — fall through to in-memory defaults
  }

  // Fall back to in-memory defaults
  const defaultThreshold = DEFAULT_CRITICAL_THRESHOLDS.find(
    (t) => t.loincCode === loincCode || t.analyte === analyte,
  )
  if (!defaultThreshold) return undefined

  // Wrap as CriticalValueThreshold (no id for in-memory defaults)
  return defaultThreshold as CriticalValueThreshold
}

/**
 * Build a single ResultObservation from a LabResultForAuthorization-shaped object.
 * Used by the authorization gate (Task 7) to feed into detectCriticalValues.
 */
export function buildObservationFromResult(result: {
  loincCode: string
  testCategory: string
  abnormalityFlags: AbnormalityFlag[]
}): ResultObservation {
  return {
    loincCode: result.loincCode,
    analyte: result.testCategory,
    abnormalityFlags: result.abnormalityFlags,
  }
}
