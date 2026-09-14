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

  // ---------------------------------------------------------------------------
  // Attachment photo delivery tests
  // ---------------------------------------------------------------------------

  it('fetches file bytes, base64-encodes them (including high bytes ≥ 128), and merges presentedForm into the cached report', async () => {
    // Pre-seed the base DiagnosticReport record (created by list-fetch in production)
    await db.diagnosticReports.put({
      id: 'r-attach-1',
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC' }] },
      subject: { reference: 'Patient/p-attach-1' },
      issued: '2026-09-01T00:00:00.000Z',
      meta: { lastUpdated: '2026-09-01T00:00:00.000Z' },
    } as never)

    // First call: the tRPC diagnosticReport.read response (includes a files entry)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: {
            json: {
              observations: [],
              files: [
                {
                  id: 'file-1',
                  fileName: 'result-scan.webp',
                  fileType: 'image/webp',
                  fileSize: 4,
                  downloadUrl: '/api/lab-files/file-1',
                },
              ],
            },
          },
        },
      }),
    })

    // Second call: the file-byte fetch — 4 bytes including two values ≥ 128
    // to prove the Latin-1 binary path, not just the ASCII coincidence.
    const knownBytes = new Uint8Array([72, 200, 255, 1])
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => knownBytes.buffer,
    })

    await fetchDiagnosticReportDetail('r-attach-1', 'p-attach-1')

    const stored = await db.diagnosticReports.get('r-attach-1')
    expect(stored).toBeDefined()
    expect(stored!.presentedForm).toHaveLength(1)
    expect(stored!.presentedForm![0]!.contentType).toBe('image/webp')
    expect(stored!.presentedForm![0]!.title).toBe('result-scan.webp')
    // Compute expected base64 via the same binary→base64 idiom the production code uses.
    const expectedBase64 = btoa(String.fromCharCode(...knownBytes))
    expect(stored!.presentedForm![0]!.data).toBe(expectedBase64)
  })

  it('skips a file whose byte-fetch returns 403 and still processes other files', async () => {
    await db.diagnosticReports.put({
      id: 'r-attach-2',
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { coding: [] },
      subject: { reference: 'Patient/p-attach-2' },
      issued: '2026-09-01T00:00:00.000Z',
      meta: { lastUpdated: '2026-09-01T00:00:00.000Z' },
    } as never)

    // tRPC read response with two files
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: {
            json: {
              observations: [],
              files: [
                { id: 'file-bad', fileName: 'quarantined.jpg', fileType: 'image/jpeg', fileSize: 0, downloadUrl: '/api/lab-files/file-bad' },
                { id: 'file-ok', fileName: 'good.png', fileType: 'image/png', fileSize: 3, downloadUrl: '/api/lab-files/file-ok' },
              ],
            },
          },
        },
      }),
    })

    // file-bad → 403 (virus-scan hold)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })

    // file-ok → 3 bytes
    const goodBytes = new Uint8Array([65, 66, 67]) // "ABC"
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => goodBytes.buffer,
    })

    await fetchDiagnosticReportDetail('r-attach-2', 'p-attach-2')

    const stored = await db.diagnosticReports.get('r-attach-2')
    expect(stored).toBeDefined()
    // Only the successfully fetched file should be in presentedForm
    expect(stored!.presentedForm).toHaveLength(1)
    expect(stored!.presentedForm![0]!.title).toBe('good.png')
    expect(stored!.presentedForm![0]!.data).toBe(btoa('ABC'))
  })

  // ---------------------------------------------------------------------------
  // UNION merge tests — Fix 1: don't drop previously-cached attachments on
  // a partial-failure re-fetch.
  // ---------------------------------------------------------------------------

  it('preserves previously-cached attachment when re-fetch omits that file (partial failure)', async () => {
    // Seed a report that already has a cached attachment 'old.webp'
    await db.diagnosticReports.put({
      id: 'r-union-1',
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { coding: [] },
      subject: { reference: 'Patient/p-union-1' },
      issued: '2026-09-01T00:00:00.000Z',
      meta: { lastUpdated: '2026-09-01T00:00:00.000Z' },
      presentedForm: [
        { contentType: 'image/webp', data: btoa('OLD'), title: 'old.webp' },
      ],
    } as never)

    // Re-fetch returns only 'new.webp' (old.webp not listed — simulates 403/404 skip)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: {
            json: {
              observations: [],
              files: [
                { id: 'file-new', fileName: 'new.webp', fileType: 'image/webp', fileSize: 3, downloadUrl: '/api/lab-files/file-new' },
              ],
            },
          },
        },
      }),
    })

    const newBytes = new Uint8Array([78, 69, 87]) // "NEW"
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => newBytes.buffer,
    })

    await fetchDiagnosticReportDetail('r-union-1', 'p-union-1')

    const stored = await db.diagnosticReports.get('r-union-1')
    expect(stored).toBeDefined()
    // Both entries must be present: fresh 'new.webp' and preserved 'old.webp'
    expect(stored!.presentedForm).toHaveLength(2)
    const titles = stored!.presentedForm!.map((p) => p.title)
    expect(titles).toContain('new.webp')
    expect(titles).toContain('old.webp')
    // The preserved old entry must still carry its original data
    const oldEntry = stored!.presentedForm!.find((p) => p.title === 'old.webp')
    expect(oldEntry!.data).toBe(btoa('OLD'))
  })

  it('replaces a prior entry with the freshly-fetched version when title matches (no duplicate)', async () => {
    // Seed a report that already has 'scan.webp' cached with stale data
    await db.diagnosticReports.put({
      id: 'r-union-2',
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { coding: [] },
      subject: { reference: 'Patient/p-union-2' },
      issued: '2026-09-01T00:00:00.000Z',
      meta: { lastUpdated: '2026-09-01T00:00:00.000Z' },
      presentedForm: [
        { contentType: 'image/webp', data: btoa('STALE'), title: 'scan.webp' },
      ],
    } as never)

    // Re-fetch returns the same 'scan.webp' with fresh bytes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: {
            json: {
              observations: [],
              files: [
                { id: 'file-scan', fileName: 'scan.webp', fileType: 'image/webp', fileSize: 5, downloadUrl: '/api/lab-files/file-scan' },
              ],
            },
          },
        },
      }),
    })

    const freshBytes = new Uint8Array([70, 82, 69, 83, 72]) // "FRESH"
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => freshBytes.buffer,
    })

    await fetchDiagnosticReportDetail('r-union-2', 'p-union-2')

    const stored = await db.diagnosticReports.get('r-union-2')
    expect(stored).toBeDefined()
    // Only ONE entry — no duplicate for the same title
    expect(stored!.presentedForm).toHaveLength(1)
    expect(stored!.presentedForm![0]!.title).toBe('scan.webp')
    // Fresh data wins over stale
    const expectedBase64 = btoa(String.fromCharCode(...freshBytes))
    expect(stored!.presentedForm![0]!.data).toBe(expectedBase64)
  })

  it('preserves observations cache when files are also present', async () => {
    await db.diagnosticReports.put({
      id: 'r-attach-3',
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { coding: [] },
      subject: { reference: 'Patient/p-attach-3' },
      issued: '2026-09-01T00:00:00.000Z',
      meta: { lastUpdated: '2026-09-01T00:00:00.000Z' },
    } as never)

    // tRPC read: one observation + one file
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: {
            json: {
              observations: [
                {
                  id: 'obs-a3',
                  loincCode: '718-7',
                  loincDisplay: 'Hemoglobin',
                  valueQuantity: { value: 13.5, unit: 'g/dL' },
                  valueString: null,
                  interpretation: null,
                  referenceRange: null,
                  note: null,
                  effectiveDateTime: '2026-09-01',
                },
              ],
              files: [
                { id: 'file-a3', fileName: 'scan.webp', fileType: 'image/webp', fileSize: 2, downloadUrl: '/api/lab-files/file-a3' },
              ],
            },
          },
        },
      }),
    })

    const bytes = new Uint8Array([1, 2])
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => bytes.buffer,
    })

    await fetchDiagnosticReportDetail('r-attach-3', 'p-attach-3')

    // Observations must be cached
    const obsRows = await db.diagnosticReportObservations.where('diagnosticReportId').equals('r-attach-3').toArray()
    expect(obsRows).toHaveLength(1)
    expect(obsRows[0]!.loincCode).toBe('718-7')

    // presentedForm must also be populated
    const report = await db.diagnosticReports.get('r-attach-3')
    expect(report!.presentedForm).toHaveLength(1)
    expect(report!.presentedForm![0]!.contentType).toBe('image/webp')
  })
})
