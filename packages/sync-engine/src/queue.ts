/**
 * Generic sync queue operations for offline-first sync.
 *
 * Platform-agnostic: storage is injected via the SyncQueueStorage interface.
 * OPD-Lite provides a Dexie adapter; mobile apps provide SQLite.
 */

import { getSyncPriority } from './sync-priority.js'

export interface SyncQueueEntry {
  id: string
  resourceType: string
  resourceId: string
  action: 'create' | 'update' | 'sync:conflict_resolved' | 'pull-conflict'
  payload: string
  status: 'pending' | 'syncing' | 'failed' | 'synced' | 'resolved' | 'awaiting-key'
  hlcTimestamp: string
  createdAt: string
  retryCount: number
  lastAttemptAt?: string
  failureReason?: string
}

/**
 * Sentinel prefix marking AES-GCM encrypted payloads in the sync queue.
 * The crypto version (v1, v2, …) is embedded inside the payload by encryptPayload()
 * so stored format is: enc:<version>:<base64(iv+ciphertext)>
 * e.g. "enc:v1:<base64>" or "enc:v2:<base64>" after key rotation.
 */
export const ENCRYPTED_PAYLOAD_PREFIX = 'enc:'

export type EnqueueInput = Pick<
  SyncQueueEntry,
  'resourceType' | 'resourceId' | 'action' | 'payload' | 'hlcTimestamp'
>

/** Platform adapter for sync queue persistence. */
export interface SyncQueueStorage {
  put(entry: SyncQueueEntry): Promise<void>
  getByResourceId(resourceId: string, status: string): Promise<SyncQueueEntry | null>
  getByStatus(status: string): Promise<SyncQueueEntry[]>
  delete(id: string): Promise<void>
  count(status: string): Promise<number>
  getLatestSynced(): Promise<SyncQueueEntry | null>
}

/** Default max retries before marking as failed. */
const DEFAULT_MAX_RETRIES = 5

/** Backoff intervals in ms: 1s, 2s, 4s, 8s, then capped at 60s. */
export function getBackoffMs(retryCount: number): number {
  return Math.min(1000 * Math.pow(2, retryCount), 60_000)
}

export function createSyncQueue(storage: SyncQueueStorage, maxRetries = DEFAULT_MAX_RETRIES) {
  return {
    /**
     * Enqueue a sync operation. Deduplicates by resourceId:
     * if a pending entry for the same resourceId exists, it is replaced.
     */
    async enqueue(input: EnqueueInput): Promise<void> {
      const existingPending = await storage.getByResourceId(input.resourceId, 'pending')

      if (existingPending) {
        await storage.put({
          ...existingPending,
          action: input.action,
          payload: input.payload,
          hlcTimestamp: input.hlcTimestamp,
          createdAt: new Date().toISOString(),
        })
        return
      }

      const entry: SyncQueueEntry = {
        id: crypto.randomUUID(),
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        action: input.action,
        payload: input.payload,
        hlcTimestamp: input.hlcTimestamp,
        status: 'pending',
        createdAt: new Date().toISOString(),
        retryCount: 0,
      }

      await storage.put(entry)
    },

    /** Get pending entries sorted by sync priority, excluding those in backoff. */
    async getPending(): Promise<SyncQueueEntry[]> {
      const pending = await storage.getByStatus('pending')
      const now = Date.now()

      const ready = pending.filter((entry) => {
        if (entry.retryCount === 0 || !entry.lastAttemptAt) return true
        const backoff = getBackoffMs(entry.retryCount - 1)
        const elapsed = now - new Date(entry.lastAttemptAt).getTime()
        return elapsed >= backoff
      })

      return ready.sort(
        (a, b) => getSyncPriority(a.resourceType) - getSyncPriority(b.resourceType),
      )
    },

    async markSyncing(id: string): Promise<void> {
      const all = await storage.getByStatus('pending')
      const entry = all.find((e) => e.id === id)
      if (!entry) return
      await storage.put({ ...entry, status: 'syncing' })
    },

    async markSynced(id: string): Promise<void> {
      const pending = await storage.getByStatus('pending')
      const syncing = await storage.getByStatus('syncing')
      const entry = [...pending, ...syncing].find((e) => e.id === id)
      if (!entry) return
      await storage.put({
        ...entry,
        status: 'synced',
        lastAttemptAt: new Date().toISOString(),
      })
    },

    async markFailed(id: string, reason?: string): Promise<void> {
      const pending = await storage.getByStatus('pending')
      const syncing = await storage.getByStatus('syncing')
      const entry = [...pending, ...syncing].find((e) => e.id === id)
      if (!entry) return

      const newRetryCount = entry.retryCount + 1
      const nowIso = new Date().toISOString()

      if (newRetryCount >= maxRetries) {
        await storage.put({
          ...entry,
          status: 'failed',
          retryCount: newRetryCount,
          lastAttemptAt: nowIso,
          failureReason: reason,
        })
      } else {
        await storage.put({
          ...entry,
          status: 'pending',
          retryCount: newRetryCount,
          lastAttemptAt: nowIso,
          failureReason: reason,
        })
      }
    },

    /**
     * Mark an entry as awaiting-key — payload is encrypted but the session key
     * is unavailable. Accepts entries in either 'pending' or 'syncing' status,
     * allowing a direct pending→awaiting-key transition without an intermediate
     * markSyncing call (avoids a two-write race window in the drain worker).
     */
    async markAwaitingKey(id: string): Promise<void> {
      const pending = await storage.getByStatus('pending')
      const syncing = await storage.getByStatus('syncing')
      const entry = [...pending, ...syncing].find((e) => e.id === id)
      if (!entry) return
      await storage.put({ ...entry, status: 'awaiting-key' })
    },

    /**
     * Reset all awaiting-key entries back to pending after re-authentication
     * restores the session key.
     */
    async restoreAwaitingKeyEntries(): Promise<void> {
      const awaitingKey = await storage.getByStatus('awaiting-key')
      for (const entry of awaitingKey) {
        await storage.put({ ...entry, status: 'pending' })
      }
    },

    /**
     * Recover stale entries stuck in 'syncing' status (e.g., after a crash).
     * Does NOT touch 'awaiting-key' entries � those require key restoration.
     */
    async recoverStale(staleThresholdMs = 120_000): Promise<void> {
      const syncing = await storage.getByStatus('syncing')
      const now = Date.now()
      for (const entry of syncing) {
        const entryTime = entry.lastAttemptAt
          ? new Date(entry.lastAttemptAt).getTime()
          : new Date(entry.createdAt).getTime()
        if (now - entryTime > staleThresholdMs) {
          await storage.put({ ...entry, status: 'pending' })
        }
      }
    },

    async getCounts(): Promise<{ pendingCount: number; failedCount: number }> {
      const [pendingCount, failedCount] = await Promise.all([
        storage.count('pending'),
        storage.count('failed'),
      ])
      return { pendingCount, failedCount }
    },

    async getLastSyncedAt(): Promise<string | null> {
      const latest = await storage.getLatestSynced()
      return latest?.lastAttemptAt ?? null
    },
  }
}

export type SyncQueue = ReturnType<typeof createSyncQueue>
