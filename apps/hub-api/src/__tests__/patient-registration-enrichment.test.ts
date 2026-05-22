import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: Record<string, unknown>) => d,
    toRowRaw: (d: Record<string, unknown>) => d,
    fromRow: (d: Record<string, unknown>) => d,
    fromRowRaw: (d: Record<string, unknown>) => d,
    fromRows: (d: unknown[]) => d,
  },
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: vi.fn().mockResolvedValue({}) })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: Record<string, unknown>) => {
    const next = opts['next'] as (a: unknown) => unknown
    return next({ ctx: opts['ctx'] })
  }),
}))

vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: Record<string, unknown>) => {
    const next = opts['next'] as (a: unknown) => unknown
    return next({ ctx: opts['ctx'] })
  }),
}))

const mockComputeMpiResult = vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return { ...actual, computeMpiResult: (...args: unknown[]) => mockComputeMpiResult(...args) }
})

const mockFetchMpiCandidates = vi.fn().mockResolvedValue([])
vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: (...args: unknown[]) => mockFetchMpiCandidates(...args),
}))

vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken: vi.fn().mockResolvedValue('t'),
  verifyProceedToken: vi.fn().mockResolvedValue({ jti: 'j', candidateIds: [], maxScore: 0, issuedTo: 'doctor-001', exp: 9999999999 }),
  consumeProceedToken: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/async-mpi-scoring', () => ({ runAsyncMpiScoring: vi.fn().mockResolvedValue(undefined) }))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '88888888-8888-8888-8888-888888888888'
const CONSENT_UUID = '99999999-9999-9999-9999-999999999999'

function makeRegisterContext(otpSuccess = true) {
  return {
    supabase: {
      auth: {
        signInWithOtp: vi.fn().mockResolvedValue({}),
        verifyOtp: otpSuccess
          ? vi.fn().mockResolvedValue({
              data: { session: { user: { id: 'auth-user-456' }, access_token: 'tok', refresh_token: 'ref', expires_at: 9999 } },
              error: null,
            })
          : vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'invalid OTP' } }),
        admin: { updateUserById: vi.fn().mockResolvedValue({}) },
      },
      rpc: vi.fn().mockResolvedValue({
        data: { patientId: PATIENT_UUID, consentId: CONSENT_UUID },
        error: null,
      }),
    } as never,
    user: null,
    headers: new Headers(),
  }
}

describe('patientRegistration.register — nameFather and gender', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
    mockFetchMpiCandidates.mockResolvedValue([])
  })

  it('accepts nameFather and gender in registration input', async () => {
    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)

    const result = await caller.patientRegistration.register({
      phone: '+93701234567',
      otpCode: '123456',
      firstName: 'Ahmad',
      nameFather: 'Mohammad',
      gender: 'male',
      dateOfBirth: '1990-06-15',
      preferredLanguage: 'en',
    })

    expect(result).not.toHaveProperty('blocked')
    const rpcCall = ctx.supabase.rpc.mock.calls[0]
    const pPatient = rpcCall[1]['p_patient'] as Record<string, unknown>
    expect(pPatient).toHaveProperty('nameFather', 'Mohammad')
    expect(pPatient).toHaveProperty('gender', 'male')
  })

  it('passes nameFather to MPI candidate fetch', async () => {
    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)

    await caller.patientRegistration.register({
      phone: '+93701234567',
      otpCode: '123456',
      firstName: 'Ahmad',
      nameFather: 'Mohammad',
      gender: 'male',
      dateOfBirth: '1990-06-15',
      preferredLanguage: 'en',
    })

    expect(mockFetchMpiCandidates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nameFather: 'Mohammad' }),
    )
  })
})
