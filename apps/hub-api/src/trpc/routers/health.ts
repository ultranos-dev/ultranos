import { z } from 'zod'
import { baseProcedure, createTRPCRouter } from '../init'
import { roleRestrictedProcedure } from '../rbac'
import { AuditLogger } from '@ultranos/audit-logger'

export const healthRouter = createTRPCRouter({
  /**
   * Health check — verifies the Hub API is running and Supabase is reachable.
   * No authentication required.
   */
  check: baseProcedure.query(async ({ ctx }) => {
    let dbStatus = 'connected'
    try {
      const { error } = await ctx.supabase
        .from('audit_log')
        .select('id')
        .limit(1)
      // PGRST116 = table empty, that's fine
      if (error && error.code !== 'PGRST116') {
        dbStatus = 'error'
      }
    } catch {
      dbStatus = 'unreachable'
    }

    const healthy = dbStatus === 'connected'

    return {
      status: healthy ? ('ok' as const) : ('degraded' as const),
      version: '0.1.0',
      services: { db: dbStatus },
      timestamp: new Date().toISOString(),
    }
  }),

  /**
   * AC 4: Verify the hash chain integrity of the audit log.
   * Restricted to ADMIN role. Returns valid/invalid with checked count.
   */
  auditChainIntegrity: roleRestrictedProcedure(['ADMIN'])
    .input(
      z.object({
        limit: z.number().min(1).max(10000).default(1000),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase)
      const limit = input?.limit ?? 1000
      const result = await audit.verifyChain(limit)

      return {
        valid: result.valid,
        checkedCount: result.checkedCount,
        brokenAt: result.brokenAt,
      }
    }),
})
