import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { getSupabaseClient } from '@/lib/supabase'
import { verifySupabaseJwt, getSupabaseJwk } from '@/lib/jwt'
import { recordRequestMetrics } from '@/trpc/middleware/metrics'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@ultranos/shared-types'

/**
 * tRPC context — available to every procedure.
 * Carries the Supabase client and optional user info from JWT verification.
 */
export interface TRPCContext {
  supabase: SupabaseClient
  user: {
    sub: string
    /**
     * The practitioner reference identity, derived the SAME way the spoke clients
     * do (`payload.practitioner_id ?? sub`). Encounters store the participant as
     * `Practitioner/${practitionerId}`, so any endpoint scoping by practitioner
     * must match on this — not raw `sub` — to stay correct if a `practitioner_id`
     * access-token claim is ever introduced. Optional so existing test contexts
     * (which omit it) still fall back to `sub`.
     */
    practitionerId?: string
    // The app role, normalized to a UserRole value (uppercased at construction).
    // Typed as `${UserRole}` (the string-value union) so it flows directly into
    // audit `actorRole` fields without a per-call-site cast. RBAC still treats any
    // unrecognized value as no-access, so an unexpected token claim fails safe.
    role: `${UserRole}`
    sessionId: string
    orgId: string | null
    facilityId: string | null
    status: string | null
  } | null
  headers: Headers
}

/**
 * The context as seen DOWNSTREAM of `protectedProcedure`, which throws when
 * `user` is null. Middleware factories `.use()`d on protected procedures should
 * type their `opts.ctx` as this (or an intersection adding their own augmented
 * fields) so `ctx.user` is non-null without per-access `?.` guards.
 */
export type AuthedTRPCContext = TRPCContext & {
  user: NonNullable<TRPCContext['user']>
}

/**
 * Creates the tRPC context for each request.
 * Verifies Supabase Auth JWT from Authorization header (RS256).
 * Fail-Safe: if JWT is missing or invalid, user is null (No Access by default).
 */
export const createTRPCContext = async (opts: {
  headers: Headers
}): Promise<TRPCContext> => {
  const supabase = getSupabaseClient()

  let user: TRPCContext['user'] = null
  const authHeader = opts.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const jwk = getSupabaseJwk()
    if (jwk) {
      try {
        const payload = await verifySupabaseJwt(token, jwk)
        if (payload?.sub) {
          // App-level role/org_id are in user_metadata (set at createUser time).
          // Supabase's top-level `role` is always "authenticated" — not our app role.
          const userMeta = (payload.user_metadata as Record<string, unknown>) ?? {}
          user = {
            sub: payload.sub,
            // Mirror the client's practitioner-ref derivation exactly (top-level
            // `practitioner_id` claim, falling back to sub) so participant-scoped
            // queries match whatever the spoke stored.
            practitionerId: (payload.practitioner_id as string) ?? payload.sub,
            role: ((userMeta.role as string) ?? (payload.role as string) ?? '').toUpperCase() as `${UserRole}`,
            sessionId: (payload.session_id as string) ?? '',
            orgId: (userMeta.org_id as string) ?? (payload.org_id as string) ?? null,
            facilityId: (userMeta.facility_id as string) ?? (payload.facility_id as string) ?? null,
            status: (userMeta.status as string) ?? null,
          }
        }
      } catch {
        // JWT verification failed — user remains null (UNAUTHORIZED)
      }
    }
  }

  return { supabase, user, headers: opts.headers }
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory

/**
 * Base procedure with metrics middleware as outermost layer — Story 23.1 Task 1.
 * Every tRPC call records latency, count, and error metrics.
 */
export const baseProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const start = performance.now()
    try {
      const result = await opts.next()
      recordRequestMetrics(opts.path, opts.type, 'ok', performance.now() - start)
      return result
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code ?? 'UNKNOWN'
      recordRequestMetrics(opts.path, opts.type, 'error', performance.now() - start, errorCode)
      throw err
    }
  }),
)

/** Expose the tRPC instance for middleware composition in rbac.ts */
export const tInstance = t

/**
 * Protected procedure — requires a valid authenticated user in context.
 * Fail-Safe: if no user, throws UNAUTHORIZED (No Access default).
 */
export const protectedProcedure = baseProcedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  // Story 27.7 AC #4: Suspended users cannot log in or access API
  if (opts.ctx.user.status === 'SUSPENDED') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'ACCOUNT_SUSPENDED',
    })
  }

  return opts.next({
    ctx: { ...opts.ctx, user: opts.ctx.user },
  })
})

