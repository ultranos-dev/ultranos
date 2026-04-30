import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { db } from '@/lib/db'
import { usePatientStore } from '@/stores/patient-store'
import { AdministrativeGender } from '@ultranos/shared-types'
import type { FhirPatient } from '@ultranos/shared-types'

function makePatient(id: string, nameLocal: string): FhirPatient {
  return {
    id,
    resourceType: 'Patient',
    name: [{ text: nameLocal }],
    gender: AdministrativeGender.MALE,
    birthDate: '1990-01-01',
    birthYearOnly: false,
    _ultranos: {
      nameLocal,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    meta: { lastUpdated: new Date().toISOString() },
  }
}

// Mock the trpc module to avoid actual network calls
vi.mock('@/lib/trpc', () => ({
  searchPatientsOnHub: vi.fn(),
}))

import { searchPatientsOnHub } from '@/lib/trpc'
import { useSync } from '@/lib/use-sync'

const mockSearchPatientsOnHub = vi.mocked(searchPatientsOnHub)

describe('useSync hook', () => {
  beforeEach(async () => {
    await db.patients.clear()
    usePatientStore.setState({
      query: '',
      results: [],
      selectedPatient: null,
      isSearching: false,
      syncStatus: { isPending: false, isError: false, lastSyncedAt: null },
    })
    mockSearchPatientsOnHub.mockReset()
  })

  it('should fetch from Hub and cache results in Dexie', async () => {
    const hubPatient = makePatient('hub-1', 'Ahmed from Hub')
    mockSearchPatientsOnHub.mockResolvedValueOnce({ patients: [hubPatient] })

    const { result } = renderHook(() => useSync())

    let patients: FhirPatient[] = []
    await act(async () => {
      patients = await result.current.revalidate('Ahmed')
    })

    expect(patients).toHaveLength(1)
    expect(patients[0]!.id).toBe('hub-1')

    // Verify cached in Dexie
    const cached = await db.patients.get('hub-1')
    expect(cached).toBeDefined()
    expect(cached!._ultranos.nameLocal).toBe('Ahmed from Hub')
  })

  it('should update syncStatus to success after revalidation', async () => {
    mockSearchPatientsOnHub.mockResolvedValueOnce({ patients: [] })

    const { result } = renderHook(() => useSync())

    await act(async () => {
      await result.current.revalidate('test')
    })

    const { syncStatus } = usePatientStore.getState()
    expect(syncStatus.isPending).toBe(false)
    expect(syncStatus.isError).toBe(false)
    expect(syncStatus.lastSyncedAt).not.toBeNull()
  })

  it('should set isError on network failure and return empty array', async () => {
    mockSearchPatientsOnHub.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useSync())

    let patients: FhirPatient[] = []
    await act(async () => {
      patients = await result.current.revalidate('test')
    })

    expect(patients).toEqual([])
    const { syncStatus } = usePatientStore.getState()
    expect(syncStatus.isError).toBe(true)
    expect(syncStatus.isPending).toBe(false)
  })

  it('should not overwrite Dexie if Hub returns empty results', async () => {
    const localPatient = makePatient('local-1', 'Local Ahmed')
    await db.patients.add(localPatient)

    mockSearchPatientsOnHub.mockResolvedValueOnce({ patients: [] })

    const { result } = renderHook(() => useSync())

    await act(async () => {
      await result.current.revalidate('Ahmed')
    })

    // Local record should still exist
    const cached = await db.patients.get('local-1')
    expect(cached).toBeDefined()
  })
})
