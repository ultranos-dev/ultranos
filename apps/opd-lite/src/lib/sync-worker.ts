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
import { syncQueue, decryptEntryPayload, setOnEnqueuedBridge, runSyncQueueRetention } from './sync-queue'
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

/**
 * Appointments do NOT flow through the generic `sync.push` handler: the Hub's
 * RESOURCE_TABLE_MAP has no `Appointment` entry, so `sync.push` would reject them
 * as "Unknown resource type". Appointments have a dedicated Tier-3 LWW endpoint,
 * `appointment.syncBatch`. This helper drains any `Appointment` queue entries to
 * that endpoint and maps the per-id result back into the DrainWorker's SyncResult
 * shape so failures are marked failed (→ queue backoff retry + sync-store
 * failedCount), never silently dropped. Non-appointment entries are returned
 * untouched for the caller to push via `sync.push`.
 */
async function pushAppointmentEntries(
  entries: SyncQueueEntry[],
  hubBaseUrl: string,
  token: string,
): Promise<Map<string, SyncResult>> {
  const out = new Map<string, SyncResult>()
  if (entries.length === 0) return out

  // The worker hands us decrypted entries whose payload is the FhirAppointment JSON.
  // Reshape each to the appointment.syncBatch input (drops meta; keeps _ultranos).
  const appointments: Array<Record<string, unknown>> = []
  for (const entry of entries) {
    try {
      appointments.push(JSON.parse(entry.payload) as Record<string, unknown>)
    } catch {
      out.set(entry.resourceId, { success: false, error: 'Malformed appointment payload' })
    }
  }
  if (appointments.length === 0) return out

  let res: Response
  try {
    res = await meteredFetch(`${hubBaseUrl}/api/trpc/appointment.syncBatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ json: { appointments } }),
    })
  } catch {
    for (const e of entries) out.set(e.resourceId, { success: false, error: 'Network error' })
    return out
  }

  if (!res.ok) {
    for (const e of entries) out.set(e.resourceId, { success: false, error: `HTTP ${res.status}` })
    return out
  }

  const data = (await res.json()) as {
    result?: { data?: { json?: { results?: Array<{ id: string; action: string }> } } }
  }
  const results = data.result?.data?.json?.results ?? []
  const byId = new Map(results.map((r) => [r.id, r]))
  for (const entry of entries) {
    if (out.has(entry.resourceId)) continue // malformed payload already recorded
    // A returned action (inserted/updated/skipped) is terminal success: 'skipped'
    // means the Hub already holds an equal-or-newer LWW version — nothing to retry.
    out.set(entry.resourceId, byId.has(entry.resourceId)
      ? { success: true }
      : { success: false, error: 'Appointment not acknowledged by Hub' })
  }
  return out
}

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

      // Appointments use their own Tier-3 endpoint (see pushAppointmentEntries):
      // sync.push cannot persist them. Split them out and merge both result maps.
      const appointmentEntries = entries.filter((e) => e.resourceType === 'Appointment')
      const genericEntries = entries.filter((e) => e.resourceType !== 'Appointment')

      const appointmentResults = await pushAppointmentEntries(appointmentEntries, config.hubBaseUrl, token)

      if (genericEntries.length === 0) return appointmentResults

      const res = await meteredFetch(`${config.hubBaseUrl}/api/trpc/sync.push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          json: {
            operations: genericEntries.map((entry) => ({
              resourceType: entry.resourceType,
              resourceId: entry.resourceId,
              action: entry.action,
              payload: entry.payload,
              hlcTimestamp: entry.hlcTimestamp,
            })),
          },
        }),
      })
      const out = new Map<string, SyncResult>(appointmentResults)
      if (!res.ok) {
        for (const e of genericEntries) out.set(e.resourceId, { success: false, error: `HTTP ${res.status}` })
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
      for (const entry of genericEntries) {
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

      // Appointments have no sync.push table mapping — route to their dedicated
      // Tier-3 endpoint. A failure returns { success:false } so the entry is marked
      // failed and retried with backoff (surfaces via sync-store failedCount).
      if (entry.resourceType === 'Appointment') {
        const results = await pushAppointmentEntries([entry], config.hubBaseUrl, token)
        return results.get(entry.resourceId) ?? { success: false, error: 'No appointment result' }
      }

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

  // Housekeeping: bound synced-row PHI payload retention (Story 60.2).
  // Fire-and-forget on worker start; never blocks or fails sync startup.
  void runSyncQueueRetention()

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
