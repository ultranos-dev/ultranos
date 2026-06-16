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
import { ENCRYPTED_PAYLOAD_PREFIX } from './queue.js'
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
  /**
   * Decrypt an encrypted payload (enc:v1: prefix) back to its JSON string.
   * Called in-memory just before the syncFn Hub push � never written back to storage.
   */
  decryptFn?: (encryptedPayload: string) => Promise<string>
  /**
   * Returns true when the session encryption key is available.
   * If false and an encrypted payload is encountered, the entry is set to
   * 'awaiting-key' and skipped until re-authentication restores the key.
   */
  isKeyAvailable?: () => boolean
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
      await this.config.queue.recoverStale()

      const pending = await this.config.queue.getPending()

      for (const entry of pending) {
        const isEncrypted = entry.payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)

        // If encrypted but key unavailable, defer directly to awaiting-key (single write—no race)
        if (isEncrypted && this.config.isKeyAvailable && !this.config.isKeyAvailable()) {
          await this.config.queue.markAwaitingKey(entry.id)
          continue
        }

        // If encrypted but no decryptFn configured, fail the entry rather than forwarding ciphertext
        if (isEncrypted && !this.config.decryptFn) {
          await this.config.queue.markSyncing(entry.id)
          await this.config.queue.markFailed(entry.id, 'No decryptFn configured for encrypted payload')
          this.config.onAudit?.(entry, 'failure')
          continue
        }

        await this.config.queue.markSyncing(entry.id)

        try {
          // Decrypt in memory just before Hub push � never persisted back
          let decryptedPayload = entry.payload
          if (isEncrypted && this.config.decryptFn) {
            decryptedPayload = await this.config.decryptFn(entry.payload)
          }
          const entryForSync: SyncQueueEntry = decryptedPayload !== entry.payload
            ? { ...entry, payload: decryptedPayload }
            : entry

          const result = await this.config.syncFn(entryForSync)

          if (result.success) {
            await this.config.queue.markSynced(entry.id)
            this.config.onAudit?.(entry, 'success')
          } else if (result.conflict?.remoteVersion) {
            this.config.onAudit?.(entry, 'conflict')
            if (this.config.onConflict) {
              const { resolveConflict } = await import('./conflict-resolver.js')
              let localData: unknown
              try {
                localData = JSON.parse(decryptedPayload)
              } catch {
                await this.config.queue.markFailed(entry.id, 'Payload parse error — cannot resolve conflict')
                this.config.onAudit?.(entry, 'failure')
                continue
              }
              const localRecord: SyncRecord = {
                id: entry.resourceId,
                data: localData as Record<string, unknown>,
                hlcTimestamp: (await import('./hlc.js')).deserializeHlc(entry.hlcTimestamp),
                version: entry.hlcTimestamp,
              }
              const resolution = resolveConflict(localRecord, result.conflict.remoteVersion, entry.resourceType)
              try {
                await this.config.onConflict(entry, resolution)
                await this.config.queue.markSynced(entry.id)
              } catch {
                await this.config.queue.markFailed(entry.id, 'Conflict handler failed')
                this.config.onAudit?.(entry, 'failure')
              }
            } else {
              await this.config.queue.markSynced(entry.id)
            }
          } else {
            await this.config.queue.markFailed(entry.id, result.error ?? 'Sync failed')
            this.config.onAudit?.(entry, 'failure')
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Sync error'
          await this.config.queue.markFailed(entry.id, reason)
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
