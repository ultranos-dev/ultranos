/**
 * Prior Result Lookup — Story 53.3: AI Anomaly Flagging (Task 4)
 *
 * Fetches the most recent completed result for the same patient+template
 * from the local Dexie cache. Used by the anomaly engine for delta detection.
 *
 * PHI guard:
 * - `patientId` is used only for the Dexie query (opaque UUID — no name/DOB).
 * - It is NOT passed to the anomaly engine; only numeric field values are returned.
 * - Returns null when no prior result exists — delta rules are silently skipped.
 */

import { getDb } from './db'

/**
 * Return numeric field values from the most recent completed result for the
 * given patient and template, or null if no prior result is found in cache.
 *
 * @param patientRef - Opaque patient reference (e.g. "Patient/uuid"). NOT passed to anomaly engine.
 * @param loincCode  - Panel-level LOINC code identifying the template.
 * @returns Map of fieldCode → numeric value, or null.
 */
export async function getPriorResult(
  patientRef: string,
  loincCode: string,
): Promise<Record<string, number | null> | null> {
  const db = getDb()

  // Find completed results for this patient + template
  const completed = await db.lab_results
    .where('patientRef')
    .equals(patientRef)
    .filter((r) => r.status === 'completed' && r.loincCode === loincCode)
    .toArray()

  if (completed.length === 0) return null

  // Take the most recent by enteredAt — pure lexicographic comparison (locale-independent).
  // ISO 8601 strings sort correctly with plain comparison regardless of locale.
  const mostRecent = completed.sort((a, b) =>
    b.enteredAt < a.enteredAt ? -1 : 1,
  )[0]

  // Fetch observations for this result
  const observations = await db.lab_observations
    .where('resultId')
    .equals(mostRecent.id)
    .toArray()

  if (observations.length === 0) return null

  // Extract numeric values only (no PHI — fieldCode is template code, value is numeric)
  const values: Record<string, number | null> = {}
  for (const obs of observations) {
    values[obs.fieldCode] = typeof obs.value === 'number' ? obs.value : null
  }

  return values
}
