import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((i: string) => `hmac-${i}`),
  encryptField: vi.fn((i: string) => `enc-${i}`),
}))
vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'k', hmacKey: 'h' })),
}))

const SPEC_ID_1 = '11111111-1111-1111-1111-111111111111'
const SPEC_ID_2 = '22222222-2222-2222-2222-222222222222'
const LAB_ID    = 'lab-1'
const OTHER_LAB = 'other-lab'

const HLC_A = '000000000010000:00000:nodeA'

// Shared specimen rows returned by the query mock
const specRow1 = {
  id: SPEC_ID_1,
  lab_sample_id: 'LAB-20260914-0001',
  pipeline_status: 'received',
  fhir_status: 'available',
  specimen_type: 'blood',
  patient_ref: 'hmac-patient1',          // bare blind index (no Patient/ prefix)
  service_request_id: 'order-abc',
  received_from: 'courier-1',
  received_time: '2026-09-14T09:00:00.000Z',
  condition: 'acceptable',
  hlc_timestamp: HLC_A,
}
const specRow2 = {
  id: SPEC_ID_2,
  lab_sample_id: 'LAB-20260914-0002',
  pipeline_status: 'in-processing',
  fhir_status: 'available',
  specimen_type: 'urine',
  patient_ref: 'hmac-patient2',
  service_request_id: null,
  received_from: null,
  received_time: '2026-09-14T10:00:00.000Z',
  condition: null,
  hlc_timestamp: HLC_A,
}

// ── Supabase builder mocks ──────────────────────────────────────────────────

// specimenSelect -> .from('specimens').select(...).eq('lab_id', ...).in(...).order(...).limit(...)
const specimenOrder  = vi.fn()
const specimenIn     = vi.fn()
const specimenEqLab  = vi.fn()
const specimenSelect = vi.fn()

// Technician lookup (shared by rbac middleware and router)
const mockTechSingle = vi.fn()
const mockTechSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: mockTechSingle })) }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'lab_technicians') return { select: mockTechSelect }
  if (table === 'specimens')       return { select: specimenSelect }
  if (table === 'organizations')   return {
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'org-1', status: 'ACTIVE', cancelled_at: null }, error: null,
      }),
    }) }),
  }
  if (table === 'org_subscriptions') return {
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
      limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
    }) }) }) }),
  }
  return { select: vi.fn() }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: { toRow: (d: any) => d, toRowRaw: (d: any) => d, fromRow: (d: any) => d, fromRows: (d: any[]) => d },
}))

// Import router under test after mocks are in place
const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

// Helper: build a ctx that looks like a LAB_TECH in lab-1
function makeCtx(user: { sub: string; role: string; sessionId: string; orgId?: string } | null) {
  return { supabase: { from: mockFrom } as never, user, headers: new Headers() }
}
function setupLab(status = 'ACTIVE') {
  mockTechSingle.mockResolvedValue({
    data: { id: 'tech-rec', lab_id: LAB_ID, practitioner_id: 'tech-1', labs: { id: LAB_ID, status } },
    error: null,
  })
}

/** Wire the Supabase specimen query chain to return `rows` */
function setupSpecimenQuery(rows: unknown[], error: unknown = null) {
  const limitMock = vi.fn().mockResolvedValue({ data: rows, error })
  const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
  const inMock    = vi.fn().mockReturnValue({ order: orderMock })
  const eqMock    = vi.fn().mockReturnValue({ in: inMock })
  specimenSelect.mockReturnValue({ eq: eqMock })

  // Expose refs for assertion
  specimenEqLab.mockImplementation(eqMock)
  specimenIn.mockImplementation(inMock)
  specimenOrder.mockImplementation(orderMock)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('lab.pullSpecimens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSpecimenQuery([specRow1, specRow2])
  })

  it('returns specimens for the callers lab with camelCase DTO', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }),
    )
    const res = await caller.lab.pullSpecimens()
    expect(res.specimens).toHaveLength(2)

    const first = res.specimens[0]!
    expect(first.id).toBe(SPEC_ID_1)
    expect(first.labSampleId).toBe('LAB-20260914-0001')
    expect(first.pipelineStatus).toBe('received')
    expect(first.fhirStatus).toBe('available')
    expect(first.specimenType).toBe('blood')
    // subjectReference must re-prefix the bare blind index
    expect(first.subjectReference).toBe(`Patient/hmac-patient1`)
    // serviceRequestRef must re-prefix the service_request_id
    expect(first.serviceRequestRef).toBe(`ServiceRequest/order-abc`)
    expect(first.receivedFrom).toBe('courier-1')
    expect(first.receivedTime).toBe('2026-09-14T09:00:00.000Z')
    expect(first.condition).toBe('acceptable')
    expect(first.hlcTimestamp).toBe(HLC_A)

    const second = res.specimens[1]!
    expect(second.serviceRequestRef).toBeUndefined()
    expect(second.receivedFrom).toBeUndefined()
    expect(second.condition).toBeUndefined()
  })

  it('applies lab_id filter (ownership scope) — never leaks other labs\' specimens', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }),
    )
    await caller.lab.pullSpecimens()

    // The first .eq() call on the specimens select must be eq('lab_id', labId)
    const eqCall = specimenSelect.mock.results[0]!.value.eq
    expect(eqCall).toHaveBeenCalledWith('lab_id', LAB_ID)
  })

  it('only returns received and in-processing statuses (active filter)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }),
    )
    await caller.lab.pullSpecimens()

    // The .in() call must restrict to active pipeline statuses
    const inCall = specimenSelect.mock.results[0]!.value.eq.mock.results[0]!.value.in
    expect(inCall).toHaveBeenCalledWith('pipeline_status', ['received', 'in-processing'])
  })

  it('output DTO never includes a `note` field (data minimization Rule #7)', async () => {
    setupLab()
    // Add a note field to the DB row — it must NOT appear in the output
    setupSpecimenQuery([{ ...specRow1, note: 'enc-sensitive-note' }])
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }),
    )
    const res = await caller.lab.pullSpecimens()
    expect((res.specimens[0] as any).note).toBeUndefined()
  })

  it('emits a SPECIMEN READ audit event (Rule #6) with count metadata', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }),
    )
    await caller.lab.pullSpecimens()
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'READ',
        resourceType: 'SPECIMEN',
        resourceId: LAB_ID,
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({ count: 2 }),
      }),
    )
  })

  it('rejects when lab context is missing (RBAC middleware fires before router guard)', async () => {
    // No setupLab() — mockTechSingle returns no data → labRestrictedProcedure throws FORBIDDEN
    // (middleware fires before the router's own PRECONDITION_FAILED guard)
    mockTechSingle.mockResolvedValue({ data: null, error: null })
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }),
    )
    await expect(caller.lab.pullSpecimens()).rejects.toBeDefined()
  })

  it('rejects non-lab roles (RBAC)', async () => {
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1', orgId: 'org-1' }),
    )
    await expect(caller.lab.pullSpecimens()).rejects.toBeDefined()
  })

  it('returns empty array when no active specimens exist', async () => {
    setupLab()
    setupSpecimenQuery([])
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }),
    )
    const res = await caller.lab.pullSpecimens()
    expect(res.specimens).toEqual([])
  })
})
