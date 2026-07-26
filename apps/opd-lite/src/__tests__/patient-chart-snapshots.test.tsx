import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { db } from '../lib/db'
import { useAuthSessionStore } from '../stores/auth-session-store'
import type { FhirPatient, FhirEncounterZod } from '@ultranos/shared-types'

// next-intl context isn't provided in unit tests; components only need the locale.
// Preserve the {substances} interpolation so allergy-content coverage (Rule #4)
// can assert the actual allergen name reaches the DOM, not just the message key.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values && 'substances' in values) return String(values.substances)
    return key
  },
  useLocale: () => 'en',
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock audit
vi.mock('../lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { READ: 'READ' },
  AuditResourceType: { PATIENT: 'PATIENT', ENCOUNTER: 'ENCOUNTER' },
}))

// Mock allergy store
vi.mock('../stores/allergy-store', () => ({
  useAllergyStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      allergies: [
        {
          id: 'allergy-1',
          _ultranos: { substanceFreeText: 'Penicillin' },
          code: { text: 'Penicillin' },
        },
      ],
      isLoading: false,
      loadError: null,
      loadAllergies: vi.fn(),
    }
    return selector(state)
  }),
}))

// Mock trpc calls to prevent network calls
vi.mock('../lib/trpc', () => ({
  listPatientEncounters: vi.fn().mockRejectedValue(new Error('offline')),
  fetchDiagnosticReportsForPatient: vi.fn().mockResolvedValue(undefined),
}))

// Mock lab timeline (wired in place of the flat LabResultsList — Story 52.4)
vi.mock('../components/clinical/PatientResultTimeline', () => ({
  PatientResultTimeline: () => null,
}))

const { PatientChartPage } = await import('../components/patient/PatientChartPage')

const TEST_PATIENT_ID = '44444444-4444-4444-4444-444444444444'

const testPatient: FhirPatient = {
  id: TEST_PATIENT_ID,
  resourceType: 'Patient',
  gender: 'female',
  birthDate: '1985-03-20',
  name: [{ text: 'Snapshot Patient', family: 'Patient', given: ['Snapshot'] }],
  _ultranos: {
    nameLocal: 'Snapshot Patient Local',
    nameLatin: 'Snapshot Patient Latin',
    nationalIdHash: 'hash456',
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

const testEncounter: FhirEncounterZod = {
  id: 'enc-snap-1',
  resourceType: 'Encounter',
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
  subject: { reference: `Patient/${TEST_PATIENT_ID}` },
  period: { start: '2024-06-15T10:00:00Z' },
  _ultranos: {
    isOfflineCreated: false,
    hlcTimestamp: '2024-06-15T10:00:00Z_0001_node1',
    createdAt: '2024-06-15T10:00:00Z',
  },
  meta: { versionId: '1', lastUpdated: '2024-06-15T10:00:00Z' },
}

function resetStores() {
  useAuthSessionStore.getState().setSession({
    userId: 'user-1',
    practitionerId: 'pract-1',
    role: 'physician',
    email: 'doc@test.com',
    token: 'test-token',
  })
}

describe('Patient Chart — Snapshot Tests', () => {
  beforeEach(async () => {
    await db.patients.clear()
    await db.encounters.clear()
    await db.soapLedger.clear()
    await db.conditions.clear()
    await db.medications.clear()
    await db.observations.clear()
    await db.allergyIntolerances.clear()
    resetStores()
  })

  it('snapshot: allergy banner renders first in DOM (AC #5)', async () => {
    await db.patients.put(testPatient)
    await db.encounters.put(testEncounter)

    const { container, findByTestId } = render(
      <PatientChartPage patientId={TEST_PATIENT_ID} />,
    )

    const banner = await findByTestId('allergy-banner')
    // Verify banner is inside the banner slot (first slot in DetailLayout, above the grid)
    const bannerSlot = container.querySelector('[data-slot="detail-banner"]')
    expect(bannerSlot).toBeTruthy()
    expect(bannerSlot).toContainElement(banner)
    // Verify it has active state (red)
    expect(banner.getAttribute('data-banner-state')).toBe('active')
    // Rule #4: the actual allergen name (patient data) must reach the DOM
    expect(banner.textContent).toContain('Penicillin')
  })

  it('snapshot: LTR patient chart page matches', async () => {
    await db.patients.put(testPatient)
    await db.encounters.put(testEncounter)

    const { container, findByText } = render(
      <PatientChartPage patientId={TEST_PATIENT_ID} />,
    )

    await findByText('Snapshot Patient Local')
    expect(container.firstChild).toMatchSnapshot()
  })

  it('snapshot: RTL patient chart page matches', async () => {
    // Set document direction to RTL
    document.documentElement.setAttribute('dir', 'rtl')

    await db.patients.put(testPatient)
    await db.encounters.put(testEncounter)

    const { container, findByText } = render(
      <PatientChartPage patientId={TEST_PATIENT_ID} />,
    )

    await findByText('Snapshot Patient Local')
    expect(container.firstChild).toMatchSnapshot()

    // Restore LTR
    document.documentElement.setAttribute('dir', 'ltr')
  })
})
