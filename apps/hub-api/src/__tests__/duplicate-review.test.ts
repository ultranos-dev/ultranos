import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

// Mock MPI modules (needed by other routers loaded via _app)
vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return { ...actual, computeMpiResult: vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] }) }
})
vi.mock('@/lib/mpi-candidate-query', () => ({ fetchMpiCandidates: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken: vi.fn().mockResolvedValue('t'),
  verifyProceedToken: vi.fn().mockResolvedValue({ jti: 'j', candidateIds: [], maxScore: 0, issuedTo: 'doctor-001', exp: 9999999999 }),
  consumeProceedToken: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/async-mpi-scoring', () => ({ runAsyncMpiScoring: vi.fn().mockResolvedValue(undefined) }))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const TEST_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1' }
const REVIEW_UUID = '66666666-6666-6666-6666-666666666666'
const PATIENT_UUID = '77777777-7777-7777-7777-777777777777'

function createMockFrom() {
  return vi.fn()
}

function createTestContext(mockFrom: ReturnType<typeof vi.fn>) {
  return {
    supabase: { from: mockFrom } as never,
    user: TEST_USER,
    headers: new Headers(),
  }
}

describe('duplicateReview.pendingCount', () => {
  const createCaller = createCallerFactory(appRouter)

  it('returns count of PENDING reviews', async () => {
    const mockFrom = createMockFrom()
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          count: 5,
          error: null,
        }),
      }),
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.duplicateReview.pendingCount()

    expect(result).toHaveProperty('count')
  })
})

describe('duplicateReview.dismiss', () => {
  const createCaller = createCallerFactory(appRouter)

  it('sets status to DISMISSED and clears mpi_warn', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'duplicate_reviews') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'patients') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      return {}
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.duplicateReview.dismiss({
      reviewId: REVIEW_UUID,
      patientId: PATIENT_UUID,
    })

    expect(result).toHaveProperty('success', true)
    // Should have updated both tables
    const tables = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(tables).toContain('duplicate_reviews')
    expect(tables).toContain('patients')
  })

  it('emits audit event', async () => {
    const mockFrom = vi.fn().mockImplementation(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }))

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    await caller.duplicateReview.dismiss({ reviewId: REVIEW_UUID, patientId: PATIENT_UUID })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        metadata: expect.objectContaining({ operation: 'duplicate_dismiss' }),
      }),
    )
  })
})

describe('duplicateReview.flagForMerge', () => {
  const createCaller = createCallerFactory(appRouter)

  it('sets status to FLAGGED_FOR_MERGE', async () => {
    const mockFrom = vi.fn().mockImplementation(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }))

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.duplicateReview.flagForMerge({ reviewId: REVIEW_UUID })

    expect(result).toHaveProperty('success', true)
  })
})
