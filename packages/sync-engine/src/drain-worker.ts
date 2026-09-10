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
import type { ConnectivityManager } from './connectivity-manager.js'
import { getConflictTier } from './conflict-tiers.js'

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
  /**
   * Optional batched push, keyed by resourceId. Preferred over syncFn when present.
   * Called once per chunk of up to `batchSize` ready entries.
   */
  syncBatchFn?: (entries: SyncQueueEntry[]) => Promise<Map<string, SyncResult>>
  /** Max operations per batch. Default 50 (Hub sync.push accepts up to 50). */
  batchSize?: number
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
  /** Adaptive poll delays by connectivity state. Defaults: healthy 15000, degraded 60000. */
  intervals?: { healthyMs?: number; degradedMs?: number }
  /** Random jitter fraction applied to each delay (0..1). Default 0.2. Set 0 in tests. */
  jitterRatio?: number
  /**
   * Decrypt an encrypted payload (enc:v1: prefix) back to its JSON string.
   * Called in-memory just before the syncFn Hub push -- never written back to storage.
   */
  decryptFn?: (encryptedPayload: string) => Promise<string>
  /**
   * Returns true when the session encryption key is available.
   * If false and an encrypted payload is encountered, the entry is set to
   * 'awaiting-key' and skipped until re-authentication restores the key.
   */
  isKeyAvailable?: () => boolean
  /** Optional connectivity classifier fed by sync outcomes. Absent = no reporting. */
  connectivity?: ConnectivityManager
  /** Debounce window (ms) for event-driven drains via requestDrain(). Default 300. */
  enqueueDebounceMs?: number
}

export class DrainWorker {
  private readonly config: Required<Pick<DrainWorkerConfig, 'queue' | 'syncFn' | 'pollIntervalMs'>> & DrainWorkerConfig
  private intervalId: ReturnType<typeof setTimeout> | null = null
  private debounceId: ReturnType<typeof setTimeout> | null = null
  private draining = false

  constructor(config: DrainWorkerConfig) {
    this.config = {
      ...config,
      pollIntervalMs: config.pollIntervalMs ?? 30_000,
    }
  }

  /** Start the drain worker: listen for online events + adaptive periodic polling. */
  start(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
    }
    this.scheduleNext()
    // Initial drain if we believe we're online.
    if (this.isOnline()) {
      void this.drain()
    }
  }

  /** Stop the drain worker. */
  stop(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
    }
    if (this.intervalId !== null) {
      clearTimeout(this.intervalId)
      this.intervalId = null
    }
    if (this.debounceId !== null) { clearTimeout(this.debounceId); this.debounceId = null }
  }

  /**
   * Request a drain in response to a local write. Debounced to batch bursts.
   * `immediate` bypasses the debounce (used for Tier-1 safety-critical writes).
   * No-op while connectivity is offline -- the queue is durable and the online
   * event / adaptive poll will drain later.
   */
  requestDrain(opts?: { immediate?: boolean }): void {
    if (this.config.connectivity?.getState() === 'offline') return
    if (opts?.immediate) {
      if (this.debounceId !== null) { clearTimeout(this.debounceId); this.debounceId = null }
      void this.drain()
      return
    }
    if (this.debounceId !== null) clearTimeout(this.debounceId)
    const wait = this.config.enqueueDebounceMs ?? 300
    this.debounceId = setTimeout(() => {
      this.debounceId = null
      void this.drain()
    }, wait)
  }

  /** Drain all pending items in priority order. */
  async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true

    try {
      await this.config.queue.recoverStale()

      const pending = await this.config.queue.getPending()

      if (this.config.syncBatchFn) {
        await this.drainBatched(pending)
      } else {
        for (const entry of pending) {
          const isEncrypted = entry.payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)

          // If encrypted but key unavailable, defer directly to awaiting-key (single write--no race)
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
            // Decrypt in memory just before Hub push -- never persisted back
            let decryptedPayload = entry.payload
            if (isEncrypted && this.config.decryptFn) {
              decryptedPayload = await this.config.decryptFn(entry.payload)
            }
            const entryForSync: SyncQueueEntry = decryptedPayload !== entry.payload
              ? { ...entry, payload: decryptedPayload }
              : entry

            const startedAt = Date.now()
            let result: SyncResult
            try {
              result = await this.config.syncFn(entryForSync)
              this.config.connectivity?.recordResult({ ok: result.success, latencyMs: Date.now() - startedAt })
            } catch (syncErr) {
              this.config.connectivity?.recordResult({ ok: false, latencyMs: Date.now() - startedAt })
              throw syncErr
            }

            await this.handleResult(entry, decryptedPayload, result)
          } catch (err) {
            const reason = err instanceof Error ? err.message : 'Sync error'
            await this.config.queue.markFailed(entry.id, reason)
            this.config.onAudit?.(entry, 'failure')
          }
        }
      }
    } finally {
      this.draining = false
      await this.updateStatus()
    }
  }

  /**
   * Centralised success/conflict/failure post-processing.
   * Called by both the single-entry path and the batch path.
   */
  private async handleResult(
    entry: SyncQueueEntry,
    decryptedPayload: string,
    result: SyncResult,
  ): Promise<void> {
    if (result.success) {
      await this.config.queue.markSynced(entry.id)
      this.config.onAudit?.(entry, 'success')
      return
    }
    if (result.conflict?.remoteVersion) {
      this.config.onAudit?.(entry, 'conflict')
      if (this.config.onConflict) {
        const { resolveConflict } = await import('./conflict-resolver.js')
        let localData: unknown
        try {
          localData = JSON.parse(decryptedPayload)
        } catch {
          await this.config.queue.markFailed(entry.id, 'Payload parse error -- cannot resolve conflict')
          this.config.onAudit?.(entry, 'failure')
          return
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
      return
    }
    await this.config.queue.markFailed(entry.id, result.error ?? 'Sync failed')
    this.config.onAudit?.(entry, 'failure')
  }

  /**
   * Batch drain path: applies the same per-entry pre-checks as the single path,
   * then chunks ready entries into groups of `batchSize` and calls `syncBatchFn`
   * once per chunk. Reports connectivity results for each chunk call.
   */
  private async drainBatched(pending: SyncQueueEntry[]): Promise<void> {
    const batchFn = this.config.syncBatchFn!
    const size = this.config.batchSize ?? 50

    // Build the list of sync-ready entries with decrypted payloads, applying the
    // same guards as the single path.
    const prepared: Array<{ entry: SyncQueueEntry; decrypted: string }> = []
    for (const entry of pending) {
      const isEncrypted = entry.payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)
      if (isEncrypted && this.config.isKeyAvailable && !this.config.isKeyAvailable()) {
        await this.config.queue.markAwaitingKey(entry.id)
        continue
      }
      if (isEncrypted && !this.config.decryptFn) {
        await this.config.queue.markSyncing(entry.id)
        await this.config.queue.markFailed(entry.id, 'No decryptFn configured for encrypted payload')
        this.config.onAudit?.(entry, 'failure')
        continue
      }
      await this.config.queue.markSyncing(entry.id)
      let decrypted = entry.payload
      if (isEncrypted && this.config.decryptFn) {
        try {
          decrypted = await this.config.decryptFn(entry.payload)
        } catch {
          await this.config.queue.markFailed(entry.id, 'Decrypt error')
          this.config.onAudit?.(entry, 'failure')
          continue
        }
      }
      const e = decrypted !== entry.payload ? { ...entry, payload: decrypted } : entry
      prepared.push({ entry: e, decrypted })
    }

    for (let i = 0; i < prepared.length; i += size) {
      const chunk = prepared.slice(i, i + size)
      const startedAt = Date.now()
      let results: Map<string, SyncResult>
      try {
        results = await batchFn(chunk.map((c) => c.entry))
        const anyOk = chunk.some((c) => results.get(c.entry.resourceId)?.success === true)
        this.config.connectivity?.recordResult({ ok: anyOk, latencyMs: Date.now() - startedAt })
      } catch {
        this.config.connectivity?.recordResult({ ok: false, latencyMs: Date.now() - startedAt })
        for (const { entry } of chunk) {
          await this.config.queue.markFailed(entry.id, 'Batch sync error')
          this.config.onAudit?.(entry, 'failure')
        }
        continue
      }
      for (const { entry, decrypted } of chunk) {
        const result = results.get(entry.resourceId) ?? { success: false, error: 'Missing batch result' }
        await this.handleResult(entry, decrypted, result)
      }
    }
  }

  private handleOnline = (): void => {
    this.config.connectivity?.setOnline(true)
    void this.drain()
    this.scheduleNext()
  }

  private isOnline(): boolean {
    const state = this.config.connectivity?.getState()
    if (state) return state !== 'offline'
    return typeof navigator === 'undefined' || navigator.onLine
  }

  private nextDelayMs(): number {
    const state = this.config.connectivity?.getState()
    const healthy = this.config.intervals?.healthyMs ?? this.config.pollIntervalMs
    const degraded = this.config.intervals?.degradedMs ?? this.config.pollIntervalMs
    const base = state === 'degraded' ? degraded : healthy
    const jitter = this.config.jitterRatio ?? 0.2
    if (jitter <= 0) return base
    // +/-jitter fraction, deterministic-safe (Math.random is fine at runtime; tests pass jitterRatio: 0)
    const delta = base * jitter
    return Math.round(base - delta + Math.random() * 2 * delta)
  }

  private scheduleNext(): void {
    if (this.intervalId !== null) { clearTimeout(this.intervalId); this.intervalId = null }
    // While offline, pause polling entirely (battery/data). The 'online' event resumes.
    if (!this.isOnline()) return
    this.intervalId = setTimeout(() => {
      this.intervalId = null
      void this.drain().finally(() => this.scheduleNext())
    }, this.nextDelayMs())
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

/**
 * Returns true if the resource type belongs to a tier that requires immediate
 * (non-debounced) sync -- i.e., Tier 1 (safety-critical) or Consent.
 * Use this to decide whether to call requestDrain({ immediate: true }).
 *
 * Ground-truth verified: getConflictTier returns 'TIER_1' and 'CONSENT' as
 * the exact literals for these tiers (conflict-tiers.ts ConflictTier union).
 */
export function isImmediateSyncTier(resourceType: string): boolean {
  const tier = getConflictTier(resourceType)
  return tier === 'TIER_1' || tier === 'CONSENT'
}
