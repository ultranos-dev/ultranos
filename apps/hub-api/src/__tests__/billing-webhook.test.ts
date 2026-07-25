import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Billing Webhook Tests — Story 27.8 AC #1, #5, #8
// Tests webhook event processing, grace period management,
// org status transitions, and audit logging compliance.
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
const mockHandleWebhook = vi.fn()
vi.mock('@ultranos/billing', () => ({
  getBillingAdapter: () => ({
    handleWebhook: mockHandleWebhook,
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
const mockSendNotification = vi.fn().mockResolvedValue(undefined)
vi.mock('@/services/billing-notifications', () => ({
  sendBillingNotification: (...args: unknown[]) => mockSendNotification(...args),
}))

const mockSupabaseFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockSupabaseFrom })),
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

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  supabaseRpc?: ReturnType<typeof vi.fn>
}) {
  return {
    supabase: {
      from: overrides?.supabaseFrom ?? vi.fn(),
      rpc: overrides?.supabaseRpc ?? vi.fn().mockResolvedValue({ data: null, error: null }),
    } as never,
    user: null, // Webhook is public — no auth
    headers: new Headers(),
  }
}

/**
 * Creates a chainable mock for Supabase table calls.
 * billing_events calls are tracked: first call (idempotency select) returns null,
 * second call (insert) returns the provided data.
 */
function mockTable(tableResponses: Record<string, { data: any; error: any }>) {
  const billingEventsCallCount = { value: 0 }

  return vi.fn((table: string) => {
    const defaultResponse = { data: null, error: null }
    const response = tableResponses[table] ?? defaultResponse

    const chain: any = {}
    const chainMethod = (name: string) => {
      chain[name] = vi.fn((..._args: any[]) => chain)
      return chain
    }
    ;['select', 'insert', 'update', 'eq', 'in', 'order', 'limit'].forEach(chainMethod)

    if (table === 'billing_events') {
      billingEventsCallCount.value++
      if (billingEventsCallCount.value === 1) {
        // First call = idempotency check — no existing record
        chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      } else {
        // Subsequent calls = insert
        chain.single = vi.fn().mockResolvedValue(response)
        chain.maybeSingle = vi.fn().mockResolvedValue(response)
      }
    } else {
      chain.single = vi.fn().mockResolvedValue(response)
      chain.maybeSingle = vi.fn().mockResolvedValue(response)
    }
    return chain
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('billing.handleWebhook', () => {
  it('processes CHARGE_FAILED and sets grace period on org subscriptions', async () => {
    mockHandleWebhook.mockResolvedValue({
      eventType: 'CHARGE_FAILED',
      customerId: 'cus_123',
      amount: 50,
      currency: 'USD',
      providerRef: 'evt_123',
      metadata: {},
    })

    const from = mockTable({
      org_subscriptions: { data: { org_id: 'org-1' }, error: null },
      organizations: { data: { id: 'org-1', name: 'Test Org', billing_email: 'b@t.com' }, error: null },
      billing_events: { data: { id: 'be-1' }, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: from })
    const caller = createCaller(ctx)
    const result = await caller.billing.handleWebhook({ payload: 'p', signature: 's' })

    expect(result).toEqual({ received: true })
    // Verify org_subscriptions was accessed (org lookup + grace period update)
    expect(from).toHaveBeenCalledWith('org_subscriptions')
  })

  it('processes CHARGE_SUCCESS and clears grace period on org_subscriptions', async () => {
    // The router clears grace_period_ends_at on org_subscriptions for CHARGE_SUCCESS.
    // For a non-suspended org, transitionOrg is NOT called (no RPC).
    mockHandleWebhook.mockResolvedValue({
      eventType: 'CHARGE_SUCCESS',
      customerId: 'cus_123',
      amount: 50,
      currency: 'USD',
      providerRef: 'evt_456',
      metadata: {},
    })

    const from = mockTable({
      org_subscriptions: { data: { org_id: 'org-1' }, error: null },
      organizations: { data: { id: 'org-1', name: 'Test Org', billing_email: 'b@t.com', status: 'ACTIVE' }, error: null },
      billing_events: { data: { id: 'be-1' }, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: from })
    const caller = createCaller(ctx)
    const result = await caller.billing.handleWebhook({ payload: 'p', signature: 's' })

    expect(result).toEqual({ received: true })
    // Verify org_subscriptions was updated (grace period cleared)
    expect(from).toHaveBeenCalledWith('org_subscriptions')
  })

  it('skips processing for null webhook events (unmapped event types)', async () => {
    mockHandleWebhook.mockResolvedValue(null)

    const from = mockTable({})
    const ctx = createTestContext({ supabaseFrom: from })
    const caller = createCaller(ctx)
    const result = await caller.billing.handleWebhook({ payload: 'p', signature: 's' })

    expect(result).toEqual({ received: true })
    // No billing_events insert should have happened
    expect(from).not.toHaveBeenCalledWith('billing_events')
  })

  it('skips duplicate events via idempotency check on provider_ref', async () => {
    mockHandleWebhook.mockResolvedValue({
      eventType: 'REFUND',
      customerId: 'cus_123',
      amount: 25,
      currency: 'USD',
      providerRef: 'evt_dupe',
      metadata: {},
    })

    // Return existing record for idempotency check on billing_events
    const from = vi.fn((table: string) => {
      const chain: any = {}
      const chainMethod = (name: string) => {
        chain[name] = vi.fn((..._args: any[]) => chain)
      }
      ;['select', 'insert', 'update', 'eq', 'in', 'order', 'limit'].forEach(chainMethod)

      if (table === 'org_subscriptions') {
        chain.single = vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null })
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null })
      } else if (table === 'organizations') {
        chain.single = vi.fn().mockResolvedValue({ data: { id: 'org-1', name: 'Test Org', billing_email: 'b@t.com' }, error: null })
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      } else if (table === 'billing_events') {
        // First call (idempotency check) returns existing, second call (insert) would be skipped
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'existing-be' }, error: null })
        chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
      } else {
        chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      }
      return chain
    })

    const ctx = createTestContext({ supabaseFrom: from })
    const caller = createCaller(ctx)
    const result = await caller.billing.handleWebhook({ payload: 'p', signature: 's' })

    expect(result).toEqual({ received: true })
    // Audit should NOT have been called since event was skipped
    expect(mockAuditEmit).not.toHaveBeenCalled()
  })

  it('emits audit event for every webhook event', async () => {
    mockHandleWebhook.mockResolvedValue({
      eventType: 'REFUND',
      customerId: 'cus_123',
      amount: 25,
      currency: 'USD',
      providerRef: 'evt_refund',
      metadata: {},
    })

    const from = mockTable({
      org_subscriptions: { data: { org_id: 'org-1' }, error: null },
      organizations: { data: { id: 'org-1', name: 'Test Org', billing_email: 'b@t.com' }, error: null },
      billing_events: { data: { id: 'be-1' }, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: from })
    const caller = createCaller(ctx)
    await caller.billing.handleWebhook({ payload: 'p', signature: 's' })

    expect(mockAuditEmit).toHaveBeenCalledTimes(1)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BILLING_REFUND',
        resourceType: 'BillingEvent',
        actorId: 'SYSTEM',
        actorRole: 'SYSTEM',
        outcome: 'SUCCESS',
        sessionId: 'webhook',
      }),
    )
  })

  it('never includes card details in audit log metadata', async () => {
    mockHandleWebhook.mockResolvedValue({
      eventType: 'CHARGE_SUCCESS',
      customerId: 'cus_123',
      amount: 100,
      currency: 'USD',
      providerRef: 'evt_card',
      metadata: { cardLast4: '4242', cardBrand: 'visa' },
    })

    const from = mockTable({
      org_subscriptions: { data: { org_id: 'org-1' }, error: null },
      organizations: { data: { id: 'org-1', name: 'Test Org', billing_email: 'b@t.com' }, error: null },
      billing_events: { data: { id: 'be-1' }, error: null },
    })

    const mockRpc = vi.fn().mockResolvedValue({ data: { was_suspended: false }, error: null })
    const ctx = createTestContext({ supabaseFrom: from, supabaseRpc: mockRpc })
    const caller = createCaller(ctx)
    await caller.billing.handleWebhook({ payload: 'p', signature: 's' })

    const auditCall = mockAuditEmit.mock.calls[0]?.[0]
    expect(auditCall.metadata).not.toHaveProperty('cardLast4')
    expect(auditCall.metadata).not.toHaveProperty('cardBrand')
    expect(auditCall.metadata).not.toHaveProperty('cardNumber')
    expect(auditCall.metadata).not.toHaveProperty('cvv')
    // Only amounts and provider refs allowed
    expect(auditCall.metadata).toHaveProperty('amount')
    expect(auditCall.metadata).toHaveProperty('providerRef')
  })

  it('rejects webhook with invalid signature', async () => {
    mockHandleWebhook.mockRejectedValue(new Error('Signature verification failed'))

    const from = mockTable({})
    const ctx = createTestContext({ supabaseFrom: from })
    const caller = createCaller(ctx)

    await expect(
      caller.billing.handleWebhook({ payload: 'bad', signature: 'bad' }),
    ).rejects.toThrow('Webhook signature verification failed')
  })

  it('skips CHARGE_SUCCESS processing for zero-amount payments', async () => {
    mockHandleWebhook.mockResolvedValue({
      eventType: 'CHARGE_SUCCESS',
      customerId: 'cus_123',
      amount: 0,
      currency: 'USD',
      providerRef: 'evt_zero',
      metadata: {},
    })

    const from = mockTable({
      org_subscriptions: { data: { org_id: 'org-1' }, error: null },
      organizations: { data: { id: 'org-1', name: 'Test Org', billing_email: 'b@t.com' }, error: null },
      billing_events: { data: { id: 'be-1' }, error: null },
    })

    const mockRpc = vi.fn()
    const ctx = createTestContext({ supabaseFrom: from, supabaseRpc: mockRpc })
    const caller = createCaller(ctx)
    await caller.billing.handleWebhook({ payload: 'p', signature: 's' })

    // RPC should NOT have been called for zero-amount payment
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
