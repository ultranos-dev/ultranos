import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'

// Stub global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock the Supabase browser client — mirrors lab-results-trpc.test.ts pattern
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
    },
  }),
}))

const { fetchDiagnosticReportDetail } = await import('@/lib/trpc')

describe('fetchDiagnosticReportDetail', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.diagnosticReportObservations.clear()
  })

  it('fetches diagnosticReport.read and caches its analytes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          data: {
            json: {
              id: 'r1',
              observations: [
                {
                  id: 'a1',
                  observationId: 'o1',
                  loincCode: '718-7',
                  loincDisplay: 'Hemoglobin',
                  valueQuantity: { value: 12.5, unit: 'g/dL' },
                  valueString: null,
                  interpretation: null,
                  referenceRange: { low: 13, high: 17 },
                  note: null,
                  effectiveDateTime: '2026-09-14',
                },
              ],
            },
          },
        },
      }),
    })

    await fetchDiagnosticReportDetail('r1', 'patient-1')

    const rows = await db.diagnosticReportObservations.where('diagnosticReportId').equals('r1').toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.loincCode).toBe('718-7')
    expect(rows[0]!.valueQuantity).toEqual({ value: 12.5, unit: 'g/dL' })
    expect(rows[0]!.referenceRange).toEqual({ low: 13, high: 17 })
  })

  it('calls diagnosticReport.read with the correct input envelope', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { id: 'r2', observations: [] } } } }),
    })

    await fetchDiagnosticReportDetail('r2', 'patient-2')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0]![0] as string
    expect(url).toContain('diagnosticReport.read')
    const decoded = decodeURIComponent(url.split('input=')[1]!)
    const parsed = JSON.parse(decoded)
    expect(parsed).toEqual({ json: { id: 'r2', patientRef: 'Patient/patient-2' } })
  })

  it('leaves cache intact on network failure (offline-first)', async () => {
    // Pre-seed a cached analyte
    await db.diagnosticReportObservations.put({
      id: 'cached-a1',
      diagnosticReportId: 'r3',
      loincCode: '718-7',
      loincDisplay: 'Hemoglobin',
      valueQuantity: { value: 11.0, unit: 'g/dL' },
      valueString: null,
      interpretation: null,
      referenceRange: null,
      note: null,
      effectiveDateTime: '2026-09-10',
    })

    mockFetch.mockRejectedValue(new Error('Network error'))

    await fetchDiagnosticReportDetail('r3', 'patient-3')

    // Cached data must still be present
    const cached = await db.diagnosticReportObservations.get('cached-a1')
    expect(cached).toBeDefined()
    expect(cached!.valueQuantity).toEqual({ value: 11.0, unit: 'g/dL' })
  })

  it('leaves cache intact when server returns non-ok status', async () => {
    await db.diagnosticReportObservations.put({
      id: 'cached-a2',
      diagnosticReportId: 'r4',
      loincCode: '718-7',
      loincDisplay: 'Hemoglobin',
      valueQuantity: { value: 14.0, unit: 'g/dL' },
      valueString: null,
      interpretation: null,
      referenceRange: null,
      note: null,
      effectiveDateTime: '2026-09-10',
    })

    mockFetch.mockResolvedValue({ ok: false, status: 503 })

    await fetchDiagnosticReportDetail('r4', 'patient-4')

    const cached = await db.diagnosticReportObservations.get('cached-a2')
    expect(cached).toBeDefined()
  })

  it('does not write to cache when observations array is empty', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { id: 'r5', observations: [] } } } }),
    })

    await fetchDiagnosticReportDetail('r5', 'patient-5')

    const rows = await db.diagnosticReportObservations.where('diagnosticReportId').equals('r5').toArray()
    expect(rows).toHaveLength(0)
  })

  it('attaches Authorization header from the Supabase session', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { id: 'r6', observations: [] } } } }),
    })

    await fetchDiagnosticReportDetail('r6', 'patient-6')

    const reqInit = mockFetch.mock.calls[0]![1] as RequestInit
    expect((reqInit.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token')
  })
})
