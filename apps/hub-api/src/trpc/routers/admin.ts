import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTRPCRouter, protectedProcedure, baseProcedure } from '../init'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'

/**
 * ADMIN-role-only middleware guard.
 * Rejects non-ADMIN callers with FORBIDDEN error.
 */
const adminProcedure = protectedProcedure.use(async (opts) => {
  if (opts.ctx.user.role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    })
  }
  return opts.next(opts)
})

/**
 * In-memory rate limiter for unauthenticated admin auth event endpoint.
 */
const RATE_LIMIT = { MAX_REQUESTS: 20, WINDOW_MS: 60_000, MAX_ENTRIES: 10_000 }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function evictExpiredEntries(now: number): void {
  if (rateLimitMap.size <= RATE_LIMIT.MAX_ENTRIES) return
  for (const [k, v] of rateLimitMap) {
    if (now > v.resetAt) rateLimitMap.delete(k)
  }
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  evictExpiredEntries(now)
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT.WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT.MAX_REQUESTS) return false
  entry.count++
  return true
}

/**
 * Admin domain router — Story 22.1.
 * All procedures (except reportAuthEvent) require ADMIN role.
 */
export const adminRouter = createTRPCRouter({
  /**
   * Placeholder dashboard stats — returns static placeholders.
   * Will be wired to real data in subsequent stories.
   */
  dashboardStats: adminProcedure.query(async ({ ctx }) => {
    const { count: pendingLabApprovals } = await ctx.supabase
      .from('labs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING')

    const { count: pendingKycReviews } = await ctx.supabase
      .from('kyc_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING')

    const { count: unreviewedAlerts } = await ctx.supabase
      .from('prescribing_anomalies')
      .select('id', { count: 'exact', head: true })
      .in('status', ['UNREVIEWED', 'ESCALATED'])

    return {
      pendingKycReviews: pendingKycReviews ?? 0,
      pendingLabApprovals: pendingLabApprovals ?? 0,
      activeAlerts: unreviewedAlerts ?? 0,
      recentAuditEvents: 0,
    }
  }),

  /** Health check for admin router connectivity. */
  health: adminProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }),

  /**
   * Report admin authentication events for audit trail.
   * Uses baseProcedure — failed logins won't have a valid JWT.
   * Rate-limited to prevent audit log flooding.
   */
  reportAuthEvent: baseProcedure
    .input(
      z.object({
        event: z.enum(['ADMIN_LOGIN_SUCCESS', 'ADMIN_LOGIN_FAILURE']),
        actorEmail: z.string().email().optional(),
        actorId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
      }

      const audit = new AuditLogger(ctx.supabase)
      const isSuccess = input.event === 'ADMIN_LOGIN_SUCCESS'
      const sourceIpHash = ip !== 'unknown' ? ipHash : undefined

      try {
        await audit.emit({
          action: 'LOGIN',
          resourceType: 'USER_ACCOUNT',
          resourceId: validatedActorId ?? 'anonymous',
          actorId: validatedActorId,
          actorRole: ctx.user?.role ?? 'UNKNOWN',
          outcome: isSuccess ? 'SUCCESS' : 'FAILURE',
          sessionId: ctx.user?.sessionId,
          sourceIpHash,
          metadata: {
            authEvent: input.event,
            portal: 'admin',
            ...(input.event === 'ADMIN_LOGIN_FAILURE' && input.actorEmail
              ? { failedEmail: '[REDACTED]' }
              : {}),
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'LOGIN', resourceType: 'USER_ACCOUNT', resourceId: 'admin-auth-event' })
      }

      return { logged: true }
    }),

  // ================================================================
  // Story 22.3: Lab Approval & Suspension Workflow
  // ================================================================

  /**
   * List lab registrations with status filter and pagination.
   * AC #1, #2, #7: Lab queue with filtering by status.
   */
  listLabs: adminProcedure
    .input(
      z.object({
        status: z.enum(['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED']).default('ALL'),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('labs')
        .select(`
          id, name, license_ref, accreditation_ref, status, created_at,
          lab_technicians!inner(practitioner_id, practitioners!inner(given_name, family_name))
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(input.cursor, input.cursor + input.limit - 1)

      if (input.status !== 'ALL') {
        query = query.eq('status', input.status)
      }

      const { data: rows, error, count } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query lab registrations',
        })
      }

      const labs = (rows ?? []).map((row: Record<string, unknown>) => {
        const techs = row.lab_technicians as Array<{
          practitioner_id: string
          practitioners: { given_name: string; family_name: string }
        }>
        const tech = techs?.[0]
        const techName = tech?.practitioners
          ? `${tech.practitioners.given_name ?? ''} ${tech.practitioners.family_name ?? ''}`.trim()
          : 'Unknown'

        return {
          id: row.id as string,
          labName: row.name as string,
          licenseReference: row.license_ref as string,
          accreditationReference: (row.accreditation_ref as string) ?? null,
          technicianName: techName,
          technicianId: tech?.practitioner_id ?? null,
          registeredAt: row.created_at as string,
          status: row.status as string,
        }
      })

      return {
        labs,
        total: count ?? 0,
        cursor: input.cursor,
        limit: input.limit,
      }
    }),

  /**
   * Get full lab registration detail with status history and upload count.
   * AC #9: Lab detail view data.
   */
  getLabDetail: adminProcedure
    .input(z.object({ labId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Fetch lab with technician info
      const { data: lab, error: labError } = await ctx.supabase
        .from('labs')
        .select(`
          id, name, license_ref, accreditation_ref, status, created_at,
          lab_technicians(id, practitioner_id, credential_ref,
            practitioners(given_name, family_name, telecom_email, qualification_display)
          )
        `)
        .eq('id', input.labId)
        .single()

      if (labError || !lab) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lab not found',
        })
      }

      // Fetch status history with reviewer names
      const { data: history } = await ctx.supabase
        .from('lab_status_history')
        .select('status, changed_by, changed_at, reason, practitioners:changed_by(given_name, family_name)')
        .eq('lab_id', input.labId)
        .order('changed_at', { ascending: false })

      // Fetch upload count from diagnostic_reports
      const { count: uploadCount } = await ctx.supabase
        .from('diagnostic_reports')
        .select('id', { count: 'exact', head: true })
        .eq('lab_id', input.labId)

      const techs = (lab as Record<string, unknown>).lab_technicians as Array<{
        id: string
        practitioner_id: string
        credential_ref: string
        practitioners: {
          given_name: string
          family_name: string
          telecom_email: string | null
          qualification_display: string | null
        }
      }>
      const tech = techs?.[0]

      return {
        id: lab.id,
        labName: lab.name,
        licenseReference: lab.license_ref,
        accreditationReference: lab.accreditation_ref ?? null,
        status: lab.status,
        registeredAt: lab.created_at,
        technician: tech ? {
          id: tech.practitioner_id,
          name: `${tech.practitioners?.given_name ?? ''} ${tech.practitioners?.family_name ?? ''}`.trim(),
          email: tech.practitioners?.telecom_email ?? null,
          credentialRef: tech.credential_ref,
          qualification: tech.practitioners?.qualification_display ?? null,
        } : null,
        statusHistory: (history ?? []).map((h: Record<string, unknown>) => {
          const reviewer = h.practitioners as { given_name?: string; family_name?: string } | null
          const reviewerName = reviewer
            ? `${reviewer.given_name ?? ''} ${reviewer.family_name ?? ''}`.trim()
            : null
          return {
            status: h.status as string,
            changedBy: h.changed_by as string,
            changedByName: reviewerName,
            changedAt: h.changed_at as string,
            reason: (h.reason as string) ?? null,
          }
        }),
        uploadCount: uploadCount ?? 0,
      }
    }),

  /**
   * Approve, suspend, or reactivate a lab registration.
   * AC #3, #4, #5: Status transitions with audit and notifications.
   */
  reviewLab: adminProcedure
    .input(
      z.object({
        labId: z.string().uuid(),
        action: z.enum(['APPROVE', 'SUSPEND', 'REACTIVATE']),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch current lab status
      const { data: lab, error: labError } = await ctx.supabase
        .from('labs')
        .select('id, status')
        .eq('id', input.labId)
        .single()

      if (labError || !lab) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lab not found',
        })
      }

      // Validate transition
      const VALID_TRANSITIONS: Record<string, Record<string, string>> = {
        APPROVE: { from: 'PENDING', to: 'ACTIVE' },
        SUSPEND: { from: 'ACTIVE', to: 'SUSPENDED' },
        REACTIVATE: { from: 'SUSPENDED', to: 'ACTIVE' },
      }

      const transition = VALID_TRANSITIONS[input.action]!
      if (lab.status !== transition.from) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot ${input.action} a lab with status ${lab.status} — expected ${transition.from}`,
        })
      }

      // Update lab status with optimistic lock — prevents TOCTOU race
      const { error: updateError, count: updateCount } = await ctx.supabase
        .from('labs')
        .update({ status: transition.to, updated_at: new Date().toISOString() })
        .eq('id', input.labId)
        .eq('status', transition.from)
        .select('id', { count: 'exact', head: true })

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update lab status',
        })
      }

      if ((updateCount ?? 0) === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Lab status was changed by another admin — please refresh and try again',
        })
      }

      // Insert status history entry
      const { error: historyError } = await ctx.supabase
        .from('lab_status_history')
        .insert({
          lab_id: input.labId,
          status: transition.to,
          changed_by: ctx.user.sub,
          changed_at: new Date().toISOString(),
          reason: input.reason ?? null,
        })

      if (historyError) {
        console.warn('[STATUS_HISTORY_FAILURE]', { labId: input.labId, action: input.action })
      }

      // Emit audit event
      const auditActionMap: Record<string, string> = {
        APPROVE: 'LAB_APPROVED',
        SUSPEND: 'LAB_SUSPENDED',
        REACTIVATE: 'LAB_REACTIVATED',
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: auditActionMap[input.action]!,
          resourceType: 'LAB_REGISTRATION',
          resourceId: input.labId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            labAction: input.action,
            previousStatus: transition.from,
            newStatus: transition.to,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: auditActionMap[input.action],
          resourceType: 'LAB_REGISTRATION',
          resourceId: input.labId,
        })
      }

      // Notify the lab technician (best-effort)
      const notificationTypeMap: Record<string, string> = {
        APPROVE: 'LAB_APPROVED',
        SUSPEND: 'LAB_SUSPENDED',
        REACTIVATE: 'LAB_REACTIVATED',
      }

      try {
        // Find the technician for this lab
        const { data: techRecord } = await ctx.supabase
          .from('lab_technicians')
          .select('practitioner_id')
          .eq('lab_id', input.labId)
          .limit(1)
          .single()

        if (techRecord) {
          await ctx.supabase
            .from('notifications')
            .insert({
              recipient_ref: techRecord.practitioner_id,
              recipient_role: 'LAB_TECH',
              type: notificationTypeMap[input.action],
              payload: JSON.stringify({
                labId: input.labId,
                action: input.action,
                newStatus: transition.to,
                ...(input.reason ? { reason: input.reason } : {}),
              }),
              status: 'QUEUED',
              next_retry_at: new Date(Date.now() + 60_000).toISOString(),
            })
        }
      } catch {
        console.warn('[NOTIFICATION_FAILURE]', { labId: input.labId, action: input.action })
      }

      return {
        success: true,
        labId: input.labId,
        previousStatus: transition.from,
        newStatus: transition.to,
      }
    }),

  /**
   * List providers approaching license expiry.
   * Story 22.4 AC #6: Returns providers within configurable expiry windows.
   * Sorted by expiry date ascending (most urgent first).
   */
  listExpiringProviders: adminProcedure
    .input(
      z.object({
        window: z.enum(['7d', '30d', '60d', 'all']).default('all'),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date()
      let windowDate: string | null = null

      if (input.window !== 'all') {
        const days = input.window === '7d' ? 7 : input.window === '30d' ? 30 : 60
        const futureDate = new Date(now)
        futureDate.setDate(futureDate.getDate() + days)
        windowDate = futureDate.toISOString().split('T')[0]
      }

      // Query practitioners with license_expiry set
      let query = ctx.supabase
        .from('practitioners')
        .select('id, name, identifier, _ultranos, meta', { count: 'exact' })
        .not('_ultranos->>licenseExpiry', 'is', null)
        .order('_ultranos->>licenseExpiry', { ascending: true })
        .range(input.cursor, input.cursor + input.limit - 1)

      if (windowDate) {
        const todayDate = now.toISOString().split('T')[0]
        query = query.lte('_ultranos->>licenseExpiry', windowDate)
          .gte('_ultranos->>licenseExpiry', todayDate)
      }

      const { data: rows, error, count } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query expiring providers',
        })
      }

      const todayStr = now.toISOString().split('T')[0]
      const providers = (rows ?? []).map((row: Record<string, unknown>) => {
        const r = db.fromRow(row)
        const ultranos = r._ultranos as {
          licenseExpiry?: string
          kycStatus: string
        }
        const name = (r.name as { family: string; given: string[]; text?: string }[])?.[0]
        const identifier = (r.identifier as { system: string; value: string }[])?.[0]

        const expiryDate = ultranos.licenseExpiry ?? ''
        const daysRemaining = expiryDate
          ? Math.ceil((new Date(expiryDate).getTime() - new Date(todayStr).getTime()) / 86_400_000)
          : null

        return {
          practitionerId: r.id as string,
          name: name?.text ?? `${name?.given?.join(' ') ?? ''} ${name?.family ?? ''}`.trim(),
          licenseNumber: identifier?.value ?? '',
          issuingBody: identifier?.system ?? '',
          expiryDate,
          daysRemaining,
          kycStatus: ultranos.kycStatus,
        }
      })

      // Audit PHI read — CLAUDE.md rule 6
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PRACTITIONER',
          resourceId: 'batch',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.listExpiringProviders', window: input.window, resultCount: providers.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PRACTITIONER', endpoint: 'listExpiringProviders' })
      }

      return {
        providers,
        total: count ?? 0,
        cursor: input.cursor,
        limit: input.limit,
      }
    }),

  /**
   * Renew a provider's license.
   * Story 22.4 AC #7, #9: Updates license expiry, transitions to PENDING_VERIFICATION.
   * Emits LICENSE_RENEWED audit event.
   */
  renewProviderLicense: adminProcedure
    .input(
      z.object({
        practitionerId: z.string().uuid(),
        newExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
          .refine((val) => val > new Date().toISOString().split('T')[0], 'Expiry date must be in the future'),
        documentUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify practitioner exists
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('practitioners')
        .select('id, _ultranos')
        .eq('id', input.practitionerId)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Practitioner not found',
        })
      }

      const currentUltranos = (existing as Record<string, unknown>)._ultranos as Record<string, unknown> ?? {}

      // Update license expiry and transition to PENDING_VERIFICATION
      const updatedUltranos = {
        ...currentUltranos,
        licenseExpiry: input.newExpiryDate,
        kycStatus: 'PENDING_VERIFICATION',
        renewalDocumentUrl: input.documentUrl,
        lastExpiryNotificationAt: null,
        lastExpiryNotificationThreshold: null,
      }

      const { error: updateError } = await ctx.supabase
        .from('practitioners')
        .update(db.toRow({
          _ultranos: updatedUltranos,
          meta: { lastUpdated: new Date().toISOString() },
        }))
        .eq('id', input.practitionerId)

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to renew provider license',
        })
      }

      // Emit audit event — AC #11
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'LICENSE_RENEWED',
          resourceType: 'PRACTITIONER',
          resourceId: input.practitionerId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            newExpiryDate: input.newExpiryDate,
            documentUrl: input.documentUrl,
            previousKycStatus: currentUltranos.kycStatus,
            newKycStatus: 'PENDING_VERIFICATION',
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: 'LICENSE_RENEWED',
          resourceType: 'PRACTITIONER',
          resourceId: input.practitionerId,
        })
      }

      return {
        success: true,
        practitionerId: input.practitionerId,
        newExpiryDate: input.newExpiryDate,
        kycStatus: 'PENDING_VERIFICATION',
      }
    }),

  /**
   * Get license expiry job status.
   * Story 22.4 AC #8: Health check for the daily job.
   */
  licenseExpiryJobStatus: adminProcedure
    .query(async ({ ctx }) => {
      const { data, error } = await ctx.supabase
        .from('job_runs')
        .select('id, job_name, started_at, completed_at, status, summary')
        .eq('job_name', 'license-expiry-check')
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) {
        return { lastRun: null, status: 'never_run' }
      }

      const row = db.fromRowRaw(data)
      return {
        lastRun: row.completedAt ?? row.startedAt,
        status: row.status,
        summary: row.summary,
      }
    }),

  // ================================================================
  // Story 22.2: KYC Verification Dashboard
  // ================================================================

  /**
   * List KYC submissions with status/SLA filtering and pagination.
   * AC #1, #2, #7, #11, #12: Queue view with SLA breach detection.
   */
  listKycSubmissions: adminProcedure
    .input(
      z.object({
        status: z.enum(['ALL', 'PENDING', 'SLA_BREACHED']).default('ALL'),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      // For SLA_BREACHED we need all PENDING rows to filter by SLA, so fetch without pagination first
      // For PENDING, filter by status=PENDING. For ALL, no status filter.
      if (input.status === 'SLA_BREACHED') {
        // Fetch all PENDING submissions (no pagination) to compute SLA breach server-side
        const { data: allRows, error: allError } = await ctx.supabase
          .from('kyc_submissions')
          .select(`
            id, practitioner_id, status, registry_number, submitted_at,
            registry_verification_status, documents,
            practitioners!inner(name, identifier, _ultranos)
          `)
          .eq('status', 'PENDING')
          .eq('org_id', ctx.user.orgId)
          .order('submitted_at', { ascending: true })

        if (allError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to query KYC submissions',
          })
        }

        const allMapped = (allRows ?? []).map((row: Record<string, unknown>) => mapKycQueueEntry(row))
        const breached = allMapped.filter((s) => s.slaBreached)
        const total = breached.length
        const paged = breached.slice(input.cursor, input.cursor + input.limit)

        // Audit PHI read — CLAUDE.md rule 6
        await emitKycListAudit(ctx, input.status, paged.length)

        return {
          submissions: paged,
          total,
          cursor: input.cursor,
          limit: input.limit,
        }
      }

      // ALL or PENDING — standard paginated query
      let query = ctx.supabase
        .from('kyc_submissions')
        .select(`
          id, practitioner_id, status, registry_number, submitted_at,
          registry_verification_status, documents,
          practitioners!inner(name, identifier, _ultranos)
        `, { count: 'exact' })
        .eq('org_id', ctx.user.orgId)
        .order('submitted_at', { ascending: true })
        .range(input.cursor, input.cursor + input.limit - 1)

      if (input.status === 'PENDING') {
        query = query.eq('status', 'PENDING')
      }

      const { data: rows, error, count } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query KYC submissions',
        })
      }

      const submissions = (rows ?? []).map((row: Record<string, unknown>) => mapKycQueueEntry(row))

      // Audit PHI read — CLAUDE.md rule 6
      await emitKycListAudit(ctx, input.status, submissions.length)

      return {
        submissions,
        total: count ?? 0,
        cursor: input.cursor,
        limit: input.limit,
      }
    }),

  /**
   * Get full KYC submission detail with OCR fields and document URLs.
   * AC #3: Side-by-side document verification view.
   */
  getKycSubmission: adminProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: submission, error: subError } = await ctx.supabase
        .from('kyc_submissions')
        .select(`
          id, practitioner_id, status, registry_number, submitted_at,
          registry_verification_status,
          documents, rejection_reason, admin_message, reviewed_by, reviewed_at,
          practitioners!inner(name, identifier, _ultranos)
        `)
        .eq('id', input.submissionId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (subError || !submission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'KYC submission not found',
        })
      }

      const practitioner = (submission as Record<string, unknown>).practitioners as {
        name: Array<{ family: string; given: string[]; text?: string }>
        identifier: Array<{ system: string; value: string }>
        _ultranos: { kycStatus: string }
      }
      const pName = practitioner?.name?.[0]
      const providerName = pName?.text ?? `${pName?.given?.join(' ') ?? ''} ${pName?.family ?? ''}`.trim()

      const documents = (submission.documents as Array<{
        type: 'MEDICAL_LICENSE' | 'NATIONAL_ID'
        storageKey: string
        ocrResults: { fields: Array<{ name: string; value: string; confidence: number }> }
      }>) ?? []

      // Generate signed download URLs for documents (1 hour expiry for review sessions)
      const documentUrls: Array<{ type: 'MEDICAL_LICENSE' | 'NATIONAL_ID'; url: string }> = []
      for (const doc of documents) {
        const { data: urlData } = await ctx.supabase.storage
          .from('kyc-documents')
          .createSignedUrl(doc.storageKey, 3600)

        documentUrls.push({
          type: doc.type,
          url: urlData?.signedUrl ?? '',
        })
      }

      // Extract OCR fields per document
      const ocrFields = documents.map((doc) => ({
        documentType: doc.type,
        fields: doc.ocrResults?.fields ?? [],
      }))

      const sla = calculateSlaDeadline(submission.submitted_at)

      // Audit PHI read — CLAUDE.md rule 6
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'KYC_SUBMISSION',
          resourceId: input.submissionId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.getKycSubmission' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'KYC_SUBMISSION', resourceId: input.submissionId })
      }

      return {
        submission: {
          id: submission.id,
          practitionerId: submission.practitioner_id,
          submittedAt: submission.submitted_at,
          status: submission.status,
          registryNumber: submission.registry_number,
          registryVerificationStatus: (submission as Record<string, unknown>).registry_verification_status as string | null ?? null,
          rejectionReason: submission.rejection_reason ?? null,
          adminMessage: submission.admin_message ?? null,
          reviewedBy: submission.reviewed_by ?? null,
          reviewedAt: submission.reviewed_at ?? null,
        },
        providerName,
        kycStatus: practitioner?._ultranos?.kycStatus ?? 'PENDING_VERIFICATION',
        documentUrls,
        ocrFields,
        slaDeadline: sla.deadline,
        slaBreached: sla.breached,
        slaRemainingHours: sla.remainingHours,
      }
    }),

  /**
   * Review a KYC submission: approve, reject, or request more info.
   * AC #4, #5, #6, #10: Status transitions with audit and notifications.
   */
  reviewKycSubmission: adminProcedure
    .input(
      z.object({
        submissionId: z.string().uuid(),
        action: z.enum(['APPROVE', 'REJECT', 'REQUEST_MORE_INFO']),
        reason: z.string().max(500).optional(),
      }).refine(
        (data) => data.action !== 'REJECT' || (data.reason && data.reason.trim().length > 0),
        { message: 'Rejection reason is required', path: ['reason'] },
      ),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch current submission with org scope — D2
      const { data: submission, error: subError } = await ctx.supabase
        .from('kyc_submissions')
        .select('id, practitioner_id, status')
        .eq('id', input.submissionId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (subError || !submission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'KYC submission not found',
        })
      }

      if (submission.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot review a submission with status ${submission.status} — expected PENDING`,
        })
      }

      // Map action → submission status and practitioner KYC status
      // D3: REQUEST_MORE_INFO now uses distinct AWAITING_INFO submission status
      const ACTION_MAP: Record<string, { submissionStatus: string; kycStatus: string }> = {
        APPROVE: { submissionStatus: 'APPROVED', kycStatus: 'ACTIVE' },
        REJECT: { submissionStatus: 'REJECTED', kycStatus: 'REJECTED' },
        REQUEST_MORE_INFO: { submissionStatus: 'AWAITING_INFO', kycStatus: 'REQUEST_MORE_INFO' },
      }

      const transition = ACTION_MAP[input.action]!
      const now = new Date().toISOString()

      // Update submission with optimistic lock on status
      const submissionUpdate: Record<string, unknown> = {
        status: transition.submissionStatus,
        reviewed_by: ctx.user.sub,
        reviewed_at: now,
      }

      if (input.action === 'REJECT') {
        submissionUpdate.rejection_reason = input.reason
      }

      if (input.action === 'REQUEST_MORE_INFO') {
        submissionUpdate.admin_message = input.reason ?? null
      }

      const { error: updateSubError, count: updateCount } = await ctx.supabase
        .from('kyc_submissions')
        .update(submissionUpdate)
        .eq('id', input.submissionId)
        .eq('status', 'PENDING')
        .select('id', { count: 'exact', head: true })

      if (updateSubError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update KYC submission',
        })
      }

      if ((updateCount ?? 0) === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Submission status was changed by another admin — please refresh and try again',
        })
      }

      // Update practitioner KYC status
      // P3: If this fails, revert the submission status to maintain consistency
      const { error: practError } = await ctx.supabase
        .from('practitioners')
        .update({ kyc_status: transition.kycStatus })
        .eq('id', submission.practitioner_id)

      if (practError) {
        // Compensating write: revert submission status back to PENDING
        await ctx.supabase
          .from('kyc_submissions')
          .update({ status: 'PENDING', reviewed_by: null, reviewed_at: null })
          .eq('id', input.submissionId)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update practitioner KYC status — submission reverted',
        })
      }

      // Emit audit event — AC #10
      const auditActionMap: Record<string, string> = {
        APPROVE: 'KYC_APPROVED',
        REJECT: 'KYC_REJECTED',
        REQUEST_MORE_INFO: 'KYC_MORE_INFO_REQUESTED',
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: auditActionMap[input.action]!,
          resourceType: 'KYC_SUBMISSION',
          resourceId: input.submissionId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            kycAction: input.action,
            practitionerId: submission.practitioner_id,
            previousSubmissionStatus: 'PENDING',
            newKycStatus: transition.kycStatus,
            ...(input.action === 'REJECT' && input.reason ? { rejectionReason: input.reason } : {}),
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', {
          action: auditActionMap[input.action],
          resourceType: 'KYC_SUBMISSION',
          resourceId: input.submissionId,
        })
      }

      // Notify the provider (best-effort) — AC #5, #6
      const notificationTypeMap: Record<string, string> = {
        APPROVE: 'KYC_APPROVED',
        REJECT: 'KYC_REJECTED',
        REQUEST_MORE_INFO: 'KYC_MORE_INFO_REQUESTED',
      }

      try {
        await ctx.supabase
          .from('notifications')
          .insert({
            recipient_ref: submission.practitioner_id,
            recipient_role: 'CLINICIAN',
            type: notificationTypeMap[input.action],
            payload: JSON.stringify({
              submissionId: input.submissionId,
              action: input.action,
              newKycStatus: transition.kycStatus,
              ...(input.reason ? { reason: input.reason } : {}),
            }),
            status: 'QUEUED',
            next_retry_at: new Date(Date.now() + 60_000).toISOString(),
          })
      } catch {
        console.warn('[NOTIFICATION_FAILURE]', { submissionId: input.submissionId, action: input.action })
      }

      return {
        success: true,
        submissionId: input.submissionId,
        action: input.action,
        newKycStatus: transition.kycStatus,
      }
    }),

  // ================================================================
  // Story 22.6: Prescribing Anomaly Alert Review
  // ================================================================

  /**
   * List anomaly alerts with status/severity filtering and pagination.
   * AC #1, #2, #11: Queue view sorted by severity DESC, createdAt DESC.
   */
  listAnomalyAlerts: adminProcedure
    .input(
      z.object({
        status: z.enum(['ALL', 'UNREVIEWED', 'ESCALATED', 'DISMISSED', 'SUSPENDED']).default('ALL'),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('prescribing_anomalies')
        .select('*', { count: 'exact' })

      if (input.status !== 'ALL') {
        query = query.eq('status', input.status)
      }

      // Explicit severity ranking — immune to future enum additions
      const SEVERITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1 }

      const { data: rows, error, count } = await query
        .order('created_at', { ascending: false })
        .range(input.cursor, input.cursor + input.limit - 1)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query anomaly alerts',
        })
      }

      const alerts = (rows ?? []).map((row: Record<string, unknown>) => {
        const r = db.fromRowRaw(row)
        return {
          id: r.id as string,
          practitionerId: r.practitionerId as string,
          practitionerName: r.practitionerName as string,
          anomalyType: r.anomalyType as string,
          threshold: r.threshold as number,
          actualValue: r.actualValue as number,
          dateRangeStart: r.dateRangeStart as string,
          dateRangeEnd: r.dateRangeEnd as string,
          severity: r.severity as string,
          status: r.status as string,
          createdAt: r.createdAt as string,
        }
      }).sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99))

      // Audit PHI read — CLAUDE.md rule 6
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PRESCRIBING_ANOMALY',
          resourceId: 'batch',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.listAnomalyAlerts', statusFilter: input.status, resultCount: alerts.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PRESCRIBING_ANOMALY', endpoint: 'listAnomalyAlerts' })
      }

      return {
        alerts,
        total: count ?? 0,
        cursor: input.cursor,
        limit: input.limit,
      }
    }),

  /**
   * Get full anomaly alert detail with prescribing summary.
   * AC #9: Shows patterns (counts, percentages) — NO patient identifiers.
   */
  getAnomalyDetail: adminProcedure
    .input(z.object({ alertId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: alert, error: alertError } = await ctx.supabase
        .from('prescribing_anomalies')
        .select('*')
        .eq('id', input.alertId)
        .single()

      if (alertError || !alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Anomaly alert not found',
        })
      }

      const r = db.fromRowRaw(alert as Record<string, unknown>)
      const practitionerId = r.practitionerId as string

      // Prescribing summary for this provider — aggregate counts only, no patient IDs
      const { count: totalPrescriptions } = await ctx.supabase
        .from('medication_requests')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', practitionerId)

      const { count: controlledCount } = await ctx.supabase
        .from('medication_requests')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', practitionerId)
        .in('medication_codeable_concept', await getControlledCodes(ctx.supabase))

      // Distinct patient count — select all subject_references and deduplicate
      const { data: patientRows } = await ctx.supabase
        .from('medication_requests')
        .select('subject_reference')
        .eq('requester_id', practitionerId)
      const patientCount = new Set((patientRows ?? []).map((r: Record<string, unknown>) => r.subject_reference)).size

      // Timeline data: daily prescription counts in the alert's date range (no patient IDs)
      const { data: timelineRows } = await ctx.supabase
        .from('medication_requests')
        .select('authored_on')
        .eq('requester_id', practitionerId)
        .gte('authored_on', r.dateRangeStart as string)
        .lte('authored_on', r.dateRangeEnd as string)
        .in('prescription_status', ['ACTIVE', 'DISPENSED', 'PARTIALLY_DISPENSED'])

      const dailyCounts: Record<string, number> = {}
      for (const row of (timelineRows ?? [])) {
        const day = ((row as Record<string, unknown>).authored_on as string).split('T')[0]
        dailyCounts[day] = (dailyCounts[day] ?? 0) + 1
      }
      const timeline = Object.entries(dailyCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date))

      const result = {
        id: r.id as string,
        practitionerId,
        practitionerName: r.practitionerName as string,
        anomalyType: r.anomalyType as string,
        threshold: r.threshold as number,
        actualValue: r.actualValue as number,
        dateRangeStart: r.dateRangeStart as string,
        dateRangeEnd: r.dateRangeEnd as string,
        severity: r.severity as string,
        status: r.status as string,
        createdAt: r.createdAt as string,
        reviewedBy: (r.reviewedBy as string) ?? null,
        reviewedAt: (r.reviewedAt as string) ?? null,
        reviewAction: (r.reviewAction as string) ?? null,
        reviewReason: (r.reviewReason as string) ?? null,
        prescribingSummary: {
          totalPrescriptions: totalPrescriptions ?? 0,
          controlledSubstanceCount: controlledCount ?? 0,
          patientCount,
        },
        timeline,
      }

      // Audit PHI read — CLAUDE.md rule 6 (no exceptions)
      const detailAudit = new AuditLogger(ctx.supabase)
      try {
        await detailAudit.emit({
          action: 'PHI_READ',
          resourceType: 'PRESCRIBING_ANOMALY',
          resourceId: input.alertId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.getAnomalyDetail', practitionerId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PRESCRIBING_ANOMALY', resourceId: input.alertId })
      }

      return result
    }),

  /**
   * Review an anomaly alert: Dismiss, Escalate, or Suspend Provider.
   * AC #5, #6: All actions audit-logged. Reason required for all.
   * CRITICAL: Provider NOT notified for DISMISS or ESCALATE (PRD PH-021).
   * Provider IS notified only on SUSPEND_PROVIDER.
   */
  reviewAnomaly: adminProcedure
    .input(
      z.object({
        alertId: z.string().uuid(),
        action: z.enum(['DISMISS', 'ESCALATE', 'SUSPEND_PROVIDER']),
        reason: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch current alert
      const { data: alert, error: alertError } = await ctx.supabase
        .from('prescribing_anomalies')
        .select('id, status, practitioner_id')
        .eq('id', input.alertId)
        .single()

      if (alertError || !alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Anomaly alert not found',
        })
      }

      const a = alert as Record<string, unknown>

      // Only UNREVIEWED or ESCALATED alerts can be acted upon
      if (a.status !== 'UNREVIEWED' && a.status !== 'ESCALATED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot review an alert with status ${a.status}`,
        })
      }

      const now = new Date().toISOString()
      const practitionerId = a.practitioner_id as string

      // Determine new status
      const statusMap: Record<string, string> = {
        DISMISS: 'DISMISSED',
        ESCALATE: 'ESCALATED',
        SUSPEND_PROVIDER: 'SUSPENDED',
      }

      // Update alert with optimistic lock — reason stored for ALL actions
      const updateData: Record<string, unknown> = {
        status: statusMap[input.action],
        reviewed_by: ctx.user.sub,
        reviewed_at: now,
        review_action: input.action,
        review_reason: input.reason,
      }

      const { error: updateError, count: updateCount } = await ctx.supabase
        .from('prescribing_anomalies')
        .update(updateData)
        .eq('id', input.alertId)
        .in('status', ['UNREVIEWED', 'ESCALATED'])
        .select('id', { count: 'exact', head: true })

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update anomaly alert',
        })
      }

      if ((updateCount ?? 0) === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Alert was modified by another admin — please refresh',
        })
      }

      // Audit log for the review action
      const auditActionMap: Record<string, string> = {
        DISMISS: 'ANOMALY_ALERT_DISMISSED',
        ESCALATE: 'ANOMALY_ALERT_ESCALATED',
        SUSPEND_PROVIDER: 'ANOMALY_PROVIDER_SUSPENDED',
      }

      // Audit log — CLAUDE.md rule 6: mandatory, no exceptions
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: auditActionMap[input.action]!,
          resourceType: 'PRESCRIBING_ANOMALY',
          resourceId: input.alertId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            anomalyAction: input.action,
            reason: input.reason,
            practitionerId,
          },
        })
      } catch (auditErr) {
        console.error('[AUDIT_FAILURE] Critical audit write failed for anomaly review:', (auditErr as Error).message)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Review action recorded but audit log failed — contact system administrator',
        })
      }

      // SUSPEND_PROVIDER: reuse existing provider suspension flow (AC #10)
      if (input.action === 'SUSPEND_PROVIDER') {
        try {
          // Fetch current practitioner _ultranos
          const { data: practitioner } = await ctx.supabase
            .from('practitioners')
            .select('id, _ultranos')
            .eq('id', practitionerId)
            .single()

          if (!practitioner) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Practitioner not found — cannot complete suspension',
            })
          }

          const currentUltranos = (practitioner as Record<string, unknown>)._ultranos as Record<string, unknown> ?? {}

          // Suspend the provider
          await ctx.supabase
            .from('practitioners')
            .update(db.toRow({
              _ultranos: {
                ...currentUltranos,
                kycStatus: 'SUSPENDED',
                suspendedAt: now,
                suspensionReason: 'Prescribing pattern anomaly review',
              },
              meta: { lastUpdated: now },
            }))
            .eq('id', practitionerId)

          // Terminate active sessions — AC #10: same flow as 22.3/22.4
          try {
            await ctx.supabase
              .from('active_sessions')
              .delete()
              .eq('practitioner_id', practitionerId)
          } catch {
            console.warn('[SESSION_TERMINATION] Failed to clear sessions for practitioner', { practitionerId })
          }

          // Notify provider — ONLY on SUSPEND_PROVIDER (access changes)
          try {
            await ctx.supabase
              .from('notifications')
              .insert(db.toRowRaw({
                recipientRef: practitionerId,
                type: 'PROVIDER_SUSPENDED',
                payload: JSON.stringify({
                  message: 'Your clinical access has been suspended pending investigation.',
                  reason: 'Prescribing pattern review',
                }),
                status: 'QUEUED',
                createdAt: now,
              }, 'non-PHI: notifications'))
          } catch {
            console.warn('[NOTIFICATION_FAILURE]', { practitionerId, action: 'SUSPEND_PROVIDER' })
          }
        } catch (err) {
          if (err instanceof TRPCError) throw err
          console.error('[ANOMALY_REVIEW] Provider suspension failed:', (err as Error).message)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Alert updated but provider suspension failed',
          })
        }
      }

      // CRITICAL: No notification for DISMISS or ESCALATE (PRD PH-021)

      return {
        success: true,
        alertId: input.alertId,
        action: input.action,
        newStatus: statusMap[input.action],
      }
    }),
  // ================================================================
  // Story 23.2: Clinical Safety Metrics & Reporting
  // ================================================================

  /**
   * Get current clinical safety metrics.
   * AC #10: Admin portal Clinical Safety section data source.
   * Returns real-time metrics — no patient identifiers.
   */
  getClinicalSafetyMetrics: adminProcedure
    .query(async ({ ctx }) => {
      const now = new Date()

      // Interaction check completion rate (last 24h)
      const window24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

      const { count: totalRx24h } = await ctx.supabase
        .from('medication_requests')
        .select('id', { count: 'exact', head: true })
        .gte('authored_on', window24h)

      const { count: unavailableRx24h } = await ctx.supabase
        .from('medication_requests')
        .select('id', { count: 'exact', head: true })
        .gte('authored_on', window24h)
        .eq('interaction_check', 'UNAVAILABLE')

      const total24h = totalRx24h ?? 0
      const unavailable24h = unavailableRx24h ?? 0
      const completionRate = total24h > 0 ? ((total24h - unavailable24h) / total24h) * 100 : 100

      // CONTRAINDICATED override rate (7-day rolling)
      const window7d = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString()

      const { count: totalChecks7d } = await ctx.supabase
        .from('medication_requests')
        .select('id', { count: 'exact', head: true })
        .gte('authored_on', window7d)
        .not('interaction_check', 'is', null)

      const { count: blockedOverrides7d } = await ctx.supabase
        .from('medication_requests')
        .select('id', { count: 'exact', head: true })
        .gte('authored_on', window7d)
        .eq('interaction_check', 'BLOCKED')
        .not('interaction_override', 'is', null)

      const checks7d = totalChecks7d ?? 0
      const overrides7d = blockedOverrides7d ?? 0
      const overrideRate = checks7d > 0 ? (overrides7d / checks7d) * 100 : 0

      // Unresolved Tier 1 conflicts
      const { data: tier1Conflicts } = await ctx.supabase
        .from('sync_conflicts')
        .select('id, created_at')
        .eq('status', 'UNRESOLVED')
        .in('resource_type', ['AllergyIntolerance', 'MedicationRequest', 'MedicationStatement', 'Condition'])

      const tier1Count = tier1Conflicts?.length ?? 0
      let oldestTier1AgeHours: number | null = null
      let hasTier1Over24h = false

      if (tier1Conflicts && tier1Conflicts.length > 0) {
        const nowMs = now.getTime()
        for (const c of tier1Conflicts) {
          const ageHours = (nowMs - new Date((c as Record<string, unknown>).created_at as string).getTime()) / 3_600_000
          if (oldestTier1AgeHours === null || ageHours > oldestTier1AgeHours) {
            oldestTier1AgeHours = ageHours
          }
          if (ageHours > 24) hasTier1Over24h = true
        }
      }

      // Audit PHI read — metrics read aggregate data
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'CLINICAL_SAFETY_METRICS',
          resourceId: 'dashboard',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.getClinicalSafetyMetrics' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', endpoint: 'getClinicalSafetyMetrics' })
      }

      return {
        interactionCheckCompletionRate: Math.round(completionRate * 100) / 100,
        completionRateStatus: completionRate >= 100 ? 'OK' as const : 'ALERT' as const,
        contraindicatedOverrideRate: Math.round(overrideRate * 100) / 100,
        overrideRateStatus: overrideRate <= 2 ? 'OK' as const : 'ALERT' as const,
        unresolvedTier1Conflicts: tier1Count,
        oldestTier1AgeHours: oldestTier1AgeHours !== null ? Math.round(oldestTier1AgeHours * 10) / 10 : null,
        tier1Status: hasTier1Over24h ? 'ALERT' as const : (tier1Count > 0 ? 'WARNING' as const : 'OK' as const),
        totalPrescriptions24h: total24h,
        totalChecks7d: checks7d,
        overrides7d,
      }
    }),

  /**
   * Get a monthly clinical safety report by month/year.
   * AC #7: Reports are stored as structured JSON documents.
   */
  getClinicalSafetyReport: adminProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2024).max(2099),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data: report, error } = await ctx.supabase
        .from('clinical_safety_reports')
        .select('id, month, year, report_data, generated_at')
        .eq('month', input.month)
        .eq('year', input.year)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !report) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No clinical safety report found for ${input.year}-${String(input.month).padStart(2, '0')}`,
        })
      }

      // Audit PHI read
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'CLINICAL_SAFETY_REPORT',
          resourceId: (report as Record<string, unknown>).id as string,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.getClinicalSafetyReport', month: input.month, year: input.year },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', endpoint: 'getClinicalSafetyReport' })
      }

      const r = report as Record<string, unknown>
      return {
        id: r.id as string,
        month: r.month as number,
        year: r.year as number,
        report: r.report_data as Record<string, unknown>,
        generatedAt: r.generated_at as string,
      }
    }),

  // ================================================================
  // Audit Chain Integrity Monitoring — Story 23.3 Task 4
  // ================================================================

  /**
   * List audit chain verification history (AC #6).
   * Returns paginated results, last 30 days by default.
   */
  listAuditChainVerifications: adminProcedure
    .input(
      z.object({
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(30),
        daysBack: z.number().int().min(1).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - input.daysBack)

      const { data: rows, error, count } = await ctx.supabase
        .from('audit_chain_verifications')
        .select('*', { count: 'exact' })
        .gte('verified_at', cutoff.toISOString())
        .order('verified_at', { ascending: false })
        .range(input.cursor, input.cursor + input.limit - 1)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query audit chain verifications',
        })
      }

      return {
        verifications: (rows ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          verifiedAt: r.verified_at as string,
          checkedCount: r.checked_count as number,
          valid: r.valid as boolean | null,
          brokenAtEventId: (r.broken_at_event_id as string) ?? null,
          jobDurationMs: r.job_duration_ms as number,
          errorReason: (r.error_reason as string) ?? null,
          isFullVerification: r.is_full_verification as boolean,
          triggeredBy: r.triggered_by as string,
        })),
        total: count ?? 0,
      }
    }),

  /**
   * Get audit chain health status summary (AC #8).
   * Returns: lastVerifiedAt, lastResult, chainHealthy, consecutiveSuccesses.
   */
  getAuditChainStatus: adminProcedure.query(async ({ ctx }) => {
    // Get the most recent verification
    const { data: latest } = await ctx.supabase
      .from('audit_chain_verifications')
      .select('verified_at, valid, checked_count')
      .order('verified_at', { ascending: false })
      .limit(1)
      .single()

    if (!latest) {
      return {
        lastVerifiedAt: null,
        lastResult: null,
        chainHealthy: null,
        consecutiveSuccesses: 0,
        lastCheckedCount: 0,
      }
    }

    // Count consecutive successes (walk backwards from latest, cap at 1000)
    const { data: recentRows } = await ctx.supabase
      .from('audit_chain_verifications')
      .select('valid')
      .order('verified_at', { ascending: false })
      .limit(1000)

    let consecutiveSuccesses = 0
    for (const row of recentRows ?? []) {
      if ((row as Record<string, unknown>).valid === true) {
        consecutiveSuccesses++
      } else {
        break
      }
    }

    const latestRow = latest as Record<string, unknown>
    return {
      lastVerifiedAt: latestRow.verified_at as string,
      lastResult: latestRow.valid as boolean | null,
      chainHealthy: latestRow.valid === true,
      consecutiveSuccesses,
      lastCheckedCount: latestRow.checked_count as number,
    }
  }),

  /**
   * Trigger a full chain verification (AC #9).
   * Capped at 500K entries to prevent OOM. Uses distributed lock to prevent
   * concurrent runs. V1: synchronous with timeout guard.
   */
  triggerFullChainVerification: adminProcedure.mutation(async ({ ctx }) => {
    const { runAuditChainVerify } = await import('@/jobs/audit-chain-verify')
    const { acquireCronLock, releaseCronLock } = await import('@/lib/cron-lock')

    const FULL_VERIFY_LIMIT = 500_000
    const FULL_VERIFY_LOCK_TTL = 600 // 10 minutes
    const FULL_VERIFY_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

    const token = await acquireCronLock('audit-chain-full-verify', FULL_VERIFY_LOCK_TTL)
    if (!token) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'A full verification is already running — please wait and try again',
      })
    }

    try {
      const result = await Promise.race([
        runAuditChainVerify(ctx.supabase, {
          limit: FULL_VERIFY_LIMIT,
          triggeredBy: ctx.user.sub,
          isFullVerification: true,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Full verification timed out after 5 minutes')), FULL_VERIFY_TIMEOUT_MS),
        ),
      ])

      return result
    } finally {
      await releaseCronLock('audit-chain-full-verify', token)
    }
  }),

  /**
   * List available monthly clinical safety reports.
   * AC #10: Link to monthly reports from admin portal.
   */
  listClinicalSafetyReports: adminProcedure
    .input(
      z.object({
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(50).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data: reports, error, count } = await ctx.supabase
        .from('clinical_safety_reports')
        .select('id, month, year, generated_at', { count: 'exact' })
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .range(input.cursor, input.cursor + input.limit - 1)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query clinical safety reports',
        })
      }

      return {
        reports: (reports ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          month: r.month as number,
          year: r.year as number,
          generatedAt: r.generated_at as string,
        })),
        total: count ?? 0,
      }
    }),
})

// ================================================================
// SLA Calculation Helper
// ================================================================

/**
 * Weekend days configurable via PLATFORM_WEEKEND_DAYS env var.
 * Default: '5,6' (Friday=5, Saturday=6) for MENA/Central Asia.
 * Western: '0,6' (Sunday=0, Saturday=6).
 * No holiday calendar for V1 — PRD requirements OPD-002 / PH-001.
 */
const WEEKEND_DAYS: Set<number> = new Set(
  (process.env.PLATFORM_WEEKEND_DAYS ?? '5,6')
    .split(',')
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => !isNaN(d) && d >= 0 && d <= 6),
)

/**
 * Calculate the SLA deadline for a KYC submission.
 * Business days = exclude configured weekend days.
 */
function calculateSlaDeadline(submittedAt: string): {
  deadline: string
  breached: boolean
  remainingHours: number | null
} {
  const submitted = new Date(submittedAt)
  let businessDays = 0
  const deadline = new Date(submitted)

  while (businessDays < 3) {
    deadline.setDate(deadline.getDate() + 1)
    const day = deadline.getDay()
    if (!WEEKEND_DAYS.has(day)) {
      businessDays++
    }
  }

  const now = new Date()
  const breached = now > deadline
  const remainingMs = deadline.getTime() - now.getTime()
  // P16: Use Math.ceil so <1h remaining shows 1, not 0
  const remainingHours = breached ? null : Math.max(1, Math.ceil(remainingMs / 3_600_000))

  return {
    deadline: deadline.toISOString(),
    breached,
    remainingHours,
  }
}

/**
 * Map a raw kyc_submissions row (with joined practitioners) to a KycQueueEntry DTO.
 */
function mapKycQueueEntry(row: Record<string, unknown>) {
  const practitioner = row.practitioners as {
    name: Array<{ family: string; given: string[]; text?: string }>
    identifier: Array<{ system: string; value: string }>
    _ultranos: { kycStatus: string }
  }
  const pName = practitioner?.name?.[0]
  const providerName = pName?.text ?? `${pName?.given?.join(' ') ?? ''} ${pName?.family ?? ''}`.trim()

  const submittedAt = row.submitted_at as string
  const sla = calculateSlaDeadline(submittedAt)

  // P9: Extract first document thumbnail key for queue preview
  const docs = (row.documents as Array<{ type: string; storageKey: string }>) ?? []
  const licenseDoc = docs.find((d) => d.type === 'MEDICAL_LICENSE') ?? docs[0]

  return {
    submissionId: row.id as string,
    practitionerId: row.practitioner_id as string,
    providerName,
    submittedAt,
    registryNumber: row.registry_number as string,
    registryVerificationStatus: (row as Record<string, unknown>).registry_verification_status as string | null ?? null,
    licenseDocumentKey: licenseDoc?.storageKey ?? null,
    kycStatus: practitioner?._ultranos?.kycStatus ?? 'PENDING_VERIFICATION',
    slaDeadline: sla.deadline,
    slaBreached: sla.breached,
    slaRemainingHours: sla.remainingHours,
  }
}

/**
 * Emit audit event for KYC list reads — extracted to avoid duplication.
 */
async function emitKycListAudit(ctx: { supabase: SupabaseClient; user: { sub: string; role: string; sessionId: string } }, statusFilter: string, resultCount: number) {
  const audit = new AuditLogger(ctx.supabase)
  try {
    await audit.emit({
      action: 'PHI_READ',
      resourceType: 'KYC_SUBMISSION',
      resourceId: 'batch',
      actorId: ctx.user.sub,
      actorRole: ctx.user.role,
      outcome: 'SUCCESS',
      sessionId: ctx.user.sessionId,
      metadata: { endpoint: 'admin.listKycSubmissions', statusFilter, resultCount },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'KYC_SUBMISSION', endpoint: 'listKycSubmissions' })
  }
}

// ================================================================
// Controlled Substance Helper — Story 22.6
// ================================================================

/** Cache controlled substance codes to avoid repeated DB queries within a request. */
let _controlledCodesCache: string[] | null = null
let _controlledCodesCacheTs = 0
const CACHE_TTL_MS = 60_000

async function getControlledCodes(supabase: SupabaseClient): Promise<string[]> {
  const now = Date.now()
  if (_controlledCodesCache && now - _controlledCodesCacheTs < CACHE_TTL_MS) {
    return _controlledCodesCache
  }

  const { data } = await supabase
    .from('vocabulary_medications')
    .select('code')
    .eq('is_controlled_substance', true)

  _controlledCodesCache = (data ?? []).map((d: { code: string }) => d.code)
  _controlledCodesCacheTs = now
  return _controlledCodesCache
}
