import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Supabase client before importing the router
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

// Must import after mock setup
const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  user?: { sub: string; role: string; sessionId: string } | null
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

beforeEach(() => {
  vi.clearAllMocks()
})

const MS_UUID_1 = '00000000-0000-4000-8000-000000000101'
const MS_UUID_2 = '00000000-0000-4000-8000-000000000102'
const RX_UUID = '00000000-0000-4000-8000-000000000201'
const ENC_UUID = '00000000-0000-4000-8000-000000000301'

const CLINICIAN_USER = { sub: 'doc-001', role: 'DOCTOR', sessionId: 'sess-1' }
const PHARMACIST_USER = { sub: 'pharm-001', role: 'PHARMACIST', sessionId: 'sess-2' }

describe('medicationStatement.listActive', () => {
  it('returns active medication statements for a patient', async () => {
    const mockStatements = [
      {
        id: MS_UUID_1,
        status: 'active',
        medication_display: 'Warfarin 5mg',
        subject_reference: 'Patient/pat-001',
      },
      {
        id: MS_UUID_2,
        status: 'active',
        medication_display: 'Metformin 850mg',
        subject_reference: 'Patient/pat-001',
      },
    ]

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: mockStatements,
          error: null,
        }),
      }),
    })

    // Audit insert (from AuditLogger)
    const auditMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { select: mockSelect }
      return { insert: auditMock }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medicationStatement.listActive({
      patientRef: 'Patient/pat-001',
    })

    expect(result.count).toBe(2)
    expect(result.statements).toHaveLength(2)
    expect(mockFrom).toHaveBeenCalledWith('medication_statements')
  })

  it('returns empty when no active statements exist', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    })

    const auditMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { select: mockSelect }
      return { insert: auditMock }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medicationStatement.listActive({
      patientRef: 'Patient/pat-999',
    })

    expect(result.count).toBe(0)
    expect(result.statements).toHaveLength(0)
  })

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(
      caller.medicationStatement.listActive({ patientRef: 'Patient/pat-001' }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('denies access to PHARMACIST role (no MedicationStatement permission)', async () => {
    const ctx = createTestContext({ user: PHARMACIST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medicationStatement.listActive({ patientRef: 'Patient/pat-001' }),
    ).rejects.toThrow('Access denied')
  })

  it('throws INTERNAL_SERVER_ERROR on database failure', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST500', message: 'db error' },
        }),
      }),
    })

    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medicationStatement.listActive({ patientRef: 'Patient/pat-001' }),
    ).rejects.toThrow('Failed to retrieve active medication statements')
  })
})

describe('medicationStatement.create', () => {
  const validInput = {
    id: MS_UUID_1,
    medicationCodeableConcept: {
      coding: [{ system: 'http://ultranos.local/medications', code: 'WAR001', display: 'Warfarin 5mg' }],
      text: 'Warfarin 5mg',
    },
    medicationDisplay: 'Warfarin 5mg',
    subjectReference: 'Patient/pat-001',
    effectivePeriodStart: '2026-04-20T10:00:00.000Z',
    dateAsserted: '2026-04-20T10:00:00.000Z',
    informationSourceReference: 'Practitioner/doc-001',
    sourceEncounterId: ENC_UUID,
    sourcePrescriptionId: RX_UUID,
    hlcTimestamp: '000001714400000:00000:node-abc',
  }

  it('creates a new medication statement', async () => {
    // Check for existing — none found
    const selectExistingMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
    })
    // Insert new statement
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: MS_UUID_1 },
          error: null,
        }),
      }),
    })
    // Audit
    const auditMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { select: selectExistingMock }
      if (callCount.n === 2) return { insert: insertMock }
      return { insert: auditMock }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medicationStatement.create(validInput)

    expect(result.id).toBe(MS_UUID_1)
    expect(result.action).toBe('created')
    expect(mockFrom).toHaveBeenCalledWith('medication_statements')
  })

  it('updates existing statement when duplicate prescription found', async () => {
    const selectExistingMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: MS_UUID_2 }],
              error: null,
            }),
          }),
        }),
      }),
    })
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: MS_UUID_2 },
            error: null,
          }),
        }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { select: selectExistingMock }
      return { update: updateMock }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medicationStatement.create(validInput)

    expect(result.id).toBe(MS_UUID_2)
    expect(result.action).toBe('updated')
  })

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(
      caller.medicationStatement.create(validInput),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('emits audit event on creation', async () => {
    const selectExistingMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
    })
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: MS_UUID_1 },
          error: null,
        }),
      }),
    })
    const auditInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { select: selectExistingMock }
      if (callCount.n === 2) return { insert: insertMock }
      return { insert: auditInsertMock }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.medicationStatement.create(validInput)

    // Audit logger uses supabase.from('audit_log')
    expect(mockFrom).toHaveBeenCalledWith('audit_log')
  })
})

describe('medicationStatement.updateStatus', () => {
  it('transitions active statement to completed', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: MS_UUID_1, subject_reference: 'Patient/pat-001' },
              error: null,
            }),
          }),
        }),
      }),
    })
    const auditMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { update: updateMock }
      return { insert: auditMock }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medicationStatement.updateStatus({
      id: MS_UUID_1,
      newStatus: 'completed',
      hlcTimestamp: '000001714400000:00000:node-abc',
    })

    expect(result.id).toBe(MS_UUID_1)
    expect(result.newStatus).toBe('completed')
  })

  it('transitions active statement to stopped', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: MS_UUID_1, subject_reference: 'Patient/pat-001' },
              error: null,
            }),
          }),
        }),
      }),
    })
    const auditMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
      }),
    })

    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) return { update: updateMock }
      return { insert: auditMock }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.medicationStatement.updateStatus({
      id: MS_UUID_1,
      newStatus: 'stopped',
      hlcTimestamp: '000001714400000:00000:node-abc',
    })

    expect(result.newStatus).toBe('stopped')
  })

  it('throws NOT_FOUND when statement is not active', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'not found' },
            }),
          }),
        }),
      }),
    })

    const mockFrom = vi.fn().mockReturnValue({ update: updateMock })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medicationStatement.updateStatus({
        id: MS_UUID_1,
        newStatus: 'completed',
        hlcTimestamp: '000001714400000:00000:node-abc',
      }),
    ).rejects.toThrow('Active medication statement not found')
  })

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(
      caller.medicationStatement.updateStatus({
        id: MS_UUID_1,
        newStatus: 'stopped',
        hlcTimestamp: '000001714400000:00000:node-abc',
      }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('validates id is a UUID', async () => {
    const ctx = createTestContext({ user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.medicationStatement.updateStatus({
        id: 'not-a-uuid',
        newStatus: 'stopped',
        hlcTimestamp: '000001714400000:00000:node-abc',
      }),
    ).rejects.toThrow()
  })
})
