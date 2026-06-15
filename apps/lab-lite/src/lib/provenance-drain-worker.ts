/**
 * Story 53.6 — AI Provenance Trail: Sync Drain Worker
 *
 * Syncs pending AI provenance records to the Hub API following the same
 * injected-syncFn pattern as `AuditDrainWorker` (packages/audit-logger/src/drain.ts).
 *
 * Design:
 * - `ProvenanceDrainWorker` is constructed with an injected `store` adapter and
 *   `syncFn`, keeping auth and transport concerns outside the worker class.
 * - `DexieProvenanceStore` provides the Dexie-backed store adapter.
 * - `startProvenanceDrain()` / `stopProvenanceDrain()` mirror `startAuditDrain()`
 *   in audit-client.ts for a consistent module-level lifecycle.
 * - Batch size 50, exponential backoff (1s → 4s → 16s), max 3 retries per batch.
 * - Drains immediately on start if online; re-drains on each `online` event.
 *
 * Note: The Hub API endpoint /ai-provenance.sync is a future Hub API story.
 * This worker implements the client-side sync infrastructure.
 */

import type { AiProvenanceRecord } from './ai-provenance'
import { getDb } from './db'
import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

const BATCH_SIZE = 50
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

export interface ProvenanceSyncResult {
  id: string
  success: boolean
}

// ---------------------------------------------------------------------------
// Store adapter interface (mirrors DrainableAuditStore from audit-logger)
// ---------------------------------------------------------------------------

export interface DrainableProvenanceStore {
  getPending(limit: number): Promise<AiProvenanceRecord[]>
  markSynced(ids: string[]): Promise<void>
  markFailed(ids: string[]): Promise<void>
}

export type ProvenanceSyncFn = (records: AiProvenanceRecord[]) => Promise<ProvenanceSyncResult[]>

export interface ProvenanceDrainWorkerOptions {
  store: DrainableProvenanceStore
  syncFn: ProvenanceSyncFn
}

// ---------------------------------------------------------------------------
// Worker class
// ---------------------------------------------------------------------------

export class ProvenanceDrainWorker {
  private readonly store: DrainableProvenanceStore
  private readonly syncFn: ProvenanceSyncFn
  private draining = false
  private removeListeners: (() => void) | null = null

  constructor(options: ProvenanceDrainWorkerOptions) {
    this.store = options.store
    this.syncFn = options.syncFn
  }

  /** Start listening for connectivity changes and drain on restore. */
  start(): void {
    if (typeof window !== 'undefined') {
      const handler = () => void this.drain()
      window.addEventListener('online', handler)
      this.removeListeners = () => window.removeEventListener('online', handler)

      if (navigator.onLine) {
        void this.drain()
      }
    }
  }

  /** Stop listening for connectivity changes. */
  stop(): void {
    this.removeListeners?.()
    this.removeListeners = null
  }

  /** Drain all pending provenance records in batches with retry logic. */
  async drain(): Promise<void> {
    if (this.draining) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    this.draining = true

    try {
      let batch = await this.store.getPending(BATCH_SIZE)

      while (batch.length > 0) {
        await this.sendBatchWithRetry(batch)
        batch = await this.store.getPending(BATCH_SIZE)
      }
    } catch {
      console.warn('[provenance-drain] Drain cycle failed — will retry on next connectivity event')
    } finally {
      this.draining = false
    }
  }

  private async sendBatchWithRetry(batch: AiProvenanceRecord[]): Promise<void> {
    let attempt = 0
    let failedIds = batch.map((r) => r.id)

    while (attempt < MAX_RETRIES) {
      try {
        const results = await this.syncFn(batch)

        const synced = results.filter((r) => r.success).map((r) => r.id)
        failedIds = results.filter((r) => !r.success).map((r) => r.id)

        if (synced.length > 0) {
          try {
            await this.store.markSynced(synced)
          } catch {
            console.warn('[provenance-drain] Failed to mark records as synced — breaking to avoid duplicates')
            return
          }
        }

        if (failedIds.length === 0) return

        attempt++
        if (attempt >= MAX_RETRIES) {
          try {
            await this.store.markFailed(failedIds)
          } catch {
            console.warn('[provenance-drain] Failed to mark records as failed')
          }
          return
        }

        await sleep(BASE_DELAY_MS * Math.pow(4, attempt - 1))
        batch = batch.filter((r) => failedIds.includes(r.id))
      } catch {
        attempt++
        if (attempt >= MAX_RETRIES) {
          try {
            await this.store.markFailed(failedIds)
          } catch {
            console.warn('[provenance-drain] Failed to mark records as failed')
          }
          return
        }
        await sleep(BASE_DELAY_MS * Math.pow(4, attempt - 1))
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Dexie store adapter
// ---------------------------------------------------------------------------

export class DexieProvenanceStore implements DrainableProvenanceStore {
  async getPending(limit: number): Promise<AiProvenanceRecord[]> {
    const db = getDb()
    return db.ai_provenance
      .where('syncStatus')
      .equals('pending')
      .limit(limit)
      .toArray() as Promise<AiProvenanceRecord[]>
  }

  async markSynced(ids: string[]): Promise<void> {
    const db = getDb()
    await db.transaction('rw', db.ai_provenance, async () => {
      for (const id of ids) {
        const record = await db.ai_provenance.get(id)
        if (record) {
          await db.ai_provenance.put({ ...record, syncStatus: 'synced' })
        }
      }
    })
  }

  async markFailed(_ids: string[]): Promise<void> {
    // Provenance records have no 'failed' syncStatus yet (deferred W1).
    // Records remain 'pending' and will retry on next drain cycle.
  }
}

// ---------------------------------------------------------------------------
// Module-level lifecycle (mirrors startAuditDrain / stopAuditDrain)
// ---------------------------------------------------------------------------

let drainWorker: ProvenanceDrainWorker | null = null

export function startProvenanceDrain(): void {
  drainWorker?.stop()
  drainWorker = new ProvenanceDrainWorker({
    store: new DexieProvenanceStore(),
    syncFn: async (records) => {
      const session = useAuthSessionStore.getState().session
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (session) {
        const supabase = (await import('@/lib/supabase')).getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        if (data.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`
        }
      }
      const res = await fetch(`${getHubApiUrl()}/ai-provenance.sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ json: { records } }),
      })
      if (!res.ok) throw new Error(`ai-provenance.sync failed: ${res.status}`)
      const body = (await res.json()) as {
        result: { data: { json: { results: ProvenanceSyncResult[] } } }
      }
      return body.result.data.json.results
    },
  })
  drainWorker.start()
}

export function stopProvenanceDrain(): void {
  drainWorker?.stop()
  drainWorker = null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
