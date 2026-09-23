import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Story 56.3 — org-level MFA feature toggle.
 *
 * MFA is an admin-controlled, per-org feature (default OFF). The Hub is the single
 * source of truth: it reads the org's `org_security_policies` row and, when MFA is
 * required AND the rollout grace window has elapsed, requires `aal2` from staff-role
 * tokens. Orgs with no row behave exactly as MFA-disabled — the default posture, so
 * every existing login flow is unchanged until an admin opts in.
 *
 * PHI safety: this module never handles or logs PHI. It works with opaque org ids and
 * booleans only.
 */

/** Resolved policy for one org. `null` fields => never enabled. */
export interface OrgSecurityPolicy {
  mfaRequired: boolean
  mfaGracePeriodDays: number
  /** ISO instant MFA was last enabled, or null while disabled. */
  mfaEnabledAt: string | null
}

/** The default posture for an org with no stored policy row. */
export const DEFAULT_ORG_SECURITY_POLICY: OrgSecurityPolicy = {
  mfaRequired: false,
  mfaGracePeriodDays: 7,
  mfaEnabledAt: null,
}

// ---------------------------------------------------------------------------
// Short-TTL in-memory cache
// ---------------------------------------------------------------------------
// A per-request DB hit on every protected procedure is unacceptable. We cache the
// resolved policy per org for a short TTL; `invalidateOrgSecurityPolicy` is called
// by admin.updateSecurityPolicy so a toggle change propagates within one refresh.
// In-memory (not Redis) is sufficient: a stale-by-<=TTL read only ever affects the
// grace/enforce boundary by seconds, and toggle-off is explicitly invalidated.

const CACHE_TTL_MS = 30_000
const MAX_CACHE_ENTRIES = 10_000

interface CacheEntry {
  policy: OrgSecurityPolicy
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

/** Test/util hook — clears the whole cache. */
export function clearOrgSecurityPolicyCache(): void {
  cache.clear()
}

/** Called on policy write so the next lookup re-reads from the DB. */
export function invalidateOrgSecurityPolicy(orgId: string): void {
  cache.delete(orgId)
}

function evictIfNeeded(now: number): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return
  for (const [k, v] of cache) {
    if (now > v.expiresAt) cache.delete(k)
  }
}

/**
 * Resolves the effective security policy for an org, using the short-TTL cache.
 * Fail-safe: on any DB error the org is treated as MFA-disabled (the default) —
 * MFA enforcement must never lock legitimate staff out because of an infra blip;
 * the toggle is opt-in and additive, not a safety gate like drug interactions.
 */
export async function getOrgSecurityPolicy(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgSecurityPolicy> {
  const now = Date.now()
  const hit = cache.get(orgId)
  if (hit && now < hit.expiresAt) return hit.policy

  let policy: OrgSecurityPolicy = DEFAULT_ORG_SECURITY_POLICY
  try {
    const { data, error } = await supabase
      .from('org_security_policies')
      .select('mfa_required, mfa_grace_period_days, mfa_enabled_at')
      .eq('org_id', orgId)
      .maybeSingle()

    if (!error && data) {
      policy = {
        mfaRequired: Boolean((data as Record<string, unknown>).mfa_required),
        mfaGracePeriodDays: Number((data as Record<string, unknown>).mfa_grace_period_days ?? 7),
        mfaEnabledAt: ((data as Record<string, unknown>).mfa_enabled_at as string) ?? null,
      }
    }
  } catch {
    // Fail-safe to default (disabled). Do not log PHI; orgId is opaque and safe,
    // but there is nothing actionable to record here.
    policy = DEFAULT_ORG_SECURITY_POLICY
  }

  evictIfNeeded(now)
  cache.set(orgId, { policy, expiresAt: now + CACHE_TTL_MS })
  return policy
}

/** The stage of MFA enforcement for a given policy at a given time. */
export type MfaEnforcementStage = 'disabled' | 'grace' | 'enforce'

/**
 * Given a policy, decide the enforcement stage:
 *  - 'disabled': MFA not required for this org (or never enabled) → no aal check.
 *  - 'grace':    MFA required but still within the rollout grace window → allow
 *                aal1, emit telemetry.
 *  - 'enforce':  MFA required and past grace → require aal2.
 */
export function resolveMfaEnforcementStage(
  policy: OrgSecurityPolicy,
  now: Date = new Date(),
): MfaEnforcementStage {
  if (!policy.mfaRequired) return 'disabled'
  // Enabled but somehow missing the enabled_at stamp → enforce immediately (safe:
  // required means required; a missing timestamp should not open an infinite grace).
  if (!policy.mfaEnabledAt) return 'enforce'

  const enabledAt = new Date(policy.mfaEnabledAt).getTime()
  if (Number.isNaN(enabledAt)) return 'enforce'
  const graceEndsAt = enabledAt + policy.mfaGracePeriodDays * 24 * 60 * 60 * 1000
  return now.getTime() < graceEndsAt ? 'grace' : 'enforce'
}

/**
 * Whether a verified `aal` claim satisfies the aal2 requirement.
 * Supabase mints `aal` as a top-level claim: 'aal1' (single factor) or 'aal2'
 * (a second factor was verified this session).
 */
export function hasAal2(aal: string | null | undefined): boolean {
  return aal === 'aal2'
}
