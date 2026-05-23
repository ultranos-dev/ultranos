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

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '33333333-3333-3333-3333-333333333333'
const CONSENT_UUID = '44444444-4444-4444-4444-444444444444'

const VALID_REGISTER_INPUT = {
  phone: '+93701234567',
  otpCode: '123456',
  firstName: 'Ahmad',
  dateOfBirth: '1990-06-15',
  preferredLanguage: 'en' as const,
}

function makeRegisterContext(otpSuccess = true) {
  return {
    supabase: {
      auth: {
        signInWithOtp: vi.fn().mockResolvedValue({}),
        verifyOtp: otpSuccess
          ? vi.fn().mockResolvedValue({
              data: { session: { user: { id: 'auth-user-123' }, access_token: 'tok', refresh_token: 'ref', expires_at: 9999 } },
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

describe('patientRegistration.register — MPI integration', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
    mockFetchMpiCandidates.mockResolvedValue([])
  })

  it('creates patient via RPC on ALLOW', async () => {
    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.register(VALID_REGISTER_INPUT)
    const id = (result as Record<string, unknown>)['patientId'] ?? (result as Record<string, unknown>)['id']
    expect(id).toBeTruthy()
    expect(ctx.supabase.rpc).toHaveBeenCalledWith(
      'create_patient_with_consent',
      expect.objectContaining({ p_consent: expect.objectContaining({ consent_method: 'SELF_REGISTERED' }) }),
    )
  })

  it('does NOT block on shared phone (ALLOW below threshold)', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'existing-p1', nameGiven: 'Zubair', phone: '+93701234567' }])
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 25, candidates: [] })
    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.register(VALID_REGISTER_INPUT)
    const id = (result as Record<string, unknown>)['patientId'] ?? (result as Record<string, unknown>)['id']
    expect(id).toBeTruthy()
  })

  it('returns non-PHI blocked response on BLOCK', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'existing-p2', nameGiven: 'Ahmad' }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'BLOCK', topScore: 95,
      candidates: [{ candidate: { id: 'existing-p2' }, score: 95, breakdown: {}, hardIdMatch: false }],
    })
    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.register(VALID_REGISTER_INPUT)
    expect(result).toHaveProperty('blocked', true)
    expect(result).toHaveProperty('message')
    const responseStr = JSON.stringify(result)
    expect(responseStr).not.toContain('existing-p2')
    expect(responseStr).not.toContain('Ahmad')
  })

  it('creates patient with mpi_warn=true on WARN (no token required)', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'maybe-dup', nameGiven: 'Ahmad' }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'WARN', topScore: 70,
      candidates: [{ candidate: { id: 'maybe-dup' }, score: 70, breakdown: {}, hardIdMatch: false }],
    })
    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)
    await caller.patientRegistration.register(VALID_REGISTER_INPUT)
    const rpcCall = ctx.supabase.rpc.mock.calls[0]
    const pPatient = rpcCall[1]['p_patient'] as Record<string, unknown>
    expect(pPatient['mpi_warn']).toBe(true)
  })

  it('rejects invalid OTP — never reaches MPI check', async () => {
    const ctx = makeRegisterContext(false)
    const caller = createCaller(ctx)
    await expect(caller.patientRegistration.register(VALID_REGISTER_INPUT)).rejects.toThrow(/BAD_REQUEST|failed/i)
    expect(mockFetchMpiCandidates).not.toHaveBeenCalled()
  })
})
