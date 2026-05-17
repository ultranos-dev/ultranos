import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const mockSupabaseClient = {
  from: vi.fn(),
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  user?: { sub: string; role: string; sessionId: string; orgId?: string } | null
}) {
  const supabase = {
    from: overrides?.supabaseFrom ?? vi.fn(),
  }
  return {
    supabase: supabase as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

const CLINICIAN_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1', orgId: 'org-test-001' }
const PHARMACIST_USER = { sub: 'pharma-001', role: 'PHARMACIST', sessionId: 'sess-3', orgId: 'org-test-001' }
const LAB_TECH_USER = { sub: 'lab-001', role: 'LAB_TECH', sessionId: 'sess-4', orgId: 'org-test-001' }
const PATIENT_UUID = '00000000-0000-4000-8000-000000000001'
const PRESCRIPTION_UUID = '00000000-0000-4000-8000-000000000200'
const ENCOUNTER_UUID = '00000000-0000-4000-8000-000000000100'

/** Active consent record for mocking consent middleware */
const ACTIVE_CONSENT = {
  id: 'consent-1',
  status: 'ACTIVE',
  category: ['PRESCRIPTIONS', 'FULL_RECORD'],
  date_time: '2026-01-01T00:00:00.000Z',
  provision_end: null,
}

/** Returns a mock for the consents table that grants access */
function mockConsentsTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [ACTIVE_CONSENT], error: null }),
      }),
    }),
  }
}

/** Returns a mock for the audit_log table */
function mockAuditTable() {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
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

/** Mock for org_subscriptions table used by enforceEntitlement middleware */
function mockOrgSubscriptionsTable() {
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

/** Returns a mockFrom that handles consents + audit + medication_requests insert */
function mockFromForCreate(insertResult?: { data: unknown; error: unknown }) {
  return vi.fn((table: string) => {
    if (table === 'organizations') return mockOrganizationsTable()
    if (table === 'consents') return mockConsentsTable()
    if (table === 'audit_log') return mockAuditTable()
    return {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            insertResult ?? { data: { id: PRESCRIPTION_UUID }, error: null },
          ),
        }),
      }),
    }
  })
}

/** Returns a mockFrom that handles consents + audit + medication_requests select */
function mockFromForRead(selectResult: { data: unknown; error: unknown }) {
  return vi.fn((table: string) => {
    if (table === 'organizations') return mockOrganizationsTable()
    if (table === 'consents') return mockConsentsTable()
    if (table === 'audit_log') return mockAuditTable()
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(selectResult),
        }),
      }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

const validCreateInput = {
  medicationCode: 'MED-001',
  medicationDisplay: 'Amoxicillin 500mg',
  medicationText: 'Free-text medication description',
  patientId: PATIENT_UUID,
  encounterId: ENCOUNTER_UUID,
  dosageInstruction: { text: 'Take 1 tablet 3 times daily', route: 'oral' },
  dispenseRequest: { numberOfRepeatsAllowed: 2, quantity: { value: 30, unit: 'tablets' } },
  interactionCheck: 'CLEAR' as const,
  interactionOverride: undefined,
  intent: 'order' as const,
  isOfflineCreated: false,
  hlcTimestamp: '000001715300000:00001:node-1',
}

// ─── medication.create ──────────────────────────────────────────────────────

describe('medication.create', () => {
  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.medication.create(validCreateInput)).rejects.toThrow()
  })

  it('denies PHARMACIST role', async () => {
    const ctx = createTestContext({ user: PHARMACIST_USER })
    const caller = createCaller(ctx)
    await expect(caller.medication.create(validCreateInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('denies LAB_TECH role', async () => {
    const ctx = createTestContext({ user: LAB_TECH_USER })
    const caller = createCaller(ctx)
    await expect(caller.medication.create(validCreateInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('creates prescription and returns id, qrCodeId, status', async () => {
    const mockFrom = mockFromForCreate()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.create(validCreateInput)
    expect(result.prescriptionId).toBeDefined()
    expect(result.qrCodeId).toBeDefined()
    expect(result.status).toBe('active')
    expect(result.prescriptionId).not.toBe(result.qrCodeId)
    expect(mockFrom).toHaveBeenCalledWith('medication_requests')
  })

  it('generates unique qrCodeId (UUID format)', async () => {
    const mockFrom = mockFromForCreate()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.create(validCreateInput)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(result.qrCodeId).toMatch(uuidRegex)
  })

  it('passes PHI fields through db.toRow() for encryption', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const toRowSpy = vi.spyOn(mockDb, 'toRow')

    const mockFrom = mockFromForCreate()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    try {
      await caller.medication.create(validCreateInput)
      expect(toRowSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dosageInstruction: validCreateInput.dosageInstruction,
          medicationText: validCreateInput.medicationText,
          status: 'active',
          prescriptionStatus: 'ACTIVE',
        }),
      )
    } finally {
      toRowSpy.mockRestore()
    }
  })

  it('emits PHI_WRITE audit event', async () => {
    const mockFrom = mockFromForCreate()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.medication.create(validCreateInput)
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')
  })

  it('rejects create when interactionCheck is BLOCKED without interactionOverride', async () => {
    const mockFrom = mockFromForCreate()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)
    await expect(
      caller.medication.create({ ...validCreateInput, interactionCheck: 'BLOCKED' as const, interactionOverride: undefined }),
    ).rejects.toThrow(/interactionOverride/i)
  })

  it('allows create when interactionCheck is BLOCKED with interactionOverride', async () => {
    const mockFrom = mockFromForCreate()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.create({
      ...validCreateInput,
      interactionCheck: 'BLOCKED' as const,
      interactionOverride: 'Patient has tolerated this medication previously',
    })
    expect(result.status).toBe('active')
  })

  it('returns idempotent success on duplicate prescriptionId', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'consents') return mockConsentsTable()
      if (table === 'audit_log') return mockAuditTable()
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '23505' },
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { requester_id: CLINICIAN_USER.sub },
              error: null,
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medication.create({
      ...validCreateInput,
      prescriptionId: PRESCRIPTION_UUID,
    })
    expect(result.prescriptionId).toBe(PRESCRIPTION_UUID)
    expect(result.alreadySynced).toBe(true)
  })
})

// ─── medication.read ────────────────────────────────────────────────────────

describe('medication.read', () => {
  const validInput = { prescriptionId: PRESCRIPTION_UUID, patientId: PATIENT_UUID }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.medication.read(validInput)).rejects.toThrow()
  })

  it('denies PHARMACIST role', async () => {
    const ctx = createTestContext({ user: PHARMACIST_USER })
    const caller = createCaller(ctx)
    await expect(caller.medication.read(validInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('denies LAB_TECH role', async () => {
    const ctx = createTestContext({ user: LAB_TECH_USER })
    const caller = createCaller(ctx)
    await expect(caller.medication.read(validInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('returns decrypted prescription via db.fromRow()', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const fromRowSpy = vi.spyOn(mockDb, 'fromRow')

    const mockRow = {
      id: PRESCRIPTION_UUID,
      status: 'active',
      prescription_status: 'ACTIVE',
      medication_display: 'Amoxicillin 500mg',
      medication_text: 'Free-text description',
      dosage_instruction: { text: 'Take 1 tablet' },
      interaction_override: null,
      subject_reference: `Patient/${PATIENT_UUID}`,
    }

    const mockFrom = mockFromForRead({ data: mockRow, error: null })
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    try {
      const result = await caller.medication.read(validInput)
      expect(fromRowSpy).toHaveBeenCalledWith(mockRow)
      expect(result.id).toBe(PRESCRIPTION_UUID)
    } finally {
      fromRowSpy.mockRestore()
    }
  })

  it('throws NOT_FOUND for non-existent prescription', async () => {
    const mockFrom = mockFromForRead({ data: null, error: { code: 'PGRST116' } })
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(caller.medication.read(validInput)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('emits PHI_READ audit event', async () => {
    const mockRow = {
      id: PRESCRIPTION_UUID,
      status: 'active',
      subject_reference: `Patient/${PATIENT_UUID}`,
    }

    const mockFrom = mockFromForRead({ data: mockRow, error: null })
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.medication.read(validInput)
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')
  })
})
