import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { FhirPatient } from '@ultranos/shared-types'

// Mock child components — they use next-intl / Dexie / Supabase internally;
// this test only verifies that PatientContextRail passes props to the right
// slots in the right order, not the internals of each card.
vi.mock('../components/patient/PatientHeaderCard', () => ({
  PatientHeaderCard: ({ patient }: { patient: FhirPatient }) => (
    <div data-testid="patient-header-card">{patient.name?.[0]?.family}</div>
  ),
}))
vi.mock('../components/patient/ActiveMedicationsList', () => ({
  ActiveMedicationsList: ({ patientId }: { patientId: string }) => (
    <div data-testid="active-medications-list" data-patient-id={patientId}>
      Active Medications
    </div>
  ),
}))
vi.mock('../components/patient/PatientDetailsAccordion', () => ({
  PatientDetailsAccordion: () => (
    <div data-testid="patient-details-accordion">Patient Details</div>
  ),
}))
vi.mock('../components/patient/PatientAuditTrail', () => ({
  PatientAuditTrail: () => (
    <div data-testid="patient-audit-trail">Audit Trail</div>
  ),
}))

import { PatientContextRail } from '../components/patient/PatientContextRail'

// Reuse the same fixture shape as patient-chart.test.tsx verbatim.
const TEST_PATIENT_ID = '11111111-1111-1111-1111-111111111111'

const testPatient: FhirPatient = {
  id: TEST_PATIENT_ID,
  resourceType: 'Patient',
  gender: 'male',
  birthDate: '1990-05-15',
  name: [{ text: 'Test Patient', family: 'Patient', given: ['Test'] }],
  _ultranos: {
    nameLocal: 'Test Patient Local',
    nameLatin: 'Test Patient Latin',
    nationalIdHash: 'hash123',
    consentGranted: true,
    consentTimestamp: '2024-01-01T00:00:00Z',
    isOfflineCreated: false,
    hlcTimestamp: '2024-01-01T00:00:00Z_0000_node1',
    createdAt: '2024-01-01T00:00:00Z',
  },
  meta: {
    versionId: '1',
    lastUpdated: '2024-01-01T00:00:00Z',
  },
}

describe('PatientContextRail', () => {
  it('renders identity and active medications, not the allergy banner', () => {
    render(
      <PatientContextRail
        patient={testPatient}
        patientId={TEST_PATIENT_ID}
        userRole="DOCTOR"
        onEditClick={vi.fn()}
        onPatientUpdated={vi.fn()}
      />,
    )

    // Identity content — PatientHeaderCard receives the patient and renders the family name
    expect(screen.getByText(testPatient.name?.[0]?.family ?? '')).toBeInTheDocument()

    // All four cards are rendered
    expect(screen.getByTestId('patient-header-card')).toBeInTheDocument()
    expect(screen.getByTestId('active-medications-list')).toBeInTheDocument()
    expect(screen.getByTestId('patient-details-accordion')).toBeInTheDocument()
    expect(screen.getByTestId('patient-audit-trail')).toBeInTheDocument()

    // Allergy banner (role="alert") must NOT be in the rail — it stays in the page
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders cards in required order: header → meds → details → audit', () => {
    const { container } = render(
      <PatientContextRail
        patient={testPatient}
        patientId={TEST_PATIENT_ID}
        userRole="DOCTOR"
        onEditClick={vi.fn()}
        onPatientUpdated={vi.fn()}
      />,
    )

    const cards = Array.from(
      container.querySelectorAll(
        '[data-testid="patient-header-card"], [data-testid="active-medications-list"], [data-testid="patient-details-accordion"], [data-testid="patient-audit-trail"]',
      ),
    )

    expect(cards[0]?.getAttribute('data-testid')).toBe('patient-header-card')
    expect(cards[1]?.getAttribute('data-testid')).toBe('active-medications-list')
    expect(cards[2]?.getAttribute('data-testid')).toBe('patient-details-accordion')
    expect(cards[3]?.getAttribute('data-testid')).toBe('patient-audit-trail')
  })
})
