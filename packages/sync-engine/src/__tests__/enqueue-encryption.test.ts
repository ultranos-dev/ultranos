/**
 * Tests for Story 28.3 enqueueSyncAction optional encryptFn parameter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { enqueueSyncAction } from '../enqueue.js'
import { createSyncQueue, ENCRYPTED_PAYLOAD_PREFIX, type SyncQueueEntry, type SyncQueueStorage } from '../queue.js'

function createInMemoryStorage(): SyncQueueStorage & { entries: SyncQueueEntry[] } {
  const storage = {
    entries: [] as SyncQueueEntry[],
    async put(entry: SyncQueueEntry) {
      const idx = storage.entries.findIndex((e) => e.id === entry.id)
      if (idx >= 0) storage.entries[idx] = entry
      else storage.entries.push(entry)
    },
    async getByResourceId(resourceId: string, status: string) {
      return storage.entries.find((e) => e.resourceId === resourceId && e.status === status) ?? null
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
    async getLatestSynced() { return null },
  }
  return storage
}

describe('enqueueSyncAction with encryptFn', () => {
  let storage: ReturnType<typeof createInMemoryStorage>
  let queue: ReturnType<typeof createSyncQueue>

  beforeEach(() => {
    storage = createInMemoryStorage()
    queue = createSyncQueue(storage)
  })

  it('stores plaintext JSON when no encryptFn is provided', async () => {
    await enqueueSyncAction(queue, {
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: { id: 'enc-1', status: 'in-progress' },
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    expect(storage.entries).toHaveLength(1)
    expect(storage.entries[0]!.payload).toBe('{"id":"enc-1","status":"in-progress"}')
    expect(storage.entries[0]!.payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)).toBe(false)
  })

  it('encrypts payload when encryptFn is provided', async () => {
    const encryptFn = vi.fn().mockResolvedValue(`${ENCRYPTED_PAYLOAD_PREFIX}FAKECIPHERTEXT`)

    await enqueueSyncAction(queue, {
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: { id: 'enc-1' },
      hlcTimestamp: '000001700000000:00000:node-1',
    }, encryptFn)

    expect(encryptFn).toHaveBeenCalledWith('{"id":"enc-1"}')
    expect(storage.entries[0]!.payload).toBe(`${ENCRYPTED_PAYLOAD_PREFIX}FAKECIPHERTEXT`)
  })

  it('encrypted deduplication: replaces existing pending entry with encrypted payload', async () => {
    const encryptFn = vi.fn()
      .mockResolvedValueOnce(`${ENCRYPTED_PAYLOAD_PREFIX}CIPHER1`)
      .mockResolvedValueOnce(`${ENCRYPTED_PAYLOAD_PREFIX}CIPHER2`)

    await enqueueSyncAction(queue, {
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: { version: 1 },
      hlcTimestamp: '000001700000000:00000:node-1',
    }, encryptFn)

    await enqueueSyncAction(queue, {
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'update',
      payload: { version: 2 },
      hlcTimestamp: '000001700000001:00000:node-1',
    }, encryptFn)

    expect(storage.entries).toHaveLength(1)
    expect(storage.entries[0]!.payload).toBe(`${ENCRYPTED_PAYLOAD_PREFIX}CIPHER2`)
  })

  it('never throws when encryptFn is provided and throws', async () => {
    const encryptFn = vi.fn().mockRejectedValue(new Error('crypto error'))

    await expect(
      enqueueSyncAction(queue, {
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: { id: 'enc-1' },
        hlcTimestamp: '000001700000000:00000:node-1',
      }, encryptFn),
    ).resolves.toBeUndefined()

    // Nothing was stored due to the error
    expect(storage.entries).toHaveLength(0)
  })
})
