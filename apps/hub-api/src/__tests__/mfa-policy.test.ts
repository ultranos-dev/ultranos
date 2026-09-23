import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import {
  resolveMfaEnforcementStage,
  hasAal2,
  getOrgSecurityPolicy,
  invalidateOrgSecurityPolicy,
  clearOrgSecurityPolicyCache,
  DEFAULT_ORG_SECURITY_POLICY,
  type OrgSecurityPolicy,
} from '@/lib/mfa-policy'
import { enforceMfaPolicy, _resetGraceTelemetryThrottle } from '@/trpc/middleware/enforceMfaPolicy'
import type { AuthedTRPCContext } from '@/trpc/init'

// Audit emit is exercised in the grace path; stub it so tests don't hit a DB.
const emitMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: emitMock })),
}))

const DAY = 24 * 60 * 60 * 1000

function policy(overrides: Partial<OrgSecurityPolicy> = {}): OrgSecurityPolicy {
  return { mfaRequired: false, mfaGracePeriodDays: 7, mfaEnabledAt: null, ...overrides }
}

/** A minimal chainable supabase mock returning a fixed maybeSingle() result. */
function supabaseReturning(row: Record<string, unknown> | null, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) builder[m] = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: row, error }))
  return { from: vi.fn(() => builder) }
}

function ctx(userOverrides: Record<string, unknown>, supabase: unknown): AuthedTRPCContext {
  return {
    supabase: supabase as never,
    headers: new Headers(),
    user: {
      sub: 'user-1',
      role: 'DOCTOR',
      sessionId: 'sess-1',
      orgId: 'org-1',
      facilityId: null,
      status: 'ACTIVE',
      aal: 'aal1',
      ...userOverrides,
    },
  } as AuthedTRPCContext
}

beforeEach(() => {
  clearOrgSecurityPolicyCache()
  _resetGraceTelemetryThrottle()
  emitMock.mockClear()
})

describe('resolveMfaEnforcementStage', () => {
  it('is disabled when the org has not enabled MFA', () => {
    expect(resolveMfaEnforcementStage(policy({ mfaRequired: false }))).toBe('disabled')
  })

  it('is grace while within the grace window', () => {
    const enabledAt = new Date(Date.now() - 2 * DAY).toISOString()
    expect(resolveMfaEnforcementStage(policy({ mfaRequired: true, mfaGracePeriodDays: 7, mfaEnabledAt: enabledAt }))).toBe('grace')
  })

  it('is enforce once the grace window has elapsed', () => {
    const enabledAt = new Date(Date.now() - 10 * DAY).toISOString()
    expect(resolveMfaEnforcementStage(policy({ mfaRequired: true, mfaGracePeriodDays: 7, mfaEnabledAt: enabledAt }))).toBe('enforce')
  })

  it('enforces immediately when grace is 0', () => {
    const enabledAt = new Date(Date.now() - 1000).toISOString()
    expect(resolveMfaEnforcementStage(policy({ mfaRequired: true, mfaGracePeriodDays: 0, mfaEnabledAt: enabledAt }))).toBe('enforce')
  })

  it('enforces when required but the enabled timestamp is missing (fail-safe)', () => {
    expect(resolveMfaEnforcementStage(policy({ mfaRequired: true, mfaEnabledAt: null }))).toBe('enforce')
  })
})

describe('hasAal2', () => {
  it('accepts aal2 only', () => {
    expect(hasAal2('aal2')).toBe(true)
    expect(hasAal2('aal1')).toBe(false)
    expect(hasAal2(undefined)).toBe(false)
    expect(hasAal2(null)).toBe(false)
  })
})

describe('getOrgSecurityPolicy cache', () => {
  it('returns the default (disabled) posture when no row exists', async () => {
    const sb = supabaseReturning(null)
    const p = await getOrgSecurityPolicy(sb as never, 'org-1')
    expect(p).toEqual(DEFAULT_ORG_SECURITY_POLICY)
  })

  it('reads the stored row and caches it (single DB hit until invalidated)', async () => {
    const sb = supabaseReturning({ mfa_required: true, mfa_grace_period_days: 3, mfa_enabled_at: '2026-01-01T00:00:00.000Z' })
    const p1 = await getOrgSecurityPolicy(sb as never, 'org-1')
    expect(p1.mfaRequired).toBe(true)
    expect(p1.mfaGracePeriodDays).toBe(3)
    // Second call is served from cache — no additional from() call.
    await getOrgSecurityPolicy(sb as never, 'org-1')
    expect((sb.from as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    // After invalidation the next read hits the DB again.
    invalidateOrgSecurityPolicy('org-1')
    await getOrgSecurityPolicy(sb as never, 'org-1')
    expect((sb.from as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2)
  })

  it('fails safe to disabled on a DB error', async () => {
    const sb = supabaseReturning(null, { message: 'boom' })
    const p = await getOrgSecurityPolicy(sb as never, 'org-err')
    expect(p.mfaRequired).toBe(false)
  })
})

describe('enforceMfaPolicy', () => {
  it('policy OFF: an aal1 staff token is accepted (no throw)', async () => {
    const sb = supabaseReturning(null) // no policy row => disabled
    await expect(enforceMfaPolicy({ ctx: ctx({ aal: 'aal1' }, sb), path: 'patient.search' })).resolves.toBeUndefined()
  })

  it('policy ON past grace: an aal1 staff token is rejected with MFA_REQUIRED', async () => {
    const enabledAt = new Date(Date.now() - 30 * DAY).toISOString()
    const sb = supabaseReturning({ mfa_required: true, mfa_grace_period_days: 7, mfa_enabled_at: enabledAt })
    await expect(enforceMfaPolicy({ ctx: ctx({ aal: 'aal1' }, sb), path: 'patient.search' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'MFA_REQUIRED',
    } satisfies Partial<TRPCError>)
  })

  it('policy ON past grace: an aal2 staff token is accepted', async () => {
    const enabledAt = new Date(Date.now() - 30 * DAY).toISOString()
    const sb = supabaseReturning({ mfa_required: true, mfa_grace_period_days: 7, mfa_enabled_at: enabledAt })
    await expect(enforceMfaPolicy({ ctx: ctx({ aal: 'aal2' }, sb), path: 'patient.search' })).resolves.toBeUndefined()
  })

  it('policy ON within grace: an aal1 staff token is allowed and telemetry is emitted (once)', async () => {
    const enabledAt = new Date(Date.now() - 1 * DAY).toISOString()
    const sb = supabaseReturning({ mfa_required: true, mfa_grace_period_days: 7, mfa_enabled_at: enabledAt })
    await expect(enforceMfaPolicy({ ctx: ctx({ aal: 'aal1' }, sb), path: 'patient.search' })).resolves.toBeUndefined()
    // Throttled: a second call for the same user within a day does not re-emit.
    await enforceMfaPolicy({ ctx: ctx({ aal: 'aal1' }, sb), path: 'patient.search' })
    expect(emitMock).toHaveBeenCalledTimes(1)
    expect(emitMock.mock.calls[0][0]).toMatchObject({ action: 'MFA_GRACE_PERIOD_WARNING' })
  })

  it('patient/guardian roles are exempt even when policy is ON past grace', async () => {
    const enabledAt = new Date(Date.now() - 30 * DAY).toISOString()
    const sb = supabaseReturning({ mfa_required: true, mfa_grace_period_days: 7, mfa_enabled_at: enabledAt })
    await expect(enforceMfaPolicy({ ctx: ctx({ role: 'PATIENT', aal: 'aal1' }, sb), path: 'patient.search' })).resolves.toBeUndefined()
    await expect(enforceMfaPolicy({ ctx: ctx({ role: 'GUARDIAN', aal: 'aal1' }, sb), path: 'patient.search' })).resolves.toBeUndefined()
  })

  it('recovery endpoints stay reachable at aal1 even when policy is ON past grace', async () => {
    const enabledAt = new Date(Date.now() - 30 * DAY).toISOString()
    const sb = supabaseReturning({ mfa_required: true, mfa_grace_period_days: 7, mfa_enabled_at: enabledAt })
    for (const path of ['admin.getSecurityPolicy', 'admin.updateSecurityPolicy', 'users.getProfile']) {
      await expect(enforceMfaPolicy({ ctx: ctx({ role: 'ADMIN', aal: 'aal1' }, sb), path })).resolves.toBeUndefined()
    }
  })

  it('a token with no org is treated as the default (no enforcement)', async () => {
    const sb = supabaseReturning({ mfa_required: true, mfa_grace_period_days: 0, mfa_enabled_at: new Date().toISOString() })
    await expect(enforceMfaPolicy({ ctx: ctx({ orgId: null, aal: 'aal1' }, sb), path: 'patient.search' })).resolves.toBeUndefined()
  })
})
