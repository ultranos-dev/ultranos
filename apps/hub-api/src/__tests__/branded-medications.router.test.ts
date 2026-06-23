import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabase),
  db: { fromRowRaw: (r: Record<string, unknown>) => r, fromRows: (r: Record<string, unknown>[]) => r, toRowRaw: (d: Record<string, unknown>) => d },
}))

const mockFrom = vi.fn()
const mockRpc = vi.fn().mockResolvedValue({ data: [{ chain_hash: '0'.repeat(64) }], error: null })
const mockSupabase = { from: mockFrom, rpc: mockRpc }

const { createCallerFactory } = await import('../trpc/init')
const { appRouter } = await import('../trpc/routers/_app')
const createCaller = createCallerFactory(appRouter)

const PATIENT_USER = { sub: 'pat-001', role: 'PATIENT', sessionId: 's3', orgId: null, status: 'active' }
function ctx(user = PATIENT_USER) { return { supabase: mockSupabase as never, user, headers: new Headers() } }

const PRES_ROW = {
  id: 'p1', brand_id: 'b1', strength: '625 mg', dose_form: 'tablet', pack_size: 14, pack_unit: 'tablets',
  registration_status: 'marketed', reference_price: '12.50', currency: 'AFN', version: 1718000000002, last_updated: 't',
}
const BRAND_ROW = {
  id: 'b1', generic_atc_code: 'J01CR02', brand_name: 'Augmentin', manufacturer: 'GSK',
  brand_name_local: {}, rx_status: 'rx', version: 1718000000001, last_updated: 't',
  drug_brand_presentations: [PRES_ROW],
}

beforeEach(() => { vi.clearAllMocks(); mockRpc.mockResolvedValue({ data: [{ chain_hash: '0'.repeat(64) }], error: null }) })

describe('drugCatalog.getBrandsByAtc', () => {
  it('returns brands with nested presentations for a generic ATC code', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [BRAND_ROW], error: null }),
        }),
      }),
    })
    const caller = createCaller(ctx())
    const result = await caller.drugCatalog.getBrandsByAtc({ atcCode: 'J01CR02' })
    expect(result).toHaveLength(1)
    expect(result[0].brandName).toBe('Augmentin')
    expect(result[0].manufacturer).toBe('GSK')
    expect(result[0].presentations).toHaveLength(1)
    expect(result[0].presentations[0].strength).toBe('625 mg')
    expect(result[0].presentations[0].referencePrice).toBe(12.5)
  })

  it('returns [] when the drug has no brands', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }),
      }),
    })
    const caller = createCaller(ctx())
    expect(await caller.drugCatalog.getBrandsByAtc({ atcCode: 'X' })).toEqual([])
  })

  it('requires authentication', async () => {
    const caller = createCaller({ ...ctx(), user: null as never })
    await expect(caller.drugCatalog.getBrandsByAtc({ atcCode: 'J01CR02' })).rejects.toThrow()
  })
})

describe('drugCatalog.syncBrands', () => {
  it('returns brands updated since sinceVersion with latestVersion', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [BRAND_ROW], error: null }) }),
        }),
      }),
    })
    const caller = createCaller(ctx())
    const res = await caller.drugCatalog.syncBrands({ sinceVersion: 0 })
    expect(res.brands).toHaveLength(1)
    expect(res.brands[0].brandName).toBe('Augmentin')
    expect(res.latestVersion).toBe(1718000000001)
  })
})

describe('drugCatalog.syncBrandPresentations', () => {
  it('returns presentations updated since sinceVersion with latestVersion', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [PRES_ROW], error: null }) }),
        }),
      }),
    })
    const caller = createCaller(ctx())
    const res = await caller.drugCatalog.syncBrandPresentations({ sinceVersion: 0 })
    expect(res.presentations).toHaveLength(1)
    expect(res.presentations[0].strength).toBe('625 mg')
    expect(res.latestVersion).toBe(1718000000002)
  })
})
