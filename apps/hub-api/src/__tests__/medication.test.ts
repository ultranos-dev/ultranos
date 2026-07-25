import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import crypto from 'crypto'

// Mock the Supabase client before importing the router
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

const mockSupabaseClient = {
  from: vi.fn(),
}

// Must import after mock setup
const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  user?: { sub: string; role: string; sessionId: string } | null
}) {
  const supabase = {
    from: overrides?.supabaseFrom ?? vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'abc123' }], error: null }),
  }
  return {
    supabase: supabase as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// Valid UUIDs for test inputs
const RX_UUID_1 = '00000000-0000-4000-8000-000000000001'
const RX_UUID_2 = '00000000-0000-4000-8000-000000000002'
const RX_UUID_3 = '00000000-0000-4000-8000-000000000003'
const RX_UUID_4 = '00000000-0000-4000-8000-000000000004'
const RX_UUID_BAD = '00000000-0000-4000-8000-ffffffffffff'

const TEST_USER = { sub: 'pharmacist-001', role: 'PHARMACIST', sessionId: 'sess-1', orgId: 'org-test-001' }

// Ed25519 key pair for signed bundle tests (Story 21.2)
let testKeyPair: crypto.KeyPairKeyObjectResult
let publicKeyBase64: string

beforeAll(() => {
  testKeyPair = crypto.generateKeyPairSync('ed25519')
  publicKeyBase64 = testKeyPair.publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64')
})

function signPayload(payload: string): string {
  return crypto.sign(null, Buffer.from(payload), testKeyPair.privateKey).toString('base64')
}

function makeSignedBundle(data: Record<string, unknown>) {
  const payloadStr = JSON.stringify(data)
  return { payload: payloadStr, sig: signPayload(payloadStr), pub: publicKeyBase64 }
}

function mockOrganizationsTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { status: 'TRIAL' }, error: null }),
      }),
    }),
  }
}

function entitlementMock() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'sub-1', status: 'ACTIVE' },
              error: null,
            }),
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

function krlMock() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { revoked_at: null }, error: null }),
      }),
    }),
  }
}

function createGetStatusMockFrom(rxResult: { data: any; error: any }) {
  return vi.fn().mockImplementation((table: string) => {
    if (table === 'organizations') return mockOrganizationsTable()
    if (table === 'org_subscriptions') return entitlementMock()
    if (table === 'audit_log') return auditLogMock()
    if (table === 'practitioner_keys') return krlMock()
    if (table === 'medication_requests') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(rxResult),
          }),
        }),
      }
    }
    return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
  })
}

describe('medication.getStatus', () => {
  it('returns AVAILABLE for an active prescription (signed bundle)', async () => {
    const signedBundle = makeSignedBundle({ prescriptionId: RX_UUID_1 })
    const mockFrom = createGetStatusMockFrom({
      data: {
        id: RX_UUID_1,
        prescription_status: 'ACTIVE',
        status: 'active',
        medication_display: 'Amoxicillin 500mg',
        authored_on: '2026-04-20T10:00:00Z',
        dispensed_at: null,
      },
      error: null,
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.getStatus({ signedBundle })

    expect(result.status).toBe('AVAILABLE')
    expect(result.prescriptionId).toBe(RX_UUID_1)
    expect(result.medicationDisplay).toBe('Amoxicillin 500mg')
  })

  it('returns FULFILLED for a completed/dispensed prescription (signed bundle)', async () => {
    const signedBundle = makeSignedBundle({ prescriptionId: RX_UUID_2 })
    const mockFrom = createGetStatusMockFrom({
      data: {
        id: RX_UUID_2,
        prescription_status: 'DISPENSED',
        status: 'completed',
        medication_display: 'Ibuprofen 400mg',
        authored_on: '2026-04-18T10:00:00Z',
        dispensed_at: '2026-04-19T14:00:00Z',
      },
      error: null,
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.getStatus({ signedBundle })

    expect(result.status).toBe('FULFILLED')
  })

  it('returns VOIDED for a cancelled prescription (signed bundle)', async () => {
    const signedBundle = makeSignedBundle({ prescriptionId: RX_UUID_3 })
    const mockFrom = createGetStatusMockFrom({
      data: {
        id: RX_UUID_3,
        prescription_status: 'CANCELLED',
        status: 'cancelled',
        medication_display: 'Metformin 850mg',
        authored_on: '2026-04-17T10:00:00Z',
        dispensed_at: null,
      },
      error: null,
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.getStatus({ signedBundle })

    expect(result.status).toBe('VOIDED')
  })

  it('throws NOT_FOUND when prescription does not exist (signed bundle)', async () => {
    const signedBundle = makeSignedBundle({ prescriptionId: RX_UUID_BAD })
    const mockFrom = createGetStatusMockFrom({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.getStatus({ signedBundle }),
    ).rejects.toThrow('Prescription not found')
  })

  it('throws INTERNAL_SERVER_ERROR on database failure (signed bundle)', async () => {
    const signedBundle = makeSignedBundle({ prescriptionId: RX_UUID_1 })
    const mockFrom = createGetStatusMockFrom({
      data: null,
      error: { code: 'PGRST500', message: 'db error' },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.getStatus({ signedBundle }),
    ).rejects.toThrow('Prescription status check failed')
  })

  it('supports lookup by qrCodeId (signed bundle)', async () => {
    const signedBundle = makeSignedBundle({ qrCodeId: 'qr-abc-123' })
    const mockEq = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: RX_UUID_4,
          prescription_status: 'ACTIVE',
          status: 'active',
          medication_display: 'Aspirin 100mg',
          authored_on: '2026-04-20T10:00:00Z',
          dispensed_at: null,
        },
        error: null,
      }),
    })
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      if (table === 'audit_log') return auditLogMock()
      if (table === 'practitioner_keys') return krlMock()
      if (table === 'medication_requests') {
        return { select: vi.fn().mockReturnValue({ eq: mockEq }) }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.getStatus({ signedBundle })

    expect(result.status).toBe('AVAILABLE')
    expect(mockEq).toHaveBeenCalledWith('qr_code_id', 'qr-abc-123')
  })

  it('rejects when no input provided', async () => {
    const ctx = createTestContext({ user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.getStatus({} as never),
    ).rejects.toThrow()
  })

  it('requires authentication (protectedProcedure)', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.getStatus({ prescriptionId: RX_UUID_1 }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('rejects unsigned lookup with raw prescriptionId (Story 21.2)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockFrom = createGetStatusMockFrom({ data: null, error: null })
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.getStatus({ prescriptionId: RX_UUID_1 }),
    ).rejects.toThrow('UNSIGNED_LOOKUP_REJECTED')
    warnSpy.mockRestore()
  })
})

describe('medication.complete', () => {
  it('marks an active prescription as completed/dispensed', async () => {
    const mockEq = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: RX_UUID_1,
          prescription_status: 'ACTIVE',
          status: 'active',
          interaction_check: 'CLEAR',
          subject_reference: 'Patient/pat-001',
        },
        error: null,
      }),
    })
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: RX_UUID_1,
                prescription_status: 'DISPENSED',
                status: 'completed',
                dispensed_at: '2026-04-29T12:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      callCount.n++
      if (callCount.n === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: mockEq,
          }),
        }
      }
      return { update: mockUpdate }
    })

    const ctx = createTestContext({
      supabaseFrom: mockFrom,
      user: TEST_USER,
    })
    const caller = createCaller(ctx)

    const result = await caller.medication.complete({
      prescriptionId: RX_UUID_1,
    })

    expect(result.success).toBe(true)
    expect(result.previousStatus).toBe('AVAILABLE')
    expect(result.newStatus).toBe('FULFILLED')
  })

  it('rejects completing an already-fulfilled prescription', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: RX_UUID_2,
                prescription_status: 'DISPENSED',
                status: 'completed',
                interaction_check: 'CLEAR',
              },
              error: null,
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({
      supabaseFrom: mockFrom,
      user: TEST_USER,
    })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.complete({ prescriptionId: RX_UUID_2 }),
    ).rejects.toThrow('Prescription cannot be fulfilled')
  })

  it('rejects dispensing when interaction_check is BLOCKED', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: RX_UUID_1,
                prescription_status: 'ACTIVE',
                status: 'active',
                interaction_check: 'BLOCKED',
              },
              error: null,
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({
      supabaseFrom: mockFrom,
      user: TEST_USER,
    })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.complete({ prescriptionId: RX_UUID_1 }),
    ).rejects.toThrow('blocked drug interaction')
  })

  it('rejects dispensing when interaction_check is UNAVAILABLE', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: RX_UUID_1,
                prescription_status: 'ACTIVE',
                status: 'active',
                interaction_check: 'UNAVAILABLE',
              },
              error: null,
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({
      supabaseFrom: mockFrom,
      user: TEST_USER,
    })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.complete({ prescriptionId: RX_UUID_1 }),
    ).rejects.toThrow('interaction check was unavailable')
  })

  it('requires authentication (protectedProcedure)', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.complete({ prescriptionId: RX_UUID_1 }),
    ).rejects.toThrow('UNAUTHORIZED')
  })
})

describe('medication.recordDispense', () => {
  const DISPENSE_UUID = '00000000-0000-4000-8000-000000000010'
  const EXISTING_DISPENSE_UUID = '00000000-0000-4000-8000-000000000099'
  const HLC_TS = '000001714400000:00000:node-abc'

  const validInput = {
    dispenseId: DISPENSE_UUID,
    prescriptionId: RX_UUID_1,
    medicationCode: 'AMX500',
    medicationDisplay: 'Amoxicillin 500mg Capsule',
    patientRef: 'Patient/pat-001',
    pharmacistRef: 'Practitioner/pharmacist-001',
    whenHandedOver: '2026-04-29T12:00:00Z',
    hlcTimestamp: HLC_TS,
    status: 'completed' as const,
  }

  // Standard active-rx data for reuse
  const ACTIVE_RX = {
    id: RX_UUID_1,
    prescription_status: 'ACTIVE',
    status: 'active',
    hlc_timestamp: null,
  }

  // Consent mock: returns active consent so middleware passes
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

  // Audit log mock (AuditLogger uses from('audit_log') internally)
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

  // Generic passthrough for tables we don't need to assert on
  function passthrough() {
    const handler: any = {}
    const proxy = new Proxy(handler, {
      get: (_target, prop) => {
        if (prop === 'then') return undefined // prevent Promise detection
        return vi.fn().mockImplementation(() => proxy)
      },
    })
    // Terminal async methods
    ;(proxy as any).single = vi.fn().mockResolvedValue({ data: null, error: null })
    ;(proxy as any).limit = vi.fn().mockResolvedValue({ data: [], error: null })
    return proxy
  }

  /**
   * Table-name dispatch mock factory.
   * Handles consent middleware, audit logger, and mutation-specific tables.
   */
  function createDispenseMockFrom(opts: {
    rxLookupData?: { data: any; error: any }
    idempotencyData?: any[]
    dispenseInsertResult?: { data: any; error: any }
    rxUpdateResult?: { data: any; error: any }
  }) {
    const rxCallCount = { n: 0 }
    const dispenseCallCount = { n: 0 }

    return vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      if (table === 'consents') return consentMock()
      if (table === 'audit_log') return auditLogMock()

      if (table === 'medication_requests') {
        rxCallCount.n++
        if (rxCallCount.n === 1) {
          // Prescription lookup (step 1)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(opts.rxLookupData ?? { data: ACTIVE_RX, error: null }),
              }),
            }),
          }
        }
        // Rx status update (step 4)
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue(opts.rxUpdateResult ?? { data: null, error: null }),
                }),
              }),
            }),
          }),
        }
      }

      if (table === 'medication_dispenses') {
        dispenseCallCount.n++
        if (dispenseCallCount.n === 1) {
          // Idempotency check (step 2)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: opts.idempotencyData ?? [], error: null }),
                }),
              }),
            }),
          }
        }
        // Dispense insert (step 3)
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(opts.dispenseInsertResult ?? { data: { id: DISPENSE_UUID }, error: null }),
            }),
          }),
        }
      }

      // Anything else (medication_statements, medication_request_sync, dispense_conflicts, etc.)
      return passthrough()
    })
  }

  it('creates a medication_dispense record and updates medication_request status to completed', async () => {
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: ACTIVE_RX, error: null },
      idempotencyData: [],
      dispenseInsertResult: { data: { id: DISPENSE_UUID }, error: null },
      rxUpdateResult: {
        data: { id: RX_UUID_1, prescription_status: 'DISPENSED', status: 'completed', dispensed_at: '2026-04-29T12:00:00Z' },
        error: null,
      },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.recordDispense(validInput)

    expect(result.success).toBe(true)
    expect(result.dispenseId).toBe(DISPENSE_UUID)
    expect(result.prescriptionStatus).toBe('completed')
    expect(mockFrom).toHaveBeenCalledWith('medication_dispenses')
    expect(mockFrom).toHaveBeenCalledWith('medication_requests')
  })

  it('returns partial status when status input is in-progress', async () => {
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: ACTIVE_RX, error: null },
      idempotencyData: [],
      dispenseInsertResult: { data: { id: DISPENSE_UUID }, error: null },
      rxUpdateResult: {
        data: { id: RX_UUID_1, prescription_status: 'PARTIALLY_DISPENSED', status: 'active', dispensed_at: null },
        error: null,
      },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.recordDispense({
      ...validInput,
      status: 'in-progress',
    })

    expect(result.success).toBe(true)
    expect(result.prescriptionStatus).toBe('partial')
  })

  it('rejects with NOT_FOUND when prescription does not exist, and no dispense row is created', async () => {
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: null, error: { code: 'PGRST116', message: 'not found' } },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(validInput),
    ).rejects.toThrow('Prescription not found')

    // Verify no medication_dispenses call was made (orphan prevention)
    const fromCalls = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(fromCalls).not.toContain('medication_dispenses')
  })

  it('rejects with PRECONDITION_FAILED when prescription status is CANCELLED', async () => {
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: { ...ACTIVE_RX, prescription_status: 'CANCELLED' }, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(validInput),
    ).rejects.toThrow('Prescription is no longer active')
  })

  it('rejects with PRECONDITION_FAILED when prescription status is EXPIRED', async () => {
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: { ...ACTIVE_RX, prescription_status: 'EXPIRED' }, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(validInput),
    ).rejects.toThrow('Prescription is no longer active')
  })

  it('rejects with CONFLICT / ALREADY_DISPENSED when a completed dispense already exists', async () => {
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: ACTIVE_RX, error: null },
      idempotencyData: [{ id: EXISTING_DISPENSE_UUID }],
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(validInput),
    ).rejects.toThrow('Prescription has already been dispensed')
  })

  it('succeeds when an in-progress dispense exists (partial re-attempt allowed)', async () => {
    // The idempotency check only queries status='completed', so in-progress is not returned
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: ACTIVE_RX, error: null },
      idempotencyData: [], // in-progress dispenses are NOT returned by the completed-only query
      dispenseInsertResult: { data: { id: DISPENSE_UUID }, error: null },
      rxUpdateResult: {
        data: { id: RX_UUID_1, prescription_status: 'DISPENSED', status: 'completed', dispensed_at: '2026-04-29T12:00:00Z' },
        error: null,
      },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.recordDispense(validInput)

    expect(result.success).toBe(true)
    expect(result.dispenseId).toBe(DISPENSE_UUID)
  })

  it('emits DUPLICATE_DISPENSE_ATTEMPT audit event when duplicate detected', async () => {
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: ACTIVE_RX, error: null },
      idempotencyData: [{ id: EXISTING_DISPENSE_UUID }],
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(validInput),
    ).rejects.toThrow('Prescription has already been dispensed')

    // Verify audit was called (AuditLogger uses rpc('audit_emit_with_lock', ...) not from('audit_log'))
    expect(ctx.supabase.rpc).toHaveBeenCalled()
  })

  it('throws INTERNAL_SERVER_ERROR when dispense insert fails', async () => {
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: ACTIVE_RX, error: null },
      idempotencyData: [],
      dispenseInsertResult: { data: null, error: { code: 'PGRST500', message: 'insert failed' } },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(validInput),
    ).rejects.toThrow('Failed to record dispense event')
  })

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(validInput),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('validates dispenseId is a UUID', async () => {
    const ctx = createTestContext({ user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense({ ...validInput, dispenseId: 'not-uuid' }),
    ).rejects.toThrow()
  })

  it('emits audit log entry for successful dispense sync', async () => {
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: ACTIVE_RX, error: null },
      idempotencyData: [],
      dispenseInsertResult: { data: { id: DISPENSE_UUID }, error: null },
      rxUpdateResult: {
        data: { id: RX_UUID_1, prescription_status: 'DISPENSED', status: 'completed', dispensed_at: '2026-04-29T12:00:00Z' },
        error: null,
      },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await caller.medication.recordDispense(validInput)

    // Audit logger uses rpc('audit_emit_with_lock', ...) not from('audit_log')
    expect(ctx.supabase.rpc).toHaveBeenCalled()
  })

  it('ignores dispense with older HLC when prescription already completed (AC 5)', async () => {
    const existingHlc = '000001714500000:00000:node-xyz' // newer
    const incomingHlc = '000001714400000:00000:node-abc' // older

    const baseMockFrom = createDispenseMockFrom({
      rxLookupData: {
        data: { id: RX_UUID_1, prescription_status: 'DISPENSED', status: 'completed', hlc_timestamp: existingHlc },
        error: null,
      },
      idempotencyData: [],
      dispenseInsertResult: { data: { id: DISPENSE_UUID }, error: null },
    })

    // Override to handle dispense_conflicts table explicitly
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'dispense_conflicts') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'conflict-1' }, error: null }),
            }),
          }),
        }
      }
      return baseMockFrom(table)
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.recordDispense({
      ...validInput,
      hlcTimestamp: incomingHlc,
    })

    expect(result.success).toBe(true)
    expect(result.conflictDetected).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('dispense_conflicts')
  })

  it('proceeds normally when no existing completed status (no conflict)', async () => {
    const mockFrom = createDispenseMockFrom({
      rxLookupData: { data: ACTIVE_RX, error: null },
      idempotencyData: [],
      dispenseInsertResult: { data: { id: DISPENSE_UUID }, error: null },
      rxUpdateResult: {
        data: { id: RX_UUID_1, prescription_status: 'DISPENSED', status: 'completed', dispensed_at: '2026-04-29T12:00:00Z' },
        error: null,
      },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.recordDispense(validInput)

    expect(result.success).toBe(true)
    expect(result.conflictDetected).toBe(false)
    expect(result.prescriptionStatus).toBe('completed')
  })
})
