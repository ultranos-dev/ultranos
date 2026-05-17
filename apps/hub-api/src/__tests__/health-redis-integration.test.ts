import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Health Check + Redis Integration Tests — Story 23.0 Task 6
// Tests that health.check includes Redis status and computes
// overall health correctly across different Redis states.
// ============================================================

// Mock Redis module
let mockIsRedisHealthy = vi.fn<() => Promise<boolean>>()

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(),
  isRedisHealthy: (...args: unknown[]) => mockIsRedisHealthy(...(args as [])),
  _resetRedisClient: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
}) {
  const supabase = {
    from: overrides?.supabaseFrom ?? vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
      }),
    }),
  }
  return {
    supabase: supabase as never,
    user: null,
    headers: new Headers(),
  }
}

describe('health.check with Redis — Story 23.0', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsRedisHealthy = vi.fn()
  })

  it('includes redis status in services response', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    mockIsRedisHealthy.mockResolvedValue(true)

    const caller = createCaller(createTestContext())
    const result = await caller.health.check()

    expect(result.services).toHaveProperty('redis')
    expect(result.services).toHaveProperty('db')

    delete process.env.REDIS_URL
  })

  it('reports ok when both DB and Redis are connected', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    mockIsRedisHealthy.mockResolvedValue(true)

    const caller = createCaller(createTestContext())
    const result = await caller.health.check()

    expect(result.status).toBe('ok')
    expect(result.services.redis).toBe('connected')
    expect(result.services.db).toBe('connected')

    delete process.env.REDIS_URL
  })

  it('reports ok with warnings when Redis is disconnected but DB is connected', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    mockIsRedisHealthy.mockResolvedValue(false)

    const caller = createCaller(createTestContext())
    const result = await caller.health.check()

    expect(result.status).toBe('ok')
    expect(result.services.redis).toBe('disconnected')
    expect(result.services.db).toBe('connected')
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Redis disconnected')]),
    )

    delete process.env.REDIS_URL
  })

  it('reports ok when Redis is not_configured (REDIS_URL absent)', async () => {
    delete process.env.REDIS_URL

    const caller = createCaller(createTestContext())
    const result = await caller.health.check()

    expect(result.status).toBe('ok')
    expect(result.services.redis).toBe('not_configured')
  })

  it('does not include warnings when Redis is connected', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    mockIsRedisHealthy.mockResolvedValue(true)

    const caller = createCaller(createTestContext())
    const result = await caller.health.check()

    expect(result).not.toHaveProperty('warnings')

    delete process.env.REDIS_URL
  })

  it('reports degraded when DB is unreachable even if Redis is connected', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    mockIsRedisHealthy.mockResolvedValue(true)

    const supabaseFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue(new Error('DB connection refused')),
      }),
    })

    const caller = createCaller(createTestContext({ supabaseFrom }))
    const result = await caller.health.check()

    expect(result.status).toBe('degraded')
    expect(result.services.redis).toBe('connected')
    expect(result.services.db).toBe('unreachable')

    delete process.env.REDIS_URL
  })
})
