import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter } from '../init'
import { roleRestrictedProcedure } from '../rbac'
import { db } from '@/lib/supabase'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { enforceConsentMiddleware } from '../middleware/enforceConsent'
import { AuditLogger } from '@ultranos/audit-logger'

const encounterStatusEnum = z.enum(['planned', 'in-progress', 'finished', 'cancelled'])

/**
 * Encounter domain router.
 * Story 16.1: Encounter CRUD Endpoints.
 *
 * RBAC: DOCTOR, CLINICIAN, ADMIN.
 * reasonCode is a FHIR CodeableConcept (JSONB) — not encrypted (coded data, not free-text PHI).
 */
export const encounterRouter = createTRPCRouter({
  /**
   * AC 1: Create a FHIR Encounter with field-level encryption.
   * RBAC: DOCTOR, CLINICIAN (ADMIN via bypass).
   * Emits PHI_WRITE audit event.
   */
  create: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceResourceAccess('Encounter'))
    .input(
      z.object({
        id: z.string().uuid(),
        patientId: z.string().uuid(),
        status: encounterStatusEnum,
        classCode: z.string().min(1),
        periodStart: z.string().datetime(),
        participantPractitionerId: z.string().uuid(),
        reasonCode: z.string().optional(),
        hlcTimestamp: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = db.toRow({
        id: input.id,
        subjectId: input.patientId,
        status: input.status,
        classCode: input.classCode,
        periodStart: input.periodStart,
        participant: [{ individual: { reference: `Practitioner/${input.participantPractitionerId}` } }],
        reasonCode: input.reasonCode ?? null,
        hlcTimestamp: input.hlcTimestamp,
      })

      const { data, error } = await ctx.supabase
        .from('encounters')
        .insert(row)
        .select('id')
        .single()

      if (error) {
        if (error.code === '23505') {
          const { data: existing } = await ctx.supabase
            .from('encounters')
            .select('subject_id')
            .eq('id', input.id)
            .single()

          if (existing?.subject_id !== input.patientId) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Encounter ID conflict',
            })
          }

          // AC 6: Audit idempotent create path
          const audit = new AuditLogger(ctx.supabase)
          try {
            await audit.emit({
              action: 'PHI_WRITE',
              resourceType: 'Encounter',
              resourceId: input.id,
              patientId: input.patientId,
              actorId: ctx.user.sub,
              actorRole: ctx.user.role,
              outcome: 'SUCCESS',
              sessionId: ctx.user.sessionId,
              metadata: { operation: 'create', idempotent: true },
            })
          } catch {
            console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'Encounter' })
          }

          return { success: true, encounterId: input.id, alreadySynced: true }
        }
        console.error('Encounter create error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create encounter',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'Encounter',
          resourceId: data.id,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'create' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'Encounter' })
      }

      return { success: true, encounterId: data.id, alreadySynced: false }
    }),

  /**
   * AC 2: Read a single encounter with decryption and consent enforcement.
   * RBAC: DOCTOR, CLINICIAN (ADMIN via bypass).
   * Consent: enforceConsentMiddleware('Encounter') → CLINICAL_NOTES scope.
   * Emits PHI_READ audit event.
   */
  read: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceResourceAccess('Encounter'))
    .input(
      z.object({
        id: z.string().uuid(),
        patientId: z.string().uuid(),
      }),
    )
    .use(enforceConsentMiddleware('Encounter'))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('encounters')
        .select('*')
        .eq('id', input.id)
        .single()

      if (error || !data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        })
      }

      if (data.subject_id !== input.patientId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'Encounter',
          resourceId: input.id,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'Encounter' })
      }

      return db.fromRow(data)
    }),

  /**
   * AC 3: Update an encounter with HLC conflict detection.
   * RBAC: DOCTOR, CLINICIAN (ADMIN via bypass).
   * Emits PHI_WRITE audit event.
   */
  update: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceResourceAccess('Encounter'))
    .input(
      z.object({
        id: z.string().uuid(),
        patientId: z.string().uuid(),
        status: encounterStatusEnum.optional(),
        classCode: z.string().min(1).optional(),
        reasonCode: z.string().optional(),
        hlcTimestamp: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // HLC conflict detection
      const { data: current } = await ctx.supabase
        .from('encounters')
        .select('hlc_timestamp')
        .eq('id', input.id)
        .eq('subject_id', input.patientId)
        .single()

      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        })
      }

      if (input.hlcTimestamp <= current.hlc_timestamp) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Stale update — a newer version exists',
        })
      }

      const updateFields: Record<string, unknown> = { hlcTimestamp: input.hlcTimestamp }
      if (input.status !== undefined) updateFields.status = input.status
      if (input.classCode !== undefined) updateFields.classCode = input.classCode
      if (input.reasonCode !== undefined) updateFields.reasonCode = input.reasonCode

      const row = db.toRow(updateFields)

      // Optimistic concurrency: WHERE hlc_timestamp matches expected value
      const { data, error } = await ctx.supabase
        .from('encounters')
        .update(row)
        .eq('id', input.id)
        .eq('hlc_timestamp', current.hlc_timestamp)
        .select('id')
        .single()

      if (error || !data) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Stale update — a newer version exists',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'Encounter',
          resourceId: data.id,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'update' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'Encounter' })
      }

      return { success: true, encounterId: data.id }
    }),

  /**
   * AC 4: Close an encounter — transition to finished, set period_end.
   * RBAC: DOCTOR, CLINICIAN (ADMIN via bypass).
   * Only allows closing in-progress encounters.
   * Emits PHI_WRITE audit event.
   */
  close: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceResourceAccess('Encounter'))
    .input(
      z.object({
        id: z.string().uuid(),
        patientId: z.string().uuid(),
        hlcTimestamp: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch current state for HLC check and status validation
      const { data: current } = await ctx.supabase
        .from('encounters')
        .select('hlc_timestamp, status')
        .eq('id', input.id)
        .eq('subject_id', input.patientId)
        .single()

      if (!current) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        })
      }

      // HLC conflict detection
      if (input.hlcTimestamp <= current.hlc_timestamp) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Stale update — a newer version exists',
        })
      }

      // Only allow closing in-progress encounters
      if (current.status !== 'in-progress') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only in-progress encounters can be closed',
        })
      }

      const row = db.toRow({
        status: 'finished',
        periodEnd: new Date().toISOString(),
        hlcTimestamp: input.hlcTimestamp,
      })

      // Optimistic concurrency: WHERE hlc_timestamp matches expected value
      const { data, error } = await ctx.supabase
        .from('encounters')
        .update(row)
        .eq('id', input.id)
        .eq('hlc_timestamp', current.hlc_timestamp)
        .select('id')
        .single()

      if (error || !data) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Stale update — a newer version exists',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'Encounter',
          resourceId: data.id,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'close' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'Encounter' })
      }

      return { success: true, encounterId: data.id }
    }),

  /**
   * Story 16.5 AC 1: Append a SOAP note to the soap_ledger.
   * RBAC: DOCTOR, CLINICIAN (ADMIN via bypass).
   * All four clinical text fields are encrypted via db.toRow().
   * Emits PHI_WRITE audit event.
   */
  addSOAPNote: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceResourceAccess('ClinicalImpression'))
    .input(
      z.object({
        id: z.string().uuid(),
        encounterId: z.string().uuid(),
        subjective: z.string().optional(),
        objective: z.string().optional(),
        assessment: z.string().optional(),
        plan: z.string().optional(),
        hlcTimestamp: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // AC 7: Validate encounter exists and is not cancelled
      const { data: encounter, error: encounterError } = await ctx.supabase
        .from('encounters')
        .select('id, status, subject_id')
        .eq('id', input.encounterId)
        .single()

      if (encounterError || !encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        })
      }

      if (encounter.status === 'cancelled') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add SOAP notes to a cancelled encounter',
        })
      }

      // AC 1: Encrypt all four PHI fields via db.toRow() and insert
      const row = db.toRow({
        id: input.id,
        encounterId: input.encounterId,
        practitionerId: ctx.user.sub,
        soapSubjective: input.subjective ?? null,
        soapObjective: input.objective ?? null,
        soapAssessment: input.assessment ?? null,
        soapPlan: input.plan ?? null,
        hlcTimestamp: input.hlcTimestamp,
      })

      const { data, error } = await ctx.supabase
        .from('soap_ledger')
        .insert(row)
        .select('id')
        .single()

      if (error || !data) {
        console.error('SOAP note insert error:', { code: error?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add SOAP note',
        })
      }

      // AC 4: Emit PHI_WRITE audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'ClinicalImpression',
          resourceId: data.id,
          patientId: encounter.subject_id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { encounterId: input.encounterId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'ClinicalImpression' })
      }

      return { success: true, soapNoteId: data.id }
    }),

  /**
   * Story 16.5 AC 2: List SOAP notes for an encounter.
   * RBAC: DOCTOR, CLINICIAN (ADMIN via bypass).
   * Decrypts all four clinical text fields via db.fromRows().
   * Ordered by HLC timestamp ascending.
   * Emits PHI_READ audit event.
   */
  listSOAPNotes: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceResourceAccess('ClinicalImpression'))
    .input(
      z.object({
        encounterId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Look up encounter to get subject_id for audit
      const { data: encounter } = await ctx.supabase
        .from('encounters')
        .select('subject_id')
        .eq('id', input.encounterId)
        .single()

      const { data, error } = await ctx.supabase
        .from('soap_ledger')
        .select('id, encounter_id, practitioner_id, soap_subjective, soap_objective, soap_assessment, soap_plan, hlc_timestamp, created_at')
        .eq('encounter_id', input.encounterId)
        .order('hlc_timestamp', { ascending: true })

      if (error) {
        console.error('SOAP notes list error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve SOAP notes',
        })
      }

      // AC 8: Decrypt all four PHI fields
      const rows = db.fromRows(data ?? [])

      // AC 4: Emit PHI_READ audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'ClinicalImpression',
          resourceId: `encounter-soap:${input.encounterId}`,
          patientId: encounter?.subject_id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { encounterId: input.encounterId, noteCount: rows.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'ClinicalImpression' })
      }

      return {
        notes: rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          encounterId: row.encounterId,
          practitionerId: row.practitionerId,
          subjective: row.soapSubjective,
          objective: row.soapObjective,
          assessment: row.soapAssessment,
          plan: row.soapPlan,
          hlcTimestamp: row.hlcTimestamp,
          createdAt: row.createdAt,
        })),
      }
    }),

  /**
   * AC 5: List encounters for a patient, ordered by period_start desc.
   * RBAC: DOCTOR, CLINICIAN (ADMIN via bypass).
   * Consent: enforceConsentMiddleware('Encounter') → CLINICAL_NOTES scope.
   * Emits PHI_READ audit event.
   */
  listByPatient: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceResourceAccess('Encounter'))
    .input(
      z.object({
        patientId: z.string().uuid(),
      }),
    )
    .use(enforceConsentMiddleware('Encounter'))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('encounters')
        .select('*')
        .eq('subject_id', input.patientId)
        .order('period_start', { ascending: false })

      if (error) {
        console.error('Encounter list error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve encounters',
        })
      }

      const rows = db.fromRows(data ?? [])

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'Encounter',
          resourceId: `patient-encounters:${input.patientId}`,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { encounterCount: rows.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'Encounter' })
      }

      return { encounters: rows }
    }),
})
