import { z } from 'zod'
import { createHash } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { baseProcedure, protectedProcedure, createTRPCRouter } from '../init'
import { rateLimitMiddleware, checkRateLimit } from '../middleware/rateLimit'
import { AuditLogger } from '@ultranos/audit-logger'
import { encryptField, generateBlindIndex } from '@ultranos/crypto/server'
import { db } from '@/lib/supabase'
import { getFieldEncryptionKeys } from '@/lib/field-encryption'
import { computeMpiResult } from '@ultranos/mpi-engine'
import { fetchMpiCandidates } from '@/lib/mpi-candidate-query'

/**
 * OTP rate limit: max 3 requests per phone per 10-minute window.
 * Hybrid: IP-based via middleware + per-phone via inline check (D3).
 */
const OTP_RATE_LIMIT = { limit: 3, windowSec: 600 } as const

/** Supported locales for patient registration. */
const SUPPORTED_LOCALES = ['en', 'ar', 'prs', 'ps'] as const

/** Hash phone for per-phone rate limiting without storing raw phone in Redis. */
function hashPhone(phone: string): string {
  return createHash('sha256').update(phone).digest('hex')
}

/**
 * Normalize a phone to E.164-ish digits for comparison: strip everything except
 * the leading "+" and digits. Supabase stores the verified phone without a leading
 * "+" (e.g. "93701234567"), while our inputs are validated as "+<digits>", so we
 * compare on digits only.
 */
function normalizePhoneDigits(phone: string): string {
  return phone.replace(/[^\d]/g, '')
}

/**
 * Security guard: ensure the caller's request phone matches the OTP-verified phone
 * bound to their authenticated session. The verified phone is NOT on ctx.user, so we
 * resolve it authoritatively via the Auth admin API (supabase.auth.admin.getUserById).
 *
 * On mismatch (or if the verified phone cannot be resolved) we throw FORBIDDEN — the
 * message is deliberately generic so it does not reveal whether the target phone exists
 * or which phone is bound. A SECURITY_VIOLATION / DENIED audit is emitted with the
 * opaque actorId only (never a phone number) — consistent with the other anomaly audits.
 */
async function assertSessionPhone(
  ctx: { user: { sub: string }; supabase: { auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { phone?: string | null } | null } | null }> } } } },
  requestPhone: string,
  audit: AuditLogger,
  operation: 'discover' | 'claim',
): Promise<void> {
  let verifiedPhone: string | null = null
  try {
    const { data } = await ctx.supabase.auth.admin.getUserById(ctx.user.sub)
    verifiedPhone = data?.user?.phone ?? null
  } catch {
    verifiedPhone = null
  }

  const matches =
    verifiedPhone != null &&
    normalizePhoneDigits(verifiedPhone) === normalizePhoneDigits(requestPhone)

  if (!matches) {
    await audit
      .emit({
        action: 'SECURITY_VIOLATION',
        resourceType: 'PATIENT',
        resourceId: ctx.user.sub,
        actorId: ctx.user.sub,
        actorRole: 'PATIENT',
        outcome: 'DENIED',
        denialReason: 'session phone mismatch',
        sessionId: `${operation}:${ctx.user.sub}`,
        metadata: { operation },
      })
      .catch(() => {})
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This action is not permitted.' })
  }
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
        nameFather: z.string().min(1).max(200).transform((s) => s.trim()).optional(),
        gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
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

      // Step 2: MPI deduplication check — fetch candidates and score (Task 11)
      const birthYear = Number(input.dateOfBirth.split('-')[0])
      const mpiCandidates = await fetchMpiCandidates(ctx.supabase, {
        nameGiven: input.firstName,
        nameFather: input.nameFather,
        birthYear,
        phone: input.phone,
      })

      const mpiResult = computeMpiResult(mpiCandidates, {
        nameGiven: input.firstName,
        nameFather: input.nameFather,
        birthYear,
        phone: input.phone,
        gender: input.gender,
      })

      if (mpiResult.decision === 'BLOCK') {
        // Anti-enumeration: return non-throwing blocked response — no candidate IDs or PHI
        return { blocked: true, message: 'You may already be registered. Please contact your clinic.' }
      }

      const mpiWarn = mpiResult.decision === 'WARN'

      // Step 3: Create FHIR Patient resource atomically with consent via RPC — FREE tier, no org_id (AC #2, #3)
      // P1: Encrypt PHI fields before storage
      const now = new Date().toISOString()
      const patientId = crypto.randomUUID()

      const patientRow = db.toRow({
        id: patientId,
        nameLocal: input.firstName,
        nameLocalEnc: encryptField(input.firstName, encKey),
        nameFather: input.nameFather ?? null,
        gender: input.gender ?? null,
        birthDate: input.dateOfBirth,
        birthDateEnc: encryptField(input.dateOfBirth, encKey),
        birthYearOnly: false,
        telecomPhone: input.phone,
        isActive: true,
        patientTier: 'FREE',
        preferredLanguage: input.preferredLanguage,
        mpi_warn: mpiWarn,
        createdAt: now,
        updatedAt: now,
      })

      const consentRow = {
        consent_method: 'SELF_REGISTERED' as const,
        grantor_id: userId,
        grantor_role: 'PATIENT' as const,
      }

      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc('create_patient_with_consent', {
        p_patient: patientRow,
        p_consent: consentRow,
      })

      if (rpcError) {
        // Handle unique constraint violation on telecom_phone gracefully
        if (rpcError.code === '23505') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Registration failed. Please try again.',
          })
        }
        console.error('[PATIENT_REGISTRATION] RPC failed:', { code: rpcError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed. Please try again.',
        })
      }

      const createdPatientId: string = (rpcData as Record<string, string>)?.['patientId'] ?? patientId

      // Step 4: Update Supabase Auth user metadata to link patient record
      try {
        await ctx.supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            role: 'PATIENT',
            patient_id: createdPatientId,
            preferred_language: input.preferredLanguage,
          },
        })
      } catch {
        // P4: Rollback and revoke auth session on failure
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
        resourceId: createdPatientId,
        actorId: userId,
        actorRole: 'PATIENT' as const,
        outcome: 'SUCCESS' as const,
        sessionId: `self-reg:${createdPatientId}`,
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
            resourceId: createdPatientId,
          })
        }
      }

      // Step 6: Return session tokens (AC #6 — 90-day session)
      return {
        success: true,
        patientId: createdPatientId,
        session: {
          accessToken: otpData.session.access_token,
          refreshToken: otpData.session.refresh_token,
          expiresAt: otpData.session.expires_at,
        },
      }
    }),

  /**
   * O3 Task 3: Post-OTP phone discovery.
   * Checks if the authenticated user's phone matches a staff (practitioner) record
   * or an unclaimed patient record. Returns matchType and a safe opaque candidate ref.
   * No PHI returned — masked name only; ref is a blind index of patient ID.
   */
  discover: protectedProcedure
    .input(z.object({ phone: z.string().min(7).max(20).regex(/^\+\d+$/) }))
    .mutation(async ({ ctx, input }) => {
      const { hmacKey } = getFieldEncryptionKeys()
      const audit = new AuditLogger(ctx.supabase)

      // Step 0: bind to the session's OTP-verified phone (prevents discovering phone B
      // while authed for phone A). FORBIDDEN on mismatch without leaking which phone.
      await assertSessionPhone(ctx, input.phone, audit, 'discover')

      // Staff check (blind index over encrypted practitioner phone)
      const phoneIdx = generateBlindIndex(input.phone, hmacKey)
      const { data: staff } = await ctx.supabase
        .from('practitioners')
        .select('id')
        .eq('telecom_phone_index', phoneIdx)
        .maybeSingle()
      if (staff) {
        await audit
          .emit({
            action: 'READ',
            resourceType: 'PRACTITIONER',
            resourceId: String((staff as { id: string }).id),
            actorId: ctx.user.sub,
            actorRole: 'PATIENT',
            outcome: 'SUCCESS',
            sessionId: `discover:${ctx.user.sub}`,
            metadata: { operation: 'discover', matchType: 'staff' },
          })
          .catch(() => {})
        return { matchType: 'staff' as const }
      }

      // Patient check (plaintext unique phone)
      const { data: patient } = await ctx.supabase
        .from('patients')
        .select('id, name_local, birth_date, birth_year, auth_user_id')
        .eq('telecom_phone', input.phone)
        .maybeSingle()
      const p = patient as {
        id: string
        name_local: string | null
        birth_date: string | null
        birth_year: number | null
        auth_user_id: string | null
      } | null

      if (p && (p.auth_user_id == null || p.auth_user_id === ctx.user.sub)) {
        const ref = generateBlindIndex(p.id, hmacKey)
        // name_local is the PLAINTEXT ILIKE-search column (the encrypted copy lives in
        // name_local_enc). Use it directly — do NOT decryptField a plaintext value, and
        // emit only the first given token (no family name) for data minimization.
        const maskedName = p.name_local ? (p.name_local.trim().split(/\s+/)[0] ?? '') : ''
        const birthYear = p.birth_year ?? (p.birth_date ? Number(p.birth_date.slice(0, 4)) : null)
        await audit
          .emit({
            action: 'READ',
            resourceType: 'PATIENT',
            resourceId: p.id,
            actorId: ctx.user.sub,
            actorRole: 'PATIENT',
            outcome: 'SUCCESS',
            sessionId: `discover:${ctx.user.sub}`,
            metadata: { operation: 'discover', matchType: 'patient' },
          })
          .catch(() => {})
        return { matchType: 'patient' as const, candidate: { ref, maskedName, birthYear } }
      }

      if (p && p.auth_user_id && p.auth_user_id !== ctx.user.sub) {
        await audit
          .emit({
            action: 'SECURITY_VIOLATION',
            resourceType: 'PATIENT',
            resourceId: p.id,
            actorId: ctx.user.sub,
            actorRole: 'PATIENT',
            outcome: 'DENIED',
            denialReason: 'phone record claimed by another user',
            sessionId: `discover:${ctx.user.sub}`,
            metadata: { operation: 'discover' },
          })
          .catch(() => {})
      }
      return { matchType: 'none' as const }
    }),

  /**
   * O3 Task 4: Claim an existing patient record post-OTP.
   * The caller must provide the opaque ref from discover + their phone (re-resolves match)
   * + a birth year factor. On success, sets auth_user_id on the patient row.
   */
  claim: protectedProcedure
    .input(
      z.object({
        ref: z.string().length(64),
        phone: z.string().min(7).max(20).regex(/^\+\d+$/),
        birthYear: z.number().int().gte(1900).lte(2100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { hmacKey } = getFieldEncryptionKeys()
      const audit = new AuditLogger(ctx.supabase)

      // Bind to the session's OTP-verified phone before resolving any patient by phone.
      await assertSessionPhone(ctx, input.phone, audit, 'claim')

      const { data: patient } = await ctx.supabase
        .from('patients')
        .select('id, birth_date, birth_year, auth_user_id')
        .eq('telecom_phone', input.phone)
        .maybeSingle()
      const p = patient as {
        id: string
        birth_date: string | null
        birth_year: number | null
        auth_user_id: string | null
      } | null

      // ref must re-derive from the caller's own phone-matched patient (prevents arbitrary-id claims)
      if (!p || generateBlindIndex(p.id, hmacKey) !== input.ref) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No matching record.' })
      }

      if (p.auth_user_id && p.auth_user_id !== ctx.user.sub) {
        await audit
          .emit({
            action: 'SECURITY_VIOLATION',
            resourceType: 'PATIENT',
            resourceId: p.id,
            actorId: ctx.user.sub,
            actorRole: 'PATIENT',
            outcome: 'DENIED',
            denialReason: 'already claimed',
            sessionId: `claim:${ctx.user.sub}`,
            metadata: { operation: 'claim' },
          })
          .catch(() => {})
        throw new TRPCError({ code: 'FORBIDDEN', message: 'This record cannot be claimed.' })
      }

      const recordYear = p.birth_year ?? (p.birth_date ? Number(p.birth_date.slice(0, 4)) : null)
      if (recordYear !== input.birthYear) {
        await audit
          .emit({
            action: 'UPDATE',
            resourceType: 'PATIENT',
            resourceId: p.id,
            actorId: ctx.user.sub,
            actorRole: 'PATIENT',
            outcome: 'DENIED',
            denialReason: 'birth year mismatch',
            sessionId: `claim:${ctx.user.sub}`,
            metadata: { operation: 'claim' },
          })
          .catch(() => {})
        throw new TRPCError({ code: 'FORBIDDEN', message: 'The details did not match.' })
      }

      const { error } = await ctx.supabase
        .from('patients')
        .update({ auth_user_id: ctx.user.sub })
        .eq('id', p.id)
      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not link your account.' })
      }

      try {
        await ctx.supabase.auth.admin.updateUserById(ctx.user.sub, {
          user_metadata: { role: 'PATIENT', patient_id: p.id },
        })
      } catch {
        /* non-fatal: link row is set */
      }

      await audit
        .emit({
          action: 'UPDATE',
          resourceType: 'PATIENT',
          resourceId: p.id,
          actorId: ctx.user.sub,
          actorRole: 'PATIENT',
          outcome: 'SUCCESS',
          sessionId: `claim:${ctx.user.sub}`,
          metadata: { operation: 'claim' },
        })
        .catch(() => {})

      return { ok: true as const }
    }),

  /**
   * O3 Task 5: Self-register from an authenticated session (no OTP verify step).
   * Mirrors register() minus OTP verify, sources userId from ctx.user.sub,
   * and persists auth_user_id, photoUrl, and address fields on the patient row.
   * MPI deduplication gates the creation (BLOCK → { blocked: true }, WARN → mpi_warn flag).
   */
  registerFromSession: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1).max(200).transform((s) => s.trim()),
        nameFather: z
          .string()
          .min(1)
          .max(200)
          .transform((s) => s.trim())
          .optional(),
        gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
        dateOfBirth: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine(isValidCalendarDate, 'invalid date'),
        preferredLanguage: z.enum(SUPPORTED_LOCALES),
        addressProvinceCurrent: z.string().max(100).optional(),
        addressDistrictCurrent: z.string().max(100).optional(),
        addressVillageCurrent: z.string().max(200).optional(),
        photoUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const encKey = process.env.FIELD_ENCRYPTION_KEY
      if (!encKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed.',
        })
      }

      const userId = ctx.user.sub
      const birthYear = Number(input.dateOfBirth.split('-')[0])

      const mpiCandidates = await fetchMpiCandidates(ctx.supabase, {
        nameGiven: input.firstName,
        nameFather: input.nameFather,
        birthYear,
      })

      const mpiResult = computeMpiResult(mpiCandidates, {
        nameGiven: input.firstName,
        nameFather: input.nameFather,
        birthYear,
        gender: input.gender,
      })

      if (mpiResult.decision === 'BLOCK') {
        return { blocked: true as const }
      }

      const mpiWarn = mpiResult.decision === 'WARN'
      const now = new Date().toISOString()
      const patientId = crypto.randomUUID()

      // db.toRow applies camelToSnake:
      //   authUserId → auth_user_id
      //   photoUrl → photo_url
      //   addressProvinceCurrent → address_province_current
      //   addressDistrictCurrent → address_district_current
      //   addressVillageCurrent → address_village_current
      const patientRow = db.toRow({
        id: patientId,
        nameLocal: input.firstName,
        nameLocalEnc: encryptField(input.firstName, encKey),
        nameFather: input.nameFather ?? null,
        gender: input.gender ?? null,
        birthDate: input.dateOfBirth,
        birthDateEnc: encryptField(input.dateOfBirth, encKey),
        birthYearOnly: false,
        isActive: true,
        patientTier: 'FREE',
        preferredLanguage: input.preferredLanguage,
        mpi_warn: mpiWarn,
        authUserId: userId,
        photoUrl: input.photoUrl ?? null,
        addressProvinceCurrent: input.addressProvinceCurrent ?? null,
        addressDistrictCurrent: input.addressDistrictCurrent ?? null,
        addressVillageCurrent: input.addressVillageCurrent ?? null,
        createdAt: now,
        updatedAt: now,
      })

      const consentRow = {
        consent_method: 'SELF_REGISTERED' as const,
        grantor_id: userId,
        grantor_role: 'PATIENT' as const,
      }

      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc('create_patient_with_consent', {
        p_patient: patientRow,
        p_consent: consentRow,
      })

      if (rpcError) {
        console.error('[PATIENT_REGISTRATION_SESSION] RPC failed:', { code: rpcError.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed.',
        })
      }

      const createdPatientId: string = (rpcData as Record<string, string>)?.['patientId'] ?? patientId

      try {
        await ctx.supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            role: 'PATIENT',
            patient_id: createdPatientId,
            preferred_language: input.preferredLanguage,
          },
        })
      } catch {
        /* link row already set via auth_user_id on patient row */
      }

      const audit = new AuditLogger(ctx.supabase)
      const auditEvent = {
        action: 'CREATE' as const,
        resourceType: 'PATIENT' as const,
        resourceId: createdPatientId,
        actorId: userId,
        actorRole: 'PATIENT' as const,
        outcome: 'SUCCESS' as const,
        sessionId: `self-reg:${createdPatientId}`,
        metadata: { operation: 'self-registration' },
      }
      try {
        await audit.emit(auditEvent)
      } catch {
        // Retry once before accepting failure
        try {
          await audit.emit(auditEvent)
        } catch {
          console.error('[AUDIT_FAILURE] dropped', { resourceId: createdPatientId })
        }
      }

      const { hmacKey } = getFieldEncryptionKeys()
      return { patientId: generateBlindIndex(createdPatientId, hmacKey) }
    }),
})
