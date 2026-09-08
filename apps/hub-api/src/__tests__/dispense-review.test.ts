import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: { toRow: (d: any) => d, toRowRaw: (d: any) => d, fromRow: (d: any) => d, fromRowRaw: (d: any) => d, fromRows: (d: any[]) => d },
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

const TEST_USER = { sub: 'pharm-001', role: 'PHARMACIST', sessionId: 'sess-1' }
const REVIEW_UUID = '11111111-1111-1111-1111-111111111111'
const DISPENSE_UUID = '22222222-2222-2222-2222-222222222222'

function createTestContext(mockFrom: ReturnType<typeof vi.fn>) {
  return { supabase: { from: mockFrom } as never, user: TEST_USER, headers: new Headers() }
}

const createCaller = createCallerFactory(appRouter)

describe('dispenseReview.list', () => {
  beforeEach(() => mockAuditEmit.mockClear())

  const ROW = {
    id: REVIEW_UUID, dispense_id: DISPENSE_UUID, prescription_id: null,
    override_reason: 'Offline grace: chronic med, network down',
    override_supervisor: '33333333-3333-3333-3333-333333333333',
    status: 'PENDING', reviewed_by: null, reviewed_at: null,
    created_at: '2026-07-01T00:00:00Z',
  }

  // list query chain: .from().select().in('status', statuses).order('created_at', { ascending:false })
  function listMockFrom(rows: any[], captureIn?: (col: string, vals: any) => void) {
    return vi.fn().mockImplementation((table: string) => {
      if (table !== 'dispense_reviews') return {}
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation((col: string, vals: any) => {
            captureIn?.(col, vals)
            return { order: vi.fn().mockResolvedValue({ data: rows, error: null }) }
          }),
        }),
      }
    })
  }

  it('returns the raw snake_case rows as a bare array (not wrapped)', async () => {
    const ctx = createTestContext(listMockFrom([ROW]))
    const caller = createCaller(ctx)
    const result = await caller.dispenseReview.list({ statuses: ['PENDING'] })

    expect(Array.isArray(result)).toBe(true)           // MUST be a bare array
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: REVIEW_UUID,
      dispense_id: DISPENSE_UUID,                       // snake_case preserved
      override_reason: 'Offline grace: chronic med, network down',
      override_supervisor: '33333333-3333-3333-3333-333333333333',
      status: 'PENDING',
      reviewed_by: null,
      reviewed_at: null,
      created_at: '2026-07-01T00:00:00Z',
    })
  })

  it('filters by the requested statuses via .in()', async () => {
    let capturedCol = ''
    let capturedVals: any = null
    const ctx = createTestContext(
      listMockFrom([], (col, vals) => { capturedCol = col; capturedVals = vals }),
    )
    const caller = createCaller(ctx)
    await caller.dispenseReview.list({ statuses: ['APPROVED', 'FLAGGED'] })
    expect(capturedCol).toBe('status')
    expect(capturedVals).toEqual(['APPROVED', 'FLAGGED'])
  })

  it('emits a PHI_READ audit event', async () => {
    const ctx = createTestContext(listMockFrom([]))
    const caller = createCaller(ctx)
    await caller.dispenseReview.list({ statuses: ['PENDING'] })
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        metadata: expect.objectContaining({ operation: 'dispense_review_list' }),
      }),
    )
  })

  it('throws INTERNAL_SERVER_ERROR when the query errors', async () => {
    const errFrom = vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000' } }),
        }),
      }),
    }))
    const ctx = createTestContext(errFrom)
    const caller = createCaller(ctx)
    await expect(caller.dispenseReview.list({ statuses: ['PENDING'] })).rejects.toThrow()
  })
})

describe('dispenseReview.updateStatus', () => {
  beforeEach(() => mockAuditEmit.mockClear())

  // update chain: .from().update({...}).eq('id', reviewId).eq('status', 'PENDING')
  function updateMockFrom(captureUpdate?: (payload: any) => void) {
    return vi.fn().mockImplementation((table: string) => {
      if (table !== 'dispense_reviews') return {}
      return {
        update: vi.fn().mockImplementation((payload: any) => {
          captureUpdate?.(payload)
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }),
      }
    })
  }

  it('sets status + reviewed_by + reviewed_at and returns success', async () => {
    let payload: any = null
    const ctx = createTestContext(updateMockFrom((p) => { payload = p }))
    const caller = createCaller(ctx)
    const result = await caller.dispenseReview.updateStatus({ reviewId: REVIEW_UUID, status: 'APPROVED' })

    expect(result).toEqual({ success: true })
    expect(payload.status).toBe('APPROVED')
    expect(payload.reviewed_by).toBe('pharm-001')      // ctx.user.sub
    expect(typeof payload.reviewed_at).toBe('string')
  })

  it('emits a PHI_WRITE audit event with the reviewId', async () => {
    const ctx = createTestContext(updateMockFrom())
    const caller = createCaller(ctx)
    await caller.dispenseReview.updateStatus({ reviewId: REVIEW_UUID, status: 'FLAGGED' })
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        metadata: expect.objectContaining({ operation: 'dispense_review_update', reviewId: REVIEW_UUID }),
      }),
    )
  })

  it('rejects an invalid status value', async () => {
    const ctx = createTestContext(updateMockFrom())
    const caller = createCaller(ctx)
    // 'PENDING' is not an allowed target for updateStatus (only APPROVED/FLAGGED)
    await expect(
      caller.dispenseReview.updateStatus({ reviewId: REVIEW_UUID, status: 'PENDING' as never }),
    ).rejects.toThrow()
  })
})
