import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter } from '../init'
import { roleRestrictedProcedure, isAdminRole } from '../rbac'
import { db } from '@/lib/supabase'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { enforceEntitlement } from '../middleware/enforceEntitlement'
import { enforceVerifiedOrg } from '../middleware/enforceVerifiedOrg'
import { enforceConsentMiddleware } from '../middleware/enforceConsent'
import { AuditLogger } from '@ultranos/audit-logger'
import { produceAllergyUpdateNotification } from '@/lib/notification-producers'

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
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('OPD_LITE'))
    .use(enforceResourceAccess('AllergyIntolerance'))
    .input(
      z.object({
        patientId: z.string().uuid(),
        includeAll: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      // patient_ref is stored as a BARE UUID (the sync flatten strips the
      // "Patient/" prefix so the sync.pull patient-scope filter matches). Query
      // with the bare id — a "Patient/{id}" prefix here matches nothing.
      let query = ctx.supabase
        .from('allergy_intolerances')
        .select('*')
        .eq('patient_ref', input.patientId)
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
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'ALLERGY',
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
   * Story 57.1: Active allergies for the pharmacy dispense-time safety gate.
   * PHARMACIST-scoped and data-minimized: returns ONLY the substance
   * (display text + code/system) and criticality — nothing else. The patient
   * is resolved from the scanned prescription's `pat` reference (bare UUID or
   * "Patient/"-prefixed both accepted).
   *
   * Access chain (CLAUDE.md Rules #4/#6 + Story 58.4 coordination):
   *   role (PHARMACIST) → verified org → PHARMACY_LITE entitlement →
   *   active consent (PRESCRIPTIONS scope via enforceConsentMiddleware) →
   *   PHI_READ audit event.
   *
   * Deliberately does NOT use enforceResourceAccess('AllergyIntolerance'):
   * adding AllergyIntolerance to the PHARMACIST rbac set would also widen
   * sync.pull's role→resource surface (C-SYS-2). This read-only, minimized
   * endpoint is scoped here instead — same pattern as
   * medicationStatement.listActiveForPharmacist.
   */
  listForDispense: roleRestrictedProcedure(['PHARMACIST', 'ADMIN'])
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('PHARMACY_LITE'))
    .input(z.object({ patientRef: z.string().min(1) }))
    .use(enforceConsentMiddleware('AllergyIntolerance'))
    .query(async ({ ctx, input }) => {
      // patient_ref is stored as a BARE UUID (see allergy.list above).
      const patientId = input.patientRef.replace(/^Patient\//, '')

      const { data, error } = await ctx.supabase
        .from('allergy_intolerances')
        .select('id, substance_text, substance_code, substance_system, substance_free_text, criticality')
        .eq('patient_ref', patientId)
        .eq('clinical_status_code', 'active')

      if (error) {
        console.error('Allergy listForDispense error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve allergy records',
        })
      }

      const rows = (data ?? []).map((row) => db.fromRow(row)) as Array<{
        substanceText?: string | null
        substanceCode?: string | null
        substanceSystem?: string | null
        substanceFreeText?: string | null
        criticality?: string | null
      }>

      // Data minimization: substance identity + criticality only.
      const allergies = rows.map((r) => ({
        substanceText: r.substanceText ?? r.substanceFreeText ?? null,
        substanceCode: r.substanceCode ?? null,
        substanceSystem: r.substanceSystem ?? null,
        criticality: r.criticality ?? null,
      }))

      // Audit PHI access (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'ALLERGY',
          resourceId: `dispense-allergies:${patientId}`,
          patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { allergyCount: allergies.length, via: 'pharmacist_dispense' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'AllergyIntolerance', via: 'pharmacist_dispense' })
      }

      return { allergies, count: allergies.length }
    }),

  /**
   * AC 9, 10: Create a new AllergyIntolerance record.
   * RBAC: CLINICIAN only.
   * Emits audit event (PHI_WRITE).
   * Encrypts substanceFreeText (PHI field) via db.toRow().
   */
  create: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('OPD_LITE'))
    .use(async (opts) => {
      // ADMIN is explicitly excluded from allergy creation — only clinical staff
      // can write Tier 1 safety-critical allergy records. Story 62.2: all admin
      // variants (ORG_ADMIN/SUPERADMIN) remain excluded.
      if (isAdminRole(opts.ctx.user.role)) {
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
        // Store bare UUIDs (canonical for allergy_intolerances) regardless of
        // whether the caller sent a "Patient/" / "Practitioner/" prefix, so the
        // bare-keyed reads (allergy.list, sync.pull) always match.
        patientRef: input.patientRef.replace(/^Patient\//, ''),
        recorderRef: input.recorderRef ? input.recorderRef.replace(/^Practitioner\//, '') : null,
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
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'ALLERGY',
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

      // Story 60.4 (Task 2 / AC 4): ALLERGY_UPDATE producer. Notify the patient's
      // treating clinicians (active prescribers) so a new/changed Tier-1 allergy
      // is surfaced — the audience whose prescribing it may invalidate. PHI-safe:
      // criticality enum + opaque patientRef only, NEVER the substance. Fire-and-
      // forget: never blocks or fails the allergy write.
      await produceAllergyUpdateNotification(ctx.supabase, {
        patientId,
        criticality: input.criticality,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        sessionId: ctx.user.sessionId,
        orgId: ctx.user?.orgId ?? undefined,
      })

      return { success: true, allergyId: data.id, alreadySynced: false }
    }),
})
