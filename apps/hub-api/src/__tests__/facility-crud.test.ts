import { describe, it, expect, vi } from 'vitest'
import { buildFacilityCrud, mapFacilityRow } from '@/trpc/routers/_facility-crud'

const crud = buildFacilityCrud({
  table: 'clinical_facilities', typeColumn: 'facility_type',
  typeValues: ['clinic','hospital','opd'], resourceType: 'CLINICAL_FACILITY',
  extraColumns: ['bed_count','departments','specialties','emergency_services'],
})

function ctx(chain: Record<string, unknown>, role = 'ADMIN', orgId = 'org-1') {
  return { supabase: { from: vi.fn(() => chain) }, user: { role, orgId, sub: 'u1', sessionId: 's1' } } as never
}

describe('mapFacilityRow', () => {
  it('maps snake_case to camelCase', () => {
    const p = mapFacilityRow({ id: 'c1', org_id: 'org-1', name: 'Shifa', is_active: true, archived_at: null, google_rating: 4.6, is_24_7: false, created_at: 'T', updated_at: 'T' })
    expect(p).toMatchObject({ id: 'c1', orgId: 'org-1', name: 'Shifa', isActive: true, googleRating: 4.6, is247: false })
  })

  it('maps is_24_7 → is247 (P-R2 regression guard)', () => {
    const p = mapFacilityRow({ is_24_7: true })
    expect(p).toHaveProperty('is247', true)
    expect(p).not.toHaveProperty('is_24_7')
  })
})

describe('buildFacilityCrud.list', () => {
  it('org-scopes and excludes archived by default', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const c = ctx(chain)
    await crud.list(c, { facilityTypes: ['clinic'], cursor: 0, limit: 50 })
    expect(chain.eq).toHaveBeenCalledWith('org_id', 'org-1')
    expect(chain.is).toHaveBeenCalledWith('archived_at', null)
  })
})

describe('buildFacilityCrud.create', () => {
  it('sets org_id from ctx and inserts type', async () => {
    const row = { id: 'c9', org_id: 'org-1', name: 'New', facility_type: 'clinic', is_active: true, archived_at: null, created_at: 'T', updated_at: 'T', is_24_7: false }
    const chain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: row, error: null }) }
    const c = ctx(chain)
    const res = await crud.create(c, { facilityType: 'clinic', name: 'New' })
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ org_id: 'org-1', facility_type: 'clinic', name: 'New' }))
    expect(res.id).toBe('c9')
  })

  it('toColumns maps is247 → is_24_7 in insert payload (P-R2)', async () => {
    const row = { id: 'c10', org_id: 'org-1', name: 'New247', facility_type: 'clinic', is_active: true, archived_at: null, created_at: 'T', updated_at: 'T', is_24_7: true }
    const chain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: row, error: null }) }
    const c = ctx(chain)
    await crud.create(c, { facilityType: 'clinic', name: 'New247', is247: true })
    const insertArg = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg).toHaveProperty('is_24_7', true)
    expect(insertArg).not.toHaveProperty('is247')
  })
})

describe('buildFacilityCrud.getDetail', () => {
  it('returns NOT_FOUND for a row in another org', async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
    const c = ctx(chain)
    await expect(crud.getDetail(c, { id: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(chain.eq).toHaveBeenCalledWith('org_id', 'org-1')
  })
})
