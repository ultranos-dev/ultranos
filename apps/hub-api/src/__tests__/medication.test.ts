import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const TEST_USER = { sub: 'pharmacist-001', role: 'PHARMACIST', sessionId: 'sess-1' }

describe('medication.getStatus', () => {
  it('returns AVAILABLE for an active prescription', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: RX_UUID_1,
              prescription_status: 'ACTIVE',
              status: 'active',
              medication_display: 'Amoxicillin 500mg',
              authored_on: '2026-04-20T10:00:00Z',
              dispensed_at: null,
            },
            error: null,
          }),
        }),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.getStatus({
      prescriptionId: RX_UUID_1,
    })

    expect(result.status).toBe('AVAILABLE')
    expect(result.prescriptionId).toBe(RX_UUID_1)
    expect(result.medicationDisplay).toBe('Amoxicillin 500mg')
  })

  it('returns FULFILLED for a completed/dispensed prescription', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: RX_UUID_2,
              prescription_status: 'DISPENSED',
              status: 'completed',
              medication_display: 'Ibuprofen 400mg',
              authored_on: '2026-04-18T10:00:00Z',
              dispensed_at: '2026-04-19T14:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.getStatus({
      prescriptionId: RX_UUID_2,
    })

    expect(result.status).toBe('FULFILLED')
  })

  it('returns VOIDED for a cancelled prescription', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: RX_UUID_3,
              prescription_status: 'CANCELLED',
              status: 'cancelled',
              medication_display: 'Metformin 850mg',
              authored_on: '2026-04-17T10:00:00Z',
              dispensed_at: null,
            },
            error: null,
          }),
        }),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.getStatus({
      prescriptionId: RX_UUID_3,
    })

    expect(result.status).toBe('VOIDED')
  })

  it('throws NOT_FOUND when prescription does not exist', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'not found' },
          }),
        }),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.getStatus({ prescriptionId: RX_UUID_BAD }),
    ).rejects.toThrow('Prescription not found')
  })

  it('throws INTERNAL_SERVER_ERROR on database failure', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST500', message: 'db error' },
          }),
        }),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.getStatus({ prescriptionId: RX_UUID_1 }),
    ).rejects.toThrow('Prescription status check failed')
  })

  it('supports lookup by qrCodeId', async () => {
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
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq,
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.getStatus({
      qrCodeId: 'qr-abc-123',
    })

    expect(result.status).toBe('AVAILABLE')
    expect(mockEq).toHaveBeenCalledWith('qr_code_id', 'qr-abc-123')
  })

  it('rejects when neither prescriptionId nor qrCodeId provided', async () => {
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

  it('rejects invalid UUID for prescriptionId', async () => {
    const ctx = createTestContext({ user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.getStatus({ prescriptionId: 'not-a-uuid' }),
    ).rejects.toThrow()
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
    const mockFrom = vi.fn().mockImplementation(() => {
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
    const mockFrom = vi.fn().mockReturnValue({
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
    const mockFrom = vi.fn().mockReturnValue({
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
    const mockFrom = vi.fn().mockReturnValue({
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

  it('creates a medication_dispense record and updates medication_request status to completed', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: DISPENSE_UUID },
          error: null,
        }),
      }),
    })
    // HLC check: prescription is ACTIVE, no conflict
    const hlcCheckMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: RX_UUID_1,
            prescription_status: 'ACTIVE',
            status: 'active',
            hlc_timestamp: null,
          },
          error: null,
        }),
      }),
    })
    // Update with double .eq() guard (id + prescription_status)
    const updateMock = vi.fn().mockReturnValue({
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
    const auditMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { insert: insertMock }
      if (callCount.n === 2) return { select: hlcCheckMock }
      if (callCount.n === 3) return { update: updateMock }
      return { insert: auditMock }
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
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: DISPENSE_UUID },
          error: null,
        }),
      }),
    })
    const hlcCheckMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: RX_UUID_1,
            prescription_status: 'ACTIVE',
            status: 'active',
            hlc_timestamp: null,
          },
          error: null,
        }),
      }),
    })
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: RX_UUID_1,
                prescription_status: 'PARTIALLY_DISPENSED',
                status: 'active',
                dispensed_at: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    })
    const auditMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { insert: insertMock }
      if (callCount.n === 2) return { select: hlcCheckMock }
      if (callCount.n === 3) return { update: updateMock }
      return { insert: auditMock }
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

  it('throws INTERNAL_SERVER_ERROR when dispense insert fails', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST500', message: 'insert failed' },
        }),
      }),
    })

    const mockFrom = vi.fn().mockReturnValue({ insert: insertMock })

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

  it('emits audit log entry for dispense sync', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: DISPENSE_UUID },
          error: null,
        }),
      }),
    })
    const hlcCheckMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: RX_UUID_1,
            prescription_status: 'ACTIVE',
            status: 'active',
            hlc_timestamp: null,
          },
          error: null,
        }),
      }),
    })
    const updateMock = vi.fn().mockReturnValue({
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
    const auditInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'audit-001' },
          error: null,
        }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { insert: insertMock }
      if (callCount.n === 2) return { select: hlcCheckMock }
      if (callCount.n === 3) return { update: updateMock }
      return { insert: auditInsertMock }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await caller.medication.recordDispense(validInput)

    // Fourth call should be to medication_request_sync audit table
    expect(mockFrom).toHaveBeenCalledWith('medication_request_sync')
  })

  it('ignores dispense with older HLC when prescription already completed (AC 5)', async () => {
    // Simulate: a dispense arrives but the medication_request is already DISPENSED
    // with a newer HLC timestamp
    const existingHlc = '000001714500000:00000:node-xyz' // newer
    const incomingHlc = '000001714400000:00000:node-abc' // older

    // First call: insert into medication_dispenses succeeds
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: DISPENSE_UUID },
          error: null,
        }),
      }),
    })

    // Before update, we check current state — already DISPENSED with newer HLC
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: RX_UUID_1,
            prescription_status: 'DISPENSED',
            status: 'completed',
            hlc_timestamp: existingHlc,
          },
          error: null,
        }),
      }),
    })

    // Conflict log insert
    const conflictInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'conflict-1' },
          error: null,
        }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { insert: insertMock }
      if (callCount.n === 2) return { select: selectMock }
      return { insert: conflictInsertMock }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.recordDispense({
      ...validInput,
      hlcTimestamp: incomingHlc,
    })

    expect(result.success).toBe(true)
    expect(result.conflictDetected).toBe(true)
    // medication_requests should NOT have been updated (no update call)
    expect(mockFrom).toHaveBeenCalledWith('dispense_conflicts')
  })

  it('proceeds normally when no existing completed status (no conflict)', async () => {
    const incomingHlc = '000001714400000:00000:node-abc'

    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: DISPENSE_UUID },
          error: null,
        }),
      }),
    })

    // Check: prescription is ACTIVE (not yet dispensed)
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: RX_UUID_1,
            prescription_status: 'ACTIVE',
            status: 'active',
            hlc_timestamp: null,
          },
          error: null,
        }),
      }),
    })

    const updateMock = vi.fn().mockReturnValue({
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

    const auditMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { insert: insertMock }
      if (callCount.n === 2) return { select: selectMock }
      if (callCount.n === 3) return { update: updateMock }
      return { insert: auditMock }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.recordDispense({
      ...validInput,
      hlcTimestamp: incomingHlc,
    })

    expect(result.success).toBe(true)
    expect(result.conflictDetected).toBe(false)
    expect(result.prescriptionStatus).toBe('completed')
  })
})
