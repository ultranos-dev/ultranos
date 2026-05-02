import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'

/**
 * MedicationStatement domain router.
 * Story 10.1: Tracks active/chronic medications across encounters.
 * Used by the interaction checker to warn against cross-encounter drug conflicts.
 */
export const medicationStatementRouter = createTRPCRouter({
  /**
   * AC 2: List active MedicationStatements for a patient.
   * RBAC: CLINICIAN, ADMIN (via enforceResourceAccess).
   */
  listActive: protectedProcedure
    .use(enforceResourceAccess('MedicationStatement'))
    .input(
      z.object({
        patientRef: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('medication_statements')
        .select('*')
        .eq('subject_reference', input.patientRef)
        .eq('status', 'active')

      if (error) {
        console.error('MedicationStatement list error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve active medication statements',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'MEDICATION_STATEMENT',
          resourceId: input.patientRef,
          patientId: input.patientRef.replace('Patient/', ''),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { count: data.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_READ',
          resourceType: 'MEDICATION_STATEMENT',
          patientRef: input.patientRef,
        })
      }

      return {
        statements: db.fromRows(data),
        count: data.length,
      }
    }),

  /**
   * AC 3: Create a new MedicationStatement.
   * RBAC: CLINICIAN, ADMIN. Emits audit event.
   */
  create: protectedProcedure
    .use(enforceResourceAccess('MedicationStatement'))
    .input(
      z.object({
        id: z.string().uuid(),
        medicationCodeableConcept: z.object({
          coding: z
            .array(
              z.object({
                system: z.string(),
                code: z.string(),
                display: z.string().optional(),
              }),
            )
            .optional(),
          text: z.string().optional(),
        }),
        medicationDisplay: z.string().min(1),
        subjectReference: z.string().min(1),
        effectivePeriodStart: z.string().datetime().optional(),
        dateAsserted: z.string().datetime(),
        informationSourceReference: z.string().optional(),
        sourceEncounterId: z.string().uuid().optional(),
        sourcePrescriptionId: z.string().uuid().optional(),
        hlcTimestamp: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      // Check for existing active MedicationStatement for the same medication + patient
      // If one exists, update effective period instead of creating a duplicate
      if (input.sourcePrescriptionId) {
        const { data: existing } = await ctx.supabase
          .from('medication_statements')
          .select('id')
          .eq('subject_reference', input.subjectReference)
          .eq('source_prescription_id', input.sourcePrescriptionId)
          .eq('status', 'active')
          .limit(1)

        if (existing && existing.length > 0) {
          // Update effective period for existing statement
          const { data: updated, error: updateError } = await ctx.supabase
            .from('medication_statements')
            .update(
              db.toRow({
                effectivePeriodStart: input.effectivePeriodStart ?? now,
                metaLastUpdated: now,
                hlcTimestamp: input.hlcTimestamp,
              }),
            )
            .eq('id', existing[0].id)
            .select('id')
            .single()

          if (updateError || !updated) {
            console.error('MedicationStatement update error:', {
              code: updateError?.code,
            })
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update existing medication statement',
            })
          }

          return { id: updated.id, action: 'updated' as const }
        }
      }

      const row = db.toRow({
        id: input.id,
        resourceType: 'MedicationStatement',
        status: 'active',
        medicationCodeableConcept: input.medicationCodeableConcept,
        medicationDisplay: input.medicationDisplay,
        subjectReference: input.subjectReference,
        effectivePeriodStart: input.effectivePeriodStart ?? now,
        dateAsserted: input.dateAsserted,
        informationSourceReference: input.informationSourceReference ?? null,
        sourceEncounterId: input.sourceEncounterId ?? null,
        sourcePrescriptionId: input.sourcePrescriptionId ?? null,
        isOfflineCreated: false,
        hlcTimestamp: input.hlcTimestamp,
        createdAt: now,
        metaLastUpdated: now,
        metaVersionId: '1',
      })

      const { data, error } = await ctx.supabase
        .from('medication_statements')
        .insert(row)
        .select('id')
        .single()

      if (error || !data) {
        console.error('MedicationStatement create error:', { code: error?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create medication statement',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'MEDICATION_STATEMENT',
          resourceId: data.id,
          patientId: input.subjectReference.replace('Patient/', ''),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'create',
            sourcePrescriptionId: input.sourcePrescriptionId,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_WRITE',
          resourceType: 'MEDICATION_STATEMENT',
          resourceId: data.id,
        })
      }

      return { id: data.id, action: 'created' as const }
    }),

  /**
   * AC 4: Transition MedicationStatement status (active → completed/stopped).
   * RBAC: CLINICIAN, ADMIN. Emits audit event.
   */
  updateStatus: protectedProcedure
    .use(enforceResourceAccess('MedicationStatement'))
    .input(
      z.object({
        id: z.string().uuid(),
        newStatus: z.enum(['completed', 'stopped']),
        hlcTimestamp: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      const { data: updated, error } = await ctx.supabase
        .from('medication_statements')
        .update(
          db.toRow({
            status: input.newStatus,
            effectivePeriodEnd: now,
            metaLastUpdated: now,
            hlcTimestamp: input.hlcTimestamp,
          }),
        )
        .eq('id', input.id)
        .eq('status', 'active')
        .select('id, subject_reference')
        .single()

      if (error || !updated) {
        if (error?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message:
              'Active medication statement not found — may already be completed or stopped',
          })
        }
        console.error('MedicationStatement status update error:', {
          code: error?.code,
        })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update medication statement status',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'MEDICATION_STATEMENT',
          resourceId: updated.id,
          patientId: (updated.subject_reference as string).replace(
            'Patient/',
            '',
          ),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'status_transition',
            newStatus: input.newStatus,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_WRITE',
          resourceType: 'MEDICATION_STATEMENT',
          resourceId: updated.id,
        })
      }

      return {
        id: updated.id,
        newStatus: input.newStatus,
      }
    }),
})
