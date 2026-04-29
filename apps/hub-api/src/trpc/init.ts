import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { getSupabaseClient } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

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
 * JWT verification is a placeholder — will be wired to Supabase Auth in a later story.
 */
export const createTRPCContext = async (opts: {
  headers: Headers
}): Promise<TRPCContext> => {
  const supabase = getSupabaseClient()

  // Placeholder JWT verification — extract user from Authorization header
  // Will be replaced with Supabase Auth JWT verification in a later story
  let user: TRPCContext['user'] = null
  const authHeader = opts.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    // TODO: Verify JWT signature with Supabase Auth (story TBD)
    // For now, just acknowledge the header exists
    user = null
  }

  return { supabase, user, headers: opts.headers }
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const baseProcedure = t.procedure

/**
 * Protected procedure — requires a valid user in context.
 * Placeholder: will enforce real JWT verification once auth story is implemented.
 */
export const protectedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return opts.next({
    ctx: { ...opts.ctx, user: opts.ctx.user },
  })
})

