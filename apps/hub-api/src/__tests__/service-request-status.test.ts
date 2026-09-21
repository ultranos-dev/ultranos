import { describe, it, expect, vi, beforeEach } from 'vitest'

const emitMock = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: emitMock })),
}))

import { serviceRequestRouter } from '@/trpc/routers/service-request'

const O1 = '11111111-1111-1111-1111-111111111111'
const O2 = '22222222-2222-2222-2222-222222222222'
const LAB1 = '33333333-3333-3333-3333-333333333333'
const PRAC = '44444444-4444-4444-4444-444444444444'
const PAT1 = '55555555-5555-5555-5555-555555555555'

function makeCtx({ practitionerId = PRAC as string | null, rows = [] as unknown[] } = {}) {
  const sr = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
  const prac = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: practitionerId ? { id: practitionerId } : null }),
  }
  const supabase = { from: vi.fn((t: string) => (t === 'practitioners' ? prac : sr)) }
  const ctx = {
    supabase,
    user: { sub: 'auth-1', practitionerId: 'auth-1', role: 'DOCTOR' as const, orgId: 'org-1', sessionId: 's1', facilityId: null, status: null },
    headers: new Headers(),
  }
  return { ctx, sr, prac }
}

/**
 * Context factory for getOrderPatientRef.
 * The service_requests query chain is: select → eq(id) → eq(requester_id) → maybeSingle().
 */
function makePatientRefCtx({
  practitionerId = PRAC as string | null,
  srRow = null as { id: string; patient_id: string } | null,
} = {}) {
  const maybeSingleMock = vi.fn().mockResolvedValue({ data: srRow, error: null })
  const sr = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: maybeSingleMock,
  }
  const prac = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: practitionerId ? { id: practitionerId } : null }),
  }
  const supabase = { from: vi.fn((t: string) => (t === 'practitioners' ? prac : sr)) }
  const ctx = {
    supabase,
    user: { sub: 'auth-1', practitionerId: 'auth-1', role: 'DOCTOR' as const, orgId: 'org-1', sessionId: 's1', facilityId: null, status: null },
    headers: new Headers(),
  }
  return { ctx, sr, prac, maybeSingleMock }
}

describe('serviceRequest.getOrderPatientRef', () => {
  beforeEach(() => emitMock.mockClear())

  it('returns the patient_id for an order the caller authored', async () => {
    const { ctx } = makePatientRefCtx({ srRow: { id: O1, patient_id: PAT1 } })
    const res = await serviceRequestRouter.createCaller(ctx as never).getOrderPatientRef({ orderId: O1 })
    expect(res).toEqual({ patientRef: PAT1 })
  })

  it('returns { patientRef: null } when the order belongs to another requester (or does not exist)', async () => {
    // maybeSingle returns null row → not found / not scoped to this caller
    const { ctx, sr } = makePatientRefCtx({ srRow: null })
    const res = await serviceRequestRouter.createCaller(ctx as never).getOrderPatientRef({ orderId: O1 })
    expect(res).toEqual({ patientRef: null })

    // Verify the handler actually applied both authorization scope predicates so that
    // removing either .eq() would make this test fail (guards against accidental removal).
    expect(sr.eq).toHaveBeenCalledWith('id', O1)
    expect(sr.eq).toHaveBeenCalledWith('requester_id', PRAC)
  })

  it('returns { patientRef: null } when the caller resolves to no practitioner', async () => {
    const { ctx } = makePatientRefCtx({ practitionerId: null, srRow: { id: O1, patient_id: PAT1 } })
    const res = await serviceRequestRouter.createCaller(ctx as never).getOrderPatientRef({ orderId: O1 })
    expect(res).toEqual({ patientRef: null })
  })

  it('emits a PHI_READ audit with patientId on success', async () => {
    const { ctx } = makePatientRefCtx({ srRow: { id: O1, patient_id: PAT1 } })
    await serviceRequestRouter.createCaller(ctx as never).getOrderPatientRef({ orderId: O1 })
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'SERVICE_REQUEST',
        resourceId: O1,
        patientId: PAT1,
        metadata: { endpoint: 'serviceRequest.getOrderPatientRef' },
      }),
    )
  })

  it('still returns patientRef even when audit emit throws (audit never blocks the response)', async () => {
    emitMock.mockRejectedValueOnce(new Error('audit failure'))
    const { ctx } = makePatientRefCtx({ srRow: { id: O1, patient_id: PAT1 } })
    const res = await serviceRequestRouter.createCaller(ctx as never).getOrderPatientRef({ orderId: O1 })
    expect(res).toEqual({ patientRef: PAT1 })
  })

  it('emits a FAILURE audit before throwing when the DB query errors (Rule #6)', async () => {
    // Simulate a DB error from maybeSingle
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: new Error('db error') })
    const sr = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
    }
    const prac = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: PRAC }, error: null }),
    }
    const supabase = { from: vi.fn((t: string) => (t === 'practitioners' ? prac : sr)) }
    const ctx = {
      supabase,
      user: { sub: 'auth-1', practitionerId: 'auth-1', role: 'DOCTOR' as const, orgId: 'org-1', sessionId: 's1', facilityId: null, status: null },
      headers: new Headers(),
    }

    await expect(
      serviceRequestRouter.createCaller(ctx as never).getOrderPatientRef({ orderId: O1 }),
    ).rejects.toThrow()

    // A FAILURE audit must have been emitted before the throw
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'SERVICE_REQUEST',
        resourceId: O1,
        outcome: 'FAILURE',
        metadata: { endpoint: 'serviceRequest.getOrderPatientRef' },
      }),
    )
  })
})

describe('serviceRequest.getOrderStatus', () => {
  beforeEach(() => emitMock.mockClear())

  it("maps rows to LabOrderStatus scoped to the caller's own orders", async () => {
    const { ctx, sr } = makeCtx({
      rows: [
        { id: O1, status: 'on-hold', received_at: '2026-09-12T00:00:00Z', received_by_lab_id: LAB1 },
        { id: O2, status: 'active', received_at: null, received_by_lab_id: null },
      ],
    })
    const res = await serviceRequestRouter.createCaller(ctx as never).getOrderStatus({ ids: [O1, O2] })
    expect(res).toEqual([
      { id: O1, status: 'on-hold', receivedAt: '2026-09-12T00:00:00Z', receivedByLabId: LAB1 },
      { id: O2, status: 'active' },
    ])
    // Scoped to the resolved practitioners.id — a doctor sees only orders they authored.
    expect(sr.eq).toHaveBeenCalledWith('requester_id', PRAC)
  })

  it('returns [] when the caller resolves to no practitioner', async () => {
    const { ctx } = makeCtx({ practitionerId: null })
    const res = await serviceRequestRouter.createCaller(ctx as never).getOrderStatus({ ids: [O1] })
    expect(res).toEqual([])
  })

  it('emits a READ audit on success', async () => {
    const { ctx } = makeCtx({ rows: [{ id: O1, status: 'active', received_at: null, received_by_lab_id: null }] })
    await serviceRequestRouter.createCaller(ctx as never).getOrderStatus({ ids: [O1] })
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'READ', resourceType: 'SERVICE_REQUEST' }),
    )
  })
})
