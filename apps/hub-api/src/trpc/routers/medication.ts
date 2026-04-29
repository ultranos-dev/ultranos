import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceConsentMiddleware } from '../middleware/enforceConsent'

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
   * AC 1, 2: Real-time status check against the Hub.
   * Returns AVAILABLE, FULFILLED, or VOIDED.
   */
  getStatus: protectedProcedure
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
    .use(enforceConsentMiddleware('MedicationRequest'))
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
    .mutation(async ({ ctx, input }) => {
      // 1. Insert the medication_dispense record
      const now = new Date().toISOString()
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
        console.error('Dispense insert error:', { code: insertError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to record dispense event',
        })
      }

      // 2. HLC conflict check — fetch current prescription state
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

      // 4. Emit audit log — medication_request_sync (Dev Notes requirement)
      const { error: auditError } = await ctx.supabase
        .from('medication_request_sync')
        .insert({
          id: crypto.randomUUID(),
          dispense_id: input.dispenseId,
          prescription_id: input.prescriptionId,
          action: 'dispense_sync',
          synced_by: ctx.user.sub,
          hlc_timestamp: input.hlcTimestamp,
          synced_at: now,
        })
        .select('id')
        .single()

      if (auditError) {
        console.error('Audit log insert error:', { code: auditError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to write audit log for dispense sync',
        })
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
    .input(
      z.object({
        prescriptionId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify current status — must be ACTIVE to complete
      const { data: current, error: fetchError } = await ctx.supabase
        .from('medication_requests')
        .select('id, prescription_status, status, interaction_check')
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

      return {
        success: true,
        prescriptionId: updated.id,
        previousStatus: currentInvalidationStatus,
        newStatus: toInvalidationStatus(updated.prescription_status) as 'FULFILLED',
        dispensedAt: updated.dispensed_at,
      }
    }),
})
