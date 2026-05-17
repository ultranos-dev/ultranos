/**
 * Tier 1 conflict check utility for prescription blocking.
 *
 * Queries the syncQueue for unresolved Tier 1 conflicts
 * (AllergyIntolerance, MedicationRequest, Condition) filtered
 * by patient reference. Used by encounter-dashboard to block
 * prescription generation per CLAUDE.md Rule #5.
 */

import { db } from './db'
import { TIER_1_RESOURCE_TYPES } from './conflict-resolution'

/**
 * Check if a patient has unresolved Tier 1 conflicts that block prescriptions.
 *
 * Returns true if any syncQueue entry matches:
 * - conflictFlag === true
 * - status is not 'resolved'
 * - resourceType is a Tier 1 type
 * - patientRef matches the given patient ID
 */
export async function hasUnresolvedTier1Conflicts(
  patientId: string,
): Promise<boolean> {
  const patientRef = `Patient/${patientId}`
  const all = await db.syncQueue.toArray()

  return all.some(
    (entry) =>
      entry.patientRef === patientRef &&
      entry.conflictFlag === true &&
      entry.status !== 'resolved' &&
      (TIER_1_RESOURCE_TYPES as readonly string[]).includes(entry.resourceType),
  )
}

/**
 * Get the count of unresolved Tier 1 conflicts for a patient.
 */
export async function getUnresolvedTier1ConflictCount(
  patientId: string,
): Promise<number> {
  const patientRef = `Patient/${patientId}`
  const all = await db.syncQueue.toArray()

  return all.filter(
    (entry) =>
      entry.patientRef === patientRef &&
      entry.conflictFlag === true &&
      entry.status !== 'resolved' &&
      (TIER_1_RESOURCE_TYPES as readonly string[]).includes(entry.resourceType),
  ).length
}
