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
import { auditPhiAccess, AuditAction } from './audit'
import type { AuditResourceType } from './audit'

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
      entry.status !== 'synced' &&
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

  const clinicalWrite = prepareClinicalWrite(entry, resolutionType)

  // The clinical tables (allergyIntolerances / medications / conditions) use
  // async AES-GCM field encryption via Dexie middleware. That middleware awaits
  // Web Crypto on every put, and awaiting a non-Dexie promise inside a Dexie
  // transaction detaches the transaction zone -> PrematureCommitError
  // ("Transaction committed too early"). So the encrypted clinical write must NOT
  // run inside a Dexie transaction. Each encrypted put is atomic on its own; we
  // write it FIRST so that if the syncQueue update below fails, the conflict
  // stays flagged and is safely retried, rather than being marked resolved with
  // no data written.
  if (clinicalWrite) {
    await db[clinicalWrite.table].put(clinicalWrite.data as never)
  }

  // syncQueue is NOT encrypted, so its two mutations can share a transaction —
  // marking the conflict resolved and enqueueing the sync action are all-or-nothing.
  await db.transaction('rw', db.syncQueue, async () => {
    // Update syncQueue entry to resolved
    await db.syncQueue.update(entryId, {
      status: 'synced' as const,
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
  })

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

/** Clinical Dexie tables that hold Tier 1 resources. */
type ClinicalTable = 'allergyIntolerances' | 'medications' | 'conditions'

/** Map a FHIR resourceType to its clinical Dexie table, or null if unsupported. */
function tableForResourceType(resourceType: string): ClinicalTable | null {
  switch (resourceType) {
    case 'AllergyIntolerance':
      return 'allergyIntolerances'
    case 'MedicationRequest':
      return 'medications'
    case 'Condition':
      return 'conditions'
    default:
      return null
  }
}

/**
 * Compute the clinical-table write for the chosen resolution — SYNCHRONOUS by
 * design so it can run OUTSIDE the Dexie transaction (see resolveConflict).
 *
 * - keep-both (append-only): assign a fresh unique ID so the remote version is
 *   added alongside the local one, never overwriting it.
 * - prefer-remote: reuse the original resource ID so the local version is replaced.
 * - prefer-local (or missing conflictData/unsupported table): no write.
 */
function prepareClinicalWrite(
  entry: SyncQueueEntry,
  resolutionType: ResolutionType,
): { table: ClinicalTable; data: Record<string, unknown> } | null {
  if (resolutionType === 'prefer-local' || !entry.conflictData) {
    return null
  }

  const table = tableForResourceType(entry.resourceType)
  if (!table) {
    return null
  }

  const remoteData = parseConflictData(entry)
  remoteData.id =
    resolutionType === 'keep-both'
      ? `${entry.resourceId}-kept-${crypto.randomUUID()}` // append-only: fresh unique ID
      : entry.resourceId // prefer-remote: overwrite the local version

  return { table, data: remoteData }
}
