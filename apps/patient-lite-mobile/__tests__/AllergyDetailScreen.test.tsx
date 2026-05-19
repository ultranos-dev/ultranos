import { render } from '@testing-library/react-native'
import { AllergyDetailScreen } from '@/screens/AllergyDetailScreen'
import * as audit from '@/lib/audit'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'

jest.mock('@/lib/audit')
const mockEmitAudit = jest.mocked(audit.emitAuditEvent)

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000'
const ALLERGY_ID = '550e8400-e29b-41d4-a716-446655440001'

const mockAllergy: FhirAllergyIntolerance = {
  id: ALLERGY_ID,
  resourceType: 'AllergyIntolerance',
  clinicalStatus: {
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
      code: 'active',
    }],
  },
  verificationStatus: {
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
      code: 'confirmed',
    }],
  },
  type: 'allergy',
  criticality: 'high',
  code: {
    coding: [{ system: 'http://snomed.info/sct', code: '91936005', display: 'Penicillin' }],
  },
  patient: { reference: `Patient/${PATIENT_ID}` },
  recordedDate: '2026-01-15T10:00:00.000Z',
  recorder: { reference: 'Practitioner/dr-001', display: 'Dr. Ahmed' },
  _ultranos: {
    createdAt: '2026-01-15T10:00:00.000Z',
    recordedByRole: 'physician',
    isOfflineCreated: false,
    hlcTimestamp: '2026-01-15T10:00:00.000Z:0:node1',
  },
  meta: { lastUpdated: '2026-01-15T10:00:00.000Z' },
} as FhirAllergyIntolerance

// Mock route params
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { allergyId: ALLERGY_ID } }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts?.defaultValue ?? key,
  }),
}))

jest.mock('@/hooks/usePatientProfile', () => ({
  usePatientProfile: () => ({
    patient: { id: PATIENT_ID },
    isLoading: false,
  }),
}))

const mockAllergyEvent = {
  id: ALLERGY_ID,
  type: 'allergy' as const,
  date: '2026-01-15T10:00:00.000Z',
  label: 'Penicillin',
  icon: 'warning' as const,
  isSensitive: false,
  status: 'active',
  resource: mockAllergy,
}

jest.mock('@/hooks/useMedicalHistory', () => ({
  useMedicalHistory: () => ({
    events: [mockAllergyEvent],
    activeMedications: [],
    activeAllergies: [mockAllergy],
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  }),
}))

describe('AllergyDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders all detail fields (substance, criticality, dates, provider)', () => {
    const { getByTestId, getByText } = render(<AllergyDetailScreen />)

    expect(getByTestId('allergy-detail-screen')).toBeTruthy()
    expect(getByTestId('allergy-detail-substance')).toBeTruthy()
    expect(getByText('Penicillin')).toBeTruthy()
    expect(getByTestId('allergy-detail-criticality')).toBeTruthy()
    expect(getByTestId('allergy-detail-recorded-by')).toBeTruthy()
    expect(getByText('Dr. Ahmed')).toBeTruthy()
    expect(getByTestId('allergy-detail-notes')).toBeTruthy()
  })

  it('shows critical styling for high-criticality allergies', () => {
    const { getAllByText } = render(<AllergyDetailScreen />)
    expect(getAllByText('CRITICAL').length).toBeGreaterThanOrEqual(1)
    expect(getAllByText('‼️').length).toBeGreaterThanOrEqual(1)
  })

  it('emits PHI_DISPLAY audit event', () => {
    render(<AllergyDetailScreen />)

    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_DISPLAY',
        resourceType: 'AllergyIntolerance',
        resourceId: ALLERGY_ID,
        patientId: PATIENT_ID,
      }),
    )
  })

  it('has a back button', () => {
    const { getByTestId } = render(<AllergyDetailScreen />)
    expect(getByTestId('allergy-detail-back')).toBeTruthy()
  })

  it('is read-only — no edit controls present', () => {
    const { queryByText, queryByTestId } = render(<AllergyDetailScreen />)
    expect(queryByText('Edit')).toBeNull()
    expect(queryByText('Save')).toBeNull()
    expect(queryByTestId('edit-button')).toBeNull()
  })
})
