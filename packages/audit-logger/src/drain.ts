// ============================================================
// CLIENT AUDIT DRAIN WORKER
// Drains pending client audit events to the Hub API in FIFO order.
// Listens for online events (PWA) or connectivity changes (RN).
//
// Retry: exponential backoff (1s, 4s, 16s), max 3 retries per batch.
// Batch size: 50 events per drain cycle.
// ============================================================

import type { ClientAuditEvent } from './client.js'

const BATCH_SIZE = 50
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

/** Result from Hub API audit.sync — per-event success/failure. */
export interface AuditSyncResult {
  id: string
  success: boolean
}

/** Interface for the store adapter used by the drain worker. */
export interface DrainableAuditStore {
  getPending(limit: number): Promise<ClientAuditEvent[]>
  markSynced(ids: string[]): Promise<void>
  markFailed(ids: string[]): Promise<void>
}

/** Function that sends a batch of events to the Hub API. Returns per-event results. */
export type AuditSyncFn = (events: ClientAuditEvent[]) => Promise<AuditSyncResult[]>

export interface DrainWorkerOptions {
  store: DrainableAuditStore
  syncFn: AuditSyncFn
}

export class AuditDrainWorker {
  private readonly store: DrainableAuditStore
  private readonly syncFn: AuditSyncFn
  private draining = false
  private removeListeners: (() => void) | null = null

  constructor(options: DrainWorkerOptions) {
    this.store = options.store
    this.syncFn = options.syncFn
  }

  /** Start listening for connectivity changes and drain on restore. */
  start(): void {
    if (typeof window !== 'undefined') {
      // PWA: listen for online event
      const handler = () => void this.drain()
      window.addEventListener('online', handler)
      this.removeListeners = () => window.removeEventListener('online', handler)

      // Drain immediately if already online
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

  /** Drain all pending events in batches with retry logic. */
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
      // Best-effort: don't crash the app if drain fails
      console.warn('[audit-drain] Drain cycle failed — will retry on next connectivity event')
    } finally {
      this.draining = false
    }
  }

  private async sendBatchWithRetry(batch: ClientAuditEvent[]): Promise<void> {
    let attempt = 0
    let failedIds = batch.map((e) => e.id)

    while (attempt < MAX_RETRIES) {
      try {
        const results = await this.syncFn(batch)

        const synced = results.filter((r) => r.success).map((r) => r.id)
        failedIds = results.filter((r) => !r.success).map((r) => r.id)

        if (synced.length > 0) {
          try {
            await this.store.markSynced(synced)
          } catch {
            console.warn('[audit-drain] Failed to mark events as synced — breaking to avoid duplicates')
            return
          }
        }

        if (failedIds.length === 0) return // All succeeded

        // Some failed — retry only the failed events
        attempt++
        if (attempt >= MAX_RETRIES) {
          try {
            await this.store.markFailed(failedIds)
          } catch {
            console.warn('[audit-drain] Failed to mark events as failed')
          }
          return
        }

        const delay = BASE_DELAY_MS * Math.pow(4, attempt - 1) // 1s, 4s, 16s
        await sleep(delay)
        // Filter batch to only the failed events for retry
        batch = batch.filter((e) => failedIds.includes(e.id))
      } catch {
        attempt++
        if (attempt >= MAX_RETRIES) {
          try {
            await this.store.markFailed(failedIds)
          } catch {
            console.warn('[audit-drain] Failed to mark events as failed')
          }
          return
        }
        const delay = BASE_DELAY_MS * Math.pow(4, attempt - 1)
        await sleep(delay)
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
