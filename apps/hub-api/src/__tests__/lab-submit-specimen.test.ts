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

function makeCtx(user: { sub: string; role: string; sessionId: string; orgId?: string } | null) {
  return { supabase: { from: mockFrom } as never, user, headers: new Headers() }
}
function setupLab(status = 'ACTIVE') {
  mockTechSingle.mockResolvedValue({
    data: { id: 'tech-rec', lab_id: 'lab-1', practitioner_id: 'tech-1', labs: { id: 'lab-1', status } },
    error: null,
  })
}
function makeInput(over: Record<string, unknown> = {}) {
  return {
    id: SPEC_ID, labSampleId: 'LAB-20260914-0001', pipelineStatus: 'received',
    fhirStatus: 'available', specimenType: 'blood', subjectReference: PATIENT_REF,
    serviceRequestRef: 'ServiceRequest/order-abc', receivedFrom: 'courier-1',
    receivedTime: '2026-09-14T09:00:00.000Z', condition: 'acceptable',
    note: 'left arm draw', hlcTimestamp: '2026-09-14T09:00:00.000Z-0000-node',
    ...over,
  }
}

describe('lab.submitSpecimen', () => {
  beforeEach(() => { vi.clearAllMocks(); specMaybeSingle.mockResolvedValue({ data: null, error: null }) })

  it('upserts a specimen with BARE blind-index patient_ref and server-stamped lab/performer', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    const res = await caller.lab.submitSpecimen(makeInput())
    expect(res).toEqual({ specimenId: SPEC_ID, pipelineStatus: 'received' })
    const row = specUpsert.mock.calls[0]![0]
    expect(row).toMatchObject({
      id: SPEC_ID, patient_ref: 'hmac-abc123', service_request_id: 'order-abc',
      lab_id: 'lab-1', performer_id: 'tech-1', pipeline_status: 'received',
      note: 'enc-left arm draw',
    })
  })

  it('rejects a specimen owned by another lab', async () => {
    setupLab()
    specMaybeSingle.mockResolvedValue({ data: { id: SPEC_ID, lab_id: 'other-lab', hlc_timestamp: 'x' }, error: null })
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await expect(caller.lab.submitSpecimen(makeInput())).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('skips the write when the stored hlc is newer (newer-wins, idempotent success)', async () => {
    setupLab()
    specMaybeSingle.mockResolvedValue({
      data: { id: SPEC_ID, lab_id: 'lab-1', hlc_timestamp: '2026-09-14T10:00:00.000Z-0000-node' }, error: null })
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    const res = await caller.lab.submitSpecimen(makeInput()) // incoming 09:00 < stored 10:00
    expect(res).toEqual({ specimenId: SPEC_ID, pipelineStatus: 'received' })
    expect(specUpsert).not.toHaveBeenCalled()
  })

  it('emits a SPECIMEN audit event (Rule #6)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await caller.lab.submitSpecimen(makeInput())
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', resourceType: 'SPECIMEN', resourceId: SPEC_ID }))
  })

  it('rejects unknown DTO fields (data minimization)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await expect(
      caller.lab.submitSpecimen(makeInput({ nationalId: '123' }) as never),
    ).rejects.toBeDefined()
  })

  it('rejects non-lab roles', async () => {
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1', orgId: 'org-1' }))
    await expect(caller.lab.submitSpecimen(makeInput())).rejects.toBeDefined()
  })
})
