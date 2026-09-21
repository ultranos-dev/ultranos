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

const SPEC_ID = '55555555-5555-5555-5555-555555555555'
const PATIENT_REF = 'Patient/hmac-abc123'

// Real HLC format: "{wallMs:15digits}:{counter:5digits}:{nodeId}"
// These are distinct wall-clock values so compareHlc distinguishes on wallMs, not nodeId tiebreak.
const HLC_BASE   = '000000000010000:00000:nodeA'  // "stored baseline" and default input
const HLC_OLDER  = '000000000009000:00000:nodeA'  // older than HLC_BASE → should be skipped
const HLC_NEWER  = '000000000011000:00000:nodeA'  // newer than HLC_BASE → should write through

const mockTechSingle = vi.fn()
const mockTechSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: mockTechSingle })) }))
// specimens: ownership/hlc lookup (.select().eq().maybeSingle()) + upsert()
const specMaybeSingle = vi.fn()
const specUpsert = vi.fn(() => ({ error: null }))
const specSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: specMaybeSingle })) }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'lab_technicians') return { select: mockTechSelect }
  if (table === 'specimens') return { select: specSelect, upsert: specUpsert }
  if (table === 'organizations') return {
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: 'org-1', status: 'ACTIVE', cancelled_at: null }, error: null }) }) }),
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

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

// sub is 'authuser-1' (auth JWT sub) — DISTINCT from practitioner_id 'tech-1' returned by
// mockTechSingle. This distinction is intentional: Finding 1 fix ensures performer_id resolves
// to practitioner_id ('tech-1'), NOT ctx.user.sub ('authuser-1').
function makeCtx(user: { sub: string; practitionerId?: string; role: `${import('@ultranos/shared-types').UserRole}`; sessionId: string; orgId: string | null; facilityId: string | null; status: string | null } | null) {
  return { supabase: { from: mockFrom } as never, user, headers: new Headers() }
}
function setupLab(status = 'ACTIVE') {
  // mockTechSingle is shared by rbac middleware AND the new performer_id lookup (both call
  // lab_technicians → select → eq → single). The fixture includes both `id` (for rbac) and
  // `practitioner_id` (for the performer_id lookup) so both callers get what they need.
  mockTechSingle.mockResolvedValue({
    data: { id: 'tech-rec', lab_id: 'lab-1', practitioner_id: 'tech-1', labs: { id: 'lab-1', status } },
    error: null,
  })
}
function makeInput(over: Record<string, unknown> = {}) {
  return {
    id: SPEC_ID, labSampleId: 'LAB-20260914-0001', pipelineStatus: 'received' as const,
    fhirStatus: 'available', specimenType: 'blood', subjectReference: PATIENT_REF,
    serviceRequestRef: 'ServiceRequest/order-abc', receivedFrom: 'courier-1',
    receivedTime: '2026-09-14T09:00:00.000Z', condition: 'acceptable',
    note: 'left arm draw', hlcTimestamp: HLC_BASE,
    ...over,
  }
}

describe('lab.submitSpecimen', () => {
  beforeEach(() => { vi.clearAllMocks(); specMaybeSingle.mockResolvedValue({ data: null, error: null }) })

  it('upserts a specimen with BARE blind-index patient_ref and server-stamped lab/performer', async () => {
    setupLab()
    // sub='authuser-1' is the JWT auth sub; performer_id must resolve to 'tech-1' (practitioner_id)
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    const res = await caller.lab.submitSpecimen(makeInput())
    expect(res).toEqual({ specimenId: SPEC_ID, pipelineStatus: 'received' })
    const row = (specUpsert.mock.calls[0] as any[])[0]
    expect(row).toMatchObject({
      id: SPEC_ID, patient_ref: 'hmac-abc123', service_request_id: 'order-abc',
      lab_id: 'lab-1',
      performer_id: 'tech-1',  // practitioner_id from lab_technicians row, NOT ctx.user.sub ('authuser-1')
      pipeline_status: 'received',
      note: 'enc-left arm draw',
    })
  })

  it('rejects a specimen owned by another lab', async () => {
    setupLab()
    specMaybeSingle.mockResolvedValue({ data: { id: SPEC_ID, lab_id: 'other-lab', hlc_timestamp: HLC_BASE }, error: null })
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    await expect(caller.lab.submitSpecimen(makeInput())).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('skips the write when the stored hlc is newer (newer-wins, idempotent success)', async () => {
    setupLab()
    // stored=HLC_BASE (wallMs=10000), incoming=HLC_OLDER (wallMs=9000) → incoming is older → skip
    specMaybeSingle.mockResolvedValue({
      data: { id: SPEC_ID, lab_id: 'lab-1', hlc_timestamp: HLC_BASE }, error: null })
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    const res = await caller.lab.submitSpecimen(makeInput({ hlcTimestamp: HLC_OLDER }))
    expect(res).toEqual({ specimenId: SPEC_ID, pipelineStatus: 'received' })
    expect(specUpsert).not.toHaveBeenCalled()
  })

  it('writes through when the incoming hlc is newer than stored', async () => {
    setupLab()
    // stored=HLC_BASE (wallMs=10000), incoming=HLC_NEWER (wallMs=11000) → incoming is newer → write
    specMaybeSingle.mockResolvedValue({
      data: { id: SPEC_ID, lab_id: 'lab-1', hlc_timestamp: HLC_BASE }, error: null })
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    const res = await caller.lab.submitSpecimen(makeInput({ hlcTimestamp: HLC_NEWER }))
    expect(res).toEqual({ specimenId: SPEC_ID, pipelineStatus: 'received' })
    expect(specUpsert).toHaveBeenCalledOnce()
  })

  it('emits a SPECIMEN audit event (Rule #6)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    await caller.lab.submitSpecimen(makeInput())
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', resourceType: 'SPECIMEN', resourceId: SPEC_ID }))
  })

  it('rejects unknown DTO fields (data minimization)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    await expect(
      caller.lab.submitSpecimen(makeInput({ nationalId: '123' }) as never),
    ).rejects.toBeDefined()
  })

  it('rejects non-lab roles', async () => {
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'doc-1', role: 'DOCTOR' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    await expect(caller.lab.submitSpecimen(makeInput())).rejects.toBeDefined()
  })

  // ── Rule #6 audit-failure guarantee tests ────────────────────

  it('throws INTERNAL_SERVER_ERROR when audit.emit rejects on the write path (Rule #6 guarantee)', async () => {
    setupLab()
    mockAuditEmit.mockRejectedValueOnce(new Error('audit down'))
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    await expect(caller.lab.submitSpecimen(makeInput())).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('throws INTERNAL_SERVER_ERROR when audit.emit rejects on the newer-wins skip path (Rule #6 guarantee)', async () => {
    setupLab()
    // Seed stored row with HLC_BASE so incoming HLC_OLDER triggers cmp <= 0 → skip path
    specMaybeSingle.mockResolvedValue({
      data: { id: SPEC_ID, lab_id: 'lab-1', hlc_timestamp: HLC_BASE }, error: null,
    })
    mockAuditEmit.mockRejectedValueOnce(new Error('audit down'))
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'authuser-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    // Incoming is older → cmp <= 0 → skip path; but audit must still fire and throw
    await expect(caller.lab.submitSpecimen(makeInput({ hlcTimestamp: HLC_OLDER }))).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    // Upsert must NOT have been called (skip path)
    expect(specUpsert).not.toHaveBeenCalled()
  })
})
