import * as SQLite from 'expo-sqlite'
import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'

import { getDatabase, closeDatabase, resetDbInstance } from '../src/lib/db'

// Setup key-manager mocks so getEncryptionKey resolves
const MOCK_KEY = 'ab'.repeat(32)

beforeEach(() => {
  jest.clearAllMocks()
  resetDbInstance()
  // key-manager: existing key in SecureStore
  ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(MOCK_KEY)
})

describe('db', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    closeAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
  }

  beforeEach(() => {
    ;(SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb)
  })

  describe('getDatabase', () => {
    it('opens a SQLCipher database with encryption key', async () => {
      const db = await getDatabase()

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('ultranos_opd.db', {
        encryptionKey: MOCK_KEY,
      })
      expect(db).toBe(mockDb)
    })

    it('creates Patient table with required columns', async () => {
      await getDatabase()

      const execCall = mockDb.execAsync.mock.calls[0][0] as string
      expect(execCall).toContain('CREATE TABLE IF NOT EXISTS patients')
      expect(execCall).toContain('id TEXT PRIMARY KEY NOT NULL')
      expect(execCall).toContain('name_local TEXT NOT NULL')
      expect(execCall).toContain('national_id_hash TEXT')
      expect(execCall).toContain('gender TEXT NOT NULL')
      expect(execCall).toContain('meta_last_updated TEXT NOT NULL')
      expect(execCall).toContain('fhir_json TEXT NOT NULL')
      expect(execCall).toContain('allergies_json TEXT')
      expect(execCall).toContain('active_meds_json TEXT')
    })

    it('creates indices on name_local, national_id_hash, and meta_last_updated', async () => {
      await getDatabase()

      const execCall = mockDb.execAsync.mock.calls[0][0] as string
      expect(execCall).toContain('CREATE INDEX IF NOT EXISTS idx_patients_name_local')
      expect(execCall).toContain('CREATE INDEX IF NOT EXISTS idx_patients_national_id_hash')
      expect(execCall).toContain('CREATE INDEX IF NOT EXISTS idx_patients_meta_last_updated')
    })

    it('reuses existing db instance on subsequent calls', async () => {
      const db1 = await getDatabase()
      const db2 = await getDatabase()

      expect(db1).toBe(db2)
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1)
    })
  })

  describe('closeDatabase', () => {
    it('closes the db and clears the cached instance', async () => {
      await getDatabase()
      await closeDatabase()

      expect(mockDb.closeAsync).toHaveBeenCalled()

      // After close, next getDatabase should open a new connection
      await getDatabase()
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2)
    })

    it('does nothing if no db is open', async () => {
      await closeDatabase() // should not throw
      expect(mockDb.closeAsync).not.toHaveBeenCalled()
    })
  })
})
