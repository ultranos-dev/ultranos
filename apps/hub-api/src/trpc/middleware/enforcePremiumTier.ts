import { TRPCError } from '@trpc/server'
import { isSafetyCritical, type FeatureId } from '@ultranos/shared-types'
import { tInstance } from '@/trpc/init'

/**
 * Premium tier enforcement middleware — gates patient-facing API endpoints
 * behind premium subscription status.
 *
 * Story 27.11: Freemium Tier Definition & Feature Gating
 *
 * Patient-facing middleware (separate from org entitlement):
 * - Reads `patient_tier` from the patients table via the authenticated user's ID
 * - FREE tier → FORBIDDEN with PREMIUM_REQUIRED + featureId
 * - PREMIUM tier → pass through
 * - Caches tier on ctx to avoid repeated DB lookups within a single request
 *
 * CRITICAL: Must NEVER be applied to safety-critical endpoints (allergies,
 * active medications, consent). Runtime assertion enforces this.
 */
export function enforcePremiumTier(featureId: FeatureId) {
  // Runtime assertion at middleware construction time — catches misconfiguration
  // at app startup, not at request time.
  if (isSafetyCritical(featureId)) {
    throw new Error(
      `CONFIGURATION ERROR: Cannot apply premium gate to safety-critical feature: ${featureId}`,
    )
  }

  return tInstance.middleware(async (opts) => {
    // Applied downstream of protectedProcedure — user is present; guard defensively.
    const user = opts.ctx.user
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    // Use cached tier if already fetched in this request (injected upstream).
    let tier = (opts.ctx as { _patientTier?: 'FREE' | 'PREMIUM' })._patientTier

    if (!tier) {
      const { data, error } = await opts.ctx.supabase
        .from('patients')
        .select('patient_tier')
        .eq('id', user.sub)
        .single()

      if (error || !data) {
        // Fail-closed: if we can't determine tier, deny premium access
        // but don't block — default to FREE (safe default)
        tier = 'FREE'
      } else {
        tier = (data.patient_tier as string)?.toUpperCase() === 'PREMIUM' ? 'PREMIUM' : 'FREE'
      }
    }

    if (tier === 'FREE') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'PREMIUM_REQUIRED',
        cause: { featureId },
      })
    }

    return opts.next({
      ctx: { ...opts.ctx, user, _patientTier: tier },
    })
  })
}
