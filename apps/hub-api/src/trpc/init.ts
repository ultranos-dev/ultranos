import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { getSupabaseClient } from '@/lib/supabase'
import { verifySupabaseJwt, getSupabaseJwk } from '@/lib/jwt'
import { metricsMiddleware } from '@/trpc/middleware/metrics'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@ultranos/shared-types'

/**
 * tRPC context — available to every procedure.
 * Carries the Supabase client and optional user info from JWT verification.
 */
export interface TRPCContext {
  supabase: SupabaseClient
  user: { sub: string; role: string; sessionId: string; orgId: string | null; facilityId: string | null; status: string | null } | null
  headers: Headers
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
            role: ((userMeta.role as string) ?? (payload.role as string) ?? '').toUpperCase(),
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
export const baseProcedure = t.procedure.use(metricsMiddleware)

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

