import * as SQLite from 'expo-sqlite'
import { openDatabase } from '@/db/migrations'
import { runSync } from '@/sync/catalog-sync'
import * as api from '@/api/drug-catalog'
import { getSyncMeta } from '@/db/drug-catalog'
import type { DrugEntryTier1 } from '@ultranos/shared-types'

jest.mock('@/api/drug-catalog')
const mockSyncApi = api.syncDrugsApi as jest.Mock

function makeDrug(atcCode: string, version = 1): DrugEntryTier1 {
  return {
    atcCode, innName: `drug-${atcCode}`, brandNames: [], doseForms: [], therapeuticClass: '',
    localNames: {}, summaryPlain: {}, usedFor: [], commonSideEffects: [],
    whenToSeekHelp: {}, storageInstructions: {}, pregnancySummaryPlain: {},
    warningsSummaryPlain: {}, version, lastUpdated: '2026-06-12T00:00:00Z',
  }
}

describe('runSync', () => {
  let db: SQLite.SQLiteDatabase

  beforeEach(async () => {
    db = await SQLite.openDatabaseAsync(':memory:')
    await openDatabase(':memory:', db)
    mockSyncApi.mockReset()
  })

  afterEach(async () => { await db.closeAsync() })

  it('fetches first page and saves latestVersion', async () => {
    mockSyncApi.mockResolvedValueOnce({ entries: [makeDrug('J01CA04')], latestVersion: 1 })
    mockSyncApi.mockResolvedValueOnce({ entries: [], latestVersion: 1 })

    const result = await runSync(db, 'tok')

    expect(result.synced).toBe(1)
    expect(result.version).toBe(1)
    expect(await getSyncMeta(db, 'lastVersion')).toBe('1')
  })

  it('paginates: fetches until entries is empty', async () => {
    mockSyncApi
      .mockResolvedValueOnce({ entries: [makeDrug('A'), makeDrug('B')], latestVersion: 2 })
      .mockResolvedValueOnce({ entries: [makeDrug('C')], latestVersion: 3 })
      .mockResolvedValueOnce({ entries: [], latestVersion: 3 })

    const result = await runSync(db, 'tok')

    expect(result.synced).toBe(3)
    expect(mockSyncApi).toHaveBeenCalledTimes(3)
  })

  it('incremental sync starts from stored lastVersion', async () => {
    // Simulate prior sync at version 10
    await db.runAsync(`INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastVersion', '10')`)
    mockSyncApi.mockResolvedValueOnce({ entries: [makeDrug('X', 11)], latestVersion: 11 })
    mockSyncApi.mockResolvedValueOnce({ entries: [], latestVersion: 11 })

    await runSync(db, 'tok')

    // First call should start from version 10
    expect(mockSyncApi.mock.calls[0][0]).toBe(10)
  })

  it('returns synced 0 and current version when no new entries', async () => {
    await db.runAsync(`INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastVersion', '5')`)
    mockSyncApi.mockResolvedValueOnce({ entries: [], latestVersion: 5 })

    const result = await runSync(db, 'tok')
    expect(result.synced).toBe(0)
    expect(result.version).toBe(5)
  })

  it('calls onProgress with cumulative running total across multiple pages', async () => {
    mockSyncApi
      .mockResolvedValueOnce({ entries: [makeDrug('A'), makeDrug('B')], latestVersion: 2 })
      .mockResolvedValueOnce({ entries: [makeDrug('C'), makeDrug('D'), makeDrug('E')], latestVersion: 3 })
      .mockResolvedValueOnce({ entries: [], latestVersion: 3 })

    const progress: number[] = []
    await runSync(db, 'tok', (n) => progress.push(n))

    expect(progress).toEqual([2, 5])  // page 1: 2, page 2: 2+3=5
  })

  it('propagates API errors to the caller', async () => {
    mockSyncApi.mockRejectedValueOnce(new Error('network failure'))
    await expect(runSync(db, 'tok')).rejects.toThrow('network failure')
  })
})
