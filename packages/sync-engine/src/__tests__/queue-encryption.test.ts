/**
 * Tests for Story 28.3 additions to the sync queue:
 * - awaiting-key status
 * - markAwaitingKey
 * - restoreAwaitingKeyEntries
 * - ENCRYPTED_PAYLOAD_PREFIX constant
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createSyncQueue,
  ENCRYPTED_PAYLOAD_PREFIX,
  type SyncQueueEntry,
  type SyncQueueStorage,
} from '../queue.js'

function createInMemoryStorage(): SyncQueueStorage & { entries: SyncQueueEntry[] } {
  const storage = {
    entries: [] as SyncQueueEntry[],
    async put(entry: SyncQueueEntry) {
      const idx = storage.entries.findIndex((e) => e.id === entry.id)
      if (idx >= 0) {
        storage.entries[idx] = entry
      } else {
        storage.entries.push(entry)
      }
    },
    async getByResourceId(resourceId: string, status: string) {
      return storage.entries.find(
        (e) => e.resourceId === resourceId && e.status === status,
      ) ?? null
    },
    async getByStatus(status: string) {
      return storage.entries.filter((e) => e.status === status)
    },
    async delete(id: string) {
      storage.entries = storage.entries.filter((e) => e.id !== id)
    },
    async count(status: string) {
      return storage.entries.filter((e) => e.status === status).length
    },
    async getLatestSynced() {
      return null
    },
  }
  return storage
}

describe('ENCRYPTED_PAYLOAD_PREFIX', () => {
  it('has the expected value', () => {
    expect(ENCRYPTED_PAYLOAD_PREFIX).toBe('enc:v1:')
  })
})

describe('awaiting-key status', () => {
  let storage: ReturnType<typeof createInMemoryStorage>
  let queue: ReturnType<typeof createSyncQueue>

  beforeEach(() => {
    storage = createInMemoryStorage()
    queue = createSyncQueue(storage)
  })

  it('markAwaitingKey transitions a syncing entry to awaiting-key', async () => {
    await queue.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: 'enc:v1:someciphertext',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    const pending = await queue.getPending()
    await queue.markSyncing(pending[0]!.id)
    await queue.markAwaitingKey(pending[0]!.id)

    const awaitingKey = await storage.getByStatus('awaiting-key')
    expect(awaitingKey).toHaveLength(1)
    expect(awaitingKey[0]!.status).toBe('awaiting-key')
  })

  it('markAwaitingKey transitions a pending entry directly (no intermediate syncing)', async () => {
    await queue.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: 'enc:v1:someciphertext',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    const pending = await queue.getPending()
    // Entry is pending â€” markAwaitingKey should transition directly (avoids markSyncing race)
    await queue.markAwaitingKey(pending[0]!.id)

    const awaitingKey = await storage.getByStatus('awaiting-key')
    expect(awaitingKey).toHaveLength(1)
    expect(awaitingKey[0]!.status).toBe('awaiting-key')
    expect(await storage.getByStatus('pending')).toHaveLength(0)
  })

  it('markAwaitingKey is a no-op if entry id does not exist', async () => {
    await queue.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: 'enc:v1:someciphertext',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    await queue.markAwaitingKey('nonexistent-id')

    expect(await storage.getByStatus('awaiting-key')).toHaveLength(0)
    expect(await storage.getByStatus('pending')).toHaveLength(1)
  })

  it('restoreAwaitingKeyEntries resets awaiting-key entries to pending', async () => {
    // Manually insert an awaiting-key entry
    await storage.put({
      id: 'entry-1',
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: 'enc:v1:ciphertext',
      status: 'awaiting-key',
      hlcTimestamp: '000001700000000:00000:node-1',
      createdAt: new Date().toISOString(),
      retryCount: 0,
    })

    await queue.restoreAwaitingKeyEntries()

    const awaitingKey = await storage.getByStatus('awaiting-key')
    expect(awaitingKey).toHaveLength(0)

    const pending = await storage.getByStatus('pending')
    expect(pending).toHaveLength(1)
    expect(pending[0]!.resourceId).toBe('enc-1')
  })

  it('restoreAwaitingKeyEntries is a no-op when no awaiting-key entries exist', async () => {
    await queue.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: '{}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    await expect(queue.restoreAwaitingKeyEntries()).resolves.toBeUndefined()
    const pending = await queue.getPending()
    expect(pending).toHaveLength(1) // original pending entry untouched
  })

  it('recoverStale does not touch awaiting-key entries', async () => {
    const oldTime = new Date(Date.now() - 300_000).toISOString()
    await storage.put({
      id: 'entry-1',
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: 'enc:v1:ciphertext',
      status: 'awaiting-key',
      hlcTimestamp: '000001700000000:00000:node-1',
      createdAt: oldTime,
      retryCount: 0,
      lastAttemptAt: oldTime,
    })

    await queue.recoverStale(60_000)

    // Must still be awaiting-key — not reverted to pending by recoverStale
    const awaitingKey = await storage.getByStatus('awaiting-key')
    expect(awaitingKey).toHaveLength(1)
    const pending = await storage.getByStatus('pending')
    expect(pending).toHaveLength(0)
  })
})
