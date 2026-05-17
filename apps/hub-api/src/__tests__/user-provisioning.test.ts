import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

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

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue({}),
  })),
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

const { createCallerFactory } = await import('../trpc/init')
const { subscriptionRouter } = await import('../trpc/routers/subscription')

const createCaller = createCallerFactory(subscriptionRouter)

function makeCtx(role: string, orgId: string | null = 'org-test-001') {
  return {
    supabase: mockSupabaseClient as never,
    user: { sub: 'admin-1', role, sessionId: 'sess-1', orgId, status: null },
    headers: new Headers(),
  }
}

function mockSubscriptionQuery(moduleCodes: string[]) {
  const subs = moduleCodes.map((code) => ({ module_code: code }))
  const inFn = vi.fn().mockResolvedValue({ data: subs, error: null })
  const eq = vi.fn().mockReturnValue({ in: inFn })
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq, in: inFn }) })
  mockSupabaseClient.from.mockReturnValue({ select })
}

describe('Story 27.7: getAvailableRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns correct roles when all modules are subscribed', async () => {
    mockSubscriptionQuery(['OPD_LITE', 'PHARMACY_LITE', 'LAB_LITE'])

    const caller = createCaller(makeCtx('ADMIN'))
    const result = await caller.getAvailableRoles()

    expect(result.availableRoles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'ADMIN', moduleCode: null }),
        expect.objectContaining({ role: 'CLINICIAN', moduleCode: 'OPD_LITE' }),
        expect.objectContaining({ role: 'DOCTOR', moduleCode: 'OPD_LITE' }),
        expect.objectContaining({ role: 'PHARMACIST', moduleCode: 'PHARMACY_LITE' }),
        expect.objectContaining({ role: 'LAB_TECH', moduleCode: 'LAB_LITE' }),
      ]),
    )
    expect(result.unavailableRoles).toHaveLength(0)
  })

  it('always includes ADMIN in available roles', async () => {
    // No subscriptions at all
    mockSubscriptionQuery([])

    const caller = createCaller(makeCtx('ADMIN'))
    const result = await caller.getAvailableRoles()

    expect(result.availableRoles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'ADMIN', moduleCode: null }),
      ]),
    )
  })

  it('excludes CLINICIAN/DOCTOR when OPD_LITE not subscribed', async () => {
    mockSubscriptionQuery(['PHARMACY_LITE', 'LAB_LITE'])

    const caller = createCaller(makeCtx('ADMIN'))
    const result = await caller.getAvailableRoles()

    const unavailableRoleNames = result.unavailableRoles.map((r) => r.role)
    expect(unavailableRoleNames).toContain('CLINICIAN')
    expect(unavailableRoleNames).toContain('DOCTOR')

    const availableRoleNames = result.availableRoles.map((r) => r.role)
    expect(availableRoleNames).not.toContain('CLINICIAN')
    expect(availableRoleNames).not.toContain('DOCTOR')
  })

  it('excludes PHARMACIST when PHARMACY_LITE not subscribed', async () => {
    mockSubscriptionQuery(['OPD_LITE', 'LAB_LITE'])

    const caller = createCaller(makeCtx('ADMIN'))
    const result = await caller.getAvailableRoles()

    const unavailableRoleNames = result.unavailableRoles.map((r) => r.role)
    expect(unavailableRoleNames).toContain('PHARMACIST')

    expect(result.unavailableRoles.find((r) => r.role === 'PHARMACIST')).toMatchObject({
      moduleCode: 'PHARMACY_LITE',
      moduleName: 'Pharmacy Lite',
      reason: 'NOT_SUBSCRIBED',
    })
  })

  it('excludes LAB_TECH when LAB_LITE not subscribed', async () => {
    mockSubscriptionQuery(['OPD_LITE', 'PHARMACY_LITE'])

    const caller = createCaller(makeCtx('ADMIN'))
    const result = await caller.getAvailableRoles()

    const unavailableRoleNames = result.unavailableRoles.map((r) => r.role)
    expect(unavailableRoleNames).toContain('LAB_TECH')

    expect(result.unavailableRoles.find((r) => r.role === 'LAB_TECH')).toMatchObject({
      moduleCode: 'LAB_LITE',
      moduleName: 'Lab Lite',
      reason: 'NOT_SUBSCRIBED',
    })
  })

  it('non-ADMIN role returns FORBIDDEN', async () => {
    const caller = createCaller(makeCtx('DOCTOR'))
    await expect(caller.getAvailableRoles()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('rejects when orgId is missing from JWT', async () => {
    mockSubscriptionQuery([])
    const caller = createCaller(makeCtx('ADMIN', null))
    await expect(caller.getAvailableRoles()).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})

describe('Story 27.7: validateRoleForOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows ADMIN role without checking subscriptions', async () => {
    // No DB call needed for ADMIN
    const caller = createCaller(makeCtx('ADMIN'))

    // Mock minimal so the from() call for ADMIN short-circuits
    mockSubscriptionQuery([])

    const result = await caller.validateRoleForOrg({ role: 'ADMIN' })
    expect(result.allowed).toBe(true)
  })

  it('rejects unknown role', async () => {
    mockSubscriptionQuery([])
    const caller = createCaller(makeCtx('ADMIN'))
    const result = await caller.validateRoleForOrg({ role: 'UNKNOWN_ROLE' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Unknown role')
  })

  it('rejects CLINICIAN when OPD_LITE not subscribed', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const inFn = vi.fn().mockReturnValue({ maybeSingle })
    // Chain: select().eq(org_id).eq(module_code).in(status).maybeSingle()
    const eqModuleCode = vi.fn().mockReturnValue({ in: inFn })
    const eqOrgId = vi.fn().mockReturnValue({ eq: eqModuleCode })
    const select = vi.fn().mockReturnValue({ eq: eqOrgId })
    mockSupabaseClient.from.mockReturnValue({ select })

    const caller = createCaller(makeCtx('ADMIN'))
    const result = await caller.validateRoleForOrg({ role: 'CLINICIAN' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Subscribe to OPD Lite')
  })

  it('allows PHARMACIST when PHARMACY_LITE subscribed', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'sub-1' },
      error: null,
    })
    const inFn = vi.fn().mockReturnValue({ maybeSingle })
    const eqModuleCode = vi.fn().mockReturnValue({ in: inFn })
    const eqOrgId = vi.fn().mockReturnValue({ eq: eqModuleCode })
    const select = vi.fn().mockReturnValue({ eq: eqOrgId })
    mockSupabaseClient.from.mockReturnValue({ select })

    const caller = createCaller(makeCtx('ADMIN'))
    const result = await caller.validateRoleForOrg({ role: 'PHARMACIST' })
    expect(result.allowed).toBe(true)
  })

  it('non-ADMIN role returns FORBIDDEN', async () => {
    const caller = createCaller(makeCtx('PHARMACIST'))
    await expect(
      caller.validateRoleForOrg({ role: 'LAB_TECH' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('Story 27.7 AC #4: Suspended user cannot access protectedProcedure', () => {
  it('throws FORBIDDEN with ACCOUNT_SUSPENDED message for suspended users', async () => {
    const ctx = {
      supabase: mockSupabaseClient as never,
      user: { sub: 'user-1', role: 'DOCTOR', sessionId: 'sess-1', orgId: 'org-1', status: 'SUSPENDED' },
      headers: new Headers(),
    }

    mockSubscriptionQuery(['OPD_LITE'])
    const caller = createCaller(ctx)

    await expect(caller.getAvailableRoles()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'ACCOUNT_SUSPENDED',
    })
  })
})
