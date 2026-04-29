import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  savePatientProfile,
  loadPatientProfile,
  clearPatientProfile,
  wipeMemoryStore,
} from '@/lib/offline-store'
import type { FhirPatient } from '@ultranos/shared-types'
import { AdministrativeGender } from '@ultranos/shared-types'

jest.mock('expo-secure-store')

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

describe('offline-store', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    wipeMemoryStore()
  })

  describe('mobile (non-web)', () => {
    const originalOS = Platform.OS

    beforeAll(() => {
      // @ts-expect-error - mocking Platform.OS
      Platform.OS = 'ios'
    })

    afterAll(() => {
      // @ts-expect-error - restoring Platform.OS
      Platform.OS = originalOS
    })

    it('saves patient profile to secure store', async () => {
      await savePatientProfile(MOCK_PATIENT)
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'ultranos_patient_profile',
        JSON.stringify(MOCK_PATIENT),
      )
    })

    it('loads patient profile from secure store', async () => {
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
        JSON.stringify(MOCK_PATIENT),
      )

      const result = await loadPatientProfile()
      expect(result).toEqual(MOCK_PATIENT)
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
        'ultranos_patient_profile',
      )
    })

    it('returns null when no profile cached', async () => {
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
      const result = await loadPatientProfile()
      expect(result).toBeNull()
    })

    it('clears patient profile from secure store', async () => {
      await clearPatientProfile()
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        'ultranos_patient_profile',
      )
    })
  })

  describe('PWA (web) — Key-in-Memory enforcement (AC: 3)', () => {
    const originalOS = Platform.OS

    beforeAll(() => {
      // @ts-expect-error - mocking Platform.OS
      Platform.OS = 'web'
    })

    afterAll(() => {
      // @ts-expect-error - restoring Platform.OS
      Platform.OS = originalOS
    })

    it('stores profile in memory only — never localStorage/sessionStorage', async () => {
      await savePatientProfile(MOCK_PATIENT)

      // Should NOT use SecureStore on web
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled()

      // Should be loadable from memory
      const result = await loadPatientProfile()
      expect(result).toEqual(MOCK_PATIENT)
    })

    it('wipeMemoryStore clears all in-memory data (tab close / logout)', async () => {
      await savePatientProfile(MOCK_PATIENT)

      // Verify data exists
      let result = await loadPatientProfile()
      expect(result).toEqual(MOCK_PATIENT)

      // Wipe
      wipeMemoryStore()

      // Data should be gone
      result = await loadPatientProfile()
      expect(result).toBeNull()
    })

    it('clearPatientProfile removes only the profile key from memory', async () => {
      await savePatientProfile(MOCK_PATIENT)
      await clearPatientProfile()

      const result = await loadPatientProfile()
      expect(result).toBeNull()
    })
  })
})
