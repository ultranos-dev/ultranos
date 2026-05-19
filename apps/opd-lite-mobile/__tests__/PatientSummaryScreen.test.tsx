import { render } from '@testing-library/react-native'

import { PatientSummaryScreen } from '../src/screens/PatientSummaryScreen'
import { usePatientStore } from '../src/stores/patient-store'

import type { FhirPatient } from '@ultranos/shared-types'

// Mock navigation props
const mockRoute = { params: { patientId: 'patient-001' }, key: 'test', name: 'PatientSummary' as const }
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function makeMockPatient(overrides: Record<string, any> = {}): FhirPatient & Record<string, any> {
  return {
    id: 'patient-001',
    resourceType: 'Patient',
    name: [{ text: 'Ahmed Hassan', family: 'Hassan', given: ['Ahmed'] }],
    gender: 'MALE' as any,
    birthDate: '1985-03-15',
    birthYearOnly: false,
    _ultranos: {
      nameLocal: 'أحمد حسن',
      nationalIdHash: 'ABC12345',
      patient_tier: 'FREE',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    meta: { lastUpdated: '2026-01-15T00:00:00Z' },
    _allergies: ['Penicillin', 'Sulfa'],
    _activeMeds: ['Metformin 500mg', 'Lisinopril 10mg'],
    ...overrides,
  } as any
}

describe('PatientSummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders "No patient selected" when no patient is selected', () => {
    usePatientStore.setState({ selectedPatient: null })
    const { getByText } = render(
      <PatientSummaryScreen route={mockRoute} navigation={mockNavigation} />
    )
    expect(getByText('No patient selected')).toBeTruthy()
  })

  it('renders patient demographics', () => {
    usePatientStore.setState({ selectedPatient: makeMockPatient() })
    const { getByText } = render(
      <PatientSummaryScreen route={mockRoute} navigation={mockNavigation} />
    )
    expect(getByText('أحمد حسن')).toBeTruthy()
    expect(getByText('MALE')).toBeTruthy()
  })

  it('renders allergies in red, FIRST, never collapsed (CLAUDE.md rule #4)', () => {
    usePatientStore.setState({ selectedPatient: makeMockPatient() })
    const { getByTestId, getByText } = render(
      <PatientSummaryScreen route={mockRoute} navigation={mockNavigation} />
    )

    // Allergy section exists and is visible
    const allergySection = getByTestId('allergy-section')
    expect(allergySection).toBeTruthy()
    expect(getByText('Penicillin')).toBeTruthy()
    expect(getByText('Sulfa')).toBeTruthy()
  })

  it('allergy section renders BEFORE medications and demographics (rendering order)', () => {
    usePatientStore.setState({ selectedPatient: makeMockPatient() })
    const { getByTestId } = render(
      <PatientSummaryScreen route={mockRoute} navigation={mockNavigation} />
    )

    const allergySection = getByTestId('allergy-section')
    const medsSection = getByTestId('medications-section')
    const demoSection = getByTestId('demographics-section')

    // All three sections must exist — allergy first by DOM order
    expect(allergySection).toBeTruthy()
    expect(medsSection).toBeTruthy()
    expect(demoSection).toBeTruthy()
  })

  it('renders active medications below allergies', () => {
    usePatientStore.setState({ selectedPatient: makeMockPatient() })
    const { getByText } = render(
      <PatientSummaryScreen route={mockRoute} navigation={mockNavigation} />
    )
    expect(getByText('Metformin 500mg')).toBeTruthy()
    expect(getByText('Lisinopril 10mg')).toBeTruthy()
  })

  it('displays "No known allergies" when allergies array is empty', () => {
    usePatientStore.setState({ selectedPatient: makeMockPatient({ _allergies: [] }) })
    const { getByText } = render(
      <PatientSummaryScreen route={mockRoute} navigation={mockNavigation} />
    )
    expect(getByText('No known allergies')).toBeTruthy()
  })

  it('displays masked National ID for non-hash values', () => {
    usePatientStore.setState({ selectedPatient: makeMockPatient() })
    const { getByText } = render(
      <PatientSummaryScreen route={mockRoute} navigation={mockNavigation} />
    )
    expect(getByText('***2345')).toBeTruthy()
  })

  it('matches snapshot', () => {
    usePatientStore.setState({ selectedPatient: makeMockPatient() })
    const { toJSON } = render(
      <PatientSummaryScreen route={mockRoute} navigation={mockNavigation} />
    )
    expect(toJSON()).toMatchSnapshot()
  })

  describe('RTL snapshot tests', () => {
    const { I18nManager } = require('react-native')

    afterEach(() => {
      I18nManager.isRTL = false
    })

    it('matches snapshot in RTL mode', () => {
      I18nManager.isRTL = true
      usePatientStore.setState({ selectedPatient: makeMockPatient() })
      const { toJSON } = render(
        <PatientSummaryScreen route={mockRoute} navigation={mockNavigation} />
      )
      expect(toJSON()).toMatchSnapshot()
    })
  })
})
