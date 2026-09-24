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
): Promise<void> {
  // Fail fast if the encryption key is gone (re-auth needed) — surfaced to the
  // caller which redirects to login. A patient write must never land unencrypted.
  if (!encryptionKeyStore.isReady()) {
    throw new EncryptionKeyNotAvailableError()
  }

  await db.patients.put(localPatient)

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
