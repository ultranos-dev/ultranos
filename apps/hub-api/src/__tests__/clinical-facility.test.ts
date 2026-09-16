import { describe, it, expect, vi } from 'vitest'
import { clinicalFacilityRouter } from '@/trpc/routers/clinical-facility'

function ctx(chain: any, role = 'ADMIN', orgId = 'org-1') {
  return { supabase: { from: vi.fn(() => chain) }, user: { role, orgId, sub: 'u1', sessionId: 's1' } } as never
}

describe('clinicalFacility.create', () => {
  it('rejects non-admin', async () => {
    await expect(clinicalFacilityRouter.createCaller(ctx({}, 'DOCTOR')).create({ facilityType: 'clinic', name: 'X' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('inserts a clinic scoped to the org', async () => {
    const row = { id: 'c9', org_id: 'org-1', name: 'Shifa', facility_type: 'clinic', is_active: true, archived_at: null, created_at: 'T', updated_at: 'T', is_24_7: false }
    const chain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: row, error: null }) }
    const res = await clinicalFacilityRouter.createCaller(ctx(chain)).create({ facilityType: 'clinic', name: 'Shifa' })
    expect(res.facilityType).toBe('clinic')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ org_id: 'org-1', facility_type: 'clinic' }))
  })
})
