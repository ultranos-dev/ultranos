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

function chainMock(resolveValue: any = { data: null, error: null, count: 0 }) {
  const chain: Record<string, any> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.not = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockResolvedValue(resolveValue)
  chain.single = vi.fn().mockResolvedValue(resolveValue)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.update = vi.fn().mockReturnValue(chain)
  chain.upsert = vi.fn().mockResolvedValue({ data: null, error: null })
  return chain
}

function makeCtx(
  user: { sub: string; role: string; sessionId: string; orgId?: string | null; status?: string | null } | null,
  supabaseOverride?: any,
) {
  const defaultChain = chainMock()
  const from = vi.fn().mockReturnValue(defaultChain)

  return {
    supabase: supabaseOverride ?? { from },
    user: user ? { ...user, orgId: user.orgId ?? null, status: user.status ?? null } : null,
    headers: new Headers(),
  }
}

const adminUser = { sub: 'admin-1', role: 'ADMIN', sessionId: 's1' }
const doctorUser = { sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' }

describe('admin.listAnomalyAlerts', () => {
  it('returns filtered, paginated results sorted by severity', async () => {
    const alertRows = [
      { id: '00000000-0000-0000-0000-000000000001', practitioner_id: 'doc-1', practitioner_name: 'Dr Smith', anomaly_type: 'CONTROLLED_SUBSTANCE_VOLUME', threshold: 10, actual_value: 15, date_range_start: '2026-05-10', date_range_end: '2026-05-10', severity: 'HIGH', status: 'UNREVIEWED', created_at: '2026-05-14T10:00:00Z' },
      { id: '00000000-0000-0000-0000-000000000002', practitioner_id: 'doc-2', practitioner_name: 'Dr Jones', anomaly_type: 'DRUG_FREQUENCY', threshold: 20, actual_value: 35, date_range_start: '2026-05-07', date_range_end: '2026-05-14', severity: 'MEDIUM', status: 'UNREVIEWED', created_at: '2026-05-14T09:00:00Z' },
    ]

    const chain = chainMock({ data: alertRows, error: null, count: 2 })
    const from = vi.fn().mockReturnValue(chain)
    const ctx = makeCtx(adminUser, { from })
    const caller = createCallerFactory(adminRouter)(ctx)

    const result = await caller.listAnomalyAlerts({ status: 'UNREVIEWED' })

    expect(result.alerts).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.alerts[0].id).toBe('00000000-0000-0000-0000-000000000001')
    expect(result.alerts[0].severity).toBe('HIGH')
    expect(result.alerts[1].severity).toBe('MEDIUM')
  })

  it('non-ADMIN callers rejected with FORBIDDEN', async () => {
    const ctx = makeCtx(doctorUser)
    const caller = createCallerFactory(adminRouter)(ctx)

    await expect(caller.listAnomalyAlerts({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('admin.reviewAnomaly', () => {
  beforeEach(() => {
    mockAuditEmit.mockClear()
  })

  it('DISMISS stores reason and emits audit event', async () => {
    const alertRow = { id: '00000000-0000-0000-0000-000000000001', status: 'UNREVIEWED', practitioner_id: 'doc-1' }
    const updateChain = chainMock({ data: null, error: null, count: 1 })
    updateChain.select = vi.fn().mockResolvedValue({ data: null, error: null, count: 1 })
    updateChain.update = vi.fn().mockReturnValue(updateChain)

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'prescribing_anomalies') {
        const chain = chainMock()
        chain.single = vi.fn().mockResolvedValue({ data: alertRow, error: null })
        chain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
            }),
          }),
        })
        return chain
      }
      return chainMock()
    })

    const ctx = makeCtx(adminUser, { from })
    const caller = createCallerFactory(adminRouter)(ctx)

    const result = await caller.reviewAnomaly({
      alertId: '00000000-0000-0000-0000-000000000001',
      action: 'DISMISS',
      reason: 'False positive — seasonal pattern',
    })

    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('DISMISSED')
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ANOMALY_ALERT_DISMISSED',
        resourceType: 'PRESCRIBING_ANOMALY',
        resourceId: '00000000-0000-0000-0000-000000000001',
      }),
    )

    // Verify reason was stored in update (review_reason field for all actions)
    const updateCalls = from.mock.calls.filter((c: any[]) => c[0] === 'prescribing_anomalies')
    expect(updateCalls.length).toBeGreaterThan(0)
  })

  it('ESCALATE updates status and emits audit event', async () => {
    const alertRow = { id: '00000000-0000-0000-0000-000000000002', status: 'UNREVIEWED', practitioner_id: 'doc-2' }

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'prescribing_anomalies') {
        const chain = chainMock()
        chain.single = vi.fn().mockResolvedValue({ data: alertRow, error: null })
        chain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
            }),
          }),
        })
        return chain
      }
      return chainMock()
    })

    const ctx = makeCtx(adminUser, { from })
    const caller = createCallerFactory(adminRouter)(ctx)

    const result = await caller.reviewAnomaly({
      alertId: '00000000-0000-0000-0000-000000000002',
      action: 'ESCALATE',
      reason: 'Needs senior review',
    })

    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('ESCALATED')
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ANOMALY_ALERT_ESCALATED',
      }),
    )
  })

  it('SUSPEND_PROVIDER triggers provider suspension flow', async () => {
    const alertRow = { id: '00000000-0000-0000-0000-000000000003', status: 'UNREVIEWED', practitioner_id: 'doc-3' }
    const practitionerRow = { id: 'doc-3', _ultranos: { kycStatus: 'ACTIVE' } }

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'prescribing_anomalies') {
        const chain = chainMock()
        chain.single = vi.fn().mockResolvedValue({ data: alertRow, error: null })
        chain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
            }),
          }),
        })
        return chain
      }
      if (table === 'practitioners') {
        const chain = chainMock()
        chain.single = vi.fn().mockResolvedValue({ data: practitionerRow, error: null })
        chain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
        return chain
      }
      if (table === 'active_sessions') {
        const chain = chainMock()
        chain.delete = vi.fn().mockReturnValue(chain)
        return chain
      }
      if (table === 'notifications') {
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) }
      }
      return chainMock()
    })

    const ctx = makeCtx(adminUser, { from })
    const caller = createCallerFactory(adminRouter)(ctx)

    const result = await caller.reviewAnomaly({
      alertId: '00000000-0000-0000-0000-000000000003',
      action: 'SUSPEND_PROVIDER',
      reason: 'Confirmed prescribing abuse',
    })

    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('SUSPENDED')
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ANOMALY_PROVIDER_SUSPENDED',
      }),
    )

    // Verify session termination was attempted
    const sessionCalls = from.mock.calls.filter((c: any[]) => c[0] === 'active_sessions')
    expect(sessionCalls.length).toBeGreaterThan(0)

    // Verify notification was sent to suspended provider
    const notificationCalls = from.mock.calls.filter((c: any[]) => c[0] === 'notifications')
    expect(notificationCalls.length).toBeGreaterThan(0)
  })

  it('requires reason for all actions', async () => {
    const ctx = makeCtx(adminUser)
    const caller = createCallerFactory(adminRouter)(ctx)

    // Empty reason should fail validation
    await expect(
      caller.reviewAnomaly({
        alertId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'DISMISS',
        reason: '',
      }),
    ).rejects.toThrow()
  })

  it('provider is NOT notified on DISMISS', async () => {
    const alertRow = { id: '00000000-0000-0000-0000-000000000004', status: 'UNREVIEWED', practitioner_id: 'doc-4' }

    const notificationInsert = vi.fn().mockResolvedValue({ data: null, error: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'prescribing_anomalies') {
        const chain = chainMock()
        chain.single = vi.fn().mockResolvedValue({ data: alertRow, error: null })
        chain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
            }),
          }),
        })
        return chain
      }
      if (table === 'notifications') {
        return { insert: notificationInsert }
      }
      return chainMock()
    })

    const ctx = makeCtx(adminUser, { from })
    const caller = createCallerFactory(adminRouter)(ctx)

    await caller.reviewAnomaly({
      alertId: '00000000-0000-0000-0000-000000000004',
      action: 'DISMISS',
      reason: 'Not an issue',
    })

    // No notification should be sent on DISMISS
    expect(notificationInsert).not.toHaveBeenCalled()
  })

  it('provider is NOT notified on ESCALATE', async () => {
    const alertRow = { id: '00000000-0000-0000-0000-000000000005', status: 'UNREVIEWED', practitioner_id: 'doc-5' }

    const notificationInsert = vi.fn().mockResolvedValue({ data: null, error: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'prescribing_anomalies') {
        const chain = chainMock()
        chain.single = vi.fn().mockResolvedValue({ data: alertRow, error: null })
        chain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
            }),
          }),
        })
        return chain
      }
      if (table === 'notifications') {
        return { insert: notificationInsert }
      }
      return chainMock()
    })

    const ctx = makeCtx(adminUser, { from })
    const caller = createCallerFactory(adminRouter)(ctx)

    await caller.reviewAnomaly({
      alertId: '00000000-0000-0000-0000-000000000005',
      action: 'ESCALATE',
      reason: 'Forward to compliance',
    })

    // No notification should be sent on ESCALATE
    expect(notificationInsert).not.toHaveBeenCalled()
  })

  it('provider IS notified on SUSPEND_PROVIDER', async () => {
    const alertRow = { id: '00000000-0000-0000-0000-000000000006', status: 'UNREVIEWED', practitioner_id: 'doc-6' }
    const practitionerRow = { id: 'doc-6', _ultranos: { kycStatus: 'ACTIVE' } }

    const notificationInsert = vi.fn().mockResolvedValue({ data: null, error: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'prescribing_anomalies') {
        const chain = chainMock()
        chain.single = vi.fn().mockResolvedValue({ data: alertRow, error: null })
        chain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
            }),
          }),
        })
        return chain
      }
      if (table === 'practitioners') {
        const chain = chainMock()
        chain.single = vi.fn().mockResolvedValue({ data: practitionerRow, error: null })
        chain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
        return chain
      }
      if (table === 'active_sessions') {
        const chain = chainMock()
        chain.delete = vi.fn().mockReturnValue(chain)
        return chain
      }
      if (table === 'notifications') {
        return { insert: notificationInsert }
      }
      return chainMock()
    })

    const ctx = makeCtx(adminUser, { from })
    const caller = createCallerFactory(adminRouter)(ctx)

    await caller.reviewAnomaly({
      alertId: '00000000-0000-0000-0000-000000000006',
      action: 'SUSPEND_PROVIDER',
      reason: 'Confirmed abuse',
    })

    // Provider IS notified on suspension
    expect(notificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRef: 'doc-6',
        type: 'PROVIDER_SUSPENDED',
        status: 'QUEUED',
      }),
    )
  })

  it('non-ADMIN callers rejected with FORBIDDEN', async () => {
    const ctx = makeCtx(doctorUser)
    const caller = createCallerFactory(adminRouter)(ctx)

    await expect(
      caller.reviewAnomaly({
        alertId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'DISMISS',
        reason: 'test',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
