import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Billing Invoice Tests — Story 27.8 AC #7, #8
// Tests RBAC enforcement, cross-org access blocking,
// and audit event emission on invoice download.
// ============================================================

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    pipeline: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}))

// Mock @ultranos/billing
const mockGetInvoices = vi.fn()
vi.mock('@ultranos/billing', () => ({
  getBillingAdapter: () => ({
    getInvoices: mockGetInvoices,
    handleWebhook: vi.fn(),
  }),
  BillingEventType: {
    CHARGE_SUCCESS: 'CHARGE_SUCCESS',
    CHARGE_FAILED: 'CHARGE_FAILED',
    REFUND: 'REFUND',
    SUBSCRIPTION_CREATED: 'SUBSCRIPTION_CREATED',
    SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  },
}))

// Mock @ultranos/audit-logger
const mockAuditEmit = vi.fn().mockResolvedValue(undefined)
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

// Mock billing-notifications
vi.mock('@/services/billing-notifications', () => ({
  sendBillingNotification: vi.fn().mockResolvedValue(undefined),
}))

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

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')
const createCaller = createCallerFactory(appRouter)

const ADMIN_USER = { sub: 'admin-001', role: 'ADMIN', sessionId: 'sess-1', orgId: 'org-1' }
const PLATFORM_ADMIN_USER = { sub: 'padmin-001', role: 'PLATFORM_ADMIN', sessionId: 'sess-3', orgId: 'org-1' }
const DOCTOR_USER = { sub: 'doc-001', role: 'DOCTOR', sessionId: 'sess-2', orgId: 'org-1' }

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  user?: { sub: string; role: string; sessionId: string; orgId: string | null } | null
}) {
  return {
    supabase: { from: overrides?.supabaseFrom ?? vi.fn() } as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

function mockSubTable(subData: any) {
  return vi.fn((table: string) => {
    const chain: any = {}
    const chainMethod = (name: string) => {
      chain[name] = vi.fn((..._args: any[]) => chain)
    }
    ;['select', 'eq', 'in', 'order'].forEach(chainMethod)
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: table === 'org_subscriptions' ? subData : null,
      error: null,
    })
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
    return chain
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('billing.getInvoices', () => {
  it('rejects non-ADMIN role', async () => {
    const from = mockSubTable({ id: 'sub-1', org_id: 'org-1', provider_customer_id: 'cus_123' })
    const ctx = createTestContext({ supabaseFrom: from, user: DOCTOR_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.billing.getInvoices({ customerId: 'cus_123' }),
    ).rejects.toThrow(/FORBIDDEN|insufficient role/)
  })

  it('blocks cross-org invoice access', async () => {
    // No matching subscription for this org + customerId
    const from = mockSubTable(null)
    const ctx = createTestContext({ supabaseFrom: from, user: ADMIN_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.billing.getInvoices({ customerId: 'cus_other_org' }),
    ).rejects.toThrow(/does not belong|FORBIDDEN/)
  })

  it('returns invoices and emits audit event on success', async () => {
    mockGetInvoices.mockResolvedValue([
      {
        invoiceId: 'inv_1',
        amount: 50,
        currency: 'USD',
        status: 'paid',
        pdfUrl: 'https://stripe.com/inv.pdf',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ])

    const from = mockSubTable({ id: 'sub-1', org_id: 'org-1', provider_customer_id: 'cus_123' })
    const ctx = createTestContext({ supabaseFrom: from, user: ADMIN_USER })
    const caller = createCaller(ctx)

    const result = await caller.billing.getInvoices({ customerId: 'cus_123' })

    expect(result.invoices).toHaveLength(1)
    expect(result.invoices[0]).toEqual({
      invoiceId: 'inv_1',
      amount: 50,
      currency: 'USD',
      status: 'paid',
      pdfUrl: 'https://stripe.com/inv.pdf',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    // Audit event emitted
    expect(mockAuditEmit).toHaveBeenCalledTimes(1)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'READ',
        resourceType: 'Invoice',
        actorId: 'admin-001',
        actorRole: 'ADMIN',
        outcome: 'SUCCESS',
      }),
    )
  })

  it('allows PLATFORM_ADMIN to access invoices', async () => {
    mockGetInvoices.mockResolvedValue([])

    const from = mockSubTable({ id: 'sub-1', org_id: 'org-1', provider_customer_id: 'cus_123' })
    const ctx = createTestContext({ supabaseFrom: from, user: PLATFORM_ADMIN_USER })
    const caller = createCaller(ctx)

    const result = await caller.billing.getInvoices({ customerId: 'cus_123' })
    expect(result.invoices).toHaveLength(0)
  })
})
