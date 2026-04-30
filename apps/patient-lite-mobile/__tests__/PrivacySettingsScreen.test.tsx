import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { I18nManager } from 'react-native'
import { ConsentScope, ConsentStatus } from '@ultranos/shared-types'

jest.mock('@/hooks/usePatientProfile', () => ({
  usePatientProfile: jest.fn(),
}))

jest.mock('@/hooks/useConsentSettings', () => ({
  useConsentSettings: jest.fn(),
}))

import { PrivacySettingsScreen } from '@/screens/PrivacySettingsScreen'
import { usePatientProfile } from '@/hooks/usePatientProfile'
import { useConsentSettings } from '@/hooks/useConsentSettings'

const mockUsePatientProfile = jest.mocked(usePatientProfile)
const mockUseConsentSettings = jest.mocked(useConsentSettings)

const MOCK_PATIENT = {
  id: 'patient-001',
  resourceType: 'Patient' as const,
  name: [{ given: ['Ahmad'], family: 'Hassan' }],
  gender: 'male' as const,
  birthDate: '1990-05-15',
  birthYearOnly: false,
  identifier: [],
  _ultranos: {
    nameLocal: 'Ahmad Hassan',
    registeredAt: '2026-01-01T00:00:00Z',
    lastSyncAt: null,
    flagged: false,
    preferredLanguage: 'ar',
    createdAt: '2026-01-01T00:00:00Z',
  },
  meta: { lastUpdated: '2026-04-28T10:00:00Z' },
}

const MOCK_CATEGORIES = [
  { scope: ConsentScope.FULL_RECORD, label: 'Full Medical Record', description: 'Allow access to your complete health history', enabled: false, lastUpdated: null },
  { scope: ConsentScope.PRESCRIPTIONS, label: 'Prescriptions', description: 'Medication orders and dispensing history', enabled: true, lastUpdated: '2026-04-28T10:00:00.000Z' },
  { scope: ConsentScope.LABS, label: 'Lab Results', description: 'Laboratory tests and their results', enabled: false, lastUpdated: null },
  { scope: ConsentScope.VITALS, label: 'Vital Signs', description: 'Blood pressure, heart rate, temperature, etc.', enabled: false, lastUpdated: null },
  { scope: ConsentScope.CLINICAL_NOTES, label: 'Clinical Notes', description: 'Doctor visit notes and assessments', enabled: false, lastUpdated: null },
]

describe('PrivacySettingsScreen', () => {
  const mockToggle = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePatientProfile.mockReturnValue({
      patient: MOCK_PATIENT,
      isLoading: false,
      error: null,
    } as ReturnType<typeof usePatientProfile>)
    mockUseConsentSettings.mockReturnValue({
      categories: MOCK_CATEGORIES,
      consentHistory: [],
      isLoading: false,
      error: null,
      toggleConsent: mockToggle,
    })
  })

  it('renders the privacy settings header', () => {
    const { getByText } = render(<PrivacySettingsScreen />)
    expect(getByText('Privacy Settings')).toBeTruthy()
    expect(getByText('Control who can access your health data')).toBeTruthy()
  })

  it('renders all data category toggles', () => {
    const { getByTestId } = render(<PrivacySettingsScreen />)
    expect(getByTestId('consent-row-PRESCRIPTIONS')).toBeTruthy()
    expect(getByTestId('consent-row-LABS')).toBeTruthy()
    expect(getByTestId('consent-row-VITALS')).toBeTruthy()
    expect(getByTestId('consent-row-CLINICAL_NOTES')).toBeTruthy()
    expect(getByTestId('consent-row-FULL_RECORD')).toBeTruthy()
  })

  it('shows last updated timestamp for consents with history', () => {
    const { getByTestId } = render(<PrivacySettingsScreen />)
    expect(getByTestId('consent-updated-PRESCRIPTIONS')).toBeTruthy()
  })

  it('calls toggleConsent when a switch is toggled', () => {
    const { getByTestId } = render(<PrivacySettingsScreen />)
    const labsToggle = getByTestId('consent-toggle-LABS')
    fireEvent(labsToggle, 'valueChange', true)
    expect(mockToggle).toHaveBeenCalledWith(ConsentScope.LABS)
  })

  it('shows loading state', () => {
    mockUsePatientProfile.mockReturnValue({
      patient: null,
      isLoading: true,
      error: null,
    } as ReturnType<typeof usePatientProfile>)

    const { getByTestId } = render(<PrivacySettingsScreen />)
    expect(getByTestId('privacy-loading')).toBeTruthy()
  })

  it('shows error state', () => {
    mockUsePatientProfile.mockReturnValue({
      patient: null,
      isLoading: false,
      error: 'Something went wrong',
    } as ReturnType<typeof usePatientProfile>)

    const { getByTestId } = render(<PrivacySettingsScreen />)
    expect(getByTestId('privacy-error')).toBeTruthy()
  })

  it('renders privacy notice about default restrictions', () => {
    const { getByText } = render(<PrivacySettingsScreen />)
    expect(
      getByText(/By default, your data is restricted/),
    ).toBeTruthy()
  })

  it('renders correctly in LTR layout (snapshot)', () => {
    I18nManager.forceRTL(false)
    const tree = render(<PrivacySettingsScreen />)
    expect(tree.toJSON()).toMatchSnapshot()
  })

  it('renders correctly in RTL layout (snapshot)', () => {
    I18nManager.forceRTL(true)
    const tree = render(<PrivacySettingsScreen />)
    expect(tree.toJSON()).toMatchSnapshot()
    I18nManager.forceRTL(false) // restore
  })

  it('toggles consent history visibility', () => {
    mockUseConsentSettings.mockReturnValue({
      categories: MOCK_CATEGORIES,
      consentHistory: [
        {
          id: 'c1',
          resourceType: 'Consent',
          status: ConsentStatus.ACTIVE,
          scope: { coding: [{ system: 'test', code: 'patient-privacy' }] },
          category: [ConsentScope.PRESCRIPTIONS],
          patient: { reference: 'Patient/patient-001' },
          dateTime: '2026-04-28T10:00:00.000Z',
          provision: { period: { start: '2026-04-28T10:00:00.000Z' } },
          _ultranos: {
            grantorId: 'patient-001',
            grantorRole: 'SELF' as any,
            purpose: 'TREATMENT' as any,
            validFrom: '2026-04-28T10:00:00.000Z',
            consentVersion: '1.0',
            auditHash: '0'.repeat(64),
            createdAt: '2026-04-28T10:00:00.000Z',
          },
          meta: { lastUpdated: '2026-04-28T10:00:00.000Z' },
        },
      ],
      isLoading: false,
      error: null,
      toggleConsent: mockToggle,
    })

    const { getByTestId, queryByTestId } = render(<PrivacySettingsScreen />)

    // History hidden by default
    expect(queryByTestId('consent-history-list')).toBeNull()

    // Show history
    fireEvent.press(getByTestId('consent-history-toggle'))
    expect(getByTestId('consent-history-list')).toBeTruthy()
    expect(getByTestId('consent-history-item')).toBeTruthy()
  })
})
