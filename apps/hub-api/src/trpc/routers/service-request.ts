import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '@/trpc/init'
import { AuditLogger } from '@ultranos/audit-logger'
import {
  AuditAction,
  AuditOutcome,
  AuditResourceType,
  type LabOrderStatus,
  type UserRole,
} from '@ultranos/shared-types'
import { resolvePractitionerId } from '@/trpc/routers/sync'

/** Map a flat service_requests status row to the OPD-facing LabOrderStatus DTO. */
function toLabOrderStatus(row: Record<string, unknown>): LabOrderStatus {
  return {
    id: row.id as string,
    status: row.status as string,
    ...(row.received_at ? { receivedAt: row.received_at as string } : {}),
    ...(row.received_by_lab_id ? { receivedByLabId: row.received_by_lab_id as string } : {}),
  }
}

/**
 * ServiceRequest (lab-order) router — OPD-facing read surface.
 *
 * OPD-Lite is push-only for ServiceRequests, so it has no way to learn that a lab
 * has started an order (lab.acknowledgeOrder sets status='on-hold' + received_at
 * at the Hub). `getOrderStatus` is the lightweight pull that feeds the encounter
 * page's "lock once the lab started it" behaviour — it returns ONLY operational
 * status metadata (no clinical fields), scoped to orders the caller authored.
 */
export const serviceRequestRouter = createTRPCRouter({
  /**
   * Return the patient_id (bare UUID) for a single order, scoped to orders the
   * caller authored. Used by OPD-Lite notification modal to resolve a patient name
   * when the order is not in the local device's Dexie store.
   *
   * Authorization: only the ordering doctor (requester_id = practitionerId) gets
   * the patient ref — same scoping as getOrderStatus.
   * PHI: patient_id is a real UUID; never expose this to lab-facing endpoints.
   */
  getOrderPatientRef: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<{ patientRef: string | null }> => {
      const practitionerId = await resolvePractitionerId(
        ctx.supabase,
        ctx.user.practitionerId ?? ctx.user.sub,
        new Map(),
      )
      if (!practitionerId) return { patientRef: null }

      const { data, error } = await ctx.supabase
        .from('service_requests')
        .select('id, patient_id')
        .eq('id', input.orderId)
        .eq('requester_id', practitionerId)
        .maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      // Rule #6: audit the PHI read (patient_id is PHI). Wrap in try/catch so an
      // audit failure never blocks the primary response.
      const audit = new AuditLogger(ctx.supabase, ctx.user.orgId ?? undefined)
      try {
        await audit.emit({
          action: AuditAction.PHI_READ,
          resourceType: AuditResourceType.SERVICE_REQUEST,
          resourceId: input.orderId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role as UserRole,
          outcome: AuditOutcome.SUCCESS,
          sessionId: ctx.user.sessionId,
          ...(data?.patient_id ? { patientId: data.patient_id } : {}),
          metadata: { endpoint: 'serviceRequest.getOrderPatientRef' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'SERVICE_REQUEST' })
      }

      return { patientRef: data?.patient_id ?? null }
    }),

  getOrderStatus: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }))
    .query(async ({ ctx, input }): Promise<LabOrderStatus[]> => {
      // `requester_id` stores the resolved practitioners.id (sync resolves the
      // auth-sub FK on push); ctx.user.practitionerId is the auth sub, so resolve
      // it the same way before scoping. ctx.supabase is service-role — there is no
      // RLS to fall back on, so this explicit scope is the access control.
      const practitionerId = await resolvePractitionerId(
        ctx.supabase,
        ctx.user.practitionerId ?? ctx.user.sub,
        new Map(),
      )
      if (!practitionerId) return []

      const { data, error } = await ctx.supabase
        .from('service_requests')
        .select('id, status, received_at, received_by_lab_id')
        .in('id', input.ids)
        .eq('requester_id', practitionerId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      const statuses = (data ?? []).map(toLabOrderStatus)

      // Rule #6: audit the read. Operational status only — no clinical content or
      // patient identifiers in the metadata.
      const audit = new AuditLogger(ctx.supabase, ctx.user.orgId ?? undefined)
      try {
        await audit.emit({
          action: AuditAction.READ,
          resourceType: AuditResourceType.SERVICE_REQUEST,
          resourceId: input.ids[0],
          actorId: ctx.user.sub,
          actorRole: ctx.user.role as UserRole,
          outcome: AuditOutcome.SUCCESS,
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'serviceRequest.getOrderStatus', orderCount: statuses.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'SERVICE_REQUEST' })
      }

      return statuses
    }),
})
