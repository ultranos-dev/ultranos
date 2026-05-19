import { z } from 'zod'
import { randomUUID } from 'crypto'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { db } from '@/lib/supabase'
import { AuditLogger } from '@ultranos/audit-logger'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { enforcePremiumTier } from '../middleware/enforcePremiumTier'
import { getRedisClient } from '@/lib/redis'

/**
 * Guardian linking router.
 * Story 18.7a: Hub API Guardian Endpoints.
 *
 * Provides server-side OTP verification, guardian link persistence,
 * and unlink notification. The client-side code (Story 18.7) calls
 * these endpoints and gracefully degrades via sync_queue when offline.
 *
 * All endpoints require a valid patient JWT (protectedProcedure)
 * and enforce resource-level RBAC via enforceResourceAccess.
 * No PHI in audit payloads or logs.
 */

/** OTP verification nonce TTL in seconds (5 minutes). */
const GUARDIAN_OTP_NONCE_TTL = 300

export const guardianRouter = createTRPCRouter({
  /**
   * AC 1: Verify guardian OTP server-side using Supabase Admin SDK.
   * Must NOT create a client-side auth session.
   * Returns a single-use nonce that must be passed to createLink.
   */
  verifyOtp: protectedProcedure
    .use(enforceResourceAccess('GuardianLink'))
    .use(enforcePremiumTier('GUARDIAN_LINKING'))
    .input(
      z.object({
        patientId: z.string().uuid(),
        guardianPhone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be E.164 format'),
        otp: z.string().regex(/^\d{6}$/, 'Must be 6 digits'),
        channel: z.enum(['sms', 'whatsapp']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ownership: caller must be the patient
      if (ctx.user.sub !== input.patientId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — you can only manage your own guardian links',
        })
      }

      const audit = new AuditLogger(ctx.supabase)

      // Server-side OTP verification via Supabase Admin SDK.
      // `type` is always 'sms' for phone-based OTP regardless of delivery
      // channel (SMS vs WhatsApp) — Supabase Admin SDK convention.
      const { data, error } = await ctx.supabase.auth.admin.verifyOtp({
        phone: input.guardianPhone,
        token: input.otp,
        type: 'sms',
      } as any) // Supabase Admin SDK types may not include phone OTP params

      if (error || !data?.user?.id) {
        try {
          await audit.emit({
            action: 'LOGIN',
            resourceType: 'GUARDIAN_LINK',
            resourceId: input.patientId,
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'FAILURE',
            sessionId: ctx.user.sessionId,
            metadata: {
              guardianAction: 'GUARDIAN_OTP_ATTEMPT',
              channel: input.channel,
            },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'LOGIN', resourceType: 'GUARDIAN_LINK' })
        }

        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'OTP verification failed',
        })
      }

      const guardianUserId = data.user.id

      // Generate a single-use nonce binding this OTP verification to createLink.
      // Stored in Redis with a 5-minute TTL. Fail-open if Redis unavailable.
      const nonce = randomUUID()
      const redis = getRedisClient()
      if (redis) {
        const nonceKey = `guardian_otp_nonce:${input.patientId}:${guardianUserId}`
        await redis.set(nonceKey, nonce, 'EX', GUARDIAN_OTP_NONCE_TTL)
      }

      try {
        await audit.emit({
          action: 'LOGIN',
          resourceType: 'GUARDIAN_LINK',
          resourceId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            guardianAction: 'GUARDIAN_OTP_VERIFIED',
            channel: input.channel,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'LOGIN', resourceType: 'GUARDIAN_LINK' })
      }

      return { guardianUserId, nonce }
    }),

  /**
   * AC 2, 5: Create a guardian link.
   * Persists to guardian_links table and triggers patient notification.
   * Enforces V1 limit: max 1 active guardian per patient (DB unique index).
   * Requires a valid OTP nonce from verifyOtp.
   */
  createLink: protectedProcedure
    .use(enforceResourceAccess('GuardianLink'))
    .use(enforcePremiumTier('GUARDIAN_LINKING'))
    .input(
      z.object({
        patientId: z.string().uuid(),
        guardianUserId: z.string().uuid(),
        guardianPhoneHash: z.string().min(1),
        guardianPhoneHint: z.string().min(1),
        role: z.string().default('guardian'),
        nonce: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ownership: caller must be the patient
      if (ctx.user.sub !== input.patientId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — you can only manage your own guardian links',
        })
      }

      // Validate OTP nonce — ensures verifyOtp was called first.
      // Fail-open if Redis unavailable (dev mode).
      const redis = getRedisClient()
      if (redis) {
        const nonceKey = `guardian_otp_nonce:${input.patientId}:${input.guardianUserId}`
        const storedNonce = await redis.get(nonceKey)
        if (storedNonce !== input.nonce) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Invalid or expired OTP verification — please verify OTP again',
          })
        }
        // Single-use: delete after validation
        await redis.del(nonceKey)
      }

      const audit = new AuditLogger(ctx.supabase)

      // Insert guardian link — DB unique index enforces V1 limit
      const { data: link, error: insertError } = await ctx.supabase
        .from('guardian_links')
        .insert(db.toRowRaw({
          patientId: input.patientId,
          guardianUserId: input.guardianUserId,
          guardianPhoneHash: input.guardianPhoneHash,
          guardianPhoneHint: input.guardianPhoneHint,
          role: input.role,
          linkedAt: new Date().toISOString(),
          linkedBy: ctx.user.sub,
          status: 'active',
        }, 'non-PHI: guardian_links'))
        .select('id')
        .single()

      if (insertError) {
        // 23505 = unique_violation — V1 limit: active link already exists
        if (insertError.code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'An active guardian link already exists for this patient',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create guardian link',
        })
      }

      // Dispatch patient notification: "A guardian has been linked to your account"
      try {
        await ctx.supabase
          .from('notifications')
          .insert(db.toRowRaw({
            recipientRef: input.patientId,
            recipientRole: 'PATIENT',
            type: 'GUARDIAN_LINKED',
            payload: JSON.stringify({
              guardianLinkId: link.id,
              action: 'linked',
            }),
            status: 'QUEUED',
            nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
          }, 'non-PHI: notifications'))
      } catch {
        // Best-effort: notification failure must not block link creation
        console.warn('[NOTIFICATION_FAILURE]', { type: 'GUARDIAN_LINKED' })
      }

      // Audit guardian link creation — no PHI
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'GUARDIAN_LINK',
          resourceId: link.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            guardianAction: 'GUARDIAN_LINK_CREATED',
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'GUARDIAN_LINK', resourceId: link.id })
      }

      return { success: true, guardianLinkId: link.id }
    }),

  /**
   * AC 3: Notify guardian of unlink and revoke the link.
   * Updates guardian_links.status to 'revoked' and sends notification.
   * Verifies a row was actually updated before proceeding.
   */
  notifyUnlink: protectedProcedure
    .use(enforceResourceAccess('GuardianLink'))
    .use(enforcePremiumTier('GUARDIAN_LINKING'))
    .input(
      z.object({
        patientId: z.string().uuid(),
        guardianUserId: z.string().uuid(),
        guardianLinkId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ownership: caller must be the patient
      if (ctx.user.sub !== input.patientId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — you can only manage your own guardian links',
        })
      }

      const audit = new AuditLogger(ctx.supabase)

      // Revoke the guardian link and verify a row was actually matched
      const { data: revoked, error: updateError } = await ctx.supabase
        .from('guardian_links')
        .update(db.toRowRaw({
          status: 'revoked',
          revokedAt: new Date().toISOString(),
        }, 'non-PHI: guardian_links'))
        .eq('id', input.guardianLinkId)
        .eq('patient_id', input.patientId)
        .select('id')
        .single()

      if (updateError || !revoked) {
        throw new TRPCError({
          code: updateError ? 'INTERNAL_SERVER_ERROR' : 'NOT_FOUND',
          message: updateError
            ? 'Failed to revoke guardian link'
            : 'Guardian link not found or already revoked',
        })
      }

      // Send notification to guardian: "You have been unlinked as a guardian"
      try {
        await ctx.supabase
          .from('notifications')
          .insert(db.toRowRaw({
            recipientRef: input.guardianUserId,
            recipientRole: 'GUARDIAN',
            type: 'GUARDIAN_UNLINKED',
            payload: JSON.stringify({
              guardianLinkId: input.guardianLinkId,
              action: 'unlinked',
            }),
            status: 'QUEUED',
            nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
          }, 'non-PHI: notifications'))
      } catch {
        // Best-effort: notification failure must not block unlink
        console.warn('[NOTIFICATION_FAILURE]', { type: 'GUARDIAN_UNLINKED' })
      }

      // Audit guardian link revocation — no PHI
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'GUARDIAN_LINK',
          resourceId: input.guardianLinkId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            guardianAction: 'GUARDIAN_LINK_REVOKED',
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'GUARDIAN_LINK', resourceId: input.guardianLinkId })
      }

      return { success: true }
    }),
})
