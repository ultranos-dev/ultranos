import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Supabase client before importing the router
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
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
