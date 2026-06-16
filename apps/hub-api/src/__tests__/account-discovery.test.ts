import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Account Discovery / Claim / RegisterFromSession — O3 Plan Tasks 3-5
// Tests for patientRegistration.discover, .claim, .registerFromSession
// ============================================================

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

// vi.mock calls are hoisted; use vi.hoisted to share the helper with test body.
const { mockBlindIndex } = vi.hoisted(() => {
  function mockBlindIndex(v: string): string {
    // Deterministic 64-char hex derived from the value (pad/truncate)
    const hex = Buffer.from(v).toString('hex')
    return (hex + '0'.repeat(64)).slice(0, 64)
  }
  return { mockBlindIndex }
})

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    pipeline: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}))

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

vi.mock('@ultranos/crypto/server', () => ({
  encryptField: (v: string) => `enc:${v}`,
  decryptField: (v: string) => v.replace(/^enc:/, ''),
  generateBlindIndex: (v: string) => mockBlindIndex(v),
  getEncryptionConfig: () => ({ randomizedFields: [] }),
}))

vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: () => ({
    encryptionKey: 'a'.repeat(64),
    hmacKey: 'b'.repeat(64),
  }),
  getCachedEncryptionKey: () => 'a'.repeat(64),
  validateEncryptionConfig: () => {},
  encryptRow: (row: Record<string, unknown>) => row,
  decryptRow: (row: Record<string, unknown>) => row,
  decryptRows: (rows: unknown[]) => rows,
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
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

const createCaller = createCallerFactory(appRouter)

const ACTOR_ID = '00000000-0000-4000-8000-000000000001'
const PATIENT_UUID = '11111111-1111-1111-1111-111111111111'
const OTHER_USER_ID = '22222222-0000-4000-8000-000000000002'
const STAFF_ID = 'aaaa0000-0000-4000-8000-000000000003'

// PATIENT_REF is the blind index of PATIENT_UUID as computed by the mock
const PATIENT_REF = mockBlindIndex(PATIENT_UUID)

function makeAuthCtx(userId = ACTOR_ID) {
  return {
    user: { sub: userId, role: 'PATIENT', sessionId: 'sess-1', orgId: null, facilityId: null, status: null },
    headers: new Headers(),
  }
}

// Chainable supabase mock builder
// Default OTP-verified phone bound to the session. Supabase stores the verified phone
// WITHOUT a leading "+", matching the request phone '+93701234567' on digits only.
const VERIFIED_PHONE = '93701234567'

function makeSupabase(overrides: {
  practitionerRow?: Record<string, unknown> | null
  patientRow?: Record<string, unknown> | null
  updateError?: { code: string; message: string } | null
  rpcResult?: { data: unknown; error: unknown } | null
  verifiedPhone?: string | null
} = {}) {
  const practitionerRow = overrides.practitionerRow ?? null
  const patientRow = overrides.patientRow ?? null

  const practitionersTable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: practitionerRow, error: null }),
  }

  const patientsUpdateChain = {
    eq: vi.fn().mockResolvedValue({ data: null, error: overrides.updateError ?? null }),
  }

  const patientsTable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: patientRow, error: null }),
    update: vi.fn().mockReturnValue(patientsUpdateChain),
  }

  const rpc = vi.fn().mockResolvedValue(
    overrides.rpcResult ?? { data: { patientId: PATIENT_UUID }, error: null }
  )

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'practitioners') return practitionersTable
      if (table === 'patients') return patientsTable
      return patientsTable
    }),
    rpc,
    auth: {
      admin: {
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
        getUserById: vi.fn().mockResolvedValue({
          data: {
            user: {
              phone:
                overrides.verifiedPhone === undefined ? VERIFIED_PHONE : overrides.verifiedPhone,
            },
          },
        }),
      },
    },
  }

  return { supabase, practitionersTable, patientsTable, patientsUpdateChain, rpc }
}

// ─── Task 3: discover ────────────────────────────────────────────────────────

describe('patientRegistration.discover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuditEmit.mockResolvedValue({})
  })

  it('returns { matchType: "staff" } when phone matches a practitioner blind index', async () => {
    const { supabase } = makeSupabase({ practitionerRow: { id: STAFF_ID } })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.discover({ phone: '+93701234567' })
    expect(result.matchType).toBe('staff')
    // Should NOT check patients table
    expect(supabase.from).not.toHaveBeenCalledWith('patients')
  })

  it('returns { matchType: "patient", candidate } when phone matches an unclaimed patient', async () => {
    const { supabase } = makeSupabase({
      patientRow: {
        // name_local is the PLAINTEXT search column (FIX 1) — used directly, first token only
        id: PATIENT_UUID,
        name_local: 'Ahmad Jan',
        birth_date: '1990-06-15',
        birth_year: 1990,
        auth_user_id: null,
      },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.discover({ phone: '+93701234567' })
    expect(result.matchType).toBe('patient')
    if (result.matchType === 'patient') {
      expect(result.candidate.ref).toBe(PATIENT_REF)
      // First given token only — no decryptField on the plaintext column, no family name
      expect(result.candidate.maskedName).toBe('Ahmad')
      expect(result.candidate.birthYear).toBe(1990)
    }
  })

  it('returns { matchType: "none" } when patient phone matches but claimed by another user', async () => {
    const { supabase } = makeSupabase({
      patientRow: {
        id: PATIENT_UUID,
        name_local: 'Ahmad Jan',
        birth_date: '1990-06-15',
        birth_year: 1990,
        auth_user_id: OTHER_USER_ID,
      },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.discover({ phone: '+93701234567' })
    expect(result.matchType).toBe('none')
    // Should emit a SECURITY_VIOLATION audit
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SECURITY_VIOLATION', outcome: 'DENIED' })
    )
  })

  it('returns { matchType: "none" } when no record found', async () => {
    const { supabase } = makeSupabase({ practitionerRow: null, patientRow: null })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.discover({ phone: '+93701234567' })
    expect(result.matchType).toBe('none')
  })

  it('rejects unauthenticated callers', async () => {
    const { supabase } = makeSupabase()
    const ctx = { user: null, headers: new Headers(), supabase: supabase as never }
    const caller = createCaller(ctx)
    await expect(caller.patientRegistration.discover({ phone: '+93701234567' })).rejects.toThrow()
  })

  it('throws FORBIDDEN + audits DENIED when request phone != session verified phone', async () => {
    // Session is OTP-verified for a DIFFERENT phone — caller must not discover phone B.
    const { supabase, patientsTable } = makeSupabase({
      verifiedPhone: '93709999999',
      patientRow: {
        id: PATIENT_UUID,
        name_local: 'Ahmad Jan',
        birth_date: '1990-06-15',
        birth_year: 1990,
        auth_user_id: null,
      },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)

    await expect(
      caller.patientRegistration.discover({ phone: '+93701234567' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // Must short-circuit before touching patient/practitioner data
    expect(patientsTable.maybeSingle).not.toHaveBeenCalled()
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SECURITY_VIOLATION',
        outcome: 'DENIED',
        denialReason: expect.stringContaining('session phone'),
      })
    )
  })
})

// ─── Task 4: claim ───────────────────────────────────────────────────────────

describe('patientRegistration.claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuditEmit.mockResolvedValue({})
  })

  it('links auth_user_id and audits SUCCESS when birth year matches', async () => {
    const { supabase, patientsTable, patientsUpdateChain } = makeSupabase({
      patientRow: {
        id: PATIENT_UUID,
        birth_date: '1990-06-15',
        birth_year: 1990,
        auth_user_id: null,
      },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)

    const result = await caller.patientRegistration.claim({
      ref: PATIENT_REF,
      phone: '+93701234567',
      birthYear: 1990,
    })

    expect(result).toEqual({ ok: true })
    // Assert update was called to link auth_user_id
    expect(patientsTable.update).toHaveBeenCalledWith({ auth_user_id: ACTOR_ID })
    expect(patientsUpdateChain.eq).toHaveBeenCalledWith('id', PATIENT_UUID)
    // Assert SUCCESS audit emitted
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', outcome: 'SUCCESS', resourceId: PATIENT_UUID })
    )
  })

  it('throws FORBIDDEN and audits DENIED when birth year does not match', async () => {
    const { supabase } = makeSupabase({
      patientRow: {
        id: PATIENT_UUID,
        birth_date: '1990-06-15',
        birth_year: 1990,
        auth_user_id: null,
      },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)

    await expect(
      caller.patientRegistration.claim({ ref: PATIENT_REF, phone: '+93701234567', birthYear: 1985 })
    ).rejects.toThrow()

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', outcome: 'DENIED', denialReason: expect.stringContaining('birth year') })
    )
  })

  it('throws FORBIDDEN when patient already claimed by another user', async () => {
    const { supabase } = makeSupabase({
      patientRow: {
        id: PATIENT_UUID,
        birth_date: '1990-06-15',
        birth_year: 1990,
        auth_user_id: OTHER_USER_ID,
      },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)

    await expect(
      caller.patientRegistration.claim({ ref: PATIENT_REF, phone: '+93701234567', birthYear: 1990 })
    ).rejects.toThrow()

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SECURITY_VIOLATION', outcome: 'DENIED' })
    )
  })

  it('throws FORBIDDEN when request phone != session verified phone', async () => {
    const { supabase, patientsTable } = makeSupabase({
      verifiedPhone: '93709999999',
      patientRow: {
        id: PATIENT_UUID,
        birth_date: '1990-06-15',
        birth_year: 1990,
        auth_user_id: null,
      },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)

    await expect(
      caller.patientRegistration.claim({ ref: PATIENT_REF, phone: '+93701234567', birthYear: 1990 })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // Must short-circuit before resolving the patient row
    expect(patientsTable.maybeSingle).not.toHaveBeenCalled()
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SECURITY_VIOLATION', outcome: 'DENIED' })
    )
  })

  it('throws NOT_FOUND when ref does not match the resolved patient id', async () => {
    const { supabase } = makeSupabase({
      patientRow: {
        id: PATIENT_UUID,
        birth_date: '1990-06-15',
        birth_year: 1990,
        auth_user_id: null,
      },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)

    await expect(
      caller.patientRegistration.claim({
        ref: 'a'.repeat(64), // wrong ref
        phone: '+93701234567',
        birthYear: 1990,
      })
    ).rejects.toThrow()
  })
})

// ─── Task 5: registerFromSession ─────────────────────────────────────────────

describe('patientRegistration.registerFromSession', () => {
  const VALID_INPUT = {
    firstName: 'Ahmad',
    dateOfBirth: '1990-06-15',
    preferredLanguage: 'en' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuditEmit.mockResolvedValue({})
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
    mockFetchMpiCandidates.mockResolvedValue([])
  })

  it('creates patient via RPC with auth_user_id set on MPI ALLOW', async () => {
    const { supabase, rpc } = makeSupabase({
      rpcResult: { data: { patientId: PATIENT_UUID }, error: null },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)

    const result = await caller.patientRegistration.registerFromSession(VALID_INPUT)
    expect(result).not.toHaveProperty('blocked')

    // Verify RPC was called with auth_user_id in the patient row
    expect(rpc).toHaveBeenCalledWith(
      'create_patient_with_consent',
      expect.objectContaining({
        p_patient: expect.objectContaining({ authUserId: ACTOR_ID }),
        p_consent: expect.objectContaining({ consent_method: 'SELF_REGISTERED' }),
      })
    )

    // Verify audit was emitted
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', resourceType: 'PATIENT', outcome: 'SUCCESS' })
    )
  })

  it('creates patient with mpi_warn: true on MPI WARN', async () => {
    mockComputeMpiResult.mockReturnValue({ decision: 'WARN', topScore: 70, candidates: [] })
    const { supabase, rpc } = makeSupabase({
      rpcResult: { data: { patientId: PATIENT_UUID }, error: null },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)

    await caller.patientRegistration.registerFromSession(VALID_INPUT)

    const rpcCall = rpc.mock.calls[0]
    const pPatient = (rpcCall[1] as Record<string, unknown>)['p_patient'] as Record<string, unknown>
    expect(pPatient['mpi_warn']).toBe(true)
  })

  it('returns { blocked: true } on MPI BLOCK without calling RPC', async () => {
    mockComputeMpiResult.mockReturnValue({ decision: 'BLOCK', topScore: 95, candidates: [] })
    const { supabase, rpc } = makeSupabase()
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)

    const result = await caller.patientRegistration.registerFromSession(VALID_INPUT)
    expect(result).toHaveProperty('blocked', true)
    expect(rpc).not.toHaveBeenCalledWith('create_patient_with_consent', expect.anything())
  })

  it('sets optional fields (photoUrl, address, nameFather) in the patient row', async () => {
    const { supabase, rpc } = makeSupabase({
      rpcResult: { data: { patientId: PATIENT_UUID }, error: null },
    })
    const ctx = { ...makeAuthCtx(), supabase: supabase as never }
    const caller = createCaller(ctx)

    await caller.patientRegistration.registerFromSession({
      ...VALID_INPUT,
      nameFather: 'Jan',
      photoUrl: 'https://cdn.example.com/photo.jpg',
      addressProvinceCurrent: 'Kabul',
      addressDistrictCurrent: 'District 1',
      addressVillageCurrent: 'Village A',
    })

    const rpcCall = rpc.mock.calls[0]
    const pPatient = (rpcCall[1] as Record<string, unknown>)['p_patient'] as Record<string, unknown>
    expect(pPatient['nameFather']).toBe('Jan')
    expect(pPatient['photoUrl']).toBe('https://cdn.example.com/photo.jpg')
    expect(pPatient['addressProvinceCurrent']).toBe('Kabul')
  })

  it('rejects unauthenticated callers', async () => {
    const { supabase } = makeSupabase()
    const ctx = { user: null, headers: new Headers(), supabase: supabase as never }
    const caller = createCaller(ctx)
    await expect(caller.patientRegistration.registerFromSession(VALID_INPUT)).rejects.toThrow()
  })
})
