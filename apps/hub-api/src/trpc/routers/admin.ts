import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTRPCRouter, protectedProcedure, baseProcedure } from '../init'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'
import { ROLE_MODULE_MAP, MODULE_DISPLAY_NAMES } from '@ultranos/shared-types'
import crypto from 'crypto'

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

// ================================================================
// EPIC C: Default Thresholds & Module Settings
// ================================================================

const DEFAULT_THRESHOLDS = {
  kycReviewSlaDays: 7,
  controlledSubstanceDailyLimit: 10,
  drugFrequencyThresholdPct: 20,
  licenseExpiryWarningDays: [60, 30, 7],
}

const DEFAULT_MODULE_SETTINGS: Record<string, Record<string, unknown>> = {
  OPD_LITE: { consultationLanguages: ['en'], defaultSoapTemplate: 'Standard', aiAssistedNotes: true },
  PHARMACY_LITE: { requireSignatureOnDispense: true, allowPartialDispense: false, controlledSubstanceDoubleVerify: true },
  LAB_LITE: { autoNotifyProviderOnResult: true, resultRetentionDays: 365 },
}

// ================================================================
// Helpers — Task 3 & 4: Audit browsing, data exports
// ================================================================

/**
 * PHI keys that must be redacted from audit metadata before returning to the client.
 * CLAUDE.md rule 1: PHI must never appear in logs, error messages, or output.
 */
const PHI_METADATA_KEYS = new Set([
  'patient_name', 'diagnosis', 'medication_name', 'allergy',
  'note_content', 'clinical_note', 'prescription_content',
])

/**
 * Sanitize audit event metadata by redacting PHI keys and truncating long freeform text.
 */
function sanitizeMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (PHI_METADATA_KEYS.has(key)) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'string' && value.length > 100) {
      sanitized[key] = '[REDACTED — freeform text]'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

/**
 * Build a base64-encoded CSV export from headers and row data.
 * Shared by all export procedures.
 */
function buildCsvExport(headers: string[], rows: string[][], prefix: string) {
  const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`
  const csv = [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  return {
    data: Buffer.from(csv).toString('base64'),
    filename: `${prefix}-${new Date().toISOString().split('T')[0]}.csv`,
    mimeType: 'text/csv',
  }
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

    // --- SLA-breached KYC count ---
    const { data: pendingKycRows } = await ctx.supabase
      .from('kyc_submissions')
      .select('submitted_at')
      .eq('status', 'PENDING')

    let slaBreachedKycCount = 0
    for (const row of (pendingKycRows ?? [])) {
      const sla = calculateSlaDeadline((row as Record<string, unknown>).submitted_at as string)
      if (sla.breached) slaBreachedKycCount++
    }

    // --- Oldest pending lab (days) ---
    const { data: oldestLab } = await ctx.supabase
      .from('labs')
      .select('created_at')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    let oldestPendingLabDays: number | null = null
    if (oldestLab) {
      const labCreated = new Date((oldestLab as Record<string, unknown>).created_at as string)
      oldestPendingLabDays = Math.floor((Date.now() - labCreated.getTime()) / 86_400_000)
    }

    // --- High severity alert count ---
    const { count: highSeverityAlertCount } = await ctx.supabase
      .from('prescribing_anomalies')
      .select('id', { count: 'exact', head: true })
      .eq('severity', 'HIGH')
      .in('status', ['UNREVIEWED', 'ESCALATED'])

    // --- Audit chain health ---
    const { data: latestVerification } = await ctx.supabase
      .from('audit_chain_verifications')
      .select('valid')
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const auditChainHealthy = latestVerification
      ? (latestVerification as Record<string, unknown>).valid === true
      : null

    // --- User counts breakdown ---
    const { count: totalUsers } = await ctx.supabase
      .from('practitioners')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.user.orgId)

    const { count: activeUsers } = await ctx.supabase
      .from('practitioners')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.user.orgId)
      .eq('status', 'ACTIVE')

    const { count: suspendedUsers } = await ctx.supabase
      .from('practitioners')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.user.orgId)
      .eq('status', 'SUSPENDED')

    const { count: pendingInviteUsers } = await ctx.supabase
      .from('practitioners')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.user.orgId)
      .eq('status', 'PENDING_INVITE')

    return {
      pendingKycReviews: pendingKycReviews ?? 0,
      pendingLabApprovals: pendingLabApprovals ?? 0,
      activeAlerts: unreviewedAlerts ?? 0,
      recentAuditEvents: 0,
      slaBreachedKycCount,
      oldestPendingLabDays,
      highSeverityAlertCount: highSeverityAlertCount ?? 0,
      auditChainHealthy,
      userCounts: {
        total: totalUsers ?? 0,
        active: activeUsers ?? 0,
        suspended: suspendedUsers ?? 0,
        pendingInvite: pendingInviteUsers ?? 0,
        withoutMfa: 0, // MFA count requires batch Auth API — deferred
      },
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
        search: z.string().optional(),
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

      // Epic C: search filter — filter by practitioner name/email
      if (input.search) {
        const term = `%${input.search}%`
        query = query.or(`given_name.ilike.${term},family_name.ilike.${term},telecom_email.ilike.${term}`)
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
        search: z.string().optional(),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      // For SLA_BREACHED we need all PENDING rows to filter by SLA, so fetch without pagination first
      // For PENDING, filter by status=PENDING. For ALL, no status filter.
      if (input.status === 'SLA_BREACHED') {
        // Fetch all PENDING submissions (no pagination) to compute SLA breach server-side
        let slaQuery = ctx.supabase
          .from('kyc_submissions')
          .select(`
            id, practitioner_id, status, registry_number, submitted_at,
            registry_verification_status, documents,
            practitioners!inner(name, identifier, _ultranos)
          `)
          .eq('status', 'PENDING')
          .eq('org_id', ctx.user.orgId)
          .order('submitted_at', { ascending: true })

        // Epic C: search filter — filter by practitioner name/email via the joined practitioners
        if (input.search) {
          const term = `%${input.search}%`
          slaQuery = slaQuery.or(`given_name.ilike.${term},family_name.ilike.${term},telecom_email.ilike.${term}`, { referencedTable: 'practitioners' })
        }

        const { data: allRows, error: allError } = await slaQuery

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

      // Epic C: search filter — filter by practitioner name/email via the joined practitioners
      if (input.search) {
        const term = `%${input.search}%`
        query = query.or(`given_name.ilike.${term},family_name.ilike.${term},telecom_email.ilike.${term}`, { referencedTable: 'practitioners' })
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

      // Epic C: Resolve assignee/escalator/resolver names from practitioners
      const escalationUserIds = [
        r.assignedTo as string | null,
        r.escalatedBy as string | null,
        r.resolvedBy as string | null,
      ].filter(Boolean) as string[]

      const escalationNames: Record<string, string> = {}
      if (escalationUserIds.length > 0) {
        const { data: nameRows } = await ctx.supabase
          .from('practitioners')
          .select('id, given_name, family_name')
          .in('id', escalationUserIds)
        for (const nr of (nameRows ?? []) as Array<Record<string, unknown>>) {
          escalationNames[nr.id as string] = `${nr.given_name ?? ''} ${nr.family_name ?? ''}`.trim()
        }
      }

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
        // Epic C: Escalation fields
        assigneeName: r.assignedTo ? (escalationNames[r.assignedTo as string] ?? null) : null,
        escalationPriority: (r.escalationPriority as string) ?? null,
        escalationNote: (r.escalationNote as string) ?? null,
        escalatedByName: r.escalatedBy ? (escalationNames[r.escalatedBy as string] ?? null) : null,
        escalatedAt: (r.escalatedAt as string) ?? null,
        resolutionNote: (r.resolutionNote as string) ?? null,
        resolvedByName: r.resolvedBy ? (escalationNames[r.resolvedBy as string] ?? null) : null,
        resolvedAt: (r.resolvedAt as string) ?? null,
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

  // ================================================================
  // Task 2: User Management Procedures
  // ================================================================

  /**
   * List users (practitioners) with pagination, role/status/search filters.
   * Scoped to caller's org via org_id.
   */
  listUsers: adminProcedure
    .input(
      z.object({
        role: z.string().optional(),
        status: z.enum(['ALL', 'ACTIVE', 'SUSPENDED', 'PENDING_INVITE']).default('ALL'),
        search: z.string().max(200).optional(),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('practitioners')
        .select('id, auth_user_id, given_name, family_name, role, status, telecom_email, last_login_at, created_at, suspended_at, suspension_reason', { count: 'exact' })
        .eq('org_id', ctx.user.orgId)
        .order('created_at', { ascending: false })
        .range(input.cursor, input.cursor + input.limit - 1)

      if (input.status !== 'ALL') {
        query = query.eq('status', input.status)
      }

      if (input.role) {
        query = query.eq('role', input.role)
      }

      if (input.search && input.search.trim()) {
        const term = `%${input.search.trim()}%`
        query = query.or(`given_name.ilike.${term},family_name.ilike.${term},telecom_email.ilike.${term}`)
      }

      const { data: rows, error, count } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query users',
        })
      }

      const users = (rows ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        authUserId: (row.auth_user_id as string) ?? null,
        name: `${(row.given_name as string) ?? ''} ${(row.family_name as string) ?? ''}`.trim(),
        givenName: (row.given_name as string) ?? '',
        familyName: (row.family_name as string) ?? '',
        email: (row.telecom_email as string) ?? null,
        role: (row.role as string) ?? '',
        status: (row.status as string) ?? 'ACTIVE',
        lastLoginAt: (row.last_login_at as string) ?? null,
        createdAt: (row.created_at as string) ?? null,
        suspendedAt: (row.suspended_at as string) ?? null,
        suspensionReason: (row.suspension_reason as string) ?? null,
      }))

      // Audit PHI read — CLAUDE.md rule 6
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'USER_ACCOUNT',
          resourceId: 'batch',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.listUsers', resultCount: users.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'USER_ACCOUNT', endpoint: 'listUsers' })
      }

      return {
        users,
        total: count ?? 0,
        cursor: input.cursor,
        limit: input.limit,
      }
    }),

  /**
   * Get single user detail by practitioner ID.
   * Scoped to caller's org via org_id.
   */
  getUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: user, error } = await ctx.supabase
        .from('practitioners')
        .select('id, auth_user_id, given_name, family_name, role, status, telecom_email, last_login_at, created_at, suspended_at, suspension_reason, suspended_by, invited_by, pending_suspension_date')
        .eq('id', input.userId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (error || !user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        })
      }

      // Check MFA status via Supabase Auth if auth_user_id exists
      let hasMfa = false
      if (user.auth_user_id) {
        try {
          const { data: authUser } = await ctx.supabase.auth.admin.getUserById(user.auth_user_id as string)
          const factors = (authUser?.user as any)?.factors ?? []
          hasMfa = factors.some((f: any) => f.status === 'verified')
        } catch {
          // Best effort — MFA status is informational
        }
      }

      // Audit PHI read
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'USER_ACCOUNT',
          resourceId: input.userId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.getUser' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'USER_ACCOUNT', resourceId: input.userId })
      }

      return {
        id: user.id as string,
        authUserId: (user.auth_user_id as string) ?? null,
        name: `${(user.given_name as string) ?? ''} ${(user.family_name as string) ?? ''}`.trim(),
        givenName: (user.given_name as string) ?? '',
        familyName: (user.family_name as string) ?? '',
        email: (user.telecom_email as string) ?? null,
        role: (user.role as string) ?? '',
        status: (user.status as string) ?? 'ACTIVE',
        lastLoginAt: (user.last_login_at as string) ?? null,
        createdAt: (user.created_at as string) ?? null,
        suspendedAt: (user.suspended_at as string) ?? null,
        suspensionReason: (user.suspension_reason as string) ?? null,
        suspendedBy: (user.suspended_by as string) ?? null,
        invitedBy: (user.invited_by as string) ?? null,
        pendingSuspensionDate: (user.pending_suspension_date as string) ?? null,
        hasMfa,
      }
    }),

  /**
   * Create a new user: Supabase Auth user + practitioner record.
   * Validates role against org subscriptions. Generates invite link.
   */
  createUser: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(1).max(200),
        role: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate email within org
      const { data: existingUser } = await ctx.supabase
        .from('practitioners')
        .select('id')
        .eq('org_id', ctx.user.orgId)
        .eq('telecom_email', input.email)
        .maybeSingle()

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A user with this email already exists in your organization',
        })
      }

      // Validate role is known
      if (!(input.role in ROLE_MODULE_MAP)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Unknown role: ${input.role}`,
        })
      }

      // Validate role against org subscriptions
      const requiredModule = ROLE_MODULE_MAP[input.role]
      if (requiredModule) {
        const { data: sub } = await ctx.supabase
          .from('org_subscriptions')
          .select('id')
          .eq('org_id', ctx.user.orgId)
          .eq('module_code', requiredModule)
          .in('status', ['ACTIVE', 'TRIAL'])
          .maybeSingle()

        if (!sub) {
          const moduleName = MODULE_DISPLAY_NAMES[requiredModule] ?? requiredModule
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Subscribe to ${moduleName} to add ${input.role} users`,
          })
        }
      }

      // Split name into given_name / family_name
      const nameParts = input.name.trim().split(/\s+/)
      const familyName = nameParts.length > 1 ? nameParts.pop()! : ''
      const givenName = nameParts.join(' ')

      // Generate secure random password (never sent to client)
      const randomPassword = crypto.randomUUID() + crypto.randomUUID()

      // Create Supabase Auth user
      const { data: authResult, error: authError } = await ctx.supabase.auth.admin.createUser({
        email: input.email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          role: input.role,
          org_id: ctx.user.orgId,
          given_name: givenName,
          family_name: familyName,
        },
      })

      if (authError || !authResult?.user) {
        // Check for duplicate in Supabase Auth
        if (authError?.message?.includes('already been registered')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A user with this email already exists',
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create auth user',
        })
      }

      const authUserId = authResult.user.id

      // Create practitioner record
      const now = new Date().toISOString()
      const { data: practitioner, error: practError } = await ctx.supabase
        .from('practitioners')
        .insert({
          auth_user_id: authUserId,
          given_name: givenName,
          family_name: familyName,
          telecom_email: input.email,
          role: input.role,
          org_id: ctx.user.orgId,
          status: 'PENDING_INVITE',
          invited_by: ctx.user.sub,
          created_at: now,
        })
        .select('id')
        .single()

      if (practError || !practitioner) {
        // Compensating action: remove auth user if practitioner creation fails
        try {
          await ctx.supabase.auth.admin.deleteUser(authUserId)
        } catch {
          console.warn('[COMPENSATION_FAILURE] Failed to delete auth user after practitioner creation failure', { authUserId })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create practitioner record',
        })
      }

      // Generate invite link via recovery link
      let setupLink: string | null = null
      try {
        const { data: linkData } = await ctx.supabase.auth.admin.generateLink({
          type: 'recovery',
          email: input.email,
        })
        setupLink = linkData?.properties?.action_link ?? null
      } catch {
        console.warn('[INVITE_LINK_FAILURE]', { email: '[REDACTED]' })
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'USER_CREATED',
          resourceType: 'USER_ACCOUNT',
          resourceId: practitioner.id as string,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            role: input.role,
            authUserId,
            hasSetupLink: !!setupLink,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'USER_CREATED', resourceType: 'USER_ACCOUNT', resourceId: practitioner.id })
      }

      return {
        userId: practitioner.id as string,
        name: input.name,
        email: input.email,
        role: input.role,
        status: 'PENDING_INVITE',
        setupLink,
        emailSent: false,
      }
    }),

  /**
   * Update a user's name and/or role.
   * Role changes validated against org subscriptions.
   */
  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        role: z.string().min(1).optional(),
      }).refine(
        (data) => data.name || data.role,
        { message: 'At least one of name or role must be provided' },
      ),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user exists and belongs to org
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('practitioners')
        .select('id, given_name, family_name, role, status, auth_user_id')
        .eq('id', input.userId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        })
      }

      const updateData: Record<string, unknown> = {}

      // Handle name change
      if (input.name) {
        const nameParts = input.name.trim().split(/\s+/)
        const familyName = nameParts.length > 1 ? nameParts.pop()! : ''
        const givenName = nameParts.join(' ')
        updateData.given_name = givenName
        updateData.family_name = familyName
      }

      // Handle role change
      if (input.role && input.role !== existing.role) {
        if (!(input.role in ROLE_MODULE_MAP)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown role: ${input.role}`,
          })
        }

        const requiredModule = ROLE_MODULE_MAP[input.role]
        if (requiredModule) {
          const { data: sub } = await ctx.supabase
            .from('org_subscriptions')
            .select('id')
            .eq('org_id', ctx.user.orgId)
            .eq('module_code', requiredModule)
            .in('status', ['ACTIVE', 'TRIAL'])
            .maybeSingle()

          if (!sub) {
            const moduleName = MODULE_DISPLAY_NAMES[requiredModule] ?? requiredModule
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: `Subscribe to ${moduleName} to assign the ${input.role} role`,
            })
          }
        }

        updateData.role = input.role

        // Update auth user metadata if auth_user_id exists
        if (existing.auth_user_id) {
          try {
            await ctx.supabase.auth.admin.updateUserById(existing.auth_user_id as string, {
              user_metadata: { role: input.role },
            })
          } catch {
            console.warn('[AUTH_METADATA_UPDATE_FAILURE]', { userId: input.userId })
          }
        }
      }

      if (Object.keys(updateData).length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No changes to apply',
        })
      }

      const { error: updateError } = await ctx.supabase
        .from('practitioners')
        .update(updateData)
        .eq('id', input.userId)
        .eq('org_id', ctx.user.orgId)

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user',
        })
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'USER_UPDATED',
          resourceType: 'USER_ACCOUNT',
          resourceId: input.userId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            updatedFields: Object.keys(updateData),
            ...(input.role ? { previousRole: existing.role, newRole: input.role } : {}),
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'USER_UPDATED', resourceType: 'USER_ACCOUNT', resourceId: input.userId })
      }

      return { success: true, userId: input.userId }
    }),

  /**
   * Suspend a user: set status to SUSPENDED, ban in Supabase Auth.
   */
  suspendUser: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        reason: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('practitioners')
        .select('id, status, auth_user_id, role')
        .eq('id', input.userId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        })
      }

      if (existing.status === 'SUSPENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User is already suspended',
        })
      }

      const now = new Date().toISOString()

      // Update practitioner status with optimistic lock
      const { error: updateError, count: updateCount } = await ctx.supabase
        .from('practitioners')
        .update({
          status: 'SUSPENDED',
          suspended_at: now,
          suspension_reason: input.reason,
          suspended_by: ctx.user.sub,
        })
        .eq('id', input.userId)
        .eq('org_id', ctx.user.orgId)
        .neq('status', 'SUSPENDED')
        .select('id', { count: 'exact', head: true })

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to suspend user',
        })
      }

      if ((updateCount ?? 0) === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User status was changed by another admin — please refresh',
        })
      }

      // Ban in Supabase Auth
      if (existing.auth_user_id) {
        try {
          await ctx.supabase.auth.admin.updateUserById(existing.auth_user_id as string, {
            ban_duration: '876000h',
            user_metadata: { status: 'SUSPENDED' },
          })
        } catch {
          console.warn('[AUTH_BAN_FAILURE]', { userId: input.userId })
        }
      }

      // Terminate active sessions
      try {
        await ctx.supabase
          .from('active_sessions')
          .delete()
          .eq('practitioner_id', input.userId)
      } catch {
        console.warn('[SESSION_TERMINATION] Failed to clear sessions', { userId: input.userId })
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'USER_SUSPENDED',
          resourceType: 'USER_ACCOUNT',
          resourceId: input.userId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { reason: input.reason },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'USER_SUSPENDED', resourceType: 'USER_ACCOUNT', resourceId: input.userId })
      }

      return { success: true, userId: input.userId, status: 'SUSPENDED' }
    }),

  /**
   * Reactivate a suspended user: set status to ACTIVE, unban in Supabase Auth.
   * Validates module subscription is still active for the user's role.
   */
  reactivateUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('practitioners')
        .select('id, status, auth_user_id, role')
        .eq('id', input.userId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        })
      }

      if (existing.status !== 'SUSPENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot reactivate a user with status ${existing.status} — expected SUSPENDED`,
        })
      }

      // Validate role's module subscription is still active
      const requiredModule = ROLE_MODULE_MAP[existing.role as string]
      if (requiredModule) {
        const { data: sub } = await ctx.supabase
          .from('org_subscriptions')
          .select('id')
          .eq('org_id', ctx.user.orgId)
          .eq('module_code', requiredModule)
          .in('status', ['ACTIVE', 'TRIAL'])
          .maybeSingle()

        if (!sub) {
          const moduleName = MODULE_DISPLAY_NAMES[requiredModule] ?? requiredModule
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Cannot reactivate — ${moduleName} subscription is not active`,
          })
        }
      }

      // Update practitioner status
      const { error: updateError, count: updateCount } = await ctx.supabase
        .from('practitioners')
        .update({
          status: 'ACTIVE',
          suspended_at: null,
          suspension_reason: null,
          suspended_by: null,
          pending_suspension_date: null,
        })
        .eq('id', input.userId)
        .eq('org_id', ctx.user.orgId)
        .eq('status', 'SUSPENDED')
        .select('id', { count: 'exact', head: true })

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reactivate user',
        })
      }

      if ((updateCount ?? 0) === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User status was changed by another admin — please refresh',
        })
      }

      // Unban in Supabase Auth
      if (existing.auth_user_id) {
        try {
          await ctx.supabase.auth.admin.updateUserById(existing.auth_user_id as string, {
            ban_duration: 'none',
            user_metadata: { status: 'ACTIVE' },
          })
        } catch {
          console.warn('[AUTH_UNBAN_FAILURE]', { userId: input.userId })
        }
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'USER_REACTIVATED',
          resourceType: 'USER_ACCOUNT',
          resourceId: input.userId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { previousStatus: 'SUSPENDED' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'USER_REACTIVATED', resourceType: 'USER_ACCOUNT', resourceId: input.userId })
      }

      return { success: true, userId: input.userId, status: 'ACTIVE' }
    }),

  /**
   * Resend invitation for PENDING_INVITE users.
   * Re-generates a password reset link.
   */
  resendInvitation: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('practitioners')
        .select('id, status, auth_user_id, telecom_email')
        .eq('id', input.userId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        })
      }

      if (existing.status !== 'PENDING_INVITE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot resend invitation for a user with status ${existing.status} — expected PENDING_INVITE`,
        })
      }

      if (!existing.telecom_email) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User has no email address on record',
        })
      }

      let setupLink: string | null = null
      try {
        const { data: linkData } = await ctx.supabase.auth.admin.generateLink({
          type: 'recovery',
          email: existing.telecom_email as string,
        })
        setupLink = linkData?.properties?.action_link ?? null
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate invitation link',
        })
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'INVITATION_RESENT',
          resourceType: 'USER_ACCOUNT',
          resourceId: input.userId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {},
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'INVITATION_RESENT', resourceType: 'USER_ACCOUNT', resourceId: input.userId })
      }

      return {
        success: true,
        userId: input.userId,
        setupLink,
        emailSent: false,
      }
    }),

  /**
   * Trigger password reset email for ACTIVE users.
   */
  resetUserPassword: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('practitioners')
        .select('id, status, telecom_email')
        .eq('id', input.userId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        })
      }

      if (existing.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot reset password for a user with status ${existing.status} — expected ACTIVE`,
        })
      }

      if (!existing.telecom_email) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User has no email address on record',
        })
      }

      let resetLink: string | null = null
      try {
        const { data: linkData } = await ctx.supabase.auth.admin.generateLink({
          type: 'recovery',
          email: existing.telecom_email as string,
        })
        resetLink = linkData?.properties?.action_link ?? null
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate password reset link',
        })
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PASSWORD_RESET_TRIGGERED',
          resourceType: 'USER_ACCOUNT',
          resourceId: input.userId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {},
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PASSWORD_RESET_TRIGGERED', resourceType: 'USER_ACCOUNT', resourceId: input.userId })
      }

      return {
        success: true,
        userId: input.userId,
        resetLink,
        emailSent: false,
      }
    }),

  // ================================================================
  // Task 3: Organization & Notification Procedures
  // ================================================================

  /**
   * Get current admin's profile from practitioners table.
   */
  getProfile: adminProcedure.query(async ({ ctx }) => {
    const { data: profile, error } = await ctx.supabase
      .from('practitioners')
      .select('id, auth_user_id, given_name, family_name, role, telecom_email, created_at')
      .eq('auth_user_id', ctx.user.sub)
      .single()

    if (error || !profile) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Admin profile not found',
      })
    }

    return {
      id: profile.id as string,
      authUserId: (profile.auth_user_id as string) ?? null,
      name: `${(profile.given_name as string) ?? ''} ${(profile.family_name as string) ?? ''}`.trim(),
      givenName: (profile.given_name as string) ?? '',
      familyName: (profile.family_name as string) ?? '',
      email: (profile.telecom_email as string) ?? null,
      role: (profile.role as string) ?? '',
      createdAt: (profile.created_at as string) ?? null,
    }
  }),

  /**
   * Update the current admin's name.
   */
  updateAdminProfile: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const nameParts = input.name.trim().split(/\s+/)
      const familyName = nameParts.length > 1 ? nameParts.pop()! : ''
      const givenName = nameParts.join(' ')

      const { error } = await ctx.supabase
        .from('practitioners')
        .update({
          given_name: givenName,
          family_name: familyName,
        })
        .eq('auth_user_id', ctx.user.sub)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update admin profile',
        })
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PROFILE_UPDATED',
          resourceType: 'USER_ACCOUNT',
          resourceId: ctx.user.sub,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { updatedFields: ['given_name', 'family_name'] },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PROFILE_UPDATED', resourceType: 'USER_ACCOUNT' })
      }

      return { success: true, name: input.name }
    }),

  /**
   * Get full organization details including timezone.
   */
  getOrganization: adminProcedure.query(async ({ ctx }) => {
    if (!ctx.user.orgId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'org_id not available from JWT',
      })
    }

    const { data: org, error } = await ctx.supabase
      .from('organizations')
      .select('id, name, country_code, billing_email, status, trial_ends_at, timezone, created_at')
      .eq('id', ctx.user.orgId)
      .single()

    if (error || !org) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      })
    }

    return {
      id: org.id as string,
      name: org.name as string,
      countryCode: (org.country_code as string) ?? null,
      billingEmail: (org.billing_email as string) ?? null,
      status: org.status as string,
      trialEndsAt: (org.trial_ends_at as string) ?? null,
      timezone: (org.timezone as string) ?? 'UTC',
      createdAt: (org.created_at as string) ?? null,
    }
  }),

  /**
   * Update organization details (name, country_code, billing_email, timezone).
   * All changes are audit logged.
   */
  updateOrganization: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200).optional(),
        countryCode: z.string().min(2).max(3).optional(),
        billingEmail: z.string().email().optional(),
        timezone: z.string().min(1).max(100).optional(),
      }).refine(
        (data) => data.name || data.countryCode || data.billingEmail || data.timezone,
        { message: 'At least one field must be provided' },
      ),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id not available from JWT',
        })
      }

      const updateData: Record<string, unknown> = {}
      if (input.name !== undefined) updateData.name = input.name
      if (input.countryCode !== undefined) updateData.country_code = input.countryCode
      if (input.billingEmail !== undefined) updateData.billing_email = input.billingEmail
      if (input.timezone !== undefined) updateData.timezone = input.timezone

      const { error } = await ctx.supabase
        .from('organizations')
        .update(updateData)
        .eq('id', ctx.user.orgId)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update organization',
        })
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'ORGANIZATION_UPDATED',
          resourceType: 'ORGANIZATION',
          resourceId: ctx.user.orgId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { updatedFields: Object.keys(updateData) },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'ORGANIZATION_UPDATED', resourceType: 'ORGANIZATION', resourceId: ctx.user.orgId })
      }

      return { success: true }
    }),

  /**
   * Get notification preferences for the current admin user.
   * Returns defaults if no preferences are saved.
   */
  getNotificationPreferences: adminProcedure.query(async ({ ctx }) => {
    const { data: prefs } = await ctx.supabase
      .from('notification_preferences')
      .select('preferences, updated_at')
      .eq('admin_user_id', ctx.user.sub)
      .maybeSingle()

    const DEFAULT_PREFERENCES = {
      kycSubmission: true,
      labRegistration: true,
      anomalyAlert: true,
      licenseExpiry: true,
      auditChainFailure: true,
      userSuspension: true,
      subscriptionChange: true,
    }

    if (!prefs) {
      return {
        preferences: DEFAULT_PREFERENCES,
        updatedAt: null,
      }
    }

    return {
      preferences: { ...DEFAULT_PREFERENCES, ...(prefs.preferences as Record<string, boolean>) },
      updatedAt: prefs.updated_at as string,
    }
  }),

  /**
   * Upsert notification preferences for the current admin user.
   */
  updateNotificationPreferences: adminProcedure
    .input(
      z.object({
        preferences: z.record(z.string(), z.boolean()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      const { error } = await ctx.supabase
        .from('notification_preferences')
        .upsert({
          admin_user_id: ctx.user.sub,
          preferences: input.preferences,
          updated_at: now,
        }, { onConflict: 'admin_user_id' })

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update notification preferences',
        })
      }

      return { success: true, updatedAt: now }
    }),

  // ================================================================
  // Task 4: Recent Activity
  // ================================================================

  /**
   * Recent admin activity from audit_log.
   * Returns last N admin-initiated actions with human-readable descriptions.
   */
  recentActivity: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Query audit_log for this admin's own recent actions
      const { data: rows, error } = await ctx.supabase
        .from('audit_log')
        .select('id, timestamp, actor_id, actor_role, action, resource_type, resource_id, outcome, metadata')
        .eq('actor_role', 'ADMIN')
        .eq('actor_id', ctx.user.sub)
        .order('timestamp', { ascending: false })
        .limit(input.limit)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query recent activity',
        })
      }

      const activities = (rows ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        timestamp: row.timestamp as string,
        actorId: row.actor_id as string,
        action: row.action as string,
        resourceType: row.resource_type as string,
        resourceId: row.resource_id as string,
        outcome: row.outcome as string,
        description: describeAuditAction(
          row.action as string,
          row.resource_type as string,
          row.metadata as Record<string, unknown> | null,
        ),
      }))

      return { activities }
    }),

  // ================================================================
  // Task 3: Audit Event Browsing & Export
  // ================================================================

  /**
   * List audit events with pagination, date range, action type, and outcome filters.
   * Scoped to org by filtering actor_id IN (practitioners for this org).
   * Joins with practitioners to resolve actor names.
   * Metadata is sanitized to strip PHI — CLAUDE.md rule 1.
   */
  listAuditEvents: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        action: z.string().optional(),
        outcome: z.enum(['ALL', 'SUCCESS', 'FAILURE']).default('ALL'),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }).refine(
        (data) => {
          const start = new Date(data.startDate)
          const end = new Date(data.endDate)
          const diffDays = (end.getTime() - start.getTime()) / 86_400_000
          return diffDays >= 0 && diffDays <= 90
        },
        { message: 'Date range must be between 0 and 90 days' },
      ),
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id not available from JWT',
        })
      }

      // Get practitioner IDs for this org to scope the audit query
      const { data: orgPractitioners, error: practError } = await ctx.supabase
        .from('practitioners')
        .select('id, given_name, family_name')
        .eq('org_id', orgId)

      if (practError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query org practitioners',
        })
      }

      const practitionerIds = (orgPractitioners ?? []).map((p) => (p as Record<string, unknown>).id as string)
      const practitionerNameMap = new Map<string, string>()
      for (const p of orgPractitioners ?? []) {
        const pr = p as Record<string, unknown>
        const name = `${(pr.given_name as string) ?? ''} ${(pr.family_name as string) ?? ''}`.trim()
        practitionerNameMap.set(pr.id as string, name)
      }

      if (practitionerIds.length === 0) {
        return { events: [], total: 0, cursor: input.cursor, limit: input.limit }
      }

      // Build audit_log query
      let query = ctx.supabase
        .from('audit_log')
        .select('id, timestamp, actor_id, actor_role, action, resource_type, resource_id, outcome, metadata', { count: 'exact' })
        .in('actor_id', practitionerIds)
        .gte('timestamp', input.startDate)
        .lte('timestamp', input.endDate)
        .order('timestamp', { ascending: false })
        .range(input.cursor, input.cursor + input.limit - 1)

      if (input.action) {
        query = query.eq('action', input.action)
      }

      if (input.outcome !== 'ALL') {
        query = query.eq('outcome', input.outcome)
      }

      const { data: rows, error, count } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query audit events',
        })
      }

      const events = (rows ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        timestamp: row.timestamp as string,
        actorId: row.actor_id as string,
        actorName: practitionerNameMap.get(row.actor_id as string) ?? 'Unknown',
        actorRole: row.actor_role as string,
        action: row.action as string,
        resourceType: row.resource_type as string,
        resourceId: row.resource_id as string,
        outcome: row.outcome as string,
        metadata: sanitizeMetadata(row.metadata as Record<string, unknown> | null),
      }))

      return {
        events,
        total: count ?? 0,
        cursor: input.cursor,
        limit: input.limit,
      }
    }),

  /**
   * Export audit events as base64 CSV. Same query logic as listAuditEvents.
   * Max 10,000 rows. Emits AUDIT_EVENTS_EXPORTED audit event.
   */
  exportAuditEvents: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        action: z.string().optional(),
        outcome: z.enum(['ALL', 'SUCCESS', 'FAILURE']).default('ALL'),
      }).refine(
        (data) => {
          const start = new Date(data.startDate)
          const end = new Date(data.endDate)
          const diffDays = (end.getTime() - start.getTime()) / 86_400_000
          return diffDays >= 0 && diffDays <= 90
        },
        { message: 'Date range must be between 0 and 90 days' },
      ),
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id not available from JWT',
        })
      }

      // Get practitioner IDs for this org
      const { data: orgPractitioners, error: practError } = await ctx.supabase
        .from('practitioners')
        .select('id, given_name, family_name')
        .eq('org_id', orgId)

      if (practError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query org practitioners',
        })
      }

      const practitionerIds = (orgPractitioners ?? []).map((p) => (p as Record<string, unknown>).id as string)
      const practitionerNameMap = new Map<string, string>()
      for (const p of orgPractitioners ?? []) {
        const pr = p as Record<string, unknown>
        const name = `${(pr.given_name as string) ?? ''} ${(pr.family_name as string) ?? ''}`.trim()
        practitionerNameMap.set(pr.id as string, name)
      }

      if (practitionerIds.length === 0) {
        return buildCsvExport(
          ['ID', 'Timestamp', 'Actor', 'Role', 'Action', 'Resource Type', 'Resource ID', 'Outcome'],
          [],
          'audit-events',
        )
      }

      // Build query — max 10,000 rows
      let query = ctx.supabase
        .from('audit_log')
        .select('id, timestamp, actor_id, actor_role, action, resource_type, resource_id, outcome')
        .in('actor_id', practitionerIds)
        .gte('timestamp', input.startDate)
        .lte('timestamp', input.endDate)
        .order('timestamp', { ascending: false })
        .limit(10000)

      if (input.action) {
        query = query.eq('action', input.action)
      }

      if (input.outcome !== 'ALL') {
        query = query.eq('outcome', input.outcome)
      }

      const { data: rows, error } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query audit events for export',
        })
      }

      const headers = ['ID', 'Timestamp', 'Actor', 'Role', 'Action', 'Resource Type', 'Resource ID', 'Outcome']
      const csvRows = (rows ?? []).map((row: Record<string, unknown>) => [
        row.id as string,
        row.timestamp as string,
        practitionerNameMap.get(row.actor_id as string) ?? 'Unknown',
        row.actor_role as string,
        row.action as string,
        row.resource_type as string,
        row.resource_id as string,
        row.outcome as string,
      ])

      // Emit export audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'AUDIT_EVENTS_EXPORTED',
          resourceType: 'AUDIT_LOG',
          resourceId: 'batch',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            startDate: input.startDate,
            endDate: input.endDate,
            rowCount: csvRows.length,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'AUDIT_EVENTS_EXPORTED' })
      }

      return buildCsvExport(headers, csvRows, 'audit-events')
    }),

  // ================================================================
  // Task 4: Data Export Procedures
  // ================================================================

  /**
   * Export practitioners (users) as CSV. Org-scoped.
   */
  exportUsers: adminProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'org_id not available from JWT',
      })
    }

    const { data: rows, error } = await ctx.supabase
      .from('practitioners')
      .select('id, given_name, family_name, telecom_email, role, status, created_at, last_login_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to query users for export',
      })
    }

    const headers = ['ID', 'Given Name', 'Family Name', 'Email', 'Role', 'Status', 'Created At', 'Last Login']
    const csvRows = (rows ?? []).map((row: Record<string, unknown>) => [
      row.id as string,
      (row.given_name as string) ?? '',
      (row.family_name as string) ?? '',
      (row.telecom_email as string) ?? '',
      (row.role as string) ?? '',
      (row.status as string) ?? '',
      (row.created_at as string) ?? '',
      (row.last_login_at as string) ?? '',
    ])

    return buildCsvExport(headers, csvRows, 'users')
  }),

  /**
   * Export KYC submissions as CSV. Org-scoped.
   */
  exportKycSubmissions: adminProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'org_id not available from JWT',
      })
    }

    const { data: rows, error } = await ctx.supabase
      .from('kyc_submissions')
      .select('id, practitioner_id, status, submitted_at, reviewed_at, reviewer_id')
      .eq('org_id', orgId)
      .order('submitted_at', { ascending: false })

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to query KYC submissions for export',
      })
    }

    const headers = ['ID', 'Practitioner ID', 'Status', 'Submitted At', 'Reviewed At', 'Reviewer ID']
    const csvRows = (rows ?? []).map((row: Record<string, unknown>) => [
      row.id as string,
      (row.practitioner_id as string) ?? '',
      (row.status as string) ?? '',
      (row.submitted_at as string) ?? '',
      (row.reviewed_at as string) ?? '',
      (row.reviewer_id as string) ?? '',
    ])

    return buildCsvExport(headers, csvRows, 'kyc-submissions')
  }),

  /**
   * Export providers with expiring licenses as CSV. Org-scoped.
   */
  exportExpiringProviders: adminProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'org_id not available from JWT',
      })
    }

    const { data: rows, error } = await ctx.supabase
      .from('practitioners')
      .select('id, given_name, family_name, telecom_email, role, _ultranos')
      .eq('org_id', orgId)
      .not('_ultranos->>licenseExpiry', 'is', null)
      .order('_ultranos->>licenseExpiry', { ascending: true })

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to query expiring providers for export',
      })
    }

    const headers = ['ID', 'Given Name', 'Family Name', 'Email', 'Role', 'License Expiry', 'KYC Status']
    const csvRows = (rows ?? []).map((row: Record<string, unknown>) => {
      const ultranos = (row._ultranos as Record<string, unknown>) ?? {}
      return [
        row.id as string,
        (row.given_name as string) ?? '',
        (row.family_name as string) ?? '',
        (row.telecom_email as string) ?? '',
        (row.role as string) ?? '',
        (ultranos.licenseExpiry as string) ?? '',
        (ultranos.kycStatus as string) ?? '',
      ]
    })

    return buildCsvExport(headers, csvRows, 'expiring-providers')
  }),

  /**
   * Export labs as CSV.
   * Labs are global (not org-scoped) — follows existing listLabs pattern.
   */
  exportLabs: adminProcedure.query(async ({ ctx }) => {
    const { data: rows, error } = await ctx.supabase
      .from('labs')
      .select('id, name, license_ref, accreditation_ref, status, created_at, verified_at')
      .order('created_at', { ascending: false })

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to query labs for export',
      })
    }

    const headers = ['ID', 'Name', 'License Ref', 'Accreditation Ref', 'Status', 'Created At', 'Verified At']
    const csvRows = (rows ?? []).map((row: Record<string, unknown>) => [
      row.id as string,
      (row.name as string) ?? '',
      (row.license_ref as string) ?? '',
      (row.accreditation_ref as string) ?? '',
      (row.status as string) ?? '',
      (row.created_at as string) ?? '',
      (row.verified_at as string) ?? '',
    ])

    return buildCsvExport(headers, csvRows, 'labs')
  }),

  /**
   * Export prescribing anomaly alerts as CSV.
   */
  exportAlerts: adminProcedure.query(async ({ ctx }) => {
    const { data: rows, error } = await ctx.supabase
      .from('prescribing_anomalies')
      .select('id, anomaly_type, severity, status, threshold_value, actual_value, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to query alerts for export',
      })
    }

    const headers = ['ID', 'Anomaly Type', 'Severity', 'Status', 'Threshold', 'Actual Value', 'Created At']
    const csvRows = (rows ?? []).map((row: Record<string, unknown>) => [
      row.id as string,
      (row.anomaly_type as string) ?? '',
      (row.severity as string) ?? '',
      (row.status as string) ?? '',
      String(row.threshold_value ?? ''),
      String(row.actual_value ?? ''),
      (row.created_at as string) ?? '',
    ])

    return buildCsvExport(headers, csvRows, 'prescribing-alerts')
  }),

  // ===== EPIC C: Provider Profile =====

  /**
   * Get aggregated provider profile: identity, KYC history, anomaly alerts, and summary counts.
   * Epic C Task 2: Provider profile drill-down view.
   */
  getProviderProfile: adminProcedure
    .input(z.object({ practitionerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Practitioner identity (org-scoped)
      const { data: practitioner, error: practErr } = await ctx.supabase
        .from('practitioners')
        .select('id, given_name, family_name, telecom_email, telecom_phone, role, kyc_status, license_expiry, status, created_at')
        .eq('id', input.practitionerId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (practErr || !practitioner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Practitioner not found in this organization',
        })
      }

      const p = practitioner as Record<string, unknown>

      // All KYC submissions for this practitioner
      const { data: kycRows } = await ctx.supabase
        .from('kyc_submissions')
        .select('id, status, submitted_at, reviewed_at, reviewer_id')
        .eq('practitioner_id', input.practitionerId)
        .eq('org_id', ctx.user.orgId)
        .order('submitted_at', { ascending: false })

      // All prescribing anomaly alerts for this practitioner
      const { data: alertRows } = await ctx.supabase
        .from('prescribing_anomalies')
        .select('id, anomaly_type, severity, status, created_at, review_action')
        .eq('practitioner_id', input.practitionerId)
        .order('created_at', { ascending: false })

      // Alert summary counts
      const alerts = (alertRows ?? []) as Array<Record<string, unknown>>
      const alertSummary = {
        total: alerts.length,
        dismissed: alerts.filter(a => a.review_action === 'DISMISS' || a.status === 'DISMISSED').length,
        escalated: alerts.filter(a => a.status === 'ESCALATED').length,
        resolved: alerts.filter(a => a.status === 'RESOLVED').length,
        unreviewed: alerts.filter(a => a.status === 'UNREVIEWED').length,
      }

      // License days remaining
      const licenseExpiry = p.license_expiry as string | null
      let licenseDaysRemaining: number | null = null
      if (licenseExpiry) {
        const today = new Date().toISOString().split('T')[0]
        licenseDaysRemaining = Math.ceil(
          (new Date(licenseExpiry).getTime() - new Date(today).getTime()) / 86_400_000,
        )
      }

      // Audit PHI read — CLAUDE.md rule 6
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PROVIDER_PROFILE_VIEWED',
          resourceType: 'PRACTITIONER',
          resourceId: input.practitionerId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.getProviderProfile' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PROVIDER_PROFILE_VIEWED', resourceType: 'PRACTITIONER', resourceId: input.practitionerId })
      }

      return {
        practitioner: {
          id: p.id as string,
          givenName: p.given_name as string,
          familyName: p.family_name as string,
          email: p.telecom_email as string | null,
          phone: p.telecom_phone as string | null,
          role: p.role as string,
          kycStatus: p.kyc_status as string,
          licenseExpiry,
          licenseDaysRemaining,
          status: p.status as string,
          createdAt: p.created_at as string,
        },
        kycSubmissions: (kycRows ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          status: row.status as string,
          submittedAt: row.submitted_at as string,
          reviewedAt: (row.reviewed_at as string) ?? null,
          reviewerId: (row.reviewer_id as string) ?? null,
        })),
        alerts: alerts.map(a => ({
          id: a.id as string,
          anomalyType: a.anomaly_type as string,
          severity: a.severity as string,
          status: a.status as string,
          createdAt: a.created_at as string,
          reviewAction: (a.review_action as string) ?? null,
        })),
        alertSummary,
      }
    }),

  // ===== EPIC C: Escalation =====

  /**
   * Escalate an anomaly alert — assigns to an admin and sets priority.
   * Epic C Task 3: Optimistic lock on status='UNREVIEWED'.
   */
  escalateAnomaly: adminProcedure
    .input(
      z.object({
        alertId: z.string().uuid(),
        assigneeId: z.string().uuid().optional(),
        priority: z.enum(['URGENT', 'NORMAL']),
        note: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      const updateData: Record<string, unknown> = {
        status: 'ESCALATED',
        escalation_priority: input.priority,
        escalation_note: input.note,
        escalated_by: ctx.user.sub,
        escalated_at: now,
      }

      if (input.assigneeId) {
        updateData.assigned_to = input.assigneeId
      }

      // Optimistic lock: only escalate if currently UNREVIEWED
      const { error: updateError, count: updateCount } = await ctx.supabase
        .from('prescribing_anomalies')
        .update(updateData)
        .eq('id', input.alertId)
        .eq('status', 'UNREVIEWED')
        .select('id', { count: 'exact', head: true })

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to escalate anomaly alert',
        })
      }

      if ((updateCount ?? 0) === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Alert is not in UNREVIEWED status — it may have been modified by another admin',
        })
      }

      // Audit — CLAUDE.md rule 6
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'ANOMALY_ESCALATED',
          resourceType: 'PRESCRIBING_ANOMALY',
          resourceId: input.alertId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            priority: input.priority,
            assigneeId: input.assigneeId ?? null,
            endpoint: 'admin.escalateAnomaly',
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'ANOMALY_ESCALATED', resourceId: input.alertId })
      }

      return { success: true }
    }),

  /**
   * Resolve an escalated anomaly alert.
   * Epic C Task 3: Validates status='ESCALATED' before resolving.
   */
  resolveAnomaly: adminProcedure
    .input(
      z.object({
        alertId: z.string().uuid(),
        resolutionNote: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      // Optimistic lock: only resolve if currently ESCALATED
      const { error: updateError, count: updateCount } = await ctx.supabase
        .from('prescribing_anomalies')
        .update({
          status: 'RESOLVED',
          resolution_note: input.resolutionNote,
          resolved_by: ctx.user.sub,
          resolved_at: now,
        })
        .eq('id', input.alertId)
        .eq('status', 'ESCALATED')
        .select('id', { count: 'exact', head: true })

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to resolve anomaly alert',
        })
      }

      if ((updateCount ?? 0) === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Alert is not in ESCALATED status — it may have been modified by another admin',
        })
      }

      // Audit — CLAUDE.md rule 6
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'ANOMALY_RESOLVED',
          resourceType: 'PRESCRIBING_ANOMALY',
          resourceId: input.alertId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.resolveAnomaly' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'ANOMALY_RESOLVED', resourceId: input.alertId })
      }

      return { success: true }
    }),

  /**
   * Reassign an escalated anomaly alert to a different admin.
   * Epic C Task 3: Validates status='ESCALATED'.
   */
  reassignAnomaly: adminProcedure
    .input(
      z.object({
        alertId: z.string().uuid(),
        assigneeId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Optimistic lock: only reassign if currently ESCALATED
      const { error: updateError, count: updateCount } = await ctx.supabase
        .from('prescribing_anomalies')
        .update({ assigned_to: input.assigneeId })
        .eq('id', input.alertId)
        .eq('status', 'ESCALATED')
        .select('id', { count: 'exact', head: true })

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reassign anomaly alert',
        })
      }

      if ((updateCount ?? 0) === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Alert is not in ESCALATED status — it may have been modified by another admin',
        })
      }

      // Audit — CLAUDE.md rule 6
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'ANOMALY_REASSIGNED',
          resourceType: 'PRESCRIBING_ANOMALY',
          resourceId: input.alertId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { assigneeId: input.assigneeId, endpoint: 'admin.reassignAnomaly' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'ANOMALY_REASSIGNED', resourceId: input.alertId })
      }

      return { success: true }
    }),

  // ===== EPIC C: Thresholds & Module Settings =====

  /**
   * Get org thresholds merged with defaults.
   * Epic C Task 4: Returns merged thresholds config.
   */
  getOrgThresholds: adminProcedure.query(async ({ ctx }) => {
    const { data: org, error } = await ctx.supabase
      .from('organizations')
      .select('thresholds')
      .eq('id', ctx.user.orgId)
      .single()

    if (error || !org) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      })
    }

    const stored = (org as Record<string, unknown>).thresholds as Record<string, unknown> ?? {}
    return { ...DEFAULT_THRESHOLDS, ...stored }
  }),

  /**
   * Update org thresholds.
   * Epic C Task 4: Validates with Zod, emits ORG_THRESHOLDS_UPDATED audit event.
   */
  updateOrgThresholds: adminProcedure
    .input(
      z.object({
        kycReviewSlaDays: z.number().int().min(1).max(90).optional(),
        controlledSubstanceDailyLimit: z.number().int().min(1).max(100).optional(),
        drugFrequencyThresholdPct: z.number().min(1).max(100).optional(),
        licenseExpiryWarningDays: z.array(z.number().int().min(1).max(365)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Build partial update — only include provided fields
      const updates: Record<string, unknown> = {}
      if (input.kycReviewSlaDays !== undefined) updates.kycReviewSlaDays = input.kycReviewSlaDays
      if (input.controlledSubstanceDailyLimit !== undefined) updates.controlledSubstanceDailyLimit = input.controlledSubstanceDailyLimit
      if (input.drugFrequencyThresholdPct !== undefined) updates.drugFrequencyThresholdPct = input.drugFrequencyThresholdPct
      if (input.licenseExpiryWarningDays !== undefined) updates.licenseExpiryWarningDays = input.licenseExpiryWarningDays

      // Read current thresholds, merge, and write back
      const { data: org, error: readError } = await ctx.supabase
        .from('organizations')
        .select('thresholds')
        .eq('id', ctx.user.orgId)
        .single()

      if (readError || !org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        })
      }

      const current = (org as Record<string, unknown>).thresholds as Record<string, unknown> ?? {}
      const merged = { ...current, ...updates }

      const { error: updateError } = await ctx.supabase
        .from('organizations')
        .update({ thresholds: merged })
        .eq('id', ctx.user.orgId)

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update organization thresholds',
        })
      }

      // Audit — CLAUDE.md rule 6
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'ORG_THRESHOLDS_UPDATED',
          resourceType: 'ORGANIZATION',
          resourceId: ctx.user.orgId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { updatedKeys: Object.keys(updates), endpoint: 'admin.updateOrgThresholds' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'ORG_THRESHOLDS_UPDATED', resourceId: ctx.user.orgId })
      }

      return { ...DEFAULT_THRESHOLDS, ...merged }
    }),

  /**
   * Get module settings for a specific module, merged with defaults.
   * Epic C Task 4: Reads org_module_settings, merges with DEFAULT_MODULE_SETTINGS.
   */
  getModuleSettings: adminProcedure
    .input(z.object({ moduleCode: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { data: row } = await ctx.supabase
        .from('org_module_settings')
        .select('settings')
        .eq('org_id', ctx.user.orgId)
        .eq('module_code', input.moduleCode)
        .maybeSingle()

      const defaults = DEFAULT_MODULE_SETTINGS[input.moduleCode] ?? {}
      const stored = (row as Record<string, unknown> | null)?.settings as Record<string, unknown> ?? {}

      return {
        moduleCode: input.moduleCode,
        settings: { ...defaults, ...stored },
      }
    }),

  /**
   * Update module settings for a specific module.
   * Epic C Task 4: Validates org has active subscription, upserts settings.
   */
  updateModuleSettings: adminProcedure
    .input(
      z.object({
        moduleCode: z.string().min(1),
        settings: z.record(z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate org has active subscription for this module
      const { data: sub } = await ctx.supabase
        .from('org_subscriptions')
        .select('id')
        .eq('org_id', ctx.user.orgId)
        .eq('module_code', input.moduleCode)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (!sub) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Organization does not have an active subscription for module ${input.moduleCode}`,
        })
      }

      // Read current settings, merge, and upsert
      const { data: existing } = await ctx.supabase
        .from('org_module_settings')
        .select('settings')
        .eq('org_id', ctx.user.orgId)
        .eq('module_code', input.moduleCode)
        .maybeSingle()

      const current = (existing as Record<string, unknown> | null)?.settings as Record<string, unknown> ?? {}
      const merged = { ...current, ...input.settings }

      const { error: upsertError } = await ctx.supabase
        .from('org_module_settings')
        .upsert(
          {
            org_id: ctx.user.orgId,
            module_code: input.moduleCode,
            settings: merged,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'org_id,module_code' },
        )

      if (upsertError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update module settings',
        })
      }

      // Audit — CLAUDE.md rule 6
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'MODULE_SETTINGS_UPDATED',
          resourceType: 'MODULE_SETTINGS',
          resourceId: `${ctx.user.orgId}:${input.moduleCode}`,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            moduleCode: input.moduleCode,
            updatedKeys: Object.keys(input.settings),
            endpoint: 'admin.updateModuleSettings',
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'MODULE_SETTINGS_UPDATED', resourceId: `${ctx.user.orgId}:${input.moduleCode}` })
      }

      const defaults = DEFAULT_MODULE_SETTINGS[input.moduleCode] ?? {}
      return {
        moduleCode: input.moduleCode,
        settings: { ...defaults, ...merged },
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

/**
 * Generate a human-readable description from an audit log action.
 */
function describeAuditAction(
  action: string,
  resourceType: string,
  metadata: Record<string, unknown> | null,
): string {
  const DESCRIPTIONS: Record<string, string> = {
    'USER_CREATED': 'Created a new user',
    'USER_UPDATED': 'Updated user details',
    'USER_SUSPENDED': 'Suspended a user',
    'USER_REACTIVATED': 'Reactivated a user',
    'INVITATION_RESENT': 'Resent user invitation',
    'PASSWORD_RESET_TRIGGERED': 'Triggered password reset',
    'PROFILE_UPDATED': 'Updated admin profile',
    'ORGANIZATION_UPDATED': 'Updated organization settings',
    'KYC_APPROVED': 'Approved KYC submission',
    'KYC_REJECTED': 'Rejected KYC submission',
    'KYC_MORE_INFO_REQUESTED': 'Requested more KYC info',
    'LAB_APPROVED': 'Approved lab registration',
    'LAB_SUSPENDED': 'Suspended a lab',
    'LAB_REACTIVATED': 'Reactivated a lab',
    'LICENSE_RENEWED': 'Renewed a provider license',
    'ANOMALY_ALERT_DISMISSED': 'Dismissed an anomaly alert',
    'ANOMALY_ALERT_ESCALATED': 'Escalated an anomaly alert',
    'ANOMALY_PROVIDER_SUSPENDED': 'Suspended a provider due to anomaly',
    'LOGIN': 'Admin login',
  }

  const base = DESCRIPTIONS[action] ?? `${action} on ${resourceType}`

  // Enrich with metadata if available
  if (metadata?.role) return `${base} (role: ${metadata.role})`
  if (metadata?.reason) return `${base}: ${metadata.reason}`
  return base
}

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
