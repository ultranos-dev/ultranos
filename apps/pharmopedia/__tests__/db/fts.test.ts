import * as SQLite from 'expo-sqlite'
import { openDatabase } from '@/db/migrations'
import { upsertDrugBatch } from '@/db/drug-catalog'
import { searchDrugs } from '@/db/fts'
import type { DrugEntryTier1 } from '@ultranos/shared-types'

jest.mock('expo-sqlite')

const DRUGS: DrugEntryTier1[] = [
  {
    atcCode: 'J01CA04', innName: 'amoxicillin', brandNames: ['Augmentin', 'Amoxil'],
    doseForms: ['tablet'], therapeuticClass: 'Antibiotic',
    localNames: { prs: 'آموکسیسیلین' },
    summaryPlain: {}, usedFor: [], commonSideEffects: [],
    whenToSeekHelp: {}, storageInstructions: {}, pregnancySummaryPlain: {},
    warningsSummaryPlain: {}, version: 1, lastUpdated: '2026-06-12T00:00:00Z',
  },
  {
    atcCode: 'N02BE01', innName: 'paracetamol', brandNames: ['Panadol', 'Calpol'],
    doseForms: ['tablet'], therapeuticClass: 'Analgesic',
    localNames: { prs: 'پاراستامول' },
    summaryPlain: {}, usedFor: [], commonSideEffects: [],
    whenToSeekHelp: {}, storageInstructions: {}, pregnancySummaryPlain: {},
    warningsSummaryPlain: {}, version: 1, lastUpdated: '2026-06-12T00:00:00Z',
  },
]

describe('FTS search', () => {
  let db: SQLite.SQLiteDatabase

  beforeEach(async () => {
    db = await SQLite.openDatabaseAsync(':memory:')
    await openDatabase(':memory:', db)
    await upsertDrugBatch(db, DRUGS)
  })

  afterEach(async () => { await db.closeAsync() })

  it('finds drug by INN name prefix', async () => {
    const results = await searchDrugs(db, 'amox', 'en', 10)
    expect(results).toHaveLength(1)
    expect(results[0]?.atcCode).toBe('J01CA04')
  })

  it('finds drug by brand name', async () => {
    const results = await searchDrugs(db, 'Panadol', 'en', 10)
    expect(results).toHaveLength(1)
    expect(results[0]?.atcCode).toBe('N02BE01')
  })

  it('finds drug by ATC code prefix', async () => {
    const results = await searchDrugs(db, 'J01CA', 'en', 10)
    expect(results).toHaveLength(1)
    expect(results[0]?.atcCode).toBe('J01CA04')
  })

  it('returns empty array for no match', async () => {
    const results = await searchDrugs(db, 'zzzznotarealdrugxxx', 'en', 10)
    expect(results).toHaveLength(0)
  })

  it('respects limit', async () => {
    const results = await searchDrugs(db, 'a', 'en', 1)
    expect(results.length).toBeLessThanOrEqual(1)
  })

  it('includes localName for prs lang when available', async () => {
    const results = await searchDrugs(db, 'amox', 'prs', 10)
    expect(results[0]?.localName).toBe('آموکسیسیلین')
  })
})
