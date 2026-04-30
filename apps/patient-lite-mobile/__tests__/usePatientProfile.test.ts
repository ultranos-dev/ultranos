import { renderHook, act, waitFor } from '@testing-library/react-native'
import { usePatientProfile } from '@/hooks/usePatientProfile'
import * as offlineStore from '@/lib/offline-store'
import type { FhirPatient } from '@ultranos/shared-types'
import { AdministrativeGender } from '@ultranos/shared-types'

jest.mock('@/lib/offline-store')
jest.mock('@/lib/audit')

const mockLoadProfile = jest.mocked(offlineStore.loadPatientProfile)
const mockSaveProfile = jest.mocked(offlineStore.savePatientProfile)
const mockClearProfile = jest.mocked(offlineStore.clearPatientProfile)

const MOCK_PATIENT: FhirPatient = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  resourceType: 'Patient',
  name: [{ given: ['Fatima'], family: 'Al-Rashid' }],
  gender: AdministrativeGender.FEMALE,
  birthDate: '1990-03-15',
  birthYearOnly: false,
  _ultranos: {
    nameLocal: 'فاطمة الرشيد',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  meta: { lastUpdated: '2026-04-28T10:00:00Z' },
}

describe('usePatientProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('loads patient from local storage on mount (AC: 3 - offline first)', async () => {
    mockLoadProfile.mockResolvedValue(MOCK_PATIENT)

    const { result } = renderHook(() => usePatientProfile())

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.patient).toEqual(MOCK_PATIENT)
    expect(result.current.error).toBeNull()
    expect(mockLoadProfile).toHaveBeenCalledTimes(1)
  })

  it('returns null patient when no cached data exists', async () => {
    mockLoadProfile.mockResolvedValue(null)

    const { result } = renderHook(() => usePatientProfile())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.patient).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('sets error state when load fails', async () => {
    mockLoadProfile.mockRejectedValue(new Error('Storage corrupted'))

    const { result } = renderHook(() => usePatientProfile())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.patient).toBeNull()
    expect(result.current.error).toBe('Storage corrupted')
  })

  it('updateProfile saves to local store and updates state (sync engine integration)', async () => {
    mockLoadProfile.mockResolvedValue(null)
    mockSaveProfile.mockResolvedValue(undefined)

    const { result } = renderHook(() => usePatientProfile())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.updateProfile(MOCK_PATIENT)
    })

    expect(mockSaveProfile).toHaveBeenCalledWith(MOCK_PATIENT)
    expect(result.current.patient).toEqual(MOCK_PATIENT)
    expect(result.current.error).toBeNull()
  })

  it('clearProfile wipes local store (logout / tab close)', async () => {
    mockLoadProfile.mockResolvedValue(MOCK_PATIENT)
    mockClearProfile.mockResolvedValue(undefined)

    const { result } = renderHook(() => usePatientProfile())

    await waitFor(() => {
      expect(result.current.patient).toEqual(MOCK_PATIENT)
    })

    await act(async () => {
      await result.current.clearProfile()
    })

    expect(mockClearProfile).toHaveBeenCalledTimes(1)
    expect(result.current.patient).toBeNull()
  })

  it('refresh reloads from local store', async () => {
    mockLoadProfile.mockResolvedValueOnce(null)

    const { result } = renderHook(() => usePatientProfile())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.patient).toBeNull()

    // Simulate sync engine having updated the store
    mockLoadProfile.mockResolvedValueOnce(MOCK_PATIENT)

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.patient).toEqual(MOCK_PATIENT)
    expect(mockLoadProfile).toHaveBeenCalledTimes(2)
  })
})
