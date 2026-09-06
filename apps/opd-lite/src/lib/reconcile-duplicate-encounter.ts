/**
 * Reconcile a locally-created duplicate encounter that the Hub rejected.
 *
 * Primary prevention (spoke adopt + Hub resume + the DB partial unique index
 * uq_encounters_open_per_patient_practitioner) stops duplicate open encounters at
 * creation. This module handles the rare residual: a spoke that created a second
 * open encounter offline/in a separate session, whose local cache lacked the
 * still-open encounter. On push, the Hub returns DUPLICATE_OPEN_ENCOUNTER with the
 * canonical (surviving) encounter id. Left alone, the local duplicate's child data
 * (vitals, notes, prescriptions, diagnoses) would be stranded — its encounter never
 * lands on the Hub, so its children can't sync (they reference a non-existent
 * encounter).
 *
 * Reconciliation re-parents those local children onto the canonical encounter,
 * re-enqueues them (so they sync under the canonical id), drops the local duplicate
 * encounter, and clears its stuck queue entries. All local — the next pull hydrates
 * the canonical encounter itself. Opaque ids only in logs/audit (no PHI).
 */

import { db } from './db'
import { hlc } from './hlc'
import { serializeHlc, enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from './sync-queue'
import { auditPhiAccess, AuditAction, AuditResourceType } from './audit'
import { useEncounterStore } from '@/stores/encounter-store'

export interface ReconcileResult {
  reParented: number
  affectedResourceIds: string[]
}

/**
 * Child resource tables that carry a nested FHIR `encounter.reference`
 * ("Encounter/<id>"). soap_ledger is handled separately (flat `encounterId`).
 */
const REF_CHILD_TABLES = [
  { table: 'observations', resourceType: 'Observation' },
  { table: 'conditions', resourceType: 'Condition' },
  { table: 'medications', resourceType: 'MedicationRequest' },
] as const

/** Delete all non-synced sync-queue entries for a resource id (stale/failed pushes). */
async function clearStaleQueueEntries(resourceId: string): Promise<void> {
  const stale = await db.syncQueue
    .where('resourceId')
    .equals(resourceId)
    .filter((e) => e.status !== 'synced')
    .toArray()
  for (const entry of stale) {
    await db.syncQueue.delete(entry.id)
  }
}

/**
 * Re-parent local children of `dupId` onto `canonicalId`, drop the local duplicate
 * encounter, and clear/refresh the sync queue so nothing pushes the dead reference.
 * Returns the count and ids of re-parented children.
 */
export async function reconcileDuplicateEncounter(
  dupId: string,
  canonicalId: string,
): Promise<ReconcileResult> {
  const affected: string[] = []
  const dupRef = `Encounter/${dupId}`
  const canonicalRef = `Encounter/${canonicalId}`

  // 1) Nested-reference children (Observation, Condition, MedicationRequest).
  //    encounter.reference is an indexed (plaintext) field, so it is queryable and
  //    the .toArray() result is fully decrypted for re-write.
  for (const { table, resourceType } of REF_CHILD_TABLES) {
    // Heterogeneous Dexie tables collapse a union-indexed `.put` to `never`; use a
    // minimal loose handle. Records are decrypted on read and re-encrypted on put.
    const tbl = db[table] as unknown as {
      where(index: string): { equals(value: string): { toArray(): Promise<Array<Record<string, unknown>>> } }
      put(record: Record<string, unknown>): Promise<unknown>
    }
    const records = await tbl.where('encounter.reference').equals(dupRef).toArray()
    for (const rec of records) {
      const meta = (rec.meta ?? {}) as Record<string, unknown>
      const ts = serializeHlc(hlc.now())
      const updated: Record<string, unknown> = {
        ...rec,
        encounter: { ...((rec.encounter as Record<string, unknown>) ?? {}), reference: canonicalRef },
        _ultranos: { ...((rec._ultranos as Record<string, unknown>) ?? {}), hlcTimestamp: ts },
        meta: {
          ...meta,
          lastUpdated: new Date().toISOString(),
          versionId: String((parseInt((meta.versionId as string) ?? '1', 10) || 1) + 1),
        },
      }
      const recId = rec.id as string
      await tbl.put(updated)
      await clearStaleQueueEntries(recId)
      await enqueueSyncAction(syncQueue, {
        resourceType,
        resourceId: recId,
        action: 'update',
        payload: updated,
        hlcTimestamp: ts,
      })
      affected.push(recId)
    }
  }

  // 2) SOAP ledger (ClinicalImpression) — flat `encounterId`, bare id (no prefix).
  const soapEntries = await db.soapLedger.where('encounterId').equals(dupId).toArray()
  for (const rec of soapEntries) {
    const ts = serializeHlc(hlc.now())
    const updated = { ...rec, encounterId: canonicalId, hlcTimestamp: ts }
    await db.soapLedger.put(updated as unknown as Parameters<typeof db.soapLedger.put>[0])
    await clearStaleQueueEntries(rec.id)
    await enqueueSyncAction(syncQueue, {
      resourceType: 'ClinicalImpression',
      resourceId: rec.id,
      action: 'update',
      payload: updated as unknown as Record<string, unknown>,
      hlcTimestamp: ts,
    })
    affected.push(rec.id)
  }

  // 3) Drop the local duplicate encounter and clear its (stuck) queue entries.
  await db.encounters.delete(dupId)
  await clearStaleQueueEntries(dupId)

  // 4) If the store still points at the duplicate, drop it so the dashboard re-loads
  //    the canonical encounter (from cache now, or after the next pull hydrates it).
  const store = useEncounterStore.getState()
  if (store.activeEncounter?.id === dupId) {
    store.clearPhiState()
  }

  // 5) Audit — opaque ids only, never PHI content.
  auditPhiAccess(AuditAction.UPDATE, AuditResourceType.ENCOUNTER, dupId, undefined, {
    phiAccess: 'duplicate_encounter_reconciled',
    canonicalId,
    reParentedCount: affected.length,
  })

  return { reParented: affected.length, affectedResourceIds: affected }
}
