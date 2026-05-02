import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { db } from '@/lib/supabase'
import { AuditLogger } from '@ultranos/audit-logger'

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
      const { data: notifications, error } = await ctx.supabase
        .from('notifications')
        .select('id, type, payload, status, created_at, delivered_at, acknowledged_at')
        .eq('recipient_ref', ctx.user.sub)
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
        const audit = new AuditLogger(ctx.supabase)
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
        }) => ({
          id: n.id,
          type: n.type,
          payload: typeof n.payload === 'string' ? (() => { try { return JSON.parse(n.payload) } catch { return {} } })() : n.payload,
          status: n.status === 'QUEUED' ? 'SENT' : n.status,
          createdAt: n.created_at,
          deliveredAt: n.delivered_at,
          acknowledgedAt: n.acknowledged_at,
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
      // Verify ownership: notification must belong to the requesting user
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('notifications')
        .select('id, recipient_ref, status')
        .eq('id', input.notificationId)
        .eq('recipient_ref', ctx.user.sub)
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
      const audit = new AuditLogger(ctx.supabase)
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
   * Get unread notification count for the authenticated user.
   * Used by notification bell indicators in OPD Lite and Patient Lite Mobile.
   */
  unreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const { count, error } = await ctx.supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_ref', ctx.user.sub)
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
