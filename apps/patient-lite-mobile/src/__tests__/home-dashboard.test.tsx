import { render, fireEvent, waitFor } from '@testing-library/react-native'

// --- Mocks must be declared before imports ---

// Explicit i18next mock so translations resolve in test (real library needs initialisation)
const mockMessages = require('../../messages/en.json')
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const parts = key.split('.')
      let value: any = mockMessages
      for (const part of parts) {
        if (value && typeof value === 'object') value = value[part]
        else return key
      }
      if (typeof value !== 'string') return key
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

  // --- 4-state: Medications — loading ---
  it('shows loading indicator for medications while history is loading', () => {
    mockHistoryLoading = true
    const { getByTestId, queryByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('medications-loading')).toBeTruthy()
    expect(queryByText('No Active Medications')).toBeNull()
  })

  // --- 4-state: Medications — error ---
  it('shows "unavailable" for medications on history error, never "No Active Medications"', () => {
    mockHistoryLoading = false
    mockHistoryError = 'Failed to load medical history'
    const { getByTestId, queryByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('medications-unavailable')).toBeTruthy()
    expect(queryByText('No Active Medications')).toBeNull()
  })

  // --- 4-state: Medications — confirmed empty ---
  it('shows "No Active Medications" only after history loaded with zero results', () => {
    mockHistoryLoading = false
    mockHistoryError = null
    mockActiveMeds = []
    const { getByText, queryByTestId } = render(<HomeDashboardScreen />)

    expect(getByText('No Active Medications')).toBeTruthy()
    expect(queryByTestId('medications-loading')).toBeNull()
    expect(queryByTestId('medications-unavailable')).toBeNull()
  })

  // --- 4-state: Recent Activity — loading ---
  it('shows loading indicator for recent activity while history is loading', () => {
    mockHistoryLoading = true
    const { getByTestId, queryByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('recent-activity-loading')).toBeTruthy()
    expect(queryByText('No recent activity')).toBeNull()
  })

  // --- 4-state: Recent Activity — error ---
  it('shows "unavailable" for recent activity on history error, never "No recent activity"', () => {
    mockHistoryLoading = false
    mockHistoryError = 'Failed to load medical history'
    const { getByTestId, queryByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('recent-activity-unavailable')).toBeTruthy()
    expect(queryByText('No recent activity')).toBeNull()
  })

  // --- 4-state: Recent Activity — confirmed empty ---
  it('shows "No recent activity" only after history loaded with zero results', () => {
    mockHistoryLoading = false
    mockHistoryError = null
    mockEvents = []
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('recent-activity-empty')).toBeTruthy()
    expect(getByText('No recent activity')).toBeTruthy()
  })

  // --- 4-state: Allergies — loading (via AllergyBanner) ---
  it('allergy banner shows loading state and not "No Known Allergies" while loading', () => {
    mockHistoryLoading = true
    const { getByTestId, queryByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('allergy-banner-loading')).toBeTruthy()
    expect(queryByText('No Known Allergies')).toBeNull()
  })

  // --- 4-state: Allergies — error ---
  it('allergy banner shows error state on history error, not "No Known Allergies"', () => {
    mockHistoryLoading = false
    mockHistoryError = 'Failed to load medical history'
    const { getByTestId, queryByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('allergy-banner-error')).toBeTruthy()
    expect(queryByText('No Known Allergies')).toBeNull()
  })

  // --- AC #3: Allergy section renders FIRST in DOM ---
  it('renders allergy section before all other content sections', () => {
    mockActiveAllergies = [mockActiveAllergy]
    const { getByTestId, UNSAFE_root } = render(<HomeDashboardScreen />)

    // AllergyBanner renders with testID "allergy-banner" when allergies exist
    expect(getByTestId('allergy-banner')).toBeTruthy()
    expect(getByTestId('patient-summary-card')).toBeTruthy()
    expect(getByTestId('qr-section')).toBeTruthy()
    expect(getByTestId('medications-section')).toBeTruthy()

    // Verify DOM order by walking the plain element tree (not fibers).
    // toJSON() from RTL can have circular refs (RefreshControl fiber); instead
    // use UNSAFE_root.findAll to collect all testID-bearing elements in DFS order.
    const elements: string[] = []
    const collected = UNSAFE_root.findAll(
      (el) => typeof el.props?.testID === 'string',
      { deep: true },
    )
    for (const el of collected) {
      elements.push(el.props.testID as string)
    }

    const allergyIndex = elements.indexOf('allergy-banner')
    const summaryIndex = elements.indexOf('patient-summary-card')
    const qrIndex = elements.indexOf('qr-section')
    const medsIndex = elements.indexOf('medications-section')

    // All must be found (> -1)
    expect(allergyIndex).toBeGreaterThan(-1)
    expect(summaryIndex).toBeGreaterThan(-1)
    expect(qrIndex).toBeGreaterThan(-1)
    expect(medsIndex).toBeGreaterThan(-1)

    // Allergy banner must appear before all other content sections
    expect(allergyIndex).toBeLessThan(summaryIndex)
    expect(allergyIndex).toBeLessThan(qrIndex)
    expect(allergyIndex).toBeLessThan(medsIndex)
  })

  // --- AC #3: Active allergies render in red ---
  it('renders active allergies using PatientHealthCard allergy variant', () => {
    mockActiveAllergies = [mockActiveAllergy]
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    // AllergyBanner wraps all items with testID "allergy-banner"
    expect(getByTestId('allergy-banner')).toBeTruthy()
    // Individual items use testID "allergy-banner-item-<id>"
    expect(getByTestId(`allergy-banner-item-${mockActiveAllergy.id}`)).toBeTruthy()
    expect(getByText('Penicillin')).toBeTruthy()
  })

  // --- AC #4: No allergies shows "No Known Allergies" ONLY after loaded ---
  it('shows "No Known Allergies" when no active allergies exist (after load)', () => {
    mockActiveAllergies = []
    mockHistoryLoading = false
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    // AllergyBanner uses testID "allergy-banner-none" when no allergies and not loading
    expect(getByTestId('allergy-banner-none')).toBeTruthy()
    expect(getByText('No Known Allergies')).toBeTruthy()
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

    // Both PatientQRCode and QRValidityIndicator show unverified badges
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

  it('shows "No Active Medications" when count is zero and history is loaded', () => {
    mockActiveMeds = []
    mockHistoryLoading = false
    const { getByText, queryByTestId } = render(<HomeDashboardScreen />)

    expect(getByText('No Active Medications')).toBeTruthy()
    expect(queryByTestId('medications-view-all')).toBeNull()
  })

  // --- AC #9: Recent activity ---
  it('shows last encounter and prescription dates', () => {
    mockEvents = [mockEncounterEvent, mockMedicationEvent]
    const { getByTestId } = render(<HomeDashboardScreen />)

    expect(getByTestId('recent-activity-section')).toBeTruthy()
    expect(getByTestId('last-encounter-date')).toBeTruthy()
    expect(getByTestId('last-prescription-date')).toBeTruthy()
  })

  it('shows "No recent activity" when no history exists (after load)', () => {
    mockEvents = []
    mockHistoryLoading = false
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    expect(getByTestId('recent-activity-empty')).toBeTruthy()
    expect(getByText('No recent activity')).toBeTruthy()
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
  it('renders loading skeleton during data fetch', () => {
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

    // RefreshControl is attached
    expect(scrollView.props.refreshControl).toBeTruthy()

    // Simulate refresh
    const refreshControl = scrollView.props.refreshControl
    await refreshControl.props.onRefresh()

    expect(mockRefreshProfile).toHaveBeenCalled()
    expect(mockRefreshHistory).toHaveBeenCalled()
  })

  // --- Multiple allergies ---
  it('renders multiple allergy cards when patient has several allergies', () => {
    const secondAllergy = {
      ...mockActiveAllergy,
      id: 'allergy-2',
      code: { coding: [{ system: 'http://snomed.info/sct', code: '70618', display: 'Sulfa drugs' }] },
      criticality: 'low' as const,
    }
    mockActiveAllergies = [mockActiveAllergy, secondAllergy]
    const { getByTestId, getByText } = render(<HomeDashboardScreen />)

    // AllergyBanner renders individual items with testID "allergy-banner-item-<id>"
    expect(getByTestId('allergy-banner-item-allergy-1')).toBeTruthy()
    expect(getByTestId('allergy-banner-item-allergy-2')).toBeTruthy()
    expect(getByText('Penicillin')).toBeTruthy()
    expect(getByText('Sulfa drugs')).toBeTruthy()
  })
})
