import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../init'
import { AuditLogger } from '@ultranos/audit-logger'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'

const auditActionValues = Object.values(AuditAction) as [string, ...string[]]
const auditResourceTypeValues = Object.values(AuditResourceType) as [string, ...string[]]
const userRoleValues = Object.values(UserRole) as [string, ...string[]]

/**
 * Audit domain router.
 * Story 8.1: Client-Side Audit Ledger — Hub sync endpoint.
 *
 * Accepts batches of client-side audit events and feeds each
 * through the server-side AuditLogger (SHA-256 hash chaining).
 */
export const auditRouter = createTRPCRouter({
  /**
   * audit.sync — receive a batch of client audit events.
   * Any authenticated user can sync their own audit events.
   * actorId is overridden server-side with ctx.user.id to prevent impersonation.
   * Returns per-event success/failure so the client can update local status.
   */
  sync: protectedProcedure
    .input(
      z.object({
        events: z
          .array(
            z.object({
              id: z.string().uuid(),
              actorId: z.string().min(1),
              actorRole: z.enum(userRoleValues),
              action: z.enum(auditActionValues),
              resourceType: z.enum(auditResourceTypeValues),
              resourceId: z.string().min(1),
              patientId: z.string().optional(),
              hlcTimestamp: z.string().min(1),
              metadata: z.record(z.unknown()).optional(),
              queuedAt: z.string().datetime(),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase)
      const results: Array<{ id: string; success: boolean }> = []
      const serverActorId = ctx.user.userId

      for (const event of input.events) {
        try {
          await audit.emit({
            actorId: serverActorId,
            actorRole: event.actorRole as Parameters<typeof audit.emit>[0]['actorRole'],
            action: event.action as Parameters<typeof audit.emit>[0]['action'],
            resourceType: event.resourceType as Parameters<typeof audit.emit>[0]['resourceType'],
            resourceId: event.resourceId,
            patientId: event.patientId,
            sessionId: ctx.user.sessionId,
            outcome: 'SUCCESS' as const,
            metadata: {
              ...event.metadata,
              clientQueuedAt: event.queuedAt,
              clientHlcTimestamp: event.hlcTimestamp,
              clientEventId: event.id,
              source: 'client-audit-sync',
            },
          })
          results.push({ id: event.id, success: true })
        } catch {
          results.push({ id: event.id, success: false })
        }
      }

      return { results }
    }),
})
