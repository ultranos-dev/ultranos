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
const PATIENT_UUID = '77777777-7777-7777-7777-777777777777'

function createTestContext(mockFrom: ReturnType<typeof vi.fn>) {
  return {
    supabase: { from: mockFrom } as never,
    user: TEST_USER,
    headers: new Headers(),
  }
}

describe('consent.expiringCount', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns count of consents expiring within 90 days', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            lt: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                count: 3,
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.consent.expiringCount()

    expect(result).toEqual({ count: 3 })
    expect(mockFrom).toHaveBeenCalledWith('consents')
  })

  it('returns 0 when no consents are expiring', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            lt: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                count: 0,
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.consent.expiringCount()

    expect(result).toEqual({ count: 0 })
  })

  it('throws on database error', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            lt: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                count: null,
                error: { code: '42P01', message: 'relation does not exist' },
              }),
            }),
          }),
        }),
      }),
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    await expect(caller.consent.expiringCount()).rejects.toThrow('Failed to count expiring consents')
  })
})

describe('consent.expiringSoon', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns list of expiring consents with audit event', async () => {
    const mockConsents = [
      { id: 'c1', patient_ref: 'Patient/aaa', provision_end: '2026-07-01T00:00:00Z', consent_version: '1.0', grantor_role: 'SELF' },
      { id: 'c2', patient_ref: 'Patient/bbb', provision_end: '2026-08-01T00:00:00Z', consent_version: '1.0', grantor_role: 'GUARDIAN' },
    ]

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            lt: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({
                    data: mockConsents,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.consent.expiringSoon({ limit: 50, offset: 0 })

    expect(result.consents).toHaveLength(2)
    expect(result.consents[0].id).toBe('c1')
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'CONSENT',
        metadata: expect.objectContaining({ operation: 'expiring_soon_list', resultCount: 2 }),
      }),
    )
  })
})

describe('consent.renew', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates new active consent and supersedes old one', async () => {
    const updateEqStatus = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const insertMock = vi.fn().mockResolvedValue({ error: null })

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      // First call: update (supersede), second call: insert (new consent)
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        insert: insertMock,
      }
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.consent.renew({
      patientId: PATIENT_UUID,
      method: 'WRITTEN',
      language: 'en',
      version: '2.0',
    })

    expect(result).toEqual({ success: true })

    // Both supersede and insert should target the 'consents' table
    const tables = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(tables.every((t: string) => t === 'consents')).toBe(true)

    // Audit event emitted
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        resourceType: 'CONSENT',
        metadata: expect.objectContaining({ operation: 'consent_renewal', method: 'WRITTEN' }),
      }),
    )
  })

  it('computes audit hash as SHA-256 hex string', async () => {
    let insertedRow: any = null
    const mockFrom = vi.fn().mockImplementation(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      insert: vi.fn().mockImplementation((row: any) => {
        insertedRow = row
        return Promise.resolve({ error: null })
      }),
    }))

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    await caller.consent.renew({
      patientId: PATIENT_UUID,
      method: 'VERBAL_WITNESSED',
      witnessedBy: '88888888-8888-8888-8888-888888888888',
      language: 'ar',
      version: '1.5',
    })

    expect(insertedRow).not.toBeNull()
    // audit_hash should be a 64-char hex string (SHA-256)
    expect(insertedRow.audit_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(insertedRow.status).toBe('ACTIVE')
    expect(insertedRow.consent_version).toBe('1.5')
    expect(insertedRow.patient_ref).toBe(`Patient/${PATIENT_UUID}`)
  })

  it('throws on insert error', async () => {
    const mockFrom = vi.fn().mockImplementation(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate' } }),
    }))

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    await expect(
      caller.consent.renew({
        patientId: PATIENT_UUID,
        method: 'WRITTEN',
        language: 'en',
        version: '2.0',
      }),
    ).rejects.toThrow('Failed to renew consent')
  })
})
