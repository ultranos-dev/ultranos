import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Subscription Read-Only Mode Tests — Story 27.9 Task 7.2
// Tests CANCELLED org read-only enforcement in entitlement middleware.
// ============================================================

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const { enforceEntitlement } = await import('@/trpc/middleware/enforceEntitlement')

function createMockSupabase(overrides: {
  orgStatus: string
  cancelledAt: string | null
  subscriptionStatus?: string | null
}) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'org-1',
                  status: overrides.orgStatus,
                  cancelled_at: overrides.cancelledAt,
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: overrides.subscriptionStatus
                      ? [{ id: 'sub-1', status: overrides.subscriptionStatus }]
                      : [],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      return { select: vi.fn() }
    }),
  }
}

function createMockContext(supabase: any) {
  return {
    supabase,
    user: { sub: 'user-1', role: 'DOCTOR', sessionId: 'sess-1', orgId: 'org-1' },
  }
}

describe('Subscription Read-Only Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('CANCELLED org (< 90 days) can read data (query procedures pass)', async () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: thirtyDaysAgo.toISOString(),
    })

    const middleware = enforceEntitlement('OPD_LITE', 'query')
    let passedCtx: any = null

    await middleware({
      ctx: createMockContext(mockDb),
      input: {},
      next: async (opts: any) => {
        passedCtx = opts.ctx
        return 'ok'
      },
    } as any)

    expect(passedCtx).toBeTruthy()
    expect(passedCtx.orgReadOnly).toBe(true)
    expect(passedCtx.entitlement.status).toBe('cancelled_read_only')
  })

  it('CANCELLED org (< 90 days) cannot write data (mutations blocked)', async () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: thirtyDaysAgo.toISOString(),
    })

    const middleware = enforceEntitlement('OPD_LITE', 'mutation')

    await expect(
      middleware({
        ctx: createMockContext(mockDb),
        input: {},
        next: async () => 'ok',
      } as any),
    ).rejects.toThrow('ORG_READ_ONLY')
  })

  it('CANCELLED org (>= 90 days) is fully blocked for queries', async () => {
    const hundredDaysAgo = new Date()
    hundredDaysAgo.setDate(hundredDaysAgo.getDate() - 100)

    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: hundredDaysAgo.toISOString(),
    })

    const middleware = enforceEntitlement('OPD_LITE', 'query')

    await expect(
      middleware({
        ctx: createMockContext(mockDb),
        input: {},
        next: async () => 'ok',
      } as any),
    ).rejects.toThrow('Organization data retention period has expired')
  })

  it('CANCELLED org (>= 90 days) is fully blocked for mutations', async () => {
    const hundredDaysAgo = new Date()
    hundredDaysAgo.setDate(hundredDaysAgo.getDate() - 100)

    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: hundredDaysAgo.toISOString(),
    })

    const middleware = enforceEntitlement('OPD_LITE', 'mutation')

    await expect(
      middleware({
        ctx: createMockContext(mockDb),
        input: {},
        next: async () => 'ok',
      } as any),
    ).rejects.toThrow('Organization data retention period has expired')
  })

  it('read-only mode sets orgReadOnly flag in context for X-Org-Read-Only header', async () => {
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: tenDaysAgo.toISOString(),
    })

    const middleware = enforceEntitlement('OPD_LITE', 'query')
    let ctxResult: any = null

    await middleware({
      ctx: createMockContext(mockDb),
      input: {},
      next: async (opts: any) => {
        ctxResult = opts.ctx
        return 'ok'
      },
    } as any)

    // The orgReadOnly flag enables the response layer to set X-Org-Read-Only: true
    expect(ctxResult.orgReadOnly).toBe(true)
  })

  it('ACTIVE org is not read-only', async () => {
    const mockDb = createMockSupabase({
      orgStatus: 'ACTIVE',
      cancelledAt: null,
      subscriptionStatus: 'ACTIVE',
    })

    const middleware = enforceEntitlement('OPD_LITE', 'mutation')
    let ctxResult: any = null

    await middleware({
      ctx: createMockContext(mockDb),
      input: {},
      next: async (opts: any) => {
        ctxResult = opts.ctx
        return 'ok'
      },
    } as any)

    expect(ctxResult.orgReadOnly).toBe(false)
  })

  it('ADMIN of CANCELLED org is subject to read-only enforcement (D5)', async () => {
    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
    })

    const middleware = enforceEntitlement('OPD_LITE', 'mutation')

    // D5: ADMIN no longer bypasses org status — should be blocked on mutations
    await expect(
      middleware({
        ctx: {
          supabase: mockDb,
          user: { sub: 'admin-1', role: 'ADMIN', sessionId: 'sess-1', orgId: 'org-1' },
        },
        input: {},
        next: async () => 'ok',
      } as any),
    ).rejects.toThrow('ORG_READ_ONLY')
  })

  it('ADMIN of CANCELLED org can still read (D5)', async () => {
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: tenDaysAgo.toISOString(),
    })

    const middleware = enforceEntitlement('OPD_LITE', 'query')
    let ctxResult: any = null

    await middleware({
      ctx: {
        supabase: mockDb,
        user: { sub: 'admin-1', role: 'ADMIN', sessionId: 'sess-1', orgId: 'org-1' },
      },
      input: {},
      next: async (opts: any) => {
        ctxResult = opts.ctx
        return 'ok'
      },
    } as any)

    expect(ctxResult.orgReadOnly).toBe(true)
    // ADMIN of cancelled org gets cancelled_read_only (not ADMIN_BYPASS)
    // because the org status check runs before the ADMIN entitlement bypass
    expect(ctxResult.entitlement.status).toBe('cancelled_read_only')
  })

  it('PLATFORM_ADMIN bypasses all checks including read-only', async () => {
    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
    })

    const middleware = enforceEntitlement('OPD_LITE', 'mutation')
    let ctxResult: any = null

    await middleware({
      ctx: {
        supabase: mockDb,
        user: { sub: 'padmin-1', role: 'PLATFORM_ADMIN', sessionId: 'sess-1', orgId: 'org-1' },
      },
      input: {},
      next: async (opts: any) => {
        ctxResult = opts.ctx
        return 'ok'
      },
    } as any)

    expect(ctxResult.orgReadOnly).toBe(false)
    expect(ctxResult.entitlement.status).toBe('ADMIN_BYPASS')
  })

  it('CANCELLED org with null cancelled_at is still treated as read-only', async () => {
    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: null,
    })

    const middleware = enforceEntitlement('OPD_LITE', 'query')
    let ctxResult: any = null

    await middleware({
      ctx: createMockContext(mockDb),
      input: {},
      next: async (opts: any) => {
        ctxResult = opts.ctx
        return 'ok'
      },
    } as any)

    expect(ctxResult.orgReadOnly).toBe(true)
    expect(ctxResult.entitlement.status).toBe('cancelled_read_only')
  })

  it('CANCELLED org with null cancelled_at blocks mutations', async () => {
    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: null,
    })

    const middleware = enforceEntitlement('OPD_LITE', 'mutation')

    await expect(
      middleware({
        ctx: createMockContext(mockDb),
        input: {},
        next: async () => 'ok',
      } as any),
    ).rejects.toThrow('ORG_READ_ONLY')
  })

  it('CANCELLED org skips module entitlement check (can read from any module)', async () => {
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

    // No active subscription for this module
    const mockDb = createMockSupabase({
      orgStatus: 'CANCELLED',
      cancelledAt: tenDaysAgo.toISOString(),
      subscriptionStatus: null,
    })

    const middleware = enforceEntitlement('OPD_LITE', 'query')
    let ctxResult: any = null

    await middleware({
      ctx: createMockContext(mockDb),
      input: {},
      next: async (opts: any) => {
        ctxResult = opts.ctx
        return 'ok'
      },
    } as any)

    // Should pass even without active subscription — cancelled org can read
    expect(ctxResult.entitlement.status).toBe('cancelled_read_only')
  })
})
