/**
 * Singleton drain worker lifecycle management.
 *
 * Instantiates DrainWorker from @ultranos/sync-engine wired to:
 * - Dexie SyncQueueStorage adapter (pharmacy-lite IndexedDB)
 * - Hub API sync function (medication.recordDispense)
 * - SyncStore status updates
 * - Audit logging
 * - Payload decryption (Story 28.3)
 *
 * Start after login, stop on logout/session expiry.
 * Pauses on auth-expired (401) and triggers re-auth.
 */

import { DrainWorker, createSyncQueue } from '@ultranos/sync-engine'
import {
  createDexieSyncAdapter,
  pharmacyEncryptPayload,
  decryptPharmacyEntryPayload,
} from './dexie-sync-adapter'
import { drainSyncFn } from './drain-sync-fn'
import { encryptionKeyStore } from './encryption-key-store'
import { useSyncStore } from '@/stores/sync-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { useAuthSessionStore } from '@/stores/auth-session-store'

let drainWorker: DrainWorker | null = null

/**
 * Start the sync drain worker. Idempotent � stops any existing worker first.
 * Should be called after successful authentication.
 */
export function startSyncDrain(): void {
  stopSyncDrain()

  // Wire the ENCRYPTING adapter so any payload re-persisted through the queue
  // (status transitions, dedup replaces) is encrypted at rest with the enc:v1:
  // prefix that decryptFn below expects. Enqueue sites encrypt via
  // enqueuePharmacySyncEntry; this closes the loop for queue-internal writes.
  const queue = createSyncQueue(createDexieSyncAdapter(pharmacyEncryptPayload))

  drainWorker = new DrainWorker({
    queue,
    syncFn: async (entry) => {
      const result = await drainSyncFn(entry)
      const store = useSyncStore.getState()

      if (!result.success && result.error === 'auth-expired') {
        stopSyncDrain()
        window.dispatchEvent(new CustomEvent('ultranos:session-expired'))
        return { ...result, authExpired: true }
      }

      // Surface WHY a push failed (e.g. KYC_REQUIRED, SUBSCRIPTION_REQUIRED) so the
      // pharmacist gets an actionable reason instead of a silent "N failed". A
      // successful push clears it. Payload/parse errors aren't org-gate issues.
      if (result.success) {
        store.setSyncError(null)
      } else if (result.error && result.error !== 'invalid-payload') {
        store.setSyncError(result.error)
      }

      return result
    },
    decryptFn: decryptPharmacyEntryPayload,
    isKeyAvailable: () => encryptionKeyStore.isReady(),
    onStatusUpdate: (status) => {
      const store = useSyncStore.getState()
      store.updateSyncStatus(status)
      // Only a genuinely clean queue (nothing pending AND nothing failed) counts
      // as "synced" — a permanently-failed dispense must never read as fresh.
      if (!status.isPending && status.pendingCount === 0 && status.failedCount === 0) {
        store.markSynced()
        store.setSyncError(null)
      }
    },
    onAudit: (entry, outcome) => {
      const session = useAuthSessionStore.getState().session
      if (!session) return
      auditPhiAccess(
        session.practitionerId,
        AuditAction.SYNC,
        AuditResourceType.PRESCRIPTION,
        entry.resourceId,
        undefined,
        { outcome, resourceType: entry.resourceType },
      )
    },
    pollIntervalMs: 30_000,
  })

  drainWorker.start()
}

/**
 * Trigger an immediate drain cycle. No-op if worker is not running.
 */
export function triggerDrain(): void {
  drainWorker?.drain()
}

/**
 * Stop the sync drain worker. Safe to call if not running.
 * Should be called on logout/session expiry.
 */
export function stopSyncDrain(): void {
  drainWorker?.stop()
  drainWorker = null
}
