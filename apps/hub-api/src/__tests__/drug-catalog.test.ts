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
