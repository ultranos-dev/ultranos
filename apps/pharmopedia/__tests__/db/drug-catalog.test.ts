import * as SQLite from 'expo-sqlite'
import { openDatabase } from '@/db/migrations'
import {
  upsertDrugBatch,
  getDrugByAtcCode,
  clearCatalog,
  getSyncMeta,
  setSyncMeta,
} from '@/db/drug-catalog'
import type { DrugEntryTier1 } from '@ultranos/shared-types'

jest.mock('expo-sqlite')

const AMOX: DrugEntryTier1 = {
  atcCode: 'J01CA04',
  innName: 'amoxicillin',
  brandNames: ['Augmentin', 'Amoxil'],
  doseForms: ['tablet', 'capsule'],
  therapeuticClass: 'Antibiotic',
  localNames: { prs: 'آموکسیسیلین' },
  summaryPlain: { en: 'Antibiotic used to treat bacterial infections.' },
  usedFor: [{ en: 'Bacterial infections' }],
  commonSideEffects: [{ en: 'Nausea' }],
  whenToSeekHelp: { en: 'If rash develops' },
  storageInstructions: { en: 'Store below 25°C' },
  pregnancySummaryPlain: { en: 'Category B' },
  warningsSummaryPlain: { en: 'Allergy risk' },
  version: 1,
  lastUpdated: '2026-06-12T00:00:00Z',
}

describe('drug-catalog CRUD', () => {
  let db: SQLite.SQLiteDatabase

  beforeEach(async () => {
    db = await SQLite.openDatabaseAsync(':memory:')
    await openDatabase(':memory:', db)
  })

  afterEach(async () => { await db.closeAsync() })

  it('upsertDrugBatch inserts a drug and retrieves it by atcCode', async () => {
    await upsertDrugBatch(db, [AMOX])
    const result = await getDrugByAtcCode(db, 'J01CA04')
    expect(result).not.toBeNull()
    expect(result?.innName).toBe('amoxicillin')
    expect(result?.brandNames).toEqual(['Augmentin', 'Amoxil'])
  })

  it('upsertDrugBatch replaces existing entry on second call', async () => {
    await upsertDrugBatch(db, [AMOX])
    const updated = { ...AMOX, version: 2 }
    await upsertDrugBatch(db, [updated])
    const result = await getDrugByAtcCode(db, 'J01CA04')
    expect(result?.version).toBe(2)
  })

  it('getDrugByAtcCode returns null for unknown ATC code', async () => {
    const result = await getDrugByAtcCode(db, 'UNKNOWN')
    expect(result).toBeNull()
  })

  it('clearCatalog removes all rows from drug_catalog and sync_meta', async () => {
    await upsertDrugBatch(db, [AMOX])
    await setSyncMeta(db, 'lastVersion', '5')
    await clearCatalog(db)
    const drug = await getDrugByAtcCode(db, 'J01CA04')
    const version = await getSyncMeta(db, 'lastVersion')
    expect(drug).toBeNull()
    expect(version).toBeNull()
  })

  it('setSyncMeta and getSyncMeta round-trip', async () => {
    await setSyncMeta(db, 'lastVersion', '42')
    expect(await getSyncMeta(db, 'lastVersion')).toBe('42')
    await setSyncMeta(db, 'lastVersion', '99')
    expect(await getSyncMeta(db, 'lastVersion')).toBe('99')
  })
})
