import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression: diagnostic_reports.patient_ref is stored as an HMAC blind index
 * (lab write path: generateBlindIndex(patient.id, hmacKey)), but consent and the
 * clinical apps use the real patient id (Patient/<uuid>). A clinician read must
 * therefore accept the REAL id (so consent enforcement works) and blind-index it
 * server-side before filtering diagnostic_reports — otherwise the query matches
 * zero rows. This test pins the filter value the DB query is given.
 */

// Deterministic, reversible-looking stand-ins so the test can assert the exact
// value the query receives without depending on real crypto/env.
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((value: string) => `hmac_${value}`),
  encryptField: vi.fn((v: string) => v),
}))

vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'e'.repeat(64), hmacKey: 'b'.repeat(64) })),
}))

function snakeToCamel(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj
  const result: any = {}
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    result[camelKey] = obj[key]
  }
  return result
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => snakeToCamel(data),
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data.map(snakeToCamel),
  },
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')
const createCaller = createCallerFactory(appRouter)

const CLINICIAN_USER = { sub: 'doctor-001', role: 'DOCTOR' as const, sessionId: 'sess-1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }
const REAL_PATIENT_ID = '00000000-0000-4000-8000-000000000001'
const PATIENT_REF = `Patient/${REAL_PATIENT_ID}`
const LAB_UUID = '00000000-0000-4000-8000-000000000300'
const REPORT_UUID = '00000000-0000-4000-8000-000000000200'

function mockOrganizationsTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { status: 'TRIAL' }, error: null }),
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('diagnosticReport.listByPatient — blind-index identity resolution', () => {
  it('filters diagnostic_reports by the blind index of the real patient id, not the raw Patient/<uuid> reference', async () => {
    const patientRefFilters: unknown[] = []

    const storedRow = {
      id: REPORT_UUID,
      status: 'final',
      loinc_code: '26436-6',
      loinc_display: 'Lab',
      // Stored under the blind index, exactly as the lab write path writes it.
      patient_ref: `hmac_${REAL_PATIENT_ID}`,
      performer_id: null,
      lab_id: LAB_UUID,
      issued: '2026-05-10T10:00:00Z',
      collection_date: '2026-05-10T08:00:00Z',
      virus_scan_status: 'clean',
      _ultranos_created_at: '2026-05-10T10:00:00Z',
    }

    const mockFrom = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
                  limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'consents') {
        // Consent is keyed on the REAL patient id (Patient/<uuid>). Active grant.
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', status: 'ACTIVE', category: ['LABS'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      // diagnostic_reports — capture the value passed to .eq('patient_ref', X)
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: unknown) => {
          if (col === 'patient_ref') patientRefFilters.push(val)
          return builder
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => Promise.resolve({ data: [storedRow], error: null })),
      }
      return builder
    })

    const ctx = {
      supabase: { from: mockFrom, rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'h' }], error: null }) } as never,
      user: CLINICIAN_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    const result = await caller.diagnosticReport.listByPatient({ patientRef: PATIENT_REF })

    // The report is stored under the blind index, so a correct query must filter
    // by the blind index to find it.
    expect(patientRefFilters).toContain(`hmac_${REAL_PATIENT_ID}`)
    expect(patientRefFilters).not.toContain(PATIENT_REF)
    expect(result.reports).toHaveLength(1)
    expect(result.reports[0]!.id).toBe(REPORT_UUID)
  })

  it('read: matches a report stored under the blind index when queried with the real Patient/<id> ref', async () => {
    const storedRow = {
      id: REPORT_UUID,
      status: 'final',
      loinc_code: '26436-6',
      loinc_display: 'Lab',
      // Stored under the blind index by the lab write path.
      patient_ref: `hmac_${REAL_PATIENT_ID}`,
      performer_id: null,
      lab_id: LAB_UUID,
      issued: '2026-05-10T10:00:00Z',
      collection_date: '2026-05-09T08:00:00Z',
      report_conclusion: 'Normal results',
      virus_scan_status: 'clean',
      _ultranos_created_at: '2026-05-10T10:00:00Z',
      updated_at: '2026-05-10T10:00:00Z',
    }

    const mockFrom = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
                  limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', status: 'ACTIVE', category: ['LABS'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'lab_result_files') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      // diagnostic_reports single-row read
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: storedRow, error: null }),
            }),
          }),
        }),
      }
    })

    const ctx = {
      supabase: { from: mockFrom, rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'h' }], error: null }) } as never,
      user: CLINICIAN_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    // The real Patient/<id> ref goes in; read must blind-index it to match the
    // stored patient_ref instead of comparing the raw ref (which would 404).
    const result = await caller.diagnosticReport.read({ id: REPORT_UUID, patientRef: PATIENT_REF })
    expect(result.id).toBe(REPORT_UUID)
    expect(result.reportConclusion).toBe('Normal results')
  })
})
