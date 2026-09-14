import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

const REPORT_ID = '33333333-3333-3333-3333-333333333333'
const PATIENT_REF = 'Patient/hmac-abc123'   // opaque blind ref the lab holds

// lab_technicians (labRestrictedProcedure)
const mockTechSingle = vi.fn()
const mockTechSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: mockTechSingle })) }))
// diagnostic_reports: ownership lookup (.select().eq().maybeSingle()) + upsert()
const drMaybeSingle = vi.fn()
const drUpsert = vi.fn(() => ({ error: null }))
const drSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: drMaybeSingle })) }))
// diagnostic_report_observations: delete().eq() + insert()
const droDeleteEq = vi.fn(() => ({ error: null }))
const droInsert = vi.fn(() => ({ error: null }))
// labs: name lookup
const labsSingle = vi.fn().mockResolvedValue({ data: { name: 'Central Lab' }, error: null })
const labsSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: labsSingle })) }))
// encounters: ordering doctor lookup
const encSingle = vi.fn().mockResolvedValue({ data: { practitioner_id: 'doc-1' }, error: null })
const encSelect = vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ single: encSingle })) })) })) }))
// notifications: insert().select('id')
const notifInsert = vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [{ id: 'n1' }], error: null }) }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'lab_technicians') return { select: mockTechSelect }
  if (table === 'diagnostic_reports') return { select: drSelect, upsert: drUpsert }
  if (table === 'diagnostic_report_observations') return { delete: vi.fn(() => ({ eq: droDeleteEq })), insert: droInsert }
  if (table === 'labs') return { select: labsSelect }
  if (table === 'encounters') return { select: encSelect }
  if (table === 'notifications') return { insert: notifInsert }
  // enforceVerifiedOrg + enforceEntitlement middleware tables
  if (table === 'organizations') return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'org-1', status: 'ACTIVE', cancelled_at: null }, error: null }),
      }),
    }),
  }
  if (table === 'org_subscriptions') return {
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
  return { select: vi.fn() }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: { toRow: (d: any) => d, toRowRaw: (d: any) => d, fromRow: (d: any) => d, fromRowRaw: (d: any) => d, fromRows: (d: any[]) => d },
}))
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((i: string) => `hmac-${i}`),
  encryptField: vi.fn((i: string) => `enc-${i}`),
}))
vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'k', hmacKey: 'h' })),
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

function makeCtx(user: { sub: string; role: string; sessionId: string; orgId?: string } | null) {
  return { supabase: { from: mockFrom } as never, user, headers: new Headers() }
}
function setupLab(status = 'ACTIVE') {
  mockTechSingle.mockResolvedValue({
    data: { id: 'tech-rec', lab_id: 'lab-1', practitioner_id: 'tech-1', labs: { id: 'lab-1', status } },
    error: null,
  })
}

function makeBundle() {
  return {
    diagnosticReport: {
      id: REPORT_ID, resourceType: 'DiagnosticReport' as const, status: 'preliminary' as const,
      code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC' }], text: 'CBC' },
      subject: { reference: PATIENT_REF }, issued: '2026-09-14T09:00:00.000Z',
      _ultranos: { createdAt: '2026-09-14T09:00:00.000Z', hlcTimestamp: 'hlc', isOfflineCreated: true, templateVersion: 'v1' },
      meta: { lastUpdated: '2026-09-14T09:00:00.000Z', versionId: '1' },
    },
    observations: [
      {
        id: '44444444-4444-4444-4444-444444444444', resourceType: 'Observation' as const, status: 'preliminary' as const,
        code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }], text: 'Hemoglobin' },
        valueQuantity: { value: 12.5, unit: 'g/dL' },
        interpretation: [{ coding: [{ system: 'x', code: 'L', display: 'Low' }] }],
        _ultranos: { isOfflineCreated: true, hlcTimestamp: 'hlc', createdAt: '2026-09-14T09:00:00.000Z', templateVersion: 'v1', referenceRange: { low: 13, high: 17 } },
        meta: { lastUpdated: '2026-09-14T09:00:00.000Z', versionId: '1' },
      },
    ],
  }
}

describe('lab.submitResult', () => {
  beforeEach(() => { vi.clearAllMocks(); drMaybeSingle.mockResolvedValue({ data: null, error: null }) })

  it('writes the report with status preliminary and patient_ref as the BARE blind index (R1)', async () => {
    setupLab()
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    const res = await caller.lab.submitResult(makeBundle())

    expect(res).toEqual({ diagnosticReportId: REPORT_ID, observationCount: 1 })
    const upserted = drUpsert.mock.calls[0]![0]
    // R1: subject.reference is `Patient/<blindIndex>`; the stored patient_ref must be the
    // BARE blindIndex (prefix stripped) to match OPD's patientBlindRef(realUuid) read path.
    expect(PATIENT_REF).toBe('Patient/hmac-abc123')
    expect(upserted).toMatchObject({ id: REPORT_ID, status: 'preliminary', patient_ref: 'hmac-abc123', loinc_code: '58410-2', lab_id: 'lab-1' })
  })

  it('fans analytes into diagnostic_report_observations (replace-then-insert)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await caller.lab.submitResult(makeBundle())
    expect(droDeleteEq).toHaveBeenCalled() // idempotent: clears prior analytes for this report
    const rows = droInsert.mock.calls[0]![0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      diagnostic_report_id: REPORT_ID, observation_id: '44444444-4444-4444-4444-444444444444',
      loinc_code: '718-7', value_quantity: { value: 12.5, unit: 'g/dL' }, reference_range: { low: 13, high: 17 },
    })
  })

  it('dispatches a LAB_RESULT_AVAILABLE notification to the ordering doctor', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await caller.lab.submitResult(makeBundle())
    await new Promise((r) => setTimeout(r, 0)) // notification is fire-and-forget
    const inserted = notifInsert.mock.calls[0]![0]
    expect(inserted.some((n: any) => n.recipientRole === 'CLINICIAN' && n.type === 'LAB_RESULT_AVAILABLE')).toBe(true)
  })

  it('emits a PHI write audit event (Rule #6)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await caller.lab.submitResult(makeBundle())
    expect(mockAuditEmit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', resourceType: 'LAB_RESULT', resourceId: REPORT_ID }))
  })

  it('rejects an existing report owned by another lab', async () => {
    setupLab()
    drMaybeSingle.mockResolvedValue({ data: { id: REPORT_ID, lab_id: 'other-lab' }, error: null })
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await expect(caller.lab.submitResult(makeBundle())).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects non-lab roles', async () => {
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1', orgId: 'org-1' }))
    await expect(caller.lab.submitResult(makeBundle())).rejects.toBeDefined()
  })
})
