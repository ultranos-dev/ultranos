import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InteractionCheckSummary } from '@ultranos/drug-db'

// ---------------------------------------------------------------------------
// Mocks — must come before dynamic imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const mockCheckInteractions = vi.fn<(...args: any[]) => Promise<InteractionCheckSummary>>()

vi.mock('@ultranos/drug-db', () => ({
  checkInteractions: mockCheckInteractions,
  DrugInteractionSeverity: {
    CONTRAINDICATED: 'CONTRAINDICATED',
    ALLERGY_MATCH: 'ALLERGY_MATCH',
    MAJOR: 'MAJOR',
    MODERATE: 'MODERATE',
    MINOR: 'MINOR',
    NONE: 'NONE',
  },
}))

vi.mock('@/lib/supabase-drug-adapter', () => ({
  createSupabaseDrugAdapter: vi.fn(() => mockDrugAdapter),
}))

const mockSupabaseClient = { from: vi.fn() }
const mockDrugAdapter = {
  getInteractions: vi.fn(),
  getMetadata: vi.fn(),
}

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

// ---------------------------------------------------------------------------
// Router + caller setup (imported after mocks)
// ---------------------------------------------------------------------------

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  user?: { sub: string; role: string; sessionId: string; orgId?: string } | null
}) {
  const supabase = {
    from: overrides?.supabaseFrom ?? vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'test-hash' }], error: null }),
  }
  return {
    supabase: supabase as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const PATIENT_UUID = '00000000-0000-4000-8000-000000000001'
const CLINICIAN_USER = { sub: 'doctor-001', role: 'CLINICIAN', sessionId: 'sess-1', orgId: 'org-test-001' }
const LAB_TECH_USER = { sub: 'lab-tech-001', role: 'LAB_TECH', sessionId: 'sess-2', orgId: 'org-test-001' }
const PHARMACIST_USER = { sub: 'pharma-001', role: 'PHARMACIST', sessionId: 'sess-3', orgId: 'org-test-001' }

const DEFAULT_INPUT = {
  medicationCode: 'RX001',
  medicationDisplay: 'Warfarin 5mg',
  patientId: PATIENT_UUID,
}

/** Mock for organizations table used by enforceVerifiedOrg middleware */
function mockOrganizationsTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { status: 'TRIAL' }, error: null }),
      }),
    }),
  }
}

/**
 * Build a chainable mock for `supabase.from()` that handles multiple table queries.
 * Each table can return different data and supports the query chain pattern used
 * by the checkInteractions procedure.
 */
function mockOrgSubscriptionsTable() {
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

function buildMultiTableMock(tables: Record<string, { data: any; error: any }>) {
  return vi.fn((tableName: string) => {
    if (tableName === 'organizations') return mockOrganizationsTable()
    if (tableName === 'org_subscriptions') return mockOrgSubscriptionsTable()
    const result = tables[tableName] ?? { data: [], error: null }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(result),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  })
}

/** Standard successful table responses (no medications, no allergies) */
function emptyPatientMock() {
  return buildMultiTableMock({
    medication_statements: { data: [], error: null },
    medication_requests: { data: [], error: null },
    allergy_intolerances: { data: [], error: null },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckInteractions.mockResolvedValue({
    result: 'CLEAR',
    interactions: [],
  })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('medication.checkInteractions', () => {
  // --- AC #7: RBAC ---

  it('rejects unauthenticated user → UNAUTHORIZED', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.checkInteractions(DEFAULT_INPUT),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('rejects LAB_TECH (no MedicationRequest access) → FORBIDDEN', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) }
    })
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: LAB_TECH_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.checkInteractions(DEFAULT_INPUT),
    ).rejects.toThrow(/denied|forbidden/i)
  })

  // --- AC #1, #2, #3, #4: Core functionality ---

  it('CLINICIAN → allowed, returns interaction check result', async () => {
    const mockFrom = emptyPatientMock()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.checkInteractions(DEFAULT_INPUT)

    expect(result.result).toBe('CLEAR')
    expect(result.interactions).toEqual([])
    expect(mockCheckInteractions).toHaveBeenCalledOnce()
  })

  it('PHARMACIST → allowed (has MedicationRequest read access)', async () => {
    const mockFrom = emptyPatientMock()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: PHARMACIST_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.checkInteractions(DEFAULT_INPUT)
    expect(result.result).toBe('CLEAR')
  })

  it('returns BLOCKED when CONTRAINDICATED interaction found', async () => {
    mockCheckInteractions.mockResolvedValue({
      result: 'BLOCKED',
      interactions: [
        {
          severity: 'CONTRAINDICATED',
          drugA: 'Warfarin 5mg',
          drugB: 'Aspirin 100mg',
          description: 'Increased bleeding risk',
        },
      ],
    })

    const mockFrom = emptyPatientMock()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.checkInteractions(DEFAULT_INPUT)

    expect(result.result).toBe('BLOCKED')
    expect(result.interactions).toHaveLength(1)
    expect(result.interactions[0].severity).toBe('CONTRAINDICATED')
  })

  it('returns BLOCKED when ALLERGY_MATCH found', async () => {
    mockCheckInteractions.mockResolvedValue({
      result: 'BLOCKED',
      interactions: [
        {
          severity: 'ALLERGY_MATCH',
          drugA: 'Amoxicillin 500mg',
          drugB: 'Penicillin',
          description: 'Patient has documented allergy to "Penicillin"',
        },
      ],
    })

    const mockFrom = emptyPatientMock()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.checkInteractions({
      ...DEFAULT_INPUT,
      medicationDisplay: 'Amoxicillin 500mg',
    })

    expect(result.result).toBe('BLOCKED')
    expect(result.interactions[0].severity).toBe('ALLERGY_MATCH')
  })

  it('returns CLEAR when no interactions found', async () => {
    mockCheckInteractions.mockResolvedValue({
      result: 'CLEAR',
      interactions: [],
    })

    const mockFrom = emptyPatientMock()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.checkInteractions(DEFAULT_INPUT)

    expect(result.result).toBe('CLEAR')
    expect(result.interactions).toEqual([])
  })

  // --- AC #5: Staleness ---

  it('returns UNAVAILABLE with reason DATABASE_STALE when metadata shows >45 days', async () => {
    mockCheckInteractions.mockResolvedValue({
      result: 'UNAVAILABLE',
      interactions: [],
      reason: 'DATABASE_STALE',
    })

    const mockFrom = emptyPatientMock()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.checkInteractions(DEFAULT_INPUT)

    expect(result.result).toBe('UNAVAILABLE')
    expect(result.reason).toBe('DATABASE_STALE')
  })

  it('returns UNAVAILABLE with reason EMPTY_DATABASE when adapter returns empty data', async () => {
    mockCheckInteractions.mockResolvedValue({
      result: 'UNAVAILABLE',
      interactions: [],
      reason: 'EMPTY_DATABASE',
    })

    const mockFrom = emptyPatientMock()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.checkInteractions(DEFAULT_INPUT)

    expect(result.result).toBe('UNAVAILABLE')
    expect(result.reason).toBe('EMPTY_DATABASE')
  })

  // --- AC #6: Audit ---

  it('emits audit event on successful check', async () => {
    const mockFrom = emptyPatientMock()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.medication.checkInteractions(DEFAULT_INPUT)

    expect(mockAuditEmit).toHaveBeenCalledOnce()
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'INTERACTION_CHECK',
        patientId: PATIENT_UUID,
        actorId: CLINICIAN_USER.sub,
        actorRole: CLINICIAN_USER.role,
        metadata: expect.objectContaining({
          medicationDisplay: 'Warfarin 5mg',
          result: 'CLEAR',
          interactionCount: 0,
        }),
      }),
    )
  })

  it('audit failure does not block the response', async () => {
    mockAuditEmit.mockRejectedValueOnce(new Error('audit db unavailable'))

    const mockFrom = emptyPatientMock()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    // Should NOT throw even though audit failed
    const result = await caller.medication.checkInteractions(DEFAULT_INPUT)
    expect(result.result).toBe('CLEAR')
  })

  // --- DB query failure → INTERNAL_SERVER_ERROR (never silently CLEAR) ---

  it('throws INTERNAL_SERVER_ERROR when medication_statements query fails', async () => {
    const mockFrom = buildMultiTableMock({
      medication_statements: { data: null, error: { code: 'PGRST000', message: 'connection error' } },
      medication_requests: { data: [], error: null },
      allergy_intolerances: { data: [], error: null },
    })
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.checkInteractions(DEFAULT_INPUT),
    ).rejects.toThrow(/Failed to retrieve active medication statements/)
  })

  it('throws INTERNAL_SERVER_ERROR when allergy_intolerances query fails', async () => {
    const mockFrom = buildMultiTableMock({
      medication_statements: { data: [], error: null },
      medication_requests: { data: [], error: null },
      allergy_intolerances: { data: null, error: { code: 'PGRST000', message: 'connection error' } },
    })
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.checkInteractions(DEFAULT_INPUT),
    ).rejects.toThrow(/Failed to retrieve active allergies/)
  })

  it('returns UNAVAILABLE when checkInteractions throws (Rule #3)', async () => {
    mockCheckInteractions.mockRejectedValueOnce(new Error('unexpected checker failure'))

    const mockFrom = emptyPatientMock()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.checkInteractions(DEFAULT_INPUT)
    expect(result.result).toBe('UNAVAILABLE')
    expect(result.reason).toBe('ADAPTER_ERROR')
  })

  // --- AC #2: Merges active MedicationStatements + pending MedicationRequests ---

  it('passes pending MedicationRequest names and active statements to checker', async () => {
    const mockFrom = buildMultiTableMock({
      medication_statements: {
        data: [
          {
            id: 'stmt-1',
            medication_display: 'Metformin 500mg',
            subject_reference: `Patient/${PATIENT_UUID}`,
            status: 'active',
          },
        ],
        error: null,
      },
      medication_requests: {
        data: [
          {
            id: 'rx-pending-1',
            medication_display: 'Lisinopril 10mg',
            subject_reference: `Patient/${PATIENT_UUID}`,
            prescription_status: 'ACTIVE',
          },
        ],
        error: null,
      },
      allergy_intolerances: { data: [], error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.medication.checkInteractions(DEFAULT_INPUT)

    // Verify checkInteractions was called with pending Rx names and active statements
    expect(mockCheckInteractions).toHaveBeenCalledWith(
      'Warfarin 5mg',
      ['Lisinopril 10mg'],          // pendingRxNames
      expect.objectContaining({
        activeMedications: expect.any(Array),
        activeAllergies: expect.any(Array),
      }),
      mockDrugAdapter,
    )
  })
})
