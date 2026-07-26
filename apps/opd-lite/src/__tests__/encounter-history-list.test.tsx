import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '../lib/db'
import { useAuthSessionStore } from '../stores/auth-session-store'
import type { FhirEncounterZod, FhirCondition, FhirMedicationRequestZod } from '@ultranos/shared-types'
import type { SoapLedgerEntry } from '../lib/db'

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

// Mock trpc
vi.mock('../lib/trpc', () => ({
  listPatientEncounters: vi.fn().mockRejectedValue(new Error('offline')),
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

const { EncounterHistoryList } = await import('../components/patient/EncounterHistoryList')

const TEST_PATIENT_ID = '22222222-2222-2222-2222-222222222222'
const ENC_1_ID = 'aaaa1111-1111-1111-1111-111111111111'
const ENC_2_ID = 'bbbb2222-2222-2222-2222-222222222222'

// Build a serialized HLC matching production format: "<wallMs(15)>:<counter(5)>:<nodeId>".
function makeHlc(isoDate: string): string {
  const wallMs = new Date(isoDate).getTime()
  return `${String(wallMs).padStart(15, '0')}:00001:node1`
}

function makeEncounter(id: string, status: string, isoDate: string): FhirEncounterZod {
  return {
    id,
    resourceType: 'Encounter',
    status: status as FhirEncounterZod['status'],
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
    subject: { reference: `Patient/${TEST_PATIENT_ID}` },
    period: { start: isoDate },
    _ultranos: {
      isOfflineCreated: false,
      hlcTimestamp: makeHlc(isoDate),
      createdAt: isoDate,
    },
    meta: { versionId: '1', lastUpdated: isoDate },
  }
}

function makeSoapEntry(encounterId: string, subjective: string): SoapLedgerEntry {
  return {
    id: crypto.randomUUID(),
    encounterId,
    subjective,
    objective: 'Objective text',
    assessorRef: 'Practitioner/pract-1',
    hlcTimestamp: '2024-06-15T10:00:00Z',
    createdAt: '2024-06-15T10:00:00Z',
  }
}

function makeCondition(encounterId: string, display: string): FhirCondition {
  return {
    id: crypto.randomUUID(),
    resourceType: 'Condition',
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    code: {
      coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'A09', display }],
      text: display,
    },
    subject: { reference: `Patient/${TEST_PATIENT_ID}` },
    encounter: { reference: `Encounter/${encounterId}` },
    _ultranos: { diagnosisRank: 1, isOfflineCreated: false, hlcTimestamp: '2024-06-15T10:00:00Z', createdAt: '2024-06-15T10:00:00Z' },
    meta: { versionId: '1', lastUpdated: '2024-06-15T10:00:00Z' },
  } as FhirCondition
}

function makeMedication(encounterId: string): FhirMedicationRequestZod {
  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [{ system: 'ultranos', code: 'MED001', display: 'Test Med' }],
      text: 'Test Med',
    },
    subject: { reference: `Patient/${TEST_PATIENT_ID}` },
    encounter: { reference: `Encounter/${encounterId}` },
    authoredOn: '2024-06-15T10:00:00Z',
    requester: { reference: 'Practitioner/pract-1' },
    dosageInstruction: [{ text: '1 tablet daily' }],
    _ultranos: {
      isOfflineCreated: false,
      hlcTimestamp: '2024-06-15T10:00:00Z',
      createdAt: '2024-06-15T10:00:00Z',
      interactionCheckResult: 'CLEAR',
    },
    meta: { versionId: '1', lastUpdated: '2024-06-15T10:00:00Z' },
  } as FhirMedicationRequestZod
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

describe('EncounterHistoryList', () => {
  beforeEach(async () => {
    mockAuditPhiAccess.mockClear()
    await db.encounters.clear()
    await db.soapLedger.clear()
    await db.conditions.clear()
    await db.medications.clear()
    await db.observations.clear()
    await db.allergyIntolerances.clear()
    resetStores()
  })

  it('shows empty state when no encounters exist', async () => {
    render(<EncounterHistoryList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByTestId('no-encounters')).toBeTruthy()
    })
  })

  it('renders encounters ordered newest-first', async () => {
    const older = makeEncounter(ENC_1_ID, 'finished', '2024-06-01T10:00:00Z')
    const newer = makeEncounter(ENC_2_ID, 'finished', '2024-06-15T10:00:00Z')
    await db.encounters.bulkPut([older, newer])

    render(<EncounterHistoryList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      const items = screen.getAllByTestId('encounter-item')
      expect(items).toHaveLength(2)
      // Newest should be first
      expect(items[0].textContent).toContain('Jun')
      expect(items[0].textContent).toContain('15')
    })
  })

  it('displays status badge for finished encounter', async () => {
    await db.encounters.put(makeEncounter(ENC_1_ID, 'finished', '2024-06-15T10:00:00Z'))

    render(<EncounterHistoryList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      const badge = screen.getByTestId('status-badge')
      expect(badge.textContent).toBe('finished')
    })
  })

  it('displays status badge for cancelled encounter', async () => {
    await db.encounters.put(makeEncounter(ENC_1_ID, 'cancelled', '2024-06-15T10:00:00Z'))

    render(<EncounterHistoryList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      const badge = screen.getByTestId('status-badge')
      expect(badge.textContent).toBe('cancelled')
    })
  })

  it('shows SOAP preview truncated to ~100 chars', async () => {
    await db.encounters.put(makeEncounter(ENC_1_ID, 'finished', '2024-06-15T10:00:00Z'))
    const longSubjective = 'A'.repeat(150)
    await db.soapLedger.put(makeSoapEntry(ENC_1_ID, longSubjective))

    render(<EncounterHistoryList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      const item = screen.getByTestId('encounter-item')
      // Should contain truncated text with ellipsis
      expect(item.textContent).toContain('A'.repeat(100) + '...')
    })
  })

  it('displays diagnosis chips', async () => {
    await db.encounters.put(makeEncounter(ENC_1_ID, 'finished', '2024-06-15T10:00:00Z'))
    await db.conditions.put(makeCondition(ENC_1_ID, 'Acute Gastritis'))

    render(<EncounterHistoryList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByText('Acute Gastritis')).toBeTruthy()
    })
  })

  it('displays prescription count', async () => {
    await db.encounters.put(makeEncounter(ENC_1_ID, 'finished', '2024-06-15T10:00:00Z'))
    await db.medications.bulkPut([makeMedication(ENC_1_ID), makeMedication(ENC_1_ID)])

    render(<EncounterHistoryList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByText('rxCount({"count":2})')).toBeTruthy()
    })
  })

  it('opens the encounter detail modal on card click', async () => {
    await db.encounters.put(makeEncounter(ENC_1_ID, 'finished', '2024-06-15T10:00:00Z'))

    render(<EncounterHistoryList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByTestId('encounter-item')).toBeTruthy()
    })

    // No modal until the card body is clicked
    expect(screen.queryByTestId('encounter-detail')).toBeNull()

    const cardButton = screen.getByRole('button', { name: /viewEncounterOn/i })
    fireEvent.click(cardButton)

    await waitFor(() => {
      expect(screen.getByTestId('encounter-detail')).toBeTruthy()
    })
  })

  it('emits audit event for encounter list read', async () => {
    await db.encounters.put(makeEncounter(ENC_1_ID, 'finished', '2024-06-15T10:00:00Z'))

    render(<EncounterHistoryList patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(mockAuditPhiAccess).toHaveBeenCalledWith(
        'READ',
        'ENCOUNTER',
        expect.stringContaining(TEST_PATIENT_ID),
        TEST_PATIENT_ID,
        expect.objectContaining({ phiAccess: 'encounter_history_list' }),
      )
    })
  })
})
