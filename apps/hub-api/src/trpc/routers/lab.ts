import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, baseProcedure } from '../init'
import { labRestrictedProcedure } from '../rbac'
import { enforceLabActive } from '../middleware/enforceLabActive'
import { db } from '@/lib/supabase'
import { AuditLogger } from '@ultranos/audit-logger'
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
})
