import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../lib/db'
import { useAuthSessionStore } from '../stores/auth-session-store'
import type { FhirPatient } from '@ultranos/shared-types'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock audit
const mockAuditPhiAccess = vi.fn()
vi.mock('../lib/audit', () => ({
  auditPhiAccess: (...args: unknown[]) => mockAuditPhiAccess(...args),
  AuditAction: { READ: 'READ', CREATE: 'CREATE', UPDATE: 'UPDATE', EXPORT: 'EXPORT' },
  AuditResourceType: {
    PATIENT: 'PATIENT',
    ENCOUNTER: 'ENCOUNTER',
    ALLERGY: 'ALLERGY',
    OBSERVATION: 'OBSERVATION',
    CONDITION: 'CONDITION',
    MEDICATION_REQUEST: 'MEDICATION_REQUEST',
  },
}))

// Mock trpc (for fetchDiagnosticReportsForPatient and listPatientEncounters)
vi.mock('../lib/trpc', () => ({
  listPatientEncounters: vi.fn().mockRejectedValue(new Error('offline')),
  fetchDiagnosticReportsForPatient: vi.fn().mockResolvedValue(undefined),
}))

// Mock lab components (Story 20.5)
vi.mock('../components/clinical/LabResultsList', () => ({
  LabResultsList: () => null,
}))
vi.mock('../components/clinical/LabResultDetail', () => ({
  LabResultDetail: () => null,
}))

// Mock allergy store
vi.mock('../stores/allergy-store', () => ({
  useAllergyStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      allergies: [],
      isLoading: false,
      loadError: null,
      loadAllergies: vi.fn(),
    }
    return selector(state)
  }),
}))

// Lazy import the component under test — must come after mocks
const { PatientChartPage } = await import('../components/patient/PatientChartPage')

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

function resetStores() {
  useAuthSessionStore.getState().setSession({
    userId: 'user-1',
    practitionerId: 'pract-1',
    role: 'physician',
    email: 'doc@test.com',
    token: 'test-token',
  })
}

describe('PatientChartPage', () => {
  beforeEach(async () => {
    mockPush.mockClear()
    mockAuditPhiAccess.mockClear()
    await db.patients.clear()
    await db.encounters.clear()
    await db.soapLedger.clear()
    await db.conditions.clear()
    await db.medications.clear()
    await db.observations.clear()
    await db.allergyIntolerances.clear()
    resetStores()
  })

  it('renders patient info when patient exists in Dexie', async () => {
    await db.patients.put(testPatient)

    render(<PatientChartPage patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByText('Test Patient Local')).toBeTruthy()
    })
  })

  it('shows "Patient not found" when patient does not exist', async () => {
    render(<PatientChartPage patientId="nonexistent-id" />)

    await waitFor(() => {
      expect(screen.getByText(/patient not found/i)).toBeTruthy()
    })
  })

  it('renders allergy banner as the first element', async () => {
    await db.patients.put(testPatient)

    render(<PatientChartPage patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      const banner = screen.getByTestId('allergy-banner')
      expect(banner).toBeTruthy()
      // Allergy banner should come before the patient header
      const main = banner.closest('main')
      expect(main).toBeTruthy()
      const firstChild = main!.firstElementChild
      expect(firstChild).toBe(banner)
    })
  })

  it('emits PHI READ audit event on page load', async () => {
    await db.patients.put(testPatient)

    render(<PatientChartPage patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(mockAuditPhiAccess).toHaveBeenCalledWith(
        'READ',
        'PATIENT',
        TEST_PATIENT_ID,
        TEST_PATIENT_ID,
        expect.objectContaining({ phiAccess: 'patient_chart_view' }),
      )
    })
  })

  it('renders "Start New Encounter" button', async () => {
    await db.patients.put(testPatient)

    render(<PatientChartPage patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /start new encounter/i })).toBeTruthy()
    })
  })

  it('renders "Back to Search" navigation link', async () => {
    await db.patients.put(testPatient)

    render(<PatientChartPage patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByText(/back to search/i)).toBeTruthy()
    })
  })
})
