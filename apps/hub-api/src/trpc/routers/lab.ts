import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, baseProcedure } from '../init'
import { labRestrictedProcedure } from '../rbac'
import { enforceLabActive } from '../middleware/enforceLabActive'
import { enforceLabRole } from '../middleware/enforceLabRole'
import { enforceEntitlement } from '../middleware/enforceEntitlement'
import { enforceVerifiedOrg } from '../middleware/enforceVerifiedOrg'
import { checkConsent } from '../middleware/enforceConsent'
import { db, selectExactCount } from '@/lib/supabase'
import { AuditLogger } from '@ultranos/audit-logger'
import { LabRole, LabPermission, UserRole, AuditAction, AuditOutcome } from '@ultranos/shared-types'
import { generateBlindIndex, encryptField } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from '@/lib/field-encryption'
import { scanFile } from '@/lib/virus-scanner'
import { analyzeFile } from '@/services/ocr'
import { compareHlc, deserializeHlc } from '@ultranos/sync-engine'
import { hlcTimestampSchema } from '@/lib/hlc-format'
import { monitoringPullEventsTotal } from '@/lib/clinical-safety-metrics'
import { buildNotificationContent } from '@/lib/notification-content'
import { signPhotoUrl, signPhotoUrls } from '@/lib/photo-urls'
import { normalizeNameComponent, computePhoneticTokens, computeMpiResult } from '@ultranos/mpi-engine'
import { signProceedToken, verifyProceedToken, consumeProceedToken } from '@/lib/mpi-proceed-token'
import { fetchMpiCandidates } from '@/lib/mpi-candidate-query'
// Story 56.4 (M-HUB-3): shared Redis rate limiter for lab.reportAuthEvent
// (replaces the former per-instance in-memory Map). Scoped to reportAuthEvent.
import { checkRateLimit } from '../middleware/rateLimit'

/**
 * Dispatch lab result notifications to the ordering doctor and patient.
 * Best-effort: notification failures never block the upload response.
 * AC: 1, 2 — dispatches to both doctor (CLINICIAN) and patient (PATIENT).
 *
 * Doctor lookup: resolved from service_requests.requester_id via orderId.
 * If orderId is absent or the lookup fails, the doctor notification is silently skipped.
 */
async function dispatchResultNotifications(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  opts: {
    patientRef: string
    payload: { testCategory: string; labName: string; uploadTimestamp: string; diagnosticReportId: string }
    actorId: string
    actorRole: `${UserRole}`
    sessionId: string
    orderId?: string
  },
) {
  const { patientRef, payload } = opts

  // Resolve the ordering doctor from the service_requests row.
  // Defensively skips if orderId is absent, or the query errors, or no requester_id found.
  let requesterId: string | null = null
  if (opts.orderId) {
    try {
      const { data: order } = await supabase
        .from('service_requests')
        .select('requester_id')
        .eq('id', opts.orderId)
        .maybeSingle()
      if (order?.requester_id) {
        requesterId = order.requester_id as string
      }
    } catch {
      // Best-effort — skip doctor notification if lookup fails
    }
  }

  const notifications: Array<{
    recipientRef: string
    recipientRole: string
    type: string
    payload: string
    status: string
    nextRetryAt: string
  }> = []

  const nextRetryAt = new Date(Date.now() + 60_000).toISOString() // 60s initial retry window

  const resultContent = buildNotificationContent('LAB_RESULT_AVAILABLE', payload)

  // Doctor notification (AC: 1)
  if (requesterId) {
    notifications.push(db.toRowRaw({
      recipientRef: requesterId,
      recipientRole: 'CLINICIAN',
      type: 'LAB_RESULT_AVAILABLE',
      payload: JSON.stringify(payload),
      status: 'QUEUED',
      nextRetryAt,
      sourceApp: resultContent.sourceApp,
      subjectKey: resultContent.subjectKey,
      bodyKey: resultContent.bodyKey,
      bodyParams: resultContent.bodyParams,
      notesKey: resultContent.notesKey,
    }, 'non-PHI: notifications'))
  }

  // Patient notification (AC: 2) — use patientRef as recipient
  notifications.push(db.toRowRaw({
    recipientRef: patientRef,
    recipientRole: 'PATIENT',
    type: 'LAB_RESULT_AVAILABLE',
    payload: JSON.stringify(payload),
    status: 'QUEUED',
    nextRetryAt,
    sourceApp: resultContent.sourceApp,
    subjectKey: resultContent.subjectKey,
    bodyKey: resultContent.bodyKey,
    bodyParams: resultContent.bodyParams,
    notesKey: resultContent.notesKey,
  }, 'non-PHI: notifications'))

  if (notifications.length > 0) {
    const { data: inserted } = await supabase
      .from('notifications')
      .insert(notifications)
      .select('id')

    // Audit notification dispatch
    if (inserted) {
      const audit = new AuditLogger(supabase)
      for (const n of inserted) {
        try {
          await audit.emit({
            action: 'CREATE',
            resourceType: 'NOTIFICATION',
            resourceId: n.id,
            actorId: opts.actorId,
            actorRole: opts.actorRole,
            outcome: 'SUCCESS',
            sessionId: opts.sessionId,
            metadata: {
              notificationAction: 'dispatched_on_upload',
              diagnosticReportId: payload.diagnosticReportId,
            },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'NOTIFICATION', resourceId: n.id })
        }
      }
    }
  }
}

/**
 * Rate-limit config for the unauthenticated reportAuthEvent endpoint.
 * Story 56.4 (M-HUB-3): the former per-instance in-memory Map (which also leaked
 * — it never evicted expired keys) is replaced by the shared Redis limiter so the
 * cap holds across all Hub instances. Keyed by hashed source IP.
 */
const AUTH_EVENT_RATE_LIMIT = { limit: 20, windowSec: 60 } as const

/**
 * Lab domain router.
 * Story 12.1: Lab Credentialing & Technician Authentication.
 * Handles lab registration submissions.
 *
 * NOTE: Lab registration is open to authenticated users (not role-restricted)
 * because the registering user becomes a LAB_TECH upon approval.
 * Lab-scoped upload endpoints (Story 12.3+) use labRestrictedProcedure instead.
 */
function toLabDirectoryEntry(row: Record<string, unknown>): import('@ultranos/shared-types').LabDirectoryEntry {
  return {
    id: row.id as string,
    name: row.lab_name as string,
    accreditationRef: (row.accreditation_ref as string) ?? undefined,
    status: row.status as string,
    updatedAt: (row.updated_at as string) ?? undefined,
  }
}

/**
 * Patient age for the data-minimized lab display. Prefers an exact DOB, then
 * falls back to the birth YEAR — year-only registration is the common case in
 * this context (many patients don't know an exact birth date), so requiring
 * birth_date would wrongly reject most real patients. Never exposes the DOB
 * itself. Returns null only when neither is known.
 */
function computeAge(
  birthDate: string | null | undefined,
  birthYear: number | null | undefined,
): number | null {
  if (birthDate) {
    const bd = new Date(birthDate)
    const today = new Date()
    let age = today.getFullYear() - bd.getFullYear()
    const m = today.getMonth() - bd.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--
    return age
  }
  if (birthYear != null) {
    return new Date().getFullYear() - birthYear
  }
  return null
}

/** Minimal Observation row shape used for latest-per-code vital extraction. */
type ObsRow = {
  code?: { coding?: Array<{ code?: string }> } | null
  value_quantity?: { value?: number } | null
  component?: Array<{
    code?: { coding?: Array<{ code?: string }> }
    value_quantity?: { value?: number }
  }> | null
  effective_date_time?: string | null
}

/**
 * Extract the latest basic vitals from a patient's Observation rows (passed
 * newest-first). LOINC: 29463-7 weight, 8302-2 height, 39156-5 BMI, 8310-5 temp,
 * 85354-9 BP (systolic 8480-6 / diastolic 8462-4 components). Returns nulls for
 * any vital not on record.
 */
function extractLatestVitals(rows: ObsRow[]) {
  const latest = (loinc: string) => rows.find((r) => r.code?.coding?.[0]?.code === loinc)
  const bp = latest('85354-9')
  const bpComp = (loinc: string) =>
    bp?.component?.find((c) => c.code?.coding?.[0]?.code === loinc)?.value_quantity?.value ?? null
  return {
    weightKg: latest('29463-7')?.value_quantity?.value ?? null,
    heightCm: latest('8302-2')?.value_quantity?.value ?? null,
    bmi: latest('39156-5')?.value_quantity?.value ?? null,
    temperatureC: latest('8310-5')?.value_quantity?.value ?? null,
    bpSystolic: bpComp('8480-6'),
    bpDiastolic: bpComp('8462-4'),
    recordedAt: rows[0]?.effective_date_time ?? null,
  }
}

/** Resolve the caller's practitioners.id (FK target for performer_id) from their
 *  lab_technicians row PK. ctx.lab.technicianId is the row PK, NOT practitioners.id;
 *  ctx.user.sub is the auth user id. Only practitioner_id is a valid practitioners FK. */
async function resolvePerformerId(
  supabase: { from: (t: string) => any },
  technicianRowId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('lab_technicians')
    .select('practitioner_id')
    .eq('id', technicianRowId)
    .single()
  if (error || !data?.practitioner_id) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Technician practitioner mapping not found' })
  }
  return data.practitioner_id as string
}

/**
 * Story 61.3 (M-HUB-7): resolve the caller's practitioners.id from their auth
 * user id (JWT sub). Self-service reads that filter practitioner columns
 * (mentorship pairings, certification progress) MUST match on practitioners.id,
 * NOT on ctx.user.sub (the auth id) — the two differ and matching on sub returns
 * nothing for every real practitioner. Returns null when the caller has no
 * practitioner profile (then the self-service read yields its empty result).
 */
async function resolveMyPractitionerId(
  supabase: { from: (t: string) => any },
  authUserId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('practitioners')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

const submitCodeSchema = z.object({
  coding: z.array(z.object({ system: z.string().optional(), code: z.string(), display: z.string().optional() })).optional(),
  text: z.string().optional(),
})
const submitObservationSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Observation'),
  status: z.enum(['preliminary', 'registered']),
  code: submitCodeSchema,
  subject: z.object({ reference: z.string() }).optional(),
  valueQuantity: z.object({ value: z.number(), unit: z.string().optional(), system: z.string().optional(), code: z.string().optional() }).optional(),
  valueString: z.string().optional(),
  interpretation: z.array(z.object({ coding: z.array(z.object({ system: z.string(), code: z.string(), display: z.string() })).optional() })).optional(),
  note: z.array(z.object({ text: z.string() })).optional(),
  _ultranos: z.object({
    isOfflineCreated: z.boolean().optional(),
    // Story 60.1: bundle HLC stamp on submitResult — staged format validation
    // (HLC_FORMAT_MODE, default log-only). Optional: legacy/online-created
    // observations may omit it, so only validate the format when present.
    hlcTimestamp: hlcTimestampSchema('lab.submitResult.observation').optional(),
    createdAt: z.string().optional(),
    templateVersion: z.string().optional(),
    referenceRange: z.object({ low: z.number().optional(), high: z.number().optional(), text: z.string().optional() }).optional(),
    effectiveDateTime: z.string().optional(),
  }).passthrough(),
  meta: z.object({ lastUpdated: z.string(), versionId: z.string() }),
})
const submitDiagnosticReportSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('DiagnosticReport'),
  status: z.enum(['preliminary', 'registered']),
  code: submitCodeSchema,
  subject: z.object({ reference: z.string().min(1) }),
  issued: z.string(),
  result: z.array(z.object({ reference: z.string() })).optional(),
  conclusion: z.string().optional(),
  _ultranos: z.object({}).passthrough(),
  meta: z.object({ lastUpdated: z.string(), versionId: z.string() }),
})

const submitSpecimenSchema = z.object({
  id: z.string().uuid(),
  labSampleId: z.string().min(1).max(64),
  pipelineStatus: z.enum(['received', 'in-processing', 'completed', 'reported', 'rejected']),
  fhirStatus: z.string().min(1).max(32),
  specimenType: z.string().max(64).optional(),
  subjectReference: z.string().min(1),          // Patient/<blindIndex>
  serviceRequestRef: z.string().optional(),     // ServiceRequest/<orderId>
  receivedFrom: z.string().max(128).optional(),
  receivedTime: z.string().optional(),
  condition: z.string().max(32).optional(),
  rejectionReason: z.string().max(256).optional(),
  note: z.string().max(2000).optional(),
  // Story 60.1: staged HLC-format validation (HLC_FORMAT_MODE, default log-only).
  hlcTimestamp: hlcTimestampSchema('lab.pushSpecimen'),
}).strict()   // .strict() = data-minimization: reject unknown fields (Rule #7)

// ── Story 59.1: lab-scoped registration & search schemas ───────────────────

/** Escape ILIKE wildcards + strip PostgREST filter metacharacters (mirrors patient.ts). */
function sanitizeIlikeValue(value: string): string {
  return value
    .replace(/[,.*()\\]/g, '')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

const currentYear = new Date().getFullYear()

const labRegisterConsentSchema = z.object({
  method: z.enum(['WRITTEN', 'VERBAL_WITNESSED']),
  witnessedBy: z.string().min(1).max(200).optional(),
  language: z.string().min(1).max(10),
  version: z.string().min(1).max(20),
}).strict()

/**
 * Lab registration input — a deliberate SUBSET of CreatePatientMpiInputSchema.
 * The lab captures minimal demographics + consent only; .strict() rejects any
 * field beyond this subset (Rule #7 — the lab never handles national IDs,
 * addresses, biometrics, or guardianship).
 */
const labRegisterPatientSchema = z.object({
  nameLocal: z.string().min(1).max(500),
  nameGiven: z.string().min(1).max(200).optional(),
  nameFather: z.string().min(1).max(200).optional(),
  nameGrandfather: z.string().min(1).max(200).optional(),
  gender: z.enum(['male', 'female', 'other', 'unknown']),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  birthYearOnly: z.boolean().default(false),
  birthYear: z.number().int().min(1900).max(currentYear).optional(),
  phone: z.string().max(50).optional(),
  consent: labRegisterConsentSchema,
  mpiProceedToken: z.string().optional(),
}).strict().superRefine((val, ctx) => {
  if (!val.birthDate && !val.birthYear) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthYear'], message: 'Either birthDate or birthYear is required' })
  }
  if (val.consent.method === 'VERBAL_WITNESSED' && !val.consent.witnessedBy) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['consent', 'witnessedBy'], message: 'witnessedBy is required for VERBAL_WITNESSED consent' })
  }
})

export const labRouter = createTRPCRouter({
  /**
   * Lab directory search for the OPD lab-order picker. Name-substring match over
   * ACTIVE labs only. Returns identity fields (no clinical data). Mirrors
   * pharmacy.search. Input `q` is sanitised before the ILIKE filter.
   */
  searchDirectory: protectedProcedure
    .input(z.object({ q: z.string().min(1).max(100), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const safeQ = input.q.replace(/[,()"]/g, ' ').trim().toLowerCase()
      if (!safeQ) return []
      const { data, error } = await ctx.supabase
        .from('labs')
        .select('id, lab_name, accreditation_ref, status, updated_at')
        .eq('status', 'ACTIVE')
        .ilike('lab_name', `%${safeQ}%`)
        .limit(input.limit)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return (data ?? []).map(toLabDirectoryEntry)
    }),

  /**
   * Incremental sync of the ACTIVE-lab directory for the OPD-Lite offline mirror.
   * Keyed on updated_at; returns the latest watermark. Mirrors pharmacy.sync.
   */
  syncDirectory: protectedProcedure
    .input(z.object({ since: z.string().optional(), limit: z.number().int().min(1).max(1000).default(500) }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('labs')
        .select('id, lab_name, accreditation_ref, status, updated_at')
        .eq('status', 'ACTIVE')
        .order('updated_at', { ascending: true })
        .limit(input.limit)
      if (input.since) query = query.gt('updated_at', input.since)
      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      const labs = (data ?? []).map(toLabDirectoryEntry)
      const latestUpdatedAt = labs.length ? labs[labs.length - 1]!.updatedAt ?? null : null
      return { labs, latestUpdatedAt }
    }),

  /**
   * AC 4, 5: Lab registration endpoint.
   * Accepts lab details and responsible technician credentials.
   * Stores lab with PENDING status until back-office verification.
   */
  register: protectedProcedure
    .input(
      z.object({
        labName: z.string().min(1).max(255),
        licenseRef: z.string().min(1).max(255),
        accreditationRef: z.string().max(255).optional(),
        technicianCredentialRef: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Story 61.3 (M-HUB-4 + M-HUB-7): the labs insert + lab_technicians insert
      // are now ONE transaction (previously two calls with a compensating delete
      // of the lab on technician-insert failure — a crash between them orphaned
      // the lab). The RPC also resolves the REAL practitioners.id from the auth
      // user id (auth_user_id), fixing the prior bug where ctx.user.sub (the auth
      // id) was written into lab_technicians.practitioner_id (a practitioners.id
      // FK) — which made the affiliation unfindable by labRestrictedProcedure
      // (rbac.ts joins practitioners.auth_user_id = ctx.user.sub).
      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc('register_lab_atomic', {
        p_auth_user_id: ctx.user.sub,
        p_lab_name: input.labName,
        p_license_ref: input.licenseRef,
        p_accreditation_ref: input.accreditationRef ?? null,
        p_credential_ref: input.technicianCredentialRef,
      })

      if (rpcError) {
        if (rpcError.code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Technician is already registered to a lab',
          })
        }
        if (rpcError.message?.includes('PRACTITIONER_NOT_FOUND')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'No practitioner profile found for this account',
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to register lab',
        })
      }

      const labId = (rpcData as Record<string, string> | null)?.['labId']
      if (!labId) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to register lab',
        })
      }

      // Audit event for lab registration
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'ORGANIZATION',
          resourceId: labId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { registrationAction: 'lab_registered' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'Organization', resourceId: labId })
      }

      return {
        success: true,
        labId: labId,
        status: 'PENDING',
      }
    }),

  /**
   * AC 7: Report authentication events for audit trail.
   * Called by lab-lite after login success, login failure, or MFA events.
   *
   * Uses baseProcedure (not protectedProcedure) because failed login attempts
   * won't have a valid JWT — the actorId is passed in the payload.
   * IP is hashed server-side for GDPR compliance.
   * Rate-limited to prevent audit log flooding.
   *
   * When actorId is provided, it is validated against the practitioners table.
   */
  reportAuthEvent: baseProcedure
    .input(
      z.object({
        event: z.enum(['LOGIN_SUCCESS', 'LOGIN_FAILURE', 'MFA_VERIFY_SUCCESS', 'MFA_VERIFY_FAILURE']),
        actorEmail: z.string().email().optional(),
        actorId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limit by IP hash — shared Redis limiter (Story 56.4 / M-HUB-3),
      // replacing the leaky per-instance in-memory Map. Fail-open (non-critical):
      // this endpoint protects against audit-trail FLOODING, not credential
      // brute-force, so a Redis blip must not deny legitimate best-effort auth-
      // event reporting — matching the prior in-memory limiter's behavior.
      const forwarded = ctx.headers.get('x-forwarded-for')
      const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown'
      const { createHash } = await import('crypto')
      const ipHash = createHash('sha256').update(ip).digest('hex')

      const rl = await checkRateLimit(
        { scope: 'ip', id: ipHash },
        'lab.reportAuthEvent',
        AUTH_EVENT_RATE_LIMIT,
        'authEvent',
      )
      if (!rl.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many auth event reports — try again later',
        })
      }

      // Validate actorId references a real practitioner when provided
      let validatedActorId = ctx.user?.sub
      if (input.actorId) {
        const { data: practitioner } = await ctx.supabase
          .from('practitioners')
          .select('id')
          .eq('id', input.actorId)
          .single()

        if (practitioner) {
          validatedActorId = input.actorId
        }
        // If invalid actorId, fall back to session user or omit
      }

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)

      const actionMap: Record<string, `${AuditAction}`> = {
        LOGIN_SUCCESS: 'LOGIN',
        LOGIN_FAILURE: 'LOGIN',
        MFA_VERIFY_SUCCESS: 'LOGIN',
        MFA_VERIFY_FAILURE: 'MFA_FAIL',
      }

      const outcomeMap: Record<string, `${AuditOutcome}`> = {
        LOGIN_SUCCESS: 'SUCCESS',
        LOGIN_FAILURE: 'FAILURE',
        MFA_VERIFY_SUCCESS: 'SUCCESS',
        MFA_VERIFY_FAILURE: 'FAILURE',
      }

      const sourceIpHash = ip !== 'unknown' ? ipHash : undefined

      try {
        await audit.emit({
          action: actionMap[input.event]!,
          resourceType: 'USER_ACCOUNT',
          resourceId: validatedActorId ?? 'anonymous',
          actorId: validatedActorId,
          actorRole: ctx.user?.role ?? 'LAB_TECH',
          outcome: outcomeMap[input.event]!,
          sessionId: ctx.user?.sessionId,
          sourceIpHash,
          metadata: {
            authEvent: input.event,
            ...(input.event.includes('FAILURE') && input.actorEmail
              ? { failedEmail: '[REDACTED]' }
              : {}),
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: actionMap[input.event], resourceType: 'USER_ACCOUNT', resourceId: 'auth-event' })
      }

      return { logged: true }
    }),

  /**
   * Story 12.2: Restricted Patient Verification.
   * Data-minimized patient lookup — returns ONLY firstName, age, and opaque patientRef.
   *
   * Defense in depth:
   * 1. SQL: SELECT only id, name_given, birth_date, birth_year
   * 2. Zod output schema: rejects any extra fields
   * 3. RBAC: LAB_TECH only (via labRestrictedProcedure)
   * 4. Lab status: must be ACTIVE (via enforceLabActive)
   */
  // MUTATION, not query (Story 58.2 / audit H-LAB-5): identity verification carries
  // a raw National ID. A tRPC .query() puts its input in the GET URL query string,
  // where the ID lands in server access logs, proxy logs, and browser history. As a
  // .mutation() the input travels in the POST request body instead — never in a URL.
  // The procedure is still read-only (no writes) despite the mutation verb.
  verifyPatient: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        query: z.string().min(1).max(200),
        method: z.enum(['NATIONAL_ID', 'QR_SCAN']),
      }),
    )
    .output(
      z.object({
        firstName: z.string(),
        age: z.number(),
        patientRef: z.string(),
        photoUrl: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

      // Resolve HMAC key once — wrapped to prevent env var name leaks
      let hmacKey: string
      try {
        hmacKey = getFieldEncryptionKeys().hmacKey
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption configuration unavailable',
        })
      }

      // Build query based on lookup method
      let patientQuery
      if (input.method === 'NATIONAL_ID') {
        // Use HMAC blind index for National ID lookup (same pattern as Story 7.3)
        const idHash = generateBlindIndex(input.query, hmacKey)
        patientQuery = ctx.supabase
          .from('patients')
          .select('id, name_given, birth_date, birth_year, photo_url')
          .eq('ultranos_national_id_hash', idHash)
          .single()
      } else {
        // QR_SCAN: validate UUID format before querying
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(input.query)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid patient identifier format',
          })
        }
        patientQuery = ctx.supabase
          .from('patients')
          .select('id, name_given, birth_date, birth_year, photo_url')
          .eq('id', input.query)
          .single()
      }

      const { data: patient, error } = await patientQuery

      if (error || !patient) {
        // Audit the failed lookup — no PHI in the audit event
        try {
          await audit.emit({
            action: 'READ',
            resourceType: 'PATIENT',
            resourceId: 'unknown',
            actorId: technicianId,
            actorRole: ctx.user.role,
            outcome: 'FAILURE',
            sessionId: ctx.user.sessionId,
            metadata: { lookupMethod: input.method, verificationAction: 'patient_verify' },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'PATIENT', resourceId: 'unknown' })
        }

        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        })
      }

      // Validate required fields before processing. DOB may be a year only
      // (common where an exact date is unknown), so accept either birth_date or
      // birth_year — requiring an exact date would reject most real patients.
      const age = computeAge(patient.birth_date, patient.birth_year)
      if (!patient.name_given || age == null) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Patient record incomplete — unable to verify',
        })
      }

      // Story 58.4 (H-HUB-7): CONSENT-GATED. This surface returns patient-derived PHI
      // (first name + age + photo). The lab never passes a real patient UUID as input
      // (Rule #7 — it only ever holds an opaque blind ref), so enforceConsentMiddleware
      // (which reads input.patientId/patientRef) cannot apply here; we check consent
      // in-body once the real patient.id is resolved — the SAME pattern used by the
      // lab-files / specimen-files route handlers. FULL_RECORD scope: identity
      // verification touches the whole demographic record. A withdrawn/expired consent
      // denies with a 403 FORBIDDEN (same shape as enforceConsentMiddleware) and is
      // audited with opaque IDs only (Rule #1, #6).
      const hasConsent = await checkConsent(ctx.supabase, {
        patientId: patient.id,
        resourceType: 'Patient',
      })
      if (!hasConsent) {
        try {
          await audit.emit({
            action: 'READ',
            resourceType: 'PATIENT',
            resourceId: 'patient-verify',
            actorId: technicianId,
            actorRole: ctx.user.role,
            outcome: 'FAILURE',
            sessionId: ctx.user.sessionId,
            metadata: { lookupMethod: input.method, verificationAction: 'patient_verify', denyReason: 'consent' },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'PATIENT', resourceId: 'patient-verify' })
        }
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — no active consent from patient for this data category',
        })
      }

      // Generate opaque patientRef via HMAC-SHA256 (never expose raw patient ID)
      const patientRef = generateBlindIndex(patient.id, hmacKey)

      // Audit successful verification — no PHI
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'PATIENT',
          resourceId: 'patient-verify',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { lookupMethod: input.method, verificationAction: 'patient_verify' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'PATIENT', resourceId: 'patient-verify' })
      }

      // Sign the STORED opaque photo key (patients.photo_url) server-side. The key is
      // random per-upload (audit C-SYS-4) so the signed URL exposes no patient UUID and
      // is non-correlating. Photo on this identity-verification surface is intentional
      // (confirm the right patient before drawing a sample) — see CLAUDE.md Rule #7.
      const photoUrl = await signPhotoUrl(ctx.supabase, 'patient-photos', patient.photo_url ?? null)

      return {
        firstName: patient.name_given,
        age,
        patientRef,
        photoUrl,
      }
    }),

  /**
   * Lab detail view — full name + blood group + latest basic vitals for the patient
   * behind a given order. ORDER-SCOPED: the lab passes an orderId it already holds,
   * and the Hub resolves order → patient_id server-side (the lab only ever holds the
   * opaque blind-index ref, so it cannot query patient data directly). Restricted to
   * orders the caller's lab may see.
   *
   * PHI scope (CLAUDE.md Rule #7, detail-view exception): returns full name
   * (given/father/grandfather), gender, blood group, and basic vitals ONLY — shown
   * on an explicit detail view for sample handling + identity verification. NEVER
   * returns the National ID (hash-only) or the raw patient UUID (blind-indexed by
   * design). Gender is in the sanctioned detail tier (Story 58.2) because lab
   * reference ranges are sex-specific.
   *
   * CLAIM-BEFORE-DETAILS (Story 58.2 / audit H-HUB-4): patient details unlock ONLY
   * for orders THIS lab has claimed (`received_by_lab_id === labId`). An unclaimed
   * (broadcast) order appears in `pullOrders` at the minimal list tier only; the lab
   * must acknowledge/claim it (`acknowledgeOrder`) before any detail-tier PHI is
   * readable. Previously any lab could read details for any unclaimed order.
   */
  getOrderPatientDetails: labRestrictedProcedure
    // Story 58.4 (M-HUB-14): unify the middleware stack — this detail-view read now
    // carries the same enforceVerifiedOrg + enforceEntitlement('LAB_LITE') guards its
    // sibling patient-data reads (verifyPatient, pullSpecimens, …) already apply.
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(z.object({ orderId: z.string().uuid() }))
    .output(
      z.object({
        fullName: z.object({
          given: z.string().nullable(),
          father: z.string().nullable(),
          grandfather: z.string().nullable(),
        }),
        gender: z.string().nullable(),
        bloodGroup: z.string().nullable(),
        photoUrl: z.string().nullable(),
        vitals: z.object({
          weightKg: z.number().nullable(),
          heightCm: z.number().nullable(),
          bmi: z.number().nullable(),
          temperatureC: z.number().nullable(),
          bpSystolic: z.number().nullable(),
          bpDiastolic: z.number().nullable(),
          recordedAt: z.string().nullable(),
        }),
      }),
    )
    .query(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const labId = ctx.lab?.labId
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

      // Resolve the order → patient_id. CLAIM-BEFORE-DETAILS (H-HUB-4): details
      // unlock ONLY for orders THIS lab has claimed. An unclaimed order
      // (received_by_lab_id IS NULL) is broadcast at the LIST tier via pullOrders,
      // but its patient details stay locked until the lab acknowledges/claims it.
      // Admin callers (no labId) are unrestricted.
      const { data: order, error: orderErr } = await ctx.supabase
        .from('service_requests')
        .select('id, patient_id, received_by_lab_id')
        .eq('id', input.orderId)
        .maybeSingle()
      if (orderErr) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load order' })
      }
      if (!order || (labId && order.received_by_lab_id !== labId)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' })
      }
      const patientId = order.patient_id as string

      // Story 58.4 (H-HUB-7): CONSENT-GATED. This detail view returns the highest lab
      // PHI tier (full name + blood group + vitals). The lab passes only an opaque
      // orderId; the real patient UUID is resolved server-side (Rule #7), so
      // enforceConsentMiddleware cannot apply — we check consent in-body once the
      // order→patient_id linkage is resolved (same pattern as the file route handlers).
      // FULL_RECORD scope: the detail view spans demographics + vitals. A withdrawn/
      // expired consent denies with 403 FORBIDDEN and is audited (opaque IDs only).
      const hasConsent = await checkConsent(ctx.supabase, {
        patientId,
        resourceType: 'Patient',
      })
      if (!hasConsent) {
        try {
          await audit.emit({
            action: 'READ',
            resourceType: 'PATIENT',
            resourceId: input.orderId,
            actorId: technicianId,
            actorRole: ctx.user.role,
            outcome: 'FAILURE',
            sessionId: ctx.user.sessionId,
            metadata: { verificationAction: 'order_patient_details', denyReason: 'consent' },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'PATIENT', resourceId: input.orderId })
        }
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — no active consent from patient for this data category',
        })
      }

      const { data: patient } = await ctx.supabase
        .from('patients')
        .select('name_given, name_father, name_grandfather, gender, blood_group, photo_url')
        .eq('id', patientId)
        .maybeSingle()

      const { data: obs } = await ctx.supabase
        .from('observations')
        .select('code, value_quantity, component, effective_date_time')
        .eq('subject_id', patientId)
        .order('effective_date_time', { ascending: false })
        .limit(50)

      const vitals = extractLatestVitals((obs ?? []) as ObsRow[])

      // Audit the PHI read (Rule #6). Metadata carries no PHI (opaque order id only).
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'PATIENT',
          resourceId: input.orderId,
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { verificationAction: 'order_patient_details' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'PATIENT', resourceId: input.orderId })
      }

      // Sign the STORED opaque photo key (patients.photo_url) server-side. The key is
      // random per-upload (audit C-SYS-4) so the signed URL carries no patient UUID and
      // cannot be correlated across orders — the lab only ever holds the blind-index ref.
      const photoUrl = await signPhotoUrl(ctx.supabase, 'patient-photos', patient?.photo_url ?? null)

      return {
        fullName: {
          given: (patient?.name_given as string) ?? null,
          father: (patient?.name_father as string) ?? null,
          grandfather: (patient?.name_grandfather as string) ?? null,
        },
        gender: (patient?.gender as string) ?? null,
        bloodGroup: (patient?.blood_group as string) ?? null,
        photoUrl,
        vitals,
      }
    }),

  /**
   * Story 12.3: Result Upload & Metadata Tagging.
   * Accepts a lab result file (base64) with metadata, creates a FHIR DiagnosticReport,
   * stores the file encrypted at rest, and performs virus scanning.
   *
   * AC: 7, 8, 9, 10, 11, 12
   */
  uploadResult: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        fileBase64: z.string().min(1),
        fileName: z.string().min(1).max(255),
        fileType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
        patientRef: z.string().min(1),
        loincCode: z.string().trim().min(1),
        loincDisplay: z.string().min(1),
        collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
          (date) => new Date(date) <= new Date(),
          { message: 'Collection date cannot be in the future' },
        ),
        diagnosticReportId: z.string().uuid().optional(),
        orderId: z.string().uuid().optional(),
        // Story 12.6: OCR metadata audit fields
        ocrMetadataVerified: z.boolean().optional(),
        ocrSuggestions: z
          .array(
            z.object({
              field: z.string(),
              value: z.string(),
              confidence: z.number(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub
      const labId = ctx.lab?.labId
      if (!labId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Lab affiliation required for upload',
        })
      }
      const performerId = await resolvePerformerId(ctx.supabase, ctx.lab!.technicianId)

      // Validate base64 and decode file
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
      if (!base64Regex.test(input.fileBase64)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid base64 file content',
        })
      }
      const fileBuffer = Buffer.from(input.fileBase64, 'base64')
      if (fileBuffer.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'File content is empty',
        })
      }

      const MAX_FILE_SIZE = 20 * 1024 * 1024
      if (fileBuffer.length > MAX_FILE_SIZE) {
        // Audit rejected upload
        await audit.emit({
          action: 'CREATE',
          resourceType: 'LAB_RESULT',
          resourceId: 'rejected',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'FAILURE',
          sessionId: ctx.user.sessionId,
          metadata: {
            uploadAction: 'result_upload_rejected',
            reason: 'file_too_large',
            loincCode: input.loincCode,
          },
        })

        throw new TRPCError({
          code: 'PAYLOAD_TOO_LARGE',
          message: 'File exceeds the 20 MB size limit',
        })
      }

      // Virus scan before any persistence
      const scanResult = await scanFile(fileBuffer)

      if (scanResult.status === 'infected') {
        // Audit rejected upload — malware detected
        await audit.emit({
          action: 'CREATE',
          resourceType: 'LAB_RESULT',
          resourceId: 'rejected',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'FAILURE',
          sessionId: ctx.user.sessionId,
          metadata: {
            uploadAction: 'result_upload_rejected',
            reason: 'malware_detected',
            fileHash: scanResult.hash,
            loincCode: input.loincCode,
          },
        })

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'File rejected: malware detected',
        })
      }

      if (scanResult.status === 'error') {
        // Audit scan error — reject upload
        await audit.emit({
          action: 'CREATE',
          resourceType: 'LAB_RESULT',
          resourceId: 'rejected',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'FAILURE',
          sessionId: ctx.user.sessionId,
          metadata: {
            uploadAction: 'result_upload_rejected',
            reason: 'scan_error',
            fileHash: scanResult.hash,
            loincCode: input.loincCode,
          },
        })

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Virus scan failed — upload rejected',
        })
      }

      // Determine virus scan status for the record
      const virusScanStatus = scanResult.status === 'clean' ? 'clean' : 'pending'

      // Get encryption keys
      let encryptionKey: string
      try {
        encryptionKey = getFieldEncryptionKeys().encryptionKey
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption configuration unavailable',
        })
      }

      // encryptField accepts strings; file content stays as base64 through encrypt/decrypt cycle.
      // Decryption yields base64 which must be decoded to recover the original binary.
      const encryptedContent = encryptField(input.fileBase64, encryptionKey)

      // R1 (join-key correctness): OPD reads diagnostic_reports by the BARE blind
      // index generateBlindIndex(realUuid) — patientBlindRef() strips the Patient/
      // prefix. pullOrders hands the lab `Patient/<blindIndex>`, so the stored
      // patient_ref must have the prefix stripped to match the OPD read path.
      // The prefixed ref is kept for the notification dispatch (mirrors submitResult).
      // .replace is idempotent — safe whether caller passes 'Patient/<idx>' or bare ref.
      const patientRefStored = input.patientRef.replace(/^Patient\//, '')

      // Create DiagnosticReport record
      // Story 12.6: Include OCR metadata for audit (AC 6)
      const reportInsert: Record<string, unknown> = {
        status: 'preliminary',
        loinc_code: input.loincCode,
        loinc_display: input.loincDisplay,
        patient_ref: patientRefStored,
        performer_id: performerId,
        lab_id: labId,
        issued: new Date().toISOString(),
        collection_date: input.collectionDate,
        virus_scan_status: virusScanStatus,
      }

      if (input.ocrMetadataVerified !== undefined) {
        reportInsert.ocr_metadata_verified = input.ocrMetadataVerified
      }
      if (input.ocrSuggestions) {
        reportInsert.ocr_suggestions = input.ocrSuggestions
      }

      // Upsert-or-attach: if caller supplies a diagnosticReportId, reuse an existing
      // report (or create it with that id on first call); otherwise create a new one.
      let reportId: string
      let reportCreatedThisCall = false
      if (input.diagnosticReportId) {
        const { data: existing, error: lookupError } = await ctx.supabase
          .from('diagnostic_reports')
          .select('id, lab_id')
          .eq('id', input.diagnosticReportId)
          .maybeSingle()
        if (lookupError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to look up diagnostic report',
          })
        }
        if (existing) {
          // SECURITY: enforce ownership — reject cross-lab access attempts
          if (existing.lab_id !== labId) {
            await audit.emit({
              action: 'CREATE',
              resourceType: 'LAB_RESULT',
              resourceId: 'rejected',
              actorId: technicianId,
              actorRole: ctx.user.role,
              outcome: 'DENIED',
              sessionId: ctx.user.sessionId,
              metadata: {
                uploadAction: 'result_upload_rejected',
                reason: 'cross_lab_report_access',
                loincCode: input.loincCode,
              },
            })
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Report belongs to another lab',
            })
          }
          // Same lab — reuse existing report (reportCreatedThisCall stays false)
        } else {
          const { error } = await ctx.supabase
            .from('diagnostic_reports')
            .insert({ ...reportInsert, id: input.diagnosticReportId })
          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to create diagnostic report',
            })
          }
          reportCreatedThisCall = true
        }
        reportId = input.diagnosticReportId
      } else {
        const { data: report, error: reportError } = await ctx.supabase
          .from('diagnostic_reports')
          .insert(reportInsert)
          .select('id')
          .single()

        if (reportError || !report) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create diagnostic report',
          })
        }
        reportId = report.id
        reportCreatedThisCall = true
      }

      // Store encrypted file
      const { error: fileError } = await ctx.supabase
        .from('lab_result_files')
        .insert({
          diagnostic_report_id: reportId,
          file_name: input.fileName,
          file_type: input.fileType,
          file_size: fileBuffer.length,
          encrypted_content: encryptedContent,
          file_hash: scanResult.hash,
        })

      if (fileError) {
        // Compensating delete: only remove the diagnostic report if WE created it this call.
        // Do not delete a shared/pre-existing report on a later file failure.
        const { error: deleteError } = reportCreatedThisCall
          ? await ctx.supabase.from('diagnostic_reports').delete().eq('id', reportId)
          : { error: null }

        if (deleteError) {
          // Orphaned report — emit audit event for ops visibility
          try {
            await audit.emit({
              action: 'CREATE',
              resourceType: 'LAB_RESULT',
              resourceId: reportId,
              actorId: technicianId,
              actorRole: ctx.user.role,
              outcome: 'FAILURE',
              sessionId: ctx.user.sessionId,
              metadata: {
                uploadAction: 'compensating_delete_failed',
                orphanedReportId: reportId,
              },
            })
          } catch {
            console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'LAB_RESULT', resourceId: reportId })
          }
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to store lab result file',
        })
      }

      // Audit successful upload (best-effort — data is already persisted)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'LAB_RESULT',
          resourceId: reportId,
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            uploadAction: 'result_uploaded',
            loincCode: input.loincCode,
            patientRef: input.patientRef,
            fileHash: scanResult.hash,
            virusScanStatus,
            labId,
          },
        })
      } catch {
        // Audit failure must not block a successful upload
      }

      // Resolve lab name for notification payload (best-effort)
      let labName = 'Laboratory'
      try {
        const { data: labRecord } = await ctx.supabase
          .from('labs')
          .select('name')
          .eq('id', labId)
          .single()
        if (labRecord?.name) labName = labRecord.name
      } catch {
        // Use default lab name
      }

      const notificationPayload = {
        testCategory: input.loincDisplay,
        labName,
        uploadTimestamp: new Date().toISOString(),
        diagnosticReportId: reportId,
        loincCode: input.loincCode,
      }

      // Dispatch notification to ordering doctor (best-effort, non-blocking).
      // Dedup: when diagnosticReportId is present the file attaches to a report owned by
      // submitResult — that call is responsible for the doctor notification, so we pass
      // orderId: undefined here to avoid a duplicate. When diagnosticReportId is absent
      // this is a standalone upload that owns its own report, so we pass orderId through.
      dispatchResultNotifications(ctx.supabase, {
        patientRef: input.patientRef,
        payload: notificationPayload,
        actorId: technicianId,
        actorRole: ctx.user.role,
        sessionId: ctx.user.sessionId,
        orderId: input.diagnosticReportId ? undefined : input.orderId,
      }).catch(() => {
        // Notification failures must not block a successful upload
      })

      return {
        success: true,
        reportId,
        status: 'preliminary',
        virusScanStatus,
      }
    }),

  submitResult: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(z.object({
      diagnosticReport: submitDiagnosticReportSchema,
      observations: z.array(submitObservationSchema),
      orderId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub
      const labId = ctx.lab?.labId
      if (!labId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Lab affiliation required' })
      }
      const performerId = await resolvePerformerId(ctx.supabase, ctx.lab!.technicianId)

      const dr = input.diagnosticReport
      const reportId = dr.id
      // R1 (join-key correctness): OPD reads diagnostic_reports by the BARE blind
      // index generateBlindIndex(realUuid) — patientBlindRef() strips the Patient/
      // prefix. pullOrders hands the lab `Patient/<blindIndex>`, so the stored
      // patient_ref must have the prefix stripped to match the OPD read path.
      // The prefixed ref is kept for the notification dispatch (mirrors uploadResult).
      const patientRef = dr.subject.reference
      const patientRefStored = patientRef.replace(/^Patient\//, '')
      const loincCode = dr.code.coding?.[0]?.code ?? dr.code.text ?? 'UNKNOWN'
      const loincDisplay = dr.code.coding?.[0]?.display ?? dr.code.text ?? loincCode
      const collectionDate = dr.issued.slice(0, 10)      // date-only (NOT NULL); result date as collection default

      // Ownership guard: if a report with this id exists, it must belong to this lab.
      const { data: existing, error: lookupError } = await ctx.supabase
        .from('diagnostic_reports')
        .select('id, lab_id')
        .eq('id', reportId)
        .maybeSingle()
      if (lookupError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to look up report' })
      }
      if (existing && existing.lab_id !== labId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Report belongs to another lab' })
      }

      // Upsert the report row (idempotent on id). Status is always 'preliminary'.
      const reportRow: Record<string, unknown> = {
        id: reportId,
        status: 'preliminary',
        loinc_code: loincCode,
        loinc_display: loincDisplay,
        patient_ref: patientRefStored,
        performer_id: performerId,
        lab_id: labId,
        issued: dr.issued,
        collection_date: collectionDate,
        virus_scan_status: 'clean',        // structured entry has no file to scan
      }
      if (dr.conclusion) reportRow.report_conclusion = encryptField(dr.conclusion, getFieldEncryptionKeys().encryptionKey)
      const { error: upsertError } = await ctx.supabase
        .from('diagnostic_reports')
        .upsert(reportRow, { onConflict: 'id' })
      if (upsertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to write diagnostic report' })
      }

      // Replace analytes atomically (Story 61.3 / M-HUB-4): the prior
      // delete-then-insert as two separate calls could lose a report's
      // observations permanently if a crash landed between them. The RPC does
      // DELETE + INSERT in ONE transaction, so an interrupted resubmit rolls
      // back to the prior set instead of leaving the report empty. Idempotent
      // re-delivery is preserved (the full authoritative set is passed each time;
      // an empty set clears the analytes, matching the previous behavior).
      const analyteRows = input.observations.map((o) => ({
        observation_id: o.id,
        loinc_code: o.code.coding?.[0]?.code ?? o.code.text ?? 'UNKNOWN',
        loinc_display: o.code.coding?.[0]?.display ?? o.code.text ?? null,
        value_quantity: o.valueQuantity ?? null,
        value_string: o.valueString ?? null,
        interpretation: o.interpretation ?? null,
        reference_range: (o._ultranos as { referenceRange?: unknown })?.referenceRange ?? null,
        note: o.note ?? null,
        effective_date_time: (o._ultranos as { effectiveDateTime?: string })?.effectiveDateTime ?? dr.issued,
      }))
      const { error: obsError } = await ctx.supabase.rpc('replace_report_observations', {
        p_report_id: reportId,
        p_observations: analyteRows,
      })
      if (obsError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to write analytes' })
      }

      // Audit the PHI write (Rule #6). Throw on failure — write is idempotent (upsert),
      // so the client can retry the whole op; re-upsert is a no-op and audit is re-attempted.
      try {
        await audit.emit({
          action: 'CREATE', resourceType: 'LAB_RESULT', resourceId: reportId,
          actorId: technicianId, actorRole: ctx.user.role, outcome: 'SUCCESS', sessionId: ctx.user.sessionId,
          metadata: { submitAction: 'structured_result_submitted', loincCode, observationCount: analyteRows.length, labId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'LAB_RESULT', resourceId: reportId })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Audit write failed' })
      }

      // Resolve lab name + dispatch notifications (reuses uploadResult's helper). Fire-and-forget.
      let labName = 'Laboratory'
      try {
        const { data: labRecord } = await ctx.supabase.from('labs').select('name').eq('id', labId).single()
        if (labRecord?.name) labName = labRecord.name
      } catch { /* default */ }
      dispatchResultNotifications(ctx.supabase, {
        patientRef,
        payload: { testCategory: loincDisplay, labName, uploadTimestamp: new Date().toISOString(), diagnosticReportId: reportId },
        actorId: technicianId, actorRole: ctx.user.role, sessionId: ctx.user.sessionId,
        orderId: input.orderId,
      }).catch(() => { /* notification failure must not block */ })

      return { diagnosticReportId: reportId, observationCount: analyteRows.length }
    }),

  /**
   * Ingests a collected specimen record from Lab-Lite into the specimens table.
   * Data-minimized: patient_ref stored as BARE blind index (no Patient/ prefix, no real UUID).
   * lab_id and performer_id are SERVER-STAMPED from ctx.lab — never trusted from client.
   * Newer-wins: skips the write when stored hlc_timestamp >= incoming (idempotent no-op).
   * Emits SPECIMEN audit event (Rule #6). note field encrypted at rest.
   */
  submitSpecimen: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(submitSpecimenSchema)
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const labId = ctx.lab?.labId
      if (!labId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Lab affiliation required' })
      }

      // Resolve practitioner_id — shared helper ensures performers.id FK is satisfied.
      const performerId = await resolvePerformerId(ctx.supabase, ctx.lab!.technicianId)

      // Ownership + newer-wins lookup.
      const { data: existing, error: lookupError } = await ctx.supabase
        .from('specimens')
        .select('id, lab_id, hlc_timestamp')
        .eq('id', input.id)
        .maybeSingle()
      if (lookupError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to look up specimen' })
      }
      if (existing && existing.lab_id !== labId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Specimen belongs to another lab' })
      }
      // Rule #6: audit must fire (and throw on failure) on EVERY success path — including
      // the newer-wins skip path. If a first call writes the row but audit fails and throws,
      // the client retries with the same hlc; the retry hits cmp<=0 and takes the skip path.
      // Without auditing the skip path, that audit would never land. The helper is scoped
      // inside the mutation so it closes over the resolved performerId (available here,
      // before the newer-wins check).
      const emitAuditOrThrow = async () => {
        try {
          await audit.emit({
            action: 'CREATE', resourceType: 'SPECIMEN', resourceId: input.id,
            actorId: performerId, actorRole: ctx.user.role, outcome: 'SUCCESS', sessionId: ctx.user.sessionId,
            metadata: { submitAction: 'specimen_synced', pipelineStatus: input.pipelineStatus, labId },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'SPECIMEN', resourceId: input.id })
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Audit write failed' })
        }
      }

      if (existing?.hlc_timestamp) {
        const cmp = compareHlc(deserializeHlc(input.hlcTimestamp), deserializeHlc(existing.hlc_timestamp as string))
        if (cmp <= 0) {
          // Stored state is newer-or-equal — idempotent no-op (prevents stale retries clobbering).
          // Audit must still fire so that if a prior call wrote the row but audit failed, the
          // retry (same hlc → skip path) lands the audit record.
          await emitAuditOrThrow()
          return { specimenId: input.id, pipelineStatus: input.pipelineStatus }
        }
      }

      const patientRefStored = input.subjectReference.replace(/^Patient\//, '')
      const serviceRequestId = input.serviceRequestRef?.replace(/^ServiceRequest\//, '') ?? null

      const specimenRow: Record<string, unknown> = {
        id: input.id,
        lab_sample_id: input.labSampleId,
        pipeline_status: input.pipelineStatus,
        fhir_status: input.fhirStatus,
        specimen_type: input.specimenType ?? null,
        patient_ref: patientRefStored,
        service_request_id: serviceRequestId,
        received_from: input.receivedFrom ?? null,
        received_time: input.receivedTime ?? null,
        condition: input.condition ?? null,
        rejection_reason: input.rejectionReason ?? null,
        note: input.note ? encryptField(input.note, getFieldEncryptionKeys().encryptionKey) : null,
        performer_id: performerId,
        lab_id: labId,
        hlc_timestamp: input.hlcTimestamp,
        updated_at: new Date().toISOString(),
      }

      const { error: upsertError } = await ctx.supabase
        .from('specimens')
        .upsert(specimenRow, { onConflict: 'id' })
      if (upsertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to write specimen' })
      }

      await emitAuditOrThrow()

      return { specimenId: input.id, pipelineStatus: input.pipelineStatus }
    }),

  /**
   * Pull active specimens for the caller's lab — used by lab-lite on login to
   * rehydrate the local samples table after PHI cleanup wipes it on session end.
   *
   * Data-minimized (Rule #7): returns only the fields needed for sample handling
   * and worklist display. note is encrypted and unneeded — never returned.
   * patient_ref is stored as a BARE blind index; we re-prefix it as Patient/<ref>
   * so the client can store it in the FHIR subject.reference format.
   *
   * Ownership scope: scoped to ctx.lab.labId — never leaks another lab's specimens.
   * Audit: emits SPECIMEN READ (Rule #6) with count metadata only (no PHI).
   */
  pullSpecimens: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .output(
      z.object({
        specimens: z.array(
          z.object({
            id: z.string(),
            labSampleId: z.string(),
            pipelineStatus: z.string(),
            fhirStatus: z.string(),
            specimenType: z.string().optional(),
            subjectReference: z.string(),          // Patient/<blindIndex> — re-prefixed from bare stored ref
            serviceRequestRef: z.string().optional(), // ServiceRequest/<id>
            receivedFrom: z.string().optional(),
            receivedTime: z.string().optional(),
            condition: z.string().optional(),
            hlcTimestamp: z.string(),
          }),
        ),
      }),
    )
    .query(async ({ ctx }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const labId = ctx.lab?.labId
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

      if (!labId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Lab affiliation required' })
      }

      const { data: rows, error } = await ctx.supabase
        .from('specimens')
        .select('id, lab_sample_id, pipeline_status, fhir_status, specimen_type, patient_ref, service_request_id, received_from, received_time, condition, hlc_timestamp')
        .eq('lab_id', labId)
        .in('pipeline_status', ['received', 'in-processing'])
        .order('received_time', { ascending: true })
        .limit(500)

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch specimens' })
      }

      const specimens = (rows ?? []).map((row: Record<string, unknown>) => {
        const serviceRequestId = row.service_request_id as string | null
        const receivedFrom = row.received_from as string | null
        const condition = row.condition as string | null
        const specimenType = row.specimen_type as string | null

        return {
          id: row.id as string,
          labSampleId: row.lab_sample_id as string,
          pipelineStatus: row.pipeline_status as string,
          fhirStatus: row.fhir_status as string,
          ...(specimenType != null ? { specimenType } : {}),
          // Re-prefix the bare blind index to match FHIR subject.reference format
          subjectReference: `Patient/${row.patient_ref as string}`,
          ...(serviceRequestId != null ? { serviceRequestRef: `ServiceRequest/${serviceRequestId}` } : {}),
          ...(receivedFrom != null ? { receivedFrom } : {}),
          ...(row.received_time != null ? { receivedTime: row.received_time as string } : {}),
          ...(condition != null ? { condition } : {}),
          hlcTimestamp: row.hlc_timestamp as string,
        }
      })

      // Audit the PHI read (Rule #6). No PHI in metadata — opaque labId + count only.
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'SPECIMEN',
          resourceId: labId,
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { specimenAction: 'pull_specimens', count: specimens.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'SPECIMEN', resourceId: labId })
      }

      return { specimens }
    }),

  /**
   * Story lab-attachments: Upload a specimen photo or document attachment.
   * Mirrors uploadResult guards: virus scan → encrypt → insert into specimen_files.
   * Emits PHI_WRITE audit with resourceType 'SPECIMEN'.
   */
  uploadSpecimenFile: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        fileBase64: z.string().min(1),
        fileName: z.string().min(1).max(255),
        fileType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
        specimenId: z.string().min(1),
        patientRef: z.string().min(1),
        attachmentContext: z.enum(['receipt', 'rejection']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub
      const labId = ctx.lab?.labId
      if (!labId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Lab affiliation required for upload',
        })
      }

      // Validate base64 and decode file
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
      if (!base64Regex.test(input.fileBase64)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid base64 file content',
        })
      }
      const fileBuffer = Buffer.from(input.fileBase64, 'base64')
      if (fileBuffer.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'File content is empty',
        })
      }

      const MAX_FILE_SIZE = 20 * 1024 * 1024
      if (fileBuffer.length > MAX_FILE_SIZE) {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'SPECIMEN',
          resourceId: 'rejected',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'FAILURE',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'specimen_file_upload',
            reason: 'file_too_large',
            specimenId: input.specimenId,
          },
        })

        throw new TRPCError({
          code: 'PAYLOAD_TOO_LARGE',
          message: 'File exceeds the 20 MB size limit',
        })
      }

      // Virus scan before any persistence
      const scanResult = await scanFile(fileBuffer)

      if (scanResult.status === 'infected') {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'SPECIMEN',
          resourceId: 'rejected',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'FAILURE',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'specimen_file_upload',
            reason: 'malware_detected',
            fileHash: scanResult.hash,
            specimenId: input.specimenId,
          },
        })

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'File rejected: malware detected',
        })
      }

      if (scanResult.status === 'error') {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'SPECIMEN',
          resourceId: 'rejected',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'FAILURE',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'specimen_file_upload',
            reason: 'scan_error',
            fileHash: scanResult.hash,
            specimenId: input.specimenId,
          },
        })

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Virus scan failed — upload rejected',
        })
      }

      const virusScanStatus = scanResult.status === 'clean' ? 'clean' : 'pending'

      // Get encryption key
      let encryptionKey: string
      try {
        encryptionKey = getFieldEncryptionKeys().encryptionKey
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption configuration unavailable',
        })
      }

      const encryptedContent = encryptField(input.fileBase64, encryptionKey)

      // Strip any FHIR Patient/ prefix — store bare ref for consistency with diagnostic_reports.patient_ref
      const specimenPatientRef = input.patientRef.replace(/^Patient\//, '')

      // Store encrypted specimen file
      const { data, error } = await ctx.supabase
        .from('specimen_files')
        .insert({
          specimen_id: input.specimenId,
          patient_ref: specimenPatientRef,
          lab_id: labId,
          file_name: input.fileName,
          file_type: input.fileType,
          file_size: fileBuffer.length,
          encrypted_content: encryptedContent,
          file_hash: scanResult.hash,
          virus_scan_status: virusScanStatus,
          attachment_context: input.attachmentContext,
        })
        .select('id')
        .single()

      if (error || !data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to store specimen file',
        })
      }

      // Audit successful upload (best-effort — data is already persisted)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'SPECIMEN',
          resourceId: data.id,
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'specimen_file_upload',
            specimenId: input.specimenId,
          },
        })
      } catch {
        // Audit failure must not block a successful upload
      }

      return { fileId: data.id }
    }),

  /**
   * Story 12.6: AI Metadata Extraction (OCR).
   * Analyzes a file using OCR and returns structured metadata suggestions
   * with confidence scores. Called before upload commit.
   *
   * AC: 1 (send file to OCR), 7 (graceful fallback), 8 (processing time)
   * PRIVACY: No PHI is logged. Only structured metadata is returned.
   */
  analyzeUpload: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        fileBase64: z.string().min(1).max(27_962_027), // ~20MB in base64
        fileType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

      const result = await analyzeFile(input.fileBase64, input.fileType)

      // Audit the OCR analysis — PHI file sent to external service (Safety Rule #6)
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'LAB_RESULT',
          resourceId: 'ocr-analysis',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: result.available ? 'SUCCESS' : 'FAILURE',
          sessionId: ctx.user.sessionId,
          metadata: {
            ocrAction: 'analyze_upload',
            provider: result.provider,
            available: result.available,
            suggestionsCount: result.suggestions.length,
            processingTimeMs: result.processingTimeMs,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'LAB_RESULT', resourceId: 'ocr-analysis' })
      }

      return {
        suggestions: result.suggestions,
        processingTimeMs: result.processingTimeMs,
        available: result.available,
        provider: result.provider,
      }
    }),

  /**
   * Story 42.1 AC 3: Get the caller's own lab role.
   * Used by Lab-Lite AuthGuard to populate the session store.
   *
   * Uses protectedProcedure (auth only) — any authenticated lab-lite user may call
   * this regardless of role. Returns null if no lab affiliation exists rather than
   * throwing 403, avoiding the chicken-and-egg problem of needing a role to fetch
   * your role.
   */
  getMyRole: protectedProcedure
    .query(async ({ ctx }) => {
      // Story 61.3 (M-HUB-7): lab_technicians.practitioner_id is a practitioners.id
      // FK, NOT the auth user id. Filtering by ctx.user.sub (the auth id) matched
      // nothing for every real technician. Resolve through the joined practitioner
      // on auth_user_id — the same contract labRestrictedProcedure uses (rbac.ts).
      const { data } = await ctx.supabase
        .from('lab_technicians')
        .select('lab_role, labs!inner(status), practitioners!inner(auth_user_id)')
        .eq('practitioners.auth_user_id', ctx.user.sub)
        .maybeSingle()

      if (!data) {
        return { labRole: null }
      }

      const lab = data.labs as unknown as { status: string }
      if (lab.status !== 'ACTIVE') {
        return { labRole: null }
      }

      return { labRole: (data.lab_role ?? null) as import('@ultranos/shared-types').LabRole | null }
    }),

  /**
   * Story 42.1 AC 1: List staff members in the caller's lab.
   * Gated by VIEW_STAFF permission (SUPERVISOR+).
   * Data minimization: returns only practitioner identity, not patient data.
   */
  listStaff: labRestrictedProcedure
    .use(enforceLabRole(LabPermission.VIEW_STAFF))
    .query(async ({ ctx }) => {
      const labId = ctx.lab?.labId
      if (!labId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Lab affiliation required',
        })
      }

      const { data: staff, error } = await ctx.supabase
        .from('lab_technicians')
        .select('practitioner_id, lab_role, created_at, practitioners!inner(id)')
        .eq('lab_id', labId)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch staff list',
        })
      }

      // Look up emails via targeted getUserById per practitioner (fixes listUsers() pagination bug — Story 55.1 AC #4)
      const practitionerIds = (staff ?? []).map((s: any) => s.practitioner_id)
      let emailMap: Record<string, string> = {}

      if (practitionerIds.length > 0) {
        const { data: practitioners } = await ctx.supabase
          .from('practitioners')
          .select('id, auth_user_id')
          .in('id', practitionerIds)

        if (practitioners && practitioners.length > 0) {
          const lookups = practitioners
            .filter((p: any) => p.auth_user_id)
            .map(async (p: any) => {
              const { data } = await ctx.supabase.auth.admin.getUserById(p.auth_user_id)
              if (data?.user?.email) {
                emailMap[p.id] = data.user.email
              }
            })
          await Promise.all(lookups)
        }
      }

      return (staff ?? []).map((s: any) => ({
        practitionerId: s.practitioner_id as string,
        email: emailMap[s.practitioner_id] ?? '',
        labRole: s.lab_role as LabRole,
        createdAt: s.created_at as string,
      }))
    }),

  /**
   * Story 42.1 AC 1, 5: Update a staff member's lab role.
   * Gated by MANAGE_STAFF_ROLES permission (LAB_MANAGER only).
   * Uses atomic RPC for last-manager protection (Story 55.1 fix).
   * Emits audit event on success.
   */
  updateStaffRole: labRestrictedProcedure
    .use(enforceLabRole(LabPermission.MANAGE_STAFF_ROLES))
    .input(
      z.object({
        targetPractitionerId: z.string().uuid(),
        newRole: z.nativeEnum(LabRole),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const labId = ctx.lab?.labId
      if (!labId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Lab affiliation required',
        })
      }

      // Use atomic RPC for transactional last-manager protection (fixes TOCTOU race)
      const { data, error } = await ctx.supabase.rpc('update_lab_role_atomic', {
        p_target_id: input.targetPractitionerId,
        p_lab_id: labId,
        p_new_role: input.newRole,
      })

      if (error) {
        if (error.message?.includes('Cannot demote the last Lab Manager')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cannot demote — only one Lab Manager remains in this lab',
          })
        }
        if (error.message?.includes('Staff member not found')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Staff member not found in your lab',
          })
        }
        if (error.message?.includes('Invalid lab role')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update staff role',
        })
      }

      const result = data as { success: boolean; previousRole: string; newRole: string; changed: boolean }

      // Emit audit event (AC 5) — use practitioner IDs only, never email
      if (result.changed) {
        const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
        try {
          await audit.emit({
            action: 'UPDATE',
            resourceType: 'PRACTITIONER',
            resourceId: input.targetPractitionerId,
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'SUCCESS',
            sessionId: ctx.user.sessionId,
            metadata: {
              previousRole: result.previousRole,
              newRole: input.newRole,
              labId,
            },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', {
            action: 'UPDATE',
            resourceType: 'PRACTITIONER',
            resourceId: input.targetPractitionerId,
          })
        }
      }

      return { success: true, previousRole: result.previousRole, newRole: result.newRole }
    }),

  /**
   * Story 42.2 AC 1, 5: Pull pending test orders for this lab.
   * Data minimization enforced: returns ONLY first name + age (CLAUDE.md Rule #7).
   * Never returns reasonCode, supportingInfo, encounter, or clinical context.
   * Supports incremental sync via `since` parameter.
   */
  pullOrders: labRestrictedProcedure
    // Story 58.4 (M-HUB-14): unify the middleware stack — this patient-data pull now
    // carries the same enforceVerifiedOrg + enforceEntitlement('LAB_LITE') guards its
    // sibling reads apply. (Per-patient consent is enforced on the order-scoped detail
    // surface getOrderPatientDetails, not on this minimal name+age list tier — see the
    // Story 58.4 matrix in CLAUDE.md for the bulk-list rationale.)
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        // `offset: true` accepts the +00:00-style timestamps Postgres returns for
        // meta_last_updated (the client feeds them straight back as the watermark).
        // Plain .datetime() is Z-only and 400s on them, breaking incremental sync.
        since: z.string().datetime({ offset: true }).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    // Rule #7 defense-in-depth: strict output schema enforces the data-minimized
    // order shape at the API layer (name + age only for the patient; opaque
    // patientRef). specialInstructions is an intentional lab-handling field
    // (e.g. "Fasting required") — see order-data-minimization.test.ts.
    .output(
      z.object({
        orders: z.array(
          z.object({
            orderId: z.string(),
            patientFirstName: z.string(),
            patientAge: z.number().nullable(),
            // Rule #7 (revised 2026-09-24): photo + demographics are now permitted on
            // the lab list tier. Photo is a signed URL over the OPAQUE storage key
            // (never the patient UUID); gender/phone are plain demographics.
            patientPhotoUrl: z.string().nullable(),
            patientGender: z.string().nullable(),
            patientPhone: z.string().nullable(),
            patientRef: z.string(),
            testsRequested: z.array(z.object({ loincCode: z.string(), loincDisplay: z.string() })),
            urgency: z.string(),
            orderingPhysicianName: z.string(),
            specialInstructions: z.string().nullable(),
            status: z.string(),
            authoredOn: z.string().nullable(),
            // True when this order is claimed by the caller's lab (received_by_lab_id
            // === labId); false = unassigned/available. Operational routing flag, no PHI.
            assignedToLab: z.boolean(),
          }),
        ),
        syncTimestamp: z.string().nullable(),
        nextCursor: z.string().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const labId = ctx.lab?.labId
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

      // Build query: active orders scoped to this lab (or unassigned)
      let query = ctx.supabase
        .from('service_requests')
        .select(`
          id,
          status,
          priority,
          code_code,
          code_display,
          patient_id,
          requester_id,
          authored_on,
          special_instructions,
          meta_last_updated,
          received_by_lab_id,
          patients!inner(id, name_given, birth_date, birth_year, photo_url, gender, telecom_phone),
          practitioners!service_requests_requester_id_fkey(id, given_name, family_name)
        `)
        .in('status', ['active', 'on-hold'])
        // Ascending keyset order for stable cursor pagination (mirrors patient.list).
        .order('meta_last_updated', { ascending: true })
        .order('id', { ascending: true })
        .limit(input.limit)

      // Scope to this lab (received by this lab, or unassigned)
      if (labId) {
        query = query.or(`received_by_lab_id.eq.${labId},received_by_lab_id.is.null`)
      }

      // Incremental sync: only orders updated since the given timestamp
      if (input.since) {
        query = query.gte('meta_last_updated', input.since)
      }

      // Keyset cursor: advance past the last page. Combined with a full sync
      // (no `since`), the client pages through EVERY active order — so the
      // tombstone-cleanup step never wrongly cancels orders beyond a single page.
      if (input.cursor) {
        query = query.gt('meta_last_updated', input.cursor)
      }

      const { data: orders, error } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch orders',
        })
      }

      // Audit-log the order pull as a PHI access event (Safety Rule #6)
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'SERVICE_REQUEST',
          resourceId: 'order-pull',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            orderAction: 'pull_orders',
            orderCount: (orders ?? []).length,
            labId: labId ?? 'admin',
            since: input.since ?? null,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'ServiceRequest', resourceId: 'order-pull' })
      }

      // P4: Use blind index for patientRef — never expose raw patient UUID
      const { hmacKey } = await getFieldEncryptionKeys()

      // Rule #7 (revised 2026-09-24): the list tier now returns photo + demographics.
      // Batch-sign the OPAQUE photo keys server-side (the lab receives a signed URL,
      // never the raw key/path) so a photo URL still cannot correlate the patient UUID
      // (audit C-SYS-4, Story 58.1). Raw National ID + real patient UUID remain hidden.
      const photoUrlMap = await signPhotoUrls(
        ctx.supabase,
        'patient-photos',
        (orders ?? []).map((o: any) => o.patients?.photo_url as string | null),
      )

      const mapped = (orders ?? []).map((order: any) => {
        const patient = order.patients
        const practitioner = order.practitioners

        // P8: Age from DOB, falling back to birth year — never expose the DOB.
        const patientAge = computeAge(patient?.birth_date, patient?.birth_year)

        return {
          orderId: order.id,
          patientFirstName: patient?.name_given ?? '',
          patientAge,
          patientPhotoUrl: patient?.photo_url ? (photoUrlMap[patient.photo_url] ?? null) : null,
          patientGender: patient?.gender ?? null,
          patientPhone: patient?.telecom_phone ?? null,
          // Matching key: the blind index is derived from the order's own
          // patient_id (a NOT NULL FK), NOT the demographics join — so the
          // order↔patient linkage never depends on the join succeeding, and the
          // ref stays consistent with diagnostic_reports.patient_ref.
          patientRef: order.patient_id
            ? `Patient/${generateBlindIndex(order.patient_id, hmacKey)}`
            : '',
          testsRequested: [{
            loincCode: order.code_code,
            loincDisplay: order.code_display ?? order.code_code,
          }],
          urgency: order.priority ?? 'routine',
          orderingPhysicianName: practitioner
            ? `${practitioner.given_name ?? ''} ${practitioner.family_name ?? ''}`.trim()
            : 'Unknown',
          specialInstructions: order.special_instructions ?? null,
          status: order.status,
          authoredOn: order.authored_on,
          // Claimed by this lab vs. unassigned/available (the pull scope already
          // limits rows to received_by_lab_id === labId OR null).
          assignedToLab: order.received_by_lab_id != null && order.received_by_lab_id === labId,
        }
      })

      // P11: Return max server timestamp for accurate incremental sync
      const rows = orders ?? []
      const maxServerTs = rows.reduce(
        (max: string, o: any) => (o.meta_last_updated > max ? o.meta_last_updated : max),
        '',
      )

      // A full page implies more may remain — hand back a cursor so the client
      // keeps paging until it's null.
      const nextCursor =
        rows.length === input.limit ? (rows[rows.length - 1] as any).meta_last_updated as string : null

      return { orders: mapped, syncTimestamp: maxServerTs || null, nextCursor }
    }),

  /**
   * Pull data-minimized dispense-monitoring events for Therapeutic Drug
   * Monitoring (TDM).
   *
   * SCOPING (Story 58.2 / audit H-HUB-3): events are lab-scoped — a lab only sees
   * monitoring events for patients it already handles, i.e. patients with at least
   * one order this lab has claimed (`service_requests.received_by_lab_id = labId`).
   * This reuses the existing order-claim relationship as the assignment model (no
   * new schema): a lab that has never touched a patient never sees that patient's
   * dispense events. Admin callers (no labId) see the full feed.
   *
   * DATA-MIN (audit C-LAB-1): medication identity (ATC / drug display) is stripped
   * server-side. The hub resolves the medication→required-tests mapping and delivers
   * ONLY the LOINC test(s) the lab must run + the due window. Payload = first name +
   * age + opaque blind ref + required monitoring test(s) + timestamps. Raw patient
   * UUID is never returned (Rule #7).
   *
   * Keyset cursor on `seq` (ascending bigint identity column) for stable pagination.
   * Audit emitted best-effort (Rule #6). No PHI in audit metadata (Rule #1).
   */
  pullDispenseMonitoringEvents: labRestrictedProcedure
    // Story 58.4 (M-HUB-14): unify the middleware stack — same enforceVerifiedOrg +
    // enforceEntitlement('LAB_LITE') guards as sibling patient-data pulls. (This is a
    // data-minimized multi-patient TDM feed already scoped to patients this lab
    // handles; per-patient consent gating on the bulk feed is out of scope for this
    // localized change — see the Story 58.4 matrix in CLAUDE.md.)
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        since: z.string().datetime({ offset: true }).optional(),
        cursor: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .output(
      z.object({
        events: z.array(
          z.object({
            dispensingEventId: z.string(),
            patientRef: z.string(),
            patientFirstName: z.string(),
            patientAge: z.number().nullable(),
            // Required monitoring test(s), resolved server-side — NO medication
            // identity (atcCode / medicationDisplay) crosses to the lab (C-LAB-1).
            requirements: z.array(
              z.object({
                loincCode: z.string(),
                testDisplay: z.string(),
                initialDelayDays: z.number(),
                frequencyDays: z.number(),
                priority: z.enum(['routine', 'urgent']),
              }),
            ),
            dispensedAt: z.string(),
            orderingPractitionerRef: z.string(),
            hlcTimestamp: z.string(),
          }),
        ),
        nextCursor: z.number().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const labId = ctx.lab?.labId
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

      // Lab scoping (H-HUB-3): resolve the set of patients this lab handles from
      // the orders it has claimed. A non-admin lab with no claimed orders sees no
      // monitoring events. Admin (no labId) is unscoped.
      let scopedPatientIds: string[] | null = null
      if (labId) {
        const { data: claimedOrders, error: scopeErr } = await ctx.supabase
          .from('service_requests')
          .select('patient_id')
          .eq('received_by_lab_id', labId)
        if (scopeErr) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to resolve monitoring scope',
          })
        }
        scopedPatientIds = Array.from(
          new Set((claimedOrders ?? []).map((o: any) => o.patient_id).filter(Boolean)),
        ) as string[]
        // No patients handled by this lab → empty feed, no query needed.
        if (scopedPatientIds.length === 0) {
          return { events: [], nextCursor: null }
        }
      }

      let query = ctx.supabase
        .from('dispense_monitoring_events')
        .select(
          'id, seq, dispensing_event_id, patient_id, atc_code, dispensed_at, ordering_practitioner_ref, hlc_timestamp, created_at, patients!inner(name_given, birth_date, birth_year)',
        )
        .order('seq', { ascending: true })
        .limit(input.limit)

      if (scopedPatientIds) query = query.in('patient_id', scopedPatientIds)
      if (input.since) query = query.gte('created_at', input.since)
      if (input.cursor != null) query = query.gt('seq', input.cursor)

      const { data: rows, error } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch monitoring events',
        })
      }

      // Audit PHI access — best-effort, never block the response (Rule #6).
      // Metadata contains no PHI — only counts and opaque IDs (Rule #1).
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'DISPENSE_MONITORING_EVENT',
          resourceId: 'monitoring-pull',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            eventCount: (rows ?? []).length,
            labId: labId ?? 'admin',
            since: input.since ?? null,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'DISPENSE_MONITORING_EVENT' })
      }

      // Data-minimized projection — never include patient_id / raw uuid (Rule #7).
      // patientRef is an opaque blind index: "Patient/<HMAC(patient_id, hmacKey)>".
      const { hmacKey } = await getFieldEncryptionKeys()

      // Resolve medication→required-tests mappings server-side (C-LAB-1). The ATC
      // code is used ONLY as the internal join key here; it is NEVER placed on the
      // outgoing DTO. Only the resolved LOINC test(s) + due window reach the lab.
      const atcCodes = Array.from(
        new Set((rows ?? []).map((r: any) => r.atc_code).filter(Boolean)),
      ) as string[]
      const requirementsByAtc = new Map<
        string,
        Array<{
          loincCode: string
          testDisplay: string
          initialDelayDays: number
          frequencyDays: number
          priority: 'routine' | 'urgent'
        }>
      >()
      if (atcCodes.length) {
        const { data: mappings } = await ctx.supabase
          .from('medication_lab_mappings')
          .select('atc_code, required_tests')
          .in('atc_code', atcCodes)
        for (const m of mappings ?? []) {
          const specs = Array.isArray((m as any).required_tests) ? (m as any).required_tests : []
          requirementsByAtc.set(
            (m as any).atc_code,
            specs.map((s: any) => ({
              loincCode: s.loincCode,
              testDisplay: s.testDisplay,
              initialDelayDays: s.initialDelayDays ?? 0,
              frequencyDays: s.frequencyDays ?? 0,
              priority: s.priority === 'urgent' ? 'urgent' : 'routine',
            })),
          )
        }
      }

      const events = (rows ?? []).map((r: any) => ({
        dispensingEventId: r.dispensing_event_id,
        patientRef: `Patient/${generateBlindIndex(r.patient_id, hmacKey)}`,
        patientFirstName: r.patients?.name_given ?? '',
        patientAge: computeAge(r.patients?.birth_date, r.patients?.birth_year),
        // Only the resolved monitoring requirement(s) — medication identity stripped.
        requirements: requirementsByAtc.get(r.atc_code) ?? [],
        dispensedAt: r.dispensed_at,
        orderingPractitionerRef: r.ordering_practitioner_ref ?? '',
        hlcTimestamp: r.hlc_timestamp,
      }))

      monitoringPullEventsTotal.inc((rows ?? []).length)

      const last = (rows ?? [])[(rows ?? []).length - 1] as any
      const nextCursor: number | null =
        (rows ?? []).length === input.limit && last ? (last.seq as number) : null

      return { events, nextCursor }
    }),

  /**
   * Task 6: Pull medication→lab monitoring mappings for offline override refresh.
   * Non-PHI reference data, standard RBAC guard (labRestrictedProcedure + enforceLabActive).
   * Supports incremental sync via optional sinceVersion parameter.
   * Returns snake_case DB columns mapped to camelCase DTO.
   */
  pullMonitoringMappings: labRestrictedProcedure
    .use(enforceLabActive())
    .input(z.object({ sinceVersion: z.number().int().nonnegative().optional() }))
    .output(z.object({ mappings: z.array(z.object({
      atcCode: z.string(), medicationDisplay: z.string(), version: z.number(),
      requiredTests: z.array(z.object({ loincCode: z.string(), testDisplay: z.string(), frequencyDays: z.number(), initialDelayDays: z.number(), priority: z.enum(['routine', 'urgent']) })),
    })) }))
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase.from('medication_lab_mappings').select('atc_code, medication_display, required_tests, version')
      if (input.sinceVersion != null) q = q.gt('version', input.sinceVersion)
      const { data, error } = await q
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch monitoring mappings' })
      return { mappings: (data ?? []).map((m: any) => ({ atcCode: m.atc_code, medicationDisplay: m.medication_display, version: m.version, requiredTests: m.required_tests })) }
    }),

  /**
   * Story 42.2 AC 2, 3: Acknowledge an order as RECEIVED by this lab.
   * Updates the ServiceRequest status and dispatches a notification
   * to the ordering physician so the status change is visible in OPD-Lite.
   */
  acknowledgeOrder: labRestrictedProcedure
    .use(enforceLabActive())
    .input(
      z.object({
        orderId: z.string().uuid(),
        status: z.literal('RECEIVED'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const labId = ctx.lab?.labId
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub
      const now = new Date().toISOString()

      // Fetch the order to verify it exists and get requester for notification
      const { data: order, error: fetchError } = await ctx.supabase
        .from('service_requests')
        .select('id, requester_id, code_display, status')
        .eq('id', input.orderId)
        .single()

      if (fetchError || !order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Order not found',
        })
      }

      // Status guard: only active/on-hold orders can be acknowledged
      if (!['active', 'on-hold'].includes(order.status)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Order cannot be acknowledged — current status: ${order.status}`,
        })
      }

      // Conditional update: only claim if not already claimed by another lab
      const { error: updateError, count } = await selectExactCount(
        ctx.supabase
          .from('service_requests')
          .update({
            status: 'on-hold',
            received_at: now,
            received_by_lab_id: labId ?? null,
            received_by_tech_id: technicianId,
            meta_last_updated: now,
          })
          .eq('id', input.orderId)
          .or(`received_by_lab_id.is.null${labId ? `,received_by_lab_id.eq.${labId}` : ''}`),
      )

      if (count === 0 && !updateError) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Order has already been claimed by another lab',
        })
      }

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to acknowledge order',
        })
      }

      // Dispatch notification to the ordering physician (AC 3)
      // Reuses Story 17.4 notification dispatch pattern
      if (order.requester_id) {
        const nextRetryAt = new Date(Date.now() + 60_000).toISOString()
        try {
          const orderPayload = {
            orderId: input.orderId,
            testCategory: order.code_display ?? 'Lab Test',
            acknowledgedAt: now,
          }
          const orderContent = buildNotificationContent('ORDER_RECEIVED', orderPayload)
          const { data: inserted } = await ctx.supabase
            .from('notifications')
            .insert({
              recipient_ref: order.requester_id,
              recipient_role: 'CLINICIAN',
              type: 'ORDER_RECEIVED',
              payload: JSON.stringify(orderPayload),
              status: 'QUEUED',
              next_retry_at: nextRetryAt,
              source_app: orderContent.sourceApp,
              subject_key: orderContent.subjectKey,
              body_key: orderContent.bodyKey,
              body_params: orderContent.bodyParams,
              notes_key: orderContent.notesKey,
            })
            .select('id')
            .single()

          if (inserted) {
            try {
              await audit.emit({
                action: 'CREATE',
                resourceType: 'NOTIFICATION',
                resourceId: inserted.id,
                actorId: technicianId,
                actorRole: ctx.user.role,
                outcome: 'SUCCESS',
                sessionId: ctx.user.sessionId,
                metadata: {
                  notificationAction: 'dispatched_on_order_ack',
                  orderId: input.orderId,
                },
              })
            } catch {
              console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'NOTIFICATION', resourceId: inserted.id })
            }
          }
        } catch {
          // Notification dispatch is best-effort — ack still succeeds
        }
      }

      // Audit-log the acknowledgement (Safety Rule #6)
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'SERVICE_REQUEST',
          resourceId: input.orderId,
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            orderAction: 'order_acknowledged',
            labId: labId ?? 'admin',
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'ServiceRequest', resourceId: input.orderId })
      }

      return { success: true, receivedAt: now }
    }),

  // ================================================================
  // Story 55.4: Mentorship Pairing — Lab-Lite read-only endpoint
  // ================================================================

  /**
   * AC #6: Returns the active mentorship pairing for the current authenticated user.
   * Data minimization: partner's first name only.
   * Emits READ audit event.
   */
  getMyMentorship: labRestrictedProcedure
    .query(async ({ ctx }) => {
      // Story 61.3 (M-HUB-7): mentorship_pairings.{mentor,mentee}_practitioner_id
      // are practitioners.id FKs — resolve from the auth user id, not ctx.user.sub.
      const practitionerId = await resolveMyPractitionerId(ctx.supabase, ctx.user.sub)
      if (!practitionerId) {
        return null
      }

      // Find active pairing where user is mentor or mentee
      const { data: pairing, error } = await ctx.supabase
        .from('mentorship_pairings')
        .select(`
          id, mentor_practitioner_id, mentee_practitioner_id, goals, start_date, lab_id,
          mentor:practitioners!mentorship_pairings_mentor_practitioner_id_fkey(given_name),
          mentee:practitioners!mentorship_pairings_mentee_practitioner_id_fkey(given_name),
          labs!mentorship_pairings_lab_id_fkey(lab_name)
        `)
        .eq('status', 'ACTIVE')
        .or(`mentor_practitioner_id.eq.${practitionerId},mentee_practitioner_id.eq.${practitionerId}`)
        .maybeSingle()

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch mentorship pairing',
        })
      }

      // Emit audit event (AC #6 — READ)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'MENTORSHIP',
          resourceId: pairing?.id ?? 'none',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'MENTORSHIP' })
      }

      if (!pairing) {
        return null
      }

      const isMentor = pairing.mentor_practitioner_id === practitionerId
      const partner = isMentor
        ? (pairing.mentee as any)
        : (pairing.mentor as any)
      const lab = pairing.labs as any

      // Fetch check-ins for this pairing
      const { data: checkins } = await ctx.supabase
        .from('mentorship_checkins')
        .select('month, status')
        .eq('pairing_id', pairing.id)
        .order('month', { ascending: false })

      return {
        role: isMentor ? 'MENTOR' as const : 'MENTEE' as const,
        partnerName: partner?.given_name ?? 'Unknown',
        labName: lab?.lab_name ?? 'Unknown',
        goals: pairing.goals,
        startDate: pairing.start_date,
        checkins: (checkins ?? []).map((c: any) => ({
          month: c.month as string,
          status: c.status as string,
        })),
      }
    }),

  // ================================================================
  // Story 55.5: Certification — Lab-Lite read-only endpoint
  // ================================================================

  /**
   * Task 8 / AC #7: Returns the caller's own certification progress.
   * Read-only — no mutations exposed to lab users.
   * Emits CERTIFICATION_PROGRESS_VIEWED audit event.
   */
  getMyCertifications: labRestrictedProcedure
    .query(async ({ ctx }) => {
      // Story 61.3 (M-HUB-7): certification_progress.practitioner_id is a
      // practitioners.id FK — resolve from the auth user id, not ctx.user.sub.
      // A caller with no practitioner profile has no progress: short-circuit to
      // the same empty shape the prior (never-matching) query produced.
      const practitionerId = await resolveMyPractitionerId(ctx.supabase, ctx.user.sub)
      if (!practitionerId) {
        return { pathways: [] }
      }

      // Fetch all progress records for this practitioner
      const { data: rows, error } = await ctx.supabase
        .from('certification_progress')
        .select(`
          id, pathway_id, milestone_index, status, evidence_ref,
          reviewer_note, approved_at, submitted_at, created_at,
          certification_pathways!inner(id, name, milestones, status)
        `)
        .eq('practitioner_id', practitionerId)
        .order('pathway_id')
        .order('milestone_index', { ascending: true })

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch certifications',
        })
      }

      // Emit audit event (AC #7 — data access tracking)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'CERTIFICATION_PROGRESS_VIEWED',
          resourceType: 'CERTIFICATION_PROGRESS',
          resourceId: practitionerId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CERTIFICATION_PROGRESS_VIEWED' })
      }

      // Group by pathway
      const pathwayMap = new Map<string, {
        pathwayId: string
        pathwayName: string
        milestones: Array<{
          milestoneIndex: number
          title: string
          type: string
          requiredCount: number
          status: string
          submittedAt: string | null
          approvedAt: string | null
        }>
      }>()

      for (const row of (rows ?? []) as any[]) {
        const pathway = row.certification_pathways
        const pathwayMilestones = Array.isArray(pathway?.milestones) ? pathway.milestones : []
        const detail = pathwayMilestones[row.milestone_index] ?? { title: 'Unknown', type: 'UNKNOWN', required_count: 1 }

        if (!pathwayMap.has(row.pathway_id)) {
          pathwayMap.set(row.pathway_id, {
            pathwayId: row.pathway_id,
            pathwayName: pathway?.name ?? 'Unknown',
            milestones: [],
          })
        }

        pathwayMap.get(row.pathway_id)!.milestones.push({
          milestoneIndex: row.milestone_index,
          title: detail.title,
          type: detail.type,
          requiredCount: detail.required_count,
          status: row.status,
          submittedAt: row.submitted_at,
          approvedAt: row.approved_at,
        })
      }

      const pathways = Array.from(pathwayMap.values()).map((p) => ({
        ...p,
        completionPct: p.milestones.length > 0
          ? Math.round((p.milestones.filter((m) => m.status === 'APPROVED').length / p.milestones.length) * 100)
          : 0,
      }))

      return { pathways }
    }),

  // ================================================================
  // Employee Health — Emergency Vaccination Status (Story 55.3)
  // ================================================================

  /**
   * Emergency access: returns ONLY vaccination status fields for a practitioner.
   * Data minimization: no titer dates, dose counts, TB results, or exposure history.
   */
  getEmergencyVaccinationStatus: labRestrictedProcedure
    .use(enforceLabRole(LabPermission.VIEW_STAFF))
    .input(z.object({ practitionerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify target practitioner belongs to the same lab as the caller
      if (ctx.lab) {
        const { data: targetTech } = await ctx.supabase
          .from('lab_technicians')
          .select('lab_id')
          .eq('practitioner_id', input.practitionerId)
          .single()

        if (!targetTech || targetTech.lab_id !== ctx.lab.labId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Target practitioner is not in your lab',
          })
        }
      }

      // Data minimization: SELECT only the three vaccination status columns
      const { data, error } = await ctx.supabase
        .from('employee_health_records')
        .select('hep_b_status, tetanus_status, covid_status')
        .eq('practitioner_id', input.practitionerId)
        .single()

      // P1+D2: audit after error check with accurate outcome.
      // Best-effort for emergency endpoint — audit failure must not block access during incidents.
      try {
        const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
        await audit.emit({
          action: 'READ',
          resourceType: 'EMPLOYEE_HEALTH',
          resourceId: input.practitionerId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          // A not-found lookup is recorded as a FAILURE outcome (AuditOutcome has no
          // NOT_FOUND member); the not-found detail lives in the audit record context.
          outcome: error || !data ? 'FAILURE' : 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { accessType: 'EMERGENCY', scope: 'VACCINATION_STATUS_ONLY' },
        })
      } catch {
        console.error('[emergency-vaccination] audit emit failed for practitioner', input.practitionerId)
      }

      if (error || !data) {
        return null
      }

      return {
        hepBStatus: data.hep_b_status as string,
        tetanusStatus: data.tetanus_status as string,
        covidStatus: data.covid_status as string,
      }
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // Story 59.1 — Lab-scoped registration, search & orphaned-endpoint repair
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Data-minimized patient search for the lab registration flow (Rule #7 list
   * tier): returns ONLY firstName + age + the opaque blind-index ref per match.
   * The real patient UUID is NEVER returned — the ref is `Patient/<HMAC blind
   * index>`, consistent with pullOrders / verifyPatient.
   */
  searchPatients: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(z.object({ query: z.string().min(2).max(200) }).strict())
    .output(
      z.object({
        patients: z.array(
          z.object({
            ref: z.string(),
            firstName: z.string(),
            age: z.number().nullable(),
            // Rule #7 (revised 2026-09-24): photo (opaque-key signed URL) + demographics.
            photoUrl: z.string().nullable(),
            gender: z.string().nullable(),
            phone: z.string().nullable(),
          }).strict(),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

      let hmacKey: string
      try {
        hmacKey = getFieldEncryptionKeys().hmacKey
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Encryption configuration unavailable' })
      }

      const safeQ = sanitizeIlikeValue(input.query.trim())
      if (!safeQ) return { patients: [] }

      const { data: rows, error } = await ctx.supabase
        .from('patients')
        .select('id, name_given, name_local, birth_date, birth_year, photo_url, gender, telecom_phone')
        .or(`name_given.ilike.%${safeQ}%,name_local.ilike.%${safeQ}%`)
        .eq('is_active', true)
        .limit(10)
      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Patient search failed' })
      }

      // Rule #7 (revised): sign the OPAQUE photo keys server-side (lab never holds the
      // raw key/UUID). Batch one request for the page.
      const photoUrlMap = await signPhotoUrls(
        ctx.supabase,
        'patient-photos',
        (rows ?? []).map((r) => (r.photo_url as string | null) ?? null),
      )

      // Audit the PHI read (Rule #6). No PHI in metadata — never log the query text.
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'lab-patient-search',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'lab_patient_search', resultCount: rows?.length ?? 0 },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PATIENT', resourceId: 'lab-patient-search' })
      }

      return {
        patients: (rows ?? []).map((row) => ({
          ref: `Patient/${generateBlindIndex(row.id as string, hmacKey)}`,
          firstName: (row.name_given as string) ?? (row.name_local as string) ?? '',
          age: computeAge(row.birth_date as string | null, row.birth_year as number | null),
          photoUrl: row.photo_url ? (photoUrlMap[row.photo_url as string] ?? null) : null,
          gender: (row.gender as string | null) ?? null,
          phone: (row.telecom_phone as string | null) ?? null,
        })),
      }
    }),

  /**
   * Lab-scoped MPI duplicate check (wraps the patient.checkDuplicates engine).
   * Rule-#7 tier compliance: candidates return ONLY firstName + age + the opaque
   * blind-index ref + score — never the real patient UUID, father name, gender,
   * or district (which the clinician-facing patient.checkDuplicates does return).
   */
  checkDuplicates: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        nameGiven: z.string().min(1).max(200).optional(),
        nameFather: z.string().min(1).max(200).optional(),
        nameGrandfather: z.string().min(1).max(200).optional(),
        gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
        birthYear: z.number().int().min(1900).max(currentYear).optional(),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        phone: z.string().max(50).optional(),
      }).strict().refine((val) => val.nameGiven || val.nameFather, {
        message: 'At least one name field is required',
      }),
    )
    .output(
      z.object({
        decision: z.enum(['ALLOW', 'WARN', 'BLOCK']),
        proceedToken: z.string().optional(),
        candidates: z.array(
          z.object({
            ref: z.string(),
            firstName: z.string().nullable(),
            age: z.number().nullable(),
            mpiScore: z.number(),
          }).strict(),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

      let hmacKey: string
      try {
        hmacKey = getFieldEncryptionKeys().hmacKey
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Encryption configuration unavailable' })
      }

      const birthYear = input.birthYear
        ?? (input.birthDate ? parseInt(input.birthDate.slice(0, 4), 10) : undefined)

      const candidates = await fetchMpiCandidates(ctx.supabase, {
        nameGiven: input.nameGiven,
        nameFather: input.nameFather,
        birthYear,
        phone: input.phone,
      })

      const mpiResult = computeMpiResult(candidates, {
        nameGiven: input.nameGiven,
        nameFather: input.nameFather,
        nameGrandfather: input.nameGrandfather,
        birthYear,
        gender: input.gender,
        phone: input.phone,
      })

      // Issue a proceedToken on WARN so the technician can pass it to registerPatient
      let proceedToken: string | undefined
      if (mpiResult.decision === 'WARN') {
        proceedToken = await signProceedToken({
          candidateIds: mpiResult.candidates.map((c) => c.candidate.id),
          maxScore: mpiResult.topScore,
          issuedTo: ctx.user.sub,
        })
      }

      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'lab-mpi-check',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'lab_mpi_check', decision: mpiResult.decision, topScore: mpiResult.topScore },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PATIENT', resourceId: 'lab-mpi-check' })
      }

      return {
        decision: mpiResult.decision,
        proceedToken,
        candidates: mpiResult.candidates.map((c) => ({
          ref: `Patient/${generateBlindIndex(c.candidate.id, hmacKey)}`,
          firstName: c.candidate.nameGiven ?? null,
          age: c.candidate.birthYear != null ? currentYear - c.candidate.birthYear : null,
          mpiScore: c.score,
        })),
      }
    }),

  /**
   * Lab-scoped patient registration (wraps the patient.create MPI + atomic-RPC
   * flow with a minimal input subset). Rule-#7 tier compliance: the response
   * returns the opaque blind-index ref — NEVER the real patient UUID. The full
   * demographics reach the Hub; the lab retains only what its local store needs.
   */
  registerPatient: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(labRegisterPatientSchema)
    .output(z.object({ ref: z.string(), mpiWarn: z.boolean() }).strict())
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

      let hmacKey: string
      try {
        hmacKey = getFieldEncryptionKeys().hmacKey
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Encryption configuration unavailable' })
      }

      const now = new Date().toISOString()
      const patientId = crypto.randomUUID()

      const nameGiven = input.nameGiven ?? null
      const nameFather = input.nameFather ?? null
      const nameGrandfather = input.nameGrandfather ?? null

      const phoneticGiven       = nameGiven       ? computePhoneticTokens(normalizeNameComponent(nameGiven))       : []
      const phoneticFather      = nameFather      ? computePhoneticTokens(normalizeNameComponent(nameFather))      : []
      const phoneticGrandfather = nameGrandfather ? computePhoneticTokens(normalizeNameComponent(nameGrandfather)) : []

      // MPI candidate retrieval and scoring (same engine as patient.create)
      const candidates = await fetchMpiCandidates(ctx.supabase, {
        nameGiven: nameGiven ?? undefined,
        nameFather: nameFather ?? undefined,
        birthYear: input.birthYear,
        phone: input.phone,
      })
      const mpiResult = computeMpiResult(candidates, {
        nameGiven: nameGiven ?? undefined,
        nameFather: nameFather ?? undefined,
        nameGrandfather: nameGrandfather ?? undefined,
        birthYear: input.birthYear,
        gender: input.gender,
        phone: input.phone,
      })

      let mpiWarn = false
      let consumeJti: string | null = null

      // Mirrors patient.create: BLOCK treated as WARN until MPI scoring is
      // production-ready — both require a proceedToken to continue.
      if (mpiResult.decision === 'BLOCK' || mpiResult.decision === 'WARN') {
        if (!input.mpiProceedToken) {
          const proceedToken = await signProceedToken({
            candidateIds: mpiResult.candidates.map((c) => c.candidate.id),
            maxScore: mpiResult.topScore,
            issuedTo: ctx.user.sub,
          })
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Possible duplicate detected. Include mpiProceedToken to confirm creation.',
            cause: { proceedToken, topScore: mpiResult.topScore },
          })
        }
        try {
          const tokenPayload = await verifyProceedToken(input.mpiProceedToken)
          if (tokenPayload.issuedTo !== ctx.user.sub) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Proceed token was not issued to the current user.' })
          }
          consumeJti = tokenPayload.jti
        } catch (err) {
          if (err instanceof TRPCError) throw err
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Proceed token is invalid, expired, or already used.' })
        }
        mpiWarn = true
      }

      const birthYear = input.birthYear
        ?? (input.birthDate ? parseInt(input.birthDate.slice(0, 4), 10) : null)

      const row = db.toRow({
        id: patientId,
        nameLocal:        input.nameLocal,
        nameLocalEnc:     input.nameLocal,
        name_given:           nameGiven,
        name_father:          nameFather,
        name_grandfather:     nameGrandfather,
        name_given_enc:       nameGiven ?? null,
        name_father_enc:      nameFather ?? null,
        name_grandfather_enc: nameGrandfather ?? null,
        name_phonetic_given:       phoneticGiven,
        name_phonetic_father:      phoneticFather,
        name_phonetic_grandfather: phoneticGrandfather,
        gender:          input.gender,
        birth_date:      input.birthDate ?? null,
        birth_date_enc:  input.birthDate ?? null,
        birth_year:      birthYear,
        birth_year_only: input.birthYearOnly ?? false,
        telecom_phone:   input.phone ?? null,
        mpi_warn:  mpiWarn,
        mpi_score: mpiResult.topScore,
        is_active:    true,
        patient_tier: 'FREE',
        created_by:   ctx.user.sub,
        created_at:   now,
        updated_at:   now,
        emergency_contacts: JSON.stringify([]),
      })

      const consentRow = {
        consent_method:   input.consent.method,
        witnessed_by:     input.consent.witnessedBy ?? null,
        consent_language: input.consent.language,
        consent_version:  input.consent.version,
        grantor_id:       ctx.user.sub,
        grantor_role:     'SELF',
      }

      // Consume proceedToken before insert (same replay-window rationale as patient.create)
      if (consumeJti) {
        await consumeProceedToken(consumeJti)
      }

      // Atomic insert via the same RPC patient.create uses
      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc(
        'create_patient_with_consent',
        { p_patient: row, p_consent: consentRow },
      )
      if (rpcError || !rpcData) {
        console.error('[LAB_REGISTER_PATIENT] RPC error:', { code: rpcError?.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to register patient' })
      }

      const confirmedPatientId: string =
        ((rpcData as Record<string, unknown>)['patientId'] as string) ?? patientId

      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: confirmedPatientId,
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'lab_register_patient',
            mpiDecision: mpiResult.decision,
            mpiScore: mpiResult.topScore,
            consentMethod: input.consent.method,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: confirmedPatientId })
      }

      // Rule #7: the lab NEVER receives the real patient UUID — return the
      // blind-index ref (prefixed, consistent with pullOrders/search).
      return {
        ref: `Patient/${generateBlindIndex(confirmedPatientId, hmacKey)}`,
        mpiWarn,
      }
    }),

  /**
   * Story 59.1 (repairs H-LAB-4 / C-SYS-5): technician quality-profile sync.
   * Upserts the caller's professional-development record (streaks, monthly
   * metrics, earned badges — no PHI) into technician_quality_profiles.
   * technician identity is SERVER-STAMPED from ctx.lab — the client-claimed
   * technicianId is accepted for wire-compat but never trusted.
   */
  syncQualityProfile: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        technicianId: z.string().min(1).max(100),
        streaks: z.array(
          z.object({
            streakType: z.string().min(1).max(100),
            currentStreak: z.number().int().min(0),
            longestStreak: z.number().int().min(0),
            updatedAt: z.string().max(64),
          }).strict(),
        ).max(50),
        metrics: z.array(
          z.object({
            metricType: z.string().min(1).max(100),
            period: z.string().min(1).max(50),
            value: z.number(),
            unit: z.string().max(50),
            trend: z.string().max(50),
          }).strict(),
        ).max(200),
        earnedBadges: z.array(
          z.object({
            badgeId: z.string().min(1).max(100),
            earnedAt: z.string().max(64),
          }).strict(),
        ).max(200),
      }).strict(),
    )
    .output(z.object({ recorded: z.boolean() }).strict())
    .mutation(async ({ ctx, input }) => {
      const technicianRowId = ctx.lab?.technicianId
      if (!technicianRowId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Lab affiliation required' })
      }

      // Merge earned badges with any previously synced set (append-only union by badgeId).
      const { data: existing } = await ctx.supabase
        .from('technician_quality_profiles')
        .select('earned_badges')
        .eq('technician_id', technicianRowId)
        .maybeSingle()

      const badgeMap = new Map<string, { badgeId: string; earnedAt: string }>()
      const existingBadges = (existing?.earned_badges ?? []) as Array<{ badgeId: string; earnedAt: string }>
      for (const b of existingBadges) {
        if (b?.badgeId) badgeMap.set(b.badgeId, b)
      }
      for (const b of input.earnedBadges) badgeMap.set(b.badgeId, b)

      const { error: upsertError } = await ctx.supabase
        .from('technician_quality_profiles')
        .upsert(
          {
            technician_id: technicianRowId,
            streaks: input.streaks,
            metrics: input.metrics,
            earned_badges: Array.from(badgeMap.values()),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'technician_id' },
        )
      if (upsertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to record quality profile' })
      }

      // Audit (non-PHI professional development record; Rule #6 discipline kept anyway)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'PRACTITIONER',
          resourceId: technicianRowId,
          actorId: technicianRowId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'quality_profile_sync',
            streakCount: input.streaks.length,
            metricCount: input.metrics.length,
            badgeCount: input.earnedBadges.length,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'PRACTITIONER', resourceId: technicianRowId })
      }

      return { recorded: true }
    }),

  /**
   * Story 59.1 (repairs C-SYS-5): result authorization sign-off sync.
   * Transitions the diagnostic report status on the Hub to mirror the lab's
   * offline authorization decision:
   *   APPROVE / AUTO_VERIFY → 'final';  REJECT → 'cancelled';  HOLD → no change.
   * Tier-2 conflict handling: a second APPROVE on an already-final report
   * returns CONFLICT (HTTP 409) — the client records it as a conflict and both
   * authorization records are preserved in the audit trail.
   * Actor identity is SERVER-STAMPED from ctx — client-claimed actorId/actorRole
   * are accepted for wire-compat but recorded only as claimed metadata.
   */
  authorizeResult: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        resultId: z.string().uuid(),
        action: z.enum(['APPROVE', 'REJECT', 'HOLD', 'AUTO_VERIFY']),
        timestamp: z.string().min(1).max(128),
        comments: z.string().max(2000).optional(),
        criticalValueAcknowledged: z.boolean().optional(),
        autoVerifyCriteria: z.object({
          noAbnormalFlags: z.boolean(),
          qcPassing: z.boolean(),
          roleEligible: z.boolean(),
          noCriticalValues: z.boolean(),
        }).strict().optional(),
        actorId: z.string().max(100).optional(),
        actorRole: z.string().max(50).optional(),
      }).strict(),
    )
    .output(z.object({ status: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub
      const labId = ctx.lab?.labId
      if (!labId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Lab affiliation required' })
      }

      const { data: report, error: lookupError } = await ctx.supabase
        .from('diagnostic_reports')
        .select('id, status, lab_id')
        .eq('id', input.resultId)
        .maybeSingle()
      if (lookupError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to look up report' })
      }
      if (!report) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' })
      }
      if (report.lab_id !== labId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Report belongs to another lab' })
      }

      const isRelease = input.action === 'APPROVE' || input.action === 'AUTO_VERIFY'
      let newStatus = report.status as string

      if (isRelease || input.action === 'REJECT') {
        if (report.status === 'final') {
          // Tier-2 conflict: already authorized (e.g. by another supervisor offline).
          // Record the duplicate attempt in the audit trail, then 409 so the
          // client counts it as a conflict (both records kept as addenda).
          try {
            await audit.emit({
              action: 'UPDATE',
              resourceType: 'LAB_RESULT',
              resourceId: input.resultId,
              actorId: technicianId,
              actorRole: ctx.user.role,
              outcome: 'FAILURE',
              sessionId: ctx.user.sessionId,
              metadata: {
                authorizationAction: input.action,
                conflict: 'already_final',
                claimedHlcTimestamp: input.timestamp,
              },
            })
          } catch {
            console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'LAB_RESULT', resourceId: input.resultId })
          }
          throw new TRPCError({ code: 'CONFLICT', message: 'Report already authorized' })
        }
        newStatus = isRelease ? 'final' : 'cancelled'
        const { error: updateError } = await ctx.supabase
          .from('diagnostic_reports')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', input.resultId)
        if (updateError) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update report status' })
        }
      }
      // HOLD: no status transition on the Hub — recorded in the audit trail only.

      // Audit the authorization (Rule #6). Free-text comments are NEVER placed in
      // audit metadata (Rule #1) — only their presence is recorded.
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'LAB_RESULT',
          resourceId: input.resultId,
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            authorizationAction: input.action,
            newStatus,
            hasComments: Boolean(input.comments),
            criticalValueAcknowledged: input.criticalValueAcknowledged ?? false,
            claimedActorId: input.actorId ?? null,
            claimedHlcTimestamp: input.timestamp,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'LAB_RESULT', resourceId: input.resultId })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Audit write failed' })
      }

      return { status: newStatus }
    }),

  /**
   * Story 59.1 (repairs C-SYS-5): result-release notification dispatch.
   * Called by the lab on result release (online path) and by the offline
   * notification drain. Inserts a LAB_RESULT_AVAILABLE notification for the
   * patient via the same notifications-table pattern as uploadResult/submitResult.
   * The ordering doctor is notified by submitResult's own dispatch (which holds
   * the orderId); this endpoint carries no order linkage so it targets the
   * patient record only. Payload is data-minimized — no result values.
   */
  createNotification: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        type: z.literal('LAB_RESULT_AVAILABLE'),
        payload: z.object({
          testCategory: z.string().min(1).max(200),
          loincCode: z.string().min(1).max(50),
          diagnosticReportId: z.string().uuid(),
          resultStatus: z.literal('FINAL'),
          labName: z.string().min(1).max(200),
          guidanceContentIds: z.array(z.string().max(100)).max(20).optional(),
        }).strict(),
      }).strict(),
    )
    .output(z.object({ notificationId: z.string().nullable() }).strict())
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub
      const labId = ctx.lab?.labId
      if (!labId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Lab affiliation required' })
      }

      // Ownership guard: the report must exist and belong to the caller's lab.
      const { data: report, error: lookupError } = await ctx.supabase
        .from('diagnostic_reports')
        .select('id, lab_id, patient_ref')
        .eq('id', input.payload.diagnosticReportId)
        .maybeSingle()
      if (lookupError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to look up report' })
      }
      if (!report) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' })
      }
      if (report.lab_id !== labId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Report belongs to another lab' })
      }

      const content = buildNotificationContent('LAB_RESULT_AVAILABLE', input.payload as unknown as Record<string, unknown>)
      const { data: inserted, error: insertError } = await ctx.supabase
        .from('notifications')
        .insert(db.toRowRaw({
          recipientRef: `Patient/${report.patient_ref}`,
          recipientRole: 'PATIENT',
          type: 'LAB_RESULT_AVAILABLE',
          payload: JSON.stringify(input.payload),
          status: 'QUEUED',
          nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
          sourceApp: content.sourceApp,
          subjectKey: content.subjectKey,
          bodyKey: content.bodyKey,
          bodyParams: content.bodyParams,
          notesKey: content.notesKey,
        }, 'non-PHI: notifications'))
        .select('id')
        .single()
      if (insertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create notification' })
      }

      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'NOTIFICATION',
          resourceId: inserted?.id ?? 'unknown',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            notificationAction: 'dispatched_on_release',
            diagnosticReportId: input.payload.diagnosticReportId,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'NOTIFICATION', resourceId: inserted?.id ?? 'unknown' })
      }

      return { notificationId: (inserted?.id as string) ?? null }
    }),

  /**
   * Story 59.1 (repairs C-SYS-5): AI confidence auto-escalation sink.
   * Routes low-confidence AI output through the existing LAB_RESULT_ESCALATION
   * notification path (same type/content the escalation cron uses) targeted at
   * the back-office review queue. retry_count=2 prevents the escalation cron
   * from re-escalating this notification. No PHI in the payload — the client
   * sends opaque sample IDs and a PHI-free summary only.
   */
  escalateAiResult: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(
      z.object({
        type: z.literal('AI_ESCALATION'),
        priority: z.literal('critical'),
        sourceFeature: z.string().min(1).max(100),
        confidence: z.string().min(1).max(20),
        sampleId: z.string().min(1).max(100),
        aiOutputSummary: z.string().min(1).max(500),
        escalationReason: z.string().min(1).max(200),
        actorId: z.string().max(100).optional(),
      }).strict(),
    )
    .output(z.object({ notificationId: z.string().nullable() }).strict())
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

      const payload = {
        sourceFeature: input.sourceFeature,
        confidence: input.confidence,
        sampleId: input.sampleId,
        aiOutputSummary: input.aiOutputSummary,
        escalationReason: input.escalationReason,
      }
      const content = buildNotificationContent('LAB_RESULT_ESCALATION', payload as unknown as Record<string, unknown>)

      // Same insert shape as the notification-escalation service's back-office path.
      const { data: inserted, error: insertError } = await ctx.supabase
        .from('notifications')
        .insert({
          recipient_ref: 'BACKOFFICE',
          recipient_role: 'CLINICIAN',
          type: 'LAB_RESULT_ESCALATION',
          payload: JSON.stringify(payload),
          status: 'QUEUED',
          retry_count: 2, // prevent the escalation cron from re-escalating
          source_app: content.sourceApp,
          subject_key: content.subjectKey,
          body_key: content.bodyKey,
          body_params: content.bodyParams,
          notes_key: content.notesKey,
        })
        .select('id')
        .single()
      if (insertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create escalation' })
      }

      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'NOTIFICATION',
          resourceId: inserted?.id ?? 'unknown',
          actorId: technicianId,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            notificationAction: 'ai_auto_escalation',
            sourceFeature: input.sourceFeature,
            confidence: input.confidence,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'NOTIFICATION', resourceId: inserted?.id ?? 'unknown' })
      }

      return { notificationId: (inserted?.id as string) ?? null }
    }),
})
