import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock auth store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: { token: 'test-token' } }),
  },
}))

const { mapHubReportToFhir, fetchDiagnosticReportsForPatient } = await import('@/lib/trpc')

describe('mapHubReportToFhir', () => {
  it('maps a complete Hub report to FHIR R4 DiagnosticReport', () => {
    const hubItem = {
      id: 'report-1',
      resourceType: 'DiagnosticReport' as const,
      status: 'final',
      loincCode: '58410-2',
      loincDisplay: 'CBC panel',
      patientRef: 'Patient/p1',
      performerId: 'Organization/lab-1',
      performerDisplay: 'Lab Alpha',
      labId: 'lab-1',
      issued: '2026-05-10T14:30:00.000Z',
      collectionDate: '2026-05-10T10:00:00.000Z',
      virusScanStatus: 'clean',
      createdAt: '2026-05-10T14:30:00.000Z',
      conclusion: 'Normal results.',
      presentedForm: [{ contentType: 'application/pdf', data: 'JVBERi0x', title: 'Report' }],
    }

    const result = mapHubReportToFhir(hubItem)

    expect(result.id).toBe('report-1')
    expect(result.resourceType).toBe('DiagnosticReport')
    expect(result.status).toBe('final')
    expect(result.code.coding).toHaveLength(1)
    expect(result.code.coding[0]).toEqual({
      system: 'http://loinc.org',
      code: '58410-2',
      display: 'CBC panel',
    })
    expect(result.subject.reference).toBe('Patient/p1')
    expect(result.issued).toBe('2026-05-10T14:30:00.000Z')
    expect(result.effectiveDateTime).toBe('2026-05-10T10:00:00.000Z')
    expect(result.performer).toEqual([{ reference: 'Organization/lab-1', display: 'Lab Alpha' }])
    expect(result.conclusion).toBe('Normal results.')
    expect(result.presentedForm).toEqual([{ contentType: 'application/pdf', data: 'JVBERi0x', title: 'Report' }])
    expect(result._ultranos.virusScanStatus).toBe('clean')
    expect(result._ultranos.labId).toBe('lab-1')
  })

  it('handles null loincCode — produces empty coding array', () => {
    const hubItem = {
      id: 'report-2',
      resourceType: 'DiagnosticReport' as const,
      status: 'preliminary',
      loincCode: null,
      loincDisplay: null,
      patientRef: 'Patient/p2',
      performerId: null,
      performerDisplay: null,
      labId: null,
      issued: '2026-05-10T14:30:00.000Z',
      collectionDate: null,
      virusScanStatus: 'pending',
      createdAt: '2026-05-10T14:30:00.000Z',
      conclusion: null,
      presentedForm: null,
    }

    const result = mapHubReportToFhir(hubItem)

    expect(result.code.coding).toEqual([])
    expect(result.performer).toBeUndefined()
    expect(result.conclusion).toBeUndefined()
    expect(result.presentedForm).toBeUndefined()
  })

  it('uses server timestamps, never fabricates new Date()', () => {
    const hubItem = {
      id: 'report-3',
      resourceType: 'DiagnosticReport' as const,
      status: 'final',
      loincCode: '12345-6',
      loincDisplay: null,
      patientRef: 'Patient/p3',
      performerId: null,
      performerDisplay: null,
      labId: null,
      issued: '2026-01-01T00:00:00.000Z',
      collectionDate: null,
      virusScanStatus: 'clean',
      createdAt: '2026-01-01T00:00:00.000Z',
      conclusion: null,
      presentedForm: null,
    }

    const result = mapHubReportToFhir(hubItem)

    // All timestamps should match server values, not current time
    expect(result.issued).toBe('2026-01-01T00:00:00.000Z')
    expect(result._ultranos.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(result.meta.lastUpdated).toBe('2026-01-01T00:00:00.000Z')
  })

  it('validates virusScanStatus against known values', () => {
    const hubItem = {
      id: 'report-4',
      resourceType: 'DiagnosticReport' as const,
      status: 'final',
      loincCode: null,
      loincDisplay: null,
      patientRef: 'Patient/p4',
      performerId: null,
      performerDisplay: null,
      labId: null,
      issued: '2026-05-10T14:30:00.000Z',
      collectionDate: null,
      virusScanStatus: 'unknown-status',
      createdAt: '2026-05-10T14:30:00.000Z',
      conclusion: null,
      presentedForm: null,
    }

    const result = mapHubReportToFhir(hubItem)

    // Unknown status should fall back to 'pending', not pass through unchecked
    expect(result._ultranos.virusScanStatus).toBe('pending')
  })

  it('handles both issued and createdAt being null', () => {
    const hubItem = {
      id: 'report-5',
      resourceType: 'DiagnosticReport' as const,
      status: 'final',
      loincCode: null,
      loincDisplay: null,
      patientRef: 'Patient/p5',
      performerId: null,
      performerDisplay: null,
      labId: null,
      issued: null,
      collectionDate: null,
      virusScanStatus: 'clean',
      createdAt: null,
      conclusion: null,
      presentedForm: null,
    }

    const result = mapHubReportToFhir(hubItem)

    // Should use empty string fallback, not new Date()
    expect(result.issued).toBe('')
    expect(result._ultranos.createdAt).toBe('')
  })
})

describe('fetchDiagnosticReportsForPatient', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.diagnosticReports.clear()
  })

  it('fetches from Hub API and upserts into Dexie', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: {
            json: {
              reports: [{
                id: 'r1',
                resourceType: 'DiagnosticReport',
                status: 'final',
                loincCode: '58410-2',
                loincDisplay: 'CBC',
                patientRef: 'Patient/p1',
                performerId: null,
                performerDisplay: null,
                labId: null,
                issued: '2026-05-10T14:30:00.000Z',
                collectionDate: null,
                virusScanStatus: 'clean',
                createdAt: '2026-05-10T14:30:00.000Z',
                conclusion: null,
                presentedForm: null,
              }],
            },
          },
        },
      }),
    })

    await fetchDiagnosticReportsForPatient('p1')

    const stored = await db.diagnosticReports.get('r1')
    expect(stored).toBeDefined()
    expect(stored!.id).toBe('r1')
    expect(stored!.status).toBe('final')
  })

  it('gracefully handles network failure — Dexie cache remains', async () => {
    // Pre-populate Dexie with cached data
    await db.diagnosticReports.put({
      id: 'cached-1',
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '12345', display: 'Cached Test' }] },
      subject: { reference: 'Patient/p2' },
      issued: '2026-05-01T00:00:00.000Z',
      _ultranos: { createdAt: '2026-05-01T00:00:00.000Z', hlcTimestamp: '', isOfflineCreated: false },
      meta: { versionId: '1', lastUpdated: '2026-05-01T00:00:00.000Z' },
    })

    // Simulate network failure
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    await fetchDiagnosticReportsForPatient('p2')

    // Cached data should still be present
    const cached = await db.diagnosticReports.get('cached-1')
    expect(cached).toBeDefined()
    expect(cached!.code.coding[0]!.display).toBe('Cached Test')
  })

  it('deduplicates concurrent calls for the same patient', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { data: { json: { reports: [] } } },
      }),
    })

    // Fire two concurrent calls
    const p1 = fetchDiagnosticReportsForPatient('p3')
    const p2 = fetchDiagnosticReportsForPatient('p3')

    await Promise.all([p1, p2])

    // Should have only made one fetch call
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
