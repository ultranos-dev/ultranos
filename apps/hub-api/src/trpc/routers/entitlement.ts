import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'

/**
 * Entitlement domain router.
 * Story 27.3: Hub API Entitlement Middleware.
 *
 * Provides a lightweight entitlement check for spoke apps to query their
 * org's subscription status for a given module (UI gate in Story 27.4).
 */
export const entitlementRouter = createTRPCRouter({
  /**
   * Check whether the caller's org has an active/trial subscription for a module.
   * Any authenticated user can check their own org's entitlement.
   * Returns { status: 'active' | 'trial' | 'inactive' }.
   */
  check: protectedProcedure
    .input(
      z.object({
        moduleCode: z.enum(['OPD_LITE', 'PHARMACY_LITE', 'LAB_LITE']),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user.orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      const { data, error } = await ctx.supabase
        .from('org_subscriptions')
        .select('id, status')
        .eq('org_id', ctx.user.orgId)
        .eq('module_code', input.moduleCode)
        .in('status', ['ACTIVE', 'TRIAL'])
        .maybeSingle()

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to check entitlement',
        })
      }

      if (!data) {
        return { status: 'inactive' as const }
      }

      return {
        status: (data.status as string).toLowerCase() as 'active' | 'trial',
      }
    }),
})
