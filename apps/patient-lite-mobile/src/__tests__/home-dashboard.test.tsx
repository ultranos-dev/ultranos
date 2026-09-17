import { render, fireEvent, waitFor } from '@testing-library/react-native'

// --- Mocks must be declared before imports ---

const mockPatient = {
  id: 'patient-uuid-123',
  resourceType: 'Patient',
  name: [{ given: ['Fatima'], family: 'Al-Rashid', text: 'Fatima Al-Rashid' }],
  gender: 'female',
  birthDate: '1990-05-15',
  birthYearOnly: false,
  identifier: [],
  _ultranos: { nameLocal: 'فاطمة الرشيد', createdAt: '2026-01-01T00:00:00Z', hlcTimestamp: 'hlc1' },
  meta: { lastUpdated: '2026-01-01T00:00:00Z', versionId: '1' },
}

const mockActiveAllergy = {
  id: 'allergy-1',
  resourceType: 'AllergyIntolerance' as const,
  clinicalStatus: {
    coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical' as const, code: 'active' as const }],
  },
  verificationStatus: {
    coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification' as const, code: 'confirmed' as const }],
  },
  type: 'allergy' as const,
  criticality: 'high' as const,
  code: { coding: [{ system: 'http://snomed.info/sct', code: '91936005', display: 'Penicillin' }] },
  patient: { reference: 'Patient/patient-uuid-123' },
  _ultranos: {
    createdAt: '2026-01-01T00:00:00Z',
    recordedByRole: 'doctor',
    isOfflineCreated: false,
    hlcTimestamp: 'hlc1',
  },
  meta: { lastUpdated: '2026-01-01T00:00:00Z', versionId: '1' },
}

const mockMedicationEvent = {
  id: 'med-1',
  type: 'medication' as const,
  date: '2026-05-01T00:00:00Z',
  label: 'Amoxicillin',
  icon: 'pill' as const,
  isSensitive: false,
  status: 'active',
  resource: {} as any,
}

const mockEncounterEvent = {
  id: 'enc-1',
  type: 'encounter' as const,
  date: '2026-04-20T00:00:00Z',
  label: 'General checkup',
  icon: 'stethoscope' as const,
  isSensitive: false,
  status: 'finished',
  resource: {} as any,
}

let mockProfileLoading = false
let mockPatientData: typeof mockPatient | null = mockPatient
let mockHistoryLoading = false
let mockHistoryError: string | null = null
let mockActiveAllergies: typeof mockActiveAllergy[] = []
let mockActiveMeds: typeof mockMedicationEvent[] = []
let mockEvents: (typeof mockEncounterEvent | typeof mockMedicationEvent)[] = []
let mockUnreadCount = 0

const mockRefreshProfile = jest.fn().mockResolvedValue(undefined)
const mockRefreshHistory = jest.fn().mockResolvedValue(undefined)
const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
const mockGetParent = jest.fn(() => ({ navigate: mockNavigate }))

jest.mock('@/hooks/usePatientProfile', () => ({
  usePatientProfile: () => ({
    patient: mockPatientData,
    isLoading: mockProfileLoading,
    error: null,
    refresh: mockRefreshProfile,
    updateProfile: jest.fn(),
    clearProfile: jest.fn(),
  }),
}))

jest.mock('@/hooks/useMedicalHistory', () => ({
  useMedicalHistory: () => ({
    events: mockEvents,
    activeMedications: mockActiveMeds,
    activeAllergies: mockActiveAllergies,
    isLoading: mockHistoryLoading,
    error: mockHistoryError,
    refresh: mockRefreshHistory,
  }),
}))

jest.mock('@/hooks/useUnreadNotificationCount', () => ({
  useUnreadNotificationCount: () => mockUnreadCount,
}))

jest.mock('@/hooks/useAppLocale', () => ({
  useAppLocale: () => ({ locale: 'en', dir: 'ltr', setLocale: jest.fn() }),
}))

jest.mock('@ultranos/ui-kit/utils/format', () => ({
  formatDate: (date: string) => date ? new Date(date).toLocaleDateString('en') : '',
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    getParent: mockGetParent,
  }),
}))

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ children }: any) => children,
  }),
}))

jest.mock('react-native-qrcode-svg', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: (props: any) => React.createElement(View, { testID: 'mock-qr-code', ...props }),
  }
})

// i18next mock — resolves keys against en.json so translation assertions work
const mockMessages = require('../../messages/en.json')
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      // Fall back to defaultValue if key not found
      const parts = key.split('.')
      let value: any = mockMessages
      for (const part of parts) {
        if (value && typeof value === 'object') value = value[part]
        else {
          if (params && 'defaultValue' in params) return String(params.defaultValue)
          return key
        }
      }
      if (typeof value !== 'string') {
        if (params && 'defaultValue' in params) return String(params.defaultValue)
        return key
      }
      if (params) {
        let text = value
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
        }
        return text
      }
      return value
    },
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
  Trans: ({ children }: any) => children,
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}))

import { HomeDashboardScreen } from '@/screens/HomeDashboardScreen'

describe('HomeDashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPatientData = mockPatient
    mockProfileLoading = false
    mockHistoryLoading = false
    mockHistoryError = null
    mockActiveAllergies = []
    mockActiveMeds = []
    mockEvents = []
    mockUnreadCount = 0
  })

  // --- AC #1: Home tab displays a dashboard ---
  it('renders the home dashboard with all sections', () => {
    const { getByTestId } = render(<HomeDashboardScreen />)
    expect(getByTestId('home-dashboard')).toBeTruthy()
    expect(getByTestId('patient-summary-card')).toBeTruthy()
    expect(getByTestId('qr-section')).toBeTruthy()
    expect(getByTestId('medications-section')).toBeTruthy()
  })

  // --- AC #3: Allergy section wrapper exists and appears in the dashboard ---
  it('allergy-section wrapper is present and all major sections render', () => {
    const { getByTestId } = render(<HomeDashboardScreen />)

    // All key sections are present (allergy-section wraps AllergyBanner per CLAUDE.md rule #4)
    expect(getByTestId('allergy-section')).toBeTruthy()
    expect(getByTestId('patient-summary-card')).toBeTruthy()
    expect(getByTestId('qr-section')).toBeTruthy()
    expect(getByTestId('medications-section')).toBeTruthy()
  })

  // --- AC #3: Active allergies render in AllergyBanner ---
  it('renders active allergies in AllergyBanner when allergies exist', () => {
    mockActiveAllergies = [mockActiveAllergy]
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('allergy-section')).toBeTruthy()
    // AllergyBanner renders items with allergy-banner-item-{id}
    expect(getByTestId(`allergy-banner-item-${mockActiveAllergy.id}`)).toBeTruthy()
    expect(getByText('Penicillin')).toBeTruthy()
  })

  // --- AC #4: No allergies shows "No Known Allergies" when confirmed empty ---
  it('shows "No Known Allergies" when history loaded and no active allergies exist', () => {
    mockActiveAllergies = []
    mockHistoryLoading = false
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    // AllergyBanner renders allergy-banner-none when loaded + empty
    expect(getByTestId('allergy-banner-none')).toBeTruthy()
    expect(getByText('No Known Allergies')).toBeTruthy()
  })

  // --- PHI SAFETY: No "No Known Allergies" flash during history loading ---
  it('does NOT show "No Known Allergies" while history is loading (no false-negative empty)', () => {
    mockActiveAllergies = []
    mockHistoryLoading = true
    const { queryByTestId, queryByText } = render(<HomeDashboardScreen />)

    expect(queryByTestId('allergy-banner-none')).toBeNull()
    expect(queryByText('No Known Allergies')).toBeNull()
    // Loading indicator should be shown instead
    expect(queryByTestId('allergy-banner-loading')).toBeTruthy()
  })

  // --- PHI SAFETY: Error → "unavailable", not empty ---
  it('shows allergy "unavailable" on history error instead of "No Known Allergies"', () => {
    mockActiveAllergies = []
    mockHistoryLoading = false
    mockHistoryError = 'Failed to load medical history'
    const { queryByTestId, queryByText, getByTestId } = render(<HomeDashboardScreen />)

    expect(queryByTestId('allergy-banner-none')).toBeNull()
    expect(queryByText('No Known Allergies')).toBeNull()
    expect(getByTestId('allergy-banner-error')).toBeTruthy()
  })

  // --- AC #2: Summary card shows patient info ---
  it('displays patient name, age, gender in summary card', () => {
    const { getByTestId } = render(<HomeDashboardScreen />)

    expect(getByTestId('summary-patient-name')).toBeTruthy()
    expect(getByTestId('summary-patient-age')).toBeTruthy()
    expect(getByTestId('summary-patient-gender')).toBeTruthy()
  })

  // --- AC #5: QR code is displayed ---
  it('renders QR code section with validity indicator', () => {
    const { getByTestId } = render(<HomeDashboardScreen />)

    expect(getByTestId('qr-section')).toBeTruthy()
    expect(getByTestId('patient-qr-code')).toBeTruthy()
    expect(getByTestId('qr-valid-badge')).toBeTruthy()
  })

  // --- AC #6: Unverified badge when no signature ---
  it('shows unverified badge when ECDSA signature is not available', () => {
    const { getAllByTestId } = render(<HomeDashboardScreen />)

    const badges = getAllByTestId('qr-unverified-badge')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  // --- AC #7: Tap QR opens full screen ---
  it('navigates to QRFullScreen on QR section tap', () => {
    const { getByTestId } = render(<HomeDashboardScreen />)

    fireEvent.press(getByTestId('qr-section'))
    expect(mockNavigate).toHaveBeenCalledWith('QRFullScreen')
  })

  // --- AC #8: Medications count with View link ---
  it('shows active medications count with View All link', () => {
    mockActiveMeds = [mockMedicationEvent, { ...mockMedicationEvent, id: 'med-2' }]
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('medications-section')).toBeTruthy()
    expect(getByText('2 Active Medications')).toBeTruthy()
    expect(getByTestId('medications-view-all')).toBeTruthy()
  })

  it('navigates to Timeline tab when View All is pressed', () => {
    mockActiveMeds = [mockMedicationEvent]
    const { getByTestId } = render(<HomeDashboardScreen />)

    fireEvent.press(getByTestId('medications-view-all'))
    expect(mockNavigate).toHaveBeenCalledWith('TimelineTab')
  })

  it('shows "No Active Medications" when loaded-zero count', () => {
    mockActiveMeds = []
    mockHistoryLoading = false
    const { getByText, queryByTestId } = render(<HomeDashboardScreen />)

    expect(getByText('No Active Medications')).toBeTruthy()
    expect(queryByTestId('medications-view-all')).toBeNull()
  })

  // --- PHI SAFETY: No "No Active Medications" while loading ---
  it('does NOT show "No Active Medications" while history is loading', () => {
    mockActiveMeds = []
    mockHistoryLoading = true
    const { queryByText, getByTestId } = render(<HomeDashboardScreen />)

    expect(queryByText('No Active Medications')).toBeNull()
    expect(getByTestId('medications-section-loading')).toBeTruthy()
  })

  // --- Medications: error state shows "unavailable" not empty ---
  it('shows medications "unavailable" on history error', () => {
    mockActiveMeds = []
    mockHistoryLoading = false
    mockHistoryError = 'Failed to load medical history'
    const { getByText, getByTestId, queryByText } = render(<HomeDashboardScreen />)

    expect(queryByText('No Active Medications')).toBeNull()
    expect(getByTestId('medications-section-error')).toBeTruthy()
    expect(getByText('Medications unavailable')).toBeTruthy()
  })

  // --- AC #9: Recent activity ---
  it('shows last encounter and prescription dates when history loaded', () => {
    mockEvents = [mockEncounterEvent, mockMedicationEvent]
    const { getByTestId } = render(<HomeDashboardScreen />)

    expect(getByTestId('recent-activity-section')).toBeTruthy()
    expect(getByTestId('last-encounter-date')).toBeTruthy()
    expect(getByTestId('last-prescription-date')).toBeTruthy()
  })

  it('shows "No recent activity" when loaded-zero activity', () => {
    mockEvents = []
    mockHistoryLoading = false
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('recent-activity-empty')).toBeTruthy()
    expect(getByText('No recent activity')).toBeTruthy()
  })

  // --- PHI SAFETY: No "No recent activity" while loading ---
  it('does NOT show "No recent activity" while history is loading', () => {
    mockEvents = []
    mockHistoryLoading = true
    const { queryByText, getByTestId } = render(<HomeDashboardScreen />)

    expect(queryByText('No recent activity')).toBeNull()
    expect(getByTestId('recent-activity-loading')).toBeTruthy()
  })

  // --- Recent activity: error state shows "unavailable" not empty ---
  it('shows recent activity "unavailable" on history error', () => {
    mockEvents = []
    mockHistoryLoading = false
    mockHistoryError = 'Failed to load medical history'
    const { queryByText, getByTestId, getByText } = render(<HomeDashboardScreen />)

    expect(queryByText('No recent activity')).toBeNull()
    expect(getByTestId('recent-activity-error')).toBeTruthy()
    expect(getByText('Recent activity unavailable')).toBeTruthy()
  })

  // --- AC #10: Notification badge ---
  it('shows notification badge when unread notifications exist', () => {
    mockUnreadCount = 5
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('notification-badge')).toBeTruthy()
    expect(getByText('5')).toBeTruthy()
  })

  it('does not show notification badge when count is zero', () => {
    mockUnreadCount = 0
    const { queryByTestId } = render(<HomeDashboardScreen />)

    expect(queryByTestId('notification-badge')).toBeNull()
  })

  it('caps notification badge at 99+', () => {
    mockUnreadCount = 150
    const { getByText } = render(<HomeDashboardScreen />)

    expect(getByText('99+')).toBeTruthy()
  })

  // --- AC #11: Loading state ---
  it('renders loading skeleton during initial data fetch', () => {
    mockProfileLoading = true
    mockPatientData = null
    const { getByTestId } = render(<HomeDashboardScreen />)

    expect(getByTestId('dashboard-skeleton')).toBeTruthy()
  })

  // --- AC #13: Empty state for new patients ---
  it('renders empty state for new patients with no data', () => {
    mockProfileLoading = false
    mockPatientData = null
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('dashboard-empty')).toBeTruthy()
    expect(getByText('Your health information will appear here after your first visit')).toBeTruthy()
  })

  // --- AC #12: Pull-to-refresh ---
  it('supports pull-to-refresh that triggers sync', async () => {
    const { getByTestId } = render(<HomeDashboardScreen />)
    const scrollView = getByTestId('home-dashboard')

    expect(scrollView.props.refreshControl).toBeTruthy()

    const refreshControl = scrollView.props.refreshControl
    await refreshControl.props.onRefresh()

    expect(mockRefreshProfile).toHaveBeenCalled()
    expect(mockRefreshHistory).toHaveBeenCalled()
  })

  // --- Multiple allergies ---
  it('renders multiple allergy items when patient has several allergies', () => {
    const secondAllergy = {
      ...mockActiveAllergy,
      id: 'allergy-2',
      code: { coding: [{ system: 'http://snomed.info/sct', code: '70618', display: 'Sulfa drugs' }] },
      criticality: 'low' as const,
    }
    mockActiveAllergies = [mockActiveAllergy, secondAllergy]
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('allergy-banner-item-allergy-1')).toBeTruthy()
    expect(getByTestId('allergy-banner-item-allergy-2')).toBeTruthy()
    expect(getByText('Penicillin')).toBeTruthy()
    expect(getByText('Sulfa drugs')).toBeTruthy()
  })
})
