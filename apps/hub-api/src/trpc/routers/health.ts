import { z } from 'zod'
import { baseProcedure, createTRPCRouter } from '../init'
import { roleRestrictedProcedure } from '../rbac'
import { AuditLogger } from '@ultranos/audit-logger'
import { isRedisHealthy } from '@/lib/redis'

export const healthRouter = createTRPCRouter({
  /**
   * Health check — verifies the Hub API is running, Supabase is reachable,
   * and Redis connectivity status.
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

    // Redis status: connected, disconnected, or not_configured
    let redisStatus: 'connected' | 'disconnected' | 'not_configured'
    if (!process.env.REDIS_URL) {
      redisStatus = 'not_configured'
    } else {
      redisStatus = (await isRedisHealthy()) ? 'connected' : 'disconnected'
    }

    // Overall: ok if db=connected. Redis is non-critical (fail-open philosophy).
    const dbOk = dbStatus === 'connected'

    // Surface Redis issues as warnings, not as degraded status
    const warnings: string[] = []
    if (redisStatus === 'disconnected') {
      warnings.push('Redis disconnected — rate limiting and cron locks operating in fail-open mode')
    }

    return {
      status: dbOk ? ('ok' as const) : ('degraded' as const),
      version: '0.1.0',
      services: { db: dbStatus, redis: redisStatus },
      ...(warnings.length > 0 && { warnings }),
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
