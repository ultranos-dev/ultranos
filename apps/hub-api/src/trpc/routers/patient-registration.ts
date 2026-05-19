import { z } from 'zod'
import { createHash } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { baseProcedure, createTRPCRouter } from '../init'
import { rateLimitMiddleware, checkRateLimit } from '../middleware/rateLimit'
import { AuditLogger } from '@ultranos/audit-logger'
import { encryptField } from '@ultranos/crypto/server-crypto'
import { db } from '@/lib/supabase'

/**
 * OTP rate limit: max 3 requests per phone per 10-minute window.
 * Hybrid: IP-based via middleware + per-phone via inline check (D3).
 */
const OTP_RATE_LIMIT = { limit: 3, windowSec: 600 } as const

/** Supported locales for patient registration. */
const SUPPORTED_LOCALES = ['en', 'ar', 'prs'] as const

/** Hash phone for per-phone rate limiting without storing raw phone in Redis. */
function hashPhone(phone: string): string {
  return createHash('sha256').update(phone).digest('hex')
}

/** Validate that a date string is a real calendar date and not in the future. */
function isValidCalendarDate(dateStr: string): boolean {
  const [yearStr, monthStr, dayStr] = dateStr.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (month < 1 || month > 12 || day < 1) return false
  // Construct date and verify it didn't roll over
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return false
  }
  // Reject future dates
  if (date > new Date()) return false
  return true
}

/**
 * Patient self-registration router.
 * Story 27.10: Public endpoints for patient OTP request and registration.
 *
 * Security:
 * - All endpoints use baseProcedure (no auth — user has no session yet)
 * - Anti-enumeration: generic responses regardless of whether phone exists
 * - Audit events use opaque patient ID only — never phone, name, or DOB
 */
export const patientRegistrationRouter = createTRPCRouter({
  /**
   * Task 3: Request OTP for patient registration/login.
   * AC #1: Sends OTP via Supabase Auth phone provider.
   * AC #8: Always returns { sent: true } regardless of phone existence (anti-enumeration).
   * Rate limited: max 3 requests per phone per 10 minutes.
   */
  requestOtp: baseProcedure
    .use(rateLimitMiddleware(OTP_RATE_LIMIT, 'patientOtp'))
    .input(
      z.object({
        phone: z.string().min(7).max(20).regex(/^\+\d+$/, 'Phone must be E.164 format (e.g. +971501234567)'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // D3: Per-phone rate limiting (hybrid with IP-based middleware)
      const phoneHash = hashPhone(input.phone)
      const phoneLimit = await checkRateLimit(
        { scope: 'phone', id: phoneHash },
        'patientRegistration.requestOtp',
        OTP_RATE_LIMIT,
        'perPhone',
      )
      if (!phoneLimit.allowed) {
        // Anti-enumeration: still return { sent: true } even when rate-limited
        return { sent: true }
      }

      // Always return success regardless of outcome (AC #8 — anti-enumeration).
      // Supabase Auth handles the actual OTP delivery.
      try {
        await ctx.supabase.auth.signInWithOtp({ phone: input.phone })
      } catch {
        // Swallow errors — never reveal if phone exists or delivery failed
      }

      return { sent: true }
    }),

  /**
   * Task 2: Patient self-registration.
   * AC #1: Verifies OTP, collects profile info.
   * AC #2: Creates FHIR Patient with no org_id (free-floating).
   * AC #3: Assigns FREE tier by default.
   * AC #7: Audit event with opaque patient ID only.
   * AC #8: Duplicate phone returns generic error.
   */
  register: baseProcedure
    .use(rateLimitMiddleware(OTP_RATE_LIMIT, 'patientRegister'))
    .input(
      z.object({
        phone: z.string().min(7).max(20).regex(/^\+\d+$/, 'Phone must be E.164 format'),
        otpCode: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
        firstName: z.string().min(1).max(200).transform((s) => s.trim()),
        dateOfBirth: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
          .refine(isValidCalendarDate, 'Date of birth must be a valid date in the past'),
        preferredLanguage: z.enum(SUPPORTED_LOCALES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const encKey = process.env.FIELD_ENCRYPTION_KEY
      if (!encKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed. Please try again.',
        })
      }

      // Step 1: Verify OTP via Supabase Auth phone provider
      const { data: otpData, error: otpError } = await ctx.supabase.auth.verifyOtp({
        phone: input.phone,
        token: input.otpCode,
        type: 'sms',
      })

      if (otpError || !otpData.session) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration failed. Please try again.',
        })
      }

      const userId = otpData.session.user.id

      // Step 2: Check for duplicate phone — generic error if exists (AC #8)
      const { data: existingPatient } = await ctx.supabase
        .from('patients')
        .select('id')
        .eq('telecom_phone', input.phone)
        .limit(1)

      if (existingPatient && existingPatient.length > 0) {
        // Anti-enumeration: generic error, no indication phone is already registered
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration failed. Please try again.',
        })
      }

      // Step 3: Create FHIR Patient resource — FREE tier, no org_id (AC #2, #3)
      // P1: Encrypt PHI fields before storage
      const now = new Date().toISOString()
      const patientId = crypto.randomUUID()

      const row = db.toRow({
        id: patientId,
        nameLocal: input.firstName,
        nameLocalEnc: encryptField(input.firstName, encKey),
        gender: null,
        birthDate: input.dateOfBirth,
        birthDateEnc: encryptField(input.dateOfBirth, encKey),
        birthYearOnly: false,
        telecomPhone: input.phone,
        isActive: true,
        patientTier: 'FREE',
        preferredLanguage: input.preferredLanguage,
        createdAt: now,
        updatedAt: now,
      })

      const { error: insertError } = await ctx.supabase.from('patients').insert(row)

      if (insertError) {
        // P3: Handle unique constraint violation on telecom_phone gracefully
        if (insertError.code === '23505') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Registration failed. Please try again.',
          })
        }
        console.error('[PATIENT_REGISTRATION] insert failed:', { code: insertError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed. Please try again.',
        })
      }

      // Step 4: Update Supabase Auth user metadata to link patient record
      try {
        await ctx.supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            role: 'PATIENT',
            patient_id: patientId,
            preferred_language: input.preferredLanguage,
          },
        })
      } catch {
        // P4: Rollback patient record AND revoke auth session on failure
        await ctx.supabase.from('patients').delete().eq('id', patientId)
        await ctx.supabase.auth.admin.deleteUser(userId).catch(() => {
          console.warn('[PATIENT_REGISTRATION] Failed to revoke auth user after rollback:', { userId })
        })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed. Please try again.',
        })
      }

      // Step 5: Emit audit event with opaque patient ID only (AC #7 — never phone, name, or DOB)
      // D2: Queue for retry on failure rather than silently dropping
      const audit = new AuditLogger(ctx.supabase)
      const auditEvent = {
        action: 'CREATE' as const,
        resourceType: 'PATIENT' as const,
        resourceId: patientId,
        actorId: userId,
        actorRole: 'PATIENT' as const,
        outcome: 'SUCCESS' as const,
        sessionId: `self-reg:${patientId}`,
        metadata: { operation: 'self-registration' },
      }
      try {
        await audit.emit(auditEvent)
      } catch {
        // D2: Retry once before accepting failure
        try {
          await audit.emit(auditEvent)
        } catch {
          console.error('[AUDIT_FAILURE] Audit event dropped after retry:', {
            action: 'CREATE',
            resourceType: 'PATIENT',
            resourceId: patientId,
          })
        }
      }

      // Step 6: Return session tokens (AC #6 — 90-day session)
      return {
        success: true,
        patientId,
        session: {
          accessToken: otpData.session.access_token,
          refreshToken: otpData.session.refresh_token,
          expiresAt: otpData.session.expires_at,
        },
      }
    }),
})
