/**
 * Story 60.2 (AC 7) — sync queue retention pass.
 *
 * Synced rows older than the retention window are deleted; the newest synced
 * row is kept (payload-stripped) so getLatestSynced / getLastSyncedAt still
 * work. awaiting-key / failed / pending / syncing / resolved entries are
 * NEVER touched.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createSyncQueue, type SyncQueueEntry, type SyncQueueStorage } from '../queue.js'
import { runRetentionPass, DEFAULT_RETENTION_DAYS } from '../retention.js'

function createInMemoryStorage(): SyncQueueStorage {
  let entries: SyncQueueEntry[] = []

  return {
    async put(entry: SyncQueueEntry) {
      const idx = entries.findIndex((e) => e.id === entry.id)
      if (idx >= 0) {
        entries[idx] = entry
      } else {
        entries.push(entry)
      }
    },
    async getByResourceId(resourceId: string, status: string) {
      return entries.find(
        (e) => e.resourceId === resourceId && e.status === status,
      ) ?? null
    },
    async getByStatus(status: string) {
      return entries.filter((e) => e.status === status)
    },
    async delete(id: string) {
      entries = entries.filter((e) => e.id !== id)
    },
    async count(status: string) {
      return entries.filter((e) => e.status === status).length
    },
    async getLatestSynced() {
      const synced = entries
        .filter((e) => e.status === 'synced')
        .sort((a, b) =>
          (b.lastAttemptAt ?? b.createdAt).localeCompare(a.lastAttemptAt ?? a.createdAt),
        )
      return synced[0] ?? null
    },
  }
}

const NOW = new Date('2026-09-23T12:00:00.000Z').getTime()
const DAY_MS = 24 * 60 * 60 * 1000

function makeEntry(
  overrides: Partial<SyncQueueEntry> & { id: string; status: SyncQueueEntry['status'] },
): SyncQueueEntry {
  return {
    resourceType: 'Observation',
    resourceId: `res-${overrides.id}`,
    action: 'update',
    payload: 'enc:v1:ciphertext',
    hlcTimestamp: '000001700000000:00000:node-1',
    createdAt: new Date(NOW - 90 * DAY_MS).toISOString(),
    retryCount: 0,
    ...overrides,
  }
}

describe('runRetentionPass', () => {
  let storage: SyncQueueStorage

  beforeEach(() => {
    storage = createInMemoryStorage()
  })

  it('returns zeros on an empty queue', async () => {
    const result = await runRetentionPass(storage, { now: () => NOW })
    expect(result).toEqual({ deletedCount: 0, strippedCount: 0 })
  })

  it('deletes synced rows older than the window but keeps the newest synced row payload-stripped', async () => {
    await storage.put(makeEntry({
      id: 'old-1', status: 'synced',
      lastAttemptAt: new Date(NOW - 60 * DAY_MS).toISOString(),
    }))
    await storage.put(makeEntry({
      id: 'old-2', status: 'synced',
      lastAttemptAt: new Date(NOW - 45 * DAY_MS).toISOString(),
    }))
    await storage.put(makeEntry({
      id: 'old-newest', status: 'synced',
      lastAttemptAt: new Date(NOW - 40 * DAY_MS).toISOString(),
    }))

    const result = await runRetentionPass(storage, { now: () => NOW })

    expect(result.deletedCount).toBe(2)
    expect(result.strippedCount).toBe(1)

    const remaining = await storage.getByStatus('synced')
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.id).toBe('old-newest')
    // Payload stripped — no encrypted PHI blob retained past the window.
    expect(remaining[0]!.payload).toBe('')

    // getLastSyncedAt behavior preserved.
    const queue = createSyncQueue(storage)
    expect(await queue.getLastSyncedAt()).toBe(new Date(NOW - 40 * DAY_MS).toISOString())
  })

  it('leaves synced rows within the retention window untouched (payload intact)', async () => {
    await storage.put(makeEntry({
      id: 'recent', status: 'synced',
      lastAttemptAt: new Date(NOW - 2 * DAY_MS).toISOString(),
    }))

    const result = await runRetentionPass(storage, { now: () => NOW })

    expect(result).toEqual({ deletedCount: 0, strippedCount: 0 })
    const remaining = await storage.getByStatus('synced')
    expect(remaining[0]!.payload).toBe('enc:v1:ciphertext')
  })

  it('NEVER touches awaiting-key, failed, pending, syncing, or resolved entries, however old', async () => {
    const ancient = new Date(NOW - 365 * DAY_MS).toISOString()
    const untouchable: SyncQueueEntry['status'][] = [
      'awaiting-key', 'failed', 'pending', 'syncing', 'resolved',
    ]
    for (const status of untouchable) {
      await storage.put(makeEntry({
        id: `keep-${status}`, status,
        createdAt: ancient,
        lastAttemptAt: ancient,
      }))
    }

    const result = await runRetentionPass(storage, { now: () => NOW })

    expect(result).toEqual({ deletedCount: 0, strippedCount: 0 })
    for (const status of untouchable) {
      const rows = await storage.getByStatus(status)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.payload).toBe('enc:v1:ciphertext')
    }
  })

  it('honors a custom retentionDays and defaults to 30', async () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(30)

    await storage.put(makeEntry({
      id: 'only', status: 'synced',
      lastAttemptAt: new Date(NOW - 10 * DAY_MS).toISOString(),
    }))

    // 30-day default: 10-day-old row untouched.
    let result = await runRetentionPass(storage, { now: () => NOW })
    expect(result).toEqual({ deletedCount: 0, strippedCount: 0 })

    // 7-day custom window: it is the newest synced row → stripped, not deleted.
    result = await runRetentionPass(storage, { now: () => NOW, retentionDays: 7 })
    expect(result).toEqual({ deletedCount: 0, strippedCount: 1 })
    const rows = await storage.getByStatus('synced')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.payload).toBe('')

    // Idempotent: second pass strips nothing further.
    result = await runRetentionPass(storage, { now: () => NOW, retentionDays: 7 })
    expect(result).toEqual({ deletedCount: 0, strippedCount: 0 })
  })
})
