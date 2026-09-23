import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Story 59.1 — lab-scoped registration & search endpoints.
 *
 * Rule #7 tier-compliance tests: every lab-facing response is asserted to
 * contain the EXACT data-minimized field set (firstName + age + opaque
 * blind-index ref) and NEVER the real patient UUID.
 */

const TEST_ENCRYPTION_KEY = 'a'.repeat(64)
const TEST_HMAC_KEY = 'b'.repeat(64)

vi.stubEnv('FIELD_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', TEST_HMAC_KEY)

// ── Module mocks (must be before imports) ────────────────────
const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

const mockFetchMpiCandidates = vi.fn().mockResolvedValue([])
vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: (...args: unknown[]) => mockFetchMpiCandidates(...args),
}))

const mockSignProceedToken = vi.fn().mockResolvedValue('proceed-token-1')
const mockVerifyProceedToken = vi.fn().mockResolvedValue({
  jti: 'jti-1',
  candidateIds: [],
  maxScore: 72,
  issuedTo: 'tech-1',
})
const mockConsumeProceedToken = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken: (...args: unknown[]) => mockSignProceedToken(...args),
  verifyProceedToken: (...args: unknown[]) => mockVerifyProceedToken(...args),
  consumeProceedToken: (...args: unknown[]) => mockConsumeProceedToken(...args),
}))

const mockComputeMpiResult = vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
vi.mock('@ultranos/mpi-engine', () => ({
  computeMpiResult: (...args: unknown[]) => mockComputeMpiResult(...args),
  normalizeNameComponent: (s: string) => s,
  computePhoneticTokens: () => [] as string[],
}))

// ── Supabase mock ────────────────────────────────────────────

/** Chainable query stub: every method returns the chain; awaiting resolves `result`. */
function chain(result: unknown) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'limit', 'maybeSingle', 'single', 'order', 'in', 'not', 'is']) {
    c[m] = vi.fn(() => c)
  }
  ;(c as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(typeof result === 'function' ? (result as () => unknown)() : result).then(res, rej)
  return c
}

// lab_technicians mock (for labRestrictedProcedure)
const mockTechSingle = vi.fn()
const mockTechEq = vi.fn(() => ({ single: mockTechSingle }))
const mockTechSelect = vi.fn(() => ({ eq: mockTechEq }))

// patients search select chain — result configurable per test
let patientsSelectResult: unknown = { data: [], error: null }
const mockPatientsSelect = vi.fn(() => chain(patientsSelectResult))

function mockOrganizationsTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'org-test-001', status: 'TRIAL' }, error: null }),
      }),
    }),
  }
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'organizations') return mockOrganizationsTable()
  if (table === 'org_subscriptions') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
            }),
          }),
        }),
      }),
    }
  }
  if (table === 'lab_technicians') {
    return { select: mockTechSelect }
  }
  if (table === 'patients') {
    return { select: mockPatientsSelect }
  }
  return { select: vi.fn(() => chain({ data: null, error: null })) }
})

const mockRpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
  db: {
    toRow: (data: unknown) => data,
    toRowRaw: (data: unknown) => data,
    fromRow: (data: unknown) => data,
    fromRowRaw: (data: unknown) => data,
    fromRows: (data: unknown[]) => data,
  },
  selectExactCount: vi.fn(),
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')
const { generateBlindIndex } = await import('@ultranos/crypto/server')

const PATIENT_UUID = 'c0ffee00-1111-4222-8333-444455556666'

function makeCtx(user: { sub: string; role: string; sessionId: string; orgId: string | null; facilityId: string | null; status: string | null } | null) {
  return {
    supabase: { from: mockFrom, rpc: mockRpc } as never,
    user: user as never,
    headers: new Headers(),
  }
}

function labTechCtx() {
  return makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' })
}

function setupLabAffiliation(status = 'ACTIVE') {
  mockTechSingle.mockResolvedValue({
    data: {
      id: 'tech-record-1',
      lab_id: 'lab-1',
      lab_role: 'LAB_MANAGER',
      practitioner_id: 'pract-1',
      labs: { id: 'lab-1', status },
    },
    error: null,
  })
}

function makeCaller() {
  const router = createTRPCRouter({ lab: labRouter })
  return createCallerFactory(router)(labTechCtx() as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  patientsSelectResult = { data: [], error: null }
  mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
  mockFetchMpiCandidates.mockResolvedValue([])
})

// ═══════════════════════════════════════════════════════════════
describe('lab.searchPatients', () => {
  it('returns EXACTLY ref + firstName + age per match — never the raw UUID (Rule #7)', async () => {
    setupLabAffiliation()
    patientsSelectResult = {
      data: [
        { id: PATIENT_UUID, name_given: 'Amir', name_local: 'امیر', birth_date: null, birth_year: 1990 },
      ],
      error: null,
    }

    const caller = makeCaller()
    const result = await caller.lab.searchPatients({ query: 'Amir' })

    expect(result.patients).toHaveLength(1)
    const p = result.patients[0]!

    // CRITICAL: exact field set — nothing beyond firstName/age/ref
    expect(Object.keys(p).sort()).toEqual(['age', 'firstName', 'ref'])

    // The ref is the prefixed HMAC blind index, NOT the raw patient UUID
    const expectedBlind = generateBlindIndex(PATIENT_UUID, TEST_HMAC_KEY)
    expect(p.ref).toBe(`Patient/${expectedBlind}`)
    expect(p.ref).not.toContain(PATIENT_UUID)
    expect(p.firstName).toBe('Amir')
    expect(p.age).toBe(new Date().getFullYear() - 1990)
  })

  it('emits a PHI_READ audit event without logging the query text (Rules #1, #6)', async () => {
    setupLabAffiliation()
    const caller = makeCaller()
    await caller.lab.searchPatients({ query: 'Amir' })

    const call = mockAuditEmit.mock.calls.find(([e]) => e.metadata?.operation === 'lab_patient_search')
    expect(call).toBeDefined()
    expect(call![0].action).toBe('PHI_READ')
    expect(JSON.stringify(call![0].metadata)).not.toContain('Amir')
  })

  it('rejects non-LAB_TECH roles (FORBIDDEN)', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'doc-1', role: 'CLINICIAN', sessionId: 's2', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }) as never,
    )
    await expect(caller.lab.searchPatients({ query: 'Amir' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects unknown input fields (.strict() — Rule #7 defense in depth)', async () => {
    setupLabAffiliation()
    const caller = makeCaller()
    await expect(
      caller.lab.searchPatients({ query: 'Amir', nationalId: '123' } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

// ═══════════════════════════════════════════════════════════════
describe('lab.checkDuplicates', () => {
  it('returns ALLOW with empty candidates when MPI finds nothing', async () => {
    setupLabAffiliation()
    const caller = makeCaller()
    const result = await caller.lab.checkDuplicates({ nameGiven: 'Amir', birthYear: 1990 })
    expect(result.decision).toBe('ALLOW')
    expect(result.candidates).toEqual([])
    expect(result.proceedToken).toBeUndefined()
  })

  it('returns tier-compliant candidates: EXACTLY ref + firstName + age + mpiScore, blind ref only', async () => {
    setupLabAffiliation()
    mockComputeMpiResult.mockReturnValue({
      decision: 'WARN',
      topScore: 72,
      candidates: [
        {
          candidate: {
            id: PATIENT_UUID,
            nameGiven: 'Amir',
            nameFather: 'Karim',       // clinician-tier field — must NOT surface
            gender: 'male',            // must NOT surface
            addressDistrictOrigin: 'D7', // must NOT surface
            birthYear: 1988,
          },
          score: 72,
          breakdown: {},
          hardIdMatch: false,
        },
      ],
    })

    const caller = makeCaller()
    const result = await caller.lab.checkDuplicates({ nameGiven: 'Amir' })

    expect(result.decision).toBe('WARN')
    expect(result.proceedToken).toBe('proceed-token-1')
    expect(result.candidates).toHaveLength(1)
    const c = result.candidates[0]!

    // CRITICAL: exact field set + no UUID leakage
    expect(Object.keys(c).sort()).toEqual(['age', 'firstName', 'mpiScore', 'ref'])
    expect(c.ref).toBe(`Patient/${generateBlindIndex(PATIENT_UUID, TEST_HMAC_KEY)}`)
    expect(c.ref).not.toContain(PATIENT_UUID)
    expect(JSON.stringify(result)).not.toContain('Karim')
    expect(JSON.stringify(result)).not.toContain(PATIENT_UUID)
  })

  it('emits a PHI_READ audit event for the MPI check (Rule #6)', async () => {
    setupLabAffiliation()
    const caller = makeCaller()
    await caller.lab.checkDuplicates({ nameGiven: 'Amir' })
    const call = mockAuditEmit.mock.calls.find(([e]) => e.metadata?.operation === 'lab_mpi_check')
    expect(call).toBeDefined()
    expect(call![0].action).toBe('PHI_READ')
  })

  it('requires at least one name field', async () => {
    setupLabAffiliation()
    const caller = makeCaller()
    await expect(caller.lab.checkDuplicates({ birthYear: 1990 })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

// ═══════════════════════════════════════════════════════════════
describe('lab.registerPatient', () => {
  const validInput = {
    nameLocal: 'امیر',
    nameGiven: 'Amir',
    gender: 'male' as const,
    birthYearOnly: true,
    birthYear: 1990,
    consent: { method: 'WRITTEN' as const, language: 'en', version: '1.0' },
  }

  it('creates the patient via the atomic RPC and returns ONLY the blind ref — never the UUID (Rule #7)', async () => {
    setupLabAffiliation()
    mockRpc.mockResolvedValue({ data: { patientId: PATIENT_UUID }, error: null })

    const caller = makeCaller()
    const result = await caller.lab.registerPatient(validInput)

    // CRITICAL: exact output field set; ref is blind-indexed, UUID absent
    expect(Object.keys(result).sort()).toEqual(['mpiWarn', 'ref'])
    expect(result.ref).toBe(`Patient/${generateBlindIndex(PATIENT_UUID, TEST_HMAC_KEY)}`)
    expect(JSON.stringify(result)).not.toContain(PATIENT_UUID)
    expect(result.mpiWarn).toBe(false)

    // Atomic RPC used (consent captured in the same transaction)
    expect(mockRpc).toHaveBeenCalledWith('create_patient_with_consent', expect.objectContaining({
      p_consent: expect.objectContaining({ consent_method: 'WRITTEN' }),
      p_patient: expect.objectContaining({ name_given: 'Amir', birth_year: 1990 }),
    }))
  })

  it('emits a PHI_WRITE audit event (Rule #6)', async () => {
    setupLabAffiliation()
    mockRpc.mockResolvedValue({ data: { patientId: PATIENT_UUID }, error: null })
    const caller = makeCaller()
    await caller.lab.registerPatient(validInput)

    const call = mockAuditEmit.mock.calls.find(([e]) => e.metadata?.operation === 'lab_register_patient')
    expect(call).toBeDefined()
    expect(call![0].action).toBe('PHI_WRITE')
    expect(call![0].outcome).toBe('SUCCESS')
  })

  it('blocks on WARN without a proceedToken (PRECONDITION_FAILED with fresh token)', async () => {
    setupLabAffiliation()
    mockComputeMpiResult.mockReturnValue({
      decision: 'WARN',
      topScore: 72,
      candidates: [{ candidate: { id: PATIENT_UUID }, score: 72, breakdown: {}, hardIdMatch: false }],
    })
    const caller = makeCaller()
    await expect(caller.lab.registerPatient(validInput)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('proceeds on WARN with a valid proceedToken and consumes it before insert', async () => {
    setupLabAffiliation()
    mockComputeMpiResult.mockReturnValue({
      decision: 'WARN',
      topScore: 72,
      candidates: [{ candidate: { id: PATIENT_UUID }, score: 72, breakdown: {}, hardIdMatch: false }],
    })
    mockRpc.mockResolvedValue({ data: { patientId: PATIENT_UUID }, error: null })

    const caller = makeCaller()
    const result = await caller.lab.registerPatient({ ...validInput, mpiProceedToken: 'tok' })
    expect(result.mpiWarn).toBe(true)
    expect(mockConsumeProceedToken).toHaveBeenCalledWith('jti-1')
  })

  it('rejects fields beyond the lab subset (.strict() — e.g. nationalId must never reach this surface)', async () => {
    setupLabAffiliation()
    const caller = makeCaller()
    await expect(
      caller.lab.registerPatient({ ...validInput, nationalId: '1234567890' } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects non-LAB_TECH roles (FORBIDDEN)', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'pat-1', role: 'PATIENT', sessionId: 's3', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }) as never,
    )
    await expect(caller.lab.registerPatient(validInput)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
