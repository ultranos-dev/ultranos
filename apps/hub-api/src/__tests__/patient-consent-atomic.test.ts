import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_ENCRYPTION_KEY = 'a'.repeat(64)
const TEST_HMAC_KEY = 'b'.repeat(64)

vi.stubEnv('FIELD_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', TEST_HMAC_KEY)

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (data: Record<string, unknown>) => data,
    toRowRaw: (data: Record<string, unknown>) => data,
    fromRow: (data: Record<string, unknown>) => data,
    fromRowRaw: (data: Record<string, unknown>) => data,
    fromRows: (data: unknown[]) => data,
  },
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue({}),
  })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: Record<string, unknown>) => {
    const next = opts['next'] as (args: unknown) => unknown
    return next({ ctx: opts['ctx'] })
  }),
}))

vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: Record<string, unknown>) => {
    const next = opts['next'] as (args: unknown) => unknown
    return next({ ctx: opts['ctx'] })
  }),
}))

const mockComputeMpiResult = vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return {
    ...actual,
    computeMpiResult: (...args: unknown[]) => mockComputeMpiResult(...args),
  }
})

const mockFetchMpiCandidates = vi.fn().mockResolvedValue([])
vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: (...args: unknown[]) => mockFetchMpiCandidates(...args),
}))

const mockSignProceedToken   = vi.fn().mockResolvedValue('signed-proceed-token')
const mockVerifyProceedToken = vi.fn()
const mockConsumeProceedToken = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken:    (...args: unknown[]) => mockSignProceedToken(...args),
  verifyProceedToken:  (...args: unknown[]) => mockVerifyProceedToken(...args),
  consumeProceedToken: (...args: unknown[]) => mockConsumeProceedToken(...args),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID  = '11111111-1111-1111-1111-111111111111'
const CONSENT_UUID  = '22222222-2222-2222-2222-222222222222'
const TEST_USER     = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-mpi-1' }

const VALID_CREATE_INPUT = {
  nameLocal: 'Ahmad Mohammad Karim',
  nameGiven: 'Ahmad',
  nameFather: 'Mohammad',
  nameGrandfather: 'Karim',
  gender: 'male' as const,
  birthYear: 1985,
  birthYearOnly: true,
  consent: { method: 'WRITTEN' as const, language: 'en' as const, version: 'v1.0-en' },
}

function makeRpcSuccessContext() {
  const mockRpc = vi.fn().mockResolvedValue({
    data: { patientId: PATIENT_UUID, consentId: CONSENT_UUID },
    error: null,
  })
  return {
    supabase: { rpc: mockRpc } as never,
    user: TEST_USER,
    headers: new Headers(),
  }
}

describe('patient.create — MPI ALLOW path', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
    mockFetchMpiCandidates.mockResolvedValue([])
  })

  it('creates patient via RPC and returns id + mpiWarn=false on ALLOW', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    const result = await caller.patient.create(VALID_CREATE_INPUT)
    expect(result.id).toBe(PATIENT_UUID)
    expect(result.mpiWarn).toBe(false)
    expect((ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'create_patient_with_consent',
      expect.objectContaining({ p_patient: expect.any(Object), p_consent: expect.any(Object) }),
    )
  })

  it('p_consent includes method, language, version', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await caller.patient.create(VALID_CREATE_INPUT)
    const rpcCall = (ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls[0]
    const pConsent = rpcCall[1]['p_consent'] as Record<string, unknown>
    expect(pConsent['consent_method']).toBe('WRITTEN')
    expect(pConsent['consent_language']).toBe('en')
    expect(pConsent['consent_version']).toBe('v1.0-en')
  })

  it('p_patient includes phonetic token arrays', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await caller.patient.create(VALID_CREATE_INPUT)
    const rpcCall = (ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls[0]
    const pPatient = rpcCall[1]['p_patient'] as Record<string, unknown>
    expect(Array.isArray(pPatient['name_phonetic_given'])).toBe(true)
    expect(Array.isArray(pPatient['name_phonetic_father'])).toBe(true)
  })

  it('emits PHI_WRITE audit with mpiDecision=ALLOW', async () => {
    const mockEmit = vi.fn().mockResolvedValue({})
    const { AuditLogger } = await import('@ultranos/audit-logger')
    vi.mocked(AuditLogger).mockImplementationOnce(() => ({ emit: mockEmit }))

    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await caller.patient.create(VALID_CREATE_INPUT)

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        metadata: expect.objectContaining({ mpiDecision: 'ALLOW' }),
      }),
    )
  })
})

describe('patient.create — MPI BLOCK path', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({
      decision: 'BLOCK',
      topScore: 95,
      candidates: [{ candidate: { id: 'existing-1', nameGiven: 'Ahmad' }, score: 95, breakdown: {}, hardIdMatch: false }],
    })
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'existing-1', nameGiven: 'Ahmad' }])
  })

  it('throws CONFLICT (409) on BLOCK decision', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await expect(caller.patient.create(VALID_CREATE_INPUT)).rejects.toThrow(/CONFLICT|duplicate|already exist/i)
  })

  it('does NOT call RPC on BLOCK — no patient created', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    try { await caller.patient.create(VALID_CREATE_INPUT) } catch { /* expected */ }
    expect((ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled()
  })
})

describe('patient.create — MPI WARN path', () => {
  const createCaller = createCallerFactory(appRouter)

  const WARN_RESULT = {
    decision: 'WARN' as const,
    topScore: 75,
    candidates: [{ candidate: { id: 'candidate-1', nameGiven: 'Ahmad' }, score: 75, breakdown: {}, hardIdMatch: false }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue(WARN_RESULT)
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'candidate-1', nameGiven: 'Ahmad' }])
  })

  it('returns PRECONDITION_FAILED (412) with proceedToken on WARN without token', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await expect(caller.patient.create(VALID_CREATE_INPUT)).rejects.toThrow(/PRECONDITION_FAILED|proceed/i)
  })

  it('does NOT call RPC on WARN without token — no patient created', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    try { await caller.patient.create(VALID_CREATE_INPUT) } catch { /* expected */ }
    expect((ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled()
  })

  it('creates patient and returns mpiWarn=true on WARN with valid token', async () => {
    mockVerifyProceedToken.mockResolvedValue({
      jti: 'test-jti-valid',
      candidateIds: ['candidate-1'],
      maxScore: 75,
      issuedTo: TEST_USER.sub,
      exp: Math.floor(Date.now() / 1000) + 600,
    })

    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    const result = await caller.patient.create({ ...VALID_CREATE_INPUT, mpiProceedToken: 'valid-token' })
    expect(result.mpiWarn).toBe(true)
    expect((ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'create_patient_with_consent',
      expect.any(Object),
    )
  })

  it('throws BAD_REQUEST on WARN with expired/invalid token', async () => {
    mockVerifyProceedToken.mockRejectedValue(new Error('Token expired'))
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await expect(
      caller.patient.create({ ...VALID_CREATE_INPUT, mpiProceedToken: 'expired-token' }),
    ).rejects.toThrow(/BAD_REQUEST|invalid|expired/i)
  })

  it('consumes the proceedToken after successful WARN-path creation', async () => {
    mockVerifyProceedToken.mockResolvedValue({
      jti: 'consume-this-jti',
      candidateIds: ['candidate-1'],
      maxScore: 75,
      issuedTo: TEST_USER.sub,
      exp: Math.floor(Date.now() / 1000) + 600,
    })

    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await caller.patient.create({ ...VALID_CREATE_INPUT, mpiProceedToken: 'valid-token' })
    expect(mockConsumeProceedToken).toHaveBeenCalledWith('consume-this-jti')
  })
})

describe('patient.create — RPC failure rolls back', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
    mockFetchMpiCandidates.mockResolvedValue([])
  })

  it('throws INTERNAL_SERVER_ERROR when RPC returns an error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'unique constraint' } })
    const ctx = {
      supabase: { rpc: mockRpc } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)
    await expect(caller.patient.create(VALID_CREATE_INPUT)).rejects.toThrow()
  })
})
