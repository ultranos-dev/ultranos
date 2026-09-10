/**
 * OPD-Lite PWA sync worker.
 *
 * Wires the generic DrainWorker to opd-lite's Dexie queue and tRPC client.
 * In-page worker: listens for online events + 30s polling.
 * Upgrade to Service Worker deferred per Dev Notes.
 */

import { DrainWorker, ConnectivityManager, isImmediateSyncTier, type SyncResult, type SyncQueueEntry, type ConflictResolution, type SyncRecord } from '@ultranos/sync-engine'
import { createMeterFetch } from '@ultranos/sync-engine'
import { recordDataUsage } from './db'
import { syncQueue, decryptEntryPayload, setOnEnqueuedBridge } from './sync-queue'
import { encryptionKeyStore } from './encryption-key-store'
import { auditPhiAccess, AuditAction } from './audit'
import type { AuditResourceType } from './audit'

let worker: DrainWorker | null = null
let connectivityListenersAdded = false

const connectivity = new ConnectivityManager()
export function getConnectivity(): ConnectivityManager { return connectivity }

// Stable references so the same functions can be passed to both
// addEventListener and removeEventListener across start/stop cycles.
const handleOnline  = (): void => connectivity.setOnline(true)
const handleOffline = (): void => connectivity.setOnline(false)

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

    connectivity,
    intervals: { healthyMs: 15_000, degradedMs: 60_000 },
    enqueueDebounceMs: 300,

    syncBatchFn: async (entries) => {
      const token = config.getAuthToken()
      const res = await meteredFetch(`${config.hubBaseUrl}/api/trpc/sync.push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          json: {
            operations: entries.map((entry) => ({
              resourceType: entry.resourceType,
              resourceId: entry.resourceId,
              action: entry.action,
              payload: entry.payload,
              hlcTimestamp: entry.hlcTimestamp,
            })),
          },
        }),
      })
      const out = new Map<string, SyncResult>()
      if (!res.ok) {
        for (const e of entries) out.set(e.resourceId, { success: false, error: `HTTP ${res.status}` })
        return out
      }
      const data = await res.json() as {
        result: { data: { json: { results: Array<{
          resourceId: string; success: boolean
          conflict?: { remoteVersion: SyncRecord }; error?: string; canonicalId?: string
        }> } } }
      }
      const results = data.result?.data?.json?.results ?? []
      const byId = new Map(results.map((r) => [r.resourceId, r]))
      for (const entry of entries) {
        const r = byId.get(entry.resourceId)
        if (!r) { out.set(entry.resourceId, { success: false, error: 'Empty response from Hub' }); continue }
        if (r.conflict) { out.set(entry.resourceId, { success: false, conflict: r.conflict }); continue }
        // Preserve the DUPLICATE_OPEN_ENCOUNTER reconcile backstop from the single path.
        if (!r.success && r.error === 'DUPLICATE_OPEN_ENCOUNTER' && entry.resourceType === 'Encounter' && r.canonicalId) {
          try {
            const { reconcileDuplicateEncounter } = await import('./reconcile-duplicate-encounter')
            await reconcileDuplicateEncounter(entry.resourceId, r.canonicalId)
            out.set(entry.resourceId, { success: true })
          } catch {
            out.set(entry.resourceId, { success: false, error: 'DUPLICATE_OPEN_ENCOUNTER_RECONCILE_FAILED' })
          }
          continue
        }
        out.set(entry.resourceId, r.success ? { success: true } : { success: false, error: r.error ?? 'Unknown error' })
      }
      return out
    },

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

  // Bridge browser connectivity events into the manager for prompt state flips.
  // Use stable named refs so listeners can be removed on stop, preventing
  // listener accumulation across worker restart / dev Fast Refresh cycles.
  if (typeof window !== 'undefined') {
    if (!connectivityListenersAdded) {
      window.addEventListener('online',  handleOnline)
      window.addEventListener('offline', handleOffline)
      connectivityListenersAdded = true
    }
  }

  // Trigger drain (immediate for Tier-1) whenever a new entry is enqueued.
  setOnEnqueuedBridge((input) => worker!.requestDrain({ immediate: isImmediateSyncTier(input.resourceType) }))
}

export function stopSyncWorker(): void {
  setOnEnqueuedBridge(null)
  worker?.stop()
  worker = null
  if (typeof window !== 'undefined' && connectivityListenersAdded) {
    window.removeEventListener('online',  handleOnline)
    window.removeEventListener('offline', handleOffline)
    connectivityListenersAdded = false
  }
}

/** Trigger an immediate drain cycle. No-op if worker not started. */
export async function triggerDrain(): Promise<void> {
  await worker?.drain()
}
