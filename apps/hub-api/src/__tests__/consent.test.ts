import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

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

const TEST_USER = { sub: 'patient-001', role: 'PATIENT', sessionId: 'sess-1' }

const CONSENT_UUID = '00000000-0000-4000-8000-000000000010'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('consent.sync', () => {
  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(
      caller.consent.sync({
        id: CONSENT_UUID,
        status: 'ACTIVE',
        category: ['PRESCRIPTIONS'],
        patientRef: 'Patient/patient-001',
        dateTime: '2026-04-28T10:00:00Z',
        provisionStart: '2026-04-28T10:00:00Z',
        grantorId: 'patient-001',
        grantorRole: 'SELF',
        purpose: 'TREATMENT',
        consentVersion: '1.0',
        auditHash: 'abc123',
        hlcTimestamp: '000001714400000:00001:node-1',
      }),
    ).rejects.toThrow()
  })

  it('inserts a consent record successfully', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: CONSENT_UUID },
            error: null,
          }),
        }),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.consent.sync({
      id: CONSENT_UUID,
      status: 'ACTIVE',
      category: ['PRESCRIPTIONS'],
      patientRef: 'Patient/patient-001',
      dateTime: '2026-04-28T10:00:00Z',
      provisionStart: '2026-04-28T10:00:00Z',
      grantorId: 'patient-001',
      grantorRole: 'SELF',
      purpose: 'TREATMENT',
      consentVersion: '1.0',
      auditHash: 'abc123',
      hlcTimestamp: '000001714400000:00001:node-1',
    })

    expect(result.success).toBe(true)
    expect(result.consentId).toBe(CONSENT_UUID)
    expect(result.alreadySynced).toBe(false)
  })

  it('handles duplicate sync idempotently', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'duplicate key' },
          }),
        }),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.consent.sync({
      id: CONSENT_UUID,
      status: 'ACTIVE',
      category: ['PRESCRIPTIONS'],
      patientRef: 'Patient/patient-001',
      dateTime: '2026-04-28T10:00:00Z',
      provisionStart: '2026-04-28T10:00:00Z',
      grantorId: 'patient-001',
      grantorRole: 'SELF',
      purpose: 'TREATMENT',
      consentVersion: '1.0',
      auditHash: 'abc123',
      hlcTimestamp: '000001714400000:00001:node-1',
    })

    expect(result.success).toBe(true)
    expect(result.alreadySynced).toBe(true)
  })

  it('throws on database errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockFrom = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'UNKNOWN', message: 'DB error' },
          }),
        }),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.consent.sync({
        id: CONSENT_UUID,
        status: 'ACTIVE',
        category: ['PRESCRIPTIONS'],
        patientRef: 'Patient/patient-001',
        dateTime: '2026-04-28T10:00:00Z',
        provisionStart: '2026-04-28T10:00:00Z',
        grantorId: 'patient-001',
        grantorRole: 'SELF',
        purpose: 'TREATMENT',
        consentVersion: '1.0',
        auditHash: 'abc123',
        hlcTimestamp: '000001714400000:00001:node-1',
      }),
    ).rejects.toThrow('Failed to sync consent record')

    consoleSpy.mockRestore()
  })
})

describe('consent.check', () => {
  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(
      caller.consent.check({
        patientId: 'patient-001',
        resourceType: 'MedicationRequest',
      }),
    ).rejects.toThrow()
  })

  it('returns permitted=true when active consent exists', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'c1', status: 'ACTIVE', category: ['PRESCRIPTIONS'] }],
              error: null,
            }),
          }),
        })),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.consent.check({
      patientId: 'patient-001',
      resourceType: 'MedicationRequest',
    })

    expect(result.permitted).toBe(true)
  })

  it('returns permitted=false when no consent exists', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        })),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_USER })
    const caller = createCaller(ctx)

    const result = await caller.consent.check({
      patientId: 'patient-001',
      resourceType: 'MedicationRequest',
    })

    expect(result.permitted).toBe(false)
  })
})
