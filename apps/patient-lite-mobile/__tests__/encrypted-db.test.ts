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

jest.mock('@/lib/audit', () => ({
  emitAuditEvent: jest.fn(),
}))

import * as SQLite from 'expo-sqlite'
import { getEncryptedDbConnection, closeDatabase, isDatabaseOpen, markAuthenticated, generateUnlockToken } from '@/lib/encrypted-db'
import { emitAuditEvent } from '@/lib/audit'

const VALID_TOKEN = 'ab'.repeat(32)

describe('getEncryptedDbConnection', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockExecAsync.mockResolvedValue(undefined)
    mockCloseAsync.mockResolvedValue(undefined)
    // Reset singleton state
    await closeDatabase()
    markAuthenticated(VALID_TOKEN)
  })

  it('throws if not authenticated', async () => {
    await closeDatabase() // resets unlock token
    await expect(getEncryptedDbConnection()).rejects.toThrow('biometric authentication')
  })

  it('throws if markAuthenticated called with invalid token', () => {
    expect(() => markAuthenticated('')).toThrow('Invalid unlock token')
    expect(() => markAuthenticated('short')).toThrow('Invalid unlock token')
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

  it('sets cipher_page_size before verification query', async () => {
    await getEncryptedDbConnection()
    const calls = mockExecAsync.mock.calls.map((c: unknown[]) => c[0])
    const keyIndex = calls.findIndex((c: string) => c.includes('PRAGMA key'))
    const pageSizeIndex = calls.findIndex((c: string) => c.includes('cipher_page_size'))
    const verifyIndex = calls.findIndex((c: string) => c.includes('sqlite_master'))
    expect(pageSizeIndex).toBeGreaterThan(keyIndex)
    expect(pageSizeIndex).toBeLessThan(verifyIndex)
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
    markAuthenticated(VALID_TOKEN) // Re-authenticate after close resets token
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

  it('creates schema tables atomically in a transaction', async () => {
    await getEncryptedDbConnection()
    const calls = mockExecAsync.mock.calls.map((c: unknown[]) => c[0] as string)
    const schemaCall = calls.find((c: string) =>
      c.includes('BEGIN TRANSACTION') && c.includes('CREATE TABLE') && c.includes('COMMIT'),
    )
    expect(schemaCall).toBeDefined()
    expect(schemaCall).toContain('patient_profiles')
    expect(schemaCall).toContain('medical_history')
    expect(schemaCall).toContain('consents')
  })

  it('emits audit event on successful database unlock', async () => {
    await getEncryptedDbConnection()
    expect(emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'Database',
        metadata: { event: 'database_unlock' },
      }),
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

describe('generateUnlockToken', () => {
  it('returns a 64-char hex string', async () => {
    const token = await generateUnlockToken()
    expect(token).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true)
  })
})
