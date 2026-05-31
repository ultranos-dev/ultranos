/**
 * Plausibility Checker — Orchestrator
 * Story 43.5 — Task 5
 *
 * Entry point for the full plausibility pipeline.
 * Runs all three check types in parallel (absolute range, delta, consistency)
 * and returns a deduplicated, severity-sorted list of flags.
 *
 * CRITICAL flags indicate values that must be acknowledged before a result
 * can proceed to authorization.
 *
 * All checks are offline-capable. Delta checks read from Dexie (ResultSnapshot
 * table); all other checks are pure computation.
 */

import { checkAbsoluteRange } from './absolute-range-checker'
import { checkDelta } from './delta-checker'
import { checkConsistency } from './consistency-checker'
import type { PlausibilityFlag, ResultEntry } from './types'

/**
 * Run all plausibility checks for a result set.
 *
 * @param patientRef  FHIR Patient reference, e.g. "Patient/<uuid>"
 * @param results     Array of analyte entries in the result set
 * @param enteredAt   ISO 8601 instant when the results were entered
 * @returns Sorted array of PlausibilityFlag (CRITICAL first, then WARNING)
 */
export async function runPlausibilityChecks(
  patientRef: string,
  results: ResultEntry[],
  enteredAt: string = new Date().toISOString(),
): Promise<PlausibilityFlag[]> {
  const flags: PlausibilityFlag[] = []

  // Build value map for consistency checker (loincCode → value)
  const valueMap: Record<string, number> = {}
  for (const entry of results) {
    valueMap[entry.loincCode] = entry.value
  }

  // Run absolute range checks (synchronous) + delta checks (async) in parallel
  const deltaPromises = results.map((entry) =>
    checkDelta(patientRef, entry.loincCode, entry.value, enteredAt),
  )

  const [deltaResults] = await Promise.all([Promise.all(deltaPromises)])

  // Collect absolute range flags
  for (const entry of results) {
    const flag = checkAbsoluteRange(entry.loincCode, entry.value)
    if (flag) flags.push(flag)
  }

  // Collect delta flags
  for (const flag of deltaResults) {
    if (flag) flags.push(flag)
  }

  // Collect consistency flags
  const consistencyFlags = checkConsistency(valueMap)
  flags.push(...consistencyFlags)

  // Sort: CRITICAL first, then WARNING; stable within each group
  flags.sort((a, b) => {
    if (a.severity === b.severity) return 0
    return a.severity === 'CRITICAL' ? -1 : 1
  })

  return flags
}

/**
 * Convenience helper — returns true if any CRITICAL flags are present.
 * CRITICAL flags block result release until acknowledged.
 */
export function hasCriticalFlags(flags: PlausibilityFlag[]): boolean {
  return flags.some((f) => f.severity === 'CRITICAL' && !f.acknowledged)
}
