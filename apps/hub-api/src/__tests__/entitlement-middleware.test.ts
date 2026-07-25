import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Story 27.3: Hub API Entitlement Middleware — Tests
 *
 * Tests cover:
 * - enforceEntitlement middleware unit tests (direct invocation)
 *   - ACTIVE subscription → allows through
 *   - TRIAL subscription → allows through
 *   - No subscription → SUBSCRIPTION_REQUIRED
 *   - Null org_id → ORG_CONTEXT_REQUIRED
 *   - ADMIN bypass (no DB query)
 *   - PLATFORM_ADMIN bypass (no DB query)
 *   - Entitlement context injected into next
 * - entitlement.check tRPC endpoint
 *   - Returns 'active' / 'trial' / 'inactive'
 *   - Rejects null org_id
 *   - Validates moduleCode enum
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

// ─── Helpers ────────────────────────────────────────────────────────────────

const ORG_ID = '00000000-0000-4000-8000-000000000099'

const CLINICIAN_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1', orgId: ORG_ID }
const NO_ORG_USER = { sub: 'doctor-002', role: 'DOCTOR', sessionId: 'sess-4', orgId: null }

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  user?: { sub: string; role: string; sessionId: string; orgId?: string | null } | null
}) {
  const supabase = {
    from: overrides?.supabaseFrom ?? vi.fn(),
  }
  return {
    supabase: supabase as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

/**
 * Creates a mock supabase.from for the org_subscriptions query chain:
 * .select().eq().eq().in().maybeSingle() (used by entitlement.check endpoint)
 */
function mockSubscriptionQuery(result: { data: any; error: any }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(result),
            limit: vi.fn().mockResolvedValue({
              data: result.data ? [result.data] : [],
              error: result.error,
            }),
          }),
        }),
      }),
    }),
  }
}

/**
 * Creates a mock supabase.from for the organizations table query:
 * .select().eq().single() — used by enforceEntitlement org status check.
 */
function mockOrgQuery(org: { id: string; status: string; cancelled_at?: string | null } | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: org, error: org ? null : { message: 'not found' } }),
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Direct middleware unit tests ───────────────────────────────────────────

describe('enforceEntitlement — direct middleware test', () => {
  let enforceEntitlement: typeof import('../trpc/middleware/enforceEntitlement').enforceEntitlement

  beforeEach(async () => {
    const mod = await import('../trpc/middleware/enforceEntitlement')
    enforceEntitlement = mod.enforceEntitlement
  })

  it('allows through when org has ACTIVE subscription', async () => {
    const middleware = enforceEntitlement('OPD_LITE')
    const nextFn = vi.fn().mockResolvedValue('ok')
    // enforceEntitlement now queries organizations first, then org_subscriptions
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'organizations') {
          return mockOrgQuery({ id: ORG_ID, status: 'ACTIVE', cancelled_at: null })
        }
        return mockSubscriptionQuery({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null })
      }),
    }

    await middleware({
      ctx: {
        supabase: supabase as any,
        user: { sub: 'doc-001', role: 'DOCTOR', sessionId: 'sess-1', orgId: ORG_ID },
      },
      input: {},
      next: nextFn,
    })

    expect(nextFn).toHaveBeenCalledWith({
      ctx: expect.objectContaining({
        entitlement: { moduleCode: 'OPD_LITE', status: 'active' },
      }),
    })
  })

  it('allows through when org has TRIAL subscription', async () => {
    const middleware = enforceEntitlement('OPD_LITE')
    const nextFn = vi.fn().mockResolvedValue('ok')
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'organizations') {
          return mockOrgQuery({ id: ORG_ID, status: 'ACTIVE', cancelled_at: null })
        }
        return mockSubscriptionQuery({ data: { id: 'sub-2', status: 'TRIAL' }, error: null })
      }),
    }

    await middleware({
      ctx: {
        supabase: supabase as any,
        user: { sub: 'doc-001', role: 'DOCTOR', sessionId: 'sess-1', orgId: ORG_ID },
      },
      input: {},
      next: nextFn,
    })

    expect(nextFn).toHaveBeenCalledWith({
      ctx: expect.objectContaining({
        entitlement: { moduleCode: 'OPD_LITE', status: 'trial' },
      }),
    })
  })

  it('throws SUBSCRIPTION_REQUIRED when no subscription exists', async () => {
    const middleware = enforceEntitlement('PHARMACY_LITE')
    const nextFn = vi.fn()
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'organizations') {
          return mockOrgQuery({ id: ORG_ID, status: 'ACTIVE', cancelled_at: null })
        }
        return mockSubscriptionQuery({ data: null, error: null })
      }),
    }

    await expect(
      middleware({
        ctx: {
          supabase: supabase as any,
          user: { sub: 'pharma-001', role: 'PHARMACIST', sessionId: 'sess-5', orgId: ORG_ID },
        },
        input: {},
        next: nextFn,
      }),
    ).rejects.toThrow(/SUBSCRIPTION_REQUIRED/)

    expect(nextFn).not.toHaveBeenCalled()
  })

  it('throws ORG_CONTEXT_REQUIRED for null org_id', async () => {
    const middleware = enforceEntitlement('OPD_LITE')
    const nextFn = vi.fn()

    await expect(
      middleware({
        ctx: {
          supabase: {} as any,
          user: { sub: 'doc-001', role: 'DOCTOR', sessionId: 'sess-1', orgId: null },
        },
        input: {},
        next: nextFn,
      }),
    ).rejects.toThrow(/ORG_CONTEXT_REQUIRED/)

    expect(nextFn).not.toHaveBeenCalled()
  })

  it('ADMIN bypasses module entitlement (but still passes org status check)', async () => {
    // ADMIN with an orgId: the middleware checks org status (CANCELLED/SUSPENDED guard)
    // but skips the module subscription entitlement check.
    const middleware = enforceEntitlement('LAB_LITE')
    const nextFn = vi.fn().mockResolvedValue('ok')
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'organizations') {
          return mockOrgQuery({ id: ORG_ID, status: 'ACTIVE', cancelled_at: null })
        }
        // org_subscriptions should NOT be queried for ADMIN
        throw new Error('Should not query org_subscriptions for ADMIN')
      }),
    }

    await middleware({
      ctx: {
        supabase: supabase as any,
        user: { sub: 'admin-001', role: 'ADMIN', sessionId: 'sess-2', orgId: ORG_ID },
      },
      input: {},
      next: nextFn,
    })

    expect(nextFn).toHaveBeenCalledWith({
      ctx: expect.objectContaining({
        entitlement: { moduleCode: 'LAB_LITE', status: 'ADMIN_BYPASS' },
      }),
    })
  })

  it('PLATFORM_ADMIN bypasses without DB query', async () => {
    const middleware = enforceEntitlement('OPD_LITE')
    const nextFn = vi.fn().mockResolvedValue('ok')
    const supabase = {
      from: vi.fn(() => {
        throw new Error('Should not query DB for PLATFORM_ADMIN')
      }),
    }

    await middleware({
      ctx: {
        supabase: supabase as any,
        user: { sub: 'padmin-001', role: 'PLATFORM_ADMIN', sessionId: 'sess-3', orgId: ORG_ID },
      },
      input: {},
      next: nextFn,
    })

    expect(nextFn).toHaveBeenCalledWith({
      ctx: expect.objectContaining({
        entitlement: { moduleCode: 'OPD_LITE', status: 'ADMIN_BYPASS' },
      }),
    })
  })

  it('rejects expired subscription (not in ACTIVE/TRIAL)', async () => {
    // The middleware only queries for ACTIVE/TRIAL, so expired/cancelled won't match
    const middleware = enforceEntitlement('OPD_LITE')
    const nextFn = vi.fn()
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'organizations') {
          return mockOrgQuery({ id: ORG_ID, status: 'ACTIVE', cancelled_at: null })
        }
        // DB returns null because status NOT IN ('ACTIVE', 'TRIAL')
        return mockSubscriptionQuery({ data: null, error: null })
      }),
    }

    await expect(
      middleware({
        ctx: {
          supabase: supabase as any,
          user: { sub: 'doc-001', role: 'DOCTOR', sessionId: 'sess-1', orgId: ORG_ID },
        },
        input: {},
        next: nextFn,
      }),
    ).rejects.toThrow(/SUBSCRIPTION_REQUIRED/)
  })
})

// ─── entitlement.check endpoint ─────────────────────────────────────────────

describe('entitlement.check endpoint', () => {
  it('returns active for ACTIVE subscription', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'org_subscriptions') {
        return mockSubscriptionQuery({
          data: { id: 'sub-1', status: 'ACTIVE' },
          error: null,
        })
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)
    const result = await caller.entitlement.check({ moduleCode: 'OPD_LITE' })

    expect(result.status).toBe('active')
  })

  it('returns trial for TRIAL subscription', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'org_subscriptions') {
        return mockSubscriptionQuery({
          data: { id: 'sub-2', status: 'TRIAL' },
          error: null,
        })
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)
    const result = await caller.entitlement.check({ moduleCode: 'OPD_LITE' })

    expect(result.status).toBe('trial')
  })

  it('returns inactive when no subscription exists', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'org_subscriptions') {
        return mockSubscriptionQuery({
          data: null,
          error: null,
        })
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)
    const result = await caller.entitlement.check({ moduleCode: 'OPD_LITE' })

    expect(result.status).toBe('inactive')
  })

  it('rejects when org_id is null', async () => {
    const ctx = createTestContext({ supabaseFrom: vi.fn(), user: NO_ORG_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.entitlement.check({ moduleCode: 'OPD_LITE' }),
    ).rejects.toThrow(/org_id is required/)
  })

  it('validates moduleCode input', async () => {
    const ctx = createTestContext({ supabaseFrom: vi.fn(), user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(
      // @ts-expect-error — invalid module code
      caller.entitlement.check({ moduleCode: 'INVALID_MODULE' }),
    ).rejects.toThrow()
  })
})
