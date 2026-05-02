import { describe, it, expect, vi } from 'vitest'

// Mock the Supabase client before importing the router
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

// Must import after mock setup
const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function createTestContext(overrides?: { supabaseFrom?: ReturnType<typeof vi.fn> }) {
  const supabase = {
    from: overrides?.supabaseFrom ?? vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }

  return {
    supabase: supabase as never,
    user: null,
    headers: new Headers(),
  }
}

describe('health.check', () => {
  it('returns ok status when Supabase is reachable', async () => {
    const ctx = createTestContext()
    const caller = createCaller(ctx)

    const result = await caller.health.check()

    expect(result.status).toBe('ok')
    expect(result.version).toBe('0.1.0')
    expect(result.services.db).toBe('connected')
    expect(result.timestamp).toBeDefined()
  })

  it('returns degraded status when Supabase returns an error', async () => {
    const ctx = createTestContext({
      supabaseFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST301', message: 'connection failed' },
          }),
        }),
      }),
    })
    const caller = createCaller(ctx)

    const result = await caller.health.check()

    expect(result.status).toBe('degraded')
    expect(result.services.db).toBe('error')
  })

  it('returns degraded status when Supabase throws', async () => {
    const ctx = createTestContext({
      supabaseFrom: vi.fn().mockImplementation(() => {
        throw new Error('Network error')
      }),
    })
    const caller = createCaller(ctx)

    const result = await caller.health.check()

    expect(result.status).toBe('degraded')
    expect(result.services.db).toBe('unreachable')
  })

  it('treats PGRST116 (empty table) as connected', async () => {
    const ctx = createTestContext({
      supabaseFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
          }),
        }),
      }),
    })
    const caller = createCaller(ctx)

    const result = await caller.health.check()

    expect(result.status).toBe('ok')
    expect(result.services.db).toBe('connected')
  })

  it('includes ISO 8601 timestamp', async () => {
    const ctx = createTestContext()
    const caller = createCaller(ctx)

    const result = await caller.health.check()

    // Validate ISO 8601 format
    expect(() => new Date(result.timestamp)).not.toThrow()
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp)
  })
})
