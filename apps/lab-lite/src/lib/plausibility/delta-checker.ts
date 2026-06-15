/**
 * Delta Check Engine
 * Story 43.5 — Task 3
 *
 * Detects physiologically suspicious changes between consecutive results
 * for the same analyte on the same patient.
 *
 * A delta flag fires when EITHER maxDeltaPercent OR maxDeltaAbsolute is exceeded
 * within timeWindowHours of the previous result.
 *
 * Lab-manager overrides in plausibilityConfig table take precedence over defaults.
 * All computation reads only from Dexie — zero network calls.
 */

import { db } from '@/lib/db'
import { DEFAULT_DELTA_THRESHOLDS } from './delta-thresholds'
import type { PlausibilityFlag } from './types'

/**
 * Check whether the current value represents a suspicious delta from the most
 * recent prior result for the same patient + analyte.
 *
 * @param patientRef   FHIR Patient reference, e.g. "Patient/<uuid>"
 * @param loincCode    LOINC code for the analyte
 * @param currentValue Numeric result value in canonical unit
 * @param enteredAt    ISO 8601 instant when this result was entered (used as cutoff)
 * @returns PlausibilityFlag (WARNING severity) if delta exceeded, null otherwise
 */
export async function checkDelta(
  patientRef: string,
  loincCode: string,
  currentValue: number,
  enteredAt: string,
): Promise<PlausibilityFlag | null> {
  // Resolve threshold: lab-manager override takes precedence over defaults
  const override = await db.getPlausibilityConfig(loincCode)
  const defaults = DEFAULT_DELTA_THRESHOLDS[loincCode]

  if (!defaults && !override) return null  // No threshold defined for this analyte

  const maxDeltaPercent = override?.maxDeltaPercent ?? defaults?.maxDeltaPercent
  const maxDeltaAbsolute = override?.maxDeltaAbsolute ?? defaults?.maxDeltaAbsolute
  const timeWindowHours = override?.timeWindowHours ?? defaults?.timeWindowHours
  const analyteName = override?.analyteName ?? defaults?.analyteName ?? loincCode

  if (maxDeltaPercent === undefined && maxDeltaAbsolute === undefined) return null
  if (timeWindowHours === undefined) return null

  // Find most recent prior snapshot within the time window
  const prior = await db.getMostRecentSnapshot(patientRef, loincCode, enteredAt)
  if (!prior) return null  // No prior result — nothing to delta-check against

  // Verify the prior result is within the configured time window
  const priorTime = new Date(prior.enteredAt).getTime()
  const currentTime = new Date(enteredAt).getTime()
  const hoursElapsed = (currentTime - priorTime) / (1000 * 60 * 60)

  if (hoursElapsed > timeWindowHours) return null  // Outside time window

  const priorValue = prior.value
  if (priorValue === 0) return null  // Avoid division by zero

  const absoluteDelta = Math.abs(currentValue - priorValue)
  const percentDelta = (absoluteDelta / Math.abs(priorValue)) * 100

  const exceededPercent = maxDeltaPercent !== undefined && percentDelta > maxDeltaPercent
  const exceededAbsolute = maxDeltaAbsolute !== undefined && absoluteDelta > maxDeltaAbsolute

  if (!exceededPercent && !exceededAbsolute) return null

  const parts: string[] = []
  if (exceededPercent && maxDeltaPercent !== undefined) {
    parts.push(`${percentDelta.toFixed(1)}% change exceeds ${maxDeltaPercent}% threshold`)
  }
  if (exceededAbsolute && maxDeltaAbsolute !== undefined) {
    parts.push(`absolute change of ${absoluteDelta.toFixed(2)} exceeds ${maxDeltaAbsolute} threshold`)
  }

  return {
    id: `delta-${loincCode}-${Date.now()}`,
    ruleType: 'DELTA_CHECK',
    analyte: analyteName,
    loincCode,
    severity: 'WARNING',
    message: `${analyteName} delta check: ${parts.join('; ')} (prior: ${priorValue}, current: ${currentValue}, ${hoursElapsed.toFixed(1)}h elapsed)`,
    currentValue,
    referenceValue: priorValue,
    referenceDate: prior.enteredAt,
    threshold: exceededPercent ? maxDeltaPercent : maxDeltaAbsolute,
    acknowledged: false,
  }
}
