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

vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return {
    ...actual,
    computeMpiResult: vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] }),
    normalizeNameComponent: vi.fn((s: string) => s),
    computePhoneticTokens: vi.fn(() => []),
  }
})

vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken: vi.fn().mockResolvedValue('token'),
  verifyProceedToken: vi.fn().mockResolvedValue({ jti: 'j', candidateIds: [], maxScore: 0, issuedTo: 'doctor-001', exp: 9999999999 }),
  consumeProceedToken: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/async-mpi-scoring', () => ({
  runAsyncMpiScoring: vi.fn().mockResolvedValue(undefined),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '55555555-5555-5555-5555-555555555555'
const TEST_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1' }

describe('patient.syncCreate', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const VALID_SYNC_INPUT = {
    nameLocal: 'Ahmad Mohammad',
    nameGiven: 'Ahmad',
    nameFather: 'Mohammad',
    gender: 'male' as const,
    birthYear: 1985,
    birthYearOnly: true,
    consent: { method: 'WRITTEN' as const, language: 'en' as const, version: 'v1.0-en' },
    offlineCreatedAt: '2026-05-22T10:00:00.000Z',
  }

  it('creates patient via RPC without MPI scoring', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { patientId: PATIENT_UUID, consentId: 'c1' },
      error: null,
    })
    const ctx = {
      supabase: { rpc: mockRpc } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    const result = await caller.patient.syncCreate(VALID_SYNC_INPUT)

    expect(result).toHaveProperty('id')
    expect(mockRpc).toHaveBeenCalledWith(
      'create_patient_with_consent',
      expect.any(Object),
    )
  })

  it('fires async MPI scoring after successful create', async () => {
    const { runAsyncMpiScoring } = await import('../lib/async-mpi-scoring')
    const mockRpc = vi.fn().mockResolvedValue({
      data: { patientId: PATIENT_UUID, consentId: 'c1' },
      error: null,
    })
    const ctx = {
      supabase: { rpc: mockRpc } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    await caller.patient.syncCreate(VALID_SYNC_INPUT)

    expect(vi.mocked(runAsyncMpiScoring)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ nameGiven: 'Ahmad' }),
      expect.anything(),
    )
  })

  it('emits audit event with operation sync_create', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { patientId: PATIENT_UUID, consentId: 'c1' },
      error: null,
    })
    const ctx = {
      supabase: { rpc: mockRpc } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    await caller.patient.syncCreate(VALID_SYNC_INPUT)

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        metadata: expect.objectContaining({ operation: 'sync_create' }),
      }),
    )
  })
})
