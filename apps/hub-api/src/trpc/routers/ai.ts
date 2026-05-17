import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, baseProcedure, protectedProcedure } from '../init'
import { AuditLogger } from '@ultranos/audit-logger'
import {
  AIModelType,
  PublishModelVersionInputSchema,
  ModelUpdateEventSchema,
  type AIModelManifestEntry,
} from '@ultranos/shared-types'

/**
 * ADMIN-role-only middleware guard for AI model management.
 */
const adminProcedure = protectedProcedure.use(async (opts) => {
  if (opts.ctx.user.role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    })
  }
  return opts.next(opts)
})

/**
 * AI domain router — Story 24.4.
 * Serves model manifest (public) and admin model management endpoints.
 */
export const aiRouter = createTRPCRouter({
  /**
   * AC #7: Model manifest endpoint — returns current model versions and download URLs.
   * No auth required — edge devices need to check for updates without user login.
   *
   * Returns the latest version of each model_id, grouped by model type.
   * If modelType filter is provided, only returns models of that type.
   */
  getModelManifest: baseProcedure
    .input(
      z
        .object({
          modelType: z.nativeEnum(AIModelType).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Query all models, get latest version per model_id using distinct on
      let query = ctx.supabase
        .from('ai_model_registry')
        .select('model_id, model_type, version, download_url, file_size, checksum, released_at, delta_from_version')
        .order('model_id', { ascending: true })
        .order('released_at', { ascending: false })
        .limit(1000) // Explicit limit — model registry is bounded (few models × few versions)

      if (input?.modelType) {
        query = query.eq('model_type', input.modelType)
      }

      const { data: rows, error } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch model manifest',
        })
      }

      if (!rows || rows.length === 0) {
        return { models: [] as AIModelManifestEntry[] }
      }

      // Deduplicate: keep only the latest version per model_id
      // (rows are ordered by model_id ASC, released_at DESC)
      const seen = new Set<string>()
      const manifest: AIModelManifestEntry[] = []

      for (const row of rows) {
        if (seen.has(row.model_id)) continue
        seen.add(row.model_id)
        manifest.push({
          modelId: row.model_id,
          modelType: row.model_type as AIModelType,
          currentVersion: row.version,
          downloadUrl: row.download_url,
          fileSize: Number(row.file_size),
          checksum: row.checksum,
          releasedAt: row.released_at,
          deltaFromVersion: row.delta_from_version ?? null,
        })
      }

      return { models: manifest }
    }),

  /**
   * Admin endpoint: Publish a new model version to the registry.
   * Stores in ai_model_registry table. Duplicate (model_id, version) is rejected.
   */
  publishModelVersion: adminProcedure
    .input(PublishModelVersionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const row = {
        model_id: input.modelId,
        model_type: input.modelType,
        version: input.version,
        download_url: input.downloadUrl,
        file_size: input.fileSize,
        checksum: input.checksum,
        delta_from_version: input.deltaFromVersion ?? null,
      }

      const { data, error } = await ctx.supabase
        .from('ai_model_registry')
        .insert(row)
        .select('id, model_id, version, released_at')
        .single()

      if (error) {
        // Duplicate version check (Postgres unique constraint violation)
        if (error.code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Version ${input.version} already exists for model ${input.modelId}`,
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to publish model version',
        })
      }

      // Audit the model publish event (non-PHI, but important for traceability)
      const audit = new AuditLogger(ctx.supabase)
      await audit.emit({
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        action: 'CREATE',
        resourceType: 'AI_MODEL_REGISTRY',
        resourceId: data.id,
        patientId: '',
        sessionId: ctx.user.sessionId,
        outcome: 'SUCCESS',
        metadata: {
          modelId: input.modelId,
          modelType: input.modelType,
          version: input.version,
        },
      })

      return {
        id: data.id,
        modelId: data.model_id,
        version: data.version,
        releasedAt: data.released_at,
      }
    }),

  /**
   * Receive model update events from edge devices.
   * Events are logged for the monthly AI performance report (AC #6).
   * No auth required — devices report events opportunistically when online.
   */
  reportModelUpdateEvents: baseProcedure
    .input(z.object({ events: z.array(ModelUpdateEventSchema).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const rows = input.events.map((e) => ({
        device_id: e.deviceId,
        model_id: e.modelId,
        event_type: e.eventType,
        metadata: e.metadata,
      }))

      const { error } = await ctx.supabase
        .from('ai_model_update_events')
        .insert(rows)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to log model update events',
        })
      }

      return { logged: rows.length }
    }),

  /**
   * Admin endpoint: Get aggregated model update statistics for the clinical safety report.
   * Returns update success rates, stale device counts, and drug DB staleness incidents.
   */
  getModelUpdateStats: adminProcedure
    .input(
      z.object({
        sinceDate: z.string().datetime().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const since = input?.sinceDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      // Get events with metadata included for drug DB staleness detection
      // Use count-based aggregation for high-volume scenarios; for now, paginate with explicit limit
      const { data: eventCounts, error: evError } = await ctx.supabase
        .from('ai_model_update_events')
        .select('model_id, event_type, metadata')
        .gte('created_at', since)
        .limit(10000) // Safety bound — for very high volumes, switch to DB-level aggregation

      if (evError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch model update stats',
        })
      }

      const events = eventCounts ?? []

      // Aggregate stats in a single pass
      const byModel: Record<string, { started: number; completed: number; failed: number; staleDegraded: number }> = {}
      let totalStaleDevices = 0
      let drugDbStalenessIncidents = 0

      for (const ev of events) {
        if (!byModel[ev.model_id]) {
          byModel[ev.model_id] = { started: 0, completed: 0, failed: 0, staleDegraded: 0 }
        }
        const m = byModel[ev.model_id]
        switch (ev.event_type) {
          case 'MODEL_UPDATE_STARTED':
            m.started++
            break
          case 'MODEL_UPDATE_COMPLETED':
            m.completed++
            break
          case 'MODEL_UPDATE_FAILED':
            m.failed++
            break
          case 'MODEL_STALE_DEGRADED':
            m.staleDegraded++
            totalStaleDevices++
            // Count drug DB staleness incidents from metadata
            if (ev.metadata?.modelType === 'DRUG_DB_OFFLINE') {
              drugDbStalenessIncidents++
            }
            break
        }
      }

      // Calculate success rates per model
      const modelStats = Object.entries(byModel).map(([modelId, counts]) => ({
        modelId,
        successRate: counts.started > 0
          ? Math.round((counts.completed / counts.started) * 100)
          : null,
        ...counts,
      }))

      return {
        period: { since },
        modelStats,
        totalStaleDeviceEvents: totalStaleDevices,
        drugDbStalenessIncidents,
      }
    }),
})
