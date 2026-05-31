import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
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

// Configurable mock chains
let mockFromReturn: any
let mockRpcReturn: any
let mockGetUserByIdReturn: any

function makeAdminCtx() {
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: {}, error: null }) }) })
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })

  const mockIn = vi.fn().mockResolvedValue({
    data: [{ id: 'prac-1', auth_user_id: 'auth-1' }],
    error: null,
  })
  const mockEq = vi.fn().mockReturnValue({ in: mockIn })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })

  const from = vi.fn().mockImplementation((table: string) => {
    if (mockFromReturn?.[table]) return mockFromReturn[table]
    return { select: mockSelect, insert, update }
  })

  const rpc = vi.fn().mockImplementation(() => {
    if (mockRpcReturn) return mockRpcReturn
    return { data: { success: true, previousRole: 'LAB_TECH', newRole: 'SUPERVISOR', changed: true }, error: null }
  })

  const getUserById = vi.fn().mockImplementation(() => {
    if (mockGetUserByIdReturn) return mockGetUserByIdReturn
    return { data: { user: { email: 'test@lab.com' } }, error: null }
  })

  return {
    supabase: {
      from,
      rpc,
      auth: { admin: { getUserById } },
    } as never,
    user: { sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: null, status: null },
    headers: new Headers(),
  }
}

function makeNonAdminCtx(role: string) {
  return {
    supabase: { from: vi.fn(), rpc: vi.fn() } as never,
    user: { sub: 'user-1', role, sessionId: 's1', orgId: null, status: null },
    headers: new Headers(),
  }
}

describe('admin.listLabStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFromReturn = null
    mockRpcReturn = null
    mockGetUserByIdReturn = null
  })

  it('returns staff for the given lab', async () => {
    const mockStaffData = [
      { practitioner_id: 'prac-1', lab_role: 'LAB_TECH', created_at: '2026-05-01T00:00:00Z' },
    ]

    mockFromReturn = {
      lab_technicians: {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockStaffData, error: null }),
        }),
      },
      practitioners: {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'prac-1', auth_user_id: 'auth-1' }],
            error: null,
          }),
        }),
      },
    }

    mockGetUserByIdReturn = { data: { user: { email: 'tech@lab.com' } }, error: null }

    const ctx = makeAdminCtx()
    const caller = createCallerFactory(adminRouter)(ctx)

    const result = await caller.listLabStaff({ labId: '00000000-0000-0000-0000-000000000001' })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      practitionerId: 'prac-1',
      labRole: 'LAB_TECH',
    })
  })

  it('non-ADMIN callers rejected with FORBIDDEN', async () => {
    const ctx = makeNonAdminCtx('DOCTOR')
    const caller = createCallerFactory(adminRouter)(ctx)

    await expect(
      caller.listLabStaff({ labId: '00000000-0000-0000-0000-000000000001' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('admin.updateLabStaffRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFromReturn = null
    mockRpcReturn = null
    mockGetUserByIdReturn = null
  })

  it('changes role and emits audit event', async () => {
    mockRpcReturn = {
      data: { success: true, previousRole: 'LAB_TECH', newRole: 'SUPERVISOR', changed: true },
      error: null,
    }

    const ctx = makeAdminCtx()
    const caller = createCallerFactory(adminRouter)(ctx)

    const result = await caller.updateLabStaffRole({
      labId: '00000000-0000-0000-0000-000000000001',
      targetPractitionerId: '00000000-0000-0000-0000-000000000002',
      newRole: 'SUPERVISOR',
    })

    expect(result).toEqual({
      success: true,
      previousRole: 'LAB_TECH',
      newRole: 'SUPERVISOR',
    })

    // Audit event emitted
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'PRACTITIONER',
        resourceId: '00000000-0000-0000-0000-000000000002',
        metadata: expect.objectContaining({
          previousRole: 'LAB_TECH',
          newRole: 'SUPERVISOR',
          labId: '00000000-0000-0000-0000-000000000001',
        }),
      }),
    )
  })

  it('blocks demotion of last LAB_MANAGER with CONFLICT', async () => {
    mockRpcReturn = {
      data: null,
      error: { message: 'Cannot demote the last Lab Manager in this lab' },
    }

    const ctx = makeAdminCtx()
    const caller = createCallerFactory(adminRouter)(ctx)

    await expect(
      caller.updateLabStaffRole({
        labId: '00000000-0000-0000-0000-000000000001',
        targetPractitionerId: '00000000-0000-0000-0000-000000000002',
        newRole: 'LAB_TECH',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('non-ADMIN callers rejected with FORBIDDEN', async () => {
    const ctx = makeNonAdminCtx('LAB_TECH')
    const caller = createCallerFactory(adminRouter)(ctx)

    await expect(
      caller.updateLabStaffRole({
        labId: '00000000-0000-0000-0000-000000000001',
        targetPractitionerId: '00000000-0000-0000-0000-000000000002',
        newRole: 'SUPERVISOR',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('returns NOT_FOUND when staff member does not exist', async () => {
    mockRpcReturn = {
      data: null,
      error: { message: 'Staff member not found in this lab' },
    }

    const ctx = makeAdminCtx()
    const caller = createCallerFactory(adminRouter)(ctx)

    await expect(
      caller.updateLabStaffRole({
        labId: '00000000-0000-0000-0000-000000000001',
        targetPractitionerId: '00000000-0000-0000-0000-000000000099',
        newRole: 'SUPERVISOR',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
