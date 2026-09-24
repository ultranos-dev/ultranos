/**
 * Reconcile a locally-created provisional patient onto its Hub id (Story 60.3).
 *
 * When a patient is registered offline, the spoke mints a provisional
 * `crypto.randomUUID()` id and every clinical record created before the sync
 * drains (encounters, vitals, diagnoses, prescriptions, lab orders, allergies,
 * lab results) references that provisional id via a FHIR reference
 * ("Patient/<provisional>"). On drain the Hub's `patient.syncCreate` mints the
 * authoritative id (it runs the atomic patient+consent RPC and fires async MPI
 * scoring → duplicate_reviews). Left alone, the local records would reference a
 * patient id the Hub does not know, so they could never sync.
 *
 * Reconciliation re-keys the local patient row to the Hub id, re-points every
 * locally-linked record at the Hub id, re-enqueues the moved records so they
 * sync under the Hub id, records the provisional→Hub mapping, and clears the
 * patient's own (now-drained) create queue entries. All local — the next pull
 * hydrates the canonical patient row from the Hub. Opaque ids only in logs /
 * audit (Rule #1 — no PHI).
 *
 * Record types that can reference a provisional patient (each tested):
 *   - patients               (primary key — re-keyed)
 *   - encounters             subject.reference
 *   - observations           subject.reference   (vitals)
 *   - conditions             subject.reference   (diagnoses)
 *   - medications            subject.reference   (prescriptions / MedicationRequest)
 *   - serviceRequests        subject.reference   (lab orders)
 *   - medicationStatements   subject.reference
 *   - allergyIntolerances    patient.reference   (Tier-1)
 *   - diagnosticReports      subject.reference   (lab results)
 */

import { db } from './db'
import { hlc } from './hlc'
import { serializeHlc, enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from './sync-queue'
import { auditPhiAccess, AuditAction, AuditResourceType } from './audit'

export interface ReconcileProvisionalResult {
  hubId: string
  reParented: number
  affectedResourceIds: string[]
}

/**
 * Child tables that carry the patient reference at the given nested path.
 * `resourceType` is the sync-engine resource type used to re-enqueue the moved
 * record so it syncs under the Hub patient id.
 */
const PATIENT_REF_CHILD_TABLES = [
  { table: 'encounters', path: 'subject.reference', resourceType: 'Encounter' },
  { table: 'observations', path: 'subject.reference', resourceType: 'Observation' },
  { table: 'conditions', path: 'subject.reference', resourceType: 'Condition' },
  { table: 'medications', path: 'subject.reference', resourceType: 'MedicationRequest' },
  { table: 'serviceRequests', path: 'subject.reference', resourceType: 'ServiceRequest' },
  { table: 'medicationStatements', path: 'subject.reference', resourceType: 'MedicationStatement' },
  { table: 'allergyIntolerances', path: 'patient.reference', resourceType: 'AllergyIntolerance' },
  { table: 'diagnosticReports', path: 'subject.reference', resourceType: 'DiagnosticReport' },
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

/** Set a nested "a.b" reference field on a shallow-cloned record. */
function setNestedRef(record: Record<string, unknown>, path: string, value: string): Record<string, unknown> {
  const parts = path.split('.')
  const head = parts[0] ?? path
  const tail = parts[1]
  if (!tail) return { ...record, [head]: value }
  const branch = { ...((record[head] as Record<string, unknown>) ?? {}), [tail]: value }
  return { ...record, [head]: branch }
}

/**
 * Re-point every local record from the provisional patient id to `hubId`,
 * re-key the patient row, record the mapping, and refresh the sync queue.
 * Idempotent: a no-op if the provisional row is already gone.
 */
export async function reconcileProvisionalPatient(
  provisionalId: string,
  hubId: string,
): Promise<ReconcileProvisionalResult> {
  const affected: string[] = []
  if (provisionalId === hubId) {
    // Nothing to do (Hub echoed the provisional id) — still record the mapping.
    await db.provisionalIdMap.put({ provisionalId, hubId, reconciledAt: new Date().toISOString(), reParentedCount: 0 })
    return { hubId, reParented: 0, affectedResourceIds: [] }
  }

  const provRef = `Patient/${provisionalId}`
  const hubRef = `Patient/${hubId}`

  // 1) Re-point every patient-linked child record onto the Hub reference and
  //    re-enqueue it so it syncs under the Hub patient id. Nested reference
  //    fields (subject.reference / patient.reference) are indexed (plaintext),
  //    so they are queryable and the .toArray() result is fully decrypted.
  for (const { table, path, resourceType } of PATIENT_REF_CHILD_TABLES) {
    const tbl = db[table] as unknown as {
      where(index: string): { equals(value: string): { toArray(): Promise<Array<Record<string, unknown>>> } }
      put(record: Record<string, unknown>): Promise<unknown>
    }
    const records = await tbl.where(path).equals(provRef).toArray()
    for (const rec of records) {
      const meta = (rec.meta ?? {}) as Record<string, unknown>
      const ts = serializeHlc(hlc.now())
      const repointed = setNestedRef(rec, path, hubRef)
      const updated: Record<string, unknown> = {
        ...repointed,
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

  // 2) Re-key the local patient row: put under the Hub id (clearing the
  //    pending flags so the "verifying for duplicates" hint disappears), then
  //    drop the provisional row. Dexie keys on `id`, so a re-key is put+delete.
  const provPatient = await db.patients.get(provisionalId)
  if (provPatient) {
    const nextUltranos = { ...(provPatient._ultranos ?? {}) } as Record<string, unknown>
    delete nextUltranos.mpiPending
    delete nextUltranos.isOfflineCreated
    const rekeyed = {
      ...provPatient,
      id: hubId,
      _ultranos: nextUltranos,
    } as unknown as LocalPatientLike
    await db.patients.put(rekeyed as unknown as Parameters<typeof db.patients.put>[0])
    await db.patients.delete(provisionalId)
  }
  // The provisional patient's own create queue entry has already drained
  // (this reconcile runs on its ack); clear any residual non-synced entries.
  await clearStaleQueueEntries(provisionalId)

  // 3) Record the provisional→Hub mapping (durable audit of the remap).
  await db.provisionalIdMap.put({
    provisionalId,
    hubId,
    reconciledAt: new Date().toISOString(),
    reParentedCount: affected.length,
  })

  // 4) Audit — opaque ids only, never PHI content.
  auditPhiAccess(AuditAction.UPDATE, AuditResourceType.PATIENT, hubId, hubId, {
    phiAccess: 'provisional_patient_reconciled',
    reParentedCount: affected.length,
  })

  return { hubId, reParented: affected.length, affectedResourceIds: affected }
}

// Minimal structural type so re-key put type-checks without importing the full LocalPatient.
type LocalPatientLike = { id: string; _ultranos?: Record<string, unknown> } & Record<string, unknown>
