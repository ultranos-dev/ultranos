/**
 * Tests for ActiveMedicationsList — false-negative empty-state safety.
 *
 * Critical invariants:
 *   1. Dexie read error → "unavailable" (never "No active medications")
 *      [tested in active-medications-list-error.test.tsx — separate file to avoid db mock leakage]
 *   2. Empty local + Hub offline → "unsynced" warning (never "No active medications")
 *   3. Hub returns [] authoritatively → true "No active medications" EmptyState
 *   4. Normal data path renders medication rows
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../lib/db'
import type { FhirMedicationStatementZod } from '@ultranos/shared-types'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
  useLocale: () => 'en',
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock audit
const mockAuditPhiAccess = vi.fn()
vi.mock('../lib/audit', () => ({
  auditPhiAccess: (...args: unknown[]) => mockAuditPhiAccess(...args),
  AuditAction: { READ: 'READ', CREATE: 'CREATE', UPDATE: 'UPDATE' },
  AuditResourceType: {
    MEDICATION_STATEMENT: 'MEDICATION_STATEMENT',
    ENCOUNTER: 'ENCOUNTER',
    ALLERGY: 'ALLERGY',
  },
}))

// Mock the Card component to avoid complex layout deps
vi.mock('../components/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
}))

// Hub fetch mock — controlled per test
const mockFetchActiveMedications = vi.fn()
vi.mock('../lib/trpc', () => ({
  fetchActiveMedicationsFromHub: (...args: unknown[]) => mockFetchActiveMedications(...args),
}))

const { ActiveMedicationsList } = await import('../components/patient/ActiveMedicationsList')

const TEST_PATIENT_ID = 'test-patient-11111111-1111-1111-1111-111111111111'

function makeMedicationStatement(id: string, drugName: string, patientId = TEST_PATIENT_ID): FhirMedicationStatementZod {
  return {
    id,
    resourceType: 'MedicationStatement',
    status: 'active',
    medicationCodeableConcept: {
      coding: [{ system: 'http://ultranos.local/medications', code: 'DRUG001', display: drugName }],
      text: drugName,
    },
    subject: { reference: `Patient/${patientId}` },
    dateAsserted: '2026-01-15T10:00:00Z',
    _ultranos: {
      createdAt: '2026-01-15T10:00:00Z',
      isOfflineCreated: false,
      hlcTimestamp: '000001714400000:00000:hub-node',
    },
    meta: { lastUpdated: '2026-01-15T10:00:00Z' },
  } as FhirMedicationStatementZod
}

describe('ActiveMedicationsList — false-negative empty-state safety', () => {
  beforeEach(async () => {
    mockAuditPhiAccess.mockClear()
    mockFetchActiveMedications.mockClear()
    await db.medicationStatements.clear()
    await db.interactionAuditLog.clear()
  })

  // NOTE: The "Dexie read throws → unavailable" test is in the sibling file
  // active-medications-list-error.test.tsx (uses full db mock for isolation).

  // ------------------------------------------------------------------
  // Bug 1b: Empty local + Hub offline → "unsynced" (not "No active meds")
  // ------------------------------------------------------------------
  it('shows unsynced warning (not empty-state) when local is empty and Hub is offline', async () => {
    // Local cache is empty (no records for this patient)
    // Hub returns null (offline / no auth)
    mockFetchActiveMedications.mockResolvedValue(null)

    render(<ActiveMedicationsList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByTestId('medications-unsynced')).toBeTruthy()
    })
    // Must NOT show the "no meds" empty state
    expect(screen.queryByTestId('medications-empty')).toBeNull()
    expect(screen.queryByText(/noActiveMedications/)).toBeNull()
    // The unsynced text must reference the i18n key
    expect(screen.getByText(/medicationsUnavailable/)).toBeTruthy()
  })

  // ------------------------------------------------------------------
  // Hub confirms empty list → legitimate "No active medications" EmptyState
  // ------------------------------------------------------------------
  it('shows genuine empty-state when Hub confirms no active medications', async () => {
    // Hub returns [] (authenticated, no active meds)
    mockFetchActiveMedications.mockResolvedValue([])

    render(<ActiveMedicationsList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByTestId('medications-empty')).toBeTruthy()
    })
    // The true empty state shows the "no medications" i18n key
    expect(screen.getByText(/noActiveMedications/)).toBeTruthy()
    // No error or unsynced warning
    expect(screen.queryByTestId('medications-unavailable')).toBeNull()
    expect(screen.queryByTestId('medications-unsynced')).toBeNull()
  })

  // ------------------------------------------------------------------
  // Normal data path — Hub returns medications
  // ------------------------------------------------------------------
  it('renders medication rows from Hub response', async () => {
    const hubMed = makeMedicationStatement('med-hub-001', 'Metformin')
    mockFetchActiveMedications.mockResolvedValue([hubMed])

    render(<ActiveMedicationsList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByText('Metformin')).toBeTruthy()
    })
    expect(screen.queryByTestId('medications-empty')).toBeNull()
    expect(screen.queryByTestId('medications-unavailable')).toBeNull()
    expect(screen.queryByTestId('medications-unsynced')).toBeNull()
  })

  // ------------------------------------------------------------------
  // Local-first: renders from Dexie while Hub is loading
  // ------------------------------------------------------------------
  it('renders from local Dexie cache when Hub is offline', async () => {
    await db.medicationStatements.put(makeMedicationStatement('med-local-001', 'Aspirin'))
    // Hub offline
    mockFetchActiveMedications.mockResolvedValue(null)

    render(<ActiveMedicationsList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByText('Aspirin')).toBeTruthy()
    })
    // No error states when local data is present
    expect(screen.queryByTestId('medications-unavailable')).toBeNull()
    expect(screen.queryByTestId('medications-unsynced')).toBeNull()
    expect(screen.queryByTestId('medications-empty')).toBeNull()
  })

  // ------------------------------------------------------------------
  // Audit event emitted on Hub response
  // ------------------------------------------------------------------
  it('emits audit event when Hub returns medications', async () => {
    const hubMed = makeMedicationStatement('med-hub-002', 'Lisinopril')
    mockFetchActiveMedications.mockResolvedValue([hubMed])

    render(<ActiveMedicationsList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(mockAuditPhiAccess).toHaveBeenCalledWith(
        'READ',
        'MEDICATION_STATEMENT',
        expect.stringContaining(TEST_PATIENT_ID),
        TEST_PATIENT_ID,
        expect.objectContaining({ phiAccess: 'active_medications_view', source: 'hub' }),
      )
    })
  })
})
