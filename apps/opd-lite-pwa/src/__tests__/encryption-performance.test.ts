import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie, { type EntityTable } from 'dexie'
import { generateSessionKey, encryptPayload, decryptPayload } from '@ultranos/crypto'
import {
  applyEncryptionMiddleware,
  type EncryptionTableConfig,
} from '../lib/dexie-encryption-middleware'
import { encryptionKeyStore } from '../lib/encryption-key-store'

/**
 * Performance benchmarks for encryption/decryption overhead.
 * AC5: Encryption/Decryption overhead is <10ms for single record reads.
 */

interface TestRecord {
  id: string
  resourceType: string
  name: string
  diagnosis: string
  notes: string
  medications: string[]
  status: string
}

function makeFhirLikeRecord(id: string): TestRecord {
  return {
    id,
    resourceType: 'Patient',
    name: 'test-patient-name-001',
    diagnosis: 'test-diagnosis-placeholder-for-performance-benchmarking',
    notes:
      'test-clinical-notes-placeholder-with-sufficient-length-to-simulate-realistic-record-size-for-benchmarking-purposes',
    medications: [
      'test-medication-a-500mg-bid',
      'test-medication-b-20mg-qd',
      'test-medication-c-10mg-qd',
    ],
    status: 'active',
  }
}

describe('encryption performance', () => {
  describe('raw crypto overhead', () => {
    let key: CryptoKey

    beforeAll(async () => {
      key = await generateSessionKey()
    })

    it('single record encrypt + decrypt < 10ms', async () => {
      const record = makeFhirLikeRecord('perf-1')
      const iterations = 100
      const times: number[] = []

      for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        const encrypted = await encryptPayload(key, record)
        await decryptPayload(key, encrypted)
        times.push(performance.now() - start)
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length
      const max = Math.max(...times)
      const p95 = times.sort((a, b) => a - b)[Math.floor(iterations * 0.95)]!

      console.log(
        `Raw crypto - avg: ${avg.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms, max: ${max.toFixed(2)}ms`,
      )

      // AC5: <10ms per single record
      expect(avg).toBeLessThan(10)
    })
  })

  describe('Dexie middleware overhead', () => {
    let db: Dexie & { records: EntityTable<TestRecord, 'id'> }
    let dbPlain: Dexie & { records: EntityTable<TestRecord, 'id'> }

    class EncryptedDB extends Dexie {
      records!: EntityTable<TestRecord, 'id'>
      constructor() {
        super('perf-encrypted-db', { addons: [] })
        this.version(1).stores({ records: 'id, status' })
      }
    }

    class PlainDB extends Dexie {
      records!: EntityTable<TestRecord, 'id'>
      constructor() {
        super('perf-plain-db', { addons: [] })
        this.version(1).stores({ records: 'id, status' })
      }
    }

    const tableConfig: EncryptionTableConfig[] = [
      { tableName: 'records', indexedFields: ['id', 'status'] },
    ]

    beforeAll(async () => {
      const key = await generateSessionKey()
      encryptionKeyStore.setKey(key)

      db = new EncryptedDB() as typeof db
      applyEncryptionMiddleware(db, tableConfig)

      dbPlain = new PlainDB() as typeof dbPlain
    })

    afterAll(async () => {
      await db.delete()
      await dbPlain.delete()
      encryptionKeyStore.wipe()
    })

    it('encrypted single-record write+read < 10ms overhead vs unencrypted', async () => {
      const iterations = 50

      // Measure encrypted operations
      const encTimes: number[] = []
      for (let i = 0; i < iterations; i++) {
        const record = makeFhirLikeRecord(`enc-${i}`)
        const start = performance.now()
        await db.records.put(record)
        await db.records.get(`enc-${i}`)
        encTimes.push(performance.now() - start)
      }

      // Measure unencrypted operations
      const plainTimes: number[] = []
      for (let i = 0; i < iterations; i++) {
        const record = makeFhirLikeRecord(`plain-${i}`)
        const start = performance.now()
        await dbPlain.records.put(record)
        await dbPlain.records.get(`plain-${i}`)
        plainTimes.push(performance.now() - start)
      }

      const encAvg = encTimes.reduce((a, b) => a + b, 0) / encTimes.length
      const plainAvg =
        plainTimes.reduce((a, b) => a + b, 0) / plainTimes.length
      const overhead = encAvg - plainAvg

      console.log(
        `Dexie encrypted avg: ${encAvg.toFixed(2)}ms, plain avg: ${plainAvg.toFixed(2)}ms, overhead: ${overhead.toFixed(2)}ms`,
      )

      // AC5: overhead < 10ms per single record read
      expect(overhead).toBeLessThan(10)
    })
  })
})
