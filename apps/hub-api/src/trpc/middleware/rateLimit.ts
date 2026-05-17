import { TRPCError } from '@trpc/server'
import { createHash } from 'crypto'
import { getRedisClient } from '@/lib/redis'
import type { TRPCContext } from '../init'

export interface RateLimitConfig {
  /** Max requests per window. */
  limit: number
  /** Window duration in seconds. */
  windowSec: number
}

export const RATE_LIMIT_TIERS = {
  authenticated: { limit: 100, windowSec: 60 } satisfies RateLimitConfig,
  unauthenticated: { limit: 20, windowSec: 60 } satisfies RateLimitConfig,
  patientSearch: { limit: 10, windowSec: 60 } satisfies RateLimitConfig,
} as const

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetEpoch: number
}

/**
 * Derive a rate-limit key identifier.
 * Authenticated: userId. Unauthenticated: SHA-256 of IP from x-forwarded-for.
 */
export function deriveIdentifier(ctx: TRPCContext): { scope: 'auth' | 'ip'; id: string } {
  if (ctx.user?.sub) {
    return { scope: 'auth', id: ctx.user.sub }
  }
  const forwarded = ctx.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown'
  const hash = createHash('sha256').update(ip).digest('hex')
  return { scope: 'ip', id: hash }
}

/**
 * Check and increment rate limit counter in Redis using an atomic pipeline.
 * Key format: rl:{scope}:{identifier}:{endpoint}:{tier}:{windowKey}
 *
 * The {tier} segment prevents double-counting when multiple middleware instances
 * (e.g., protectedProcedure default + per-endpoint override) target the same endpoint.
 *
 * Fail-open: if Redis is unavailable, returns allowed=true and logs a warning.
 */
export async function checkRateLimit(
  identifier: { scope: string; id: string },
  endpoint: string,
  config: RateLimitConfig,
  tier: string = 'default',
): Promise<RateLimitResult> {
  const redis = getRedisClient()

  const windowKey = Math.floor(Date.now() / (config.windowSec * 1000))
  const resetEpoch = (windowKey + 1) * config.windowSec

  if (!redis) {
    // No Redis configured — fail-open (dev mode)
    return { allowed: true, limit: config.limit, remaining: config.limit, resetEpoch }
  }

  const key = `rl:${identifier.scope}:${identifier.id}:${endpoint}:${tier}:${windowKey}`
  const ttl = config.windowSec + 1 // +1s buffer

  try {
    // Atomic pipeline: INCR + EXPIRE in a single round-trip to avoid
    // race conditions where EXPIRE could fail independently of INCR.
    const pipeline = redis.pipeline()
    pipeline.incr(key)
    pipeline.expire(key, ttl)
    const results = await pipeline.exec()

    const count = (results?.[0]?.[1] as number) ?? 1

    const remaining = Math.max(0, config.limit - count)
    return {
      allowed: count <= config.limit,
      limit: config.limit,
      remaining,
      resetEpoch,
    }
  } catch (err) {
    // Fail-open: Redis error should not block requests
    // Sanitize error message to avoid leaking Redis URL credentials
    const errMsg = ((err as Error).message ?? 'unknown error').replace(/redis:\/\/[^\s]+/gi, 'redis://***')
    console.warn('[RATE_LIMIT] Redis error, allowing request:', errMsg)
    return { allowed: true, limit: config.limit, remaining: config.limit, resetEpoch }
  }
}

/**
 * Creates a tRPC middleware that enforces rate limiting.
 * Attaches rate limit info to ctx.rateLimit for header injection via responseMeta.
 */
export function rateLimitMiddleware(configOverride?: RateLimitConfig, tierName?: string) {
  return async (opts: {
    ctx: TRPCContext
    path: string
    next: (opts: { ctx: TRPCContext & { rateLimit?: RateLimitResult } }) => Promise<unknown>
  }) => {
    const { scope, id } = deriveIdentifier(opts.ctx)
    const config = configOverride ?? (scope === 'auth'
      ? RATE_LIMIT_TIERS.authenticated
      : RATE_LIMIT_TIERS.unauthenticated)

    const tier = tierName ?? 'default'
    const result = await checkRateLimit({ scope, id }, opts.path, config, tier)

    // Attach rateLimit to ctx BEFORE the allowed check so responseMeta
    // can emit X-RateLimit-* headers even on 429 error responses.
    const ctxWithRateLimit = { ...opts.ctx, rateLimit: result }

    if (!result.allowed) {
      // Stash rateLimit on ctx for responseMeta header injection
      ;(opts as { ctx: TRPCContext & { rateLimit?: RateLimitResult } }).ctx = ctxWithRateLimit
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded — try again later',
      })
    }

    return opts.next({
      ctx: ctxWithRateLimit,
    })
  }
}
