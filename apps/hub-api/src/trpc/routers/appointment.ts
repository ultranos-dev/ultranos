import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { db } from '@/lib/supabase'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'
import { AppointmentStatusSchema } from '@ultranos/shared-types'

/**
 * Appointment domain router.
 * Epic 37, Story 37.17: Appointment CRUD, sync, and slot management.
 */

// --- Shared Zod schemas for input validation ---

const CodingInputSchema = z.object({
  system: z.string().optional(),
  code: z.string(),
  display: z.string().optional(),
})

const ReferenceInputSchema = z.object({
  reference: z.string(),
  display: z.string().optional(),
})

const ParticipantInputSchema = z.object({
  actor: ReferenceInputSchema,
  status: z.enum(['accepted', 'declined', 'tentative', 'needs-action']),
})

const UltranosExtensionSchema = z.object({
  walkIn: z.boolean(),
  queuePosition: z.number().int().nonnegative().nullable(),
  isOfflineCreated: z.boolean(),
  hlcTimestamp: z.string(),
  createdAt: z.string().datetime(),
  clinicId: z.string().optional(),
})

const AppointmentInputSchema = z.object({
  id: z.string().uuid(),
  status: AppointmentStatusSchema,
  serviceType: z.array(CodingInputSchema),
  start: z.string().datetime(),
  end: z.string().datetime(),
  participant: z.array(ParticipantInputSchema).min(1),
  description: z.string().optional(),
  _ultranos: UltranosExtensionSchema,
})

// --- Helpers ---

/** Extract practitioner reference IDs from participant array */
function extractPractitionerIds(
  participants: Array<{ actor: { reference: string } }>,
): string[] {
  return participants
    .filter((p) => p.actor.reference.startsWith('Practitioner/'))
    .map((p) => p.actor.reference.replace('Practitioner/', ''))
}

/** Extract patient reference IDs from participant array */
function extractPatientIds(
  participants: Array<{ actor: { reference: string } }>,
): string[] {
  return participants
    .filter((p) => p.actor.reference.startsWith('Patient/'))
    .map((p) => p.actor.reference.replace('Patient/', ''))
}

/** RBAC check: user must be the practitioner or ADMIN */
function assertPractitionerOrAdmin(
  userRole: string,
  userId: string,
  practitionerId: string,
): void {
  if (userRole === 'ADMIN') return
  if (userId === practitionerId) return
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Access denied — you can only access your own appointments',
  })
}

// --- Main appointment router ---
//
// NOTE (Story 59.4 — orphan disposition): the former `slot` sub-router
// (`slot.listByPractitioner`, `slot.generateDaily`) was removed. Both had zero
// frontend callers across all apps (verified by grep) and no client scheduling
// flow exists yet. Practitioner slot/availability management is deferred to a
// future scheduling epic; re-introduce a `Slot` sync path there rather than
// leaving dead, untested endpoints on the public surface.

export const appointmentRouter = createTRPCRouter({
  /**
   * List appointments for a practitioner within a date range.
   */
  listByPractitioner: protectedProcedure
    .use(enforceResourceAccess('Appointment'))
    .input(
      z.object({
        practitionerId: z.string().uuid(),
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      assertPractitionerOrAdmin(ctx.user.role, ctx.user.sub, input.practitionerId)

      // Query appointments where any participant references this practitioner
      const { data, error } = await ctx.supabase
        .from('appointments')
        .select('*')
        .contains('participant_refs', [input.practitionerId])
        .gte('start', input.startDate)
        .lte('end', input.endDate)
        .order('start', { ascending: true })
        .range(input.offset, input.offset + input.limit - 1)

      if (error) {
        console.error('[APPOINTMENT_LIST_PRACTITIONER] query error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch appointments',
        })
      }

      // Audit: PHI_READ
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'APPOINTMENT',
          resourceId: `practitioner-${input.practitionerId}`,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'list_by_practitioner',
            resultCount: (data ?? []).length,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_READ',
          resourceType: 'Appointment',
          resourceId: `practitioner-${input.practitionerId}`,
        })
      }

      return { appointments: data ?? [] }
    }),

  /**
   * List appointments for a patient.
   */
  listByPatient: protectedProcedure
    .use(enforceResourceAccess('Appointment'))
    .input(
      z.object({
        patientId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Ownership / facility scoping (M-HUB-6): a non-ADMIN caller may only see a
      // patient's appointments they are themselves a participant in. RBAC opens the
      // Appointment resource type to clinicians, but without this an authorized
      // clinician could enumerate ANY patient's full appointment history. We require
      // BOTH the patient ref AND the caller's own practitioner ref to be present in
      // participant_refs. ADMIN bypasses (already unrestricted elsewhere).
      // ADMIN sees all appointments for the patient; a clinician must also be a
      // participant, so we require the array to contain BOTH refs (PostgREST `cs`
      // = "contains all of"). A single containment argument keeps it one filter.
      const requiredRefs =
        ctx.user.role === 'ADMIN'
          ? [input.patientId]
          : [input.patientId, ctx.user.sub]

      const { data, error } = await ctx.supabase
        .from('appointments')
        .select('*')
        .contains('participant_refs', requiredRefs)
        .order('start', { ascending: true })
        .range(input.offset, input.offset + input.limit - 1)

      if (error) {
        console.error('[APPOINTMENT_LIST_PATIENT] query error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch appointments',
        })
      }

      // Audit: PHI_READ
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'APPOINTMENT',
          resourceId: `patient-${input.patientId}`,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'list_by_patient',
            resultCount: (data ?? []).length,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_READ',
          resourceType: 'Appointment',
          resourceId: `patient-${input.patientId}`,
        })
      }

      return { appointments: data ?? [] }
    }),

  // NOTE (Story 59.4 — orphan disposition): the former `create` and `updateStatus`
  // mutations were removed. Both had zero frontend callers (verified by grep across
  // all apps). The real OPD flow writes appointments to the local encrypted store
  // and syncs them through the durable queue → `appointment.syncBatch`, which is the
  // single, idempotent, offline-first write path (upsert + Tier-3 LWW + double-booking
  // FLAG). A synchronous, hard-blocking `create` is incompatible with offline-first
  // creation (you cannot server-validate a booking made with the ethernet cable pulled);
  // client-side `SLOT_BUSY` guards the immediate case and syncBatch flags cross-device
  // overlaps for physician review. Status changes likewise flow through syncBatch as a
  // higher-HLC upsert of the same appointment id.

  /**
   * Batch sync appointments using Tier 3 LWW (Last-Write-Wins by hlcTimestamp).
   * Detects double-bookings across the batch and flags conflicts.
   */
  syncBatch: protectedProcedure
    .use(enforceResourceAccess('Appointment'))
    .input(
      z.object({
        appointments: z.array(AppointmentInputSchema).min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        id: string
        action: 'inserted' | 'updated' | 'skipped'
        doubleBookingConflict: boolean
      }> = []

      for (const appt of input.appointments) {
        const practitionerIds = extractPractitionerIds(appt.participant)
        const patientIds = extractPatientIds(appt.participant)

        // Check for existing record (Tier 3 LWW)
        const { data: existing } = await ctx.supabase
          .from('appointments')
          .select('id, hlc_timestamp')
          .eq('id', appt.id)
          .single()

        // Tier 3 LWW: compare hlcTimestamp — newer wins
        if (existing) {
          const incomingHlc = appt._ultranos.hlcTimestamp
          const existingHlc = existing.hlc_timestamp ?? ''

          if (incomingHlc <= existingHlc) {
            results.push({ id: appt.id, action: 'skipped', doubleBookingConflict: false })
            continue
          }
        }

        // Double-booking detection (non-blocking for sync — flag only)
        let doubleBookingConflict = false
        for (const practId of practitionerIds) {
          const { data: conflicts } = await ctx.supabase
            .from('appointments')
            .select('id')
            .contains('participant_refs', [practId])
            .in('status', ['booked', 'arrived'])
            .lt('start', appt.end)
            .gt('end', appt.start)
            .neq('id', appt.id)

          if (conflicts && conflicts.length > 0) {
            doubleBookingConflict = true
            break
          }
        }

        // Upsert
        const now = new Date().toISOString()
        const row = db.toRowRaw(
          {
            id: appt.id,
            resourceType: 'Appointment',
            status: appt.status,
            serviceType: appt.serviceType,
            start: appt.start,
            end: appt.end,
            participant: appt.participant,
            participantRefs: [...practitionerIds, ...patientIds],
            description: appt.description ?? null,
            walkIn: appt._ultranos.walkIn,
            queuePosition: appt._ultranos.queuePosition,
            isOfflineCreated: appt._ultranos.isOfflineCreated,
            hlcTimestamp: appt._ultranos.hlcTimestamp,
            createdAt: appt._ultranos.createdAt,
            clinicId: appt._ultranos.clinicId ?? null,
            lastUpdated: now,
            doubleBookingFlag: doubleBookingConflict,
          },
          'non-PHI: appointments',
        )

        const { error: upsertError } = await ctx.supabase
          .from('appointments')
          .upsert(row, { onConflict: 'id' })

        if (upsertError) {
          console.error('[APPOINTMENT_SYNC_BATCH] upsert error:', { code: upsertError.code })
          results.push({ id: appt.id, action: 'skipped', doubleBookingConflict })
          continue
        }

        results.push({
          id: appt.id,
          action: existing ? 'updated' : 'inserted',
          doubleBookingConflict,
        })

        // Audit: PHI_WRITE for each
        const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
        try {
          await audit.emit({
            action: 'PHI_WRITE',
            resourceType: 'APPOINTMENT',
            resourceId: appt.id,
            patientId: patientIds[0] ?? undefined,
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'SUCCESS',
            sessionId: ctx.user.sessionId,
            metadata: {
              operation: 'sync_batch',
              action: existing ? 'updated' : 'inserted',
              doubleBookingConflict,
            },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', {
            action: 'PHI_WRITE',
            resourceType: 'Appointment',
            resourceId: appt.id,
          })
        }
      }

      return { results }
    }),
})
