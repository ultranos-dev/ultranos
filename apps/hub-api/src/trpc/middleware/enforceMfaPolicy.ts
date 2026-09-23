import { TRPCError } from '@trpc/server'
import { AuditLogger } from '@ultranos/audit-logger'
import type { AuthedTRPCContext } from '../init'
import {
  getOrgSecurityPolicy,
  resolveMfaEnforcementStage,
  hasAal2,
} from '@/lib/mfa-policy'

/**
 * Story 56.3 — conditional, org-level MFA enforcement.
 *
 * Called from `protectedProcedure` for every authenticated request. It is a no-op
 * for the vast majority of traffic: it only imposes an `aal2` requirement when the
 * caller's org has explicitly turned MFA on (default OFF) AND the rollout grace
 * window has elapsed. With the default policy every login/session flow behaves
 * exactly as before (AC 2, AC 7).
 *
 * Policy resolution is server-authoritative (never a client-supplied value) and
 * cached per-org with a short TTL, so this does not add a DB hit per procedure.
 *
 * PHI safety: only opaque ids (sub/org/session) and enum actions are handled/logged.
 */

/** Roles exempt from MFA entirely — patient-facing auth is OTP-only (policy). */
const MFA_EXEMPT_ROLES = new Set(['PATIENT', 'GUARDIAN'])

/**
 * Recovery / self endpoints that must remain reachable at aal1 so an admin who
 * enabled MFA (or a user mid-rollout) can never be locked out of turning it back
 * off or reading their own profile. Enrollment itself happens directly against
 * Supabase Auth (client → GoTrue), not through the Hub, so there is no Hub
 * "enroll" procedure to exempt — only these recovery reads/writes.
 */
const MFA_EXEMPT_PATHS = new Set<string>([
  'admin.getSecurityPolicy',
  'admin.updateSecurityPolicy',
  'users.getProfile',
])

// Throttle grace-window telemetry to at most once per day per user (AC 2.3) so a
// chatty client during the grace period does not flood the audit chain.
const GRACE_LOG_THROTTLE_MS = 24 * 60 * 60 * 1000
const graceLoggedAt = new Map<string, number>()

/** Test hook. */
export function _resetGraceTelemetryThrottle(): void {
  graceLoggedAt.clear()
}

export async function enforceMfaPolicy(opts: {
  ctx: AuthedTRPCContext
  path: string
}): Promise<void> {
  const { ctx, path } = opts
  const user = ctx.user

  // Exempt patient-facing roles (OTP-only) and unknown/empty roles (they fail
  // closed elsewhere in RBAC; MFA is a staff concern).
  if (MFA_EXEMPT_ROLES.has(user.role)) return

  // No org context → nothing to look up; treat as the default (disabled) posture.
  if (!user.orgId) return

  // Recovery/self endpoints stay reachable regardless of aal.
  if (MFA_EXEMPT_PATHS.has(path)) return

  // No `aal` claim at all → this is not a Supabase user-session token (GoTrue
  // always mints `aal` on those). Legacy/service tokens carry no assurance level
  // and are not MFA-gatable, so skip the policy lookup entirely. A forged token
  // cannot add `aal` without invalidating the (already-verified) signature, so
  // this cannot be used to bypass enforcement on a real session.
  if (user.aal == null) return

  const policy = await getOrgSecurityPolicy(ctx.supabase, user.orgId)
  const stage = resolveMfaEnforcementStage(policy)

  if (stage === 'disabled') return

  if (stage === 'grace') {
    // Within the rollout grace window: allow aal1 but emit telemetry (throttled)
    // so admins can see who has not yet enrolled. Only warn for under-assured
    // sessions — an already-aal2 user needs no nudge.
    if (!hasAal2(user.aal)) {
      const key = `${user.orgId}:${user.sub}`
      const now = Date.now()
      const last = graceLoggedAt.get(key)
      if (!last || now - last > GRACE_LOG_THROTTLE_MS) {
        graceLoggedAt.set(key, now)
        const audit = new AuditLogger(ctx.supabase, user.orgId)
        try {
          await audit.emit({
            action: 'MFA_GRACE_PERIOD_WARNING',
            resourceType: 'ORGANIZATION',
            resourceId: user.orgId,
            actorId: user.sub,
            actorRole: user.role,
            outcome: 'SUCCESS',
            sessionId: user.sessionId,
            metadata: { aal: user.aal ?? 'aal1', stage: 'grace' },
          })
        } catch {
          console.warn('[AUDIT_FAILURE]', { action: 'MFA_GRACE_PERIOD_WARNING' })
        }
      }
    }
    return
  }

  // stage === 'enforce': require a second factor.
  if (!hasAal2(user.aal)) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      // Distinct, machine-detectable marker so clients can route to the TOTP
      // challenge/enrollment instead of showing a generic auth error (AC 3).
      message: 'MFA_REQUIRED',
    })
  }
}
