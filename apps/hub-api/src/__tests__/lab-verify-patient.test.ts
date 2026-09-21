import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// ── Supabase mock ────────────────────────────────────────────
const mockSelectSingle = vi.fn()
const mockSelectEq = vi.fn(() => ({ single: mockSelectSingle }))
const mockSelectChain = vi.fn(() => ({ eq: mockSelectEq }))

// lab_technicians mock (for labRestrictedProcedure)
const mockTechSingle = vi.fn()
const mockTechEq = vi.fn(() => ({ single: mockTechSingle }))
const mockTechSelect = vi.fn(() => ({ eq: mockTechEq }))

// audit insert mock
const mockAuditInsert = vi.fn().mockResolvedValue({ error: null })
const mockAuditOrder = vi.fn(() => ({
  limit: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })),
}))

function mockOrganizationsTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { status: 'TRIAL' }, error: null }),
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
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'sub-1', status: 'ACTIVE' },
                error: null,
              }),
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'sub-1', status: 'ACTIVE' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }
  }
  if (table === 'lab_technicians') {
    return { select: mockTechSelect }
  }
  if (table === 'audit_log') {
    return {
      insert: mockAuditInsert,
      select: vi.fn(() => ({
        order: mockAuditOrder,
      })),
    }
  }
  // patients table
  return { select: mockSelectChain }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

function makeCtx(user: { sub: string; practitionerId?: string; role: `${import('@ultranos/shared-types').UserRole}`; sessionId: string; orgId: string | null; facilityId: string | null; status: string | null } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

/**
 * Set up lab_technicians mock to return a valid ACTIVE lab affiliation.
 * Required before every verifyPatient call for LAB_TECH users.
 */
function setupLabAffiliation(status = 'ACTIVE') {
  mockTechSingle.mockResolvedValue({
    data: {
      id: 'tech-record-1',
      lab_id: 'lab-1',
      practitioner_id: 'tech-1',
      labs: { id: 'lab-1', status },
    },
    error: null,
  })
}

function setupPatientFound() {
  mockSelectSingle.mockResolvedValue({
    data: {
      id: 'patient-uuid-1',
      name_given: 'Amir',
      birth_date: '1990-05-15',
      birth_year: 1990,
    },
    error: null,
  })
}

// Real-world case: many patients register with a birth YEAR only (no exact DOB).
function setupPatientYearOnly() {
  mockSelectSingle.mockResolvedValue({
    data: {
      id: 'patient-uuid-1',
      name_given: 'Amir',
      birth_date: null,
      birth_year: 1991,
    },
    error: null,
  })
}

function setupPatientNotFound() {
  mockSelectSingle.mockResolvedValue({
    data: null,
    error: { code: 'PGRST116', message: 'not found' },
  })
}

describe('lab.verifyPatient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── AC 1: Returns only firstName + age ──────────────────────
  it('returns only firstName, age, and patientRef for a valid patient', async () => {
    setupLabAffiliation()
    setupPatientFound()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    const result = await caller.lab.verifyPatient({
      query: 'NID-12345',
      method: 'NATIONAL_ID',
    })

    expect(result).toHaveProperty('firstName')
    expect(result).toHaveProperty('age')
    expect(result).toHaveProperty('patientRef')

    // CRITICAL: Only the minimal fields + a signed photo URL (deliberate: patient
    // photos are shown in the lab). `patientRef` stays an opaque HMAC (no raw UUID),
    // and `photoUrl` is a short-lived signed URL — the raw storage key is never returned.
    const keys = Object.keys(result)
    expect(keys).toEqual(['firstName', 'age', 'patientRef', 'photoUrl'])

    expect(result.firstName).toBe('Amir')
    expect(typeof result.age).toBe('number')
    // patientRef should be a hex string (HMAC-SHA256), NOT the raw patient ID
    expect(result.patientRef).toMatch(/^[0-9a-f]{64}$/)
    expect(result.patientRef).not.toBe('patient-uuid-1')
  })

  // ── AC 2: Accepts National ID lookup ────────────────────────
  it('accepts NATIONAL_ID as lookup method', async () => {
    setupLabAffiliation()
    setupPatientFound()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' }),
    ).resolves.toBeDefined()
  })

  // ── AC 2: Accepts QR_SCAN lookup ────────────────────────────
  it('accepts QR_SCAN as lookup method', async () => {
    setupLabAffiliation()
    setupPatientFound()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: '00000000-0000-4000-8000-000000000001', method: 'QR_SCAN' }),
    ).resolves.toBeDefined()
  })

  // ── AC 3: Rejects non-LAB_TECH roles ───────────────────────
  it('rejects DOCTOR role', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'doc-1', role: 'DOCTOR' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects PHARMACIST role', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'pharm-1', role: 'PHARMACIST' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects PATIENT role', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'p-1', role: 'PATIENT' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects unauthenticated requests', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(null))

    await expect(
      caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  // ── AC 4: Schema enforcement — invalid method rejected ──────
  it('rejects invalid lookup method', async () => {
    setupLabAffiliation()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: 'NID-12345', method: 'INVALID' as any }),
    ).rejects.toThrow()
  })

  // ── AC 4: SQL-level data minimization ───────────────────────
  it('queries ONLY given_name and birth_date from patients table', async () => {
    setupLabAffiliation()
    setupPatientFound()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' })

    // Verify patients table was queried
    expect(mockFrom).toHaveBeenCalledWith('patients')

    // Verify the select uses the REAL patient name column (Afghan naming:
    // name_given, NOT given_name) plus the DOB fields for age.
    const selectArg = (mockSelectChain.mock.calls[0] as any[])[0] as string
    expect(selectArg).toContain('name_given')
    expect(selectArg).not.toContain('given_name')
    expect(selectArg).toContain('birth_date')
    expect(selectArg).toContain('birth_year')
    // Must NOT select other clinical columns
    expect(selectArg).not.toContain('diagnosis')
    expect(selectArg).not.toContain('medication')
    expect(selectArg).not.toContain('allergy')
    expect(selectArg).not.toContain('encounter')
    // Only the identity/age columns needed for a data-minimized verification.
    // photo_url is selected server-side ONLY to mint a signed photo URL; it is never returned raw.
    expect(selectArg).toBe('id, name_given, birth_date, birth_year, photo_url')
  })

  // ── Year-only DOB (the common real-world case) still verifies ──
  it('returns a numeric age for a patient registered with birth year only', async () => {
    setupLabAffiliation()
    setupPatientYearOnly()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    const result = await caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' })
    expect(result.firstName).toBe('Amir')
    expect(result.age).toBe(new Date().getFullYear() - 1991)
  })

  // ── AC 7: patientRef is opaque (HMAC-SHA256) ────────────────
  it('generates consistent patientRef via HMAC-SHA256 for same patient', async () => {
    setupLabAffiliation()
    setupPatientFound()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    const result1 = await caller.lab.verifyPatient({
      query: 'NID-12345',
      method: 'NATIONAL_ID',
    })

    // Reset and call again
    vi.clearAllMocks()
    setupLabAffiliation()
    setupPatientFound()

    const result2 = await caller.lab.verifyPatient({
      query: 'NID-12345',
      method: 'NATIONAL_ID',
    })

    expect(result1.patientRef).toBe(result2.patientRef)
  })

  // ── Patient not found ───────────────────────────────────────
  it('returns NOT_FOUND when patient does not exist', async () => {
    setupLabAffiliation()
    setupPatientNotFound()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: 'NID-UNKNOWN', method: 'NATIONAL_ID' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  // ── AC 8: Audit event emitted ───────────────────────────────
  it('emits audit event on successful verification', async () => {
    setupLabAffiliation()
    setupPatientFound()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' })

    // AuditLogger.emit should have been called
    expect(mockAuditEmit).toHaveBeenCalled()
    const auditInput = mockAuditEmit.mock.calls[0]?.[0]
    expect(auditInput).toMatchObject({
      action: 'READ',
      resourceType: 'PATIENT',
      outcome: 'SUCCESS',
    })
    // CRITICAL: Audit must NOT contain patient name or PHI
    const auditJson = JSON.stringify(auditInput)
    expect(auditJson).not.toContain('Amir')
  })

  it('emits audit event with lookup method in metadata', async () => {
    setupLabAffiliation()
    setupPatientFound()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' })

    const auditInput = mockAuditEmit.mock.calls[0]?.[0]
    expect(auditInput.metadata).toMatchObject({
      lookupMethod: 'NATIONAL_ID',
    })
  })

  it('emits audit event on failed verification (patient not found)', async () => {
    setupLabAffiliation()
    setupPatientNotFound()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await caller.lab.verifyPatient({ query: 'NID-UNKNOWN', method: 'NATIONAL_ID' }).catch(() => {})

    // Audit should still be emitted for failed lookups
    expect(mockAuditEmit).toHaveBeenCalled()
    const auditInput = mockAuditEmit.mock.calls[0]?.[0]
    expect(auditInput).toMatchObject({
      action: 'READ',
      resourceType: 'PATIENT',
      outcome: 'FAILURE',
    })
  })

  // ── Lab status gate ─────────────────────────────────────────
  it('rejects verification when lab is PENDING', async () => {
    setupLabAffiliation('PENDING')

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects verification when lab is SUSPENDED', async () => {
    setupLabAffiliation('SUSPENDED')

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: 'NID-12345', method: 'NATIONAL_ID' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  // ── ADMIN bypass (accepted by design) ───────────────────────
  it('allows ADMIN role to call verifyPatient', async () => {
    // ADMIN bypasses labRestrictedProcedure (no lab context injected)
    setupPatientFound()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    const result = await caller.lab.verifyPatient({
      query: '00000000-0000-4000-8000-000000000001',
      method: 'QR_SCAN',
    })

    expect(result).toHaveProperty('firstName')
    expect(result).toHaveProperty('age')
    expect(result).toHaveProperty('patientRef')
  })

  // ── QR_SCAN UUID validation ────────────────────────────────
  it('rejects non-UUID strings for QR_SCAN method', async () => {
    setupLabAffiliation()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: 'not-a-uuid', method: 'QR_SCAN' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  // ── Input validation ────────────────────────────────────────
  it('rejects empty query string', async () => {
    setupLabAffiliation()

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }),
    )

    await expect(
      caller.lab.verifyPatient({ query: '', method: 'NATIONAL_ID' }),
    ).rejects.toThrow()
  })
})
