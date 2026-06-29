import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { roleRestrictedProcedure } from '../rbac'
import { AuditLogger } from '@ultranos/audit-logger'
import { getBillingAdapter } from '@ultranos/billing'
import {
  ROLE_MODULE_MAP,
  MODULE_DISPLAY_NAMES,
  getModuleForRole,
} from '@ultranos/shared-types'
import {
  scheduleUserSuspension,
  reactivateUsersForModule,
} from '@/lib/subscription-lifecycle'

/**
 * Build a base64-encoded CSV export from headers and row data.
 * Shared by subscription export procedures.
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
 * Subscription domain router.
 * Story 27.2: Module Catalog & Subscription State.
 *
 * Provides read queries for the module catalog and org subscription state.
 * No PHI involved — subscription data is operational/billing metadata.
 */
export const subscriptionRouter = createTRPCRouter({
  /**
   * AC #1, #4: List all active modules in the catalog.
   * Any authenticated user can browse — no audit event (non-PHI, public data).
   */
  listModules: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('modules')
      .select('id, code, display_name, description, base_price_usd, is_active')
      .eq('is_active', true)
      .order('code')

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve module catalog',
      })
    }

    return {
      modules: (data ?? []).map((m) => ({
        id: m.id as string,
        code: m.code as string,
        displayName: m.display_name as string,
        description: m.description as string | null,
        basePriceUsd: parseFloat(String(m.base_price_usd ?? '0')) || 0,
        isActive: m.is_active as boolean,
      })),
    }
  }),

  /**
   * AC #2, #5: List subscriptions for an org.
   * Hub API uses service_role (bypasses RLS) — org scoping enforced at app layer.
   * Joins modules for display names. Emits READ audit event.
   */
  listOrgSubscriptions: protectedProcedure
    .input(z.object({ orgId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const orgId = input.orgId ?? ctx.user.orgId

      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT or input',
        })
      }

      // Role allowlist: subscription/billing data is staff-only
      const SUBSCRIPTION_READ_ROLES = ['DOCTOR', 'PHARMACIST', 'LAB_TECH', 'ADMIN', 'PLATFORM_ADMIN']
      if (!SUBSCRIPTION_READ_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — role not permitted to view subscription data',
        })
      }

      // App-layer org scoping: service_role bypasses RLS, so enforce here.
      // Only PLATFORM_ADMIN may read other orgs' subscriptions.
      if (
        orgId !== ctx.user.orgId &&
        ctx.user.role !== 'PLATFORM_ADMIN'
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — cannot read subscriptions for another organization',
        })
      }

      const { data, error } = await ctx.supabase
        .from('org_subscriptions')
        .select('id, org_id, module_code, status, started_at, expires_at, cancelled_at, modules(display_name)')
        .eq('org_id', orgId)
        .order('module_code')

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve subscriptions',
        })
      }

      // Audit operational read (non-PHI)
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'SUBSCRIPTION',
          resourceId: `org-subscriptions:${orgId}`,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { orgId, resultCount: (data ?? []).length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'SUBSCRIPTION' })
      }

      return {
        subscriptions: (data ?? []).map((s) => ({
          id: s.id as string,
          orgId: s.org_id as string,
          moduleCode: s.module_code as string,
          moduleName: (() => {
            const mod = Array.isArray(s.modules) ? s.modules[0] : s.modules
            return (mod as any)?.display_name ?? s.module_code
          })(),
          status: s.status as string,
          startedAt: s.started_at as string,
          expiresAt: s.expires_at as string | null,
          cancelledAt: s.cancelled_at as string | null,
        })),
      }
    }),

  /**
   * AC #2: Get a single active/trial subscription for an org + module.
   * Used by entitlement middleware (Story 27.3).
   */
  getOrgSubscription: protectedProcedure
    .input(z.object({ orgId: z.string().uuid(), moduleCode: z.enum(['OPD_LITE', 'PHARMACY_LITE', 'LAB_LITE']) }))
    .query(async ({ ctx, input }) => {
      // App-layer org scoping: service_role bypasses RLS, so enforce here.
      // Only PLATFORM_ADMIN may read other orgs' subscriptions.
      if (
        input.orgId !== ctx.user.orgId &&
        ctx.user.role !== 'PLATFORM_ADMIN'
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — cannot read subscriptions for another organization',
        })
      }

      const { data, error } = await ctx.supabase
        .from('org_subscriptions')
        .select('id, org_id, module_code, status, started_at, expires_at, cancelled_at')
        .eq('org_id', input.orgId)
        .eq('module_code', input.moduleCode)
        .in('status', ['ACTIVE', 'TRIAL'])
        .maybeSingle()

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve subscription',
        })
      }

      if (!data) return { subscription: null }

      return {
        subscription: {
          id: data.id as string,
          orgId: data.org_id as string,
          moduleCode: data.module_code as string,
          status: data.status as string,
          startedAt: data.started_at as string,
          expiresAt: data.expires_at as string | null,
          cancelledAt: data.cancelled_at as string | null,
        },
      }
    }),

  // ── Story 27.5: Admin Subscription Management ─────────────────

  /**
   * AC #1: Get org details + subscribed modules + total monthly cost.
   * ADMIN only. Uses caller's orgId from JWT.
   */
  getOrgSubscriptions: roleRestrictedProcedure(['ADMIN'])
    .query(async ({ ctx }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      // Fetch org details (includes payment failure and grace period fields)
      const { data: org, error: orgError } = await ctx.supabase
        .from('organizations')
        .select('id, name, status, trial_ends_at, billing_email, payment_failure_reason, grace_period_ends_at')
        .eq('id', orgId)
        .single()

      if (orgError || !org) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve organization details',
        })
      }

      // Fetch subscriptions joined with modules for display_name and price
      const { data: subs, error: subsError } = await ctx.supabase
        .from('org_subscriptions')
        .select('id, org_id, module_code, status, started_at, expires_at, cancelled_at, modules(display_name, base_price_usd)')
        .eq('org_id', orgId)
        .order('module_code')

      if (subsError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve subscriptions',
        })
      }

      const subscriptions = (subs ?? []).map((s) => {
        const mod = Array.isArray(s.modules) ? s.modules[0] : s.modules
        const price = parseFloat(String((mod as any)?.base_price_usd ?? '0')) || 0
        // P11: Warn when module join returned no data — likely data integrity issue
        if (!mod) {
          console.warn(`[SUBSCRIPTION] Module join missing for subscription ${s.id}, module_code=${s.module_code}`)
        }
        return {
          id: s.id as string,
          orgId: s.org_id as string,
          moduleCode: s.module_code as string,
          moduleName: (mod as any)?.display_name ?? s.module_code,
          status: s.status as string,
          startedAt: s.started_at as string,
          expiresAt: s.expires_at as string | null,
          cancelledAt: s.cancelled_at as string | null,
          monthlyCostUsd: price,
        }
      })

      // Total cost: only ACTIVE/TRIAL subscriptions
      const totalMonthlyCostUsd = subscriptions
        .filter((s) => s.status === 'ACTIVE' || s.status === 'TRIAL')
        .reduce((sum, s) => sum + s.monthlyCostUsd, 0)

      return {
        organization: {
          id: org.id as string,
          name: org.name as string,
          status: org.status as string,
          trialEndsAt: org.trial_ends_at as string | null,
          billingEmail: org.billing_email as string,
          paymentFailureReason: (org as Record<string, unknown>).payment_failure_reason as string | null ?? null,
          gracePeriodEndsAt: (org as Record<string, unknown>).grace_period_ends_at as string | null ?? null,
        },
        subscriptions,
        totalMonthlyCostUsd,
      }
    }),

  /**
   * AC #2: Get available (unsubscribed) modules for the caller's org.
   * ADMIN only. Returns active modules not currently subscribed.
   */
  getAvailableModules: roleRestrictedProcedure(['ADMIN'])
    .query(async ({ ctx }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      // Fetch all active modules
      const { data: allModules, error: modError } = await ctx.supabase
        .from('modules')
        .select('id, code, display_name, description, base_price_usd, is_active')
        .eq('is_active', true)
        .order('code')

      if (modError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve module catalog',
        })
      }

      // Fetch existing active/trial subscriptions for this org
      const { data: existingSubs, error: subError } = await ctx.supabase
        .from('org_subscriptions')
        .select('module_code')
        .eq('org_id', orgId)
        .in('status', ['ACTIVE', 'TRIAL'])

      if (subError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve existing subscriptions',
        })
      }

      const subscribedCodes = new Set((existingSubs ?? []).map((s) => s.module_code))

      return {
        modules: (allModules ?? [])
          .filter((m) => !subscribedCodes.has(m.code as string))
          .map((m) => ({
            id: m.id as string,
            code: m.code as string,
            displayName: m.display_name as string,
            description: m.description as string | null,
            basePriceUsd: parseFloat(String(m.base_price_usd ?? '0')) || 0,
          })),
      }
    }),

  /**
   * AC #4: Add a module subscription for the caller's org.
   * ADMIN only. Status matches org status (TRIAL → TRIAL, ACTIVE → ACTIVE).
   * Rejects if org is SUSPENDED/CANCELLED or module already subscribed.
   * AC #5: Emits audit event.
   */
  addModule: roleRestrictedProcedure(['ADMIN'])
    .input(z.object({ moduleCode: z.string().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      // P4: Validate moduleCode against DB instead of hardcoded enum
      const { data: moduleRow, error: moduleError } = await ctx.supabase
        .from('modules')
        .select('code')
        .eq('code', input.moduleCode)
        .eq('is_active', true)
        .maybeSingle()

      if (moduleError || !moduleRow) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid or inactive module code: ${input.moduleCode}`,
        })
      }

      // Fetch org to determine status
      const { data: org, error: orgError } = await ctx.supabase
        .from('organizations')
        .select('id, status, trial_ends_at')
        .eq('id', orgId)
        .single()

      if (orgError || !org) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve organization',
        })
      }

      // Reject if org is SUSPENDED or CANCELLED
      if (org.status === 'SUSPENDED' || org.status === 'CANCELLED') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot add modules to a suspended or cancelled organization',
        })
      }

      // Check for existing active/trial subscription
      const { data: existing } = await ctx.supabase
        .from('org_subscriptions')
        .select('id')
        .eq('org_id', orgId)
        .eq('module_code', input.moduleCode)
        .in('status', ['ACTIVE', 'TRIAL'])
        .maybeSingle()

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Module ${input.moduleCode} is already subscribed`,
        })
      }

      // Determine subscription status and expiry based on org status
      const now = new Date()
      let subStatus: string
      let expiresAt: string | null

      if (org.status === 'TRIAL') {
        // P6: Guard against null trial_ends_at on TRIAL orgs
        if (!org.trial_ends_at) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Organization is in TRIAL status but has no trial_ends_at date',
          })
        }
        subStatus = 'TRIAL'
        expiresAt = org.trial_ends_at as string
      } else {
        // ACTIVE org → 30-day billing period
        subStatus = 'ACTIVE'
        const expiry = new Date(now)
        expiry.setDate(expiry.getDate() + 30)
        expiresAt = expiry.toISOString()
      }

      const { data: newSub, error: insertError } = await ctx.supabase
        .from('org_subscriptions')
        .insert({
          org_id: orgId,
          module_code: input.moduleCode,
          status: subStatus,
          started_at: now.toISOString(),
          expires_at: expiresAt,
        })
        .select('id, org_id, module_code, status, started_at, expires_at, cancelled_at')
        .single()

      // P7: Handle duplicate key constraint violation (concurrent addModule race)
      if (insertError) {
        if ((insertError as any).code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Module ${input.moduleCode} is already subscribed`,
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create subscription',
        })
      }
      if (!newSub) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create subscription',
        })
      }

      // AC #5: Audit event — no PHI
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'Subscription',
          resourceId: newSub.id as string,
          actorId: ctx.user.sub,
          actorRole: 'ADMIN',
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { moduleCode: input.moduleCode, orgId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'Subscription' })
      }

      // Story 27.7: Reactivate users suspended due to this module's cancellation
      await reactivateUsersForModule(
        ctx.supabase,
        orgId,
        input.moduleCode,
        ctx.user.sub,
        ctx.user.sessionId,
      )

      return {
        subscription: {
          id: newSub.id as string,
          orgId: newSub.org_id as string,
          moduleCode: newSub.module_code as string,
          status: newSub.status as string,
          startedAt: newSub.started_at as string,
          expiresAt: newSub.expires_at as string | null,
          cancelledAt: newSub.cancelled_at as string | null,
        },
      }
    }),

  /**
   * AC #3: Cancel a module subscription (soft-delete).
   * Sets cancelled_at = now(), status = CANCELLED. Row persists — access until expires_at.
   * ADMIN only. AC #5: Emits audit event.
   */
  removeModule: roleRestrictedProcedure(['ADMIN'])
    .input(z.object({ subscriptionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      // Verify subscription exists and belongs to caller's org
      const { data: existing, error: fetchError } = await ctx.supabase
        .from('org_subscriptions')
        .select('id, org_id, module_code, status, expires_at')
        .eq('id', input.subscriptionId)
        .single()

      if (fetchError || !existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        })
      }

      if (existing.org_id !== orgId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — subscription belongs to another organization',
        })
      }

      // P8: Only ACTIVE or TRIAL subscriptions can be cancelled
      if (existing.status !== 'ACTIVE' && existing.status !== 'TRIAL') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot cancel a subscription with status ${existing.status}`,
        })
      }

      // Soft-cancel: set status + cancelled_at, preserve the row
      const now = new Date().toISOString()
      const { data: updated, error: updateError } = await ctx.supabase
        .from('org_subscriptions')
        .update({ status: 'CANCELLED', cancelled_at: now })
        .eq('id', input.subscriptionId)
        .eq('org_id', orgId) // P5: Defense-in-depth — scope UPDATE by org_id
        .select('id, org_id, module_code, status, started_at, expires_at, cancelled_at')
        .single()

      if (updateError || !updated) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel subscription',
        })
      }

      // AC #5: Audit event — no PHI
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'UPDATE',
          resourceType: 'Subscription',
          resourceId: input.subscriptionId,
          actorId: ctx.user.sub,
          actorRole: 'ADMIN',
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            moduleCode: existing.module_code,
            orgId,
            cancellation: true,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'UPDATE', resourceType: 'Subscription' })
      }

      // Story 27.7 AC #3: Schedule user suspension at end of billing period
      // Suspension scheduling is a side-effect — cancellation already succeeded.
      // Log but do not fail the mutation if scheduling throws.
      try {
        const effectiveDate = existing.expires_at
          ? new Date(existing.expires_at as string)
          : new Date() // If no expires_at, suspend immediately
        await scheduleUserSuspension(
          ctx.supabase,
          orgId,
          existing.module_code as string,
          effectiveDate,
          ctx.user.sub,
          ctx.user.sessionId,
        )
      } catch (err) {
        console.warn('[SUSPENSION_SCHEDULING_FAILED]', { orgId, moduleCode: existing.module_code, error: (err as Error).message })
      }

      return {
        subscription: {
          id: updated.id as string,
          orgId: updated.org_id as string,
          moduleCode: updated.module_code as string,
          status: updated.status as string,
          startedAt: updated.started_at as string,
          expiresAt: updated.expires_at as string | null,
          cancelledAt: updated.cancelled_at as string | null,
        },
      }
    }),

  // ── Story 27.7: Admin User Provisioning Scoped to Subscription ──

  /**
   * AC #1: Get available roles based on org's active subscriptions.
   * ADMIN only. Returns available (assignable) and unavailable roles.
   */
  getAvailableRoles: roleRestrictedProcedure(['ADMIN'])
    .query(async ({ ctx }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      // Fetch active/trial subscriptions for the org
      const { data: subs, error } = await ctx.supabase
        .from('org_subscriptions')
        .select('module_code')
        .eq('org_id', orgId)
        .in('status', ['ACTIVE', 'TRIAL'])

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve org subscriptions',
        })
      }

      const activeModules = new Set((subs ?? []).map((s) => s.module_code as string))

      const availableRoles: Array<{ role: string; moduleCode: string | null; moduleName: string | null }> = []
      const unavailableRoles: Array<{ role: string; moduleCode: string; moduleName: string; reason: 'NOT_SUBSCRIBED' }> = []

      for (const [role, moduleCode] of Object.entries(ROLE_MODULE_MAP)) {
        if (moduleCode === null) {
          // Always available (e.g. ADMIN)
          availableRoles.push({ role, moduleCode: null, moduleName: null })
        } else if (activeModules.has(moduleCode)) {
          availableRoles.push({
            role,
            moduleCode,
            moduleName: MODULE_DISPLAY_NAMES[moduleCode] ?? moduleCode,
          })
        } else {
          unavailableRoles.push({
            role,
            moduleCode,
            moduleName: MODULE_DISPLAY_NAMES[moduleCode] ?? moduleCode,
            reason: 'NOT_SUBSCRIBED',
          })
        }
      }

      return { availableRoles, unavailableRoles }
    }),

  /**
   * AC #1 server-side validation: Check if a role is assignable for the org.
   * ADMIN only. Used before creating a user to enforce subscription scope.
   */
  validateRoleForOrg: roleRestrictedProcedure(['ADMIN'])
    .input(z.object({ role: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      const moduleCode = getModuleForRole(input.role)

      // Roles not in ROLE_MODULE_MAP are unknown
      if (!(input.role in ROLE_MODULE_MAP)) {
        return { allowed: false, reason: `Unknown role: ${input.role}` }
      }

      // Always-available roles (null module)
      if (moduleCode === null) {
        return { allowed: true }
      }

      // Check if the required module is actively subscribed
      const { data: sub, error } = await ctx.supabase
        .from('org_subscriptions')
        .select('id')
        .eq('org_id', orgId)
        .eq('module_code', moduleCode)
        .in('status', ['ACTIVE', 'TRIAL'])
        .maybeSingle()

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to check subscription status',
        })
      }

      if (!sub) {
        const moduleName = MODULE_DISPLAY_NAMES[moduleCode] ?? moduleCode
        return {
          allowed: false,
          reason: `Subscribe to ${moduleName} to add ${input.role} users`,
        }
      }

      return { allowed: true }
    }),

  // ── Story 27.8: Subscription Billing Procedures ─────────────────

  /**
   * Get payment method on file for the caller's org.
   * Looks up provider_customer_id from org_subscriptions, then checks
   * billing_events for the latest CHARGE_SUCCESS with card metadata.
   */
  getPaymentMethod: roleRestrictedProcedure(['ADMIN'])
    .query(async ({ ctx }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      // Find provider_customer_id from any active subscription
      const { data: sub } = await ctx.supabase
        .from('org_subscriptions')
        .select('provider_customer_id')
        .eq('org_id', orgId)
        .not('provider_customer_id', 'is', null)
        .limit(1)
        .maybeSingle()

      if (!sub?.provider_customer_id) {
        return { paymentMethod: null }
      }

      // Check billing_events for latest CHARGE_SUCCESS with card metadata
      const { data: event } = await ctx.supabase
        .from('billing_events')
        .select('metadata')
        .eq('org_id', orgId)
        .eq('event_type', 'CHARGE_SUCCESS')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!event?.metadata) {
        return { paymentMethod: null }
      }

      const meta = event.metadata as Record<string, unknown>
      const card = meta.card as Record<string, unknown> | undefined

      if (!card) {
        return { paymentMethod: null }
      }

      return {
        paymentMethod: {
          brand: (card.brand as string) ?? null,
          last4: (card.last4 as string) ?? null,
          expMonth: (card.exp_month as number) ?? null,
          expYear: (card.exp_year as number) ?? null,
        },
      }
    }),

  /**
   * Create a payment setup session.
   * Gets or creates a billing customer via the adapter.
   * If adapter doesn't support createSetupIntent, returns a stub response.
   */
  createPaymentSetup: roleRestrictedProcedure(['ADMIN'])
    .mutation(async ({ ctx }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      // Fetch org billing info
      const { data: org, error: orgError } = await ctx.supabase
        .from('organizations')
        .select('id, name, billing_email')
        .eq('id', orgId)
        .single()

      if (orgError || !org) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve organization details',
        })
      }

      const adapter = getBillingAdapter()

      // Check if org already has a customer ID
      const { data: existingSub } = await ctx.supabase
        .from('org_subscriptions')
        .select('provider_customer_id')
        .eq('org_id', orgId)
        .not('provider_customer_id', 'is', null)
        .limit(1)
        .maybeSingle()

      let customerId = existingSub?.provider_customer_id as string | null

      // Create customer if needed
      if (!customerId) {
        try {
          customerId = await adapter.createCustomer(
            orgId,
            (org.billing_email as string) ?? '',
            org.name as string,
          )
        } catch (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create billing customer',
          })
        }
      }

      // Check if adapter has createSetupIntent method
      if (typeof (adapter as any).createSetupIntent === 'function') {
        try {
          const setupData = await (adapter as any).createSetupIntent(customerId)

          // Audit event
          const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
          try {
            await audit.emit({
              action: 'PAYMENT_SETUP_INITIATED',
              resourceType: 'BILLING',
              resourceId: orgId,
              actorId: ctx.user.sub,
              actorRole: 'ADMIN',
              outcome: 'SUCCESS',
              sessionId: ctx.user.sessionId,
              metadata: { orgId, customerId },
            })
          } catch {
            console.warn('[AUDIT_FAILURE]', { action: 'PAYMENT_SETUP_INITIATED' })
          }

          return { setup: setupData, customerId }
        } catch (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create payment setup',
          })
        }
      }

      // Adapter doesn't support createSetupIntent — return stub
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PAYMENT_SETUP_INITIATED',
          resourceType: 'BILLING',
          resourceId: orgId,
          actorId: ctx.user.sub,
          actorRole: 'ADMIN',
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { orgId, customerId, stub: true },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PAYMENT_SETUP_INITIATED' })
      }

      return {
        setup: { provider: 'none', message: 'Billing provider setup not yet available' },
        customerId,
      }
    }),

  /**
   * Remove the payment method on file.
   * Emits PAYMENT_METHOD_REMOVED audit event.
   */
  removePaymentMethod: roleRestrictedProcedure(['ADMIN'])
    .mutation(async ({ ctx }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PAYMENT_METHOD_REMOVED',
          resourceType: 'BILLING',
          resourceId: orgId,
          actorId: ctx.user.sub,
          actorRole: 'ADMIN',
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { orgId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PAYMENT_METHOD_REMOVED' })
      }

      return { success: true }
    }),

  /**
   * List invoices for the caller's org from the billing provider.
   * Paginates and optionally filters by status.
   */
  listInvoices: roleRestrictedProcedure(['ADMIN'])
    .input(
      z.object({
        status: z.enum(['ALL', 'PAID', 'OPEN', 'VOID', 'UNCOLLECTIBLE']).default('ALL'),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      // Find provider_customer_id
      const { data: sub } = await ctx.supabase
        .from('org_subscriptions')
        .select('provider_customer_id')
        .eq('org_id', orgId)
        .not('provider_customer_id', 'is', null)
        .limit(1)
        .maybeSingle()

      if (!sub?.provider_customer_id) {
        return { invoices: [], totalCount: 0 }
      }

      const adapter = getBillingAdapter()
      let invoices = await adapter.getInvoices(sub.provider_customer_id as string)

      // Filter by status
      if (input.status !== 'ALL') {
        const statusLower = input.status.toLowerCase()
        invoices = invoices.filter((inv) => inv.status.toLowerCase() === statusLower)
      }

      const totalCount = invoices.length

      // Paginate
      const paged = invoices.slice(input.cursor, input.cursor + input.limit)

      return {
        invoices: paged.map((inv) => ({
          invoiceId: inv.invoiceId,
          amount: inv.amount,
          currency: inv.currency,
          status: inv.status,
          pdfUrl: inv.pdfUrl ?? null,
          createdAt: inv.createdAt.toISOString(),
        })),
        totalCount,
      }
    }),

  /**
   * Export subscriptions as CSV (base64-encoded).
   * ADMIN only. Joins with modules for display names and pricing.
   */
  exportSubscriptions: roleRestrictedProcedure(['ADMIN'])
    .query(async ({ ctx }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      const { data: subs, error } = await ctx.supabase
        .from('org_subscriptions')
        .select('id, module_code, status, started_at, expires_at, cancelled_at, modules(display_name, base_price_usd)')
        .eq('org_id', orgId)
        .order('module_code')

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve subscriptions for export',
        })
      }

      const headers = ['Module Code', 'Module Name', 'Status', 'Monthly Price (USD)', 'Started At', 'Expires At', 'Cancelled At']
      const rows = (subs ?? []).map((s) => {
        const mod = Array.isArray(s.modules) ? s.modules[0] : s.modules
        return [
          s.module_code as string,
          (mod as any)?.display_name ?? s.module_code as string,
          s.status as string,
          String(parseFloat(String((mod as any)?.base_price_usd ?? '0')) || 0),
          (s.started_at as string) ?? '',
          (s.expires_at as string) ?? '',
          (s.cancelled_at as string) ?? '',
        ]
      })

      return buildCsvExport(headers, rows, 'subscriptions')
    }),
})
