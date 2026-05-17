import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Mock Redis before importing rate limit module
const mockIncr = vi.fn()
const mockExpire = vi.fn()
const mockPipelineExec = vi.fn()
const mockOn = vi.fn()
const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockDisconnect = vi.fn()

const mockPipeline = vi.fn().mockReturnValue({
  incr: mockIncr.mockReturnThis(),
  expire: mockExpire.mockReturnThis(),
  exec: mockPipelineExec,
})

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    pipeline: mockPipeline,
    on: mockOn,
    connect: mockConnect,
    disconnect: mockDisconnect,
  })),
}))

// Control REDIS_URL env var
const originalEnv = process.env.REDIS_URL

import {
  checkRateLimit,
  deriveIdentifier,
  rateLimitMiddleware,
  RATE_LIMIT_TIERS,
} from '../trpc/middleware/rateLimit'
import type { RateLimitConfig } from '../trpc/middleware/rateLimit'
import type { TRPCContext } from '../trpc/init'

function makeCtx(overrides: Partial<TRPCContext> = {}): TRPCContext {
  return {
    supabase: {} as TRPCContext['supabase'],
    user: null,
    headers: new Headers(),
    ...overrides,
  }
}

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REDIS_URL = 'redis://localhost:6379'
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.REDIS_URL = originalEnv
    } else {
      delete process.env.REDIS_URL
    }
  })

  describe('deriveIdentifier', () => {
    it('returns auth scope with user sub for authenticated requests', () => {
      const ctx = makeCtx({
        user: { sub: 'user-123', role: 'CLINICIAN', sessionId: 's1', orgId: null },
      })
      const result = deriveIdentifier(ctx)
      expect(result.scope).toBe('auth')
      expect(result.id).toBe('user-123')
    })

    it('returns ip scope with SHA-256 hash for unauthenticated requests', () => {
      const headers = new Headers({ 'x-forwarded-for': '192.168.1.1' })
      const ctx = makeCtx({ headers })
      const result = deriveIdentifier(ctx)
      expect(result.scope).toBe('ip')
      expect(result.id).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hex
    })

    it('uses first IP from x-forwarded-for chain', () => {
      const headers = new Headers({ 'x-forwarded-for': '10.0.0.1, 10.0.0.2' })
      const ctx = makeCtx({ headers })
      const result = deriveIdentifier(ctx)
      expect(result.scope).toBe('ip')

      // Hash of '10.0.0.1'
      const headers2 = new Headers({ 'x-forwarded-for': '10.0.0.1' })
      const ctx2 = makeCtx({ headers: headers2 })
      const result2 = deriveIdentifier(ctx2)
      expect(result.id).toBe(result2.id)
    })

    it('falls back to hashing "unknown" when no x-forwarded-for', () => {
      const ctx = makeCtx()
      const result = deriveIdentifier(ctx)
      expect(result.scope).toBe('ip')
      expect(result.id).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('checkRateLimit', () => {
    const config: RateLimitConfig = { limit: 5, windowSec: 60 }
    const identifier = { scope: 'auth', id: 'user-1' }

    it('allows request when under limit', async () => {
      mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]])

      const result = await checkRateLimit(identifier, 'test.endpoint', config)
      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(5)
      expect(result.remaining).toBe(4) // 5 - 1
    })

    it('rejects request when at limit', async () => {
      mockPipelineExec.mockResolvedValue([[null, 6], [null, 1]]) // over limit of 5

      const result = await checkRateLimit(identifier, 'test.endpoint', config)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('uses atomic pipeline for INCR + EXPIRE', async () => {
      mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]])

      await checkRateLimit(identifier, 'test.endpoint', config)
      expect(mockPipeline).toHaveBeenCalledOnce()
      expect(mockIncr).toHaveBeenCalledWith(expect.stringContaining('rl:'))
      expect(mockExpire).toHaveBeenCalledWith(expect.stringContaining('rl:'), 61) // windowSec + 1
      expect(mockPipelineExec).toHaveBeenCalledOnce()
    })

    it('generates correct Redis key format with tier segment', async () => {
      mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]])

      await checkRateLimit({ scope: 'ip', id: 'abc123' }, 'lab.register', config)

      const key = mockIncr.mock.calls[0][0]
      expect(key).toMatch(/^rl:ip:abc123:lab\.register:default:\d+$/)
    })

    it('uses custom tier name in Redis key when provided', async () => {
      mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]])

      await checkRateLimit({ scope: 'auth', id: 'user-1' }, 'patient.search', config, 'patientSearch')

      const key = mockIncr.mock.calls[0][0]
      expect(key).toMatch(/^rl:auth:user-1:patient\.search:patientSearch:\d+$/)
    })

    it('returns correct resetEpoch aligned to next window', async () => {
      mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]])

      const before = Math.floor(Date.now() / 1000)
      const result = await checkRateLimit(identifier, 'test', config)

      // resetEpoch should be in the future within 2 windows
      expect(result.resetEpoch).toBeGreaterThanOrEqual(before)
      expect(result.resetEpoch).toBeLessThanOrEqual(before + config.windowSec * 2)
    })
  })

  describe('checkRateLimit — fail-open', () => {
    it('allows request when Redis pipeline throws an error', async () => {
      mockPipelineExec.mockRejectedValue(new Error('Connection refused'))

      const result = await checkRateLimit(
        { scope: 'auth', id: 'user-1' },
        'test',
        { limit: 10, windowSec: 60 },
      )
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(10)
    })

    it('allows request when REDIS_URL is not set (no Redis client)', async () => {
      // To test no-Redis path, we need to use the module with no REDIS_URL.
      // Since getRedisClient checks env at call time and the module-level client
      // may be cached, we test the behavior where getRedisClient returns null.
      // The checkRateLimit function handles null redis gracefully.
      delete process.env.REDIS_URL

      // Re-import to get fresh module state — use dynamic import
      vi.resetModules()
      const freshModule = await import('../trpc/middleware/rateLimit')

      const result = await freshModule.checkRateLimit(
        { scope: 'ip', id: 'hash' },
        'test',
        { limit: 20, windowSec: 60 },
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe('RATE_LIMIT_TIERS', () => {
    it('has correct defaults for authenticated tier', () => {
      expect(RATE_LIMIT_TIERS.authenticated).toEqual({ limit: 100, windowSec: 60 })
    })

    it('has correct defaults for unauthenticated tier', () => {
      expect(RATE_LIMIT_TIERS.unauthenticated).toEqual({ limit: 20, windowSec: 60 })
    })

    it('has stricter limit for patient.search', () => {
      expect(RATE_LIMIT_TIERS.patientSearch).toEqual({ limit: 10, windowSec: 60 })
    })
  })

  describe('rateLimitMiddleware', () => {
    it('allows request under limit and attaches rateLimit to ctx', async () => {
      mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]])

      const middleware = rateLimitMiddleware()
      const ctx = makeCtx({
        user: { sub: 'user-1', role: 'CLINICIAN', sessionId: 's1', orgId: null },
      })

      let capturedCtx: Record<string, unknown> | undefined
      await middleware({
        ctx,
        path: 'encounter.list',
        next: async (opts: { ctx: Record<string, unknown> }) => {
          capturedCtx = opts.ctx
          return { ok: true }
        },
      } as Parameters<ReturnType<typeof rateLimitMiddleware>>[0])

      expect(capturedCtx?.rateLimit).toBeDefined()
      const rl = capturedCtx!.rateLimit as { allowed: boolean; limit: number; remaining: number }
      expect(rl.allowed).toBe(true)
      expect(rl.limit).toBe(100) // authenticated default
      expect(rl.remaining).toBe(99)
    })

    it('throws TOO_MANY_REQUESTS when limit exceeded and attaches rateLimit to ctx', async () => {
      mockPipelineExec.mockResolvedValue([[null, 101], [null, 1]]) // over 100

      const middleware = rateLimitMiddleware()
      const ctx = makeCtx({
        user: { sub: 'user-1', role: 'CLINICIAN', sessionId: 's1', orgId: null },
      })

      const opts = {
        ctx,
        path: 'encounter.list',
        next: async () => ({ ok: true }),
      } as Parameters<ReturnType<typeof rateLimitMiddleware>>[0]

      await expect(middleware(opts)).rejects.toThrow(TRPCError)

      // Verify rateLimit is attached to ctx even on 429 (for responseMeta headers)
      expect((opts.ctx as Record<string, unknown>).rateLimit).toBeDefined()

      try {
        mockPipelineExec.mockResolvedValue([[null, 102], [null, 1]])
        await middleware({
          ctx: makeCtx({ user: { sub: 'user-1', role: 'CLINICIAN', sessionId: 's1', orgId: null } }),
          path: 'encounter.list',
          next: async () => ({ ok: true }),
        } as Parameters<ReturnType<typeof rateLimitMiddleware>>[0])
      } catch (err) {
        expect((err as TRPCError).code).toBe('TOO_MANY_REQUESTS')
      }
    })

    it('uses unauthenticated tier for requests without user', async () => {
      mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]])

      const middleware = rateLimitMiddleware()
      const ctx = makeCtx() // no user

      let capturedCtx: Record<string, unknown> | undefined
      await middleware({
        ctx,
        path: 'lab.reportAuthEvent',
        next: async (opts: { ctx: Record<string, unknown> }) => {
          capturedCtx = opts.ctx
          return { ok: true }
        },
      } as Parameters<ReturnType<typeof rateLimitMiddleware>>[0])

      const rl = capturedCtx!.rateLimit as { limit: number; remaining: number }
      expect(rl.limit).toBe(20) // unauthenticated default
      expect(rl.remaining).toBe(19)
    })

    it('accepts config override with tier name for patient.search', async () => {
      mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]])

      const middleware = rateLimitMiddleware(RATE_LIMIT_TIERS.patientSearch, 'patientSearch')
      const ctx = makeCtx({
        user: { sub: 'user-1', role: 'CLINICIAN', sessionId: 's1', orgId: null },
      })

      let capturedCtx: Record<string, unknown> | undefined
      await middleware({
        ctx,
        path: 'patient.search',
        next: async (opts: { ctx: Record<string, unknown> }) => {
          capturedCtx = opts.ctx
          return { ok: true }
        },
      } as Parameters<ReturnType<typeof rateLimitMiddleware>>[0])

      const rl = capturedCtx!.rateLimit as { limit: number }
      expect(rl.limit).toBe(10) // patientSearch override

      // Verify the tier name is used in the Redis key
      const key = mockIncr.mock.calls[0][0]
      expect(key).toContain(':patientSearch:')
    })

    it('rejects patient.search at stricter limit threshold', async () => {
      mockPipelineExec.mockResolvedValue([[null, 11], [null, 1]]) // over 10

      const middleware = rateLimitMiddleware(RATE_LIMIT_TIERS.patientSearch, 'patientSearch')
      const ctx = makeCtx({
        user: { sub: 'user-1', role: 'CLINICIAN', sessionId: 's1', orgId: null },
      })

      await expect(
        middleware({
          ctx,
          path: 'patient.search',
          next: async () => ({ ok: true }),
        } as Parameters<ReturnType<typeof rateLimitMiddleware>>[0]),
      ).rejects.toThrow(TRPCError)
    })
  })

  describe('Response headers (RateLimitResult shape)', () => {
    it('returns all fields needed for X-RateLimit-* headers', async () => {
      mockPipelineExec.mockResolvedValue([[null, 5], [null, 1]])

      const result = await checkRateLimit(
        { scope: 'auth', id: 'user-1' },
        'test',
        { limit: 100, windowSec: 60 },
      )

      expect(result).toHaveProperty('limit')
      expect(result).toHaveProperty('remaining')
      expect(result).toHaveProperty('resetEpoch')
      expect(typeof result.limit).toBe('number')
      expect(typeof result.remaining).toBe('number')
      expect(typeof result.resetEpoch).toBe('number')
      expect(result.remaining).toBe(95) // 100 - 5
    })
  })
})
