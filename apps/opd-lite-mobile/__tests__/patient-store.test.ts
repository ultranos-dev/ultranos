import * as SQLite from 'expo-sqlite'
import * as SecureStore from 'expo-secure-store'

import { usePatientStore } from '../src/stores/patient-store'
import { resetDbInstance } from '../src/lib/db'

import type { FhirPatient } from '@ultranos/shared-types'

const MOCK_KEY = 'ab'.repeat(32)

function makeMockPatient(overrides: Partial<FhirPatient> = {}): FhirPatient {
  return {
    id: 'patient-001',
    resourceType: 'Patient',
    name: [{ text: 'Ahmed Hassan', family: 'Hassan', given: ['Ahmed'] }],
    gender: 'MALE' as any,
    birthDate: '1985-03-15',
    birthYearOnly: false,
    _ultranos: {
      nameLocal: 'أحمد حسن',
      nationalIdHash: 'abc123hash',
      patient_tier: 'FREE',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    meta: { lastUpdated: '2026-01-15T00:00:00Z' },
    ...overrides,
  } as FhirPatient
}

describe('patient-store', () => {
  let mockDb: any

  beforeEach(() => {
    jest.clearAllMocks()
    resetDbInstance()
    usePatientStore.setState({
      query: '',
      results: [],
      selectedPatient: null,
      isSearching: false,
      syncStatus: { isPending: false, isError: false, lastSyncedAt: null },
    })

    mockDb = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      closeAsync: jest.fn().mockResolvedValue(undefined),
      getFirstAsync: jest.fn(),
      runAsync: jest.fn(),
      getAllAsync: jest.fn().mockResolvedValue([]),
    }

    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(MOCK_KEY)
    ;(SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb)
  })

  describe('initial state', () => {
    it('starts with empty query, results, and no selection', () => {
      const state = usePatientStore.getState()
      expect(state.query).toBe('')
      expect(state.results).toEqual([])
      expect(state.selectedPatient).toBeNull()
      expect(state.isSearching).toBe(false)
    })

    it('has mandatory syncStatus shape', () => {
      const { syncStatus } = usePatientStore.getState()
      expect(syncStatus).toEqual({
        isPending: false,
        isError: false,
        lastSyncedAt: null,
      })
    })
  })

  describe('searchPatients', () => {
    it('queries SQLCipher with search term (local only, no network)', async () => {
      const patient = makeMockPatient()
      mockDb.getAllAsync.mockResolvedValueOnce([{ fhir_json: JSON.stringify(patient) }])

      await usePatientStore.getState().searchPatients('Ahmed')

      const state = usePatientStore.getState()
      expect(state.query).toBe('Ahmed')
      expect(state.results).toHaveLength(1)
      expect(state.results[0].id).toBe('patient-001')
      expect(state.isSearching).toBe(false)

      // Verify the SQL query uses LIKE for name search
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('name_local LIKE'),
        expect.arrayContaining(['%Ahmed%'])
      )
    })

    it('clears results on empty query', async () => {
      await usePatientStore.getState().searchPatients('')

      const state = usePatientStore.getState()
      expect(state.results).toEqual([])
      expect(state.isSearching).toBe(false)
      expect(mockDb.getAllAsync).not.toHaveBeenCalled()
    })

    it('trims whitespace from query', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([])

      await usePatientStore.getState().searchPatients('  Hassan  ')

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['%Hassan%'])
      )
    })

    it('also searches by national_id_hash (exact match)', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([])

      await usePatientStore.getState().searchPatients('abc123hash')

      const callArgs = mockDb.getAllAsync.mock.calls[0]
      expect(callArgs[0]).toContain('national_id_hash = ?')
      expect(callArgs[1]).toContain('abc123hash')
    })
  })

  describe('selectPatient', () => {
    it('selects a patient from results by id', async () => {
      const patient1 = makeMockPatient({ id: 'p1' })
      const patient2 = makeMockPatient({ id: 'p2' })
      mockDb.getAllAsync.mockResolvedValueOnce([
        { fhir_json: JSON.stringify(patient1) },
        { fhir_json: JSON.stringify(patient2) },
      ])

      await usePatientStore.getState().searchPatients('Ahmed')
      usePatientStore.getState().selectPatient('p2')

      expect(usePatientStore.getState().selectedPatient?.id).toBe('p2')
    })

    it('sets null if id not found in results', () => {
      usePatientStore.getState().selectPatient('nonexistent')
      expect(usePatientStore.getState().selectedPatient).toBeNull()
    })
  })

  describe('clearSearch', () => {
    it('resets query, results, and selection', async () => {
      const patient = makeMockPatient()
      mockDb.getAllAsync.mockResolvedValueOnce([{ fhir_json: JSON.stringify(patient) }])

      await usePatientStore.getState().searchPatients('Ahmed')
      usePatientStore.getState().selectPatient('patient-001')
      usePatientStore.getState().clearSearch()

      const state = usePatientStore.getState()
      expect(state.query).toBe('')
      expect(state.results).toEqual([])
      expect(state.selectedPatient).toBeNull()
    })
  })
})
