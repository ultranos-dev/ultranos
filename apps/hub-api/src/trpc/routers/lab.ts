import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, baseProcedure } from '../init'
import { labRestrictedProcedure } from '../rbac'
import { enforceLabActive } from '../middleware/enforceLabActive'
import { enforceLabRole } from '../middleware/enforceLabRole'
import { enforceEntitlement } from '../middleware/enforceEntitlement'
import { enforceVerifiedOrg } from '../middleware/enforceVerifiedOrg'
import { db } from '@/lib/supabase'
import { AuditLogger } from '@ultranos/audit-logger'
import { LabRole, LabPermission } from '@ultranos/shared-types'
import { generateBlindIndex, encryptField } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from '@/lib/field-encryption'
import { scanFile } from '@/lib/virus-scanner'
import { analyzeFile } from '@/services/ocr'

/**
 * Dispatch lab result notifications to the ordering doctor and patient.
 * Best-effort: notification failures never block the upload response.
 * AC: 1, 2 — dispatches to both doctor (CLINICIAN) and patient (PATIENT).
 */
async function dispatchResultNotifications(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  opts: {
    patientRef: string
    payload: { testCategory: string; labName: string; uploadTimestamp: string; diagnosticReportId: string }
    actorId: string
    actorRole: string
    sessionId: string
  },
) {
  const { patientRef, payload } = opts

  // Find the ordering doctor from the most recent encounter for this patient
  const { data: encounter } = await supabase
    .from('encounters')
    .select('practitioner_id')
    .eq('patient_ref', patientRef)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const notifications: Array<{
    recipientRef: string
    recipientRole: string
    type: string
    payload: string
    status: string
    nextRetryAt: string
  }> = []

  const nextRetryAt = new Date(Date.now() + 60_000).toISOString() // 60s initial retry window

  // Doctor notification (AC: 1)
  if (encounter?.practitioner_id) {
    notifications.push(db.toRowRaw({
      recipientRef: encounter.practitioner_id,
      recipientRole: 'CLINICIAN',
      type: 'LAB_RESULT_AVAILABLE',
      payload: JSON.stringify(payload),
      status: 'QUEUED',
      nextRetryAt,
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
 * In-memory rate limiter for unauthenticated reportAuthEvent endpoint.
 * Keyed by IP hash, limits to MAX_REQUESTS per WINDOW_MS.
 */
const AUTH_EVENT_RATE_LIMIT = {
  MAX_REQUESTS: 20,
  WINDOW_MS: 60_000,
}
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + AUTH_EVENT_RATE_LIMIT.WINDOW_MS })
    return true
  }
  if (entry.count >= AUTH_EVENT_RATE_LIMIT.MAX_REQUESTS) {
    return false
  }
  entry.count++
  return true
}

/**
 * Lab domain router.
 * Story 12.1: Lab Credentialing & Technician Authentication.
 * Handles lab registration submissions.
 *
 * NOTE: Lab registration is open to authenticated users (not role-restricted)
 * because the registering user becomes a LAB_TECH upon approval.
 * Lab-scoped upload endpoints (Story 12.3+) use labRestrictedProcedure instead.
 */
export const labRouter = createTRPCRouter({
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
      // Insert lab record with PENDING status
      const { data: lab, error: labError } = await ctx.supabase
        .from('labs')
        .insert(db.toRowRaw({
          name: input.labName,
          licenseRef: input.licenseRef,
          accreditationRef: input.accreditationRef ?? null,
          status: 'PENDING',
        }, 'non-PHI: labs'))
        .select('id')
        .single()

      if (labError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to register lab',
        })
      }

      // Bind the registering practitioner as a technician of this lab
      const { error: techError } = await ctx.supabase
        .from('lab_technicians')
        .insert(db.toRowRaw({
          practitionerId: ctx.user.sub,
          labId: lab.id,
          credentialRef: input.technicianCredentialRef,
        }, 'non-PHI: labs'))

      if (techError) {
        // Compensating delete: remove orphaned lab record
        await ctx.supabase.from('labs').delete().eq('id', lab.id)

        if (techError.code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Technician is already registered to a lab',
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to bind technician to lab',
        })
      }

      // Audit event for lab registration
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'Organization',
          resourceId: lab.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { registrationAction: 'lab_registered' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'Organization', resourceId: lab.id })
      }

      return {
        success: true,
        labId: lab.id,
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
      // Rate limit by IP hash
      const forwarded = ctx.headers.get('x-forwarded-for')
      const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown'
      const { createHash } = await import('crypto')
      const ipHash = createHash('sha256').update(ip).digest('hex')

      if (!checkRateLimit(ipHash)) {
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

      const audit = new AuditLogger(ctx.supabase)

      const actionMap: Record<string, string> = {
        LOGIN_SUCCESS: 'LOGIN',
        LOGIN_FAILURE: 'LOGIN',
        MFA_VERIFY_SUCCESS: 'LOGIN',
        MFA_VERIFY_FAILURE: 'MFA_FAIL',
      }

      const outcomeMap: Record<string, string> = {
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
   * 1. SQL: SELECT only id, given_name, birth_date
   * 2. Zod output schema: rejects any extra fields
   * 3. RBAC: LAB_TECH only (via labRestrictedProcedure)
   * 4. Lab status: must be ACTIVE (via enforceLabActive)
   */
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
      }),
    )
    .query(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase)
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
          .select('id, given_name, birth_date')
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
          .select('id, given_name, birth_date')
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

      // Validate required fields before processing
      if (!patient.given_name || !patient.birth_date) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Patient record incomplete — unable to verify',
        })
      }

      // Generate opaque patientRef via HMAC-SHA256 (never expose raw patient ID)
      const patientRef = generateBlindIndex(patient.id, hmacKey)

      // Calculate age from birth_date
      const birthDate = new Date(patient.birth_date)
      const today = new Date()
      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDiff = today.getMonth() - birthDate.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--
      }

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

      return {
        firstName: patient.given_name,
        age,
        patientRef,
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
        fileType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
        patientRef: z.string().min(1),
        loincCode: z.enum([
          '58410-2', '57698-3', '4548-4', '51990-0',
          '24325-3', '3016-3', '24356-8', '1558-6',
        ]),
        loincDisplay: z.string().min(1),
        collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
          (date) => new Date(date) <= new Date(),
          { message: 'Collection date cannot be in the future' },
        ),
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
      const audit = new AuditLogger(ctx.supabase)
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

      // Create DiagnosticReport record
      // Story 12.6: Include OCR metadata for audit (AC 6)
      const reportInsert: Record<string, unknown> = {
        status: 'preliminary',
        loinc_code: input.loincCode,
        loinc_display: input.loincDisplay,
        patient_ref: input.patientRef,
        performer_id: technicianId,
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

      // Store encrypted file
      const { error: fileError } = await ctx.supabase
        .from('lab_result_files')
        .insert({
          diagnostic_report_id: report.id,
          file_name: input.fileName,
          file_type: input.fileType,
          file_size: fileBuffer.length,
          encrypted_content: encryptedContent,
          file_hash: scanResult.hash,
        })

      if (fileError) {
        // Compensating delete: remove orphaned diagnostic report
        const { error: deleteError } = await ctx.supabase
          .from('diagnostic_reports')
          .delete()
          .eq('id', report.id)

        if (deleteError) {
          // Orphaned report — emit audit event for ops visibility
          try {
            await audit.emit({
              action: 'CREATE',
              resourceType: 'LAB_RESULT',
              resourceId: report.id,
              actorId: technicianId,
              actorRole: ctx.user.role,
              outcome: 'FAILURE',
              sessionId: ctx.user.sessionId,
              metadata: {
                uploadAction: 'compensating_delete_failed',
                orphanedReportId: report.id,
              },
            })
          } catch {
            console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'LAB_RESULT', resourceId: report.id })
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
          resourceId: report.id,
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
        diagnosticReportId: report.id,
        loincCode: input.loincCode,
      }

      // Dispatch notification to ordering doctor (best-effort, non-blocking).
      // Resolve doctor from most recent encounter for this patient.
      dispatchResultNotifications(ctx.supabase, {
        patientRef: input.patientRef,
        payload: notificationPayload,
        actorId: technicianId,
        actorRole: ctx.user.role,
        sessionId: ctx.user.sessionId,
      }).catch(() => {
        // Notification failures must not block a successful upload
      })

      return {
        success: true,
        reportId: report.id,
        status: 'preliminary',
        virusScanStatus,
      }
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
      const audit = new AuditLogger(ctx.supabase)
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
   */
  getMyRole: labRestrictedProcedure
    .use(enforceLabActive())
    .query(async ({ ctx }) => {
      // ADMIN callers have no lab context — return null (roles managed via Admin Portal)
      if (!ctx.lab) {
        return { labRole: null }
      }
      return { labRole: ctx.lab.labRole }
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
        const audit = new AuditLogger(ctx.supabase)
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
    .use(enforceLabActive())
    .input(
      z.object({
        since: z.string().datetime().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase)
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
          patients!inner(id, given_name, birth_date),
          practitioners!service_requests_requester_id_fkey(id, given_name, family_name)
        `)
        .in('status', ['active', 'on-hold'])
        .order('meta_last_updated', { ascending: false })
        .limit(100)

      // Scope to this lab (received by this lab, or unassigned)
      if (labId) {
        query = query.or(`received_by_lab_id.eq.${labId},received_by_lab_id.is.null`)
      }

      // Incremental sync: only orders updated since the given timestamp
      if (input.since) {
        query = query.gte('meta_last_updated', input.since)
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
          resourceType: 'ServiceRequest',
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

      // Data minimization projection: return ONLY first name + age
      const mapped = (orders ?? []).map((order: any) => {
        const patient = order.patients
        const practitioner = order.practitioners

        // P8: Compute age from birth_date — never expose DOB. Null if missing.
        let patientAge: number | null = null
        if (patient?.birth_date) {
          const birthDate = new Date(patient.birth_date)
          const today = new Date()
          patientAge = today.getFullYear() - birthDate.getFullYear()
          const monthDiff = today.getMonth() - birthDate.getMonth()
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            patientAge--
          }
        }

        return {
          orderId: order.id,
          patientFirstName: patient?.given_name ?? '',
          patientAge,
          patientRef: patient?.id ? `Patient/${generateBlindIndex(patient.id, hmacKey)}` : '',
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
        }
      })

      // P11: Return max server timestamp for accurate incremental sync
      const maxServerTs = (orders ?? []).reduce(
        (max: string, o: any) => (o.meta_last_updated > max ? o.meta_last_updated : max),
        '',
      )

      return { orders: mapped, syncTimestamp: maxServerTs || null }
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
      const audit = new AuditLogger(ctx.supabase)
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
      const { error: updateError, count } = await ctx.supabase
        .from('service_requests')
        .update({
          status: 'on-hold',
          received_at: now,
          received_by_lab_id: labId ?? null,
          received_by_tech_id: technicianId,
          meta_last_updated: now,
        })
        .eq('id', input.orderId)
        .or(`received_by_lab_id.is.null${labId ? `,received_by_lab_id.eq.${labId}` : ''}`)
        .select('id', { count: 'exact', head: true })

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
          const { data: inserted } = await ctx.supabase
            .from('notifications')
            .insert({
              recipient_ref: order.requester_id,
              recipient_role: 'CLINICIAN',
              type: 'ORDER_RECEIVED',
              payload: JSON.stringify({
                orderId: input.orderId,
                testCategory: order.code_display ?? 'Lab Test',
                acknowledgedAt: now,
              }),
              status: 'QUEUED',
              next_retry_at: nextRetryAt,
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
          resourceType: 'ServiceRequest',
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
      const practitionerId = ctx.user.sub

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
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'MENTORSHIP',
          resourceId: pairing?.id ?? 'none',
          actorId: practitionerId,
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
      const practitionerId = ctx.user.sub

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
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CERTIFICATION_PROGRESS_VIEWED',
          resourceType: 'CERTIFICATION_PROGRESS',
          resourceId: practitionerId,
          actorId: practitionerId,
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

      const audit = new AuditLogger(ctx.supabase)
      await audit.emit({
        action: 'READ',
        resourceType: 'EMPLOYEE_HEALTH',
        resourceId: input.practitionerId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { accessType: 'EMERGENCY', scope: 'VACCINATION_STATUS_ONLY' },
      })

      if (error || !data) {
        return null
      }

      return {
        hepBStatus: data.hep_b_status as string,
        tetanusStatus: data.tetanus_status as string,
        covidStatus: data.covid_status as string,
      }
    }),
})
