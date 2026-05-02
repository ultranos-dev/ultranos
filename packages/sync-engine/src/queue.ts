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
  action: 'create' | 'update'
  payload: string
  status: 'pending' | 'syncing' | 'failed' | 'synced'
  hlcTimestamp: string
  createdAt: string
  retryCount: number
  lastAttemptAt?: string
}

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
     * if a pending or syncing entry for the same resourceId exists, it is replaced
     * (pending) or a new entry is created alongside the in-flight one (syncing).
     */
    async enqueue(input: EnqueueInput): Promise<void> {
      // Check pending first — coalesce into existing pending entry
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

      // If an entry is currently syncing, we still need to enqueue the newer
      // version so it syncs after the in-flight operation completes.
      // The new entry is a separate queue item (different id) that will be
      // picked up on the next drain cycle.

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

    /** Transition an entry to syncing status. */
    async markSyncing(id: string): Promise<void> {
      const all = await storage.getByStatus('pending')
      const entry = all.find((e) => e.id === id)
      if (!entry) return
      await storage.put({ ...entry, status: 'syncing' })
    },

    /** Mark an entry as successfully synced. */
    async markSynced(id: string): Promise<void> {
      // Check pending and syncing statuses
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

    /**
     * Mark a sync attempt as failed. Increments retryCount and applies backoff.
     * If maxRetries is reached, the entry is marked as permanently failed.
     */
    async markFailed(id: string): Promise<void> {
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
        })
      } else {
        await storage.put({
          ...entry,
          status: 'pending',
          retryCount: newRetryCount,
          lastAttemptAt: nowIso,
        })
      }
    },

    /**
     * Recover stale entries stuck in 'syncing' status (e.g., after a crash).
     * Entries in 'syncing' older than the threshold are reset to 'pending'.
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

    /** Get counts of pending and failed entries for the sync status store. */
    async getCounts(): Promise<{ pendingCount: number; failedCount: number }> {
      const [pendingCount, failedCount] = await Promise.all([
        storage.count('pending'),
        storage.count('failed'),
      ])
      return { pendingCount, failedCount }
    },

    /** Get the timestamp of the most recently synced entry. */
    async getLastSyncedAt(): Promise<string | null> {
      const latest = await storage.getLatestSynced()
      return latest?.lastAttemptAt ?? null
    },
  }
}

export type SyncQueue = ReturnType<typeof createSyncQueue>
