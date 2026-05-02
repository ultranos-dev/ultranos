/**
 * OPD-Lite PWA sync worker.
 *
 * Wires the generic DrainWorker to opd-lite's Dexie queue and tRPC client.
 * In-page worker: listens for `online` events + 30s polling.
 * Upgrade to Service Worker deferred per Dev Notes.
 */

import { DrainWorker, type SyncResult, type SyncQueueEntry } from '@ultranos/sync-engine'
import { syncQueue } from './sync-queue'
import { auditPhiAccess, AuditAction, AuditResourceType } from './audit'

let worker: DrainWorker | null = null

export interface SyncWorkerConfig {
  hubBaseUrl: string
  getAuthToken: () => string
  onStatusUpdate: (status: {
    isPending: boolean
    isError: boolean
    lastSyncedAt: string | null
    pendingCount: number
    failedCount: number
  }) => void
  onConflict?: (entry: SyncQueueEntry, resolution: import('@ultranos/sync-engine').ConflictResolution) => Promise<void>
}

export function startSyncWorker(config: SyncWorkerConfig): void {
  worker?.stop()

  worker = new DrainWorker({
    queue: syncQueue,
    pollIntervalMs: 30_000,

    syncFn: async (entry: SyncQueueEntry): Promise<SyncResult> => {
      const token = config.getAuthToken()
      const res = await fetch(`${config.hubBaseUrl}/api/trpc/sync.push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          json: {
            operations: [{
              resourceType: entry.resourceType,
              resourceId: entry.resourceId,
              action: entry.action,
              payload: entry.payload,
              hlcTimestamp: entry.hlcTimestamp,
            }],
          },
        }),
      })

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}` }
      }

      // Parse the tRPC response — Hub returns 200 with per-operation results
      const data = await res.json() as {
        result: { data: { json: { results: Array<{
          resourceId: string
          success: boolean
          conflict?: { remoteVersion: import('@ultranos/sync-engine').SyncRecord }
          error?: string
        }> } } }
      }

      const opResult = data.result?.data?.json?.results?.[0]
      if (!opResult) {
        return { success: false, error: 'Empty response from Hub' }
      }

      if (opResult.conflict) {
        return { success: false, conflict: opResult.conflict }
      }

      if (!opResult.success) {
        return { success: false, error: opResult.error ?? 'Unknown error' }
      }

      return { success: true }
    },

    onConflict: config.onConflict,

    onStatusUpdate: config.onStatusUpdate,

    onAudit: (entry: SyncQueueEntry, outcome: 'success' | 'failure' | 'conflict') => {
      auditPhiAccess(
        AuditAction.SYNC,
        entry.resourceType as AuditResourceType,
        entry.resourceId,
        undefined,
        { syncOutcome: outcome, action: entry.action },
      )
    },
  })

  worker.start()
}

export function stopSyncWorker(): void {
  worker?.stop()
  worker = null
}

/** Trigger an immediate drain cycle. No-op if worker not started. */
export async function triggerDrain(): Promise<void> {
  await worker?.drain()
}
