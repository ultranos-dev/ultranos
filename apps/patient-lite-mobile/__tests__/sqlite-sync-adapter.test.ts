import type { SyncQueueEntry } from '@ultranos/sync-engine'
import { createSqliteSyncAdapter } from '@/lib/sqlite-sync-adapter'

function createMockDb() {
  const rows: Record<string, unknown>[] = []
  return {
    runAsync: jest.fn(),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    execAsync: jest.fn(),
    closeAsync: jest.fn(),
    _rows: rows,
  }
}

function makeSyncEntry(overrides: Partial<SyncQueueEntry> = {}): SyncQueueEntry {
  return {
    id: 'entry-1',
    resourceType: 'Consent',
    resourceId: 'consent-1',
    action: 'create',
    payload: '{"resourceType":"Consent"}',
    status: 'pending',
    hlcTimestamp: '000000000000001:00000:node-1',
    createdAt: '2026-05-12T00:00:00.000Z',
    retryCount: 0,
    ...overrides,
  }
}

describe('sqlite-sync-adapter', () => {
  let db: ReturnType<typeof createMockDb>
  let adapter: ReturnType<typeof createSqliteSyncAdapter>

  beforeEach(() => {
    jest.clearAllMocks()
    db = createMockDb()
    adapter = createSqliteSyncAdapter(db as any)
  })

  describe('put', () => {
    it('inserts or replaces a sync queue entry', async () => {
      const entry = makeSyncEntry()
      await adapter.put(entry)

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO sync_queue'),
        entry.id,
        entry.resourceType,
        entry.resourceId,
        entry.action,
        entry.payload,
        entry.status,
        entry.hlcTimestamp,
        entry.createdAt,
        entry.retryCount,
        null, // lastAttemptAt undefined → null
      )
    })

    it('passes lastAttemptAt when set', async () => {
      const entry = makeSyncEntry({ lastAttemptAt: '2026-05-12T01:00:00.000Z' })
      await adapter.put(entry)

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        entry.id,
        entry.resourceType,
        entry.resourceId,
        entry.action,
        entry.payload,
        entry.status,
        entry.hlcTimestamp,
        entry.createdAt,
        entry.retryCount,
        '2026-05-12T01:00:00.000Z',
      )
    })
  })

  describe('getByResourceId', () => {
    it('returns null when no row found', async () => {
      db.getFirstAsync.mockResolvedValue(null)
      const result = await adapter.getByResourceId('res-1', 'Consent', 'pending')
      expect(result).toBeNull()
      expect(db.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('resource_id = ?'),
        'res-1',
        'Consent',
        'pending',
      )
    })

    it('maps row columns to camelCase entry', async () => {
      db.getFirstAsync.mockResolvedValue({
        id: 'e1',
        resource_type: 'Consent',
        resource_id: 'c1',
        action: 'create',
        payload: '{}',
        status: 'pending',
        hlc_timestamp: '000:000:n1',
        created_at: '2026-01-01T00:00:00Z',
        retry_count: 2,
        last_attempt_at: '2026-01-01T01:00:00Z',
      })

      const result = await adapter.getByResourceId('c1', 'Consent', 'pending')
      expect(result).toEqual({
        id: 'e1',
        resourceType: 'Consent',
        resourceId: 'c1',
        action: 'create',
        payload: '{}',
        status: 'pending',
        hlcTimestamp: '000:000:n1',
        createdAt: '2026-01-01T00:00:00Z',
        retryCount: 2,
        lastAttemptAt: '2026-01-01T01:00:00Z',
      })
    })
  })

  describe('getByStatus', () => {
    it('returns all rows with the given status', async () => {
      db.getAllAsync.mockResolvedValue([
        {
          id: 'e1',
          resource_type: 'Consent',
          resource_id: 'c1',
          action: 'create',
          payload: '{}',
          status: 'pending',
          hlc_timestamp: '000:000:n1',
          created_at: '2026-01-01T00:00:00Z',
          retry_count: 0,
          last_attempt_at: null,
        },
      ])

      const results = await adapter.getByStatus('pending')
      expect(results).toHaveLength(1)
      expect(results[0].resourceType).toBe('Consent')
      expect(results[0].lastAttemptAt).toBeUndefined()
    })
  })

  describe('delete', () => {
    it('deletes by id', async () => {
      await adapter.delete('e1')
      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM sync_queue'),
        'e1',
      )
    })
  })

  describe('count', () => {
    it('returns count for status', async () => {
      db.getFirstAsync.mockResolvedValue({ cnt: 5 })
      const result = await adapter.count('pending')
      expect(result).toBe(5)
    })

    it('returns 0 when no result', async () => {
      db.getFirstAsync.mockResolvedValue(null)
      const result = await adapter.count('pending')
      expect(result).toBe(0)
    })
  })

  describe('getLatestSynced', () => {
    it('returns null when no synced entries', async () => {
      db.getFirstAsync.mockResolvedValue(null)
      const result = await adapter.getLatestSynced()
      expect(result).toBeNull()
    })

    it('returns the latest synced entry', async () => {
      db.getFirstAsync.mockResolvedValue({
        id: 'e1',
        resource_type: 'Patient',
        resource_id: 'p1',
        action: 'update',
        payload: '{}',
        status: 'synced',
        hlc_timestamp: '000:000:n1',
        created_at: '2026-01-01T00:00:00Z',
        retry_count: 1,
        last_attempt_at: '2026-01-01T02:00:00Z',
      })

      const result = await adapter.getLatestSynced()
      expect(result).not.toBeNull()
      expect(result!.status).toBe('synced')
      expect(result!.resourceType).toBe('Patient')
    })
  })
})
