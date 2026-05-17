import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
  },
}))

// Mock clinical safety metrics (prevent actual Prometheus registration)
vi.mock('@/lib/clinical-safety-metrics', () => ({
  drugInteractionChecksTotal: { inc: vi.fn() },
  drugInteractionOverridesTotal: { inc: vi.fn() },
  prescriptionsWithoutInteractionCheckTotal: { inc: vi.fn() },
  unresolvedTier1Conflicts: { set: vi.fn() },
  oldestTier1ConflictAgeHours: { set: vi.fn() },
  contraindicatedOverrideRate: { set: vi.fn() },
  interactionCheckCompletionRate: { set: vi.fn() },
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

const ADMIN_USER = { sub: 'admin-001', role: 'ADMIN', sessionId: 'sess-admin', orgId: 'org-test-001' }
const NON_ADMIN_USER = { sub: 'user-001', role: 'CLINICIAN', sessionId: 'sess-user', orgId: 'org-test-001' }

function createTestContext(overrides?: { user?: any }) {
  const supabase = {
    from: mockSupabaseClient.from,
    rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'abc123' }], error: null }),
  }
  return {
    supabase: supabase as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('admin.getClinicalSafetyMetrics', () => {
  it('returns current clinical safety metrics for ADMIN users', async () => {
    mockSupabaseClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'medication_requests') {
        return {
          select: vi.fn().mockImplementation(() => ({
            gte: vi.fn().mockImplementation(() => {
              // This mock must support four chain patterns:
              // 1. .gte() → { count: 50 }  (total Rx 24h — bare await)
              // 2. .gte().eq('interaction_check','UNAVAILABLE') → { count: 2 }
              // 3. .gte().not('interaction_check', 'is', null) → { count: 50 }
              // 4. .gte().eq('interaction_check','BLOCKED').not() → { count: 1 }
              const obj: any = {
                then: (resolve: any) => resolve({ count: 50, error: null }),
                not: vi.fn().mockResolvedValue({ count: 50, error: null }),
                eq: vi.fn().mockImplementation(() => ({
                  then: (resolve: any) => resolve({ count: 2, error: null }),
                  not: vi.fn().mockResolvedValue({ count: 1, error: null }),
                })),
              }
              return obj
            }),
          })),
        }
      }
      if (table === 'sync_conflicts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      if (table === 'audit_log') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {
        select: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const ctx = createTestContext({ user: ADMIN_USER })
    const caller = createCaller(ctx)

    const result = await caller.admin.getClinicalSafetyMetrics()

    expect(result).toHaveProperty('interactionCheckCompletionRate')
    expect(result).toHaveProperty('completionRateStatus')
    expect(result).toHaveProperty('contraindicatedOverrideRate')
    expect(result).toHaveProperty('overrideRateStatus')
    expect(result).toHaveProperty('unresolvedTier1Conflicts')
    expect(result).toHaveProperty('tier1Status')
  })

  it('rejects non-ADMIN callers', async () => {
    const ctx = createTestContext({ user: NON_ADMIN_USER })
    const caller = createCaller(ctx)

    await expect(caller.admin.getClinicalSafetyMetrics()).rejects.toThrow('Admin access required')
  })
})

describe('admin.getClinicalSafetyReport', () => {
  it('returns report for requested month/year', async () => {
    const mockReport = {
      id: 'report-001',
      month: 4,
      year: 2026,
      report_data: {
        interactionCheckCompletionRate: 98.5,
        overrideBreakdown: { CONTRAINDICATED: 3, ALLERGY_MATCH: 0, MAJOR: 1, MODERATE: 5, MINOR: 0 },
      },
      generated_at: '2026-05-01T04:00:00Z',
    }

    mockSupabaseClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'clinical_safety_reports') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: mockReport, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'audit_log') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext({ user: ADMIN_USER })
    const caller = createCaller(ctx)

    const result = await caller.admin.getClinicalSafetyReport({ month: 4, year: 2026 })

    expect(result.id).toBe('report-001')
    expect(result.month).toBe(4)
    expect(result.year).toBe(2026)
    expect(result.report).toHaveProperty('interactionCheckCompletionRate')
  })

  it('returns NOT_FOUND when no report exists', async () => {
    mockSupabaseClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'clinical_safety_reports') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext({ user: ADMIN_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.admin.getClinicalSafetyReport({ month: 1, year: 2025 }),
    ).rejects.toThrow('No clinical safety report found')
  })

  it('rejects non-ADMIN callers', async () => {
    const ctx = createTestContext({ user: NON_ADMIN_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.admin.getClinicalSafetyReport({ month: 4, year: 2026 }),
    ).rejects.toThrow('Admin access required')
  })
})

describe('admin.listClinicalSafetyReports', () => {
  it('returns paginated list of available reports', async () => {
    mockSupabaseClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'clinical_safety_reports') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'r1', month: 4, year: 2026, generated_at: '2026-05-01T04:00:00Z' },
                    { id: 'r2', month: 3, year: 2026, generated_at: '2026-04-01T04:00:00Z' },
                  ],
                  error: null,
                  count: 2,
                }),
              }),
            }),
          }),
        }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext({ user: ADMIN_USER })
    const caller = createCaller(ctx)

    const result = await caller.admin.listClinicalSafetyReports({ limit: 12 })

    expect(result.reports).toHaveLength(2)
    expect(result.reports[0].month).toBe(4)
    expect(result.reports[0].year).toBe(2026)
    expect(result.total).toBe(2)
  })
})
