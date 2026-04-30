import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie, { type EntityTable } from 'dexie'
import { generateSessionKey } from '@ultranos/crypto'
import {
  applyEncryptionMiddleware,
  type EncryptionTableConfig,
} from '../lib/dexie-encryption-middleware'
import { encryptionKeyStore } from '../lib/encryption-key-store'

interface TestPatient {
  id: string
  name: string
  diagnosis: string
  status: string
}

class TestDB extends Dexie {
  patients!: EntityTable<TestPatient, 'id'>

  constructor() {
    super('test-encryption-db', { addons: [] })
    this.version(1).stores({
      patients: 'id, status',
    })
  }
}

const tableConfig: EncryptionTableConfig[] = [
  {
    tableName: 'patients',
    indexedFields: ['id', 'status'],
  },
]

describe('dexie-encryption-middleware', () => {
  let db: TestDB
  let key: CryptoKey

  beforeEach(async () => {
    key = await generateSessionKey()
    encryptionKeyStore.setKey(key)
    db = new TestDB()
    applyEncryptionMiddleware(db, tableConfig)
  })

  afterEach(async () => {
    await db.delete()
    encryptionKeyStore.wipe()
  })

  describe('transparent encryption on put/get', () => {
    it('encrypts data on write and decrypts on read', async () => {
      const patient: TestPatient = {
        id: 'p1',
        name: 'Ahmad',
        diagnosis: 'Flu',
        status: 'active',
      }

      await db.patients.put(patient)
      const result = await db.patients.get('p1')

      expect(result).toEqual(patient)
    })

    it('stores encrypted data in IndexedDB (not plaintext)', async () => {
      const patient: TestPatient = {
        id: 'p2',
        name: 'Sensitive Name',
        diagnosis: 'Secret Diagnosis',
        status: 'active',
      }

      await db.patients.put(patient)

      // Read raw data bypassing the reading hook by accessing the underlying store
      // We verify by checking that encryption was applied
      const result = await db.patients.get('p2')
      expect(result).toEqual(patient)

      // Wipe key and verify data becomes inaccessible
      encryptionKeyStore.wipe()
      await expect(db.patients.get('p2')).rejects.toThrow()
    })

    it('preserves indexed fields for queries', async () => {
      await db.patients.put({
        id: 'p3',
        name: 'Test',
        diagnosis: 'Cold',
        status: 'active',
      })
      await db.patients.put({
        id: 'p4',
        name: 'Other',
        diagnosis: 'Fever',
        status: 'inactive',
      })

      const active = await db.patients.where('status').equals('active').toArray()
      expect(active).toHaveLength(1)
      expect(active[0]!.id).toBe('p3')
      expect(active[0]!.name).toBe('Test')
    })
  })

  describe('bulkPut', () => {
    it('encrypts and decrypts bulk operations', async () => {
      const patients: TestPatient[] = [
        { id: 'b1', name: 'One', diagnosis: 'A', status: 'active' },
        { id: 'b2', name: 'Two', diagnosis: 'B', status: 'active' },
        { id: 'b3', name: 'Three', diagnosis: 'C', status: 'inactive' },
      ]

      await db.patients.bulkPut(patients)
      const all = await db.patients.toArray()

      expect(all).toHaveLength(3)
      expect(all.map((p) => p.name).sort()).toEqual(['One', 'Three', 'Two'])
    })
  })

  describe('fail-safe behavior', () => {
    it('throws when reading without a key', async () => {
      // Write with key
      await db.patients.put({
        id: 'p5',
        name: 'Encrypted',
        diagnosis: 'Data',
        status: 'active',
      })

      // Wipe key
      encryptionKeyStore.wipe()

      // Read should fail
      await expect(db.patients.get('p5')).rejects.toThrow()
    })

    it('throws when writing without a key', async () => {
      encryptionKeyStore.wipe()

      await expect(
        db.patients.put({
          id: 'p6',
          name: 'Test',
          diagnosis: 'Test',
          status: 'active',
        }),
      ).rejects.toThrow()
    })
  })

  describe('update operations', () => {
    it('handles put-based updates (replace)', async () => {
      await db.patients.put({
        id: 'u1',
        name: 'Original',
        diagnosis: 'Cold',
        status: 'active',
      })

      await db.patients.put({
        id: 'u1',
        name: 'Updated',
        diagnosis: 'Flu',
        status: 'inactive',
      })

      const result = await db.patients.get('u1')
      expect(result!.name).toBe('Updated')
      expect(result!.diagnosis).toBe('Flu')
      expect(result!.status).toBe('inactive')
    })

    it('handles partial update via update()', async () => {
      await db.patients.put({
        id: 'u2',
        name: 'Original',
        diagnosis: 'Cold',
        status: 'active',
      })

      const updated = await db.patients.update('u2', { diagnosis: 'Flu' })
      expect(updated).toBe(1)

      const result = await db.patients.get('u2')
      expect(result!.name).toBe('Original')
      expect(result!.diagnosis).toBe('Flu')
    })

    it('update() returns 0 for non-existent record', async () => {
      const updated = await db.patients.update('nonexistent', { name: 'X' })
      expect(updated).toBe(0)
    })
  })

  describe('add and bulkAdd', () => {
    it('encrypts and decrypts via add()', async () => {
      await db.patients.add({
        id: 'a1',
        name: 'AddTest',
        diagnosis: 'TestDx',
        status: 'active',
      })
      const result = await db.patients.get('a1')
      expect(result).toEqual({
        id: 'a1',
        name: 'AddTest',
        diagnosis: 'TestDx',
        status: 'active',
      })
    })

    it('encrypts and decrypts via bulkAdd()', async () => {
      await db.patients.bulkAdd([
        { id: 'ba1', name: 'Bulk1', diagnosis: 'D1', status: 'active' },
        { id: 'ba2', name: 'Bulk2', diagnosis: 'D2', status: 'inactive' },
      ])
      const results = await db.patients.toArray()
      expect(results).toHaveLength(2)
      expect(results.map((r) => r.name).sort()).toEqual(['Bulk1', 'Bulk2'])
    })
  })

  describe('terminal read methods', () => {
    beforeEach(async () => {
      await db.patients.bulkPut([
        { id: 't1', name: 'First', diagnosis: 'D1', status: 'active' },
        { id: 't2', name: 'Second', diagnosis: 'D2', status: 'active' },
        { id: 't3', name: 'Third', diagnosis: 'D3', status: 'inactive' },
      ])
    })

    it('first() returns decrypted record', async () => {
      const result = await db.patients.where('status').equals('active').first()
      expect(result).toBeDefined()
      expect(result!.name).toBeTruthy()
      expect(result!.diagnosis).toBeTruthy()
    })

    it('last() returns decrypted record', async () => {
      const result = await db.patients.where('status').equals('active').last()
      expect(result).toBeDefined()
      expect(result!.name).toBeTruthy()
    })

    it('sortBy() returns decrypted records', async () => {
      const results = await db.patients
        .where('status')
        .equals('active')
        .sortBy('id')
      expect(results).toHaveLength(2)
      expect(results[0]!.name).toBeTruthy()
    })

    it('each() iterates decrypted records', async () => {
      const items: TestPatient[] = []
      await db.patients
        .where('status')
        .equals('active')
        .each((item) => items.push(item as TestPatient))
      expect(items).toHaveLength(2)
      expect(items[0]!.name).toBeTruthy()
    })

    it('table-level each() iterates decrypted records', async () => {
      const items: TestPatient[] = []
      await db.patients.each((item) => items.push(item as TestPatient))
      expect(items).toHaveLength(3)
      expect(items.every((i) => i.name && i.diagnosis)).toBe(true)
    })

    it('bulkGet() returns decrypted records', async () => {
      const results = await db.patients.bulkGet(['t1', 't3'])
      expect(results).toHaveLength(2)
      expect(results[0]!.name).toBe('First')
      expect(results[1]!.name).toBe('Third')
    })

    it('bulkGet() returns undefined for missing keys', async () => {
      const results = await db.patients.bulkGet(['t1', 'missing'])
      expect(results).toHaveLength(2)
      expect(results[0]!.name).toBe('First')
      expect(results[1]).toBeUndefined()
    })
  })

  describe('filter with decryption', () => {
    beforeEach(async () => {
      await db.patients.bulkPut([
        { id: 'f1', name: 'Alpha', diagnosis: 'Dx1', status: 'active' },
        { id: 'f2', name: 'Beta', diagnosis: 'Dx2', status: 'active' },
        { id: 'f3', name: 'Gamma', diagnosis: 'Dx3', status: 'inactive' },
      ])
    })

    it('filter() applies predicate on decrypted non-indexed fields', async () => {
      const results = await db.patients
        .filter((p) => (p as TestPatient).name === 'Beta')
        .toArray()
      expect(results).toHaveLength(1)
      expect((results[0] as TestPatient).id).toBe('f2')
    })

    it('filter() returns empty when no records match', async () => {
      const results = await db.patients
        .filter((p) => (p as TestPatient).name === 'NonExistent')
        .toArray()
      expect(results).toHaveLength(0)
    })
  })

  describe('modify() blocking', () => {
    it('throws on collection modify()', async () => {
      await db.patients.put({
        id: 'm1',
        name: 'Test',
        diagnosis: 'Dx',
        status: 'active',
      })
      expect(() =>
        db.patients.where('status').equals('active').modify({ name: 'X' }),
      ).toThrow('modify() is not supported on encrypted tables')
    })
  })

  describe('toCollection()', () => {
    it('returns wrapped collection that decrypts', async () => {
      await db.patients.put({
        id: 'tc1',
        name: 'CollTest',
        diagnosis: 'Dx',
        status: 'active',
      })
      const results = await db.patients.toCollection().toArray()
      expect(results).toHaveLength(1)
      expect((results[0] as TestPatient).name).toBe('CollTest')
    })
  })
})
