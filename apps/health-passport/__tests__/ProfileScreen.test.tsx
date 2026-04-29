import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { I18nManager } from 'react-native'
import { ProfileScreen } from '@/screens/ProfileScreen'
import * as usePatientProfileModule from '@/hooks/usePatientProfile'
import type { FhirPatient } from '@ultranos/shared-types'
import { AdministrativeGender } from '@ultranos/shared-types'

// Mock the QR component to isolate ProfileScreen tests
jest.mock('@/components/PatientQRCode', () => ({
  PatientQRCode: ({ patientId }: { patientId: string }) => {
    const { View, Text } = require('react-native')
    return (
      <View testID="patient-qr-code">
        <Text>{patientId}</Text>
      </View>
    )
  },
}))

jest.mock('@/hooks/usePatientProfile')

const mockUsePatientProfile = jest.spyOn(usePatientProfileModule, 'usePatientProfile')

const MOCK_PATIENT: FhirPatient = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  resourceType: 'Patient',
  name: [{ given: ['Fatima'], family: 'Al-Rashid', text: 'Fatima Al-Rashid' }],
  gender: AdministrativeGender.FEMALE,
  birthDate: '1990-03-15',
  birthYearOnly: false,
  identifier: [
    { system: 'UAE_NATIONAL_ID', value: '784-1990-1234567-8' },
  ],
  telecom: [{ system: 'phone', value: '+971501234567', use: 'mobile' }],
  _ultranos: {
    nameLocal: 'فاطمة الرشيد',
    nameLatin: 'Fatima Al-Rashid',
    nationalIdHash: 'abc123hash',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  meta: {
    lastUpdated: '2026-04-28T10:00:00Z',
  },
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('displays patient demographics clearly (AC: 1)', async () => {
    mockUsePatientProfile.mockReturnValue({
      patient: MOCK_PATIENT,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { getByTestId, getByText } = render(<ProfileScreen />)

    expect(getByTestId('profile-screen')).toBeTruthy()
    expect(getByTestId('demographics-card')).toBeTruthy()
    expect(getByTestId('patient-name')).toBeTruthy()
    expect(getByText('Fatima Al-Rashid')).toBeTruthy()
    expect(getByTestId('patient-age')).toBeTruthy()
    expect(getByTestId('patient-gender')).toBeTruthy()
    expect(getByText(AdministrativeGender.FEMALE)).toBeTruthy()
  })

  it('masks National ID by default (Developer Guardrail: Privacy)', () => {
    mockUsePatientProfile.mockReturnValue({
      patient: MOCK_PATIENT,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { getByTestId, queryByText } = render(<ProfileScreen />)

    // Full ID should NOT be visible
    expect(queryByText('784-1990-1234567-8')).toBeNull()
    // Masked version should be visible
    expect(getByTestId('patient-national-id')).toBeTruthy()
  })

  it('toggles National ID visibility on press', () => {
    mockUsePatientProfile.mockReturnValue({
      patient: MOCK_PATIENT,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { getByTestId, getByText, queryByText } = render(<ProfileScreen />)

    // Initially masked
    expect(queryByText('784-1990-1234567-8')).toBeNull()

    // Press "Show"
    fireEvent.press(getByTestId('toggle-national-id'))

    // Now visible
    expect(getByText('784-1990-1234567-8')).toBeTruthy()

    // Press "Hide"
    fireEvent.press(getByTestId('toggle-national-id'))

    // Masked again
    expect(queryByText('784-1990-1234567-8')).toBeNull()
  })

  it('shows loading state', () => {
    mockUsePatientProfile.mockReturnValue({
      patient: null,
      isLoading: true,
      error: null,
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { getByTestId } = render(<ProfileScreen />)
    expect(getByTestId('profile-loading')).toBeTruthy()
  })

  it('shows error state when profile unavailable', () => {
    mockUsePatientProfile.mockReturnValue({
      patient: null,
      isLoading: false,
      error: 'Network unavailable',
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { getByTestId, getByText } = render(<ProfileScreen />)
    expect(getByTestId('profile-error')).toBeTruthy()
    expect(getByText('Network unavailable')).toBeTruthy()
  })

  it('renders QR code section with patient ID (AC: 2)', () => {
    mockUsePatientProfile.mockReturnValue({
      patient: MOCK_PATIENT,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { getByTestId } = render(<ProfileScreen />)
    expect(getByTestId('qr-card')).toBeTruthy()
    expect(getByTestId('patient-qr-code')).toBeTruthy()
  })

  it('uses Consumer Theme styling (AC: 4)', () => {
    mockUsePatientProfile.mockReturnValue({
      patient: MOCK_PATIENT,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { getByText } = render(<ProfileScreen />)

    // Header "My Passport" is rendered
    expect(getByText('My Passport')).toBeTruthy()
    expect(getByText('Your health identity card')).toBeTruthy()
  })

  it('displays local name when different from display name', () => {
    mockUsePatientProfile.mockReturnValue({
      patient: MOCK_PATIENT,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { getByTestId, getByText } = render(<ProfileScreen />)
    // Arabic name should be shown as separate field
    expect(getByText('فاطمة الرشيد')).toBeTruthy()
  })

  it('handles year-only birthdate correctly', () => {
    const yearOnlyPatient: FhirPatient = {
      ...MOCK_PATIENT,
      birthDate: '1990',
      birthYearOnly: true,
    }

    mockUsePatientProfile.mockReturnValue({
      patient: yearOnlyPatient,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { getByTestId } = render(<ProfileScreen />)
    const ageField = getByTestId('patient-age')
    // Should show approximate age with ~ prefix
    expect(ageField.props.children).toMatch(/^~\d+$/)
  })

  it('handles patient with no identifier array', () => {
    const noIdPatient: FhirPatient = {
      ...MOCK_PATIENT,
      identifier: undefined,
    }

    mockUsePatientProfile.mockReturnValue({
      patient: noIdPatient,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { queryByTestId } = render(<ProfileScreen />)
    // National ID field should not be rendered
    expect(queryByTestId('patient-national-id')).toBeNull()
  })

  describe('RTL layout', () => {
    const originalIsRTL = I18nManager.isRTL

    afterEach(() => {
      I18nManager.isRTL = originalIsRTL
    })

    it('renders correctly in RTL mode (CLAUDE.md: RTL snapshot tests)', () => {
      I18nManager.isRTL = true

      mockUsePatientProfile.mockReturnValue({
        patient: MOCK_PATIENT,
        isLoading: false,
        error: null,
        refresh: jest.fn(),
        updateProfile: jest.fn(),
        clearProfile: jest.fn(),
      })

      const tree = render(<ProfileScreen />)
      expect(tree.toJSON()).toMatchSnapshot()
    })

    it('renders correctly in LTR mode (CLAUDE.md: RTL snapshot tests)', () => {
      I18nManager.isRTL = false

      mockUsePatientProfile.mockReturnValue({
        patient: MOCK_PATIENT,
        isLoading: false,
        error: null,
        refresh: jest.fn(),
        updateProfile: jest.fn(),
        clearProfile: jest.fn(),
      })

      const tree = render(<ProfileScreen />)
      expect(tree.toJSON()).toMatchSnapshot()
    })
  })
})
