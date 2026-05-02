import { describe, it, expect, beforeEach } from 'vitest'
import {
  createSyncQueue,
  type SyncQueueEntry,
  type SyncQueueStorage,
} from '../queue.js'

/**
 * In-memory storage adapter for testing the generic queue operations.
 */
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
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return synced[0] ?? null
    },
  }
}

describe('sync queue', () => {
  let storage: SyncQueueStorage
  let queue: ReturnType<typeof createSyncQueue>

  beforeEach(() => {
    storage = createInMemoryStorage()
    queue = createSyncQueue(storage)
  })

  describe('enqueue', () => {
    it('creates a pending sync queue entry', async () => {
      await queue.enqueue({
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: '{"id":"enc-1"}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      const pending = await queue.getPending()
      expect(pending).toHaveLength(1)
      expect(pending[0]!.resourceType).toBe('Encounter')
      expect(pending[0]!.resourceId).toBe('enc-1')
      expect(pending[0]!.action).toBe('create')
      expect(pending[0]!.status).toBe('pending')
      expect(pending[0]!.retryCount).toBe(0)
    })

    it('deduplicates by replacing existing pending entry for same resourceId', async () => {
      await queue.enqueue({
        resourceType: 'Observation',
        resourceId: 'obs-1',
        action: 'create',
        payload: '{"version":1}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      await queue.enqueue({
        resourceType: 'Observation',
        resourceId: 'obs-1',
        action: 'update',
        payload: '{"version":2}',
        hlcTimestamp: '000001700000001:00000:node-1',
      })

      const pending = await queue.getPending()
      expect(pending).toHaveLength(1)
      expect(pending[0]!.payload).toBe('{"version":2}')
      expect(pending[0]!.action).toBe('update')
    })

    it('does not deduplicate entries with different resourceIds', async () => {
      await queue.enqueue({
        resourceType: 'Observation',
        resourceId: 'obs-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      await queue.enqueue({
        resourceType: 'Observation',
        resourceId: 'obs-2',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000001:00000:node-1',
      })

      const pending = await queue.getPending()
      expect(pending).toHaveLength(2)
    })
  })

  describe('markSyncing', () => {
    it('transitions entry from pending to syncing', async () => {
      await queue.enqueue({
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      const pending = await queue.getPending()
      await queue.markSyncing(pending[0]!.id)

      const stillPending = await queue.getPending()
      expect(stillPending).toHaveLength(0)
    })
  })

  describe('markSynced', () => {
    it('transitions entry to synced status', async () => {
      await queue.enqueue({
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      const pending = await queue.getPending()
      await queue.markSynced(pending[0]!.id)

      const remaining = await queue.getPending()
      expect(remaining).toHaveLength(0)
    })
  })

  describe('markFailed', () => {
    it('increments retryCount and keeps entry pending (under max retries)', async () => {
      await queue.enqueue({
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      const pending = await queue.getPending()
      await queue.markFailed(pending[0]!.id)

      // Entry is still pending (under max retries) but in backoff window,
      // so we check counts instead of getPending (which filters by backoff)
      const counts = await queue.getCounts()
      expect(counts.pendingCount).toBe(1)
      expect(counts.failedCount).toBe(0)
    })

    it('marks entry as failed after maxRetries reached', async () => {
      await queue.enqueue({
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      const pending = await queue.getPending()
      const entryId = pending[0]!.id

      // Fail 5 times (default maxRetries)
      for (let i = 0; i < 5; i++) {
        await queue.markFailed(entryId)
      }

      const stillPending = await queue.getPending()
      expect(stillPending).toHaveLength(0)

      const counts = await queue.getCounts()
      expect(counts.failedCount).toBe(1)
    })
  })

  describe('getPending', () => {
    it('returns entries sorted by sync priority', async () => {
      await queue.enqueue({
        resourceType: 'Patient', // priority 6
        resourceId: 'pat-1',
        action: 'update',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      await queue.enqueue({
        resourceType: 'AllergyIntolerance', // priority 1
        resourceId: 'allergy-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000001:00000:node-1',
      })

      await queue.enqueue({
        resourceType: 'MedicationRequest', // priority 2
        resourceId: 'med-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000002:00000:node-1',
      })

      const pending = await queue.getPending()
      expect(pending).toHaveLength(3)
      expect(pending[0]!.resourceType).toBe('AllergyIntolerance')
      expect(pending[1]!.resourceType).toBe('MedicationRequest')
      expect(pending[2]!.resourceType).toBe('Patient')
    })

    it('excludes entries still within backoff window', async () => {
      await queue.enqueue({
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      const pending = await queue.getPending()
      await queue.markFailed(pending[0]!.id)

      const afterFail = await queue.getPending()
      expect(afterFail).toHaveLength(0)
    })
  })

  describe('getCounts', () => {
    it('returns correct pending and failed counts', async () => {
      await queue.enqueue({
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      await queue.enqueue({
        resourceType: 'Patient',
        resourceId: 'pat-1',
        action: 'update',
        payload: '{}',
        hlcTimestamp: '000001700000001:00000:node-1',
      })

      const counts = await queue.getCounts()
      expect(counts.pendingCount).toBe(2)
      expect(counts.failedCount).toBe(0)
    })
  })

  describe('getLastSyncedAt', () => {
    it('returns null when no items have been synced', async () => {
      const lastSynced = await queue.getLastSyncedAt()
      expect(lastSynced).toBeNull()
    })

    it('returns the timestamp of the most recently synced item', async () => {
      await queue.enqueue({
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      })

      const pending = await queue.getPending()
      await queue.markSynced(pending[0]!.id)

      const lastSynced = await queue.getLastSyncedAt()
      expect(lastSynced).toBeDefined()
      expect(typeof lastSynced).toBe('string')
    })
  })
})
