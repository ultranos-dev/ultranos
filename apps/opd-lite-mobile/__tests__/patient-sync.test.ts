import * as SQLite from 'expo-sqlite'
import * as SecureStore from 'expo-secure-store'

import { syncPatients, mergeAppendOnly } from '../src/services/patient-sync'
import { resetDbInstance } from '../src/lib/db'

import type { FhirPatient } from '@ultranos/shared-types'

const MOCK_KEY = 'ab'.repeat(32)

function makeMockPatient(overrides: Partial<FhirPatient> & Record<string, any> = {}): FhirPatient & Record<string, any> {
  return {
    id: 'patient-001',
    resourceType: 'Patient',
    name: [{ text: 'Ahmed Hassan' }],
    gender: 'MALE',
    birthDate: '1985-03-15',
    birthYearOnly: false,
    _ultranos: {
      nameLocal: 'أحمد حسن',
      nationalIdHash: 'abc123',
      patient_tier: 'FREE',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    meta: { lastUpdated: '000001716000000000:00001:node1' },
    _allergies: ['Penicillin'],
    _activeMeds: ['Metformin'],
    ...overrides,
  } as any
}

describe('patient-sync', () => {
  let mockDb: any

  beforeEach(() => {
    jest.clearAllMocks()
    resetDbInstance()

    mockDb = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      closeAsync: jest.fn().mockResolvedValue(undefined),
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn().mockResolvedValue(undefined),
      getAllAsync: jest.fn().mockResolvedValue([]),
    }

    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(MOCK_KEY)
    ;(SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb)

    // Mock global fetch
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('syncPatients', () => {
    it('fetches patients from Hub API via tRPC raw fetch', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: { data: [] } }),
      })

      await syncPatients(null, 'test-token')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/trpc/patient.list'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
    })

    it('inserts new patients into SQLCipher', async () => {
      const patient = makeMockPatient()
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: { data: [patient] } }),
      })
      mockDb.getFirstAsync.mockResolvedValueOnce(null) // no existing

      const result = await syncPatients(null, 'token')

      expect(result.synced).toBe(1)
      expect(result.errors).toBe(0)
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO patients'),
        expect.arrayContaining(['patient-001'])
      )
    })

    it('throws on non-200 response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      await expect(syncPatients(null, 'bad-token')).rejects.toThrow('Sync failed: 401')
    })
  })

  describe('merge logic', () => {
    it('updates demographics when remote HLC is newer (Tier 3 LWW)', async () => {
      const localPatient = makeMockPatient({
        meta: { lastUpdated: '000001716000000000:00001:node1' },
      })
      const remotePatient = makeMockPatient({
        meta: { lastUpdated: '000001716000000001:00001:node1' }, // newer
        name: [{ text: 'Ahmed Updated' }],
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: { data: [remotePatient] } }),
      })

      mockDb.getFirstAsync.mockResolvedValueOnce({
        fhir_json: JSON.stringify(localPatient),
        allergies_json: '["Penicillin"]',
        active_meds_json: '["Metformin"]',
      })

      const result = await syncPatients(null, 'token')

      expect(result.synced).toBe(1)
      // Should update with remote demographics
      const updateCall = mockDb.runAsync.mock.calls[0]
      expect(updateCall[0]).toContain('UPDATE patients SET')
    })

    it('preserves local demographics when local HLC is newer', async () => {
      const remotePatient = makeMockPatient({
        meta: { lastUpdated: '000001716000000000:00001:node1' }, // older
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: { data: [remotePatient] } }),
      })

      const localPatient = makeMockPatient({
        meta: { lastUpdated: '000001716000000001:00001:node1' }, // newer
        name: [{ text: 'Local Name' }],
      })

      mockDb.getFirstAsync.mockResolvedValueOnce({
        fhir_json: JSON.stringify(localPatient),
        allergies_json: '[]',
        active_meds_json: '[]',
      })

      await syncPatients(null, 'token')

      // The update call should use localPatient's name since it's newer
      const updateCall = mockDb.runAsync.mock.calls[0]
      const fhirJsonArg = updateCall[1][updateCall[1].length - 2] // fhir_json is second-to-last
      expect(fhirJsonArg).toContain('Local Name')
    })
  })

  describe('mergeAppendOnly (Tier 1)', () => {
    it('merges allergies using append-only (union)', () => {
      const result = mergeAppendOnly(['Penicillin'], ['Penicillin', 'Sulfa'])
      expect(result).toContain('Penicillin')
      expect(result).toContain('Sulfa')
      expect(result).toHaveLength(2)
    })

    it('preserves all items from both sides (never loses data)', () => {
      const local = ['Aspirin', 'Ibuprofen']
      const remote = ['Ibuprofen', 'Codeine']
      const result = mergeAppendOnly(local, remote)
      expect(result).toHaveLength(3)
      expect(result).toContain('Aspirin')
      expect(result).toContain('Ibuprofen')
      expect(result).toContain('Codeine')
    })

    it('handles empty arrays', () => {
      expect(mergeAppendOnly([], ['Penicillin'])).toEqual(['Penicillin'])
      expect(mergeAppendOnly(['Penicillin'], [])).toEqual(['Penicillin'])
      expect(mergeAppendOnly([], [])).toEqual([])
    })
  })
})
