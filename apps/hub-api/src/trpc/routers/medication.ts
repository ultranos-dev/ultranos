import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { roleRestrictedProcedure } from '../rbac'
import { enforceConsentMiddleware } from '../middleware/enforceConsent'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'
import { checkInteractions } from '@ultranos/drug-db'
import { db } from '@/lib/supabase'
import { createSupabaseDrugAdapter } from '@/lib/supabase-drug-adapter'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Story 10.1: Create or update a MedicationStatement when a prescription is dispensed.
 * Best-effort — does not fail the parent operation on error.
 */
async function createMedicationStatementOnDispense(
  supabase: SupabaseClient,
  prescriptionId: string,
  patientRef: string,
  actorId: string,
  hlcTimestamp: string,
): Promise<void> {
  try {
    // Fetch medication details from the prescription
    const { data: rx } = await supabase
      .from('medication_requests')
      .select('id, medication_codeable_concept, medication_display, subject_reference, encounter_reference')
      .eq('id', prescriptionId)
      .single()

    if (!rx) return

    const now = new Date().toISOString()

    // Check if a MedicationStatement already exists for this prescription
    const { data: existing } = await supabase
      .from('medication_statements')
      .select('id')
      .eq('source_prescription_id', prescriptionId)
      .eq('status', 'active')
      .limit(1)

    if (existing && existing.length > 0) {
      // Update effective period
      await supabase
        .from('medication_statements')
        .update(db.toRow({
          effectivePeriodStart: now,
          metaLastUpdated: now,
          hlcTimestamp,
        }))
        .eq('id', existing[0].id)
      return
    }

    // Create new MedicationStatement
    const row = db.toRow({
      id: crypto.randomUUID(),
      resourceType: 'MedicationStatement',
      status: 'active',
      medicationCodeableConcept: rx.medication_codeable_concept,
      medicationDisplay: rx.medication_display,
      subjectReference: rx.subject_reference ?? patientRef,
      effectivePeriodStart: now,
      dateAsserted: now,
      informationSourceReference: `Practitioner/${actorId}`,
      sourceEncounterId: rx.encounter_reference?.replace('Encounter/', '') ?? null,
      sourcePrescriptionId: prescriptionId,
      isOfflineCreated: false,
      hlcTimestamp,
      createdAt: now,
      metaLastUpdated: now,
      metaVersionId: '1',
    })

    await supabase.from('medication_statements').insert(row)
  } catch {
    // Best-effort: log but don't fail the parent operation
    console.warn('[MedicationStatement] Failed to create on dispense', { prescriptionId })
  }
}

/**
 * Story 10.1: Stop a MedicationStatement when a prescription is voided.
 * Best-effort — does not fail the parent operation on error.
 */
async function stopMedicationStatementOnVoid(
  supabase: SupabaseClient,
  prescriptionId: string,
  hlcTimestamp: string,
): Promise<void> {
  try {
    const now = new Date().toISOString()
    await supabase
      .from('medication_statements')
      .update(db.toRow({
        status: 'stopped',
        effectivePeriodEnd: now,
        metaLastUpdated: now,
        hlcTimestamp,
      }))
      .eq('source_prescription_id', prescriptionId)
      .eq('status', 'active')
  } catch {
    console.warn('[MedicationStatement] Failed to stop on void', { prescriptionId })
  }
}

/**
 * Maps internal prescription_status to the pharmacist-facing invalidation status.
 * AC 2: Hub returns AVAILABLE, FULFILLED, or VOIDED.
 */
function toInvalidationStatus(prescriptionStatus: string): 'AVAILABLE' | 'FULFILLED' | 'VOIDED' {
  switch (prescriptionStatus) {
    case 'ACTIVE':
      return 'AVAILABLE'
    case 'DISPENSED':
    case 'PARTIALLY_DISPENSED':
      return 'FULFILLED'
    case 'CANCELLED':
    case 'EXPIRED':
      return 'VOIDED'
    default:
      return 'VOIDED'
  }
}

const GetStatusInputSchema = z
  .object({
    prescriptionId: z.string().uuid().optional(),
    qrCodeId: z.string().min(1).optional(),
  })
  .refine((val) => val.prescriptionId || val.qrCodeId, {
    message: 'Either prescriptionId or qrCodeId must be provided',
  })

/**
 * Medication domain router.
 * Story 3.4: Global Prescription Invalidation Check.
 * Provides status check and fulfillment completion for pharmacist workflow.
 */
export const medicationRouter = createTRPCRouter({
  /**
   * Story 16.3: Create a MedicationRequest (prescription) on the Hub.
   * RBAC: DOCTOR, CLINICIAN only. PHI fields encrypted via db.toRow().
   */
  create: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceResourceAccess('MedicationRequest'))
    .input(
      z.object({
        prescriptionId: z.string().uuid().optional(),
        medicationCode: z.string().min(1),
        medicationDisplay: z.string().min(1),
        medicationText: z.string().optional(),
        patientId: z.string().uuid(),
        encounterId: z.string().uuid().optional(),
        dosageInstruction: z.record(z.unknown()).optional(),
        dispenseRequest: z.record(z.unknown()).optional(),
        interactionCheck: z.enum(['CLEAR', 'WARNING', 'BLOCKED', 'UNAVAILABLE']),
        interactionOverride: z.string().optional(),
        intent: z.enum(['proposal', 'plan', 'order']).default('order'),
        isOfflineCreated: z.boolean().default(false),
        hlcTimestamp: z.string().min(1),
      }).refine(
        (val) => val.interactionCheck === 'CLEAR' || (val.interactionOverride && val.interactionOverride.length > 0),
        { message: 'interactionOverride is required when interactionCheck is not CLEAR', path: ['interactionOverride'] },
      ),
    )
    .use(enforceConsentMiddleware('MedicationRequest'))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      const prescriptionId = input.prescriptionId ?? crypto.randomUUID()
      const qrCodeId = crypto.randomUUID()

      const row = db.toRow({
        id: prescriptionId,
        resourceType: 'MedicationRequest',
        status: 'active',
        prescriptionStatus: 'ACTIVE',
        intent: input.intent,
        medicationCodeableConcept: input.medicationCode,
        medicationDisplay: input.medicationDisplay,
        medicationText: input.medicationText ?? null,
        subjectReference: `Patient/${input.patientId}`,
        encounterReference: input.encounterId ? `Encounter/${input.encounterId}` : null,
        requesterId: ctx.user.sub,
        dosageInstruction: input.dosageInstruction ?? null,
        dispenseRequest: input.dispenseRequest ?? null,
        interactionCheck: input.interactionCheck,
        interactionOverride: input.interactionOverride ?? null,
        qrCodeId,
        authoredOn: now,
        isOfflineCreated: input.isOfflineCreated,
        hlcTimestamp: input.hlcTimestamp,
        createdAt: now,
        metaLastUpdated: now,
        metaVersionId: '1',
      })

      const { data, error } = await ctx.supabase
        .from('medication_requests')
        .insert(row)
        .select('id')
        .single()

      if (error) {
        // Duplicate key = already synced — verify ownership before returning idempotent success
        if (error.code === '23505') {
          const { data: existing } = await ctx.supabase
            .from('medication_requests')
            .select('requester_id, qr_code_id')
            .eq('id', prescriptionId)
            .single()

          if (existing?.requester_id !== ctx.user.sub) {
            // Audit the rejected conflict attempt (CLAUDE.md Rule #6)
            const conflictAudit = new AuditLogger(ctx.supabase)
            try {
              await conflictAudit.emit({
                action: 'PHI_WRITE',
                resourceType: 'PRESCRIPTION',
                resourceId: prescriptionId,
                patientId: input.patientId,
                actorId: ctx.user.sub,
                actorRole: ctx.user.role,
                outcome: 'DENIED',
                sessionId: ctx.user.sessionId,
                metadata: { operation: 'prescription_create_conflict' },
              })
            } catch {
              console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: prescriptionId })
            }
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Prescription ID conflict: record belongs to a different clinician',
            })
          }

          // Audit the idempotent replay (CLAUDE.md Rule #6)
          const replayAudit = new AuditLogger(ctx.supabase)
          try {
            await replayAudit.emit({
              action: 'PHI_WRITE',
              resourceType: 'PRESCRIPTION',
              resourceId: prescriptionId,
              patientId: input.patientId,
              actorId: ctx.user.sub,
              actorRole: ctx.user.role,
              outcome: 'SUCCESS',
              sessionId: ctx.user.sessionId,
              metadata: { operation: 'prescription_create_idempotent' },
            })
          } catch {
            console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: prescriptionId })
          }

          return { prescriptionId, qrCodeId: existing?.qr_code_id ?? qrCodeId, status: 'active' as const, alreadySynced: true }
        }
        console.error('Medication create error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create prescription',
        })
      }

      if (!data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create prescription',
        })
      }

      // Audit PHI write (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: prescriptionId,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'prescription_create', interactionCheck: input.interactionCheck },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: prescriptionId })
      }

      return {
        prescriptionId,
        qrCodeId,
        status: 'active' as const,
      }
    }),

  /**
   * Story 16.3: Read a single MedicationRequest with decrypted PHI fields.
   * RBAC: DOCTOR, CLINICIAN only.
   */
  read: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
    .use(enforceResourceAccess('MedicationRequest'))
    .input(
      z.object({
        prescriptionId: z.string().uuid(),
        patientId: z.string().uuid(),
      }),
    )
    .use(enforceConsentMiddleware('MedicationRequest'))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('medication_requests')
        .select('id, status, prescription_status, intent, medication_codeable_concept, medication_display, medication_text, subject_reference, encounter_reference, requester_id, dosage_instruction, dispense_request, interaction_check, interaction_override, qr_code_id, authored_on, is_offline_created, hlc_timestamp, meta_last_updated, meta_version_id')
        .eq('id', input.prescriptionId)
        .eq('subject_reference', `Patient/${input.patientId}`)
        .single()

      if (error || !data) {
        if (error?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          })
        }
        console.error('Medication read error:', { code: error?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve prescription',
        })
      }

      const decrypted = db.fromRow(data)

      // Audit PHI read (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PRESCRIPTION',
          resourceId: input.prescriptionId,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'prescription_read' },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PRESCRIPTION', resourceId: input.prescriptionId })
      }

      return decrypted
    }),

  /**
   * AC 1, 2: Real-time status check against the Hub.
   * Returns AVAILABLE, FULFILLED, or VOIDED.
   */
  getStatus: protectedProcedure
    .use(enforceResourceAccess('MedicationRequest'))
    .input(GetStatusInputSchema)
    .query(async ({ ctx, input }) => {
      const lookupColumn = input.prescriptionId ? 'id' : 'qr_code_id'
      const lookupValue = input.prescriptionId ?? input.qrCodeId!

      const { data, error } = await ctx.supabase
        .from('medication_requests')
        .select(
          'id, prescription_status, status, medication_display, authored_on, dispensed_at'
        )
        .eq(lookupColumn, lookupValue)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          })
        }
        // Log error shape only — never log PHI
        console.error('Medication status check error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Prescription status check failed',
        })
      }

      // Audit PHI access — prescription data returned (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PRESCRIPTION',
          resourceId: data.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { status: toInvalidationStatus(data.prescription_status) },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PRESCRIPTION', resourceId: data.id })
      }

      return {
        prescriptionId: data.id,
        status: toInvalidationStatus(data.prescription_status),
        medicationDisplay: data.medication_display,
        authoredOn: data.authored_on,
        dispensedAt: data.dispensed_at,
      }
    }),

  /**
   * Story 4.3 AC 1, 2: Record a dispense event from the PWA.
   * Creates a medication_dispense record and updates the parent medication_request status.
   * Emits a medication_request_sync audit log on the Hub.
   *
   * Conflict resolution note: Dispensing uses HLC-based conflict detection (newer wins)
   * rather than Tier 1 append-only merge. This is intentional — pharmacy dispensing is a
   * "Sync-Preferred" event where the correct answer (already dispensed) is deterministic.
   * Appending both and blocking would freeze prescriptions unnecessarily. The TOCTOU guard
   * on the update prevents simultaneous double-dispense.
   */
  recordDispense: protectedProcedure
    .use(enforceResourceAccess('MedicationDispense'))
    .input(
      z.object({
        dispenseId: z.string().uuid(),
        prescriptionId: z.string().uuid(),
        medicationCode: z.string().min(1),
        medicationDisplay: z.string().min(1),
        patientRef: z.string().min(1),
        pharmacistRef: z.string().min(1),
        whenHandedOver: z.string().datetime(),
        hlcTimestamp: z.string().min(1),
        status: z.enum(['completed', 'in-progress']),
      })
    )
    .use(enforceConsentMiddleware('MedicationRequest'))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      // 1. Lookup prescription FIRST — reject early if not found (fixes W9)
      const { data: currentRx, error: fetchError } = await ctx.supabase
        .from('medication_requests')
        .select('id, prescription_status, status, hlc_timestamp')
        .eq('id', input.prescriptionId)
        .single()

      if (fetchError || !currentRx) {
        if (fetchError?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          })
        }
        console.error('Prescription fetch error:', { code: fetchError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve prescription for dispense',
        })
      }

      // 2. Validate prescription status — reject CANCELLED/EXPIRED
      if (currentRx.prescription_status === 'CANCELLED' || currentRx.prescription_status === 'EXPIRED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Prescription is no longer active',
        })
      }

      // 3. Idempotency check — reject if already dispensed (fixes W1)
      const { data: existingDispense } = await ctx.supabase
        .from('medication_dispenses')
        .select('id')
        .eq('prescription_id', input.prescriptionId)
        .eq('status', 'completed')
        .limit(1)

      if (existingDispense && existingDispense.length > 0) {
        // Audit the duplicate attempt before rejecting
        const dupAudit = new AuditLogger(ctx.supabase)
        try {
          await dupAudit.emit({
            action: 'DUPLICATE_DISPENSE_ATTEMPT',
            resourceType: 'PRESCRIPTION',
            resourceId: input.prescriptionId,
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'DENIED',
            sessionId: ctx.user.sessionId,
            metadata: {
              existingDispenseId: existingDispense[0].id,
              attemptedDispenseId: input.dispenseId,
            },
          })
        } catch {
          // Audit failure must not prevent rejection
          console.warn('[AUDIT_FAILURE]', { action: 'DUPLICATE_DISPENSE_ATTEMPT', resourceId: input.prescriptionId })
        }

        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Prescription has already been dispensed',
          cause: { code: 'ALREADY_DISPENSED', existingDispenseId: existingDispense[0].id },
        })
      }

      // 4. Insert the medication_dispense record (now safe — prescription validated)
      const { data: dispenseRow, error: insertError } = await ctx.supabase
        .from('medication_dispenses')
        .insert({
          id: input.dispenseId,
          prescription_id: input.prescriptionId,
          medication_code: input.medicationCode,
          medication_display: input.medicationDisplay,
          patient_ref: input.patientRef,
          pharmacist_ref: input.pharmacistRef,
          when_handed_over: input.whenHandedOver,
          hlc_timestamp: input.hlcTimestamp,
          status: input.status,
          synced_by: ctx.user.sub,
          synced_at: now,
        })
        .select('id')
        .single()

      if (insertError || !dispenseRow) {
        // Duplicate dispenseId = idempotent replay (offline-first sync delivers same event twice)
        if (insertError?.code === '23505') {
          return {
            success: true,
            dispenseId: input.dispenseId,
            prescriptionStatus: input.status === 'completed' ? 'completed' : 'partial',
            dispensedAt: null,
            conflictDetected: false,
            alreadySynced: true,
          }
        }
        console.error('Dispense insert error:', { code: insertError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to record dispense event',
        })
      }

      // AC 5: If prescription already completed with newer HLC, ignore update but log conflict
      const alreadyCompleted = currentRx.prescription_status === 'DISPENSED'
      const existingHlc = currentRx.hlc_timestamp as string | null
      const incomingIsOlder = existingHlc != null && input.hlcTimestamp < existingHlc

      if (alreadyCompleted && incomingIsOlder) {
        const { error: conflictLogError } = await ctx.supabase
          .from('dispense_conflicts')
          .insert({
            id: crypto.randomUUID(),
            dispense_id: input.dispenseId,
            prescription_id: input.prescriptionId,
            incoming_hlc: input.hlcTimestamp,
            existing_hlc: existingHlc,
            resolved_action: 'ignored_older_hlc',
            logged_by: ctx.user.sub,
            logged_at: now,
          })
          .select('id')
          .single()

        if (conflictLogError) {
          console.error('Conflict log insert error:', { code: conflictLogError.code })
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to record dispense conflict',
          })
        }

        return {
          success: true,
          dispenseId: dispenseRow.id,
          prescriptionStatus: 'already_completed',
          dispensedAt: null,
          conflictDetected: true,
        }
      }

      // 3. Update the parent medication_request status
      // Conditional guard on prescription_status prevents TOCTOU double-dispense race
      const newPrescriptionStatus = input.status === 'completed' ? 'DISPENSED' : 'PARTIALLY_DISPENSED'
      const newStatus = input.status === 'completed' ? 'completed' : 'active'

      const { data: updatedRx, error: updateError } = await ctx.supabase
        .from('medication_requests')
        .update({
          prescription_status: newPrescriptionStatus,
          status: newStatus,
          dispensed_at: input.status === 'completed' ? now : null,
          dispensed_by: input.status === 'completed' ? ctx.user.sub : null,
          hlc_timestamp: input.hlcTimestamp,
          meta_last_updated: now,
        })
        .eq('id', input.prescriptionId)
        .eq('prescription_status', currentRx.prescription_status)
        .select('id, prescription_status, status, dispensed_at')
        .single()

      if (updateError || !updatedRx) {
        // Clean up orphaned dispense row — insert succeeded but update failed
        try {
          await ctx.supabase
            .from('medication_dispenses')
            .delete()
            .eq('id', input.dispenseId)
        } catch {
          console.warn('[ORPHAN_CLEANUP_FAILED]', { dispenseId: input.dispenseId })
        }

        if (updateError?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Prescription status changed — another pharmacist may have fulfilled it. Please re-scan.',
          })
        }
        console.error('Medication request update error:', { code: updateError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update prescription status',
        })
      }

      // Story 10.1: Create MedicationStatement when prescription is fully dispensed
      if (input.status === 'completed') {
        await createMedicationStatementOnDispense(
          ctx.supabase,
          input.prescriptionId,
          input.patientRef,
          ctx.user.sub,
          input.hlcTimestamp,
        )
      }

      // 4. Emit audit log via AuditLogger (replaces direct medication_request_sync insert)
      const dispenseAudit = new AuditLogger(ctx.supabase)
      try {
        await dispenseAudit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: input.prescriptionId,
          patientId: input.patientRef.replace('Patient/', ''),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            dispenseAction: 'dispense_sync',
            dispenseId: input.dispenseId,
            hlcTimestamp: input.hlcTimestamp,
            newStatus: newPrescriptionStatus,
          },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: input.prescriptionId })
      }

      return {
        success: true,
        dispenseId: dispenseRow.id,
        prescriptionStatus: input.status === 'completed' ? 'completed' : 'partial',
        dispensedAt: updatedRx.dispensed_at ?? null,
        conflictDetected: false,
      }
    }),

  /**
   * AC 5: Mark prescription as completed/fulfilled upon pharmacist confirmation.
   * Protected — requires authenticated pharmacist session.
   */
  complete: protectedProcedure
    .use(enforceResourceAccess('MedicationDispense'))
    .input(
      z.object({
        prescriptionId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify current status — must be ACTIVE to complete
      const { data: current, error: fetchError } = await ctx.supabase
        .from('medication_requests')
        .select('id, prescription_status, status, interaction_check, subject_reference')
        .eq('id', input.prescriptionId)
        .single()

      if (fetchError || !current) {
        if (fetchError?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          })
        }
        console.error('Medication fetch error:', { code: fetchError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve prescription',
        })
      }

      const currentInvalidationStatus = toInvalidationStatus(current.prescription_status)

      if (current.prescription_status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Prescription cannot be fulfilled — current status: ${currentInvalidationStatus}`,
        })
      }

      // CLAUDE.md rule #3: Drug interaction checks must never be skipped silently
      if (current.interaction_check === 'BLOCKED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Prescription has a blocked drug interaction — cannot dispense.',
        })
      }
      if (current.interaction_check === 'UNAVAILABLE') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Drug interaction check was unavailable for this prescription — cannot dispense without verification.',
        })
      }

      // Atomic conditional update — prevents TOCTOU race (double-dispense)
      const now = new Date().toISOString()
      const { data: updated, error: updateError } = await ctx.supabase
        .from('medication_requests')
        .update({
          status: 'completed',
          prescription_status: 'DISPENSED',
          dispensed_at: now,
          dispensed_by: ctx.user.sub,
          meta_last_updated: now,
        })
        .eq('id', input.prescriptionId)
        .eq('prescription_status', 'ACTIVE')
        .select('id, prescription_status, status, dispensed_at')
        .single()

      if (updateError || !updated) {
        // If no rows matched, another pharmacist fulfilled it between our read and write
        if (updateError?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Prescription was fulfilled by another pharmacist — please re-scan.',
          })
        }
        console.error('Medication update error:', { code: updateError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update prescription status',
        })
      }

      // Story 10.1: Create MedicationStatement for the dispensed prescription
      await createMedicationStatementOnDispense(
        ctx.supabase,
        input.prescriptionId,
        '', // patientRef resolved from prescription inside helper
        ctx.user.sub,
        new Date().toISOString(), // HLC not available in complete — use ISO timestamp
      )

      // Audit PHI write — prescription status changed (CLAUDE.md Rule #6)
      const completeAudit = new AuditLogger(ctx.supabase)
      try {
        await completeAudit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: updated.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          patientId: (current.subject_reference as string)?.replace('Patient/', ''),
          metadata: {
            previousStatus: currentInvalidationStatus,
            newStatus: toInvalidationStatus(updated.prescription_status),
          },
        })
      } catch (auditError) {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PRESCRIPTION', resourceId: updated.id })
      }

      return {
        success: true,
        prescriptionId: updated.id,
        previousStatus: currentInvalidationStatus,
        newStatus: toInvalidationStatus(updated.prescription_status) as 'FULFILLED',
        dispensedAt: updated.dispensed_at,
      }
    }),

  /**
   * Story 10.1 AC 4: Void a prescription and stop the corresponding MedicationStatement.
   * Transitions prescription to CANCELLED and MedicationStatement to stopped.
   */
  voidPrescription: protectedProcedure
    .use(enforceResourceAccess('MedicationRequest'))
    .input(
      z.object({
        prescriptionId: z.string().uuid(),
        reason: z.string().min(1),
        hlcTimestamp: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      const { data: updated, error } = await ctx.supabase
        .from('medication_requests')
        .update({
          status: 'cancelled',
          prescription_status: 'CANCELLED',
          meta_last_updated: now,
        })
        .eq('id', input.prescriptionId)
        .eq('prescription_status', 'ACTIVE')
        .select('id, prescription_status, subject_reference')
        .single()

      if (error || !updated) {
        if (error?.code === 'PGRST116') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Active prescription not found — may already be voided or dispensed',
          })
        }
        console.error('Prescription void error:', { code: error?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to void prescription',
        })
      }

      // Story 10.1: Stop corresponding MedicationStatement
      await stopMedicationStatementOnVoid(
        ctx.supabase,
        input.prescriptionId,
        input.hlcTimestamp,
      )

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: updated.id,
          patientId: (updated.subject_reference as string)?.replace('Patient/', ''),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'void', reason: 'prescription_voided' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_WRITE',
          resourceType: 'PRESCRIPTION',
          resourceId: updated.id,
        })
      }

      return {
        success: true,
        prescriptionId: updated.id,
        newStatus: 'VOIDED' as const,
      }
    }),

  /**
   * Story 16.6: Server-side drug interaction check.
   * Queries patient's active medications + allergies and runs the check centrally.
   * RBAC: enforces MedicationRequest resource access.
   * CLAUDE.md Rule #3: Never return CLEAR on failure — return UNAVAILABLE.
   * CLAUDE.md Rule #6: Audit every PHI access.
   */
  checkInteractions: protectedProcedure
    .use(enforceResourceAccess('MedicationRequest'))
    .input(
      z.object({
        medicationCode: z.string().min(1),
        medicationDisplay: z.string().min(1),
        patientId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const patientRef = `Patient/${input.patientId}`

      // 1. Query active MedicationStatements (select only fields needed by drug-db checker)
      const { data: statements, error: stmtError } = await ctx.supabase
        .from('medication_statements')
        .select('id, medication_codeable_concept, medication_display, subject_reference, status')
        .eq('subject_reference', patientRef)
        .eq('status', 'active')

      if (stmtError) {
        console.error('MedicationStatement query error:', { code: stmtError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve active medication statements',
        })
      }

      // 2. Query pending MedicationRequests (ACTIVE prescriptions — only need display name)
      const { data: pendingRequests, error: rxError } = await ctx.supabase
        .from('medication_requests')
        .select('id, medication_display')
        .eq('subject_reference', patientRef)
        .eq('prescription_status', 'ACTIVE')

      if (rxError) {
        console.error('MedicationRequest query error:', { code: rxError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve pending medication requests',
        })
      }

      // 3. Query active allergies (select fields needed by drug-db allergy matching)
      const { data: allergies, error: allergyError } = await ctx.supabase
        .from('allergy_intolerances')
        .select('id, code_coding, code_text, clinical_status_code, patient_ref')
        .eq('patient_ref', patientRef)
        .eq('clinical_status_code', 'active')

      if (allergyError) {
        console.error('AllergyIntolerance query error:', { code: allergyError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve active allergies',
        })
      }

      // 4. Extract display names from pending MedicationRequests
      const pendingRxNames = (pendingRequests ?? [])
        .map((rx) => rx.medication_display as string | null)
        .filter((name): name is string => !!name)

      // 5. Build adapter and run interaction check
      // CLAUDE.md Rule #3: Never return CLEAR on failure — catch any thrown error
      const adapter = createSupabaseDrugAdapter(ctx.supabase)
      const activeMedStatements = (statements ?? []).map((row) => db.fromRow(row))

      let result
      try {
        result = await checkInteractions(
          input.medicationDisplay,
          pendingRxNames,
          {
            activeMedications: activeMedStatements,
            activeAllergies: (allergies ?? []).map((row) => db.fromRow(row)),
          },
          adapter,
        )
      } catch (checkError) {
        console.error('Drug interaction check error:', { code: (checkError as { code?: string })?.code })
        result = { result: 'UNAVAILABLE' as const, interactions: [], reason: 'ADAPTER_ERROR' as const }
      }

      // 6. Audit PHI read (CLAUDE.md Rule #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'INTERACTION_CHECK',
          resourceId: input.patientId,
          patientId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            medicationDisplay: input.medicationDisplay,
            result: result.result,
            interactionCount: result.interactions.length,
            ...(result.reason ? { reason: result.reason } : {}),
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'PHI_READ',
          resourceType: 'INTERACTION_CHECK',
        })
      }

      return result
    }),
})
