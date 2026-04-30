import { describe, it, expect, beforeEach } from 'vitest'
import { usePatientStore } from '@/stores/patient-store'
import type { FhirPatient } from '@ultranos/shared-types'
import { AdministrativeGender } from '@ultranos/shared-types'

function makePatient(id: string, nameLocal: string): FhirPatient {
  return {
    id,
    resourceType: 'Patient',
    name: [{ text: nameLocal }],
    gender: AdministrativeGender.MALE,
    birthDate: '1985-03-15',
    birthYearOnly: false,
    _ultranos: {
      nameLocal,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    meta: {
      lastUpdated: new Date().toISOString(),
    },
  }
}

describe('patient store', () => {
  beforeEach(() => {
    // Reset store between tests
    usePatientStore.setState({
      query: '',
      results: [],
      selectedPatient: null,
      isSearching: false,
      syncStatus: { isPending: false, isError: false, lastSyncedAt: null },
    })
  })

  it('should initialize with default state', () => {
    const state = usePatientStore.getState()
    expect(state.query).toBe('')
    expect(state.results).toEqual([])
    expect(state.selectedPatient).toBeNull()
    expect(state.isSearching).toBe(false)
    expect(state.syncStatus.isPending).toBe(false)
    expect(state.syncStatus.isError).toBe(false)
    expect(state.syncStatus.lastSyncedAt).toBeNull()
  })

  it('should set query', () => {
    usePatientStore.getState().setQuery('Ahmed')
    expect(usePatientStore.getState().query).toBe('Ahmed')
  })

  it('should set search results', () => {
    const patients = [
      makePatient('id-1', 'Ahmed'),
      makePatient('id-2', 'Fatima'),
    ]
    usePatientStore.getState().setResults(patients)
    expect(usePatientStore.getState().results).toHaveLength(2)
  })

  it('should select a patient', () => {
    const patient = makePatient('id-1', 'Ahmed')
    usePatientStore.getState().selectPatient(patient)
    expect(usePatientStore.getState().selectedPatient).toEqual(patient)
  })

  it('should clear search state', () => {
    usePatientStore.getState().setQuery('test')
    usePatientStore.getState().setResults([makePatient('id-1', 'Ahmed')])
    usePatientStore.getState().clearSearch()

    const state = usePatientStore.getState()
    expect(state.query).toBe('')
    expect(state.results).toEqual([])
    expect(state.isSearching).toBe(false)
  })

  it('should track searching state', () => {
    usePatientStore.getState().setIsSearching(true)
    expect(usePatientStore.getState().isSearching).toBe(true)

    usePatientStore.getState().setIsSearching(false)
    expect(usePatientStore.getState().isSearching).toBe(false)
  })

  it('should update sync status', () => {
    const now = new Date().toISOString()
    usePatientStore.getState().setSyncStatus({ isPending: false, isError: false, lastSyncedAt: now })
    expect(usePatientStore.getState().syncStatus.lastSyncedAt).toBe(now)
  })

  it('should not lose selected patient when clearing search', () => {
    const patient = makePatient('id-1', 'Ahmed')
    usePatientStore.getState().selectPatient(patient)
    usePatientStore.getState().clearSearch()
    // Selected patient persists after search clear
    expect(usePatientStore.getState().selectedPatient).toEqual(patient)
  })
})
