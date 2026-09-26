/**
 * Offline patient registration for OPD-Lite (Story 60.3, C-OPD-2).
 *
 * The most fundamental clinical workflow must pass the "pull the ethernet
 * cable" test. When the Hub is unreachable (or the online create fails), the
 * clinician still registers the patient: the record is written to encrypted
 * IndexedDB with a provisional `crypto.randomUUID()` id and an `mpiPending`
 * flag, and a `Patient` `create` sync action is enqueued carrying the full
 * `patient.syncCreate` payload. The clinician can start an encounter for the
 * provisional patient immediately.
 *
 * At sync-drain the entry is sent to `patient.syncCreate` (MPI-at-drain: the
 * Hub runs async MPI scoring → a duplicate_reviews entry on WARN/BLOCK) and the
 * provisional id is reconciled to the Hub id across all locally-linked records
 * (see reconcile-provisional-patient.ts).
 *
 * The registration consent survives the offline path: it rides inside the same
 * queued payload (`consent`), so `patient.syncCreate` inserts patient + consent
 * atomically at drain — consent is never stranded from its patient.
 */

import { serializeHlc, enqueueSyncAction } from '@ultranos/sync-engine'
import { db } from './db'
import { hlc } from './hlc'
import { syncQueue } from './sync-queue'
import { encryptionKeyStore } from './encryption-key-store'
import { EncryptionKeyNotAvailableError } from './encryption-key-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from './audit'
import { uploadPatientPhoto, dataUrlToBlob } from './patient-photo-api'
import type { FhirPatient } from '@ultranos/shared-types'

/**
 * Persist an offline-registered patient locally and enqueue its Hub sync.
 *
 * @param provisionalId  client-minted `crypto.randomUUID()` id
 * @param localPatient   the FhirPatient to write to encrypted Dexie (flags set by caller)
 * @param syncPayload    the full patient.syncCreate input (CreatePatientMpiInputSchema
 *                       fields + offlineCreatedAt); carries the consent inline
 *
 * Throws `EncryptionKeyNotAvailableError` if the session key is unavailable
 * (the caller re-routes to re-auth). Never throws for network reasons — the
 * whole point is that this path does not require a network.
 */
export async function registerPatientOffline(
  provisionalId: string,
  localPatient: FhirPatient,
  syncPayload: Record<string, unknown>,
  photoDataUrl?: string | null,
): Promise<void> {
  // Fail fast if the encryption key is gone (re-auth needed) — surfaced to the
  // caller which redirects to login. A patient write must never land unencrypted.
  if (!encryptionKeyStore.isReady()) {
    throw new EncryptionKeyNotAvailableError()
  }

  await db.patients.put(localPatient)

  // Stash the captured photo (encrypted at rest) keyed by the provisional id.
  // The photo endpoint needs the authoritative Hub UUID, so the upload is
  // deferred until reconciliation at sync-drain (see uploadPendingPatientPhoto).
  if (photoDataUrl) {
    await db.pendingPatientPhotos.put({
      provisionalId,
      dataUrl: photoDataUrl,
      createdAt: new Date().toISOString(),
    })
  }

  const hlcTimestamp = serializeHlc(hlc.now())
  await enqueueSyncAction(syncQueue, {
    resourceType: 'Patient',
    resourceId: provisionalId,
    action: 'create',
    payload: syncPayload,
    hlcTimestamp,
  })

  // Audit the offline PHI write — opaque ids only (Rule #1, Rule #6).
  auditPhiAccess(AuditAction.CREATE, AuditResourceType.PATIENT, provisionalId, provisionalId, {
    phiAccess: 'patient_register_offline',
    mpiPending: true,
  })
}

/**
 * Upload a stashed offline-registration photo now that the provisional patient
 * has a real Hub id, then clear the stash. Rule #7: the server stores it under
 * an opaque random key. On any failure the stash is LEFT in place so the sweep
 * (drainPendingPatientPhotos) retries it — never lost on a transient error.
 * No-op when there is no stashed photo for this provisional id.
 */
export async function uploadPendingPatientPhoto(provisionalId: string, hubId: string): Promise<void> {
  const pending = await db.pendingPatientPhotos.get(provisionalId)
  if (!pending?.dataUrl) return
  const blob = dataUrlToBlob(pending.dataUrl)
  // A freshly-synced patient's updated_at is <= now, so `new Date()` satisfies
  // the photo endpoint's optimistic-concurrency guard.
  await uploadPatientPhoto(hubId, blob, new Date().toISOString())
  await db.pendingPatientPhotos.delete(provisionalId)
}

/**
 * Best-effort sweep of any orphaned offline photo stashes whose patient has
 * already reconciled to a Hub id (via provisionalIdMap) but whose upload did
 * not complete (e.g. the app closed, or a transient upload failure). Safe to
 * call on every worker start; each entry is retried independently and left in
 * place on failure. Requires the encryption key to decrypt the stash.
 */
export async function drainPendingPatientPhotos(): Promise<void> {
  if (!encryptionKeyStore.isReady()) return
  let pendings: Array<{ provisionalId: string }>
  try {
    pendings = await db.pendingPatientPhotos.toArray()
  } catch {
    return
  }
  for (const p of pendings) {
    const map = await db.provisionalIdMap.get(p.provisionalId)
    if (!map?.hubId) continue // patient not reconciled yet — retry after its drain
    try {
      await uploadPendingPatientPhoto(p.provisionalId, map.hubId)
    } catch {
      // Leave the stash for the next sweep — opaque id only, no PHI logged.
    }
  }
}
