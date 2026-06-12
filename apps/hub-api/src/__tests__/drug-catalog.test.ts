import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase BEFORE importing the router
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabase),
  db: {
    fromRowRaw: (row: Record<string, unknown>) => row,
    fromRows: (rows: Record<string, unknown>[]) => rows,
    toRowRaw: (data: Record<string, unknown>) => data,
  },
}))

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

const { createCallerFactory } = await import('../trpc/init')
const { appRouter } = await import('../trpc/routers/_app')
const createCaller = createCallerFactory(appRouter)

const DOCTOR_USER = { sub: 'doc-001', role: 'DOCTOR', sessionId: 's1', orgId: null, status: 'active' }
const PHARMACIST_USER = { sub: 'ph-001', role: 'PHARMACIST', sessionId: 's2', orgId: null, status: 'active' }
const PATIENT_USER = { sub: 'pat-001', role: 'PATIENT', sessionId: 's3', orgId: null, status: 'active' }

function ctx(user = DOCTOR_USER) {
  return { supabase: mockSupabase as never, user, headers: new Headers() }
}

const AMOX_ROW = {
  atc_code: 'J01CA04',
  inn_name: 'Amoxicillin',
  brand_names: ['Amoxil'],
  dose_forms: ['capsule'],
  therapeutic_class: 'Aminopenicillin',
  local_names: { prs: 'آموکسیسیلین' },
  summary_plain: { en: 'An antibiotic.' },
  used_for: [],
  common_side_effects: [],
  when_to_seek_help: {},
  storage_instructions: {},
  pregnancy_summary_plain: {},
  warnings_summary_plain: {},
  mechanism_of_action: 'Inhibits cell wall synthesis.',
  indications_clinical: [],
  adult_dosing: [],
  pediatric_dosing: [],
  renal_adjustment: null,
  adverse_events: [],
  contraindications: [],
  interactions: [],
  pregnancy_category: 'B',
  administration_notes: {},
  pharmacokinetics: {},
  formulary_status: 'on_formulary',
  dispensing_notes: null,
  substitutes: [],
  recall_alerts: [],
  unit_cost: 3.2,
  version: 1718000000000,
  last_updated: '2026-06-12T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('drugCatalog.search', () => {
  it('returns search results for a query', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [AMOX_ROW], error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx())
    const result = await caller.drugCatalog.search({ q: 'amox', lang: 'en' })
    expect(result).toHaveLength(1)
    expect(result[0].atcCode).toBe('J01CA04')
    expect(result[0].innName).toBe('Amoxicillin')
    // Search results must NOT include tier content
    expect((result[0] as Record<string, unknown>).mechanismOfAction).toBeUndefined()
  })

  it('requires authentication', async () => {
    const caller = createCaller({ ...ctx(), user: null as never })
    await expect(caller.drugCatalog.search({ q: 'amox', lang: 'en' })).rejects.toThrow()
  })
})

describe('drugCatalog.getByAtcCode', () => {
  it('returns tier-1 only for PATIENT role', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: AMOX_ROW, error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx(PATIENT_USER))
    const result = await caller.drugCatalog.getByAtcCode({ atcCode: 'J01CA04' }) as Record<string, unknown>
    expect(result.innName).toBe('Amoxicillin')
    expect(result.mechanismOfAction).toBeUndefined()
    expect(result.formularyStatus).toBeUndefined()
  })

  it('returns tier-1+2 for DOCTOR role', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: AMOX_ROW, error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx(DOCTOR_USER))
    const result = await caller.drugCatalog.getByAtcCode({ atcCode: 'J01CA04' }) as Record<string, unknown>
    expect(result.mechanismOfAction).toBe('Inhibits cell wall synthesis.')
    expect(result.formularyStatus).toBeUndefined()
  })

  it('returns all tiers for PHARMACIST role', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: AMOX_ROW, error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx(PHARMACIST_USER))
    const result = await caller.drugCatalog.getByAtcCode({ atcCode: 'J01CA04' }) as Record<string, unknown>
    expect(result.mechanismOfAction).toBe('Inhibits cell wall synthesis.')
    expect(result.formularyStatus).toBe('on_formulary')
    expect(result.unitCost).toBe(3.2)
  })

  it('throws NOT_FOUND when drug does not exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    })

    const caller = createCaller(ctx())
    await expect(caller.drugCatalog.getByAtcCode({ atcCode: 'UNKNOWN' })).rejects.toThrow(/NOT_FOUND/)
  })
})

describe('drugCatalog.sync', () => {
  it('returns entries updated since sinceVersion for DOCTOR', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [AMOX_ROW], error: null }),
          }),
        }),
      }),
    })

    const caller = createCaller(ctx(DOCTOR_USER))
    const result = await caller.drugCatalog.sync({ sinceVersion: 0 })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].atcCode).toBe('J01CA04')
    // Clinical fields present for DOCTOR
    expect((result.entries[0] as Record<string, unknown>).mechanismOfAction).toBeDefined()
    // Pharmacist fields absent for DOCTOR
    expect((result.entries[0] as Record<string, unknown>).formularyStatus).toBeUndefined()
    expect(result.latestVersion).toBe(1718000000000)
  })

  it('returns empty array when no entries have been updated', async () => {
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { version: 500 }, error: null }),
            }),
          }),
        }),
      })

    const caller = createCaller(ctx(DOCTOR_USER))
    const result = await caller.drugCatalog.sync({ sinceVersion: 999 })
    expect(result.entries).toHaveLength(0)
    expect(result.latestVersion).toBe(500)
  })
})

describe('drugCatalog.enrich', () => {
  it('allows PHARMACIST to set formulary_status', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...AMOX_ROW, formulary_status: 'on_formulary' },
              error: null,
            }),
          }),
        }),
      }),
    })

    const caller = createCaller(ctx(PHARMACIST_USER))
    const result = await caller.drugCatalog.enrich({
      atcCode: 'J01CA04',
      fields: { formularyStatus: 'on_formulary' },
    })
    expect(result.atcCode).toBe('J01CA04')
  })

  it('rejects DOCTOR attempting to set formulary_status', async () => {
    const caller = createCaller(ctx(DOCTOR_USER))
    await expect(
      caller.drugCatalog.enrich({
        atcCode: 'J01CA04',
        fields: { formularyStatus: 'on_formulary' },
      })
    ).rejects.toThrow(/FORBIDDEN/)
  })

  it('allows DOCTOR to set local_names', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...AMOX_ROW, local_names: { prs: 'آموکسیسیلین' } },
              error: null,
            }),
          }),
        }),
      }),
    })

    const caller = createCaller(ctx(DOCTOR_USER))
    const result = await caller.drugCatalog.enrich({
      atcCode: 'J01CA04',
      fields: { localNames: { prs: 'آموکسیسیلین' } },
    })
    expect(result).toBeDefined()
  })

  it('rejects PATIENT role entirely', async () => {
    const caller = createCaller(ctx(PATIENT_USER))
    await expect(
      caller.drugCatalog.enrich({ atcCode: 'J01CA04', fields: { localNames: {} } })
    ).rejects.toThrow()
  })
})

describe('drugCatalog.getPrices', () => {
  const PRICES_ROWS = [
    {
      atc_code: 'J01CA04',
      retail_price: 85,
      stock_signal: 'in_stock',
      dose_form: 'capsule',
      quantity: 20,
      pharmacy_facilities: {
        id: 'f1',
        name: 'Al-Shifa Pharmacy',
        latitude: 34.527,
        longitude: 69.179,
      },
    },
    {
      atc_code: 'J01CA04',
      retail_price: 120,
      stock_signal: 'in_stock',
      dose_form: 'capsule',
      quantity: 20,
      pharmacy_facilities: {
        id: 'f2',
        name: 'Ibn Sina Drugs',
        latitude: 34.541,
        longitude: 69.202,
      },
    },
  ]

  it('returns prices sorted by distance', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: PRICES_ROWS, error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx())
    const result = await caller.drugCatalog.getPrices({
      atcCode: 'J01CA04',
      lat: 34.526,
      lng: 69.176,
      sort: 'distance',
    })

    expect(result).toHaveLength(2)
    // Al-Shifa (34.527, 69.179) is closer to (34.526, 69.176) than Ibn Sina (34.541, 69.202)
    expect(result[0].pharmacyName).toBe('Al-Shifa Pharmacy')
    expect(result[0].retailPrice).toBe(85)
    expect(result[0].distanceKm).toBeGreaterThanOrEqual(0)
  })

  it('returns prices sorted by price ascending', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: PRICES_ROWS, error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx())
    const result = await caller.drugCatalog.getPrices({
      atcCode: 'J01CA04',
      lat: 34.526,
      lng: 69.176,
      sort: 'price',
    })

    expect(result[0].retailPrice).toBe(85)
    expect(result[1].retailPrice).toBe(120)
  })

  it('returns empty array when no prices exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx())
    const result = await caller.drugCatalog.getPrices({
      atcCode: 'J01CA04',
      lat: 34.526,
      lng: 69.176,
      sort: 'distance',
    })

    expect(result).toHaveLength(0)
  })
})

describe('drugCatalog.setPrice', () => {
  it('allows PHARMACIST to set a price', async () => {
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              atc_code: 'J01CA04',
              facility_id: 'f1',
              retail_price: 85,
              stock_signal: 'in_stock',
            },
            error: null,
          }),
        }),
      }),
    })

    const caller = createCaller(ctx(PHARMACIST_USER))
    const result = await caller.drugCatalog.setPrice({
      atcCode: 'J01CA04',
      facilityId: 'f1',
      retailPrice: 85,
      stockSignal: 'in_stock',
    })

    expect(result.retailPrice).toBe(85)
    expect(result.stockSignal).toBe('in_stock')
  })

  it('rejects DOCTOR role from setting prices', async () => {
    const caller = createCaller(ctx(DOCTOR_USER))
    await expect(
      caller.drugCatalog.setPrice({
        atcCode: 'J01CA04',
        facilityId: 'f1',
        retailPrice: 85,
        stockSignal: 'in_stock',
      })
    ).rejects.toThrow(/FORBIDDEN/)
  })
})
