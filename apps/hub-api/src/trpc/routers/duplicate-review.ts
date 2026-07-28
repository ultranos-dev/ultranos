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
        .select('id, patient_id, candidate_ids, candidate_scores, top_score, status, created_at')
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

      const reviewRows = (data ?? []) as Array<{
        id: string
        patient_id: string
        candidate_ids: string[] | null
        candidate_scores: number[] | null
        top_score: number
        status: string
        created_at: string
      }>

      // Hydrate demographics for the source patients AND every candidate in one
      // query — same direct-column read the patient directory uses (patient.list).
      // No PHI is logged; names live only in the returned payload.
      const patientIds = Array.from(
        new Set(reviewRows.flatMap((r) => [r.patient_id, ...(r.candidate_ids ?? [])])),
      )

      const demographics = new Map<string, {
        nameGiven?: string
        nameFather?: string
        birthYear?: number
        gender?: string
        districtOrigin?: string
      }>()

      if (patientIds.length > 0) {
        const { data: patientData, error: patientError } = await ctx.supabase
          .from('patients')
          .select('id, name_given, name_father, birth_year, gender, address_district_origin')
          .in('id', patientIds)

        if (patientError) {
          console.error('[DUPLICATE_REVIEW] Patient hydration error:', { code: patientError.code })
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list reviews' })
        }

        for (const p of (patientData ?? []) as Array<Record<string, unknown>>) {
          demographics.set(p.id as string, {
            nameGiven:      (p.name_given as string) ?? undefined,
            nameFather:     (p.name_father as string) ?? undefined,
            birthYear:      (p.birth_year as number) ?? undefined,
            gender:         (p.gender as string) ?? undefined,
            districtOrigin: (p.address_district_origin as string) ?? undefined,
          })
        }
      }

      // Shape raw rows into the DuplicateReviewRow contract OPD Lite expects.
      const reviews = reviewRows.map((row) => {
        const source = demographics.get(row.patient_id)
        const scores = row.candidate_scores ?? []
        return {
          id: row.id,
          // Given name only — never the full name — as the list label; falls back
          // to a short opaque id when the source patient has no given name.
          patientLabel: source?.nameGiven || `#${row.patient_id.slice(0, 8)}`,
          sourcePatientId: row.patient_id,
          candidates: (row.candidate_ids ?? []).map((candidateId, i) => {
            const demo = demographics.get(candidateId)
            return {
              id: candidateId,
              nameGiven:      demo?.nameGiven,
              nameFather:     demo?.nameFather,
              birthYear:      demo?.birthYear,
              gender:         demo?.gender,
              districtOrigin: demo?.districtOrigin,
              // Per-candidate score (frozen at flag time); falls back to the row's
              // top score for older rows that predate candidate_scores.
              mpiScore: scores[i] ?? row.top_score,
            }
          }),
          topScore: row.top_score,
          decision: row.status,
          createdAt: row.created_at,
        }
      })

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'duplicate-review-list',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'duplicate_review_list', resultCount: reviewRows.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: 'duplicate-review-list' })
      }

      return { reviews }
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

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
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

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
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
