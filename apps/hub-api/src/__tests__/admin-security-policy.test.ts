import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserRole } from '@ultranos/shared-types'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

const { createCallerFactory } = await import('../trpc/init')
const { adminRouter } = await import('../trpc/routers/admin')
const { clearOrgSecurityPolicyCache } = await import('@/lib/mfa-policy')

/**
 * Chainable supabase mock. `rows` maps a table name to the maybeSingle() result;
 * `upsert` and `select().eq().maybeSingle()` resolve from it. Captures upsert args.
 */
function makeSupabase(rows: Record<string, unknown> = {}) {
  const upsertCalls: unknown[] = []
  const from = vi.fn((table: string) => {
    const builder: Record<string, any> = {}
    for (const m of ['select', 'eq']) builder[m] = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(() => Promise.resolve({ data: rows[table] ?? null, error: null }))
    builder.upsert = vi.fn((payload: unknown) => {
      upsertCalls.push(payload)
      return Promise.resolve({ data: null, error: null })
    })
    return builder
  })
  return { client: { from } as never, upsertCalls }
}

function ctxUser(role: `${UserRole}`, orgId: string | null) {
  return { sub: 'admin-1', role, sessionId: 's1', facilityId: null, status: 'ACTIVE', orgId, aal: 'aal2' }
}

beforeEach(() => {
  clearOrgSecurityPolicyCache()
  mockAuditEmit.mockClear()
})

describe('admin.getSecurityPolicy', () => {
  it('returns the default (disabled) posture when no row exists', async () => {
    const { client } = makeSupabase({})
    const caller = createCallerFactory(adminRouter)({ supabase: client, user: ctxUser('ADMIN', 'org-1'), headers: new Headers() })
    const res = await caller.getSecurityPolicy()
    expect(res.mfaRequired).toBe(false)
    expect(res.mfaGracePeriodDays).toBe(7)
  })

  it('is admin-gated (a DOCTOR is FORBIDDEN)', async () => {
    const { client } = makeSupabase({})
    const caller = createCallerFactory(adminRouter)({ supabase: client, user: ctxUser('DOCTOR', 'org-1'), headers: new Headers() })
    await expect(caller.getSecurityPolicy()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('admin.updateSecurityPolicy', () => {
  it('enabling stamps mfa_enabled_at, is org-scoped, and emits ORG_MFA_POLICY_CHANGED', async () => {
    const { client, upsertCalls } = makeSupabase({}) // no prior row => prevRequired false
    const caller = createCallerFactory(adminRouter)({ supabase: client, user: ctxUser('ADMIN', 'org-A'), headers: new Headers() })
    const res = await caller.updateSecurityPolicy({ mfaRequired: true, mfaGracePeriodDays: 3 })

    expect(res.mfaRequired).toBe(true)
    expect(res.mfaGracePeriodDays).toBe(3)
    expect(res.mfaEnabledAt).toBeTruthy()

    // Upsert is scoped to the caller's org (never a client-supplied org).
    const payload = upsertCalls[0] as Record<string, unknown>
    expect(payload.org_id).toBe('org-A')
    expect(payload.mfa_required).toBe(true)
    expect(payload.mfa_grace_period_days).toBe(3)
    expect(payload.updated_by).toBe('admin-1')

    // Audit event with old→new values, no PHI.
    expect(mockAuditEmit).toHaveBeenCalledTimes(1)
    expect(mockAuditEmit.mock.calls[0][0]).toMatchObject({
      action: 'ORG_MFA_POLICY_CHANGED',
      resourceType: 'ORGANIZATION',
      resourceId: 'org-A',
      metadata: { old: { mfaRequired: false }, new: { mfaRequired: true, mfaGracePeriodDays: 3 } },
    })
  })

  it('disabling clears mfa_enabled_at', async () => {
    const { client, upsertCalls } = makeSupabase({
      org_security_policies: { mfa_required: true, mfa_grace_period_days: 7, mfa_enabled_at: '2026-01-01T00:00:00.000Z' },
    })
    const caller = createCallerFactory(adminRouter)({ supabase: client, user: ctxUser('ADMIN', 'org-A'), headers: new Headers() })
    const res = await caller.updateSecurityPolicy({ mfaRequired: false })
    expect(res.mfaRequired).toBe(false)
    expect(res.mfaEnabledAt).toBeNull()
    expect((upsertCalls[0] as Record<string, unknown>).mfa_enabled_at).toBeNull()
  })

  it('rejects an out-of-range grace period (>30)', async () => {
    const { client } = makeSupabase({})
    const caller = createCallerFactory(adminRouter)({ supabase: client, user: ctxUser('ADMIN', 'org-A'), headers: new Headers() })
    await expect(caller.updateSecurityPolicy({ mfaRequired: true, mfaGracePeriodDays: 31 })).rejects.toBeTruthy()
  })

  it('is admin-gated (a PHARMACIST is FORBIDDEN)', async () => {
    const { client } = makeSupabase({})
    const caller = createCallerFactory(adminRouter)({ supabase: client, user: ctxUser('PHARMACIST', 'org-A'), headers: new Headers() })
    await expect(caller.updateSecurityPolicy({ mfaRequired: true })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
