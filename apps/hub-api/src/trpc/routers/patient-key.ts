import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { AuditLogger } from '@ultranos/audit-logger'
import { createTRPCRouter } from '../init'
import { roleRestrictedProcedure } from '../rbac'

/**
 * Patient Key router — ECDSA-P256 public key registration for identity QR verification.
 * Story 25.4: Separate from practitioner keys (Ed25519).
 *
 * Only PATIENT role can register (self-only). ADMIN bypasses role check.
 */
export const patientKeyRouter = createTRPCRouter({
  register: roleRestrictedProcedure(['PATIENT'])
    .input(
      z.object({
        publicKeyP256: z.string().regex(/^[A-Za-z0-9+/=]{100,200}$/, 'Invalid SPKI base64 P-256 public key'),
        patientId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Non-ADMIN callers can only register keys for themselves
      if (ctx.user.role !== 'ADMIN' && ctx.user.sub !== input.patientId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Can only register keys for your own patient ID',
        })
      }

      const now = new Date()
      const defaultExpiry = new Date(now)
      defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1)
      const expiresAt = defaultExpiry.toISOString()

      const { data, error } = await ctx.supabase
        .from('patient_keys')
        .insert({
          public_key_p256: input.publicKeyP256,
          patient_id: input.patientId,
          expires_at: expiresAt,
        })
        .select('id')
        .single()

      if (error) {
        if (error.code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Patient key already registered',
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to register patient key',
        })
      }

      if (!data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to register patient key',
        })
      }

      // Audit: patient key registration
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'PatientKey',
          resourceId: data.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { patientId: input.patientId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'CREATE',
          resourceType: 'PatientKey',
          resourceId: data.id,
        })
      }

      return { registered: true, expiresAt }
    }),
})
