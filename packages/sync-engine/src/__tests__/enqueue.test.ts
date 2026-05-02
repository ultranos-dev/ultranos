import { describe, it, expect, beforeEach, vi } from 'vitest'
import { enqueueSyncAction } from '../enqueue.js'
import { createSyncQueue, type SyncQueueEntry, type SyncQueueStorage } from '../queue.js'

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

describe('enqueueSyncAction', () => {
  let storage: ReturnType<typeof createInMemoryStorage>
  let queue: ReturnType<typeof createSyncQueue>

  beforeEach(() => {
    storage = createInMemoryStorage()
    queue = createSyncQueue(storage)
  })

  it('enqueues a sync action with serialized payload', async () => {
    await enqueueSyncAction(queue, {
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: { id: 'enc-1', status: 'in-progress' },
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    expect(storage.entries).toHaveLength(1)
    expect(storage.entries[0]!.resourceType).toBe('Encounter')
    expect(storage.entries[0]!.payload).toBe('{"id":"enc-1","status":"in-progress"}')
    expect(storage.entries[0]!.status).toBe('pending')
  })

  it('deduplicates multiple writes to the same resource', async () => {
    await enqueueSyncAction(queue, {
      resourceType: 'Observation',
      resourceId: 'obs-1',
      action: 'create',
      payload: { version: 1 },
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    await enqueueSyncAction(queue, {
      resourceType: 'Observation',
      resourceId: 'obs-1',
      action: 'update',
      payload: { version: 2 },
      hlcTimestamp: '000001700000001:00000:node-1',
    })

    expect(storage.entries).toHaveLength(1)
    expect(JSON.parse(storage.entries[0]!.payload)).toEqual({ version: 2 })
  })

  it('never throws — swallows errors silently', async () => {
    const brokenQueue = createSyncQueue({
      ...storage,
      put: () => { throw new Error('DB exploded') },
    } as unknown as SyncQueueStorage)

    // Should not throw
    await expect(
      enqueueSyncAction(brokenQueue, {
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: { id: 'enc-1' },
        hlcTimestamp: '000001700000000:00000:node-1',
      }),
    ).resolves.toBeUndefined()
  })

  it('preserves HLC timestamp from input', async () => {
    const hlc = '000001700000042:00003:node-abc'
    await enqueueSyncAction(queue, {
      resourceType: 'Condition',
      resourceId: 'cond-1',
      action: 'create',
      payload: { id: 'cond-1' },
      hlcTimestamp: hlc,
    })

    expect(storage.entries[0]!.hlcTimestamp).toBe(hlc)
  })
})
