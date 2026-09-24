import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AdministrativeGender } from '@ultranos/shared-types'

// Story 60.3, Task 2 — MPI BLOCK enforcement staged behind MPI_BLOCK_MODE.
// Verifies: default 'warn' keeps BLOCK overridable (issues a proceedToken +
// throws PRECONDITION_FAILED when none supplied); 'enforce' hard-blocks a BLOCK
// with CONFLICT and NO override path.

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))
vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', '')
vi.stubEnv('MPI_TOKEN_PUBLIC_KEY', '')

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

const mockComputeMpiResult = vi.fn()
vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return { ...actual, computeMpiResult: (...args: unknown[]) => mockComputeMpiResult(...args) }
})

const mockFetchMpiCandidates = vi.fn().mockResolvedValue([])
vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: (...args: unknown[]) => mockFetchMpiCandidates(...args),
}))

// Proceed-token signing needs a key; use a deterministic HS-less stub is not
// possible (jose), so generate a real RS256 keypair for the suite.
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose'

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const VALID_CREATE_INPUT = {
  nameLocal: 'Ahmad Zahir',
  nameGiven: 'Ahmad',
  nameFather: 'Zahir',
  gender: AdministrativeGender.MALE,
  birthYearOnly: true,
  birthYear: 1990,
  isNomadic: false,
  consent: { method: 'WRITTEN' as const, language: 'en' as const, version: '1.0' },
}

function makeCtx() {
  return {
    supabase: {
      rpc: vi.fn().mockResolvedValue({
        data: { patientId: '33333333-3333-3333-3333-333333333333', consentId: '44444444-4444-4444-4444-444444444444' },
        error: null,
      }),
    } as never,
    user: {
      sub: 'user-uuid-001',
      role: 'DOCTOR' as const,
      orgId: 'org-1',
      sessionId: 'sess-1',
      facilityId: null,
      status: 'ACTIVE',
    },
    headers: new Headers(),
  }
}

const BLOCK_RESULT = {
  decision: 'BLOCK' as const,
  topScore: 95,
  candidates: [{ candidate: { id: 'existing-block-1' }, score: 95, breakdown: {}, hardIdMatch: false }],
}

describe('patient.create — MPI_BLOCK_MODE (Story 60.3, Task 2)', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(async () => {
    vi.clearAllMocks()
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
    vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', await exportPKCS8(privateKey))
    vi.stubEnv('MPI_TOKEN_PUBLIC_KEY', await exportSPKI(publicKey))
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'existing-block-1', nameGiven: 'Ahmad' }])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    // Re-stub the encryption keys removed by unstubAllEnvs so later suites are unaffected.
    vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))
  })

  it("warn mode (default): a BLOCK is overridable — throws PRECONDITION_FAILED (not CONFLICT) when no token", async () => {
    vi.stubEnv('MPI_BLOCK_MODE', 'warn')
    mockComputeMpiResult.mockReturnValue(BLOCK_RESULT)
    const caller = createCaller(makeCtx())
    await expect(caller.patient.create(VALID_CREATE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
  })

  it('enforce mode: a BLOCK hard-blocks with CONFLICT and never inserts', async () => {
    vi.stubEnv('MPI_BLOCK_MODE', 'enforce')
    mockComputeMpiResult.mockReturnValue(BLOCK_RESULT)
    const ctx = makeCtx()
    const caller = createCaller(ctx)
    await expect(caller.patient.create(VALID_CREATE_INPUT)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    // Hard-blocked before any RPC insert.
    expect((ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled()
  })

  it('enforce mode: a WARN still proceeds with a token (unaffected by enforce)', async () => {
    vi.stubEnv('MPI_BLOCK_MODE', 'enforce')
    mockComputeMpiResult.mockReturnValue({
      decision: 'WARN', topScore: 70,
      candidates: [{ candidate: { id: 'maybe-dup' }, score: 70, breakdown: {}, hardIdMatch: false }],
    })
    const caller = createCaller(makeCtx())
    // No token supplied → PRECONDITION_FAILED (overridable), NOT CONFLICT.
    await expect(caller.patient.create(VALID_CREATE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
  })
})
