import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn(), rpc: vi.fn() })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

const { createCallerFactory } = await import('../trpc/init')
const { adminRouter } = await import('../trpc/routers/admin')

// ─── Test UUIDs ───
const UUID_P1 = '10000000-0000-0000-0000-000000000001'
const UUID_P2 = '10000000-0000-0000-0000-000000000002'
const UUID_MISSING = '00000000-0000-0000-0000-000000000000'

// ─── Test helpers ───

function makeCtx(user: { sub: string; role: string; sessionId: string; orgId?: string | null; status?: string | null } | null) {
  return {
    supabase: createMockSupabase() as never,
    user: user ? { ...user, orgId: user.orgId ?? null, status: user.status ?? null } : null,
    headers: new Headers(),
  }
}

function makeAdminCtx() {
  return makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' })
}

function createMockSupabase() {
  const mockChain: Record<string, any> = {}

  mockChain.single = vi.fn().mockResolvedValue({ data: null, error: null })
  mockChain.limit = vi.fn().mockReturnValue(mockChain)
  mockChain.range = vi.fn().mockReturnValue(mockChain)
  mockChain.order = vi.fn().mockReturnValue(mockChain)
  mockChain.not = vi.fn().mockReturnValue(mockChain)
  mockChain.lte = vi.fn().mockReturnValue(mockChain)
  mockChain.gt = vi.fn().mockReturnValue(mockChain)
  mockChain.eq = vi.fn().mockReturnValue(mockChain)
  mockChain.in = vi.fn().mockReturnValue(mockChain)
  mockChain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  mockChain.update = vi.fn().mockReturnValue(mockChain)
  mockChain.select = vi.fn().mockReturnValue(mockChain)

  mockChain.then = undefined

  return {
    from: vi.fn().mockReturnValue(mockChain),
    _mockChain: mockChain,
  }
}

function makeCtxWithProviders(providers: any[], total = providers.length) {
  const ctx = makeAdminCtx()
  const supabase = ctx.supabase as any
  const chain = supabase._mockChain

  // The query chain is: .from().select().not().order().range() then optionally .lte()
  // Then the chain is awaited. We need range to return the chain (with lte), and
  // the chain itself must be thenable to resolve the query result.
  const awaitableChain = {
    ...chain,
    lte: vi.fn().mockImplementation(() => awaitableChain),
    then: (resolve: any, reject?: any) => {
      return Promise.resolve({ data: providers, error: null, count: total }).then(resolve, reject)
    },
  }
  chain.range = vi.fn().mockReturnValue(awaitableChain)

  return ctx
}

function makeCtxForRenewal(practitioner: any) {
  const ctx = makeAdminCtx()
  const supabase = ctx.supabase as any
  const chain = supabase._mockChain

  chain.single = vi.fn().mockResolvedValue({
    data: practitioner,
    error: null,
  })

  chain.eq = vi.fn().mockReturnValue({
    ...chain,
    single: vi.fn().mockResolvedValue({ data: practitioner, error: null }),
  })
  chain.update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  })

  return ctx
}

// ─── Tests ───

describe('admin.listExpiringProviders', () => {
  beforeEach(() => {
    mockAuditEmit.mockClear()
  })

  it('returns providers sorted by expiry urgency', async () => {
    const mockProviders = [
      {
        id: UUID_P1,
        name: [{ family: 'Smith', given: ['John'], text: 'Dr. John Smith' }],
        identifier: [{ system: 'HAAD', value: 'LIC-001' }],
        _ultranos: { licenseExpiry: '2026-05-20', kycStatus: 'ACTIVE' },
        meta: { lastUpdated: '2026-05-01T00:00:00Z' },
      },
      {
        id: UUID_P2,
        name: [{ family: 'Ali', given: ['Ahmed'] }],
        identifier: [{ system: 'MOH_UAE', value: 'LIC-002' }],
        _ultranos: { licenseExpiry: '2026-06-15', kycStatus: 'ACTIVE' },
        meta: { lastUpdated: '2026-05-01T00:00:00Z' },
      },
    ]

    const ctx = makeCtxWithProviders(mockProviders)
    const caller = createCallerFactory(adminRouter)(ctx)
    const result = await caller.listExpiringProviders({ window: 'all', cursor: 0, limit: 25 })

    expect(result.providers).toHaveLength(2)
    expect(result.providers[0].practitionerId).toBe(UUID_P1)
    expect(result.providers[0].name).toBe('Dr. John Smith')
    expect(result.providers[0].licenseNumber).toBe('LIC-001')
    expect(result.providers[0].issuingBody).toBe('HAAD')
    expect(result.providers[0].kycStatus).toBe('ACTIVE')
    expect(result.total).toBe(2)
  })

  it('filters by 7d window', async () => {
    const ctx = makeCtxWithProviders([])
    const caller = createCallerFactory(adminRouter)(ctx)
    const result = await caller.listExpiringProviders({ window: '7d', cursor: 0, limit: 25 })

    expect(result.providers).toHaveLength(0)
    // Verify the awaitable chain's lte was called for window filtering
    const awaitableChain = (ctx.supabase as any)._mockChain.range.mock.results[0]?.value
    expect(awaitableChain?.lte).toHaveBeenCalled()
  })

  it('filters by 30d window', async () => {
    const ctx = makeCtxWithProviders([])
    const caller = createCallerFactory(adminRouter)(ctx)
    await caller.listExpiringProviders({ window: '30d', cursor: 0, limit: 25 })

    const awaitableChain = (ctx.supabase as any)._mockChain.range.mock.results[0]?.value
    expect(awaitableChain?.lte).toHaveBeenCalled()
  })

  it('filters by 60d window', async () => {
    const ctx = makeCtxWithProviders([])
    const caller = createCallerFactory(adminRouter)(ctx)
    await caller.listExpiringProviders({ window: '60d', cursor: 0, limit: 25 })

    const awaitableChain = (ctx.supabase as any)._mockChain.range.mock.results[0]?.value
    expect(awaitableChain?.lte).toHaveBeenCalled()
  })

  it('rejects non-ADMIN callers with FORBIDDEN', async () => {
    const ctx = makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' })
    const caller = createCallerFactory(adminRouter)(ctx)
    await expect(caller.listExpiringProviders({ window: 'all' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('rejects unauthenticated callers', async () => {
    const ctx = makeCtx(null)
    const caller = createCallerFactory(adminRouter)(ctx)
    await expect(caller.listExpiringProviders({ window: 'all' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

describe('admin.renewProviderLicense', () => {
  beforeEach(() => {
    mockAuditEmit.mockClear()
  })

  it('updates expiry and transitions to PENDING_VERIFICATION', async () => {
    const practitioner = {
      id: UUID_P1,
      _ultranos: { licenseExpiry: '2026-05-01', kycStatus: 'SUSPENDED' },
    }
    const ctx = makeCtxForRenewal(practitioner)
    const caller = createCallerFactory(adminRouter)(ctx)

    const result = await caller.renewProviderLicense({
      practitionerId: UUID_P1,
      newExpiryDate: '2027-05-01',
      documentUrl: 'https://docs.example.com/renewal.pdf',
    })

    expect(result.success).toBe(true)
    expect(result.kycStatus).toBe('PENDING_VERIFICATION')
    expect(result.newExpiryDate).toBe('2027-05-01')
  })

  it('emits LICENSE_RENEWED audit event', async () => {
    const practitioner = {
      id: UUID_P1,
      _ultranos: { licenseExpiry: '2026-05-01', kycStatus: 'ACTIVE' },
    }
    const ctx = makeCtxForRenewal(practitioner)
    const caller = createCallerFactory(adminRouter)(ctx)

    await caller.renewProviderLicense({
      practitionerId: UUID_P1,
      newExpiryDate: '2027-05-01',
      documentUrl: 'https://docs.example.com/renewal.pdf',
    })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LICENSE_RENEWED',
        resourceType: 'PRACTITIONER',
        resourceId: UUID_P1,
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({
          newExpiryDate: '2027-05-01',
          newKycStatus: 'PENDING_VERIFICATION',
        }),
      }),
    )
  })

  it('rejects non-ADMIN callers with FORBIDDEN', async () => {
    const ctx = makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' })
    const caller = createCallerFactory(adminRouter)(ctx)

    await expect(
      caller.renewProviderLicense({
        practitionerId: UUID_P1,
        newExpiryDate: '2027-05-01',
        documentUrl: 'https://docs.example.com/renewal.pdf',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('returns NOT_FOUND for unknown practitioner', async () => {
    const ctx = makeAdminCtx()
    const chain = (ctx.supabase as any)._mockChain
    chain.single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    })

    const caller = createCallerFactory(adminRouter)(ctx)

    await expect(
      caller.renewProviderLicense({
        practitionerId: UUID_MISSING,
        newExpiryDate: '2027-05-01',
        documentUrl: 'https://docs.example.com/renewal.pdf',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('validates date format', async () => {
    const ctx = makeAdminCtx()
    const caller = createCallerFactory(adminRouter)(ctx)

    await expect(
      caller.renewProviderLicense({
        practitionerId: UUID_P1,
        newExpiryDate: 'not-a-date',
        documentUrl: 'https://docs.example.com/renewal.pdf',
      }),
    ).rejects.toThrow()
  })
})

describe('admin.licenseExpiryJobStatus', () => {
  it('returns last run info when job has run', async () => {
    const ctx = makeAdminCtx()
    const chain = (ctx.supabase as any)._mockChain
    // Mock data in camelCase since our mock fromRowRaw is identity
    chain.single = vi.fn().mockResolvedValue({
      data: {
        id: 'jr1',
        jobName: 'license-expiry-check',
        startedAt: '2026-05-15T00:00:00Z',
        completedAt: '2026-05-15T00:01:00Z',
        status: 'success',
        summary: { suspendedCount: 2, notificationsSent: 5, errors: 0 },
      },
      error: null,
    })

    const caller = createCallerFactory(adminRouter)(ctx)
    const result = await caller.licenseExpiryJobStatus()

    expect(result.status).toBe('success')
    expect(result.lastRun).toBe('2026-05-15T00:01:00Z')
  })

  it('returns never_run when no job history exists', async () => {
    const ctx = makeAdminCtx()
    const chain = (ctx.supabase as any)._mockChain
    chain.single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    })

    const caller = createCallerFactory(adminRouter)(ctx)
    const result = await caller.licenseExpiryJobStatus()

    expect(result.status).toBe('never_run')
    expect(result.lastRun).toBeNull()
  })
})
