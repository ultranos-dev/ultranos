import { TRPCError } from '@trpc/server'
import { createHash } from 'crypto'
import { getRedisClient } from '@/lib/redis'
import { tInstance } from '../init'
import type { TRPCContext } from '../init'

export interface RateLimitConfig {
  /** Max requests per window. */
  limit: number
  /** Window duration in seconds. */
  windowSec: number
}

export const RATE_LIMIT_TIERS = {
  /** General authenticated-endpoint default. */
  default: { limit: 100, windowSec: 60 } satisfies RateLimitConfig,
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
 * Options controlling Redis-outage behavior (Story 56.4 / audit M-HUB-2).
 */
export interface RateLimitOptions {
  /**
   * When true, this limiter FAILS CLOSED: a missing or errored Redis backend
   * denies the request (`allowed=false`) instead of allowing it. Reserved for
   * auth-critical endpoints (patient OTP request, login-adjacent reporting)
   * where a Redis blip must NOT reopen a brute-force / flooding window.
   *
   * When false/undefined the limiter stays FAIL-OPEN — a Redis outage never
   * locks legitimate clinical traffic out of the Hub.
   */
  critical?: boolean
}

/**
 * Check and increment rate limit counter in Redis using an atomic pipeline.
 * Key format: rl:{scope}:{identifier}:{endpoint}:{tier}:{windowKey}
 *
 * The {tier} segment prevents double-counting when multiple middleware instances
 * (e.g., protectedProcedure default + per-endpoint override) target the same endpoint.
 *
 * Fail behavior when the Redis backend is present but errors (connection drop,
 * timeout, null pipeline result) is governed by `options.critical`:
 * - critical=false (default): FAIL-OPEN — returns allowed=true, logs a warning.
 * - critical=true: FAIL-CLOSED — returns allowed=false so auth-critical endpoints
 *   throttle rather than expose a brute-force window during a Redis OUTAGE.
 *
 * IMPORTANT: "no Redis configured at all" (REDIS_URL unset — local dev / test)
 * is NOT treated as an outage. It always fails OPEN, even for critical limiters,
 * because there is no deployed rate-limit backend to have failed and no
 * brute-force surface in that environment. Fail-closed applies only to a
 * configured-but-unreachable Redis, which is the production outage scenario the
 * AC targets.
 */
export async function checkRateLimit(
  identifier: { scope: string; id: string },
  endpoint: string,
  config: RateLimitConfig,
  tier: string = 'default',
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const redis = getRedisClient()

  const windowKey = Math.floor(Date.now() / (config.windowSec * 1000))
  const resetEpoch = (windowKey + 1) * config.windowSec

  const critical = options.critical === true

  if (!redis) {
    // No Redis configured — dev/test mode. Fail-open regardless of `critical`
    // (see note above): there is no backend outage and no attack surface here.
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

    // A null exec() result (e.g. connection dropped mid-pipeline) is treated as
    // a backend failure: honor the fail-closed contract for critical limiters.
    if (!results) {
      if (critical) {
        console.warn('[RATE_LIMIT] Redis pipeline returned no result — failing CLOSED for critical endpoint')
        return { allowed: false, limit: config.limit, remaining: 0, resetEpoch }
      }
      return { allowed: true, limit: config.limit, remaining: config.limit, resetEpoch }
    }

    const count = (results[0]?.[1] as number) ?? 1

    const remaining = Math.max(0, config.limit - count)
    return {
      allowed: count <= config.limit,
      limit: config.limit,
      remaining,
      resetEpoch,
    }
  } catch (err) {
    // Sanitize error message to avoid leaking Redis URL credentials
    const errMsg = ((err as Error).message ?? 'unknown error').replace(/redis:\/\/[^\s]+/gi, 'redis://***')
    if (critical) {
      // Fail-CLOSED: Redis error on an auth-critical limiter denies the request.
      console.warn('[RATE_LIMIT] Redis error, DENYING critical request:', errMsg)
      return { allowed: false, limit: config.limit, remaining: 0, resetEpoch }
    }
    // Fail-open: Redis error should not block non-critical requests.
    console.warn('[RATE_LIMIT] Redis error, allowing request:', errMsg)
    return { allowed: true, limit: config.limit, remaining: config.limit, resetEpoch }
  }
}

/**
 * Creates a tRPC middleware that enforces rate limiting.
 * Attaches rate limit info to ctx.rateLimit for header injection via responseMeta.
 */
export function rateLimitMiddleware(
  configOverride?: RateLimitConfig,
  tierName?: string,
  options: RateLimitOptions = {},
) {
  return tInstance.middleware(async (opts) => {
    const { scope, id } = deriveIdentifier(opts.ctx)
    const config = configOverride ?? (scope === 'auth'
      ? RATE_LIMIT_TIERS.authenticated
      : RATE_LIMIT_TIERS.unauthenticated)

    const tier = tierName ?? 'default'
    const result = await checkRateLimit({ scope, id }, opts.path, config, tier, options)

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

    // Pass ONLY the added field to next(); tRPC merges it onto the existing
    // context. Spreading the whole `opts.ctx` here would re-widen a `user`
    // that an upstream procedure (e.g. protectedProcedure) had narrowed to
    // non-null, since this middleware's `opts.ctx` is typed as the base context.
    return opts.next({
      ctx: { rateLimit: result },
    })
  })
}
