import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn().mockResolvedValue({}),
}))
let capturedInsertArgs: any[] = []

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

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockEmit,
  })),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')
const createCaller = createCallerFactory(appRouter)

const RX_UUID = '00000000-0000-4000-8000-000000000001'
const DISPENSE_UUID = '00000000-0000-4000-8000-000000000010'
const HLC_TS = '000001714400000:00000:node-abc'
const TEST_USER = { sub: 'pharmacist-001', role: 'PHARMACIST', sessionId: 'sess-1', orgId: 'org-test-001' }

const ACTIVE_RX = {
  id: RX_UUID,
  prescription_status: 'ACTIVE',
  status: 'active',
  hlc_timestamp: null,
}

function consentMock() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'consent-1', status: 'ACTIVE', category: ['PRESCRIPTIONS', 'FULL_RECORD'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
          error: null,
        }),
      }),
    }),
  }
}

function auditLogMock() {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
}

function passthrough() {
  const handler: any = {}
  const proxy = new Proxy(handler, {
    get: (_target, prop) => {
      if (prop === 'then') return undefined
      return vi.fn().mockImplementation(() => proxy)
    },
  })
  ;(proxy as any).single = vi.fn().mockResolvedValue({ data: null, error: null })
  ;(proxy as any).limit = vi.fn().mockResolvedValue({ data: [], error: null })
  return proxy
}

function createDispenseMockFrom() {
  const rxCallCount = { n: 0 }
  const dispenseCallCount = { n: 0 }
  capturedInsertArgs = []

  return vi.fn().mockImplementation((table: string) => {
    if (table === 'organizations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { status: 'ACTIVE', id: 'org-test-001', cancelled_at: null },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'org_subscriptions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'sub-1', status: 'ACTIVE' }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'consents') return consentMock()
    if (table === 'audit_log') return auditLogMock()

    if (table === 'medication_requests') {
      rxCallCount.n++
      if (rxCallCount.n === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: ACTIVE_RX, error: null }),
            }),
          }),
        }
      }
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: RX_UUID, prescription_status: 'DISPENSED', status: 'completed', dispensed_at: '2026-04-29T12:00:00Z' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'medication_dispenses') {
      dispenseCallCount.n++
      if (dispenseCallCount.n === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }
      }
      // Capture the insert args to verify pharmacist_ref
      const insertFn = vi.fn().mockImplementation((row: any) => {
        capturedInsertArgs.push(row)
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: DISPENSE_UUID }, error: null }),
          }),
        }
      })
      return { insert: insertFn }
    }

    return passthrough()
  })
}

const validInput = {
  dispenseId: DISPENSE_UUID,
  prescriptionId: RX_UUID,
  medicationCode: 'AMX500',
  medicationDisplay: 'Amoxicillin 500mg Capsule',
  patientRef: 'Patient/pat-001',
  pharmacistRef: 'Practitioner/pharmacist-001',
  whenHandedOver: '2026-04-29T12:00:00Z',
  hlcTimestamp: HLC_TS,
  status: 'completed' as const,
}

beforeEach(() => {
  mockEmit.mockClear()
  capturedInsertArgs = []
})

describe('medication.recordDispense — pharmacist identity trust (Story 21.3)', () => {
  it('uses server-verified ctx.user.sub for pharmacist_ref, ignoring client-supplied value', async () => {
    const mockFrom = createDispenseMockFrom()
    const ctx = {
      supabase: { from: mockFrom } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    // Client sends matching pharmacistRef — should still use server value
    await caller.medication.recordDispense(validInput)

    expect(capturedInsertArgs.length).toBeGreaterThan(0)
    expect(capturedInsertArgs[0].pharmacist_ref).toBe('Practitioner/pharmacist-001')
  })

  it('overrides mismatched pharmacistRef with ctx.user.sub', async () => {
    const mockFrom = createDispenseMockFrom()
    const ctx = {
      supabase: { from: mockFrom } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    // Client sends a DIFFERENT pharmacistRef (potential spoofing)
    await caller.medication.recordDispense({
      ...validInput,
      pharmacistRef: 'Practitioner/some-other-pharmacist',
    })

    expect(capturedInsertArgs.length).toBeGreaterThan(0)
    // The DB row should contain the server-verified identity, not the spoofed one
    expect(capturedInsertArgs[0].pharmacist_ref).toBe('Practitioner/pharmacist-001')
  })

  it('emits SECURITY_VIOLATION audit when pharmacistRef does not match authenticated user', async () => {
    const mockFrom = createDispenseMockFrom()
    const ctx = {
      supabase: { from: mockFrom } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    await caller.medication.recordDispense({
      ...validInput,
      pharmacistRef: 'Practitioner/spoofed-pharmacist',
    })

    const securityCalls = mockEmit.mock.calls.filter(
      (call) => call[0]?.action === 'SECURITY_VIOLATION',
    )
    expect(securityCalls).toHaveLength(1)
    expect(securityCalls[0][0]).toMatchObject({
      action: 'SECURITY_VIOLATION',
      resourceType: 'MEDICATION_DISPENSE',
      resourceId: DISPENSE_UUID,
      actorId: 'pharmacist-001',
      metadata: expect.objectContaining({
        reason: 'pharmacist_ref_overridden',
        clientSupplied: 'Practiti...',
      }),
    })
  })

  it('does NOT emit SECURITY_VIOLATION when pharmacistRef matches authenticated user', async () => {
    const mockFrom = createDispenseMockFrom()
    const ctx = {
      supabase: { from: mockFrom } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    await caller.medication.recordDispense(validInput) // matching pharmacistRef

    const securityCalls = mockEmit.mock.calls.filter(
      (call) => call[0]?.action === 'SECURITY_VIOLATION',
    )
    expect(securityCalls).toHaveLength(0)
  })

  it('still succeeds even if audit emit throws on mismatch', async () => {
    mockEmit.mockRejectedValueOnce(new Error('Audit DB down'))

    const mockFrom = createDispenseMockFrom()
    const ctx = {
      supabase: { from: mockFrom } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    const result = await caller.medication.recordDispense({
      ...validInput,
      pharmacistRef: 'Practitioner/spoofed-pharmacist',
    })

    // Dispense should still succeed — audit failure must not block operation
    expect(result.success).toBe(true)
  })
})
