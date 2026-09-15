import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTRPCRouter, protectedProcedure } from '../init'
import { db } from '@/lib/supabase'
import { AuditLogger } from '@ultranos/audit-logger'
import { resolvePractitionerId } from '@/trpc/routers/sync'

/**
 * The set of `recipient_ref` values that address the authenticated caller.
 *
 * Notifications are dispatched keyed by the resolved `practitioners.id`
 * (lab.acknowledgeOrder, dispatchResultNotifications, medication dispense,
 * admin actions, etc.), NOT the auth `sub`. Reading by `sub` alone therefore
 * missed every clinician notification (they piled up QUEUED forever). This
 * mirrors `serviceRequest.getOrderStatus`: resolve auth sub → practitioners.id.
 *
 * Returns every id the caller could be addressed by so a single `.in()` scope
 * covers all dispatch conventions:
 *  - clinicians: [sub, jwt practitionerId, resolved practitioners.id]
 *  - patients / guardians: [sub] (no practitioner row → resolve is null)
 */
async function recipientRefsForUser(ctx: {
  supabase: SupabaseClient
  user: { sub: string; practitionerId?: string }
}): Promise<string[]> {
  const refs = new Set<string>()
  refs.add(ctx.user.sub)
  const jwtPractitionerRef = ctx.user.practitionerId ?? ctx.user.sub
  refs.add(jwtPractitionerRef)
  const resolved = await resolvePractitionerId(ctx.supabase, jwtPractitionerRef, new Map())
  if (resolved) refs.add(resolved)
  return [...refs]
}

/**
 * Generic ecosystem notification router.
 * Story 12.4: Notification Dispatch.
 *
 * Built as generic infrastructure — not lab-specific. All notification types
 * (lab results, prescriptions, consent changes, sync conflicts) flow through
 * this single service. The payload schema enforces data minimization:
 * NO raw result data or PHI in notification payloads.
 *
 * NOTE: Notification dispatch is internal-only (direct DB insert from server-side
 * code like lab.ts). This router exposes only read/acknowledge endpoints to clients.
 */

export const notificationRouter = createTRPCRouter({
  /**
   * List notifications for the authenticated user.
   * AC: 3, 4 — OPD Lite and Patient Lite Mobile poll this endpoint.
   * Returns newest first, limited to 50.
   */
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const recipientRefs = await recipientRefsForUser(ctx)
      const { data: notifications, error } = await ctx.supabase
        .from('notifications')
        .select('id, type, payload, status, created_at, delivered_at, acknowledged_at, source_app, subject_key, body_key, body_params, notes_key')
        .in('recipient_ref', recipientRefs)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch notifications',
        })
      }

      // Mark QUEUED notifications as SENT (delivered to client)
      const queuedIds = (notifications ?? [])
        .filter((n: { status: string }) => n.status === 'QUEUED')
        .map((n: { id: string }) => n.id)

      if (queuedIds.length > 0) {
        await ctx.supabase
          .from('notifications')
          .update(db.toRowRaw({ status: 'SENT', deliveredAt: new Date().toISOString() }, 'non-PHI: notifications'))
          .in('id', queuedIds)

        // Audit delivery events
        const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
        for (const id of queuedIds) {
          try {
            await audit.emit({
              action: 'UPDATE',
              resourceType: 'NOTIFICATION',
              resourceId: id,
              actorId: ctx.user.sub,
              actorRole: ctx.user.role,
              outcome: 'SUCCESS',
              sessionId: ctx.user.sessionId,
              metadata: { notificationAction: 'delivered' },
            })
          } catch {
            console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'NOTIFICATION', resourceId: id })
          }
        }
      }

      return {
        notifications: (notifications ?? []).map((n: {
          id: string
          type: string
          payload: string | object
          status: string
          created_at: string
          delivered_at: string | null
          acknowledged_at: string | null
          source_app: string | null
          subject_key: string | null
          body_key: string | null
          body_params: object | null
          notes_key: string | null
        }) => ({
          id: n.id,
          type: n.type,
          payload: typeof n.payload === 'string' ? (() => { try { return JSON.parse(n.payload) } catch { return {} } })() : n.payload,
          status: n.status === 'QUEUED' ? 'SENT' : n.status,
          createdAt: n.created_at,
          deliveredAt: n.delivered_at,
          acknowledgedAt: n.acknowledged_at,
          sourceApp: n.source_app ?? null,
          subjectKey: n.subject_key ?? null,
          bodyKey: n.body_key ?? null,
          bodyParams: n.body_params ?? {},
          notesKey: n.notes_key ?? null,
        })),
      }
    }),

  /**
   * Acknowledge a notification (mark as viewed).
   * AC: 3, 4 — called when doctor/patient views the notification.
   */
  acknowledge: protectedProcedure
    .input(
      z.object({
        notificationId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership: notification must belong to the requesting user.
      // recipient_ref is keyed by the resolved practitioners.id, so scope by the
      // caller's full ref set (sub + resolved practitioner id) — not raw sub.
      const recipientRefs = await recipientRefsForUser(ctx)
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('notifications')
        .select('id, recipient_ref, status')
        .eq('id', input.notificationId)
        .in('recipient_ref', recipientRefs)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        })
      }

      const { error: updateError } = await ctx.supabase
        .from('notifications')
        .update(db.toRowRaw({
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date().toISOString(),
        }, 'non-PHI: notifications'))
        .eq('id', input.notificationId)

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to acknowledge notification',
        })
      }

      // Audit acknowledgement
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      await audit.emit({
        action: 'UPDATE',
        resourceType: 'NOTIFICATION',
        resourceId: input.notificationId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: {
          notificationAction: 'acknowledged',
          recipientRef: ctx.user.sub,
        },
      })

      return { success: true }
    }),

  /**
   * Acknowledge ALL of the caller's unread notifications in one call.
   * Scoped to recipient_ref = caller and QUEUED/SENT status — never a
   * cross-recipient update. Used by the "mark all read" action.
   */
  acknowledgeAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      const recipientRefs = await recipientRefsForUser(ctx)
      const { error } = await ctx.supabase
        .from('notifications')
        .update(db.toRowRaw({
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date().toISOString(),
        }, 'non-PHI: notifications'))
        .in('recipient_ref', recipientRefs)
        .in('status', ['QUEUED', 'SENT'])

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to acknowledge notifications',
        })
      }

      // Audit bulk acknowledgement (append-only; recipient-scoped)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'NOTIFICATION',
          resourceId: `all:${ctx.user.sub}`,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { notificationAction: 'acknowledged_all', recipientRef: ctx.user.sub },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'NOTIFICATION', resourceId: `all:${ctx.user.sub}` })
      }

      return { success: true }
    }),

  /**
   * Delete a notification owned by the authenticated user.
   * Hard deletes the row after verifying caller ownership via recipient_ref.
   * The audit_log is the permanent record of the deletion.
   */
  delete: protectedProcedure
    .input(
      z.object({
        notificationId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership: notification must belong to the requesting user.
      const recipientRefs = await recipientRefsForUser(ctx)
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('notifications')
        .select('id, recipient_ref')
        .eq('id', input.notificationId)
        .in('recipient_ref', recipientRefs)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        })
      }

      const { error: deleteError } = await ctx.supabase
        .from('notifications')
        .delete()
        .eq('id', input.notificationId)

      if (deleteError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete notification',
        })
      }

      // Audit deletion (best-effort — consistent with acknowledge pattern)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'DELETE',
          resourceType: 'NOTIFICATION',
          resourceId: input.notificationId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            notificationAction: 'deleted',
            recipientRef: ctx.user.sub,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'DELETE', resourceType: 'NOTIFICATION', resourceId: input.notificationId })
      }

      return { success: true }
    }),

  /**
   * Get unread notification count for the authenticated user.
   * Used by notification bell indicators in OPD Lite and Patient Lite Mobile.
   */
  unreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const recipientRefs = await recipientRefsForUser(ctx)
      const { count, error } = await ctx.supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .in('recipient_ref', recipientRefs)
        .in('status', ['QUEUED', 'SENT'])

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch unread count',
        })
      }

      return { count: count ?? 0 }
    }),
})
