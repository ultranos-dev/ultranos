import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { checkConsent } from '../middleware/enforceConsent'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'

/**
 * Consent domain router.
 * Story 5.3: Data Sharing Consent Management.
 * Handles consent sync from Health Passport and consent status checks.
 */
export const consentRouter = createTRPCRouter({
  /**
   * AC 3: Sync a consent resource from Health Passport to Hub.
   * Appends to the consent ledger (append-only — no updates/deletes).
   */
  sync: protectedProcedure
    .use(enforceResourceAccess('Consent'))
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['ACTIVE', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED']),
        category: z.array(z.string().min(1)),
        patientRef: z.string().min(1),
        dateTime: z.string().datetime(),
        provisionStart: z.string().datetime(),
        provisionEnd: z.string().datetime().optional(),
        grantorId: z.string().min(1),
        grantorRole: z.enum(['SELF', 'GUARDIAN', 'EMERGENCY_OVERRIDE']),
        purpose: z.enum(['TREATMENT', 'ANALYTICS', 'AI_PROCESSING', 'RESEARCH', 'THIRD_PARTY_SHARE']),
        consentVersion: z.string().min(1),
        auditHash: z.string().min(1),
        hlcTimestamp: z.string().min(1),
        withdrawnAt: z.string().datetime().optional(),
        withdrawalReason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // D167: Verify grantor ID matches authenticated user to prevent impersonation.
      // Only PATIENT, GUARDIAN, and ADMIN may grant consent.
      const CONSENT_GRANTOR_ROLES = ['PATIENT', 'GUARDIAN', 'ADMIN']
      if (!CONSENT_GRANTOR_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only patients, guardians, and administrators may grant consent',
        })
      }
      // ADMIN may sync on behalf of patients (override).
      if (ctx.user.role !== 'ADMIN' && input.grantorId !== ctx.user.sub) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Consent grantor must match the authenticated user',
        })
      }

      const now = new Date().toISOString()

      // Append-only insert — never update or delete consent records
      const { data, error } = await ctx.supabase
        .from('consents')
        .insert({
          id: input.id,
          status: input.status,
          category: input.category,
          patient_ref: input.patientRef,
          date_time: input.dateTime,
          provision_start: input.provisionStart,
          provision_end: input.provisionEnd ?? null,
          grantor_id: input.grantorId,
          grantor_role: input.grantorRole,
          purpose: input.purpose,
          consent_version: input.consentVersion,
          audit_hash: input.auditHash,
          hlc_timestamp: input.hlcTimestamp,
          withdrawn_at: input.withdrawnAt ?? null,
          withdrawal_reason: input.withdrawalReason ?? null,
          synced_by: ctx.user.sub,
          synced_at: now,
        })
        .select('id')
        .single()

      if (error) {
        // Duplicate key = already synced — idempotent success
        if (error.code === '23505') {
          return { success: true, consentId: input.id, alreadySynced: true }
        }
        console.error('Consent sync error:', { code: error.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to sync consent record',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      await audit.emit({
        action: 'PHI_WRITE',
        resourceType: 'Consent',
        resourceId: data.id,
        patientId: input.patientRef.replace('Patient/', ''),
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'success',
        sessionId: ctx.user.sessionId,
        metadata: { syncAction: 'consent_synced' },
      })

      return { success: true, consentId: data.id, alreadySynced: false }
    }),

  /**
   * AC 4: Check if consent exists for a patient + resource type.
   * Used by other routers/middleware to enforce data access.
   */
  check: protectedProcedure
    .use(enforceResourceAccess('Consent'))
    .input(
      z.object({
        patientId: z.string().min(1),
        resourceType: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const hasConsent = await checkConsent(ctx.supabase, {
        patientId: input.patientId,
        resourceType: input.resourceType,
      })

      const audit = new AuditLogger(ctx.supabase)
      await audit.emit({
        action: 'PHI_READ',
        resourceType: 'Consent',
        resourceId: 'consent-check',
        patientId: input.patientId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'success',
        sessionId: ctx.user.sessionId,
        metadata: {
          checkedResourceType: input.resourceType,
          permitted: String(hasConsent),
        },
      })

      return { permitted: hasConsent }
    }),
})
