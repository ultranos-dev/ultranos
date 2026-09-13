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
    user: { sub: 'auth-1', practitionerId: 'auth-1', role: 'DOCTOR', orgId: 'org-1', sessionId: 's1', facilityId: null, status: null },
    headers: new Headers(),
  }
  return { ctx, sr, prac }
}

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
