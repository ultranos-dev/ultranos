import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { getSupabaseClient } from '@/lib/supabase'
import { verifySupabaseJwt, getSupabaseJwk } from '@/lib/jwt'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@ultranos/shared-types'

/**
 * tRPC context — available to every procedure.
 * Carries the Supabase client and optional user info from JWT verification.
 */
export interface TRPCContext {
  supabase: SupabaseClient
  user: { sub: string; role: string; sessionId: string } | null
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
      const payload = await verifySupabaseJwt(token, jwk)
      if (payload?.sub) {
        user = {
          sub: payload.sub,
          role: ((payload.role as string) ?? '').toUpperCase(),
          sessionId: (payload.session_id as string) ?? '',
        }
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
export const baseProcedure = t.procedure

/** Expose the tRPC instance for middleware composition in rbac.ts */
export const tInstance = t

/**
 * Protected procedure — requires a valid authenticated user in context.
 * Fail-Safe: if no user, throws UNAUTHORIZED (No Access default).
 */
export const protectedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return opts.next({
    ctx: { ...opts.ctx, user: opts.ctx.user },
  })
})

