import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

// ── Mock Supabase ──────────────────────────────────────────
const mockFromChain: Record<string, any> = {}
const mockFrom = vi.fn(() => mockFromChain)
const mockGetUserById = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
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

// ── Helpers ────────────────────────────────────────────────
function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  // Build a fluent Supabase mock chain
  const chain = {
    data: null as any,
    error: null as any,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: undefined as any,
  }
  // Make the chain thenable for queries without .limit()
  chain.then = (resolve: any) => resolve({ data: chain.data, error: chain.error })

  const from = vi.fn(() => chain)

  return {
    supabase: {
      from,
      auth: {
        admin: {
          getUserById: mockGetUserById,
        },
      },
    } as never,
    user: user ? { ...user, orgId: null, status: null } : null,
    headers: new Headers(),
    _chain: chain,
    _from: from,
  }
}

function adminCtx() {
  return makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' })
}

const STAFF_ROWS = [
  {
    practitioner_id: 'p1',
    lab_id: 'lab-1',
    lab_role: 'LAB_TECH',
    created_at: '2026-05-01T00:00:00Z',
    labs: { id: 'lab-1', lab_name: 'Central Lab' },
  },
  {
    practitioner_id: 'p2',
    lab_id: 'lab-2',
    lab_role: 'LAB_MANAGER',
    created_at: '2026-05-02T00:00:00Z',
    labs: { id: 'lab-2', lab_name: 'West Lab' },
  },
  {
    practitioner_id: 'p3',
    lab_id: 'lab-1',
    lab_role: 'SENIOR_TECH',
    created_at: '2026-05-03T00:00:00Z',
    labs: { id: 'lab-1', lab_name: 'Central Lab' },
  },
]

describe('admin.listAllLabStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns paginated results with correct shape', async () => {
    const ctx = adminCtx()
    let callIndex = 0
    ctx._from.mockImplementation((table: string) => {
      const chain = {
        data: null as any,
        error: null as any,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(function (this: any) {
          return { then: (resolve: any) => resolve({ data: this.data, error: this.error }) }
        }),
        then: undefined as any,
      }
      chain.then = (resolve: any) => resolve({ data: chain.data, error: chain.error })

      if (table === 'lab_technicians' && callIndex === 0) {
        // First call: main staff query
        chain.data = STAFF_ROWS
        callIndex++
      } else if (table === 'practitioners') {
        chain.data = [
          { id: 'p1', auth_user_id: 'auth-1' },
          { id: 'p2', auth_user_id: 'auth-2' },
          { id: 'p3', auth_user_id: 'auth-3' },
        ]
      } else if (table === 'lab_technicians' && callIndex > 0) {
        // Manager check
        chain.data = [{ lab_id: 'lab-1' }] // lab-1 has a manager query result
      }
      return chain
    })

    mockGetUserById
      .mockResolvedValueOnce({ data: { user: { email: 'tech@test.com', last_sign_in_at: '2026-05-29T10:00:00Z' } } })
      .mockResolvedValueOnce({ data: { user: { email: 'manager@test.com', last_sign_in_at: '2026-05-20T10:00:00Z' } } })
      .mockResolvedValueOnce({ data: { user: { email: 'senior@test.com', last_sign_in_at: null } } })

    const caller = createCallerFactory(adminRouter)(ctx as any)
    const result = await caller.listAllLabStaff({ limit: 20 })

    expect(result.items).toHaveLength(3)
    expect(result.items[0]).toMatchObject({
      practitionerId: 'p1',
      email: 'tech@test.com',
      labId: 'lab-1',
      labName: 'Central Lab',
      labRole: 'LAB_TECH',
    })
    expect(result.nextCursor).toBeNull()
  })

  it('role filter returns only matching roles', async () => {
    const ctx = adminCtx()
    const eqCalls: [string, string][] = []

    ctx._from.mockImplementation((table: string) => {
      const chain: any = {
        data: null as any,
        error: null as any,
        select: vi.fn(),
        eq: vi.fn(),
        gt: vi.fn(),
        in: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        then: undefined as any,
      }
      // All methods return chain for fluent chaining
      chain.select.mockReturnValue(chain)
      chain.gt.mockReturnValue(chain)
      chain.in.mockReturnValue(chain)
      chain.order.mockReturnValue(chain)
      chain.limit.mockReturnValue(chain)
      chain.eq.mockImplementation((col: string, val: string) => {
        eqCalls.push([col, val])
        return chain
      })
      chain.then = (resolve: any) => resolve({ data: chain.data, error: chain.error })

      if (table === 'lab_technicians') {
        chain.data = [STAFF_ROWS[0]] // Only LAB_TECH
      } else if (table === 'practitioners') {
        chain.data = [{ id: 'p1', auth_user_id: 'auth-1' }]
      }
      return chain
    })

    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'tech@test.com', last_sign_in_at: '2026-05-29T10:00:00Z' } },
    })

    const caller = createCallerFactory(adminRouter)(ctx as any)
    const result = await caller.listAllLabStaff({ roleFilter: 'LAB_TECH', limit: 20 })

    // Verify .eq was called with lab_role filter
    expect(eqCalls.some(([col, val]) => col === 'lab_role' && val === 'LAB_TECH')).toBe(true)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].labRole).toBe('LAB_TECH')
  })

  it('lab filter returns only matching lab', async () => {
    const ctx = adminCtx()
    const eqCalls: [string, string][] = []

    ctx._from.mockImplementation((table: string) => {
      const chain: any = {
        data: null as any,
        error: null as any,
        select: vi.fn(),
        eq: vi.fn(),
        gt: vi.fn(),
        in: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        then: undefined as any,
      }
      chain.select.mockReturnValue(chain)
      chain.gt.mockReturnValue(chain)
      chain.in.mockReturnValue(chain)
      chain.order.mockReturnValue(chain)
      chain.limit.mockReturnValue(chain)
      chain.eq.mockImplementation((col: string, val: string) => {
        eqCalls.push([col, val])
        return chain
      })
      chain.then = (resolve: any) => resolve({ data: chain.data, error: chain.error })

      if (table === 'lab_technicians') {
        chain.data = [STAFF_ROWS[0]]
      } else if (table === 'practitioners') {
        chain.data = [{ id: 'p1', auth_user_id: 'auth-1' }]
      }
      return chain
    })

    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'tech@test.com', last_sign_in_at: '2026-05-29T10:00:00Z' } },
    })

    const labUuid = '00000000-0000-0000-0000-000000000001'
    const caller = createCallerFactory(adminRouter)(ctx as any)
    await caller.listAllLabStaff({ labFilter: labUuid, limit: 20 })

    // Verify .eq was called with lab_id filter
    expect(eqCalls.some(([col, val]) => col === 'lab_id' && val === labUuid)).toBe(true)
  })

  it('non-ADMIN callers rejected with FORBIDDEN', async () => {
    const ctx = makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' })
    const caller = createCallerFactory(adminRouter)(ctx as any)
    await expect(caller.listAllLabStaff({ limit: 20 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('unauthenticated callers rejected with UNAUTHORIZED', async () => {
    const ctx = makeCtx(null)
    const caller = createCallerFactory(adminRouter)(ctx as any)
    await expect(caller.listAllLabStaff({ limit: 20 })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

describe('admin.exportLabStaffCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns valid base64 CSV', async () => {
    const ctx = adminCtx()

    ctx._from.mockImplementation((table: string) => {
      const chain = {
        data: null as any,
        error: null as any,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(function (this: any) {
          return { then: (resolve: any) => resolve({ data: this.data, error: this.error }) }
        }),
        then: undefined as any,
      }
      chain.then = (resolve: any) => resolve({ data: chain.data, error: chain.error })

      if (table === 'lab_technicians') {
        chain.data = [STAFF_ROWS[0]]
      } else if (table === 'practitioners') {
        chain.data = [{ id: 'p1', auth_user_id: 'auth-1' }]
      }
      return chain
    })

    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'tech@test.com', last_sign_in_at: '2026-05-29T10:00:00Z' } },
    })

    const caller = createCallerFactory(adminRouter)(ctx as any)
    const result = await caller.exportLabStaffCsv({})

    expect(result.mimeType).toBe('text/csv')
    expect(result.filename).toMatch(/^lab-staff-export-\d{4}-\d{2}-\d{2}\.csv$/)

    // Decode and validate CSV
    const csv = Buffer.from(result.data, 'base64').toString('utf-8')
    expect(csv).toContain('Email,Lab Name,Role,Last Active,Assigned Date')
    expect(csv).toContain('tech@test.com')
    expect(csv).toContain('Central Lab')
    expect(csv).toContain('LAB_TECH')
  })

  it('emits audit event for export', async () => {
    const ctx = adminCtx()

    ctx._from.mockImplementation(() => {
      const chain = {
        data: [] as any[],
        error: null as any,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(function (this: any) {
          return { then: (resolve: any) => resolve({ data: this.data, error: this.error }) }
        }),
        then: undefined as any,
      }
      chain.then = (resolve: any) => resolve({ data: chain.data, error: chain.error })
      return chain
    })

    const caller = createCallerFactory(adminRouter)(ctx as any)
    await caller.exportLabStaffCsv({})

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EXPORT',
        resourceType: 'PRACTITIONER',
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({
          exportType: 'CSV',
          endpoint: 'admin.exportLabStaffCsv',
        }),
      }),
    )
  })

  it('non-ADMIN callers rejected with FORBIDDEN', async () => {
    const ctx = makeCtx({ sub: 'lab-1', role: 'LAB_TECH', sessionId: 's1' })
    const caller = createCallerFactory(adminRouter)(ctx as any)
    await expect(caller.exportLabStaffCsv({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('admin.listLabsForFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns list of labs for ADMIN', async () => {
    const ctx = adminCtx()
    ctx._from.mockImplementation(() => {
      const chain = {
        data: [
          { id: 'lab-1', lab_name: 'Central Lab' },
          { id: 'lab-2', lab_name: 'West Lab' },
        ] as any[],
        error: null as any,
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: undefined as any,
      }
      chain.then = (resolve: any) => resolve({ data: chain.data, error: chain.error })
      return chain
    })

    const caller = createCallerFactory(adminRouter)(ctx as any)
    const result = await caller.listLabsForFilter()

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'lab-1', labName: 'Central Lab' })
    expect(result[1]).toMatchObject({ id: 'lab-2', labName: 'West Lab' })
  })

  it('non-ADMIN callers rejected with FORBIDDEN', async () => {
    const ctx = makeCtx({ sub: 'pharm-1', role: 'PHARMACIST', sessionId: 's1' })
    const caller = createCallerFactory(adminRouter)(ctx as any)
    await expect(caller.listLabsForFilter()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})
