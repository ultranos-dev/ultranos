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
