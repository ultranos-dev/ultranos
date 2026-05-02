/**
 * Generic background drain worker for the sync queue.
 *
 * Platform-agnostic: the sync function, conflict handler, audit emitter,
 * and status updater are injected by the caller.
 *
 * Drains pending items in sync priority order, handles retries with
 * exponential backoff, and delegates conflict resolution to the caller.
 */

import type { SyncQueue, SyncQueueEntry } from './queue.js'
import type { ConflictResolution, SyncRecord } from './conflict-resolver.js'

export interface SyncResult {
  success: boolean
  conflict?: {
    remoteVersion: SyncRecord
  }
  error?: string
}

export interface DrainWorkerConfig {
  queue: SyncQueue
  /** Push a single sync operation to the Hub. */
  syncFn: (entry: SyncQueueEntry) => Promise<SyncResult>
  /** Handle a conflict resolution result. */
  onConflict?: (entry: SyncQueueEntry, resolution: ConflictResolution) => Promise<void>
  /** Called after each drain cycle with updated counts. */
  onStatusUpdate?: (status: {
    isPending: boolean
    isError: boolean
    lastSyncedAt: string | null
    pendingCount: number
    failedCount: number
  }) => void
  /** Emit a client audit event for sync operations. */
  onAudit?: (entry: SyncQueueEntry, outcome: 'success' | 'failure' | 'conflict') => void
  /** Polling interval in ms when online. Default: 30000 (30s). */
  pollIntervalMs?: number
}

export class DrainWorker {
  private readonly config: Required<Pick<DrainWorkerConfig, 'queue' | 'syncFn' | 'pollIntervalMs'>> & DrainWorkerConfig
  private intervalId: ReturnType<typeof setInterval> | null = null
  private draining = false

  constructor(config: DrainWorkerConfig) {
    this.config = {
      ...config,
      pollIntervalMs: config.pollIntervalMs ?? 30_000,
    }
  }

  /** Start the drain worker: listen for online events + periodic polling. */
  start(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
    }

    this.intervalId = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void this.drain()
      }
    }, this.config.pollIntervalMs)

    // Drain immediately if currently online
    if (typeof navigator === 'undefined' || navigator.onLine) {
      void this.drain()
    }
  }

  /** Stop the drain worker. */
  stop(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /** Drain all pending items in priority order. */
  async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true

    try {
      // Recover entries stuck in 'syncing' from a previous crash/tab close
      await this.config.queue.recoverStale()

      const pending = await this.config.queue.getPending()

      for (const entry of pending) {
        await this.config.queue.markSyncing(entry.id)

        try {
          const result = await this.config.syncFn(entry)

          if (result.success) {
            await this.config.queue.markSynced(entry.id)
            this.config.onAudit?.(entry, 'success')
          } else if (result.conflict?.remoteVersion) {
            this.config.onAudit?.(entry, 'conflict')
            // Conflict handling is delegated to Task 4
            if (this.config.onConflict) {
              const { resolveConflict } = await import('./conflict-resolver.js')
              const localRecord: SyncRecord = {
                id: entry.resourceId,
                data: JSON.parse(entry.payload),
                hlcTimestamp: (await import('./hlc.js')).deserializeHlc(entry.hlcTimestamp),
                version: entry.hlcTimestamp,
              }
              const resolution = resolveConflict(localRecord, result.conflict.remoteVersion, entry.resourceType)
              try {
                await this.config.onConflict(entry, resolution)
                await this.config.queue.markSynced(entry.id)
              } catch {
                // onConflict handler failed — mark as failed so it retries
                await this.config.queue.markFailed(entry.id)
                this.config.onAudit?.(entry, 'failure')
              }
            } else {
              // No onConflict handler — mark synced (conflict swallowed)
              await this.config.queue.markSynced(entry.id)
            }
          } else {
            await this.config.queue.markFailed(entry.id)
            this.config.onAudit?.(entry, 'failure')
          }
        } catch {
          await this.config.queue.markFailed(entry.id)
          this.config.onAudit?.(entry, 'failure')
        }
      }
    } finally {
      this.draining = false
      await this.updateStatus()
    }
  }

  private handleOnline = (): void => {
    void this.drain()
  }

  private async updateStatus(): Promise<void> {
    if (!this.config.onStatusUpdate) return

    const counts = await this.config.queue.getCounts()
    const lastSyncedAt = await this.config.queue.getLastSyncedAt()

    this.config.onStatusUpdate({
      isPending: counts.pendingCount > 0,
      isError: counts.failedCount > 0,
      lastSyncedAt,
      pendingCount: counts.pendingCount,
      failedCount: counts.failedCount,
    })
  }
}
