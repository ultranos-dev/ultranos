import { baseProcedure, createTRPCRouter } from '../init'

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
})
