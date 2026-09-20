import { TRPCError } from '@trpc/server'
import { tInstance } from '@/trpc/init'

/**
 * Entitlement enforcement middleware — gates API access by org subscription.
 *
 * Middleware check order (Story 27.9 AC #2):
 * 1. Auth (JWT validation) — handled by protectedProcedure
 * 2. Org status check — read-only for CANCELLED (<90d), blocked for expired (>=90d)
 * 3. Module entitlement check — ACTIVE or TRIAL subscription required
 * 4. Procedure execution
 *
 * Checks `org_subscriptions` for an ACTIVE or TRIAL subscription matching the
 * caller's org and the required module code. Rejects with FORBIDDEN /
 * SUBSCRIPTION_REQUIRED if no valid subscription exists.
 *
 * **Exempt routers** (do NOT apply this middleware):
 * - `patient.ts` — patient self-registration, no org context
 * - `patient-key.ts` — Health Passport key management, patient-scoped
 * - `consent.ts` — consent management, patient-scoped
 * - `health.ts` — health check endpoint, no auth required
 * - `sync.ts` — sync operations carry their own resource-level auth
 * - `audit.ts` — audit reads are admin-only, already behind RBAC
 * - `notification.ts` — notifications cross module boundaries
 * - `subscription.ts` — subscription reads are operational/billing metadata
 *
 * @param moduleCode - The module code to check (e.g. 'OPD_LITE', 'LAB_LITE')
 * @param procedureType - 'query' for read operations, 'mutation' for writes
 */
export function enforceEntitlement(moduleCode: string, procedureType: 'query' | 'mutation' = 'query') {
  return tInstance.middleware(async (opts) => {
    // Applied downstream of protectedProcedure — user is present; guard defensively.
    const user = opts.ctx.user
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    // Per-request entitlement cache injected by an upstream enforceEntitlement, if any.
    const cachedEntitlement = (
      opts.ctx as { entitlement?: { moduleCode: string; status: string } }
    ).entitlement

    // PLATFORM_ADMIN bypasses all checks — operates across orgs
    if (user.role === 'PLATFORM_ADMIN') {
      return opts.next({
        ctx: { ...opts.ctx, user, entitlement: { moduleCode, status: 'ADMIN_BYPASS' }, orgReadOnly: false },
      })
    }

    // Org ADMIN bypasses module entitlement but NOT org status checks (D5: AC #2 compliance)
    // ADMIN of a CANCELLED org must be subject to read-only enforcement
    if (user.role === 'ADMIN') {
      // Still need to check org status for ADMIN
      if (!user.orgId) {
        return opts.next({
          ctx: { ...opts.ctx, user, entitlement: { moduleCode, status: 'ADMIN_BYPASS' }, orgReadOnly: false },
        })
      }
      // Fall through to org status check below — ADMIN skips module entitlement but not status
    }

    // Org context required for non-patient endpoints
    if (!user.orgId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'ORG_CONTEXT_REQUIRED' })
    }

    // ── Story 27.9 AC #2: Org status check (BEFORE module entitlement) ──
    // CANCELLED orgs get read-only access for 90 days, then fully blocked.
    const { data: org, error: orgError } = await opts.ctx.supabase
      .from('organizations')
      .select('id, status, cancelled_at')
      .eq('id', user.orgId)
      .single()

    if (orgError || !org) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'ORG_STATUS_CHECK_FAILED',
      })
    }

    let orgReadOnly = false

    // Story 27.9 D3: SUSPENDED orgs are fully blocked until payment resolves
    if (org.status === 'SUSPENDED') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'ORG_SUSPENDED',
        cause: { reason: 'Organization access suspended due to non-payment. Resolve outstanding payment to restore access.' },
      })
    }

    if (org.status === 'CANCELLED') {
      const cancelledAt = org.cancelled_at ? new Date(org.cancelled_at as string) : null

      if (cancelledAt) {
        const daysSinceCancellation = (Date.now() - cancelledAt.getTime()) / (1000 * 60 * 60 * 24)

        if (daysSinceCancellation >= 90) {
          // AC #2: After 90 days, block all access
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Organization data retention period has expired. Contact support.',
          })
        }
      }

      // AC #2: Within 90 days (or missing cancelled_at) — read-only mode
      orgReadOnly = true
      if (procedureType === 'mutation') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'ORG_READ_ONLY',
          cause: { reason: 'Organization is cancelled. Read-only access for data export.' },
        })
      }
    }

    // ── Per-request cache: if entitlement already resolved for this module, skip DB ──
    if (
      cachedEntitlement &&
      cachedEntitlement.moduleCode === moduleCode &&
      cachedEntitlement.status !== 'ADMIN_BYPASS'
    ) {
      return opts.next({
        ctx: { ...opts.ctx, user, entitlement: cachedEntitlement, orgReadOnly },
      })
    }

    // ── Story 27.9 AC #2: Cancelled orgs skip module entitlement check ──
    // A cancelled org can read data from any previously-subscribed module.
    if (orgReadOnly) {
      return opts.next({
        ctx: { ...opts.ctx, user, entitlement: { moduleCode, status: 'cancelled_read_only' }, orgReadOnly },
      })
    }

    // ADMIN bypasses module entitlement (but already passed org status check above)
    if (user.role === 'ADMIN') {
      return opts.next({
        ctx: { ...opts.ctx, user, entitlement: { moduleCode, status: 'ADMIN_BYPASS' }, orgReadOnly },
      })
    }

    // Check subscription
    const { data, error } = await opts.ctx.supabase
      .from('org_subscriptions')
      .select('id, status')
      .eq('org_id', user.orgId)
      .eq('module_code', moduleCode)
      .in('status', ['ACTIVE', 'TRIAL'])
      .limit(1)

    // D3: Fail-closed on DB errors — distinct from missing subscription
    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'ENTITLEMENT_CHECK_FAILED',
      })
    }

    // P1: .limit(1) returns array — check first element
    const subscription = data?.[0]

    if (!subscription) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'SUBSCRIPTION_REQUIRED',
        cause: { requiredModule: moduleCode },
      })
    }

    // P2: Normalize status to lowercase for consistency with entitlement.check endpoint
    const normalizedStatus = (subscription.status as string).toLowerCase()

    return opts.next({
      ctx: { ...opts.ctx, entitlement: { moduleCode, status: normalizedStatus }, orgReadOnly },
    })
  })
}

/**
 * Standalone org status middleware for routers that don't use enforceEntitlement
 * but still need read-only enforcement for CANCELLED orgs.
 *
 * Story 27.9 AC #2: Sets X-Org-Read-Only response header so frontend
 * can display appropriate UI for cancelled orgs in read-only mode.
 */
export function enforceOrgStatus(procedureType: 'query' | 'mutation' = 'query') {
  return tInstance.middleware(async (opts) => {
    const user = opts.ctx.user
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    // PLATFORM_ADMIN bypasses all org status checks
    if (user.role === 'PLATFORM_ADMIN') {
      return opts.next({ ctx: { ...opts.ctx, user, orgReadOnly: false } })
    }

    // ADMIN falls through to org status check (D5: must respect CANCELLED read-only)
    if (!user.orgId) {
      return opts.next({ ctx: { ...opts.ctx, user, orgReadOnly: false } })
    }

    const { data: org, error } = await opts.ctx.supabase
      .from('organizations')
      .select('id, status, cancelled_at')
      .eq('id', user.orgId)
      .single()

    if (error || !org) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'ORG_STATUS_CHECK_FAILED',
      })
    }

    // SUSPENDED orgs are fully blocked
    if (org.status === 'SUSPENDED') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'ORG_SUSPENDED',
        cause: { reason: 'Organization access suspended due to non-payment. Resolve outstanding payment to restore access.' },
      })
    }

    if (org.status === 'CANCELLED') {
      const cancelledAt = org.cancelled_at ? new Date(org.cancelled_at as string) : null

      if (cancelledAt) {
        const daysSinceCancellation = (Date.now() - cancelledAt.getTime()) / (1000 * 60 * 60 * 24)

        if (daysSinceCancellation >= 90) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Organization data retention period has expired. Contact support.',
          })
        }
      }

      // Within 90 days (or missing cancelled_at) — read-only mode
      if (procedureType === 'mutation') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'ORG_READ_ONLY',
          cause: { reason: 'Organization is cancelled. Read-only access for data export.' },
        })
      }

      return opts.next({ ctx: { ...opts.ctx, user, orgReadOnly: true } })
    }

    return opts.next({ ctx: { ...opts.ctx, user, orgReadOnly: false } })
  })
}
