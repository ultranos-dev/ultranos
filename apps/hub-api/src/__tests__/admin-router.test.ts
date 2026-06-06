import { describe, it, expect, vi } from 'vitest'
import { TRPCError } from '@trpc/server'

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

function makeCtx(user: { sub: string; role: string; sessionId: string; orgId?: string | null; status?: string | null } | null) {
  const single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })

  return {
    supabase: { from } as never,
    user: user ? { ...user, orgId: user.orgId ?? null, status: user.status ?? null } : null,
    headers: new Headers(),
  }
}

describe('Admin Router — ADMIN guard', () => {
  it('ADMIN can access dashboardStats', async () => {
    const caller = createCallerFactory(adminRouter)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' }),
    )
    const result = await caller.dashboardStats()
    expect(result).toEqual({
      pendingKycReviews: 0,
      pendingLabApprovals: 0,
      activeAlerts: 0,
      recentAuditEvents: 0,
    })
  })

  it('ADMIN can access health', async () => {
    const caller = createCallerFactory(adminRouter)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' }),
    )
    const result = await caller.health()
    expect(result.status).toBe('ok')
    expect(result.timestamp).toBeTruthy()
  })

  it('DOCTOR is rejected with FORBIDDEN', async () => {
    const caller = createCallerFactory(adminRouter)(
      makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' }),
    )
    await expect(caller.dashboardStats()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('PHARMACIST is rejected with FORBIDDEN', async () => {
    const caller = createCallerFactory(adminRouter)(
      makeCtx({ sub: 'pharm-1', role: 'PHARMACIST', sessionId: 's1' }),
    )
    await expect(caller.health()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('LAB_TECH is rejected with FORBIDDEN', async () => {
    const caller = createCallerFactory(adminRouter)(
      makeCtx({ sub: 'lab-1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    await expect(caller.dashboardStats()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('unauthenticated user is rejected with UNAUTHORIZED', async () => {
    const caller = createCallerFactory(adminRouter)(makeCtx(null))
    await expect(caller.dashboardStats()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('reportAuthEvent accepts ADMIN_LOGIN_SUCCESS and emits audit event', async () => {
    mockAuditEmit.mockClear()
    const caller = createCallerFactory(adminRouter)(makeCtx(null))
    const result = await caller.reportAuthEvent({
      event: 'ADMIN_LOGIN_SUCCESS',
      actorId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.logged).toBe(true)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        resourceType: 'USER_ACCOUNT',
        outcome: 'SUCCESS',
        actorRole: 'UNKNOWN',
        metadata: expect.objectContaining({
          authEvent: 'ADMIN_LOGIN_SUCCESS',
          portal: 'admin',
        }),
      }),
    )
  })

  it('reportAuthEvent accepts ADMIN_LOGIN_FAILURE and emits audit event', async () => {
    mockAuditEmit.mockClear()
    const caller = createCallerFactory(adminRouter)(makeCtx(null))
    const result = await caller.reportAuthEvent({
      event: 'ADMIN_LOGIN_FAILURE',
      actorEmail: 'fail@test.com',
    })
    expect(result.logged).toBe(true)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        resourceType: 'USER_ACCOUNT',
        outcome: 'FAILURE',
        actorRole: 'UNKNOWN',
        metadata: expect.objectContaining({
          authEvent: 'ADMIN_LOGIN_FAILURE',
          portal: 'admin',
          failedEmail: '[REDACTED]',
        }),
      }),
    )
  })
})

describe('Admin Router — createUser split name', () => {
  it('rejects input with legacy `name` field', async () => {
    const caller = createCallerFactory(adminRouter)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: 'org-1' }),
    )
    // @ts-expect-error intentionally passing old shape
    await expect(caller.createUser({ name: 'Ahmad Shah', email: 'a@b.com', role: 'DOCTOR', password: 'pass1234' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('accepts givenName + familyName and calls supabase.auth.admin.createUser', async () => {
    const createUserMock = vi.fn().mockResolvedValue({
      data: { user: { id: 'auth-uuid-1' } },
      error: null,
    })
    const generateLinkMock = vi.fn().mockResolvedValue({ data: { properties: { action_link: null } }, error: null })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const single = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })  // adminPractitioner lookup
      .mockResolvedValueOnce({ data: { id: 'pract-uuid-1' }, error: null })  // insert practitioner

    const maybeSingleSub = vi.fn().mockResolvedValue({ data: { id: 'sub-1' }, error: null })
    const eqLeaf = { maybeSingle, single }
    const eqChain: any = { maybeSingle, single, eq: vi.fn().mockReturnValue(eqLeaf) }
    const selectChain = { eq: vi.fn().mockReturnValue(eqChain) }
    const insertChain = { select: vi.fn().mockReturnValue({ single }) }
    const fromMock = vi.fn((table: string) => {
      if (table === 'practitioners') return { select: vi.fn().mockReturnValue(selectChain), insert: vi.fn().mockReturnValue(insertChain) }
      if (table === 'org_subscriptions') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue({ maybeSingle: maybeSingleSub }) }) }) }) }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }
    })

    const ctx = {
      supabase: {
        from: fromMock,
        auth: { admin: { createUser: createUserMock, generateLink: generateLinkMock } },
      } as never,
      user: { sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: 'org-1', status: null },
      headers: new Headers(),
    }

    const caller = createCallerFactory(adminRouter)(ctx)
    const result = await caller.createUser({
      givenName: 'Ahmad',
      familyName: 'Shah',
      email: 'ahmad@clinic.af',
      role: 'DOCTOR',
      password: 'securePass1',
    })

    expect(createUserMock).toHaveBeenCalledWith(expect.objectContaining({
      user_metadata: expect.objectContaining({ given_name: 'Ahmad', family_name: 'Shah' }),
    }))
    expect(result.name).toBe('Ahmad Shah')
  })
})

describe('Admin Router — enrollChw split name', () => {
  it('rejects input with legacy `fullName` field', async () => {
    const caller = createCallerFactory(adminRouter)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: 'org-1' }),
    )
    // @ts-expect-error intentionally passing old shape
    await expect(caller.enrollChw({ fullName: 'Fatima Noori', phone: '+93700000001', assignedLabId: '00000000-0000-0000-0000-000000000001' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('accepts givenName + familyName and stores both columns separately', async () => {
    const labSingle = vi.fn().mockResolvedValue({ data: { id: 'lab-1' }, error: null })
    let capturedInsertRow: Record<string, unknown> | null = null
    const insertMock = vi.fn().mockImplementation((row: Record<string, unknown>) => {
      capturedInsertRow = row
      return { error: null }
    })
    const fromMock = vi.fn((table: string) => {
      if (table === 'labs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: labSingle }),
            }),
          }),
        }
      }
      if (table === 'practitioners') {
        return { insert: insertMock }
      }
      return { select: vi.fn() }
    })

    const ctx = {
      supabase: { from: fromMock } as never,
      user: { sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: 'org-1', status: null },
      headers: new Headers(),
    }

    const caller = createCallerFactory(adminRouter)(ctx)
    const result = await caller.enrollChw({
      givenName: 'Fatima',
      familyName: 'Noori',
      phone: '+93700000001',
      assignedLabId: '00000000-0000-0000-0000-000000000001',
    })

    expect(result.success).toBe(true)
    expect(capturedInsertRow).not.toBeNull()
    // Both name columns must be non-empty strings (encrypted or plain)
    expect(typeof capturedInsertRow!.given_name).toBe('string')
    expect((capturedInsertRow!.given_name as string).length).toBeGreaterThan(0)
    // given_name must not be raw plaintext (encryption applied)
    expect(capturedInsertRow!.given_name).not.toBe('Fatima')
    expect(typeof capturedInsertRow!.family_name).toBe('string')
    expect((capturedInsertRow!.family_name as string).length).toBeGreaterThan(0)
    // family_name must be stored separately and not equal given_name
    expect(capturedInsertRow!.family_name).not.toBe(capturedInsertRow!.given_name)
    // value must not be raw plaintext (encryption applied)
    expect(capturedInsertRow!.family_name).not.toBe('Noori')
  })

  it('stores empty string for family_name when familyName is omitted', async () => {
    const labSingle = vi.fn().mockResolvedValue({ data: { id: 'lab-1' }, error: null })
    let capturedInsertRow: Record<string, unknown> | null = null
    const insertMock = vi.fn().mockImplementation((row: Record<string, unknown>) => {
      capturedInsertRow = row
      return { error: null }
    })
    const fromMock = vi.fn((table: string) => {
      if (table === 'labs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: labSingle }),
            }),
          }),
        }
      }
      if (table === 'practitioners') return { insert: insertMock }
      return { select: vi.fn() }
    })

    const ctx = {
      supabase: { from: fromMock } as never,
      user: { sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: 'org-1', status: null },
      headers: new Headers(),
    }

    const caller = createCallerFactory(adminRouter)(ctx)
    // Pass no familyName — uses default ''
    await caller.enrollChw({
      givenName: 'Ahmad',
      phone: '+93700000001',
      assignedLabId: '00000000-0000-0000-0000-000000000001',
    })

    expect(capturedInsertRow).not.toBeNull()
    expect(capturedInsertRow!.family_name).toBe('')
  })
})
