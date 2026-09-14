import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

// patientBlindRef returns the ref verbatim so data.patient_ref === patientBlindRef(input.patientRef)
vi.mock('@/lib/patient-ref', () => ({ patientBlindRef: (r: string) => r }))

const REPORT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PATIENT_REF = 'Patient/real-1'

// diagnostic_reports: .select().eq().eq().single()
const drSingle = vi.fn()
const drEqVirus = vi.fn(() => ({ single: drSingle }))
const drEqId = vi.fn(() => ({ eq: drEqVirus }))
const drSelect = vi.fn(() => ({ eq: drEqId }))

// lab_result_files: .select().eq()
const filesEq = vi.fn()
const filesSelect = vi.fn(() => ({ eq: filesEq }))

// diagnostic_report_observations: .select().eq()
const analyteEq = vi.fn()
const analyteSelect = vi.fn(() => ({ eq: analyteEq }))

// enforceResourceAccess middleware calls .select().eq() on various tables — return empty to allow
const genericEq = vi.fn().mockResolvedValue({ data: null, error: null })
const genericSelect = vi.fn(() => ({ eq: genericEq }))

// enforceConsent middleware
const consentEq2 = vi.fn().mockResolvedValue({ data: null, error: null })
const consentEq1 = vi.fn(() => ({ eq: consentEq2 }))
const consentSelect = vi.fn(() => ({ eq: consentEq1 }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'diagnostic_reports') return { select: drSelect }
  if (table === 'lab_result_files') return { select: filesSelect }
  if (table === 'diagnostic_report_observations') return { select: analyteSelect }
  // consent_records and other middleware tables
  return { select: genericSelect }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((i: string) => `hmac-${i}`),
  encryptField: vi.fn((i: string) => `enc-${i}`),
}))
vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'k', hmacKey: 'h' })),
}))

// Stub enforceResourceAccess and enforceConsentMiddleware to pass-through
vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: () => (opts: any) => opts.next(opts),
}))
vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: () => (opts: any) => opts.next(opts),
}))
vi.mock('../trpc/middleware/enforceEntitlement', () => ({
  enforceEntitlement: () => (opts: any) => opts.next(opts),
}))
vi.mock('../trpc/middleware/enforceVerifiedOrg', () => ({
  enforceVerifiedOrg: () => (opts: any) => opts.next(opts),
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { diagnosticReportRouter } = await import('../trpc/routers/diagnostic-report')

function makeCtx() {
  return {
    supabase: { from: mockFrom } as never,
    user: { sub: 'doc-1', role: 'DOCTOR', sessionId: 's1', orgId: 'org-1', facilityId: null, status: null },
    headers: new Headers(),
  }
}

const REPORT_ROW = {
  id: REPORT_ID,
  status: 'preliminary',
  loinc_code: '58410-2',
  loinc_display: 'CBC',
  patient_ref: PATIENT_REF,
  performer_id: 'tech-1',
  lab_id: 'lab-1',
  issued: '2026-09-14T09:00:00.000Z',
  collection_date: '2026-09-14',
  report_conclusion: null,
  virus_scan_status: 'clean',
  _ultranos_created_at: '2026-09-14T09:00:00.000Z',
  updated_at: '2026-09-14T09:00:00.000Z',
}

const ANALYTE_ROW = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  observation_id: 'obs-1',
  loinc_code: '718-7',
  loinc_display: 'Hemoglobin',
  value_quantity: { value: 12.5, unit: 'g/dL' },
  value_string: null,
  interpretation: [{ coding: [{ system: 'x', code: 'L', display: 'Low' }] }],
  reference_range: { low: 13, high: 17 },
  note: null,
  effective_date_time: '2026-09-14T09:00:00.000Z',
}

describe('diagnosticReport.read with observations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    drSingle.mockResolvedValue({ data: REPORT_ROW, error: null })
    filesEq.mockResolvedValue({ data: [], error: null })
    analyteEq.mockResolvedValue({ data: [ANALYTE_ROW], error: null })
  })

  it('read() returns the report plus its structured analytes', async () => {
    const router = createTRPCRouter({ diagnosticReport: diagnosticReportRouter })
    const caller = createCallerFactory(router)(makeCtx())
    const res = await caller.diagnosticReport.read({ id: REPORT_ID, patientRef: PATIENT_REF })

    expect(res.observations).toEqual([
      expect.objectContaining({
        observationId: 'obs-1',
        loincCode: '718-7',
        loincDisplay: 'Hemoglobin',
        valueQuantity: { value: 12.5, unit: 'g/dL' },
        referenceRange: { low: 13, high: 17 },
      }),
    ])
  })

  it('returns an empty observations array when there are no analytes', async () => {
    analyteEq.mockResolvedValue({ data: [], error: null })
    const router = createTRPCRouter({ diagnosticReport: diagnosticReportRouter })
    const caller = createCallerFactory(router)(makeCtx())
    const res = await caller.diagnosticReport.read({ id: REPORT_ID, patientRef: PATIENT_REF })
    expect(res.observations).toEqual([])
  })

  it('returns an empty observations array when analyte query returns null data', async () => {
    analyteEq.mockResolvedValue({ data: null, error: null })
    const router = createTRPCRouter({ diagnosticReport: diagnosticReportRouter })
    const caller = createCallerFactory(router)(makeCtx())
    const res = await caller.diagnosticReport.read({ id: REPORT_ID, patientRef: PATIENT_REF })
    expect(res.observations).toEqual([])
  })

  it('emits a PHI_READ audit event (Rule #6)', async () => {
    const router = createTRPCRouter({ diagnosticReport: diagnosticReportRouter })
    const caller = createCallerFactory(router)(makeCtx())
    await caller.diagnosticReport.read({ id: REPORT_ID, patientRef: PATIENT_REF })
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PHI_READ', resourceType: 'DIAGNOSTIC_REPORT', resourceId: REPORT_ID }),
    )
  })
})
