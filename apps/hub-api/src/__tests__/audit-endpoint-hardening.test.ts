import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Story 56.4 (audit M-HUB-3): spoofable audit-endpoint hardening.
//  - audit.sync rejects non-allowlisted (server-authoritative) actions/resources
//    and forces the server-side actorId (no client impersonation).
//  - lab.reportAuthEvent does NOT attribute a LOGIN_FAILURE to a spoofed actorId
//    that does not resolve to a real practitioner.
// ============================================================

// No REDIS_URL in the test env → the shared rate limiter fails open, so these
// endpoints behave exactly as before w.r.t. rate limiting (zero regression).

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

// practitioners lookup returns null → any supplied actorId is treated as unknown.
const mockFrom = vi.fn(() => ({
  insert: vi.fn(),
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  selectExactCount: vi.fn(),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { auditRouter } = await import('../trpc/routers/audit')
const { labRouter } = await import('../trpc/routers/lab')

type Role = `${import('@ultranos/shared-types').UserRole}`
function makeCtx(
  user: { sub: string; role: Role; sessionId: string; orgId: string | null; facilityId: string | null; status: string | null } | null,
) {
  return { supabase: { from: mockFrom } as never, user, headers: new Headers() }
}

const AUTHED = { sub: 'user-001', role: 'DOCTOR' as Role, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }

describe('audit.sync — client-claimable allowlist (M-HUB-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function baseEvent(overrides: Record<string, unknown> = {}) {
    return {
      id: '00000000-0000-4000-8000-000000000001',
      actorId: 'client-supplied-actor',
      actorRole: 'DOCTOR',
      action: 'PHI_READ',
      resourceType: 'PATIENT',
      resourceId: 'patient-1',
      hlcTimestamp: '1-0-abc',
      queuedAt: new Date().toISOString(),
      ...overrides,
    }
  }

  it('accepts an allowlisted action/resourceType and forces the server actorId', async () => {
    const router = createTRPCRouter({ audit: auditRouter })
    const caller = createCallerFactory(router)(makeCtx(AUTHED))

    const res = await caller.audit.sync({ events: [baseEvent()] })

    expect(res.results[0]).toEqual({ id: '00000000-0000-4000-8000-000000000001', success: true })
    // Server override: emitted actorId is ctx.user.sub, NOT the client value.
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-001', action: 'PHI_READ', resourceType: 'PATIENT' }),
    )
  })

  it('REJECTS a non-allowlisted (server-authoritative) action — LAB_APPROVED', async () => {
    const router = createTRPCRouter({ audit: auditRouter })
    const caller = createCallerFactory(router)(makeCtx(AUTHED))

    await expect(
      caller.audit.sync({ events: [baseEvent({ action: 'LAB_APPROVED' })] }),
    ).rejects.toThrow()
    expect(mockAuditEmit).not.toHaveBeenCalled()
  })

  it('REJECTS a non-allowlisted action — SECURITY_VIOLATION', async () => {
    const router = createTRPCRouter({ audit: auditRouter })
    const caller = createCallerFactory(router)(makeCtx(AUTHED))

    await expect(
      caller.audit.sync({ events: [baseEvent({ action: 'SECURITY_VIOLATION' })] }),
    ).rejects.toThrow()
  })

  it('REJECTS a non-allowlisted resourceType — PRESCRIBING_ANOMALY', async () => {
    const router = createTRPCRouter({ audit: auditRouter })
    const caller = createCallerFactory(router)(makeCtx(AUTHED))

    await expect(
      caller.audit.sync({ events: [baseEvent({ resourceType: 'PRESCRIBING_ANOMALY' })] }),
    ).rejects.toThrow()
  })

  // Regression: operational resource types the spoke clients legitimately emit must
  // be claimable, or audit.sync 400s and silently drops the whole batch (Rule #6).
  it.each(['DATA_BUDGET', 'SPECIMEN', 'LAB_SAMPLE', 'TEMPERATURE_MONITORING', 'CASH_DRAWER'])(
    'ACCEPTS the client-operational resourceType %s',
    async (resourceType) => {
      const router = createTRPCRouter({ audit: auditRouter })
      const caller = createCallerFactory(router)(makeCtx(AUTHED))
      const res = await caller.audit.sync({ events: [baseEvent({ resourceType })] })
      expect(res.results[0]).toEqual({ id: '00000000-0000-4000-8000-000000000001', success: true })
    },
  )
})

describe('lab.reportAuthEvent — spoofed actor not attributed (M-HUB-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does NOT attribute a LOGIN_FAILURE to a spoofed actorId that resolves to no practitioner', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(null)) // failed login → no session

    const result = await caller.lab.reportAuthEvent({
      event: 'LOGIN_FAILURE',
      actorId: '11111111-1111-1111-1111-111111111111', // not a real practitioner (mock returns null)
      actorEmail: 'attacker@evil.example',
    })

    expect(result.logged).toBe(true)
    const emitted = (mockAuditEmit.mock.calls[0] as any[])[0]
    // Unknown actorId is NOT used for attribution — falls back to anonymous.
    expect(emitted.actorId).toBeUndefined()
    expect(emitted.resourceId).toBe('anonymous')
    // And the raw email is never stored verbatim.
    expect(JSON.stringify(emitted.metadata)).not.toContain('attacker@evil.example')
    expect(emitted.metadata.failedEmail).toBe('[REDACTED]')
  })
})
