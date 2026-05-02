import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn(() => ({ insert: vi.fn(), select: vi.fn() }))
const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

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

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

describe('lab.reportAuthEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits LOGIN audit event on successful login', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }),
    )

    const result = await caller.lab.reportAuthEvent({
      event: 'LOGIN_SUCCESS',
      actorId: 'tech-1',
    })

    expect(result.logged).toBe(true)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        outcome: 'SUCCESS',
        resourceType: 'USER_ACCOUNT',
        metadata: expect.objectContaining({ authEvent: 'LOGIN_SUCCESS' }),
      }),
    )
  })

  it('emits LOGIN FAILURE audit event on failed login', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    // Failed logins may not have a user context
    const caller = createCallerFactory(router)(makeCtx(null))

    const result = await caller.lab.reportAuthEvent({
      event: 'LOGIN_FAILURE',
      actorEmail: 'tech@lab.com',
    })

    expect(result.logged).toBe(true)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        outcome: 'FAILURE',
        metadata: expect.objectContaining({
          authEvent: 'LOGIN_FAILURE',
          failedEmail: '[REDACTED]',
        }),
      }),
    )
  })

  it('emits MFA_FAIL audit event on failed MFA verification', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }),
    )

    const result = await caller.lab.reportAuthEvent({
      event: 'MFA_VERIFY_FAILURE',
      actorId: 'tech-1',
    })

    expect(result.logged).toBe(true)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MFA_FAIL',
        outcome: 'FAILURE',
      }),
    )
  })

  it('emits LOGIN audit event on successful MFA verification', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }),
    )

    const result = await caller.lab.reportAuthEvent({
      event: 'MFA_VERIFY_SUCCESS',
      actorId: 'tech-1',
    })

    expect(result.logged).toBe(true)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({ authEvent: 'MFA_VERIFY_SUCCESS' }),
      }),
    )
  })

  it('never logs raw email in audit metadata (PHI safety)', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(null))

    await caller.lab.reportAuthEvent({
      event: 'LOGIN_FAILURE',
      actorEmail: 'sensitive@hospital.org',
    })

    const emittedMetadata = mockAuditEmit.mock.calls[0]![0].metadata
    expect(JSON.stringify(emittedMetadata)).not.toContain('sensitive@hospital.org')
    expect(emittedMetadata.failedEmail).toBe('[REDACTED]')
  })

  it('propagates error when audit.emit() throws (compliance failure)', async () => {
    mockAuditEmit.mockRejectedValueOnce(new Error('Audit write failed'))

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }),
    )

    await expect(
      caller.lab.reportAuthEvent({
        event: 'LOGIN_SUCCESS',
        actorId: 'tech-1',
      }),
    ).rejects.toThrow()
  })

  it('hashes IP address from x-forwarded-for header', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const headers = new Headers({ 'x-forwarded-for': '192.168.1.1' })
    const caller = createCallerFactory(router)({
      supabase: { from: mockFrom } as never,
      user: { sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' },
      headers,
    })

    await caller.lab.reportAuthEvent({
      event: 'LOGIN_SUCCESS',
      actorId: 'tech-1',
    })

    const emittedEvent = mockAuditEmit.mock.calls[0]![0]
    expect(emittedEvent.sourceIpHash).toBeDefined()
    // Should be a SHA-256 hex hash, not the raw IP
    expect(emittedEvent.sourceIpHash).not.toBe('192.168.1.1')
    expect(emittedEvent.sourceIpHash).toMatch(/^[a-f0-9]{64}$/)
  })
})
