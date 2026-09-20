import { TRPCError } from '@trpc/server'
import { tInstance } from '@/trpc/init'

/**
 * PENDING_VERIFICATION gate middleware — blocks clinical route access
 * for organizations that haven't completed KYC verification.
 *
 * Story 27.6 AC #6: No clinical data access until KYC is approved.
 *
 * Org status lifecycle: PENDING_VERIFICATION → TRIAL → ACTIVE → ...
 * Only TRIAL and ACTIVE orgs may access clinical routes.
 *
 * **Clinical routes that need this gate:**
 *   encounter, medication, medication-statement, allergy, diagnostic-report,
 *   soap (via encounter), observations, conditions
 *
 * **Routes that BYPASS this gate:**
 *   subscription, entitlement, registration, audit, notification, health,
 *   patient, patient-key, consent, sync, vocabulary, practitioner-key
 */
export function enforceVerifiedOrg() {
  return tInstance.middleware(async (opts) => {
    const user = opts.ctx.user
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    // PLATFORM_ADMIN bypass — always allowed
    if (user.role === 'PLATFORM_ADMIN') {
      return opts.next({ ctx: { ...opts.ctx, user } })
    }

    if (!user.orgId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'KYC_REQUIRED',
        cause: { orgStatus: 'NO_ORG' },
      })
    }

    const { data: org, error } = await opts.ctx.supabase
      .from('organizations')
      .select('status')
      .eq('id', user.orgId)
      .single()

    if (error || !org) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to verify organization status',
      })
    }

    const status = org.status as string

    // Allowlist: only TRIAL and ACTIVE orgs may access clinical routes (fail-closed)
    if (status === 'TRIAL' || status === 'ACTIVE') {
      return opts.next({ ctx: { ...opts.ctx, user } })
    }

    if (status === 'PENDING_VERIFICATION') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'KYC_REQUIRED',
        cause: { orgStatus: 'PENDING_VERIFICATION' },
      })
    }

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'ORG_INACTIVE',
      cause: { orgStatus: status },
    })
  })
}
