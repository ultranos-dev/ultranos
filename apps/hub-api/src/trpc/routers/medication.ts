import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'

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
