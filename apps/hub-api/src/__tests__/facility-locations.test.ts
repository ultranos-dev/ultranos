import { describe, it, expect, vi } from 'vitest'
import { facilityLocationsRouter } from '@/trpc/routers/facility-locations'

// A chainable supabase-query mock whose terminal call resolves to { data, error }.
// Two .order() calls: first returns `this`, second resolves the promise.
function queryMock(result: { data: unknown; error: unknown }) {
  const q: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }
  q.order = vi.fn()
    .mockReturnValueOnce(q)          // first .order('is_primary', …)
    .mockResolvedValueOnce(result)   // second .order('name', …) resolves
  return q
}

describe('facilityLocations.listForFacility', () => {
  it('FORBIDDEN when the JWT has no facilityId', async () => {
    const c = { supabase: { from: vi.fn() }, user: { role: 'PHARMACIST', facilityId: null } } as never
    await expect(facilityLocationsRouter.createCaller(c).listForFacility())
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('returns the caller-facility rows mapped, primary first', async () => {
    const rows = [
      { id: 'l1', facility_id: 'f1', name: 'Fridge', kind: 'fridge', is_primary: false, is_active: true, created_at: 'c', updated_at: 'u' },
      { id: 'l2', facility_id: 'f1', name: 'Main', kind: 'store', is_primary: true, is_active: true, created_at: 'c', updated_at: 'u' },
    ]
    const q = queryMock({ data: rows, error: null })
    const c = { supabase: { from: vi.fn(() => q) }, user: { role: 'PHARMACIST', facilityId: 'f1' } } as never
    const res = await facilityLocationsRouter.createCaller(c).listForFacility()
    expect(q.eq).toHaveBeenCalledWith('facility_id', 'f1')
    expect(res).toHaveLength(2)
    expect(res[0]).toEqual({ id: 'l1', facilityId: 'f1', name: 'Fridge', kind: 'fridge', isPrimary: false, isActive: true, createdAt: 'c', updatedAt: 'u' })
  })
})

describe('facilityLocations.listForAdmin', () => {
  it('rejects a non-admin caller', async () => {
    const c = { supabase: { from: vi.fn() }, user: { role: 'PHARMACIST', facilityId: 'f1' } } as never
    await expect(facilityLocationsRouter.createCaller(c).listForAdmin({ facilityId: '11111111-1111-1111-1111-111111111111' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('returns rows for the requested facility for an admin', async () => {
    const rows = [{ id: 'l1', facility_id: 'f9999999-9999-9999-9999-999999999999', name: 'Main', kind: 'store', is_primary: true, is_active: true, created_at: 'c', updated_at: 'u' }]
    const q = queryMock({ data: rows, error: null })
    const c = { supabase: { from: vi.fn(() => q) }, user: { role: 'ADMIN', facilityId: null } } as never
    const res = await facilityLocationsRouter.createCaller(c).listForAdmin({ facilityId: 'f9999999-9999-9999-9999-999999999999' })
    expect(q.eq).toHaveBeenCalledWith('facility_id', 'f9999999-9999-9999-9999-999999999999')
    expect(res[0]!.name).toBe('Main')
  })
})

// Test UUIDs
const F1 = 'f1000000-0000-0000-0000-000000000001'
const L0 = 'b0000000-0000-0000-0000-000000000000'
const L1 = 'b1000000-0000-0000-0000-000000000001'

describe('facilityLocations.create', () => {
  it('forces the first sub-location of a facility to be primary', async () => {
    const existing = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) }
    let inserted: Record<string, unknown> | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertChain: any = {
      insert: vi.fn((row: Record<string, unknown>) => { inserted = row; return insertChain }),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: L1, facility_id: F1, name: 'Main', kind: 'store', is_primary: true, is_active: true }, error: null }),
    }
    const from = vi.fn().mockReturnValueOnce(existing).mockReturnValueOnce(insertChain)
    const c = { supabase: { from }, user: { role: 'ADMIN' } } as never
    const res = await facilityLocationsRouter.createCaller(c).create({ facilityId: F1, name: 'Main' })
    expect(inserted).toMatchObject({ facility_id: F1, name: 'Main', kind: 'store', is_primary: true })
    expect(res.isPrimary).toBe(true)
  })

  it('clears the existing primary when a later create is marked primary', async () => {
    const existing = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [{ id: L0, is_primary: true }], error: null }) }
    const clear = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockResolvedValue({ error: null }) }
    const insertChain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: L1, facility_id: F1, name: 'B', kind: 'room', is_primary: true, is_active: true }, error: null }) }
    const from = vi.fn().mockReturnValueOnce(existing).mockReturnValueOnce(clear).mockReturnValueOnce(insertChain)
    const c = { supabase: { from }, user: { role: 'ADMIN' } } as never
    const res = await facilityLocationsRouter.createCaller(c).create({ facilityId: F1, name: 'B', kind: 'room', isPrimary: true })
    expect(clear.update).toHaveBeenCalledWith({ is_primary: false })
    expect(res.isPrimary).toBe(true)
  })

  it('maps a FK violation to NOT_FOUND (unknown facility)', async () => {
    const UNKNOWN_F = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    const existing = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) }
    const insertChain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { code: '23503' } }) }
    const from = vi.fn().mockReturnValueOnce(existing).mockReturnValueOnce(insertChain)
    const c = { supabase: { from }, user: { role: 'ADMIN' } } as never
    await expect(facilityLocationsRouter.createCaller(c).create({ facilityId: UNKNOWN_F, name: 'X' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('facilityLocations.update', () => {
  it('rejects isPrimary:false (cannot un-primary in isolation)', async () => {
    const c = { supabase: { from: vi.fn() }, user: { role: 'ADMIN' } } as never
    await expect(facilityLocationsRouter.createCaller(c).update({ id: L1, isPrimary: false }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('facilityLocations.setActive', () => {
  it('rejects deactivating the primary', async () => {
    const lookup = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { is_primary: true }, error: null }) }
    const c = { supabase: { from: vi.fn(() => lookup) }, user: { role: 'ADMIN' } } as never
    await expect(facilityLocationsRouter.createCaller(c).setActive({ id: L1, isActive: false }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
