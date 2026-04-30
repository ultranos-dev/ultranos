/**
 * Tests for migration from unencrypted SecureStore to SQLCipher.
 *
 * Verifies:
 * - AC5: Existing plain-text SQLite/SecureStore data migrated on first run
 * - Developer Guardrail: backup/check before migration
 * - Developer Guardrail: securely delete old unencrypted file
 */

import * as SecureStore from 'expo-secure-store'

const mockRunAsync = jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 })
const mockGetFirstAsync = jest.fn()
const mockExecAsync = jest.fn().mockResolvedValue(undefined)

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync: mockExecAsync,
    runAsync: mockRunAsync,
    getFirstAsync: mockGetFirstAsync,
    closeAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
  }),
}))

jest.mock('@/lib/mobile-key-service')
jest.mock('@/lib/encrypted-db')

import { getEncryptedDbConnection } from '@/lib/encrypted-db'
import { migrateFromSecureStore, isMigrationNeeded } from '@/lib/migration'

const mockedGetDb = getEncryptedDbConnection as jest.MockedFunction<typeof getEncryptedDbConnection>

describe('isMigrationNeeded', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns true when SecureStore has patient profile data', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('{"id":"p1"}')

    const result = await isMigrationNeeded()

    expect(result).toBe(true)
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('ultranos_patient_profile')
  })

  it('returns false when SecureStore has no patient data', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)

    const result = await isMigrationNeeded()

    expect(result).toBe(false)
  })
})

describe('migrateFromSecureStore', () => {
  const mockDb = {
    execAsync: mockExecAsync,
    runAsync: mockRunAsync,
    getFirstAsync: mockGetFirstAsync,
    closeAsync: jest.fn(),
    getAllAsync: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetDb.mockResolvedValue(mockDb as any)
  })

  it('migrates patient profile from SecureStore to SQLCipher', async () => {
    const patientData = JSON.stringify({
      resourceType: 'Patient',
      id: 'patient-1',
      name: [{ family: 'Test', given: ['User'] }],
    })
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
      if (key === 'ultranos_patient_profile') return Promise.resolve(patientData)
      return Promise.resolve(null)
    })

    const result = await migrateFromSecureStore()

    expect(result.patientProfileMigrated).toBe(true)
    expect(mockExecAsync).toHaveBeenCalledWith('BEGIN TRANSACTION')
    expect(mockExecAsync).toHaveBeenCalledWith('COMMIT')
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO patient_profiles'),
      expect.any(Array),
    )
  })

  it('migrates medical history from SecureStore', async () => {
    const historyData = JSON.stringify({
      encounters: [{ id: 'enc-1', resourceType: 'Encounter' }],
      medications: [{ id: 'med-1', resourceType: 'MedicationRequest' }],
    })
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
      if (key === 'ultranos_medical_history_patient-1') return Promise.resolve(historyData)
      if (key === 'ultranos_patient_profile') {
        return Promise.resolve(JSON.stringify({ id: 'patient-1' }))
      }
      return Promise.resolve(null)
    })

    const result = await migrateFromSecureStore()

    expect(result.medicalHistoryMigrated).toBe(true)
  })

  it('deletes SecureStore entries after successful migration', async () => {
    const patientData = JSON.stringify({ id: 'patient-1' })
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
      if (key === 'ultranos_patient_profile') return Promise.resolve(patientData)
      return Promise.resolve(null)
    })

    await migrateFromSecureStore()

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ultranos_patient_profile')
  })

  it('returns no-op result when no data to migrate', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)

    const result = await migrateFromSecureStore()

    expect(result.patientProfileMigrated).toBe(false)
    expect(result.medicalHistoryMigrated).toBe(false)
    expect(result.consentsMigrated).toBe(false)
  })

  it('does not delete SecureStore data if migration INSERT fails', async () => {
    const patientData = JSON.stringify({ id: 'patient-1' })
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
      if (key === 'ultranos_patient_profile') return Promise.resolve(patientData)
      return Promise.resolve(null)
    })
    mockRunAsync.mockRejectedValueOnce(new Error('DB write failed'))

    await expect(migrateFromSecureStore()).rejects.toThrow('DB write failed')

    // Transaction should be rolled back
    expect(mockExecAsync).toHaveBeenCalledWith('ROLLBACK')
    // SecureStore data should NOT be deleted after failed migration
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith('ultranos_patient_profile')
  })

  it('aborts migration on corrupt JSON in SecureStore', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
      if (key === 'ultranos_patient_profile') return Promise.resolve('{corrupt')
      return Promise.resolve(null)
    })

    await expect(migrateFromSecureStore()).rejects.toThrow('Corrupt patient profile')
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
  })

  it('aborts migration when patient profile has no id', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
      if (key === 'ultranos_patient_profile') return Promise.resolve('{"name":"test"}')
      return Promise.resolve(null)
    })

    await expect(migrateFromSecureStore()).rejects.toThrow('missing id field')
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
  })
})
