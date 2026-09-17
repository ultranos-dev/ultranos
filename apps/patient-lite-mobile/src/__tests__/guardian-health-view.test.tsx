/**
 * Tests for GuardianHealthView 4-state pattern.
 *
 * Safety: guardian view of allergies and medications must never show
 * "No allergies" / "No medications" / "No encounters" while loading or
 * on error — these are false-negative empty states that could mislead a
 * guardian into thinking the patient has no allergies or active meds.
 */
import { render } from '@testing-library/react-native'

// --- Mocks ---

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'guardian.viewingAsGuardian': 'Viewing as Guardian',
        'guardian.readOnlyNotice': 'You can view this person\'s health information but cannot make changes.',
        'guardian.allergies': 'Allergies',
        'guardian.activeMedications': 'Active Medications',
        'guardian.recentActivity': 'Recent Activity',
        'guardian.noAllergies': 'No known allergies',
        'guardian.noMedications': 'No active medications',
        'guardian.noEncounters': 'No recent visits',
        'guardian.unknownAllergy': 'Unknown allergen',
        'guardian.medication': 'Medication',
        'guardian.clinicalEncounter': 'Clinical visit',
        'guardian.allergiesUnavailable': 'Allergy status unavailable',
        'guardian.medicationsUnavailable': 'Medication list unavailable',
        'guardian.activityUnavailable': 'Activity unavailable',
      }
      return messages[key] ?? key
    },
    i18n: { language: 'en' },
  }),
}))

jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      surface: '#fff',
      surfaceElevated: '#f9f9f9',
      textPrimary: '#000',
      textSecondary: '#666',
      textMuted: '#999',
      border: '#e0e0e0',
      primary: { 50: '#f0fdf4', 300: '#86efac', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
      secondary: { 400: '#a78bfa' },
      error: '#dc2626',
    },
  }),
}))

jest.mock('@/components/PatientHealthCard', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    PatientHealthCard: ({ title, testID }: { title: string; testID?: string }) =>
      React.createElement(Text, { testID }, title),
  }
})

jest.mock('@ultranos/ui-kit/native/NumericText', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    NumericText: ({ children, style }: any) => React.createElement(Text, { style }, children),
  }
})

import { GuardianHealthView } from '@/components/GuardianHealthView'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import type { FhirMedicationRequestZod, FhirEncounterZod } from '@ultranos/shared-types'

const mockAllergy: FhirAllergyIntolerance = {
  id: 'allergy-1',
  resourceType: 'AllergyIntolerance',
  clinicalStatus: {
    coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }],
  },
  verificationStatus: {
    coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed' }],
  },
  type: 'allergy',
  criticality: 'high',
  code: { coding: [{ system: 'http://snomed.info/sct', code: '91936005', display: 'Penicillin' }] },
  patient: { reference: 'Patient/p1' },
  _ultranos: { createdAt: '2026-01-01T00:00:00Z', recordedByRole: 'doctor', isOfflineCreated: false, hlcTimestamp: 'hlc1' },
  meta: { lastUpdated: '2026-01-01T00:00:00Z', versionId: '1' },
} as any

const mockMed: FhirMedicationRequestZod = {
  id: 'med-1',
  resourceType: 'MedicationRequest',
  status: 'active',
  intent: 'order',
  medicationCodeableConcept: { coding: [{ display: 'Amoxicillin' }] },
  subject: { reference: 'Patient/p1' },
  _ultranos: { createdAt: '2026-01-01T00:00:00Z', hlcTimestamp: 'hlc1' },
  meta: { lastUpdated: '2026-01-01T00:00:00Z', versionId: '1' },
} as any

const mockEncounter: FhirEncounterZod = {
  id: 'enc-1',
  resourceType: 'Encounter',
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
  type: [{ coding: [{ display: 'General checkup' }] }],
  subject: { reference: 'Patient/p1' },
  period: { start: '2026-04-01T09:00:00Z' },
  _ultranos: { createdAt: '2026-04-01T09:00:00Z', hlcTimestamp: 'hlc2' },
  meta: { lastUpdated: '2026-04-01T09:00:00Z', versionId: '1' },
} as any

describe('GuardianHealthView — 4-state pattern', () => {
  // --- Loading state ---

  it('shows loading indicators for all sections while isLoading=true', () => {
    const { getByTestId, queryByText } = render(
      <GuardianHealthView
        allergies={[]}
        medications={[]}
        recentEncounters={[]}
        isLoading={true}
      />,
    )

    expect(getByTestId('guardian-allergies-loading')).toBeTruthy()
    expect(getByTestId('guardian-medications-loading')).toBeTruthy()
    expect(getByTestId('guardian-activity-loading')).toBeTruthy()

    // Safety: must NOT assert "no" anything while loading
    expect(queryByText('No known allergies')).toBeNull()
    expect(queryByText('No active medications')).toBeNull()
    expect(queryByText('No recent visits')).toBeNull()
  })

  // --- Error state ---

  it('shows "unavailable" for all sections on error, never shows empty text', () => {
    const { getByTestId, queryByText } = render(
      <GuardianHealthView
        allergies={[]}
        medications={[]}
        recentEncounters={[]}
        isLoading={false}
        error="Failed to load medical history"
      />,
    )

    expect(getByTestId('guardian-allergies-unavailable')).toBeTruthy()
    expect(getByTestId('guardian-medications-unavailable')).toBeTruthy()
    expect(getByTestId('guardian-activity-unavailable')).toBeTruthy()

    // Must NOT show the empty text on error
    expect(queryByText('No known allergies')).toBeNull()
    expect(queryByText('No active medications')).toBeNull()
    expect(queryByText('No recent visits')).toBeNull()
  })

  // --- Confirmed-empty state ---

  it('shows confirmed-empty text for all sections after successful load with zero items', () => {
    const { getByText, queryByTestId } = render(
      <GuardianHealthView
        allergies={[]}
        medications={[]}
        recentEncounters={[]}
        isLoading={false}
        error={null}
      />,
    )

    expect(getByText('No known allergies')).toBeTruthy()
    expect(getByText('No active medications')).toBeTruthy()
    expect(getByText('No recent visits')).toBeTruthy()

    // Loading indicators must NOT be present
    expect(queryByTestId('guardian-allergies-loading')).toBeNull()
    expect(queryByTestId('guardian-medications-loading')).toBeNull()
    expect(queryByTestId('guardian-activity-loading')).toBeNull()
  })

  // --- Data state ---

  it('renders allergy, medication, and encounter data when loaded', () => {
    const { getByText, getByTestId } = render(
      <GuardianHealthView
        allergies={[mockAllergy]}
        medications={[mockMed]}
        recentEncounters={[mockEncounter]}
        isLoading={false}
        error={null}
      />,
    )

    expect(getByTestId(`guardian-allergy-${mockAllergy.id}`)).toBeTruthy()
    expect(getByTestId(`guardian-med-${mockMed.id}`)).toBeTruthy()
    expect(getByText('General checkup')).toBeTruthy()
  })

  // --- Guardian banner always visible ---

  it('renders guardian banner regardless of loading state', () => {
    const { getByTestId } = render(
      <GuardianHealthView
        allergies={[]}
        medications={[]}
        recentEncounters={[]}
        isLoading={true}
      />,
    )
    expect(getByTestId('guardian-banner')).toBeTruthy()
    expect(getByTestId('guardian-health-view')).toBeTruthy()
  })

  // --- Default props (backward compatibility) ---

  it('renders safely with no isLoading/error props (defaults to loaded-empty)', () => {
    const { getByText } = render(
      <GuardianHealthView
        allergies={[]}
        medications={[]}
        recentEncounters={[]}
      />,
    )
    // Default isLoading=false, error=null → show confirmed-empty
    expect(getByText('No known allergies')).toBeTruthy()
  })
})
