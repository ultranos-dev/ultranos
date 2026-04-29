import { renderHook, waitFor } from '@testing-library/react-native'
import { useMedicalHistory } from '@/hooks/useMedicalHistory'
import * as offlineStore from '@/lib/offline-store'
import * as audit from '@/lib/audit'

jest.mock('@/lib/offline-store')
jest.mock('@/lib/audit')

const mockLoadMedicalHistory = jest.mocked(offlineStore.loadMedicalHistory)
const mockEmitAudit = jest.mocked(audit.emitAuditEvent)

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000'

const MOCK_ENCOUNTER = {
  id: 'enc-001',
  resourceType: 'Encounter' as const,
  status: 'finished' as const,
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
  subject: { reference: `Patient/${PATIENT_ID}` },
  period: { start: '2026-03-15T10:00:00Z' },
  reasonCode: [
    {
      coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'J06.9', display: 'URI' }],
      text: 'Upper respiratory infection',
    },
  ],
  _ultranos: {
    isOfflineCreated: false,
    hlcTimestamp: '0:0:abc123',
    createdAt: '2026-03-15T10:00:00Z',
  },
  meta: { lastUpdated: '2026-03-15T10:00:00Z' },
}

const MOCK_ACTIVE_MED = {
  id: 'med-001',
  resourceType: 'MedicationRequest' as const,
  status: 'active' as const,
  intent: 'order' as const,
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '723', display: 'Amoxicillin' }],
    text: 'Amoxicillin 500mg',
  },
  subject: { reference: `Patient/${PATIENT_ID}` },
  requester: { reference: 'Practitioner/doc-001' },
  authoredOn: '2026-04-20T09:00:00Z',
  _ultranos: {
    prescriptionStatus: 'ACTIVE',
    interactionCheckResult: 'CLEAR' as const,
    isOfflineCreated: false,
    hlcTimestamp: '0:0:def456',
    createdAt: '2026-04-20T09:00:00Z',
  },
  meta: { lastUpdated: '2026-04-20T09:00:00Z' },
}

const MOCK_COMPLETED_MED = {
  ...MOCK_ACTIVE_MED,
  id: 'med-002',
  status: 'completed' as const,
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '5640', display: 'Ibuprofen' }],
    text: 'Ibuprofen 400mg',
  },
  authoredOn: '2026-02-10T08:00:00Z',
  _ultranos: {
    ...MOCK_ACTIVE_MED._ultranos,
    prescriptionStatus: 'DISPENSED',
  },
}

describe('useMedicalHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('loads and sorts events in reverse chronological order (AC: 1)', async () => {
    mockLoadMedicalHistory.mockResolvedValue({
      encounters: [MOCK_ENCOUNTER],
      medications: [MOCK_ACTIVE_MED, MOCK_COMPLETED_MED],
    })

    const { result } = renderHook(() => useMedicalHistory(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.events).toHaveLength(3)
    // Most recent first (Apr 20, Mar 15, Feb 10)
    expect(result.current.events[0].id).toBe('med-001')
    expect(result.current.events[1].id).toBe('enc-001')
    expect(result.current.events[2].id).toBe('med-002')
  })

  it('separates active medications (AC: 3)', async () => {
    mockLoadMedicalHistory.mockResolvedValue({
      encounters: [MOCK_ENCOUNTER],
      medications: [MOCK_ACTIVE_MED, MOCK_COMPLETED_MED],
    })

    const { result } = renderHook(() => useMedicalHistory(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.activeMedications).toHaveLength(1)
    expect(result.current.activeMedications[0].id).toBe('med-001')
    expect(result.current.activeMedications[0].label).toBe('Amoxicillin 500mg')
  })

  it('assigns semantic icons to events (AC: 2)', async () => {
    mockLoadMedicalHistory.mockResolvedValue({
      encounters: [MOCK_ENCOUNTER],
      medications: [MOCK_ACTIVE_MED],
    })

    const { result } = renderHook(() => useMedicalHistory(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Encounter with J06.9 → lungs
    const encounter = result.current.events.find((e) => e.type === 'encounter')
    expect(encounter?.icon).toBe('lungs')

    // Medication → pill
    const medication = result.current.events.find((e) => e.type === 'medication')
    expect(medication?.icon).toBe('pill')
  })

  it('emits audit events for both Encounter and MedicationRequest reads (CLAUDE.md Rule #6)', async () => {
    mockLoadMedicalHistory.mockResolvedValue({
      encounters: [MOCK_ENCOUNTER],
      medications: [MOCK_ACTIVE_MED],
    })

    const { result } = renderHook(() => useMedicalHistory(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'Encounter',
        resourceId: 'medical-history-bundle',
        patientId: PATIENT_ID,
        outcome: 'success',
      }),
    )
    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'MedicationRequest',
        resourceId: 'medical-history-bundle',
        patientId: PATIENT_ID,
        outcome: 'success',
      }),
    )
  })

  it('returns empty arrays when no patient ID', async () => {
    const { result } = renderHook(() => useMedicalHistory(undefined))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.events).toHaveLength(0)
    expect(result.current.activeMedications).toHaveLength(0)
    expect(mockLoadMedicalHistory).not.toHaveBeenCalled()
  })

  it('handles store errors gracefully with sanitized message', async () => {
    mockLoadMedicalHistory.mockRejectedValue(new Error('Store corrupted: patient_abc123'))

    const { result } = renderHook(() => useMedicalHistory(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Must show generic message, never raw error (PHI protection)
    expect(result.current.error).toBe('Failed to load medical history')
    expect(result.current.events).toHaveLength(0)

    // Must emit failure audit event
    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        outcome: 'failure',
        patientId: PATIENT_ID,
      }),
    )
  })

  it('returns empty arrays when store returns null', async () => {
    mockLoadMedicalHistory.mockResolvedValue(null)

    const { result } = renderHook(() => useMedicalHistory(PATIENT_ID))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.events).toHaveLength(0)
    expect(result.current.activeMedications).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })
})
