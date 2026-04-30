/**
 * Tests for SQLCipher encrypted database connection.
 *
 * Verifies:
 * - AC1: SQLite replaced/upgraded to SQLCipher
 * - AC2: Database file encrypted at rest using AES-256
 */

const mockExecAsync = jest.fn().mockResolvedValue(undefined)
const mockCloseAsync = jest.fn().mockResolvedValue(undefined)
const mockGetFirstAsync = jest.fn()

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockImplementation(() =>
    Promise.resolve({
      execAsync: mockExecAsync,
      closeAsync: mockCloseAsync,
      getFirstAsync: mockGetFirstAsync,
    }),
  ),
}))

jest.mock('@/lib/mobile-key-service', () => ({
  getOrCreateDbPassphrase: jest.fn().mockResolvedValue('ab'.repeat(32)),
}))

import * as SQLite from 'expo-sqlite'
import { getEncryptedDbConnection, closeDatabase, isDatabaseOpen, markAuthenticated } from '@/lib/encrypted-db'

describe('getEncryptedDbConnection', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockExecAsync.mockResolvedValue(undefined)
    mockCloseAsync.mockResolvedValue(undefined)
    // Reset singleton state
    await closeDatabase()
    markAuthenticated()
  })

  it('throws if not authenticated', async () => {
    await closeDatabase() // resets authenticated flag
    await expect(getEncryptedDbConnection()).rejects.toThrow('biometric authentication')
  })

  it('opens the database with expo-sqlite', async () => {
    await getEncryptedDbConnection()
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('ultranos.db')
  })

  it('applies PRAGMA key for SQLCipher AES-256 encryption', async () => {
    await getEncryptedDbConnection()
    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining('PRAGMA key'),
    )
  })

  it('sets PRAGMA cipher_page_size for performance', async () => {
    await getEncryptedDbConnection()
    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining('PRAGMA cipher_page_size'),
    )
  })

  it('verifies encryption key with sqlite_master query', async () => {
    await getEncryptedDbConnection()
    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining('SELECT count(*) FROM sqlite_master'),
    )
  })

  it('enables WAL journal mode', async () => {
    await getEncryptedDbConnection()
    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining('PRAGMA journal_mode = WAL'),
    )
  })

  it('returns singleton — second call reuses the same connection', async () => {
    const db1 = await getEncryptedDbConnection()
    const db2 = await getEncryptedDbConnection()
    expect(db1).toBe(db2)
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1)
  })

  it('creates a new connection after closeDatabase()', async () => {
    await getEncryptedDbConnection()
    await closeDatabase()
    markAuthenticated() // Re-authenticate after close resets auth state
    await getEncryptedDbConnection()
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2)
  })

  it('isDatabaseOpen returns correct state', async () => {
    expect(isDatabaseOpen()).toBe(false)
    await getEncryptedDbConnection()
    expect(isDatabaseOpen()).toBe(true)
    await closeDatabase()
    expect(isDatabaseOpen()).toBe(false)
  })

  it('creates patient_profiles table', async () => {
    await getEncryptedDbConnection()
    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS patient_profiles'),
    )
  })

  it('creates medical_history table', async () => {
    await getEncryptedDbConnection()
    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS medical_history'),
    )
  })

  it('creates consents table', async () => {
    await getEncryptedDbConnection()
    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS consents'),
    )
  })

  it('never logs the passphrase or key material', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    await getEncryptedDbConnection()

    for (const spy of [consoleSpy, consoleWarnSpy, consoleErrorSpy]) {
      for (const call of spy.mock.calls) {
        const output = call.join(' ')
        expect(output).not.toContain('abababab')
        expect(output).not.toContain('PRAGMA key')
      }
    }

    consoleSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })
})
