import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { db } from '@/lib/supabase'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'
import {
  AppointmentStatusSchema,
  AppointmentServiceTypeSchema,
  SlotStatusSchema,
} from '@ultranos/shared-types'

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

// --- Slot sub-router ---

const slotRouter = createTRPCRouter({
  /**
   * List slots for a practitioner on a specific date.
   * No audit needed — slots don't reference patients.
   */
  listByPractitioner: protectedProcedure
    .use(enforceResourceAccess('Slot'))
    .input(
      z.object({
        practitionerId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date YYYY-MM-DD'),
      }),
    )
    .query(async ({ ctx, input }) => {
      assertPractitionerOrAdmin(ctx.user.role, ctx.user.sub, input.practitionerId)

      const dayStart = `${input.date}T00:00:00.000Z`
      const dayEnd = `${input.date}T23:59:59.999Z`

      const { data, error } = await ctx.supabase
        .from('slots')
        .select('*')
        .eq('schedule_reference', `Practitioner/${input.practitionerId}`)
        .gte('start', dayStart)
        .lte('start', dayEnd)
        .order('start', { ascending: true })

      if (error) {
        console.error('[SLOT_LIST] query error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch slots',
        })
      }

      return { slots: data ?? [] }
    }),

  /**
   * Generate daily slot entries for a practitioner.
   * Defaults: 08:00–17:00, 30-minute slots.
   * Skips if slots already exist for that date.
   * No audit needed — slots don't reference patients.
   */
  generateDaily: protectedProcedure
    .use(enforceResourceAccess('Slot'))
    .input(
      z.object({
        practitionerId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date YYYY-MM-DD'),
        startHour: z.number().int().min(0).max(23).default(8),
        endHour: z.number().int().min(1).max(24).default(17),
        slotDurationMinutes: z.number().int().min(5).max(120).default(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPractitionerOrAdmin(ctx.user.role, ctx.user.sub, input.practitionerId)

      // Check if slots already exist for this date
      const dayStart = `${input.date}T00:00:00.000Z`
      const dayEnd = `${input.date}T23:59:59.999Z`

      const { count, error: countError } = await ctx.supabase
        .from('slots')
        .select('*', { count: 'exact', head: true })
        .eq('schedule_reference', `Practitioner/${input.practitionerId}`)
        .gte('start', dayStart)
        .lte('start', dayEnd)

      if (countError) {
        console.error('[SLOT_GENERATE] count error:', { code: countError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to check existing slots',
        })
      }

      if ((count ?? 0) > 0) {
        return { generated: 0, message: 'Slots already exist for this date' }
      }

      // Generate slots
      const slots: Array<Record<string, unknown>> = []
      const durationMs = input.slotDurationMinutes * 60 * 1000
      const startMs = new Date(`${input.date}T${String(input.startHour).padStart(2, '0')}:00:00.000Z`).getTime()
      const endMs = new Date(`${input.date}T${String(input.endHour).padStart(2, '0')}:00:00.000Z`).getTime()
      const now = new Date().toISOString()

      for (let t = startMs; t < endMs; t += durationMs) {
        const slotStart = new Date(t).toISOString()
        const slotEnd = new Date(t + durationMs).toISOString()
        slots.push(
          db.toRowRaw(
            {
              id: crypto.randomUUID(),
              resourceType: 'Slot',
              scheduleReference: `Practitioner/${input.practitionerId}`,
              status: 'free',
              start: slotStart,
              end: slotEnd,
              slotDurationMinutes: input.slotDurationMinutes,
              hlcTimestamp: now,
              lastUpdated: now,
            },
            'non-PHI: slots',
          ),
        )
      }

      const { error: insertError } = await ctx.supabase.from('slots').insert(slots)

      if (insertError) {
        console.error('[SLOT_GENERATE] insert error:', { code: insertError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate slots',
        })
      }

      return { generated: slots.length }
    }),
})

// --- Main appointment router ---

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
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'Appointment',
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
      const { data, error } = await ctx.supabase
        .from('appointments')
        .select('*')
        .contains('participant_refs', [input.patientId])
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
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'Appointment',
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

  /**
   * Create a new appointment with double-booking validation.
   */
  create: protectedProcedure
    .use(enforceResourceAccess('Appointment'))
    .input(AppointmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const practitionerIds = extractPractitionerIds(input.participant)
      const patientIds = extractPatientIds(input.participant)

      // RBAC: user must be a participating practitioner or ADMIN
      if (ctx.user.role !== 'ADMIN' && !practitionerIds.includes(ctx.user.sub)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only participating practitioners or admins can create appointments',
        })
      }

      // Double-booking check: for each practitioner, check for overlapping booked/arrived appointments
      for (const practId of practitionerIds) {
        const { data: conflicts, error: conflictError } = await ctx.supabase
          .from('appointments')
          .select('id, start, end, status')
          .contains('participant_refs', [practId])
          .in('status', ['booked', 'arrived'])
          .lt('start', input.end)
          .gt('end', input.start)

        if (conflictError) {
          console.error('[APPOINTMENT_CREATE] conflict check error:', { code: conflictError.code })
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to check for double-booking',
          })
        }

        if (conflicts && conflicts.length > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Double-booking detected — practitioner has an overlapping appointment',
          })
        }
      }

      // Insert appointment
      const now = new Date().toISOString()
      const row = db.toRowRaw(
        {
          id: input.id,
          resourceType: 'Appointment',
          status: input.status,
          serviceType: input.serviceType,
          start: input.start,
          end: input.end,
          participant: input.participant,
          participantRefs: [...practitionerIds, ...patientIds],
          description: input.description ?? null,
          walkIn: input._ultranos.walkIn,
          queuePosition: input._ultranos.queuePosition,
          isOfflineCreated: input._ultranos.isOfflineCreated,
          hlcTimestamp: input._ultranos.hlcTimestamp,
          createdAt: input._ultranos.createdAt,
          clinicId: input._ultranos.clinicId ?? null,
          lastUpdated: now,
        },
        'non-PHI: appointments',
      )

      const { data, error } = await ctx.supabase
        .from('appointments')
        .insert(row)
        .select('id')
        .single()

      if (error) {
        // Duplicate key = already synced — idempotent success
        if (error.code === '23505') {
          return { success: true, appointmentId: input.id, alreadyExists: true }
        }
        console.error('[APPOINTMENT_CREATE] insert error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create appointment',
        })
      }

      // Audit: PHI_WRITE
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'Appointment',
          resourceId: data.id,
          patientId: patientIds[0] ?? undefined,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'create', serviceType: input.serviceType[0]?.code },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_WRITE',
          resourceType: 'Appointment',
          resourceId: data.id,
        })
      }

      return { success: true, appointmentId: data.id, alreadyExists: false }
    }),

  /**
   * Update appointment status. If cancelling, also frees the associated slot.
   */
  updateStatus: protectedProcedure
    .use(enforceResourceAccess('Appointment'))
    .input(
      z.object({
        id: z.string().uuid(),
        status: AppointmentStatusSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch existing appointment to validate ownership
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('appointments')
        .select('id, participant_refs, status, start, end')
        .eq('id', input.id)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        })
      }

      // RBAC: user must be a participant or ADMIN
      const refs: string[] = existing.participant_refs ?? []
      if (ctx.user.role !== 'ADMIN' && !refs.includes(ctx.user.sub)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only participants or admins can update appointment status',
        })
      }

      // Update status
      const now = new Date().toISOString()
      const { error: updateError } = await ctx.supabase
        .from('appointments')
        .update({ status: input.status, last_updated: now })
        .eq('id', input.id)

      if (updateError) {
        console.error('[APPOINTMENT_UPDATE_STATUS] update error:', { code: updateError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update appointment status',
        })
      }

      // If cancelling, free the associated slot
      if (input.status === 'cancelled') {
        const { error: slotError } = await ctx.supabase
          .from('slots')
          .update({ status: 'free' })
          .gte('start', existing.start)
          .lte('end', existing.end)
          .eq('status', 'busy')
          // Match slots that belong to any practitioner in this appointment
          .in(
            'schedule_reference',
            refs
              .filter((r: string) => !r.startsWith?.('Patient'))
              .map((r: string) => `Practitioner/${r}`),
          )

        if (slotError) {
          // Non-fatal: log but don't fail the status update
          console.warn('[APPOINTMENT_UPDATE_STATUS] slot release error:', { code: slotError.code })
        }
      }

      // Audit: PHI_WRITE
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'Appointment',
          resourceId: input.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'update_status',
            previousStatus: existing.status,
            newStatus: input.status,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_WRITE',
          resourceType: 'Appointment',
          resourceId: input.id,
        })
      }

      return { success: true }
    }),

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
        const audit = new AuditLogger(ctx.supabase)
        try {
          await audit.emit({
            action: 'PHI_WRITE',
            resourceType: 'Appointment',
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

  // Nested slot router
  slot: slotRouter,
})
