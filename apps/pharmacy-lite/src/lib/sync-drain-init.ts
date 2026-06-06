/**
 * Singleton drain worker lifecycle management.
 *
 * Instantiates DrainWorker from @ultranos/sync-engine wired to:
 * - Dexie SyncQueueStorage adapter (pharmacy-lite IndexedDB)
 * - Hub API sync function (medication.recordDispense)
 * - SyncStore status updates
 * - Audit logging
 *
 * Start after login, stop on logout/session expiry.
 * Pauses on auth-expired (401) and triggers re-auth.
 */

import { DrainWorker, createSyncQueue } from '@ultranos/sync-engine'
import { dexieSyncAdapter } from './dexie-sync-adapter'
import { drainSyncFn } from './drain-sync-fn'
import { useSyncStore } from '@/stores/sync-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { useAuthSessionStore } from '@/stores/auth-session-store'

let drainWorker: DrainWorker | null = null

/**
 * Start the sync drain worker. Idempotent — stops any existing worker first.
 * Should be called after successful authentication.
 */
export function startSyncDrain(): void {
  stopSyncDrain()

  const queue = createSyncQueue(dexieSyncAdapter)

  drainWorker = new DrainWorker({
    queue,
    syncFn: async (entry) => {
      const result = await drainSyncFn(entry)

      // On auth-expired: pause drain and trigger re-auth
      // authExpired flag tells DrainWorker to revert entry to pending (no retry burn)
      if (!result.success && result.error === 'auth-expired') {
        stopSyncDrain()
        window.dispatchEvent(new CustomEvent('ultranos:session-expired'))
        return { ...result, authExpired: true }
      }

      return result
    },
    onStatusUpdate: (status) => {
      const store = useSyncStore.getState()
      store.updateSyncStatus(status)
      // Update lastSyncedAt when drain completes a cycle with no pending items
      if (!status.isPending && status.pendingCount === 0) {
        store.markSynced()
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
