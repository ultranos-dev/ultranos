import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter } from '../init'
import { roleRestrictedProcedure } from '../rbac'
import { db } from '@/lib/supabase'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'

/**
 * Allergy domain router.
 * Story 10.2: Global Allergy Management & High-Visibility Banners.
 *
 * RBAC: CLINICIAN and ADMIN only.
 * AllergyIntolerance is Tier 1 safety-critical — append-only in the sync engine.
 */
export const allergyRouter = createTRPCRouter({
  /**
   * AC 9: List all AllergyIntolerance records for a patient.
   * RBAC: CLINICIAN, ADMIN.
   */
  list: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN', 'ADMIN'])
    .use(enforceResourceAccess('AllergyIntolerance'))
    .input(
      z.object({
        patientId: z.string().uuid(),
        includeAll: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('allergy_intolerances')
        .select('*')
        .eq('patient_ref', `Patient/${input.patientId}`)
        .order('recorded_date', { ascending: false })

      if (!input.includeAll) {
        query = query.eq('clinical_status_code', 'active')
      }

      const { data, error } = await query

      if (error) {
        console.error('Allergy list error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve allergy records',
        })
      }

      const rows = (data ?? []).map((row) => db.fromRow(row))

      // Audit PHI access (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'AllergyIntolerance',
          resourceId: `patient-allergies:${input.patientId}`,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { allergyCount: rows.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'AllergyIntolerance' })
      }

      return { allergies: rows }
    }),

  /**
   * AC 9, 10: Create a new AllergyIntolerance record.
   * RBAC: CLINICIAN only.
   * Emits audit event (PHI_WRITE).
   * Encrypts substanceFreeText (PHI field) via db.toRow().
   */
  create: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(async (opts) => {
      // ADMIN is explicitly excluded from allergy creation — only clinical staff
      // can write Tier 1 safety-critical allergy records.
      if (opts.ctx.user.role === 'ADMIN') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — ADMIN role cannot create allergy records',
        })
      }
      return opts.next({ ctx: opts.ctx })
    })
    .use(enforceResourceAccess('AllergyIntolerance'))
    .input(
      z.object({
        id: z.string().uuid(),
        clinicalStatusCode: z.enum(['active', 'inactive', 'resolved']),
        verificationStatusCode: z.enum(['unconfirmed', 'confirmed']),
        type: z.enum(['allergy', 'intolerance']),
        criticality: z.enum(['low', 'high', 'unable-to-assess']),
        substanceText: z.string().min(1),
        substanceCode: z.string().optional(),
        substanceSystem: z.string().optional(),
        patientRef: z.string().min(1),
        recorderRef: z.string().optional(),
        recordedDate: z.string().datetime(),
        substanceFreeText: z.string().optional(),
        hlcTimestamp: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      // Build the DB row — db.toRow() handles snake_case + encryption of PHI fields
      const row = db.toRow({
        id: input.id,
        clinicalStatusCode: input.clinicalStatusCode,
        verificationStatusCode: input.verificationStatusCode,
        type: input.type,
        criticality: input.criticality,
        substanceText: input.substanceText,
        substanceCode: input.substanceCode ?? null,
        substanceSystem: input.substanceSystem ?? null,
        patientRef: input.patientRef,
        recorderRef: input.recorderRef ?? null,
        recordedDate: input.recordedDate,
        substanceFreeText: input.substanceFreeText ?? null,
        hlcTimestamp: input.hlcTimestamp,
        syncedBy: ctx.user.sub,
        syncedAt: now,
        metaLastUpdated: now,
      })

      const { data, error } = await ctx.supabase
        .from('allergy_intolerances')
        .insert(row)
        .select('id')
        .single()

      if (error) {
        // Duplicate key = already synced — verify ownership before returning idempotent success
        if (error.code === '23505') {
          const { data: existing } = await ctx.supabase
            .from('allergy_intolerances')
            .select('patient_ref')
            .eq('id', input.id)
            .single()

          if (existing?.patient_ref !== input.patientRef) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Allergy ID conflict: record belongs to a different patient',
            })
          }
          return { success: true, allergyId: input.id, alreadySynced: true }
        }
        console.error('Allergy create error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create allergy record',
        })
      }

      // Audit PHI write (CLAUDE.md Rule #6)
      const patientId = input.patientRef.replace('Patient/', '')
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'AllergyIntolerance',
          resourceId: data.id,
          patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { syncAction: 'allergy_create' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'AllergyIntolerance', resourceId: data.id })
      }

      return { success: true, allergyId: data.id, alreadySynced: false }
    }),
})
