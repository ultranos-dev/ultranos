/**
 * Conflict resolution handler for Tier 1 conflicts.
 *
 * Applies clinician-chosen resolution to conflicting syncQueue entries.
 * Supports three strategies: keep-both (append-only), prefer-local, prefer-remote.
 * All resolutions are audit-logged and enqueued for Hub sync.
 *
 * Runs entirely offline — resolution updates local Dexie state.
 */

import { db, type SyncQueueEntry } from './db'
import { auditPhiAccess, AuditAction, AuditResourceType } from './audit'

/** Tier 1 resource types that require append-only merge by default. */
export const TIER_1_RESOURCE_TYPES = [
  'AllergyIntolerance',
  'MedicationRequest',
  'Condition',
] as const

export type ResolutionType = 'keep-both' | 'prefer-local' | 'prefer-remote'

export interface ConflictResolutionInput {
  entryId: string
  resolutionType: ResolutionType
  practitionerRef: string
}

export interface ConflictResolutionResult {
  success: boolean
  entryId: string
  resolutionType: ResolutionType
}

/**
 * Check whether a resource type is Tier 1 (safety-critical).
 */
export function isTier1Resource(resourceType: string): boolean {
  return (TIER_1_RESOURCE_TYPES as readonly string[]).includes(resourceType)
}

/**
 * Check whether a conflict is overdue (older than 24 hours).
 */
export function isConflictOverdue(createdAt: string): boolean {
  const ageMs = Date.now() - new Date(createdAt).getTime()
  return ageMs > 24 * 60 * 60 * 1000
}

/**
 * Get all Tier 1 conflicts from the sync queue.
 */
export async function getTier1Conflicts(): Promise<SyncQueueEntry[]> {
  const all = await db.syncQueue.toArray()
  return all.filter(
    (entry) =>
      entry.conflictFlag === true &&
      entry.status !== 'resolved' &&
      isTier1Resource(entry.resourceType),
  )
}

/**
 * Resolve a conflict with the clinician's chosen strategy.
 *
 * - keep-both: Append-only — both local and remote versions remain in the record.
 *   The remote version (from conflictData) is stored as a new entry in the
 *   relevant clinical table. The original local entry is preserved.
 *
 * - prefer-local: Keep the local version, discard the remote version.
 *   Only the syncQueue status is updated.
 *
 * - prefer-remote: Replace the local version with the remote version.
 *   Updates the relevant clinical table with the remote data.
 *
 * All resolutions emit an audit event and enqueue a sync action.
 */
export async function resolveConflict(
  input: ConflictResolutionInput,
): Promise<ConflictResolutionResult> {
  const { entryId, resolutionType, practitionerRef } = input

  if (!practitionerRef) {
    return { success: false, entryId, resolutionType }
  }

  const entry = await db.syncQueue.get(entryId)
  if (!entry) {
    return { success: false, entryId, resolutionType }
  }

  if (!entry.conflictFlag || entry.status === 'resolved') {
    return { success: false, entryId, resolutionType }
  }

  // Guard: keep-both and prefer-remote require conflictData
  if (resolutionType !== 'prefer-local' && !entry.conflictData) {
    return { success: false, entryId, resolutionType }
  }

  const now = new Date().toISOString()

  // Wrap all mutations in a Dexie transaction to prevent partial writes
  await db.transaction(
    'rw',
    [db.syncQueue, db.allergyIntolerances, db.medications, db.conditions],
    async () => {
      // Apply resolution strategy
      if (resolutionType === 'keep-both' && entry.conflictData) {
        await appendRemoteVersion(entry)
      } else if (resolutionType === 'prefer-remote' && entry.conflictData) {
        await replaceWithRemoteVersion(entry)
      }
      // prefer-local: no data changes needed — local is already in place.

      // Update syncQueue entry to resolved
      await db.syncQueue.update(entryId, {
        status: 'resolved' as const,
        conflictFlag: false,
        resolvedAt: now,
        resolutionType,
      })

      // Enqueue resolution for Hub sync
      await db.syncQueue.put({
        id: `conflict-resolved-${entryId}-${Date.now()}`,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        action: 'sync:conflict_resolved',
        payload: JSON.stringify({
          originalEntryId: entryId,
          resolutionType,
          resolvedAt: now,
          practitionerRef,
        }),
        status: 'pending',
        hlcTimestamp: now,
        createdAt: now,
        retryCount: 0,
        patientRef: entry.patientRef,
      })
    },
  )

  // Emit audit event outside transaction — never log PHI field values
  auditPhiAccess(
    AuditAction.UPDATE,
    entry.resourceType as AuditResourceType,
    entry.resourceId,
    entry.patientRef?.replace('Patient/', ''),
    {
      conflictResolution: resolutionType,
      originalEntryId: entryId,
      practitionerRef,
    },
  )

  return { success: true, entryId, resolutionType }
}

/**
 * Parse conflictData JSON safely. Throws on malformed data to abort the transaction.
 */
function parseConflictData(entry: SyncQueueEntry): Record<string, unknown> {
  if (!entry.conflictData) {
    throw new Error('conflictData is empty')
  }
  return JSON.parse(entry.conflictData) as Record<string, unknown>
}

/**
 * Write a FHIR resource to the appropriate clinical table by resourceType.
 */
async function writeToClinicalTable(
  resourceType: string,
  data: Record<string, unknown>,
): Promise<void> {
  switch (resourceType) {
    case 'AllergyIntolerance':
      await db.allergyIntolerances.put(data as never)
      break
    case 'MedicationRequest':
      await db.medications.put(data as never)
      break
    case 'Condition':
      await db.conditions.put(data as never)
      break
  }
}

/**
 * Append the remote version to the local clinical table (keep-both / append-only).
 */
async function appendRemoteVersion(entry: SyncQueueEntry): Promise<void> {
  const remoteData = parseConflictData(entry)

  // Always assign a fresh unique ID to prevent overwriting any existing record
  remoteData.id = `${entry.resourceId}-kept-${crypto.randomUUID()}`

  await writeToClinicalTable(entry.resourceType, remoteData)
}

/**
 * Replace the local version with the remote version (prefer-remote).
 */
async function replaceWithRemoteVersion(entry: SyncQueueEntry): Promise<void> {
  const remoteData = parseConflictData(entry)
  // Use the original resource ID so it overwrites the local version
  remoteData.id = entry.resourceId

  await writeToClinicalTable(entry.resourceType, remoteData)
}
