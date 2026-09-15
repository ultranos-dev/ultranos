/**
 * TDD — Task 2: useNotificationPatient hook
 *
 * Verifies:
 * - ORDER_RECEIVED resolves patient name and emits ONE PHI_READ audit event
 * - LAB_RESULT_AVAILABLE resolves via diagnosticReportId
 * - PRESCRIPTION_DISPENSED resolves via prescriptionId
 * - Unknown/absent records return {name: null, loading: false} without throwing
 * - Types that don't bear patient refs return {name: null, loading: false} immediately
 */

import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — set up BEFORE importing the hook (hoisted)
// ---------------------------------------------------------------------------

const mockServiceRequests = { get: vi.fn() }
const mockDiagnosticReports = { get: vi.fn() }
const mockMedications = { get: vi.fn() }

vi.mock('../lib/db', () => ({
  db: {
    serviceRequests: mockServiceRequests,
    diagnosticReports: mockDiagnosticReports,
    medications: mockMedications,
  },
}))

const mockLoadPatientResilient = vi.fn()

vi.mock('../lib/patient-loader', () => ({
  loadPatientResilient: (...args: unknown[]) => mockLoadPatientResilient(...args),
}))

const mockAuditPhiAccess = vi.fn()

vi.mock('../lib/audit', () => ({
  auditPhiAccess: (...args: unknown[]) => mockAuditPhiAccess(...args),
  AuditAction: { PHI_READ: 'PHI_READ' },
  AuditResourceType: {
    SERVICE_REQUEST: 'SERVICE_REQUEST',
    LAB_RESULT: 'LAB_RESULT',
    PRESCRIPTION: 'PRESCRIPTION',
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFhirPatient(nameLatin = 'Ahmad Karimi') {
  return {
    id: 'p1',
    resourceType: 'Patient' as const,
    name: [{ given: ['Ahmad'], text: 'احمد کریمی' }],
    _ultranos: {
      nameLatin,
      nameLocal: 'احمد کریمی',
      isActive: true,
      isNomadic: false,
      patient_tier: 'FREE' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    meta: { lastUpdated: '2026-01-01T00:00:00.000Z' },
  }
}

const PATIENT = makeFhirPatient()

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useNotificationPatient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- ORDER_RECEIVED ---

  it('resolves patient name for ORDER_RECEIVED via orderId → serviceRequests', async () => {
    mockServiceRequests.get.mockResolvedValue({
      id: 'o1',
      subject: { reference: 'Patient/p1' },
    })
    mockLoadPatientResilient.mockResolvedValue({
      patient: PATIENT,
      needsReauth: false,
      source: 'dexie',
    })

    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() =>
      useNotificationPatient({
        id: 'n1',
        type: 'ORDER_RECEIVED',
        payload: { orderId: 'o1' },
        status: 'SENT',
        createdAt: '2026-09-15T10:00:00.000Z',
        deliveredAt: null,
        acknowledgedAt: null,
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.name).toBe('Ahmad Karimi')

    // ONE audit event emitted
    expect(mockAuditPhiAccess).toHaveBeenCalledTimes(1)
    expect(mockAuditPhiAccess).toHaveBeenCalledWith(
      'PHI_READ',
      'SERVICE_REQUEST',
      'o1',
      'p1',
      { phiAccess: 'notification_modal' },
    )
  })

  it('returns {name: null, loading: false} when orderId is absent (ORDER_RECEIVED)', async () => {
    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() =>
      useNotificationPatient({
        id: 'n1',
        type: 'ORDER_RECEIVED',
        payload: {},
        status: 'SENT',
        createdAt: '2026-09-15T10:00:00.000Z',
        deliveredAt: null,
        acknowledgedAt: null,
      }),
    )

    // Should resolve synchronously/quickly with no lookup
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.name).toBeNull()
    expect(mockAuditPhiAccess).not.toHaveBeenCalled()
  })

  it('returns {name: null} (no throw) when serviceRequest is not found', async () => {
    mockServiceRequests.get.mockResolvedValue(undefined)

    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() =>
      useNotificationPatient({
        id: 'n1',
        type: 'ORDER_RECEIVED',
        payload: { orderId: 'missing-order' },
        status: 'SENT',
        createdAt: '2026-09-15T10:00:00.000Z',
        deliveredAt: null,
        acknowledgedAt: null,
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.name).toBeNull()
    expect(mockAuditPhiAccess).not.toHaveBeenCalled()
  })

  it('returns {name: null} (no throw) when patient is not found', async () => {
    mockServiceRequests.get.mockResolvedValue({
      id: 'o1',
      subject: { reference: 'Patient/p-ghost' },
    })
    mockLoadPatientResilient.mockResolvedValue({
      patient: null,
      needsReauth: false,
      source: null,
    })

    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() =>
      useNotificationPatient({
        id: 'n1',
        type: 'ORDER_RECEIVED',
        payload: { orderId: 'o1' },
        status: 'SENT',
        createdAt: '2026-09-15T10:00:00.000Z',
        deliveredAt: null,
        acknowledgedAt: null,
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.name).toBeNull()
    // Audit is still emitted once — we resolved the source record so we know which patient was attempted
    expect(mockAuditPhiAccess).toHaveBeenCalledTimes(1)
    expect(mockAuditPhiAccess).toHaveBeenCalledWith(
      'PHI_READ',
      'SERVICE_REQUEST',
      'o1',
      'p-ghost',
      { phiAccess: 'notification_modal' },
    )
  })

  // --- LAB_RESULT_AVAILABLE ---

  it('resolves patient name for LAB_RESULT_AVAILABLE via diagnosticReportId', async () => {
    mockDiagnosticReports.get.mockResolvedValue({
      id: 'dr1',
      subject: { reference: 'Patient/p1' },
    })
    mockLoadPatientResilient.mockResolvedValue({
      patient: PATIENT,
      needsReauth: false,
      source: 'dexie',
    })

    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() =>
      useNotificationPatient({
        id: 'n2',
        type: 'LAB_RESULT_AVAILABLE',
        payload: { diagnosticReportId: 'dr1' },
        status: 'SENT',
        createdAt: '2026-09-15T10:00:00.000Z',
        deliveredAt: null,
        acknowledgedAt: null,
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.name).toBe('Ahmad Karimi')

    expect(mockAuditPhiAccess).toHaveBeenCalledTimes(1)
    expect(mockAuditPhiAccess).toHaveBeenCalledWith(
      'PHI_READ',
      'LAB_RESULT',
      'dr1',
      'p1',
      { phiAccess: 'notification_modal' },
    )
  })

  // --- LAB_RESULT_ESCALATION (same path as LAB_RESULT_AVAILABLE) ---

  it('resolves patient name for LAB_RESULT_ESCALATION via diagnosticReportId', async () => {
    mockDiagnosticReports.get.mockResolvedValue({
      id: 'dr2',
      subject: { reference: 'Patient/p1' },
    })
    mockLoadPatientResilient.mockResolvedValue({
      patient: PATIENT,
      needsReauth: false,
      source: 'dexie',
    })

    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() =>
      useNotificationPatient({
        id: 'n3',
        type: 'LAB_RESULT_ESCALATION',
        payload: { diagnosticReportId: 'dr2' },
        status: 'SENT',
        createdAt: '2026-09-15T10:00:00.000Z',
        deliveredAt: null,
        acknowledgedAt: null,
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.name).toBe('Ahmad Karimi')
    expect(mockAuditPhiAccess).toHaveBeenCalledTimes(1)
  })

  // --- PRESCRIPTION_DISPENSED ---

  it('resolves patient name for PRESCRIPTION_DISPENSED via prescriptionId', async () => {
    mockMedications.get.mockResolvedValue({
      id: 'rx1',
      subject: { reference: 'Patient/p1' },
    })
    mockLoadPatientResilient.mockResolvedValue({
      patient: PATIENT,
      needsReauth: false,
      source: 'dexie',
    })

    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() =>
      useNotificationPatient({
        id: 'n4',
        type: 'PRESCRIPTION_DISPENSED',
        payload: { prescriptionId: 'rx1' },
        status: 'SENT',
        createdAt: '2026-09-15T10:00:00.000Z',
        deliveredAt: null,
        acknowledgedAt: null,
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.name).toBe('Ahmad Karimi')

    expect(mockAuditPhiAccess).toHaveBeenCalledTimes(1)
    expect(mockAuditPhiAccess).toHaveBeenCalledWith(
      'PHI_READ',
      'PRESCRIPTION',
      'rx1',
      'p1',
      { phiAccess: 'notification_modal' },
    )
  })

  // --- null notification ---

  it('returns {name: null, loading: false} for null notification', async () => {
    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() => useNotificationPatient(null))

    // Synchronous — should be settled immediately
    expect(result.current.loading).toBe(false)
    expect(result.current.name).toBeNull()
    expect(mockAuditPhiAccess).not.toHaveBeenCalled()
  })

  // --- Non-patient-bearing type ---

  it('returns {name: null, loading: false} for SYNC_CONFLICT (non-patient type)', async () => {
    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() =>
      useNotificationPatient({
        id: 'n5',
        type: 'SYNC_CONFLICT',
        payload: { message: 'conflict detected' },
        status: 'SENT',
        createdAt: '2026-09-15T10:00:00.000Z',
        deliveredAt: null,
        acknowledgedAt: null,
      }),
    )

    expect(result.current.loading).toBe(false)
    expect(result.current.name).toBeNull()
    expect(mockAuditPhiAccess).not.toHaveBeenCalled()
  })

  // --- Error resilience ---

  it('returns {name: null} (no throw) when db.get rejects', async () => {
    mockServiceRequests.get.mockRejectedValue(new Error('Dexie error'))

    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() =>
      useNotificationPatient({
        id: 'n1',
        type: 'ORDER_RECEIVED',
        payload: { orderId: 'o1' },
        status: 'SENT',
        createdAt: '2026-09-15T10:00:00.000Z',
        deliveredAt: null,
        acknowledgedAt: null,
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.name).toBeNull()
  })

  // --- nameLatin fallback to nameLocal ---

  it('falls back to nameLocal when nameLatin is absent', async () => {
    const patientLocalOnly = makeFhirPatient('')
    // Remove nameLatin
    patientLocalOnly._ultranos.nameLatin = ''

    mockServiceRequests.get.mockResolvedValue({
      id: 'o2',
      subject: { reference: 'Patient/p2' },
    })
    mockLoadPatientResilient.mockResolvedValue({
      patient: patientLocalOnly,
      needsReauth: false,
      source: 'dexie',
    })

    const { useNotificationPatient } = await import('../hooks/useNotificationPatient')

    const { result } = renderHook(() =>
      useNotificationPatient({
        id: 'n6',
        type: 'ORDER_RECEIVED',
        payload: { orderId: 'o2' },
        status: 'SENT',
        createdAt: '2026-09-15T10:00:00.000Z',
        deliveredAt: null,
        acknowledgedAt: null,
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Falls back to nameLocal
    expect(result.current.name).toBe('احمد کریمی')
  })
})
