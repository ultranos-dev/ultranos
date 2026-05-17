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
