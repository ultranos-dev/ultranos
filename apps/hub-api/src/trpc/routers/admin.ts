import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTRPCRouter, protectedProcedure, baseProcedure } from '../init'
import { AuditLogger } from '@ultranos/audit-logger'
import { db } from '@/lib/supabase'
import { ROLE_MODULE_MAP, MODULE_DISPLAY_NAMES, LabRole, AuditAction } from '@ultranos/shared-types'
import crypto from 'crypto'
import { encryptField, decryptField } from '@ultranos/crypto/server'
import { getCachedEncryptionKey } from '@/lib/field-encryption'
import { computeScreeningReminders } from '@/lib/screening-reminders'

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
  const esc = (s: string) => {
    let val = (s ?? '').replace(/"/g, '""')
    // Guard against formula injection in spreadsheet apps
    if (/^[=+\-@\t\r]/.test(val)) val = `'${val}`
    return `"${val}"`
  }
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
        status: z.enum(['ALL', 'ACTIVE', 'SUSPENDED', 'PENDING']).default('ALL'),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('labs')
        .select(`
          id, lab_name, license_ref, accreditation_ref, status, created_at,
          lab_technicians(practitioner_id, practitioners!inner(given_name, family_name))
        `, { count: 'exact' })
        .eq('org_id', ctx.user.orgId)
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
        }> | null
        const tech = techs?.[0]
        const techName = tech?.practitioners
          ? `${tech.practitioners.given_name ?? ''} ${tech.practitioners.family_name ?? ''}`.trim()
          : '—'

        return {
          id: row.id as string,
          labName: row.lab_name as string,
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
          id, lab_name, license_ref, accreditation_ref, status, created_at,
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
        labName: (lab as any).lab_name,
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

  createLab: adminProcedure
    .input(
      z.object({
        labName: z.string().min(1).max(200),
        licenseRef: z.string().min(1).max(100),
        accreditationRef: z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: lab, error } = await ctx.supabase
        .from('labs')
        .insert({
          lab_name: input.labName,
          license_ref: input.licenseRef,
          accreditation_ref: input.accreditationRef ?? null,
          org_id: ctx.user.orgId,
          status: 'ACTIVE',
        })
        .select('id')
        .single()

      if (error || !lab) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create lab',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'LAB',
          resourceId: lab.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.createLab' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'LAB' })
      }

      return { id: lab.id }
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
            documents,
            practitioners!inner(given_name, family_name, telecom_email, kyc_status, org_id)
          `)
          .eq('status', 'PENDING')
          .eq('practitioners.org_id', ctx.user.orgId)
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
          documents,
          practitioners!inner(given_name, family_name, telecom_email, kyc_status, org_id)
        `, { count: 'exact' })
        .eq('practitioners.org_id', ctx.user.orgId)
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
        password: z.string().min(8).max(128),
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

      // Create Supabase Auth user with admin-provided password
      const { data: authResult, error: authError } = await ctx.supabase.auth.admin.createUser({
        email: input.email,
        password: input.password,
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

      // Resolve admin's practitioner ID for the invited_by FK
      const { data: adminPractitioner } = await ctx.supabase
        .from('practitioners')
        .select('id')
        .eq('auth_user_id', ctx.user.sub)
        .single()

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
          invited_by: adminPractitioner?.id ?? null,
          created_at: now,
          password_hash: 'SUPABASE_AUTH_MANAGED',
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
          options: {
            redirectTo: process.env.ADMIN_PORTAL_URL ?? 'http://localhost:3003',
          },
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
   */
  exportLabs: adminProcedure.query(async ({ ctx }) => {
    const { data: rows, error } = await ctx.supabase
      .from('labs')
      .select('id, lab_name, license_ref, accreditation_ref, status, created_at')
      .eq('org_id', ctx.user.orgId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to query labs for export',
      })
    }

    const headers = ['ID', 'Lab Name', 'License Ref', 'Accreditation Ref', 'Status', 'Created At']
    const csvRows = (rows ?? []).map((row: Record<string, unknown>) => [
      row.id as string,
      (row.lab_name as string) ?? '',
      (row.license_ref as string) ?? '',
      (row.accreditation_ref as string) ?? '',
      (row.status as string) ?? '',
      (row.created_at as string) ?? '',
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

  // ================================================================
  // Story 55.1: Lab Staff Role Management (AC #1, #2, #4, #5)
  // ================================================================

  /**
   * Story 55.1 AC #1: List staff members for a given lab.
   * Uses targeted getUserById instead of listUsers() to fix pagination bug.
   */
  listLabStaff: adminProcedure
    .input(z.object({ labId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: staff, error } = await ctx.supabase
        .from('lab_technicians')
        .select('practitioner_id, lab_role, created_at')
        .eq('lab_id', input.labId)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lab staff',
        })
      }

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
   * Story 55.1 AC #2, #3, #5: Update a staff member's lab role.
   * Uses atomic RPC function for last-manager protection.
   * Emits audit event on success.
   */
  updateLabStaffRole: adminProcedure
    .input(
      z.object({
        labId: z.string().uuid(),
        targetPractitionerId: z.string().uuid(),
        newRole: z.nativeEnum(LabRole),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc('update_lab_role_atomic', {
        p_target_id: input.targetPractitionerId,
        p_lab_id: input.labId,
        p_new_role: input.newRole,
      })

      if (error) {
        // Last-manager violation from the RPC function
        if (error.message?.includes('Cannot demote the last Lab Manager')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cannot demote the last Lab Manager in this lab',
          })
        }
        if (error.message?.includes('Staff member not found')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Staff member not found in this lab',
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

      if (!data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'RPC returned no data',
        })
      }

      const result = data as { success: boolean; previousRole: string; newRole: string; changed: boolean }

      // Emit audit event (AC #5)
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
              labId: input.labId,
              endpoint: 'admin.updateLabStaffRole',
            },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'PRACTITIONER', resourceId: input.targetPractitionerId })
        }
      }

      return { success: true, previousRole: result.previousRole, newRole: result.newRole }
    }),

  assignStaffToLab: adminProcedure
    .input(
      z.object({
        labId: z.string().uuid(),
        practitionerId: z.string().uuid(),
        initialRole: z.nativeEnum(LabRole),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify lab belongs to this org
      const { data: lab, error: labError } = await ctx.supabase
        .from('labs')
        .select('id')
        .eq('id', input.labId)
        .eq('org_id', ctx.user.orgId)
        .maybeSingle()

      if (labError || !lab) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lab not found in this organisation' })
      }

      // Verify practitioner belongs to this org
      const { data: practitioner, error: practError } = await ctx.supabase
        .from('practitioners')
        .select('id')
        .eq('id', input.practitionerId)
        .eq('org_id', ctx.user.orgId)
        .maybeSingle()

      if (practError || !practitioner) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Practitioner not found in this organisation' })
      }

      // Reject duplicate assignment
      const { data: existing } = await ctx.supabase
        .from('lab_technicians')
        .select('practitioner_id')
        .eq('lab_id', input.labId)
        .eq('practitioner_id', input.practitionerId)
        .maybeSingle()

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Staff member is already assigned to this lab' })
      }

      const { error: insertError } = await ctx.supabase
        .from('lab_technicians')
        .insert({
          lab_id: input.labId,
          practitioner_id: input.practitionerId,
          lab_role: input.initialRole,
        })

      if (insertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to assign staff to lab' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'PRACTITIONER',
          resourceId: input.practitionerId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { labId: input.labId, initialRole: input.initialRole, endpoint: 'admin.assignStaffToLab' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'PRACTITIONER' })
      }

      return { success: true }
    }),

  removeStaffFromLab: adminProcedure
    .input(
      z.object({
        labId: z.string().uuid(),
        practitionerId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify lab belongs to this org
      const { data: lab, error: labError } = await ctx.supabase
        .from('labs')
        .select('id')
        .eq('id', input.labId)
        .eq('org_id', ctx.user.orgId)
        .maybeSingle()

      if (labError || !lab) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lab not found in this organisation' })
      }

      // Atomically check last-manager invariant + delete in a single DB transaction
      const { data: result, error: rpcError } = await ctx.supabase.rpc('remove_lab_staff_safe', {
        p_lab_id: input.labId,
        p_practitioner_id: input.practitionerId,
      })

      if (rpcError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to remove staff from lab' })
      }

      if (!result.success) {
        if (result.error_code === 'NOT_FOUND') {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member is not assigned to this lab' })
        }
        if (result.error_code === 'LAST_MANAGER') {
          throw new TRPCError({ code: 'CONFLICT', message: 'Cannot remove the last Lab Manager from this lab' })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to remove staff from lab' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'DELETE',
          resourceType: 'PRACTITIONER',
          resourceId: input.practitionerId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { labId: input.labId, removedRole: result.removed_role, endpoint: 'admin.removeStaffFromLab' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'DELETE', resourceType: 'PRACTITIONER' })
      }

      return { success: true }
    }),

  // ================================================================
  // Story 55.2: Cross-Lab Staff Overview Dashboard
  // ================================================================

  /**
   * Story 55.2 AC #1-5: List all lab staff across the organization
   * with filtering by role, lab, and activity status. Cursor-based pagination.
   * Includes labHasManager flag per row (AC #4).
   */
  listAllLabStaff: adminProcedure
    .input(
      z.object({
        roleFilter: z.nativeEnum(LabRole).optional(),
        labFilter: z.string().uuid().optional(),
        activityFilter: z.enum(['ACTIVE_7D', 'INACTIVE', 'ALL']).default('ALL'),
        cursor: z.string().optional(), // composite cursor: "practitioner_id:lab_id"
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Step 1: Build query for lab_technicians joined with labs
      // Order by composite (practitioner_id, lab_id) to avoid skipping multi-lab records
      let query = ctx.supabase
        .from('lab_technicians')
        .select('practitioner_id, lab_id, lab_role, created_at, labs!inner(id, lab_name)')
        .order('practitioner_id', { ascending: true })
        .order('lab_id', { ascending: true })
        .limit(input.limit + 1) // fetch one extra to detect next page

      if (input.roleFilter) {
        query = query.eq('lab_role', input.roleFilter)
      }
      if (input.labFilter) {
        query = query.eq('lab_id', input.labFilter)
      }
      if (input.cursor) {
        const [cursorPracId, cursorLabId] = input.cursor.split(':')
        if (cursorPracId && cursorLabId) {
          // Rows after cursor position in composite order
          query = query.or(`practitioner_id.gt.${cursorPracId},and(practitioner_id.eq.${cursorPracId},lab_id.gt.${cursorLabId})`)
        }
      }

      const { data: staff, error } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lab staff',
        })
      }

      const rows = staff ?? []
      const hasMore = rows.length > input.limit
      const pageRows = hasMore ? rows.slice(0, input.limit) : rows

      // Step 2: Look up emails via practitioners + getUserById
      const practitionerIds = [...new Set(pageRows.map((s: any) => s.practitioner_id as string))]
      const emailMap: Record<string, string> = {}
      const lastLoginMap: Record<string, string | null> = {}

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
              if (data?.user) {
                if (data.user.email) emailMap[p.id] = data.user.email
                lastLoginMap[p.id] = data.user.last_sign_in_at ?? null
              }
            })
          await Promise.all(lookups)
        }
      }

      // Step 3: Determine which labs have a manager (AC #4)
      const labIds = [...new Set(pageRows.map((s: any) => s.lab_id as string))]
      const managerLabIds = new Set<string>()

      if (labIds.length > 0) {
        const { data: managers } = await ctx.supabase
          .from('lab_technicians')
          .select('lab_id')
          .eq('lab_role', 'LAB_MANAGER')
          .in('lab_id', labIds)

        if (managers) {
          for (const m of managers) {
            managerLabIds.add(m.lab_id as string)
          }
        }
      }

      // Step 4: Apply activity filter client-side
      let filteredRows = pageRows
      if (input.activityFilter === 'ACTIVE_7D') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        filteredRows = pageRows.filter((s: any) => {
          const lastLogin = lastLoginMap[s.practitioner_id]
          return lastLogin && lastLogin >= sevenDaysAgo
        })
      } else if (input.activityFilter === 'INACTIVE') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        filteredRows = pageRows.filter((s: any) => {
          const lastLogin = lastLoginMap[s.practitioner_id]
          return !lastLogin || lastLogin < sevenDaysAgo
        })
      }

      const items = filteredRows.map((s: any) => {
        const lab = s.labs as { id: string; lab_name: string }
        return {
          practitionerId: s.practitioner_id as string,
          email: emailMap[s.practitioner_id] ?? '',
          labId: s.lab_id as string,
          labName: lab.lab_name,
          labRole: s.lab_role as LabRole,
          lastActiveAt: lastLoginMap[s.practitioner_id] ?? null,
          createdAt: s.created_at as string,
          labHasManager: managerLabIds.has(s.lab_id as string),
        }
      })

      const lastRow = pageRows[pageRows.length - 1]
      return {
        items,
        nextCursor: hasMore && lastRow ? `${(lastRow as any).practitioner_id}:${(lastRow as any).lab_id}` : null,
      }
    }),

  /**
   * Story 55.2 AC #4: Return labs that have no LAB_MANAGER assigned (org-wide).
   * Used by the warning banner on the cross-lab staff overview page.
   */
  getManagerlessLabs: adminProcedure
    .query(async ({ ctx }) => {
      const { data: allLabs, error: labsError } = await ctx.supabase
        .from('labs')
        .select('id, lab_name')

      if (labsError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch labs',
        })
      }

      const { data: managedLabIds, error: mgError } = await ctx.supabase
        .from('lab_technicians')
        .select('lab_id')
        .eq('lab_role', 'LAB_MANAGER')

      if (mgError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lab managers',
        })
      }

      const managedSet = new Set((managedLabIds ?? []).map((r: any) => r.lab_id as string))
      return (allLabs ?? [])
        .filter((l: any) => !managedSet.has(l.id as string))
        .map((l: any) => ({ labId: l.id as string, labName: l.lab_name as string }))
    }),

  /**
   * Story 55.2 AC #3: List all labs for the filter dropdown.
   */
  listLabsForFilter: adminProcedure
    .query(async ({ ctx }) => {
      const { data, error } = await ctx.supabase
        .from('labs')
        .select('id, lab_name')
        .order('lab_name', { ascending: true })

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch labs',
        })
      }

      return (data ?? []).map((l: any) => ({
        id: l.id as string,
        labName: l.lab_name as string,
      }))
    }),

  /**
   * Story 55.2 AC #6: Export lab staff as CSV.
   * Accepts same filters as listAllLabStaff but no pagination.
   * Returns base64-encoded CSV. Emits audit event for data export.
   */
  exportLabStaffCsv: adminProcedure
    .input(
      z.object({
        roleFilter: z.nativeEnum(LabRole).optional(),
        labFilter: z.string().uuid().optional(),
        activityFilter: z.enum(['ACTIVE_7D', 'INACTIVE', 'ALL']).default('ALL'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch all staff (explicit high limit to override Supabase default of 1000)
      let query = ctx.supabase
        .from('lab_technicians')
        .select('practitioner_id, lab_id, lab_role, created_at, labs!inner(id, lab_name)')
        .order('practitioner_id', { ascending: true })
        .limit(10000)

      if (input.roleFilter) {
        query = query.eq('lab_role', input.roleFilter)
      }
      if (input.labFilter) {
        query = query.eq('lab_id', input.labFilter)
      }

      const { data: staff, error } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lab staff for export',
        })
      }

      const rows = staff ?? []

      // Look up emails and last login
      const practitionerIds = [...new Set(rows.map((s: any) => s.practitioner_id as string))]
      const emailMap: Record<string, string> = {}
      const lastLoginMap: Record<string, string | null> = {}

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
              if (data?.user) {
                if (data.user.email) emailMap[p.id] = data.user.email
                lastLoginMap[p.id] = data.user.last_sign_in_at ?? null
              }
            })
          await Promise.all(lookups)
        }
      }

      // Apply activity filter
      let filteredRows = rows
      if (input.activityFilter === 'ACTIVE_7D') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        filteredRows = rows.filter((s: any) => {
          const lastLogin = lastLoginMap[s.practitioner_id]
          return lastLogin && lastLogin >= sevenDaysAgo
        })
      } else if (input.activityFilter === 'INACTIVE') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        filteredRows = rows.filter((s: any) => {
          const lastLogin = lastLoginMap[s.practitioner_id]
          return !lastLogin || lastLogin < sevenDaysAgo
        })
      }

      // Build CSV using shared helper (proper RFC 4180 escaping)
      const headers = ['Email', 'Lab Name', 'Role', 'Last Active', 'Assigned Date']
      const csvRows = filteredRows.map((s: any) => {
        const lab = s.labs as { id: string; lab_name: string }
        const email = emailMap[s.practitioner_id] ?? ''
        const lastActive = lastLoginMap[s.practitioner_id] ?? 'Never'
        const assignedDate = s.created_at ? new Date(s.created_at as string).toISOString().split('T')[0] : ''
        return [email, lab.lab_name, s.lab_role as string, lastActive, assignedDate]
      })

      // Emit audit event for data export (AC #6)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: AuditAction.EXPORT,
          resourceType: 'PRACTITIONER',
          resourceId: 'cross-lab-staff-export',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            exportType: 'CSV',
            rowCount: filteredRows.length,
            filters: {
              roleFilter: input.roleFilter ?? 'ALL',
              labFilter: input.labFilter ?? 'ALL',
              activityFilter: input.activityFilter,
            },
            endpoint: 'admin.exportLabStaffCsv',
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'EXPORT', resourceType: 'PRACTITIONER' })
      }

      return buildCsvExport(headers, csvRows, 'lab-staff-export')
    }),

  // ================================================================
  // Story 55.4: Mentorship Pairing Management
  // ================================================================

  /**
   * AC #1: List all mentorship pairings with mentor/mentee names, emails, lab name.
   * Cursor-based pagination, filterable by status.
   */
  listMentorshipPairings: adminProcedure
    .input(
      z.object({
        statusFilter: z.enum(['ACTIVE', 'DISSOLVED', 'ALL']).default('ALL'),
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('mentorship_pairings')
        .select(`
          id, mentor_practitioner_id, mentee_practitioner_id, lab_id, goals,
          status, start_date, dissolved_at, dissolved_reason, dissolved_notes,
          created_at,
          mentor:practitioners!mentorship_pairings_mentor_practitioner_id_fkey(id, given_name, family_name, auth_user_id),
          mentee:practitioners!mentorship_pairings_mentee_practitioner_id_fkey(id, given_name, family_name, auth_user_id),
          labs!mentorship_pairings_lab_id_fkey(id, lab_name)
        `)
        .order('created_at', { ascending: false })
        .limit(input.limit + 1)

      if (input.statusFilter !== 'ALL') {
        query = query.eq('status', input.statusFilter)
      }
      if (input.cursor) {
        query = query.lt('id', input.cursor)
      }

      const { data: rows, error } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch mentorship pairings',
        })
      }

      const allRows = rows ?? []
      const hasMore = allRows.length > input.limit
      const pageRows = hasMore ? allRows.slice(0, input.limit) : allRows

      // Look up emails for mentors and mentees
      const authUserIds: string[] = []
      const practitionerAuthMap: Record<string, string> = {}

      for (const row of pageRows) {
        const mentor = row.mentor as any
        const mentee = row.mentee as any
        if (mentor?.auth_user_id) {
          practitionerAuthMap[mentor.id] = mentor.auth_user_id
          authUserIds.push(mentor.auth_user_id)
        }
        if (mentee?.auth_user_id) {
          practitionerAuthMap[mentee.id] = mentee.auth_user_id
          authUserIds.push(mentee.auth_user_id)
        }
      }

      const emailMap: Record<string, string> = {}
      if (authUserIds.length > 0) {
        const lookups = Object.entries(practitionerAuthMap).map(async ([practId, authId]) => {
          const { data } = await ctx.supabase.auth.admin.getUserById(authId)
          if (data?.user?.email) {
            emailMap[practId] = data.user.email
          }
        })
        await Promise.all(lookups)
      }

      const items = pageRows.map((row: any) => {
        const mentor = row.mentor as { id: string; given_name: string; family_name: string } | null
        const mentee = row.mentee as { id: string; given_name: string; family_name: string } | null
        const lab = row.labs as { id: string; lab_name: string } | null

        return {
          id: row.id as string,
          mentorName: mentor ? `${mentor.given_name ?? ''} ${mentor.family_name ?? ''}`.trim() : 'Unknown',
          mentorEmail: mentor ? (emailMap[mentor.id] ?? '') : '',
          menteeName: mentee ? `${mentee.given_name ?? ''} ${mentee.family_name ?? ''}`.trim() : 'Unknown',
          menteeEmail: mentee ? (emailMap[mentee.id] ?? '') : '',
          labName: lab?.lab_name ?? 'Unknown',
          startDate: row.start_date as string,
          status: row.status as string,
          dissolvedAt: row.dissolved_at as string | null,
          dissolvedReason: row.dissolved_reason as string | null,
        }
      })

      const lastRow = pageRows[pageRows.length - 1]
      return {
        items,
        nextCursor: hasMore && lastRow ? (lastRow as any).id as string : null,
      }
    }),

  /**
   * AC #5: Get full pairing detail with check-in history.
   */
  getMentorshipPairingDetail: adminProcedure
    .input(z.object({ pairingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: pairing, error } = await ctx.supabase
        .from('mentorship_pairings')
        .select(`
          id, mentor_practitioner_id, mentee_practitioner_id, lab_id, goals,
          status, start_date, dissolved_at, dissolved_reason, dissolved_notes,
          created_at, created_by,
          mentor:practitioners!mentorship_pairings_mentor_practitioner_id_fkey(id, given_name, family_name),
          mentee:practitioners!mentorship_pairings_mentee_practitioner_id_fkey(id, given_name, family_name),
          labs!mentorship_pairings_lab_id_fkey(id, lab_name)
        `)
        .eq('id', input.pairingId)
        .single()

      if (error || !pairing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pairing not found' })
      }

      const { data: checkins } = await ctx.supabase
        .from('mentorship_checkins')
        .select('id, month, status, notes, completed_at')
        .eq('pairing_id', input.pairingId)
        .order('month', { ascending: false })

      const mentor = pairing.mentor as any
      const mentee = pairing.mentee as any
      const lab = pairing.labs as any

      return {
        id: pairing.id,
        mentorName: mentor ? `${mentor.given_name ?? ''} ${mentor.family_name ?? ''}`.trim() : 'Unknown',
        mentorPractitionerId: pairing.mentor_practitioner_id,
        menteeName: mentee ? `${mentee.given_name ?? ''} ${mentee.family_name ?? ''}`.trim() : 'Unknown',
        menteePractitionerId: pairing.mentee_practitioner_id,
        labName: lab?.lab_name ?? 'Unknown',
        goals: pairing.goals,
        status: pairing.status,
        startDate: pairing.start_date,
        dissolvedAt: pairing.dissolved_at,
        dissolvedReason: pairing.dissolved_reason,
        dissolvedNotes: pairing.dissolved_notes,
        createdAt: pairing.created_at,
        checkins: (checkins ?? []).map((c: any) => ({
          id: c.id as string,
          month: c.month as string,
          status: c.status as string,
          notes: c.notes as string | null,
          completedAt: c.completed_at as string | null,
        })),
      }
    }),

  /**
   * AC #2, #7: Create a new mentorship pairing.
   * Validates mentor role and mentee active-pairing uniqueness.
   */
  createMentorshipPairing: adminProcedure
    .input(
      z.object({
        mentorPractitionerId: z.string().uuid(),
        menteePractitionerId: z.string().uuid(),
        goals: z.string().max(2000).optional(),
        startDate: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.mentorPractitionerId === input.menteePractitionerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Mentor and mentee cannot be the same person',
        })
      }

      // Validate mentor is SUPERVISOR or LAB_MANAGER
      const { data: mentorTech, error: mentorErr } = await ctx.supabase
        .from('lab_technicians')
        .select('practitioner_id, lab_id, lab_role')
        .eq('practitioner_id', input.mentorPractitionerId)
        .in('lab_role', ['SUPERVISOR', 'LAB_MANAGER'])
        .limit(1)
        .maybeSingle()

      if (mentorErr || !mentorTech) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Mentor must have SUPERVISOR or LAB_MANAGER role',
        })
      }

      // Check mentee doesn't already have an active pairing
      const { data: existingPairing } = await ctx.supabase
        .from('mentorship_pairings')
        .select('id')
        .eq('mentee_practitioner_id', input.menteePractitionerId)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (existingPairing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Mentee already has an active mentorship pairing',
        })
      }

      const { data: created, error: insertErr } = await ctx.supabase
        .from('mentorship_pairings')
        .insert({
          mentor_practitioner_id: input.mentorPractitionerId,
          mentee_practitioner_id: input.menteePractitionerId,
          lab_id: mentorTech.lab_id,
          goals: input.goals ?? null,
          start_date: input.startDate,
          created_by: ctx.user.sub,
        })
        .select('id, status, start_date, created_at')
        .single()

      if (insertErr || !created) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create mentorship pairing',
        })
      }

      // Emit audit event
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'MENTORSHIP',
          resourceId: created.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            mentorId: input.mentorPractitionerId,
            menteeId: input.menteePractitionerId,
            labId: mentorTech.lab_id,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'MENTORSHIP', resourceId: created.id })
      }

      return {
        id: created.id,
        status: created.status,
        startDate: created.start_date,
        createdAt: created.created_at,
      }
    }),

  /**
   * AC #3, #7: Dissolve a mentorship pairing with reason code.
   */
  dissolveMentorshipPairing: adminProcedure
    .input(
      z.object({
        pairingId: z.string().uuid(),
        reason: z.enum(['COMPLETED', 'REASSIGNED', 'INACTIVE', 'OTHER']),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      const { data: updated, error } = await ctx.supabase
        .from('mentorship_pairings')
        .update({
          status: 'DISSOLVED',
          dissolved_at: now,
          dissolved_reason: input.reason,
          dissolved_notes: input.notes ?? null,
          updated_at: now,
        })
        .eq('id', input.pairingId)
        .eq('status', 'ACTIVE')
        .select('id, status')
        .single()

      if (error || !updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active pairing not found',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'MENTORSHIP',
          resourceId: input.pairingId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { action: 'DISSOLVE', reason: input.reason },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'MENTORSHIP', resourceId: input.pairingId })
      }

      return { id: updated.id, status: updated.status }
    }),

  /**
   * AC #5, #7: Upsert a monthly check-in for a pairing.
   */
  updateMentorshipCheckin: adminProcedure
    .input(
      z.object({
        pairingId: z.string().uuid(),
        month: z.string().regex(/^\d{4}-\d{2}$/),
        status: z.enum(['COMPLETED', 'SKIPPED']),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify pairing exists
      const { data: pairing } = await ctx.supabase
        .from('mentorship_pairings')
        .select('id')
        .eq('id', input.pairingId)
        .single()

      if (!pairing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pairing not found' })
      }

      const { error } = await ctx.supabase
        .from('mentorship_checkins')
        .upsert(
          {
            pairing_id: input.pairingId,
            month: input.month,
            status: input.status,
            notes: input.notes ?? null,
            completed_at: input.status === 'COMPLETED' ? new Date().toISOString() : null,
          },
          { onConflict: 'pairing_id,month' },
        )

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update check-in',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'MENTORSHIP',
          resourceId: input.pairingId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { action: 'CHECKIN', month: input.month, status: input.status },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'MENTORSHIP', resourceId: input.pairingId })
      }

      return { success: true }
    }),

  /**
   * AC #4: Dashboard summary stats for mentorship.
   */
  getMentorshipStats: adminProcedure
    .query(async ({ ctx }) => {
      // totalPaired: distinct practitioners in ACTIVE pairings
      const { data: activePairings } = await ctx.supabase
        .from('mentorship_pairings')
        .select('mentor_practitioner_id, mentee_practitioner_id, start_date')
        .eq('status', 'ACTIVE')

      const pairedIds = new Set<string>()
      let totalStartDays = 0
      for (const p of (activePairings ?? [])) {
        pairedIds.add(p.mentor_practitioner_id as string)
        pairedIds.add(p.mentee_practitioner_id as string)
        const startMs = new Date(p.start_date as string).getTime()
        totalStartDays += (Date.now() - startMs) / 86_400_000
      }

      // Also include dissolved pairings for average duration
      const { data: dissolvedPairings } = await ctx.supabase
        .from('mentorship_pairings')
        .select('start_date, dissolved_at')
        .eq('status', 'DISSOLVED')

      let totalDissolvedDays = 0
      for (const p of (dissolvedPairings ?? [])) {
        if (p.dissolved_at) {
          const startMs = new Date(p.start_date as string).getTime()
          const endMs = new Date(p.dissolved_at as string).getTime()
          totalDissolvedDays += (endMs - startMs) / 86_400_000
        }
      }

      const totalPairings = (activePairings?.length ?? 0) + (dissolvedPairings?.length ?? 0)
      const avgPairingDurationDays = totalPairings > 0
        ? Math.round((totalStartDays + totalDissolvedDays) / totalPairings)
        : 0

      // unmatchedTechs: technicians not in any active pairing
      const { count: totalTechs } = await ctx.supabase
        .from('lab_technicians')
        .select('practitioner_id', { count: 'exact', head: true })

      const unmatchedTechs = (totalTechs ?? 0) - pairedIds.size

      // checkinCompletionRate
      const { count: completedCheckins } = await ctx.supabase
        .from('mentorship_checkins')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'COMPLETED')

      const { count: skippedCheckins } = await ctx.supabase
        .from('mentorship_checkins')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'SKIPPED')

      const totalCheckins = (completedCheckins ?? 0) + (skippedCheckins ?? 0)
      const checkinCompletionRate = totalCheckins > 0
        ? Math.round(((completedCheckins ?? 0) / totalCheckins) * 100)
        : 0

      return {
        totalPaired: pairedIds.size,
        unmatchedTechs: Math.max(0, unmatchedTechs),
        avgPairingDurationDays,
        checkinCompletionRate,
      }
    }),

  /**
   * AC #2: List practitioners eligible to be mentors (SUPERVISOR or LAB_MANAGER).
   */
  listEligibleMentors: adminProcedure
    .query(async ({ ctx }) => {
      const { data, error } = await ctx.supabase
        .from('lab_technicians')
        .select('practitioner_id, lab_role, labs!inner(id, lab_name), practitioners!inner(id, given_name, family_name)')
        .in('lab_role', ['SUPERVISOR', 'LAB_MANAGER'])

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch eligible mentors',
        })
      }

      return (data ?? []).map((row: any) => {
        const p = row.practitioners as { id: string; given_name: string; family_name: string }
        const lab = row.labs as { id: string; lab_name: string }
        return {
          practitionerId: p.id,
          name: `${p.given_name ?? ''} ${p.family_name ?? ''}`.trim(),
          labName: lab.lab_name,
          labRole: row.lab_role as string,
        }
      })
    }),

  // ================================================================
  // Employee Health & Vaccination Registry (Story 55.3)
  // ================================================================

  /**
   * Get employee health record for a practitioner.
   * Decrypts exposure history and computes screening reminders.
   */
  getEmployeeHealth: adminProcedure
    .input(z.object({ practitionerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('employee_health_records')
        .select('*')
        .eq('practitioner_id', input.practitionerId)
        .single()

      // P1: audit after error check with accurate outcome
      const audit = new AuditLogger(ctx.supabase)
      await audit.emit({
        action: 'READ',
        resourceType: 'EMPLOYEE_HEALTH',
        resourceId: input.practitionerId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: error || !data ? 'NOT_FOUND' : 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: {},
      })

      if (error || !data) {
        return null
      }

      // P2: track decryption failure so UI can surface a warning
      let exposureHistory: Array<{ date: string; type: string; outcome: string }> = []
      let decryptionFailed = false
      if (data.exposure_history_encrypted) {
        try {
          const key = getCachedEncryptionKey()
          const decrypted = decryptField(data.exposure_history_encrypted, key)
          if (decrypted !== '[Encrypted Content]') {
            exposureHistory = JSON.parse(decrypted)
          }
        } catch {
          decryptionFailed = true
          console.error('[employee-health] exposure_history decryption failed for record', data.id)
        }
      }

      const reminders = computeScreeningReminders({
        tb_screening_date: data.tb_screening_date,
      })

      return {
        id: data.id,
        practitionerId: data.practitioner_id,
        hepBStatus: data.hep_b_status,
        hepBTiterDate: data.hep_b_titer_date,
        tetanusStatus: data.tetanus_status,
        tetanusDate: data.tetanus_date,
        covidStatus: data.covid_status,
        covidDoses: data.covid_doses,
        covidLastDoseDate: data.covid_last_dose_date,
        tbScreeningDate: data.tb_screening_date,
        tbScreeningResult: data.tb_screening_result,
        exposureHistory,
        decryptionFailed,
        reminders,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      }
    }),

  /**
   * Create or update employee health record.
   * Encrypts exposure history before storing.
   */
  updateEmployeeHealth: adminProcedure
    .input(
      z.object({
        practitionerId: z.string().uuid(),
        hepBStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE']),
        // P4: validate date format to prevent future-date suppression of reminders
        hepBTiterDate: z.string().date().nullable().optional(),
        tetanusStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE']),
        tetanusDate: z.string().date().nullable().optional(),
        covidStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE']),
        covidDoses: z.number().int().min(0).default(0),
        covidLastDoseDate: z.string().date().nullable().optional(),
        tbScreeningDate: z.string().date().nullable().optional(),
        tbScreeningResult: z
          .enum(['NEGATIVE', 'POSITIVE', 'INDETERMINATE'])
          .nullable()
          .optional(),
        // P5: bound exposure history to prevent DoS via encrypted blob inflation
        exposureHistory: z
          .array(
            z.object({
              date: z.string().date(),
              type: z.string().max(200),
              outcome: z.string().max(500),
            }),
          )
          .max(100)
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // P8: wrap encryption key retrieval — failure before upsert should still emit audit
      let exposureHistoryEncrypted: string | null = null
      try {
        if (input.exposureHistory.length > 0) {
          const key = getCachedEncryptionKey()
          exposureHistoryEncrypted = encryptField(
            JSON.stringify(input.exposureHistory),
            key,
          )
        }
      } catch (encErr) {
        const audit = new AuditLogger(ctx.supabase)
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'EMPLOYEE_HEALTH',
          resourceId: input.practitionerId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'FAILURE',
          sessionId: ctx.user.sessionId,
          metadata: { error: 'encryption_key_unavailable' },
        })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save employee health record',
        })
      }

      const row = {
        practitioner_id: input.practitionerId,
        hep_b_status: input.hepBStatus,
        hep_b_titer_date: input.hepBTiterDate ?? null,
        tetanus_status: input.tetanusStatus,
        tetanus_date: input.tetanusDate ?? null,
        covid_status: input.covidStatus,
        covid_doses: input.covidDoses,
        covid_last_dose_date: input.covidLastDoseDate ?? null,
        tb_screening_date: input.tbScreeningDate ?? null,
        tb_screening_result: input.tbScreeningResult ?? null,
        exposure_history_encrypted: exposureHistoryEncrypted,
      }

      const { data, error } = await ctx.supabase
        .from('employee_health_records')
        .upsert(row, { onConflict: 'practitioner_id' })
        .select('*')
        .single()

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save employee health record',
        })
      }

      // P3: list all submitted fields (filter was always-true before; explicit list is honest)
      const changedFields = [
        'hepBStatus',
        'tetanusStatus',
        'covidStatus',
        'covidDoses',
        ...(input.hepBTiterDate !== undefined ? ['hepBTiterDate'] : []),
        ...(input.tetanusDate !== undefined ? ['tetanusDate'] : []),
        ...(input.covidLastDoseDate !== undefined ? ['covidLastDoseDate'] : []),
        ...(input.tbScreeningDate !== undefined ? ['tbScreeningDate'] : []),
        ...(input.tbScreeningResult !== undefined ? ['tbScreeningResult'] : []),
        ...(input.exposureHistory.length > 0 ? ['exposureHistory'] : []),
      ]

      const audit = new AuditLogger(ctx.supabase)
      await audit.emit({
        action: 'UPDATE',
        resourceType: 'EMPLOYEE_HEALTH',
        resourceId: input.practitionerId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { changedFields },
      })

      return { success: true, id: data.id }
    }),

  // ================================================================
  // Story 55.5: Certification & Credential Management
  // ================================================================

  /**
   * Task 2.1 / AC #1: List certification pathways for the org.
   * Cursor-based pagination, filterable by status.
   */
  listCertificationPathways: adminProcedure
    .input(
      z.object({
        status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ALL'),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('certification_pathways')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (input.status !== 'ALL') {
        query = query.eq('status', input.status)
      }

      query = query.range(input.cursor, input.cursor + input.limit - 1)

      const { data: rows, error, count } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch certification pathways',
        })
      }

      const pathways = (rows ?? []).map((row: any) => ({
        id: row.id as string,
        name: row.name as string,
        description: row.description as string | null,
        milestones: row.milestones as Array<{ title: string; type: string; required_count: number }>,
        milestoneCount: Array.isArray(row.milestones) ? row.milestones.length : 0,
        status: row.status as string,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      }))

      return { pathways, total: count ?? 0 }
    }),

  /**
   * Task 2.2 / AC #2: Create a certification pathway.
   * Validates milestone schema. Emits audit event.
   */
  createCertificationPathway: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        milestones: z.array(
          z.object({
            title: z.string().min(1).max(255),
            type: z.enum(['MODULE_COMPLETION', 'SUPERVISED_PROCEDURE', 'ASSESSMENT_PASS', 'CONTINUING_ED_HOURS']),
            required_count: z.number().int().min(1),
          }),
        ).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Resolve org_id from the admin's organization
      const { data: practitioner } = await ctx.supabase
        .from('practitioners')
        .select('org_id')
        .eq('id', ctx.user.sub)
        .single()

      const orgId = practitioner?.org_id ?? ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Organization context required',
        })
      }

      const { data: pathway, error } = await ctx.supabase
        .from('certification_pathways')
        .insert({
          org_id: orgId,
          name: input.name,
          description: input.description ?? null,
          milestones: input.milestones,
          status: 'ACTIVE',
        })
        .select('id')
        .single()

      if (error || !pathway) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create certification pathway',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CERTIFICATION_PATHWAY_CREATED',
          resourceType: 'CERTIFICATION_PATHWAY',
          resourceId: pathway.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { milestoneCount: input.milestones.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CERTIFICATION_PATHWAY_CREATED', resourceId: pathway.id })
      }

      return { success: true, id: pathway.id }
    }),

  /**
   * Task 2.3 / AC #2: Update a certification pathway.
   * Emits audit event.
   */
  updateCertificationPathway: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(2000).optional(),
        milestones: z.array(
          z.object({
            title: z.string().min(1).max(255),
            type: z.enum(['MODULE_COMPLETION', 'SUPERVISED_PROCEDURE', 'ASSESSMENT_PASS', 'CONTINUING_ED_HOURS']),
            required_count: z.number().int().min(1),
          }),
        ).min(1).optional(),
        status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input
      const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (updates.name !== undefined) updatePayload.name = updates.name
      if (updates.description !== undefined) updatePayload.description = updates.description
      if (updates.milestones !== undefined) updatePayload.milestones = updates.milestones
      if (updates.status !== undefined) updatePayload.status = updates.status

      const { data: updated, error } = await ctx.supabase
        .from('certification_pathways')
        .update(updatePayload)
        .eq('id', id)
        .select('id')
        .single()

      if (error || !updated) {
        throw new TRPCError({
          code: error ? 'INTERNAL_SERVER_ERROR' : 'NOT_FOUND',
          message: error ? 'Failed to update certification pathway' : 'Certification pathway not found',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CERTIFICATION_PATHWAY_UPDATED',
          resourceType: 'CERTIFICATION_PATHWAY',
          resourceId: id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { updatedFields: Object.keys(updates) },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CERTIFICATION_PATHWAY_UPDATED', resourceId: id })
      }

      return { success: true }
    }),

  /**
   * Task 2.4: Archive a certification pathway.
   * Emits audit event.
   */
  archiveCertificationPathway: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: updated, error } = await ctx.supabase
        .from('certification_pathways')
        .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('status', 'ACTIVE')
        .select('id')
        .single()

      if (error || !updated) {
        throw new TRPCError({
          code: error ? 'INTERNAL_SERVER_ERROR' : 'CONFLICT',
          message: error ? 'Failed to archive certification pathway' : 'Pathway not found or already archived',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CERTIFICATION_PATHWAY_ARCHIVED',
          resourceType: 'CERTIFICATION_PATHWAY',
          resourceId: input.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CERTIFICATION_PATHWAY_ARCHIVED', resourceId: input.id })
      }

      return { success: true }
    }),

  // ================================================================
  // Task 3: Progress Tracking & Milestone Review
  // ================================================================

  /**
   * Task 3.1 / AC #3: List certification progress for a practitioner.
   * Joins milestone details from the pathway.
   */
  listCertificationProgress: adminProcedure
    .input(
      z.object({
        practitionerId: z.string().uuid(),
        pathwayId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('certification_progress')
        .select(`
          id, pathway_id, practitioner_id, milestone_index, status,
          evidence_ref, reviewer_note, approved_by, approved_at, submitted_at, created_at,
          certification_pathways!inner(id, name, milestones, status)
        `)
        .eq('practitioner_id', input.practitionerId)
        .order('pathway_id')
        .order('milestone_index', { ascending: true })

      if (input.pathwayId) {
        query = query.eq('pathway_id', input.pathwayId)
      }

      const { data: rows, error } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch certification progress',
        })
      }

      // Group by pathway for easier UI consumption
      const pathwayMap = new Map<string, {
        pathwayId: string
        pathwayName: string
        pathwayStatus: string
        milestones: Array<{
          progressId: string
          milestoneIndex: number
          title: string
          type: string
          requiredCount: number
          status: string
          evidenceRef: string | null
          reviewerNote: string | null
          approvedAt: string | null
          submittedAt: string | null
        }>
      }>()

      for (const row of (rows ?? []) as any[]) {
        const pathway = row.certification_pathways
        const pathwayMilestones = Array.isArray(pathway?.milestones) ? pathway.milestones : []
        const milestoneDetail = pathwayMilestones[row.milestone_index] ?? { title: 'Unknown', type: 'UNKNOWN', required_count: 1 }

        if (!pathwayMap.has(row.pathway_id)) {
          pathwayMap.set(row.pathway_id, {
            pathwayId: row.pathway_id,
            pathwayName: pathway?.name ?? 'Unknown',
            pathwayStatus: pathway?.status ?? 'UNKNOWN',
            milestones: [],
          })
        }

        pathwayMap.get(row.pathway_id)!.milestones.push({
          progressId: row.id,
          milestoneIndex: row.milestone_index,
          title: milestoneDetail.title,
          type: milestoneDetail.type,
          requiredCount: milestoneDetail.required_count,
          status: row.status,
          evidenceRef: row.evidence_ref,
          reviewerNote: row.reviewer_note,
          approvedAt: row.approved_at,
          submittedAt: row.submitted_at,
        })
      }

      // Calculate completion percentage per pathway
      const pathways = Array.from(pathwayMap.values()).map((p) => ({
        ...p,
        completionPct: p.milestones.length > 0
          ? Math.round((p.milestones.filter((m) => m.status === 'APPROVED').length / p.milestones.length) * 100)
          : 0,
      }))

      return { pathways }
    }),

  /**
   * Task 3.2 / AC #4: Approve or reject a submitted milestone.
   * Validates status is SUBMITTED. Emits audit event.
   */
  reviewMilestone: adminProcedure
    .input(
      z.object({
        progressId: z.string().uuid(),
        action: z.enum(['APPROVE', 'REJECT']),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch current progress record
      const { data: progress, error: fetchError } = await ctx.supabase
        .from('certification_progress')
        .select('id, status, pathway_id, practitioner_id, milestone_index')
        .eq('id', input.progressId)
        .single()

      if (fetchError || !progress) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Progress record not found',
        })
      }

      if (progress.status !== 'SUBMITTED') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cannot review milestone — current status is ${progress.status}, expected SUBMITTED`,
        })
      }

      const newStatus = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        reviewer_note: input.note ?? null,
      }

      if (input.action === 'APPROVE') {
        updatePayload.approved_by = ctx.user.sub
        updatePayload.approved_at = new Date().toISOString()
      }

      const { error: updateError } = await ctx.supabase
        .from('certification_progress')
        .update(updatePayload)
        .eq('id', input.progressId)

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update milestone status',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CERTIFICATION_MILESTONE_REVIEWED',
          resourceType: 'CERTIFICATION_PROGRESS',
          resourceId: input.progressId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            reviewAction: input.action,
            pathwayId: progress.pathway_id,
            practitionerId: progress.practitioner_id,
            milestoneIndex: progress.milestone_index,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CERTIFICATION_MILESTONE_REVIEWED', resourceId: input.progressId })
      }

      return { success: true, newStatus }
    }),

  /**
   * Task 3.3: Assign a pathway to a practitioner.
   * Creates PENDING progress records for each milestone.
   */
  assignPathway: adminProcedure
    .input(
      z.object({
        practitionerId: z.string().uuid(),
        pathwayId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch pathway to get milestones
      const { data: pathway, error: pathwayError } = await ctx.supabase
        .from('certification_pathways')
        .select('id, milestones, status')
        .eq('id', input.pathwayId)
        .single()

      if (pathwayError || !pathway) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Certification pathway not found',
        })
      }

      if (pathway.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Cannot assign an archived pathway',
        })
      }

      const milestones = Array.isArray(pathway.milestones) ? pathway.milestones : []
      if (milestones.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Pathway has no milestones',
        })
      }

      // Check for existing assignment
      const { data: existing } = await ctx.supabase
        .from('certification_progress')
        .select('id')
        .eq('pathway_id', input.pathwayId)
        .eq('practitioner_id', input.practitionerId)
        .limit(1)

      if (existing && existing.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Practitioner is already assigned to this pathway',
        })
      }

      // Create PENDING progress records for each milestone
      const progressRecords = milestones.map((_: any, index: number) => ({
        pathway_id: input.pathwayId,
        practitioner_id: input.practitionerId,
        milestone_index: index,
        status: 'PENDING',
      }))

      const { error: insertError } = await ctx.supabase
        .from('certification_progress')
        .insert(progressRecords)

      if (insertError) {
        // Unique constraint violation = concurrent duplicate assignment
        if (insertError.code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Practitioner is already assigned to this pathway',
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to assign pathway',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CERTIFICATION_PATHWAY_ASSIGNED',
          resourceType: 'CERTIFICATION_PROGRESS',
          resourceId: input.pathwayId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            practitionerId: input.practitionerId,
            milestoneCount: milestones.length,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CERTIFICATION_PATHWAY_ASSIGNED', resourceId: input.pathwayId })
      }

      return { success: true, milestonesCreated: milestones.length }
    }),

  // ================================================================
  // Task 4: Credential Issuance
  // ================================================================

  /**
   * Task 4.1 / AC #5: Issue a credential after all milestones are approved.
   * Generates SHA-256 hash. Emits audit event.
   */
  issueCredential: adminProcedure
    .input(
      z.object({
        practitionerId: z.string().uuid(),
        pathwayId: z.string().uuid(),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify pathway exists and is ACTIVE
      const { data: pathway, error: pathwayError } = await ctx.supabase
        .from('certification_pathways')
        .select('id, milestones, status')
        .eq('id', input.pathwayId)
        .single()

      if (pathwayError || !pathway) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Certification pathway not found',
        })
      }

      if (pathway.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Cannot issue credential for an archived pathway',
        })
      }

      // Check for existing credential (prevent duplicates)
      const { data: existingCreds } = await ctx.supabase
        .from('certification_credentials')
        .select('id')
        .eq('pathway_id', input.pathwayId)
        .eq('practitioner_id', input.practitionerId)
        .limit(1)

      if (existingCreds && existingCreds.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A credential has already been issued for this pathway assignment',
        })
      }

      // Verify all milestones are APPROVED
      const { data: progressRows, error: progressError } = await ctx.supabase
        .from('certification_progress')
        .select('id, status, milestone_index')
        .eq('pathway_id', input.pathwayId)
        .eq('practitioner_id', input.practitionerId)

      if (progressError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify milestone completion',
        })
      }

      if (!progressRows || progressRows.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No progress records found for this pathway assignment',
        })
      }

      const unapproved = progressRows.filter((r: any) => r.status !== 'APPROVED')
      if (unapproved.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cannot issue credential — ${unapproved.length} milestone(s) not yet approved`,
        })
      }

      // Generate certificate hash using milestone content (not progress IDs)
      const issuedAt = new Date().toISOString()
      const pathwayMilestones = Array.isArray(pathway.milestones) ? pathway.milestones : []
      const milestoneDetails = pathwayMilestones
        .map((m: any) => `${m.title}:${m.type}:${m.required_count}`)
        .join('|')
      const certificateContent = `${input.practitionerId}|${input.pathwayId}|${issuedAt}|${milestoneDetails}`
      const certificateHash = crypto.createHash('sha256').update(certificateContent).digest('hex')

      const { data: credential, error: credError } = await ctx.supabase
        .from('certification_credentials')
        .insert({
          pathway_id: input.pathwayId,
          practitioner_id: input.practitionerId,
          issued_at: issuedAt,
          expires_at: input.expiresAt ?? null,
          certificate_hash: certificateHash,
          issued_by: ctx.user.sub,
        })
        .select('id')
        .single()

      if (credError || !credential) {
        if (credError?.code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A credential has already been issued for this pathway assignment',
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to issue credential',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CERTIFICATION_CREDENTIAL_ISSUED',
          resourceType: 'CERTIFICATION_CREDENTIAL',
          resourceId: credential.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            practitionerId: input.practitionerId,
            pathwayId: input.pathwayId,
            certificateHash,
            expiresAt: input.expiresAt ?? null,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CERTIFICATION_CREDENTIAL_ISSUED', resourceId: credential.id })
      }

      return { success: true, credentialId: credential.id, certificateHash }
    }),

  // ================================================================
  // Task 9: Expiry Monitoring
  // ================================================================

  /**
   * Task 9.1 / AC #6: Get credentials expiring within a given window.
   * Returns credentials with practitioner name, pathway name, days remaining.
   */
  getExpiringCredentials: adminProcedure
    .input(
      z.object({
        daysAhead: z.number().int().min(1).max(365).default(90),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const cutoff = new Date(now.getTime() + input.daysAhead * 24 * 60 * 60 * 1000).toISOString()

      const { data: rows, error } = await ctx.supabase
        .from('certification_credentials')
        .select(`
          id, practitioner_id, pathway_id, issued_at, expires_at, certificate_hash,
          certification_pathways!inner(name),
          practitioners!certification_credentials_practitioner_id_fkey(given_name, family_name)
        `)
        .not('expires_at', 'is', null)
        .lte('expires_at', cutoff)
        .gte('expires_at', now.toISOString())
        .order('expires_at', { ascending: true })

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch expiring credentials',
        })
      }

      const credentials = (rows ?? []).map((row: any) => {
        const expiresAt = new Date(row.expires_at)
        const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        const practitioner = row.practitioners
        const pathway = row.certification_pathways

        return {
          id: row.id as string,
          practitionerId: row.practitioner_id as string,
          practitionerName: practitioner
            ? `${practitioner.given_name ?? ''} ${practitioner.family_name ?? ''}`.trim()
            : 'Unknown',
          pathwayName: pathway?.name ?? 'Unknown',
          expiresAt: row.expires_at as string,
          daysRemaining,
          urgency: daysRemaining <= 30 ? 'red' as const
            : daysRemaining <= 60 ? 'orange' as const
            : 'amber' as const,
        }
      })

      // Compute bucket counts (Task 9.2)
      const buckets = {
        within90: credentials.length,
        within60: credentials.filter((c) => c.daysRemaining <= 60).length,
        within30: credentials.filter((c) => c.daysRemaining <= 30).length,
      }

      return { credentials, buckets }
    }),

  // ================================================================
  // Story 55.6: Cross-Facility Inventory & Procurement
  // ================================================================

  // Task 2: Inventory overview endpoint (AC 1, 2)
  getInventoryOverview: adminProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      // Get all active labs for this org
      const { data: labs, error: labsErr } = await ctx.supabase
        .from('labs')
        .select('id, lab_name')
        .eq('org_id', ctx.user.orgId)
        .eq('status', 'ACTIVE')

      if (labsErr) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load labs' })
      }

      const labList = (labs ?? []) as { id: string; lab_name: string }[]
      const labIds = labList.map((l) => l.id)

      if (labIds.length === 0) {
        const audit = new AuditLogger(ctx.supabase)
        try {
          await audit.emit({
            action: 'READ',
            resourceType: 'INVENTORY_OVERVIEW',
            resourceId: 'batch',
            actorId: ctx.user.sub,
            actorRole: ctx.user.role,
            outcome: 'SUCCESS',
            sessionId: ctx.user.sessionId,
            metadata: { labCount: 0 },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'INVENTORY_OVERVIEW' })
        }
        return { labs: [], reagentCategories: [], cells: [] }
      }

      // Get snapshots ordered for dedup (latest first per lab+category)
      const { data: snapshots, error: snapErr } = await ctx.supabase
        .from('lab_inventory_snapshots')
        .select('lab_id, reagent_category, quantity, unit, reported_at')
        .eq('org_id', ctx.user.orgId)
        .in('lab_id', labIds)
        .order('lab_id', { ascending: true })
        .order('reagent_category', { ascending: true })
        .order('reported_at', { ascending: false })

      if (snapErr) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load inventory snapshots' })
      }

      // Deduplicate: keep only latest per (lab_id, reagent_category)
      const seen = new Set<string>()
      const latestSnapshots: Array<{
        lab_id: string; reagent_category: string; quantity: number; unit: string; reported_at: string
      }> = []
      for (const snap of (snapshots ?? []) as any[]) {
        const key = `${snap.lab_id}::${snap.reagent_category}`
        if (!seen.has(key)) {
          seen.add(key)
          latestSnapshots.push(snap)
        }
      }

      // Compute stock levels (v1 thresholds: GREEN >14, YELLOW 8-14, AMBER 1-7, RED 0)
      const reagentCategorySet = new Set<string>()
      const cells = latestSnapshots.map((snap) => {
        reagentCategorySet.add(snap.reagent_category)
        const lab = labList.find((l) => l.id === snap.lab_id)
        let stockLevel: 'GREEN' | 'YELLOW' | 'AMBER' | 'RED' = 'GREEN'
        if (snap.quantity === 0) stockLevel = 'RED'
        else if (snap.quantity <= 7) stockLevel = 'AMBER'
        else if (snap.quantity <= 14) stockLevel = 'YELLOW'

        return {
          labId: snap.lab_id,
          labName: lab?.lab_name ?? 'Unknown',
          reagentCategory: snap.reagent_category,
          quantity: snap.quantity,
          unit: snap.unit,
          reportedAt: snap.reported_at,
          stockLevel,
        }
      })

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'INVENTORY_OVERVIEW',
          resourceId: 'batch',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { labCount: labList.length, cellCount: cells.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'INVENTORY_OVERVIEW' })
      }

      return {
        labs: labList.map((l) => ({ id: l.id, name: l.lab_name })),
        reagentCategories: Array.from(reagentCategorySet).sort(),
        cells,
      }
    }),

  // Task 3: Redistribution recommendation logic (AC 3)
  getRedistributionRecommendations: adminProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      // Only consider ACTIVE labs (consistent with getInventoryOverview)
      const { data: activeLabs, error: labsErr } = await ctx.supabase
        .from('labs')
        .select('id, lab_name, latitude, longitude')
        .eq('org_id', ctx.user.orgId)
        .eq('status', 'ACTIVE')

      if (labsErr) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load labs' })
      }

      const activeLabIds = ((activeLabs ?? []) as any[]).map((l) => l.id)
      if (activeLabIds.length === 0) return { recommendations: [] }

      const labMap = new Map<string, { name: string; lat: number | null; lng: number | null }>()
      for (const lab of (activeLabs ?? []) as any[]) {
        labMap.set(lab.id, { name: lab.lab_name, lat: lab.latitude ?? null, lng: lab.longitude ?? null })
      }

      const { data: snapshots, error: snapErr } = await ctx.supabase
        .from('lab_inventory_snapshots')
        .select('lab_id, reagent_category, quantity, unit, reported_at')
        .eq('org_id', ctx.user.orgId)
        .in('lab_id', activeLabIds)
        .order('lab_id', { ascending: true })
        .order('reagent_category', { ascending: true })
        .order('reported_at', { ascending: false })

      if (snapErr) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load inventory snapshots' })
      }

      // Deduplicate: keep only latest per (lab_id, reagent_category)
      const seen = new Set<string>()
      const latest: Array<{ lab_id: string; reagent_category: string; quantity: number }> = []
      for (const snap of (snapshots ?? []) as any[]) {
        const key = `${snap.lab_id}::${snap.reagent_category}`
        if (!seen.has(key)) {
          seen.add(key)
          latest.push(snap)
        }
      }

      // Group by reagent_category
      const byCategory = new Map<string, Array<{ lab_id: string; quantity: number }>>()
      for (const snap of latest) {
        if (!byCategory.has(snap.reagent_category)) byCategory.set(snap.reagent_category, [])
        byCategory.get(snap.reagent_category)!.push({ lab_id: snap.lab_id, quantity: snap.quantity })
      }

      // Haversine distance in km (returns null if either lab has no coordinates)
      function haversineKm(lat1: number | null, lng1: number | null, lat2: number | null, lng2: number | null): number | null {
        if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null
        const R = 6371
        const dLat = (lat2 - lat1) * Math.PI / 180
        const dLng = (lng2 - lng1) * Math.PI / 180
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      }

      // Each RED lab gets paired with the single best source (highest surplus GREEN lab)
      const recommendations: Array<{
        targetLabId: string; targetLabName: string
        sourceLabId: string; sourceLabName: string
        reagentCategory: string; sourceQuantity: number
        distanceKm: number | null
      }> = []

      for (const [category, entries] of byCategory) {
        const redLabs = entries.filter((e) => e.quantity === 0)
        const greenLabs = entries.filter((e) => e.quantity > 14).sort((a, b) => b.quantity - a.quantity)
        const bestSource = greenLabs[0]
        if (!bestSource) continue
        for (const red of redLabs) {
          const targetInfo = labMap.get(red.lab_id)
          const sourceInfo = labMap.get(bestSource.lab_id)
          recommendations.push({
            targetLabId: red.lab_id,
            targetLabName: targetInfo?.name ?? 'Unknown',
            sourceLabId: bestSource.lab_id,
            sourceLabName: sourceInfo?.name ?? 'Unknown',
            reagentCategory: category,
            sourceQuantity: bestSource.quantity,
            distanceKm: haversineKm(targetInfo?.lat ?? null, targetInfo?.lng ?? null, sourceInfo?.lat ?? null, sourceInfo?.lng ?? null),
          })
        }
      }

      recommendations.sort((a, b) => b.sourceQuantity - a.sourceQuantity)
      return { recommendations }
    }),

  // Task 4: Purchase order CRUD and status pipeline (AC 4, 6)
  listPurchaseOrders: adminProcedure
    .input(z.object({
      status: z.enum(['REQUESTED', 'APPROVED', 'ORDERED', 'SHIPPED', 'DELIVERED']).optional(),
      cursor: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('purchase_orders')
        .select('*, suppliers(name)', { count: 'exact' })
        .eq('org_id', ctx.user.orgId)
        .order('created_at', { ascending: false })
        .range(input.cursor, input.cursor + input.limit - 1)

      if (input.status) query = query.eq('status', input.status)

      const { data, error, count } = await query
      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load purchase orders' })
      }

      const orders = ((data ?? []) as any[]).map((row) => ({
        id: row.id,
        supplierId: row.supplier_id,
        supplierName: row.suppliers?.name ?? 'Unknown',
        items: row.items,
        status: row.status,
        totalItems: row.total_items,
        notes: row.notes,
        createdBy: row.created_by,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        orderedAt: row.ordered_at,
        shippedAt: row.shipped_at,
        deliveredAt: row.delivered_at,
        createdAt: row.created_at,
      }))

      return { orders, total: count ?? 0 }
    }),

  createPurchaseOrder: adminProcedure
    .input(z.object({
      supplierId: z.string().uuid(),
      items: z.array(z.object({
        labId: z.string().uuid(),
        reagentCategory: z.string().min(1),
        quantity: z.number().int().positive(),
        unit: z.string().min(1),
      })).min(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate supplier exists and is ACTIVE
      const { data: supplier, error: supErr } = await ctx.supabase
        .from('suppliers')
        .select('id, status')
        .eq('id', input.supplierId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (supErr || !supplier) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Supplier not found' })
      }
      if ((supplier as any).status !== 'ACTIVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Supplier is not active' })
      }

      const itemsJson = input.items.map((i) => ({
        lab_id: i.labId, reagent_category: i.reagentCategory,
        quantity: i.quantity, unit: i.unit,
      }))

      const { data, error } = await ctx.supabase
        .from('purchase_orders')
        .insert({
          org_id: ctx.user.orgId,
          supplier_id: input.supplierId,
          items: itemsJson,
          status: 'REQUESTED',
          total_items: input.items.length,
          notes: input.notes ?? null,
          created_by: ctx.user.sub,
        })
        .select('id')
        .single()

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create purchase order' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'PURCHASE_ORDER',
          resourceId: data.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { supplierId: input.supplierId, itemCount: input.items.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'PURCHASE_ORDER' })
      }

      return { id: data.id }
    }),

  updateOrderStatus: adminProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      newStatus: z.enum(['APPROVED', 'ORDERED', 'SHIPPED', 'DELIVERED']),
    }))
    .mutation(async ({ ctx, input }) => {
      const STATUS_ORDER = ['REQUESTED', 'APPROVED', 'ORDERED', 'SHIPPED', 'DELIVERED'] as const
      const TIMESTAMP_FIELDS: Record<string, string> = {
        APPROVED: 'approved_at', ORDERED: 'ordered_at',
        SHIPPED: 'shipped_at', DELIVERED: 'delivered_at',
      }

      const { data: order, error: fetchErr } = await ctx.supabase
        .from('purchase_orders')
        .select('id, status')
        .eq('id', input.orderId)
        .eq('org_id', ctx.user.orgId)
        .single()

      if (fetchErr || !order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Purchase order not found' })
      }

      const currentIdx = STATUS_ORDER.indexOf((order as any).status)
      const newIdx = STATUS_ORDER.indexOf(input.newStatus)

      if (newIdx !== currentIdx + 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid status transition: ${(order as any).status} → ${input.newStatus}. Must advance one step forward.`,
        })
      }

      const updatePayload: Record<string, unknown> = {
        status: input.newStatus,
        [TIMESTAMP_FIELDS[input.newStatus]]: new Date().toISOString(),
      }
      if (input.newStatus === 'APPROVED') updatePayload.approved_by = ctx.user.sub

      // Use optimistic locking: WHERE status = currentStatus prevents concurrent double-advance
      const { error: updateErr, count: updatedCount } = await ctx.supabase
        .from('purchase_orders')
        .update(updatePayload)
        .eq('id', input.orderId)
        .eq('org_id', ctx.user.orgId)
        .eq('status', (order as any).status)
        .select('id', { count: 'exact', head: true })

      if (updateErr) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update order status' })
      }
      if (!updatedCount || updatedCount === 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Order status was modified by another user. Please refresh and try again.' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'PURCHASE_ORDER',
          resourceId: input.orderId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { previousStatus: (order as any).status, newStatus: input.newStatus },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'PURCHASE_ORDER' })
      }

      return { success: true }
    }),

  // Task 5: Supplier CRUD endpoints (AC 5)
  listSuppliers: adminProcedure
    .input(z.object({
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('suppliers')
        .select('*')
        .eq('org_id', ctx.user.orgId)
        .order('name', { ascending: true })

      if (input.status) query = query.eq('status', input.status)

      const { data, error } = await query
      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load suppliers' })
      }

      const suppliers = ((data ?? []) as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        contactEmail: row.contact_email,
        phone: row.phone,
        leadTimeDays: row.lead_time_days,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))

      return { suppliers }
    }),

  createSupplier: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      contactEmail: z.string().email().optional(),
      phone: z.string().optional(),
      leadTimeDays: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('suppliers')
        .insert({
          org_id: ctx.user.orgId,
          name: input.name,
          contact_email: input.contactEmail ?? null,
          phone: input.phone ?? null,
          lead_time_days: input.leadTimeDays ?? null,
        })
        .select('id')
        .single()

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create supplier' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'SUPPLIER',
          resourceId: data.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { supplierName: input.name },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'SUPPLIER' })
      }

      return { id: data.id }
    }),

  updateSupplier: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      contactEmail: z.string().email().nullable().optional(),
      phone: z.string().nullable().optional(),
      leadTimeDays: z.number().int().min(0).nullable().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) updatePayload.name = input.name
      if (input.contactEmail !== undefined) updatePayload.contact_email = input.contactEmail
      if (input.phone !== undefined) updatePayload.phone = input.phone
      if (input.leadTimeDays !== undefined) updatePayload.lead_time_days = input.leadTimeDays
      if (input.status !== undefined) updatePayload.status = input.status

      const { error, count: updatedCount } = await ctx.supabase
        .from('suppliers')
        .update(updatePayload)
        .eq('id', input.id)
        .eq('org_id', ctx.user.orgId)
        .select('id', { count: 'exact', head: true })

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update supplier' })
      }
      if (!updatedCount || updatedCount === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Supplier not found' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'SUPPLIER',
          resourceId: input.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { changedFields: Object.keys(updatePayload).filter((k) => k !== 'updated_at') },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'SUPPLIER' })
      }

      return { success: true }
    }),

  // ================================================================
  // Story 55.7: Lab Network & Outbreak Management
  // ================================================================

  /**
   * Task 2: Network overview — lab summaries with operational metrics.
   * AC 1, 2: Aggregates pending samples, stock alerts, staff count per lab.
   */
  getNetworkOverview: adminProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.orgId

    const { data: labs, error: labsError } = await ctx.supabase
      .from('labs')
      .select('id, lab_name, status, last_sync_at, created_at')
      .eq('org_id', orgId)
      .order('lab_name')

    if (labsError) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load labs' })
    }

    const labSummaries = await Promise.all(
      (labs ?? []).map(async (lab: Record<string, unknown>) => {
        const labId = lab.id as string

        const { count: staffCount } = await ctx.supabase
          .from('lab_technicians')
          .select('id', { count: 'exact', head: true })
          .eq('lab_id', labId)

        const { count: pendingSamples } = await ctx.supabase
          .from('lab_orders')
          .select('id', { count: 'exact', head: true })
          .eq('lab_id', labId)
          .eq('status', 'PENDING')

        let stockAlertCount = 0
        let stockDataAvailable = false
        try {
          const { count } = await ctx.supabase
            .from('lab_inventory_snapshots')
            .select('id', { count: 'exact', head: true })
            .eq('lab_id', labId)
            .eq('level', 'RED')
          stockAlertCount = count ?? 0
          stockDataAvailable = true
        } catch {
          // Table may not exist yet (Story 55.6 dependency)
        }

        return {
          labId,
          labName: lab.lab_name as string,
          status: lab.status as string,
          pendingSamples: pendingSamples ?? 0,
          stockAlertCount,
          stockDataAvailable,
          staffCount: staffCount ?? 0,
          lastSyncAt: (lab.last_sync_at as string) ?? null,
        }
      }),
    )

    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'NETWORK_OVERVIEW_ACCESSED',
        resourceType: 'NETWORK',
        resourceId: orgId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { labCount: labSummaries.length },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'NETWORK_OVERVIEW_ACCESSED' })
    }

    return { labs: labSummaries }
  }),

  /**
   * Task 3.1: Activate outbreak mode.
   * AC 3, 4, 7: Create outbreak event + dispatch notifications.
   */
  activateOutbreakMode: adminProcedure
    .input(
      z.object({
        pathogen: z.string().min(1).max(255),
        affectedLabIds: z.array(z.string().uuid()).min(1),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.orgId

      const { data: validLabs, error: labError } = await ctx.supabase
        .from('labs')
        .select('id')
        .eq('org_id', orgId)
        .in('id', input.affectedLabIds)

      if (labError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to validate labs' })
      }

      const validLabIds = new Set((validLabs ?? []).map((l: Record<string, unknown>) => l.id as string))
      const invalidIds = input.affectedLabIds.filter((id) => !validLabIds.has(id))
      if (invalidIds.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Labs not found in organization: ${invalidIds.length} invalid lab(s)`,
        })
      }

      const { data: outbreak, error: insertError } = await ctx.supabase
        .from('outbreak_events')
        .insert({
          org_id: orgId,
          pathogen: input.pathogen,
          affected_lab_ids: input.affectedLabIds,
          status: 'ACTIVE',
          activated_by: ctx.user.sub,
          activated_at: new Date().toISOString(),
          notes: input.notes ?? null,
        })
        .select('id')
        .single()

      if (insertError || !outbreak) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create outbreak event' })
      }

      const outbreakId = (outbreak as Record<string, unknown>).id as string

      // Dispatch notifications to all practitioners at affected labs
      try {
        const { data: practitioners } = await ctx.supabase
          .from('lab_technicians')
          .select('practitioner_id')
          .in('lab_id', input.affectedLabIds)

        if (practitioners && practitioners.length > 0) {
          const notifications = (practitioners as Record<string, unknown>[]).map((p) => ({
            recipient_ref: p.practitioner_id as string,
            recipient_role: 'LAB_TECH',
            type: 'OUTBREAK_MODE_ACTIVATED',
            payload: JSON.stringify({ outbreak_id: outbreakId, pathogen: input.pathogen }),
            status: 'QUEUED',
            next_retry_at: new Date(Date.now() + 60_000).toISOString(),
          }))
          await ctx.supabase.from('notifications').insert(notifications)
        }
      } catch {
        console.warn('[NOTIFICATION_FAILURE]', { outbreakId })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'OUTBREAK_MODE_ACTIVATED',
          resourceType: 'OUTBREAK_EVENT',
          resourceId: outbreakId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { pathogen: input.pathogen, affectedLabCount: input.affectedLabIds.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'OUTBREAK_MODE_ACTIVATED', resourceId: outbreakId })
      }

      return { success: true, outbreakId }
    }),

  /**
   * Task 3.3: Deactivate (resolve) outbreak mode.
   * AC 7: Validates active status, updates to RESOLVED, dispatches notifications.
   */
  deactivateOutbreakMode: adminProcedure
    .input(
      z.object({
        outbreakId: z.string().uuid(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: outbreak, error: fetchError } = await ctx.supabase
        .from('outbreak_events')
        .select('id, status, pathogen, affected_lab_ids, org_id')
        .eq('id', input.outbreakId)
        .single()

      if (fetchError || !outbreak) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Outbreak event not found' })
      }

      const ob = outbreak as Record<string, unknown>
      if (ob.org_id !== ctx.user.orgId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Outbreak belongs to a different organization' })
      }

      if (ob.status !== 'ACTIVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Outbreak is already resolved' })
      }

      const { error: updateError } = await ctx.supabase
        .from('outbreak_events')
        .update({
          status: 'RESOLVED',
          resolved_at: new Date().toISOString(),
          resolved_by: ctx.user.sub,
          notes: input.notes ?? ob.notes,
        })
        .eq('id', input.outbreakId)

      if (updateError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to resolve outbreak' })
      }

      const affectedLabIds = ob.affected_lab_ids as string[]
      try {
        const { data: practitioners } = await ctx.supabase
          .from('lab_technicians')
          .select('practitioner_id')
          .in('lab_id', affectedLabIds)

        if (practitioners && practitioners.length > 0) {
          const notifications = (practitioners as Record<string, unknown>[]).map((p) => ({
            recipient_ref: p.practitioner_id as string,
            recipient_role: 'LAB_TECH',
            type: 'OUTBREAK_MODE_DEACTIVATED',
            payload: JSON.stringify({ outbreak_id: input.outbreakId, pathogen: ob.pathogen }),
            status: 'QUEUED',
            next_retry_at: new Date(Date.now() + 60_000).toISOString(),
          }))
          await ctx.supabase.from('notifications').insert(notifications)
        }
      } catch {
        console.warn('[NOTIFICATION_FAILURE]', { outbreakId: input.outbreakId })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'OUTBREAK_MODE_DEACTIVATED',
          resourceType: 'OUTBREAK_EVENT',
          resourceId: input.outbreakId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { pathogen: ob.pathogen as string },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'OUTBREAK_MODE_DEACTIVATED', resourceId: input.outbreakId })
      }

      return { success: true }
    }),

  /**
   * Task 3.4: List outbreaks for the org.
   * AC 6: Returns outbreaks with lab names joined.
   */
  listOutbreaks: adminProcedure
    .input(
      z.object({
        status: z.enum(['ACTIVE', 'RESOLVED']).optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.orgId

      let query = ctx.supabase
        .from('outbreak_events')
        .select('id, pathogen, affected_lab_ids, status, activated_by, activated_at, resolved_at, resolved_by, notes')
        .eq('org_id', orgId)
        .order('activated_at', { ascending: false })

      if (input?.status) {
        query = query.eq('status', input.status)
      }

      const { data: outbreaks, error } = await query

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load outbreaks' })
      }

      const allLabIds = new Set<string>()
      for (const ob of (outbreaks ?? []) as Record<string, unknown>[]) {
        for (const labId of (ob.affected_lab_ids as string[])) {
          allLabIds.add(labId)
        }
      }

      let labNameMap: Record<string, string> = {}
      if (allLabIds.size > 0) {
        const { data: labs } = await ctx.supabase
          .from('labs')
          .select('id, lab_name')
          .in('id', Array.from(allLabIds))
        for (const lab of (labs ?? []) as Record<string, unknown>[]) {
          labNameMap[lab.id as string] = lab.lab_name as string
        }
      }

      return {
        outbreaks: ((outbreaks ?? []) as Record<string, unknown>[]).map((ob) => ({
          id: ob.id as string,
          pathogen: ob.pathogen as string,
          affectedLabIds: ob.affected_lab_ids as string[],
          affectedLabNames: (ob.affected_lab_ids as string[]).map((id) => labNameMap[id] ?? id),
          status: ob.status as string,
          activatedBy: ob.activated_by as string,
          activatedAt: ob.activated_at as string,
          resolvedAt: (ob.resolved_at as string) ?? null,
          resolvedBy: (ob.resolved_by as string) ?? null,
          notes: (ob.notes as string) ?? null,
        })),
      }
    }),

  /**
   * Task 4: CHW enrollment.
   * AC 5: Create a simplified practitioner record with role CHW.
   */
  enrollChw: adminProcedure
    .input(
      z.object({
        fullName: z.string().min(1).max(255),
        phone: z.string().min(7).max(20).regex(/^\+?[0-9\s\-()]+$/, 'Invalid phone format'),
        assignedLabId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.orgId

      const { data: lab, error: labError } = await ctx.supabase
        .from('labs')
        .select('id')
        .eq('id', input.assignedLabId)
        .eq('org_id', orgId)
        .single()

      if (labError || !lab) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lab not found in organization' })
      }

      // Encrypt full_name (PHI) before storage
      let encryptedName: string
      try {
        const key = await getCachedEncryptionKey()
        encryptedName = encryptField(input.fullName, key)
      } catch {
        encryptedName = input.fullName
      }

      const chwId = crypto.randomUUID()
      const { error: insertError } = await ctx.supabase
        .from('practitioners')
        .insert({
          id: chwId,
          org_id: orgId,
          given_name: encryptedName,
          family_name: '',
          role: 'CHW',
          status: 'ACTIVE',
          telecom_phone: input.phone,
          created_at: new Date().toISOString(),
        })

      if (insertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create CHW record' })
      }

      // Audit event — log only practitioner_id, never name or phone (CLAUDE.md PHI rule)
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CHW_ENROLLED',
          resourceType: 'PRACTITIONER',
          resourceId: chwId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { assignedLabId: input.assignedLabId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CHW_ENROLLED', resourceId: chwId })
      }

      return { success: true, chwId }
    }),

  // ================================================================
  // Story 55.8: Surveillance Alert Configuration
  // ================================================================

  /**
   * Task 2.1: Get surveillance config for the current user (or specified practitioner).
   */
  getSurveillanceConfig: adminProcedure
    .input(
      z.object({
        practitionerId: z.string().uuid().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const practitionerId = input?.practitionerId ?? ctx.user.sub

      const { data: config, error } = await ctx.supabase
        .from('surveillance_alert_configs')
        .select('*')
        .eq('practitioner_id', practitionerId)
        .eq('org_id', ctx.user.orgId)
        .maybeSingle()

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch surveillance config' })
      }

      if (!config) return { config: null }

      const labIds = (config as Record<string, unknown>).monitored_lab_ids as string[]
      let labs: Array<{ id: string; name: string; status: string }> = []
      if (labIds.length > 0) {
        const { data: labRows } = await ctx.supabase
          .from('labs')
          .select('id, name, status')
          .in('id', labIds)
        labs = (labRows ?? []) as Array<{ id: string; name: string; status: string }>
      }

      return {
        config: {
          id: (config as any).id,
          practitionerId: (config as any).practitioner_id,
          orgId: (config as any).org_id,
          monitoredLabIds: labIds,
          monitoredLabs: labs,
          thresholds: (config as any).thresholds as Array<{ test_category: string; threshold_pct: number }>,
          channels: (config as any).channels as { in_app: boolean; sms_phone?: string; email?: string },
          createdAt: (config as any).created_at,
          updatedAt: (config as any).updated_at,
        },
      }
    }),

  /**
   * Task 2.2: Upsert surveillance config.
   */
  updateSurveillanceConfig: adminProcedure
    .input(
      z.object({
        monitoredLabIds: z.array(z.string().uuid()).min(1, 'At least one lab must be selected'),
        thresholds: z
          .array(
            z.object({
              test_category: z.string().min(1),
              threshold_pct: z.number().min(0).max(100),
            }),
          )
          .min(1, 'At least one threshold must be configured'),
        channels: z.object({
          in_app: z.literal(true),
          sms_phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'SMS phone must be E.164 format').optional(),
          email: z.string().email('Invalid email address').optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: orgLabs, error: labError } = await ctx.supabase
        .from('labs')
        .select('id')
        .eq('org_id', ctx.user.orgId)

      if (labError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to validate lab IDs' })
      }

      const orgLabIds = new Set((orgLabs ?? []).map((l: any) => l.id as string))
      const invalidLabs = input.monitoredLabIds.filter((id) => !orgLabIds.has(id))
      if (invalidLabs.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Lab IDs do not belong to your organization: ${invalidLabs.join(', ')}`,
        })
      }

      const { data: upserted, error: upsertError } = await ctx.supabase
        .from('surveillance_alert_configs')
        .upsert(
          {
            practitioner_id: ctx.user.sub,
            org_id: ctx.user.orgId,
            monitored_lab_ids: input.monitoredLabIds,
            thresholds: input.thresholds,
            channels: input.channels,
          },
          { onConflict: 'practitioner_id,org_id' },
        )
        .select('id')
        .single()

      if (upsertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to save surveillance config' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'SURVEILLANCE_CONFIG_UPDATED',
          resourceType: 'SURVEILLANCE_ALERT_CONFIG',
          resourceId: (upserted as any).id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            labCount: input.monitoredLabIds.length,
            thresholdCount: input.thresholds.length,
            smsEnabled: !!input.channels.sms_phone,
            emailEnabled: !!input.channels.email,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'SURVEILLANCE_CONFIG_UPDATED' })
      }

      return { success: true, configId: (upserted as any).id }
    }),

  /**
   * Task 3.1: List surveillance alerts with pagination and filtering.
   */
  listSurveillanceAlerts: adminProcedure
    .input(
      z.object({
        configId: z.string().uuid().optional(),
        acknowledged: z.boolean().optional(),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const opts = input ?? { cursor: 0, limit: 25 }

      let configId = opts.configId
      if (!configId) {
        const { data: config } = await ctx.supabase
          .from('surveillance_alert_configs')
          .select('id')
          .eq('practitioner_id', ctx.user.sub)
          .eq('org_id', ctx.user.orgId)
          .maybeSingle()
        configId = (config as any)?.id
      }

      if (!configId) {
        return { alerts: [], total: 0 }
      }

      let query = ctx.supabase
        .from('surveillance_alerts')
        .select('*, labs!inner(name)', { count: 'exact' })
        .eq('config_id', configId)
        .order('triggered_at', { ascending: false })
        .range(opts.cursor, opts.cursor + opts.limit - 1)

      if (opts.acknowledged === true) {
        query = query.not('acknowledged_at', 'is', null)
      } else if (opts.acknowledged === false) {
        query = query.is('acknowledged_at', null)
      }

      const { data: rows, count, error } = await query

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch surveillance alerts' })
      }

      const alerts = (rows ?? []).map((row: any) => ({
        id: row.id,
        configId: row.config_id,
        labId: row.lab_id,
        labName: row.labs?.name ?? 'Unknown',
        testCategory: row.test_category,
        currentRate: Number(row.current_rate),
        threshold: Number(row.threshold),
        triggeredAt: row.triggered_at,
        acknowledgedAt: row.acknowledged_at,
        acknowledgedBy: row.acknowledged_by,
        notes: row.notes,
      }))

      return { alerts, total: count ?? 0 }
    }),

  /**
   * Task 3.2: Acknowledge a surveillance alert.
   */
  acknowledgeSurveillanceAlert: adminProcedure
    .input(
      z.object({
        alertId: z.string().uuid(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('surveillance_alerts')
        .select('id, acknowledged_at, config_id')
        .eq('id', input.alertId)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Alert not found' })
      }

      if ((existing as any).acknowledged_at) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Alert is already acknowledged' })
      }

      const { data: config } = await ctx.supabase
        .from('surveillance_alert_configs')
        .select('org_id')
        .eq('id', (existing as any).config_id)
        .single()

      if (!config || (config as any).org_id !== ctx.user.orgId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const { error: updateError } = await ctx.supabase
        .from('surveillance_alerts')
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: ctx.user.sub,
          notes: input.notes ?? null,
        })
        .eq('id', input.alertId)

      if (updateError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to acknowledge alert' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'SURVEILLANCE_ALERT_ACKNOWLEDGED',
          resourceType: 'SURVEILLANCE_ALERT',
          resourceId: input.alertId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { hasNotes: !!input.notes },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'SURVEILLANCE_ALERT_ACKNOWLEDGED' })
      }

      return { success: true }
    }),

  /**
   * Task 3.3: Alert summary — counts for unacknowledged, today, this week.
   */
  getSurveillanceAlertSummary: adminProcedure.query(async ({ ctx }) => {
    const { data: config } = await ctx.supabase
      .from('surveillance_alert_configs')
      .select('id')
      .eq('practitioner_id', ctx.user.sub)
      .eq('org_id', ctx.user.orgId)
      .maybeSingle()

    if (!config) {
      return { totalUnacknowledged: 0, triggeredToday: 0, triggeredThisWeek: 0 }
    }

    const configId = (config as any).id

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [unackResult, todayResult, weekResult] = await Promise.all([
      ctx.supabase
        .from('surveillance_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('config_id', configId)
        .is('acknowledged_at', null),
      ctx.supabase
        .from('surveillance_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('config_id', configId)
        .gte('triggered_at', todayStart),
      ctx.supabase
        .from('surveillance_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('config_id', configId)
        .gte('triggered_at', weekStart),
    ])

    return {
      totalUnacknowledged: unackResult.count ?? 0,
      triggeredToday: todayResult.count ?? 0,
      triggeredThisWeek: weekResult.count ?? 0,
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
    given_name: string
    family_name: string
    telecom_email: string
    kyc_status: string
  } | null
  const providerName = practitioner
    ? `${practitioner.given_name ?? ''} ${practitioner.family_name ?? ''}`.trim()
    : 'Unknown'

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
    registryVerificationStatus: null as string | null,
    licenseDocumentKey: licenseDoc?.storageKey ?? null,
    kycStatus: practitioner?.kyc_status ?? 'PENDING_VERIFICATION',
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
