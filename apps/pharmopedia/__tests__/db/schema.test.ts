import * as SQLite from 'expo-sqlite'
import { openDatabase } from '@/db/migrations'

// expo-sqlite's NativeDatabase is a JSI native class that cannot run in Node.js/Jest.
// The manual mock at __mocks__/expo-sqlite.js wraps better-sqlite3 with the same
// async API, enabling full SQL and FTS5 tests without a device or emulator.
jest.mock('expo-sqlite')

describe('schema migrations', () => {
  let db: SQLite.SQLiteDatabase

  beforeEach(async () => {
    db = await SQLite.openDatabaseAsync(':memory:')
    await openDatabase(':memory:', db)
  })

  afterEach(async () => {
    await db.closeAsync()
  })

  it('creates drug_catalog table', async () => {
    const result = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='drug_catalog'`
    )
    expect(result?.name).toBe('drug_catalog')
  })

  it('creates drug_catalog_fts virtual table', async () => {
    const result = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='drug_catalog_fts'`
    )
    expect(result?.name).toBe('drug_catalog_fts')
  })

  it('creates sync_meta table', async () => {
    const result = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='sync_meta'`
    )
    expect(result?.name).toBe('sync_meta')
  })

  it('sets user_version to SCHEMA_VERSION after migration', async () => {
    const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    expect(result?.user_version).toBe(1)
  })

  it('FTS5 MATCH query returns matching row after insert', async () => {
    await db.runAsync(
      `INSERT INTO drug_catalog
         (atc_code, inn_name, brand_names, dose_forms, therapeutic_class, local_names,
          tier1_json, version, brand_names_flat, local_names_flat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['J01CA04', 'amoxicillin', '["Augmentin","Amoxil"]', '["tablet"]',
       'Antibiotic', '{}', '{}', 1, 'Augmentin Amoxil', '']
    )
    // Rebuild FTS index after insert
    await db.runAsync(`INSERT INTO drug_catalog_fts(drug_catalog_fts) VALUES('rebuild')`)

    const ftsResult = await db.getFirstAsync<{ atc_code: string }>(
      `SELECT dc.atc_code FROM drug_catalog dc
       JOIN drug_catalog_fts fts ON fts.rowid = dc.rowid
       WHERE drug_catalog_fts MATCH 'augmentin*'`
    )
    expect(ftsResult?.atc_code).toBe('J01CA04')
  })

  it('FTS5 MATCH on inn_name returns matching row', async () => {
    await db.runAsync(
      `INSERT INTO drug_catalog
         (atc_code, inn_name, brand_names, dose_forms, therapeutic_class, local_names,
          tier1_json, version, brand_names_flat, local_names_flat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['N02BE01', 'paracetamol', '["Panadol"]', '["tablet"]',
       'Analgesic', '{}', '{}', 1, 'Panadol', '']
    )
    await db.runAsync(`INSERT INTO drug_catalog_fts(drug_catalog_fts) VALUES('rebuild')`)

    const ftsResult = await db.getFirstAsync<{ atc_code: string }>(
      `SELECT dc.atc_code FROM drug_catalog dc
       JOIN drug_catalog_fts fts ON fts.rowid = dc.rowid
       WHERE drug_catalog_fts MATCH 'para*'`
    )
    expect(ftsResult?.atc_code).toBe('N02BE01')
  })
})
