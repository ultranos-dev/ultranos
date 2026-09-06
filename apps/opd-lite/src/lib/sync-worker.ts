/**
 * OPD-Lite PWA sync worker.
 *
 * Wires the generic DrainWorker to opd-lite's Dexie queue and tRPC client.
 * In-page worker: listens for online events + 30s polling.
 * Upgrade to Service Worker deferred per Dev Notes.
 */

import { DrainWorker, type SyncResult, type SyncQueueEntry, type ConflictResolution, type SyncRecord } from '@ultranos/sync-engine'
import { createMeterFetch } from '@ultranos/sync-engine'
import { recordDataUsage } from './db'
import { syncQueue, decryptEntryPayload } from './sync-queue'
import { encryptionKeyStore } from './encryption-key-store'
import { auditPhiAccess, AuditAction } from './audit'
import type { AuditResourceType } from './audit'

let worker: DrainWorker | null = null

const meteredFetch = createMeterFetch(
  fetch,
  (entry) => recordDataUsage({ date: entry.date, category: entry.category, bytesOut: entry.bytesOut, bytesIn: entry.bytesIn, requestCount: entry.requestCount }).catch(() => {}),
)

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
  onConflict?: (entry: SyncQueueEntry, resolution: ConflictResolution) => Promise<void>
}

export function startSyncWorker(config: SyncWorkerConfig): void {
  worker?.stop()

  worker = new DrainWorker({
    queue: syncQueue,
    pollIntervalMs: 30_000,

    decryptFn: decryptEntryPayload,
    isKeyAvailable: () => encryptionKeyStore.isReady(),

    syncFn: async (entry: SyncQueueEntry): Promise<SyncResult> => {
      const token = config.getAuthToken()
      const res = await meteredFetch(`${config.hubBaseUrl}/api/trpc/sync.push`, {
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

      const data = await res.json() as {
        result: { data: { json: { results: Array<{
          resourceId: string
          success: boolean
          conflict?: { remoteVersion: SyncRecord }
          error?: string
          canonicalId?: string
        }> } } }
      }

      const opResult = data.result?.data?.json?.results?.[0]
      if (!opResult) {
        return { success: false, error: 'Empty response from Hub' }
      }

      if (opResult.conflict) {
        return { success: false, conflict: opResult.conflict }
      }

      // Duplicate-open-encounter backstop: the Hub rejected a 2nd open encounter for
      // this (patient, practitioner). Re-parent the local duplicate's children onto
      // the canonical encounter and drop the duplicate, then treat the op as resolved
      // so it stops retrying. Primary prevention (spoke adopt + Hub resume + DB index)
      // makes this path rare; this keeps clinical data from being stranded when it hits.
      if (
        !opResult.success &&
        opResult.error === 'DUPLICATE_OPEN_ENCOUNTER' &&
        entry.resourceType === 'Encounter' &&
        opResult.canonicalId
      ) {
        try {
          const { reconcileDuplicateEncounter } = await import('./reconcile-duplicate-encounter')
          await reconcileDuplicateEncounter(entry.resourceId, opResult.canonicalId)
          return { success: true }
        } catch {
          // Reconciliation failed — fall back to a normal failure so it retries later.
          return { success: false, error: 'DUPLICATE_OPEN_ENCOUNTER_RECONCILE_FAILED' }
        }
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
