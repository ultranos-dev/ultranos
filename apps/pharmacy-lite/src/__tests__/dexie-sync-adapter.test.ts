import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db'
import { dexieSyncAdapter } from '@/lib/dexie-sync-adapter'
import type { SyncQueueEntry } from '@ultranos/sync-engine'

function makeEntry(overrides?: Partial<SyncQueueEntry>): SyncQueueEntry {
  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationDispense',
    resourceId: 'dispense-001',
    action: 'create',
    payload: JSON.stringify({ dispenseId: 'dispense-001' }),
    status: 'pending',
    hlcTimestamp: '000001714400000:00000:node-abc',
    createdAt: new Date().toISOString(),
    retryCount: 0,
    ...overrides,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('dexieSyncAdapter', () => {
  describe('put', () => {
    it('stores an entry in Dexie', async () => {
      const entry = makeEntry({ id: 'e1' })
      await dexieSyncAdapter.put(entry)

      const stored = await db.syncQueue.get('e1')
      expect(stored).toBeTruthy()
      expect(stored!.resourceId).toBe('dispense-001')
    })

    it('translates syncing status to in-flight for Dexie storage', async () => {
      const entry = makeEntry({ id: 'e2', status: 'syncing' })
      await dexieSyncAdapter.put(entry)

      const stored = await db.syncQueue.get('e2')
      expect(stored!.status).toBe('in-flight')
    })

    it('stores synced status as-is', async () => {
      const entry = makeEntry({ id: 'e3', status: 'synced' })
      await dexieSyncAdapter.put(entry)

      const stored = await db.syncQueue.get('e3')
      expect(stored!.status).toBe('synced')
    })

    it('upserts existing entries', async () => {
      const entry = makeEntry({ id: 'e4', retryCount: 0 })
      await dexieSyncAdapter.put(entry)
      await dexieSyncAdapter.put({ ...entry, retryCount: 2 })

      const stored = await db.syncQueue.get('e4')
      expect(stored!.retryCount).toBe(2)
    })
  })

  describe('getByResourceId', () => {
    it('returns matching entry for given resourceId and status', async () => {
      await dexieSyncAdapter.put(makeEntry({ id: 'e1', resourceId: 'r1', status: 'pending' }))
      await dexieSyncAdapter.put(makeEntry({ id: 'e2', resourceId: 'r2', status: 'pending' }))

      const result = await dexieSyncAdapter.getByResourceId('r1', 'MedicationDispense', 'pending')
      expect(result).toBeTruthy()
      expect(result!.id).toBe('e1')
    })

    it('translates syncing status query to in-flight for Dexie', async () => {
      await dexieSyncAdapter.put(makeEntry({ id: 'e1', resourceId: 'r1', status: 'syncing' }))

      const result = await dexieSyncAdapter.getByResourceId('r1', 'MedicationDispense', 'syncing')
      expect(result).toBeTruthy()
      expect(result!.status).toBe('syncing') // returned as sync-engine status
    })

    it('returns null when no match', async () => {
      const result = await dexieSyncAdapter.getByResourceId('nonexistent', 'MedicationDispense', 'pending')
      expect(result).toBeNull()
    })
  })

  describe('getByStatus', () => {
    it('returns all entries with matching status', async () => {
      await dexieSyncAdapter.put(makeEntry({ id: 'e1', status: 'pending' }))
      await dexieSyncAdapter.put(makeEntry({ id: 'e2', status: 'pending' }))
      await dexieSyncAdapter.put(makeEntry({ id: 'e3', status: 'failed' }))

      const pending = await dexieSyncAdapter.getByStatus('pending')
      expect(pending).toHaveLength(2)
    })

    it('translates syncing query to in-flight', async () => {
      await dexieSyncAdapter.put(makeEntry({ id: 'e1', status: 'syncing' }))

      const syncing = await dexieSyncAdapter.getByStatus('syncing')
      expect(syncing).toHaveLength(1)
      expect(syncing[0]?.status).toBe('syncing')
    })

    it('returns empty array when no matches', async () => {
      const result = await dexieSyncAdapter.getByStatus('synced')
      expect(result).toEqual([])
    })
  })

  describe('delete', () => {
    it('removes entry from Dexie', async () => {
      await dexieSyncAdapter.put(makeEntry({ id: 'e1' }))
      await dexieSyncAdapter.delete('e1')

      const stored = await db.syncQueue.get('e1')
      expect(stored).toBeUndefined()
    })
  })

  describe('count', () => {
    it('returns count of entries with matching status', async () => {
      await dexieSyncAdapter.put(makeEntry({ id: 'e1', status: 'pending' }))
      await dexieSyncAdapter.put(makeEntry({ id: 'e2', status: 'pending' }))
      await dexieSyncAdapter.put(makeEntry({ id: 'e3', status: 'failed' }))

      expect(await dexieSyncAdapter.count('pending')).toBe(2)
      expect(await dexieSyncAdapter.count('failed')).toBe(1)
      expect(await dexieSyncAdapter.count('synced')).toBe(0)
    })

    it('translates syncing count to in-flight', async () => {
      await dexieSyncAdapter.put(makeEntry({ id: 'e1', status: 'syncing' }))
      expect(await dexieSyncAdapter.count('syncing')).toBe(1)
    })
  })

  describe('totalCount', () => {
    it('returns count of ALL entries regardless of status', async () => {
      await dexieSyncAdapter.put(makeEntry({ id: 'e1', status: 'pending' }))
      await dexieSyncAdapter.put(makeEntry({ id: 'e2', status: 'syncing' }))
      await dexieSyncAdapter.put(makeEntry({ id: 'e3', status: 'failed' }))
      await dexieSyncAdapter.put(makeEntry({ id: 'e4', status: 'synced' }))

      expect(await dexieSyncAdapter.totalCount()).toBe(4)
    })

    it('returns 0 when queue is empty', async () => {
      expect(await dexieSyncAdapter.totalCount()).toBe(0)
    })
  })

  describe('estimateSizeBytes', () => {
    it('returns approximate size based on payload lengths', async () => {
      const payload = JSON.stringify({ dispenseId: 'dispense-001' })
      await dexieSyncAdapter.put(makeEntry({ id: 'e1', payload }))
      await dexieSyncAdapter.put(makeEntry({ id: 'e2', payload }))

      // UTF-16: payload.length * 2 per entry
      const expected = payload.length * 2 * 2
      expect(await dexieSyncAdapter.estimateSizeBytes()).toBe(expected)
    })

    it('returns 0 when queue is empty', async () => {
      expect(await dexieSyncAdapter.estimateSizeBytes()).toBe(0)
    })
  })

  describe('getLatestSynced', () => {
    it('returns the most recently synced entry', async () => {
      await dexieSyncAdapter.put(makeEntry({
        id: 'e1',
        status: 'synced',
        lastAttemptAt: '2026-05-10T10:00:00Z',
      }))
      await dexieSyncAdapter.put(makeEntry({
        id: 'e2',
        status: 'synced',
        lastAttemptAt: '2026-05-11T10:00:00Z',
      }))

      const latest = await dexieSyncAdapter.getLatestSynced()
      expect(latest).toBeTruthy()
      expect(latest!.id).toBe('e2')
    })

    it('returns null when no synced entries', async () => {
      await dexieSyncAdapter.put(makeEntry({ id: 'e1', status: 'pending' }))

      const latest = await dexieSyncAdapter.getLatestSynced()
      expect(latest).toBeNull()
    })
  })
})
