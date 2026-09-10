import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'

const REVIEW_COLUMNS =
  'id, dispense_id, prescription_id, override_reason, override_supervisor, status, reviewed_by, reviewed_at, created_at'

export const dispenseReviewRouter = createTRPCRouter({
  // GET — returns the raw snake_case rows as a BARE ARRAY (the /unverified page
  // reads body.result.data.json as DispenseReview[]; do NOT wrap in { reviews }).
  list: protectedProcedure
    .use(enforceResourceAccess('MedicationDispense'))
    .input(z.object({
      statuses: z.array(z.enum(['PENDING', 'APPROVED', 'FLAGGED'])).min(1),
    }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('dispense_reviews')
        .select(REVIEW_COLUMNS)
        .in('status', input.statuses)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[DISPENSE_REVIEW] List error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list dispense reviews' })
      }

      const rows = data ?? []

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'MEDICATION_DISPENSE',
          resourceId: 'dispense-review-list',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'dispense_review_list', resultCount: rows.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: 'dispense-review-list' })
      }

      return rows
    }),

  // POST — resolve a PENDING review to APPROVED/FLAGGED with reviewer + timestamp.
  updateStatus: protectedProcedure
    .use(enforceResourceAccess('MedicationDispense'))
    .input(z.object({
      reviewId: z.string().uuid(),
      status: z.enum(['APPROVED', 'FLAGGED']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: updatedRows, error } = await ctx.supabase
        .from('dispense_reviews')
        .update({
          status: input.status,
          reviewed_by: ctx.user.sub,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', input.reviewId)
        .eq('status', 'PENDING') // integrity guard: only a pending review may be resolved
        .select('id, prescription_id, override_supervisor, status')

      if (error) {
        console.error('[DISPENSE_REVIEW] Update error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update dispense review' })
      }

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'MEDICATION_DISPENSE',
          resourceId: input.reviewId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'dispense_review_update', reviewId: input.reviewId, newStatus: input.status },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: input.reviewId })
      }

      // Gap #9: notify the pharmacist who raised the override that a physician has
      // resolved their dispense-review. Recipient is override_supervisor (the
      // pharmacist's ref). Data-minimized payload (opaque ids + status, no PHI).
      // Best-effort — a notification failure must not fail the resolution.
      const resolved = updatedRows?.[0] as { override_supervisor?: string; prescription_id?: string | null } | undefined
      if (resolved?.override_supervisor) {
        try {
          const { data: notifRows } = await ctx.supabase
            .from('notifications')
            .insert(
              db.toRowRaw(
                {
                  recipientRef: resolved.override_supervisor,
                  recipientRole: 'PHARMACIST',
                  type: 'DISPENSE_REVIEW_RESOLVED',
                  payload: JSON.stringify({ reviewId: input.reviewId, prescriptionId: resolved.prescription_id ?? null, status: input.status }),
                  status: 'QUEUED',
                  nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
                },
                'non-PHI: notifications',
              ),
            )
            .select('id')
          const notifAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
          for (const n of notifRows ?? []) {
            try {
              await notifAudit.emit({
                action: 'CREATE',
                resourceType: 'NOTIFICATION',
                resourceId: n.id as string,
                actorId: ctx.user.sub,
                actorRole: ctx.user.role,
                outcome: 'SUCCESS',
                sessionId: ctx.user.sessionId,
                metadata: { notificationAction: 'dispatched_on_review_resolved', reviewId: input.reviewId },
              })
            } catch {
              console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'NOTIFICATION' })
            }
          }
        } catch {
          console.warn('[NOTIFY] dispense-review-resolved notification failed', { reviewId: input.reviewId })
        }
      }

      return { success: true as const }
    }),
})
