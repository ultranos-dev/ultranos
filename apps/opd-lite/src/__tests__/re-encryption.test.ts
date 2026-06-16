/**
 * Integration tests for createReEncryptionJob() — Story 28.5 F8.
 *
 * Tests:
 * - Full run: all v1 records are re-encrypted to v2
 * - Interrupted mid-table: job resumes from the correct batch offset
 * - Retire after completion: retireVersion('v1') succeeds after full run
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie, { type EntityTable } from 'dexie'
import { generateSessionKey } from '@ultranos/crypto'
import {
  applyEncryptionMiddleware,
  type EncryptionTableConfig,
} from '../lib/dexie-encryption-middleware'
import { encryptionKeyStore } from '../lib/encryption-key-store'
import { createReEncryptionJob } from '../lib/re-encryption'

interface TestRecord {
  id: string
  value: string
}

class ReEncTestDB extends Dexie {
  records!: EntityTable<TestRecord, 'id'>

  constructor(name: string) {
    super(name, { addons: [] })
    this.version(1).stores({
      records: 'id',
    })
  }
}

const TABLE_CONFIG: EncryptionTableConfig[] = [
  { tableName: 'records', indexedFields: ['id'] },
]

function makeDb(name: string): ReEncTestDB {
  const db = new ReEncTestDB(name)
  applyEncryptionMiddleware(db, TABLE_CONFIG)
  return db
}

// Minimal localStorage mock for progress tracking
function makeLocalStorage(): Record<string, string> {
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  })
  return store
}

beforeEach(() => {
  encryptionKeyStore.wipe()
})

afterEach(() => {
  encryptionKeyStore.wipe()
  vi.unstubAllGlobals()
})

describe('createReEncryptionJob', () => {
  it('re-encrypts all v1 records to v2 on a full run', async () => {
    makeLocalStorage()
    const db = makeDb('reenc-full-run')

    // Set up v1 key and write 5 records
    const v1Key = await generateSessionKey()
    encryptionKeyStore.setKey(v1Key)

    const records: TestRecord[] = Array.from({ length: 5 }, (_, i) => ({
      id: `rec-${i}`,
      value: `payload-${i}`,
    }))
    for (const r of records) {
      await (db.records as unknown as { put(r: TestRecord): Promise<unknown> }).put(r)
    }

    // Rotate to v2
    const v2Key = await generateSessionKey()
    encryptionKeyStore.rotateKey('v2', v2Key)

    // Run re-encryption
    const job = createReEncryptionJob(db, ['records'], 'v1', 'v2')
    const result = await job.run()

    expect(result.complete).toBe(true)
    expect(result.tablesConverted).toContain('records')
    expect(result.tablesSkipped).toHaveLength(0)

    // Verify all records are readable with current key map (v1 key still present)
    const allRecords = await (db.records as unknown as { toArray(): Promise<TestRecord[]> }).toArray()
    expect(allRecords).toHaveLength(5)
    expect(allRecords.map((r) => r.value).sort()).toEqual(records.map((r) => r.value).sort())
  })

  it('re-encrypts 150 records in batches without OOM (batch size = 100)', async () => {
    makeLocalStorage()
    const db = makeDb('reenc-batch-150')

    const v1Key = await generateSessionKey()
    encryptionKeyStore.setKey(v1Key)

    // Write 150 records to force multiple batches
    const batchInsert = Array.from({ length: 150 }, (_, i) => ({
      id: `rec-${String(i).padStart(3, '0')}`,
      value: `data-${i}`,
    }))
    for (const r of batchInsert) {
      await (db.records as unknown as { put(r: TestRecord): Promise<unknown> }).put(r)
    }

    const v2Key = await generateSessionKey()
    encryptionKeyStore.rotateKey('v2', v2Key)

    const job = createReEncryptionJob(db, ['records'], 'v1', 'v2')
    const result = await job.run()

    expect(result.complete).toBe(true)

    const allRecords = await (db.records as unknown as { toArray(): Promise<TestRecord[]> }).toArray()
    expect(allRecords).toHaveLength(150)
  })

  it('resumes from saved batch offset after an interruption mid-table', async () => {
    const store = makeLocalStorage()
    const db = makeDb('reenc-resume')

    const v1Key = await generateSessionKey()
    encryptionKeyStore.setKey(v1Key)

    // Write 5 records with v1
    for (let i = 0; i < 5; i++) {
      await (db.records as unknown as { put(r: TestRecord): Promise<unknown> }).put({
        id: `rec-${i}`,
        value: `v-${i}`,
      })
    }

    const v2Key = await generateSessionKey()
    encryptionKeyStore.rotateKey('v2', v2Key)

    // Simulate saved progress from a previous run that processed the first 3 records.
    // The next run should start from offset=3 and process records 3 and 4 only.
    const progressKey = 'ultranos:reenc-progress:v1->v2'
    store[progressKey] = JSON.stringify({
      fromVersion: 'v1',
      toVersion: 'v2',
      tablesCompleted: [],
      totalTables: 1,
      startedAt: new Date().toISOString(),
      currentTable: 'records',
      currentTableOffset: 3,
    })

    const job = createReEncryptionJob(db, ['records'], 'v1', 'v2')
    const result = await job.run()

    expect(result.complete).toBe(true)
    expect(result.tablesConverted).toContain('records')

    // All records are accessible with the current key map (v1 and v2 both present)
    const allRecords = await (db.records as unknown as { toArray(): Promise<TestRecord[]> }).toArray()
    expect(allRecords).toHaveLength(5)

    // Progress entry is cleared after successful completion
    expect(store[progressKey]).toBeUndefined()
  })

  it('skips tables already completed in a previous run', async () => {
    const store = makeLocalStorage()
    const db = makeDb('reenc-skip')

    const v1Key = await generateSessionKey()
    encryptionKeyStore.setKey(v1Key)

    await (db.records as unknown as { put(r: TestRecord): Promise<unknown> }).put({
      id: 'rec-1',
      value: 'test',
    })

    const v2Key = await generateSessionKey()
    encryptionKeyStore.rotateKey('v2', v2Key)

    // Mark 'records' as already completed
    const progressKey = 'ultranos:reenc-progress:v1->v2'
    store[progressKey] = JSON.stringify({
      fromVersion: 'v1',
      toVersion: 'v2',
      tablesCompleted: ['records'],
      totalTables: 1,
      startedAt: new Date().toISOString(),
    })

    const job = createReEncryptionJob(db, ['records'], 'v1', 'v2')
    const result = await job.run()

    expect(result.complete).toBe(true)
    expect(result.tablesSkipped).toContain('records')
    expect(result.tablesConverted).toHaveLength(0)
  })

  it('retireVersion succeeds after completing the full re-encryption run', async () => {
    makeLocalStorage()
    const db = makeDb('reenc-retire')

    const v1Key = await generateSessionKey()
    encryptionKeyStore.setKey(v1Key)

    await (db.records as unknown as { put(r: TestRecord): Promise<unknown> }).put({
      id: 'rec-1',
      value: 'sensitive-value',
    })

    const v2Key = await generateSessionKey()
    encryptionKeyStore.rotateKey('v2', v2Key)

    const job = createReEncryptionJob(db, ['records'], 'v1', 'v2')
    await job.run()

    // v1 can now be retired without error
    expect(() => encryptionKeyStore.retireVersion('v1')).not.toThrow()

    // Records are still readable with v2 key only
    const allRecords = await (db.records as unknown as { toArray(): Promise<TestRecord[]> }).toArray()
    expect(allRecords).toHaveLength(1)
    expect(allRecords[0]?.value).toBe('sensitive-value')
  })

  it('throws if currentWriteVersion does not match toVersion', async () => {
    makeLocalStorage()
    const db = makeDb('reenc-version-mismatch')

    const v1Key = await generateSessionKey()
    encryptionKeyStore.setKey(v1Key)

    const job = createReEncryptionJob(db, ['records'], 'v1', 'v2')
    await expect(job.run()).rejects.toThrow('current write version to be "v2"')
  })

  it('throws if fromVersion key is not in the key store', async () => {
    makeLocalStorage()
    const db = makeDb('reenc-missing-old-key')

    // Set up v2 key only (v1 key missing — simulates premature retire)
    const v2Key = await generateSessionKey()
    encryptionKeyStore.setKey(v2Key)
    encryptionKeyStore.rotateKey('v2', v2Key)
    encryptionKeyStore.retireVersion('v1')

    const job = createReEncryptionJob(db, ['records'], 'v1', 'v2')
    await expect(job.run()).rejects.toThrow('old key "v1"')
  })
})
