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
    // Hub returns meta.lastUpdated as an ISO 8601 instant, never a serialized HLC.
    meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    _allergies: ['Penicillin'],
    _activeMeds: ['Metformin'],
    ...overrides,
  } as any
}

/** Build the real tRPC REST bridge response shape: result.data.json.{patients,nextCursor}. */
function mockPage(patients: any[], nextCursor: string | null = null) {
  return {
    ok: true,
    json: () => Promise.resolve({ result: { data: { json: { patients, nextCursor } } } }),
  }
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
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockPage([]))

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
      // Input must be the real contract: { json: { limit } } wrapped, cursor-driven (no `since`).
      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string
      const input = new URL(calledUrl).searchParams.get('input')!
      expect(JSON.parse(input)).toEqual({ json: { limit: 50 } })
      expect(input).not.toContain('since')
    })

    it('inserts new patients into SQLCipher (reads result.data.json.patients)', async () => {
      const patient = makeMockPatient()
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockPage([patient]))
      mockDb.getFirstAsync.mockResolvedValueOnce(null) // no existing

      const result = await syncPatients(null, 'token')

      expect(result.synced).toBe(1)
      expect(result.errors).toBe(0)
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO patients'),
        expect.arrayContaining(['patient-001'])
      )
    })

    it('follows nextCursor across pages, accumulating all patients', async () => {
      const page1 = makeMockPatient({ id: 'patient-001' })
      const page2 = makeMockPatient({ id: 'patient-002' })

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockPage([page1], 'cursor-page-2'))
        .mockResolvedValueOnce(mockPage([page2], null))
      mockDb.getFirstAsync.mockResolvedValue(null) // all new

      const result = await syncPatients(null, 'token')

      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(result.synced).toBe(2)
      // Second fetch must carry the cursor returned by the first page.
      const secondUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string
      const secondInput = JSON.parse(new URL(secondUrl).searchParams.get('input')!)
      expect(secondInput).toEqual({ json: { limit: 50, cursor: 'cursor-page-2' } })
    })

    it('collects per-record failures with opaque id + error class (no PHI)', async () => {
      const patient = makeMockPatient({ id: 'patient-777' })
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockPage([patient]))
      mockDb.getFirstAsync.mockResolvedValueOnce(null)
      mockDb.runAsync.mockRejectedValueOnce(new TypeError('boom'))

      const result = await syncPatients(null, 'token')

      expect(result.synced).toBe(0)
      expect(result.errors).toBe(1)
      expect(result.errorDetails).toEqual([{ id: 'patient-777', reason: 'TypeError' }])
      // No PHI leaked into error details.
      const serialized = JSON.stringify(result.errorDetails)
      expect(serialized).not.toContain('Ahmed')
      expect(serialized).not.toContain('Penicillin')
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
    it('updates demographics when remote ISO timestamp is newer (Tier 3 LWW)', async () => {
      const localPatient = makeMockPatient({
        meta: { lastUpdated: '2026-01-01T00:00:00Z' },
      })
      const remotePatient = makeMockPatient({
        meta: { lastUpdated: '2026-02-01T00:00:00Z' }, // newer ISO instant
        name: [{ text: 'Ahmed Updated' }],
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockPage([remotePatient]))

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
      const fhirJsonArg = updateCall[1][updateCall[1].length - 2] // fhir_json is second-to-last
      expect(fhirJsonArg).toContain('Ahmed Updated')
    })

    it('preserves local demographics when local ISO timestamp is newer', async () => {
      const remotePatient = makeMockPatient({
        meta: { lastUpdated: '2026-01-01T00:00:00Z' }, // older
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockPage([remotePatient]))

      const localPatient = makeMockPatient({
        meta: { lastUpdated: '2026-06-01T00:00:00Z' }, // newer ISO instant
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
