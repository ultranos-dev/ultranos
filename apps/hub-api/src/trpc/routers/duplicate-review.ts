import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'

export const duplicateReviewRouter = createTRPCRouter({
  pendingCount: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .query(async ({ ctx }) => {
      const { count, error } = await ctx.supabase
        .from('duplicate_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING')

      if (error) {
        console.error('[DUPLICATE_REVIEW] Count error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to count reviews' })
      }

      return { count: count ?? 0 }
    }),

  list: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(z.object({
      status: z.enum(['PENDING', 'DISMISSED', 'FLAGGED_FOR_MERGE', 'MERGED']).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('duplicate_reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1)

      if (input.status) {
        query = query.eq('status', input.status)
      }

      const { data, error } = await query

      if (error) {
        console.error('[DUPLICATE_REVIEW] List error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list reviews' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'duplicate-review-list',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'duplicate_review_list', resultCount: (data ?? []).length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: 'duplicate-review-list' })
      }

      return { reviews: data ?? [] }
    }),

  dismiss: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(z.object({
      reviewId: z.string().uuid(),
      patientId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Update review status
      const { error: reviewError } = await ctx.supabase
        .from('duplicate_reviews')
        .update({
          status: 'DISMISSED',
          reviewed_by: ctx.user.sub,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', input.reviewId)

      if (reviewError) {
        console.error('[DUPLICATE_REVIEW] Dismiss error:', { code: reviewError.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to dismiss review' })
      }

      // Clear mpi_warn on the patient (false positive confirmed)
      const { error: patientError } = await ctx.supabase
        .from('patients')
        .update({ mpi_warn: false })
        .eq('id', input.patientId)

      if (patientError) {
        console.error('[DUPLICATE_REVIEW] Clear mpi_warn error:', { code: patientError.code })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'duplicate_dismiss', reviewId: input.reviewId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: input.patientId })
      }

      return { success: true }
    }),

  flagForMerge: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(z.object({
      reviewId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('duplicate_reviews')
        .update({
          status: 'FLAGGED_FOR_MERGE',
          reviewed_by: ctx.user.sub,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', input.reviewId)

      if (error) {
        console.error('[DUPLICATE_REVIEW] Flag error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to flag review' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: 'duplicate-review',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'duplicate_flag_for_merge', reviewId: input.reviewId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: 'duplicate-review' })
      }

      return { success: true }
    }),
})
