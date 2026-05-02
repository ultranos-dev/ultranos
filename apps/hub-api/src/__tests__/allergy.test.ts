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

const CLINICIAN_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1' }
const ADMIN_USER = { sub: 'admin-001', role: 'ADMIN', sessionId: 'sess-2' }
const PHARMACIST_USER = { sub: 'pharma-001', role: 'PHARMACIST', sessionId: 'sess-3' }
const ALLERGY_UUID = '00000000-0000-4000-8000-000000000020'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('allergy.list', () => {
  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(
      caller.allergy.list({ patientId: 'patient-001' }),
    ).rejects.toThrow()
  })

  it('denies access to PHARMACIST role', async () => {
    const ctx = createTestContext({ user: PHARMACIST_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.allergy.list({ patientId: 'patient-001' }),
    ).rejects.toThrow(/denied|forbidden/i)
  })

  it('returns allergies for a patient (CLINICIAN)', async () => {
    const PATIENT_UUID = '00000000-0000-4000-8000-000000000001'
    const mockRows = [
      {
        id: ALLERGY_UUID,
        clinical_status_code: 'active',
        substance_text: 'Penicillin',
        patient_ref: `Patient/${PATIENT_UUID}`,
      },
    ]

    // P12: default (includeAll=false) adds .eq('clinical_status_code','active') after .order()
    // P14: patientId must be a valid UUID
    const mockFrom = vi.fn((table: string) => {
      if (table === 'audit_log') {
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
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.allergy.list({ patientId: PATIENT_UUID })
    expect(result.allergies).toHaveLength(1)
    expect(mockFrom).toHaveBeenCalledWith('allergy_intolerances')
  })

  it('allows ADMIN access', async () => {
    const PATIENT_UUID = '00000000-0000-4000-8000-000000000002'
    const mockFrom = vi.fn((table: string) => {
      if (table === 'audit_log') {
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
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: ADMIN_USER })
    const caller = createCaller(ctx)

    const result = await caller.allergy.list({ patientId: PATIENT_UUID })
    expect(result.allergies).toHaveLength(0)
  })

  it('emits a PHI_READ audit event on successful list', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'audit_log') {
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
      // allergy_intolerances: .select().eq(patient_ref).order().eq(status) — then awaited
      const finalEqMock = vi.fn().mockResolvedValue({ data: [], error: null })
      const orderMock = vi.fn().mockReturnValue({ eq: finalEqMock })
      const firstEqMock = vi.fn().mockReturnValue({ order: orderMock })
      return {
        select: vi.fn().mockReturnValue({ eq: firstEqMock }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.allergy.list({ patientId: '00000000-0000-4000-8000-000000000001' })

    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')
  })

  it('applies db.fromRow() transformation to each returned row', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const fromRowSpy = vi.spyOn(mockDb, 'fromRow')

    const mockRows = [
      { id: ALLERGY_UUID, substance_text: 'Penicillin', clinical_status_code: 'active', patient_ref: 'Patient/patient-001' },
      { id: '00000000-0000-4000-8000-000000000021', substance_text: 'Peanuts', clinical_status_code: 'active', patient_ref: 'Patient/patient-001' },
    ]

    const mockFrom = vi.fn((table: string) => {
      if (table === 'audit_log') {
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
      // allergy_intolerances: .select().eq(patient_ref).order().eq(status) — then awaited
      const finalEqMock = vi.fn().mockResolvedValue({ data: mockRows, error: null })
      const orderMock = vi.fn().mockReturnValue({ eq: finalEqMock })
      const firstEqMock = vi.fn().mockReturnValue({ order: orderMock })
      return {
        select: vi.fn().mockReturnValue({ eq: firstEqMock }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    try {
      const result = await caller.allergy.list({ patientId: '00000000-0000-4000-8000-000000000001' })

      // fromRow must be called once per returned row (2 rows = 2 calls)
      expect(fromRowSpy).toHaveBeenCalledTimes(2)
      expect(result.allergies).toHaveLength(2)
    } finally {
      fromRowSpy.mockRestore()
    }
  })
})

describe('allergy.create', () => {
  const validInput = {
    id: ALLERGY_UUID,
    clinicalStatusCode: 'active' as const,
    verificationStatusCode: 'confirmed' as const,
    type: 'allergy' as const,
    criticality: 'high' as const,
    substanceText: 'Penicillin',
    patientRef: 'Patient/patient-001',
    recordedDate: '2026-05-01T10:00:00Z',
    hlcTimestamp: '000001714600000:00001:node-1',
  }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)

    await expect(caller.allergy.create(validInput)).rejects.toThrow()
  })

  it('denies access to PHARMACIST role', async () => {
    const ctx = createTestContext({ user: PHARMACIST_USER })
    const caller = createCaller(ctx)

    await expect(caller.allergy.create(validInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('creates an allergy record and emits audit event', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: ALLERGY_UUID },
            error: null,
          }),
        }),
      }),
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.allergy.create(validInput)
    expect(result.success).toBe(true)
    expect(result.allergyId).toBe(ALLERGY_UUID)
    expect(result.alreadySynced).toBe(false)

    // Verify allergy_intolerances table was targeted
    expect(mockFrom).toHaveBeenCalledWith('allergy_intolerances')

    // Verify audit event was emitted (second call to from() for audit_log)
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')
  })

  it('handles duplicate gracefully (idempotent)', async () => {
    let callCount = 0
    // P13: on 23505 duplicate, router makes a second from() call to verify ownership
    const mockFrom = vi.fn(() => {
      callCount++
      if (callCount === 1) {
        // First call: insert fails with 23505 duplicate key
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: '23505', message: 'duplicate' },
              }),
            }),
          }),
        }
      }
      // Second call: ownership check — same patientRef, so idempotent success
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { patient_ref: validInput.patientRef },
              error: null,
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.allergy.create(validInput)
    expect(result.success).toBe(true)
    expect(result.alreadySynced).toBe(true)
  })

  it('denies access to ADMIN role', async () => {
    const ctx = createTestContext({ user: ADMIN_USER })
    const caller = createCaller(ctx)

    // Verify both: correct TRPCError code (FORBIDDEN not UNAUTHORIZED) and message
    await expect(
      caller.allergy.create({
        id: ALLERGY_UUID,
        clinicalStatusCode: 'active',
        verificationStatusCode: 'confirmed',
        type: 'allergy',
        criticality: 'high',
        substanceText: 'Penicillin',
        patientRef: 'Patient/patient-001',
        recordedDate: '2026-05-01T10:00:00.000Z',
        hlcTimestamp: '000001714600000:00001:node-1',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringMatching(/denied|forbidden/i),
    })
  })

  it('passes substanceFreeText through db.toRow() for field-level encryption', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const toRowSpy = vi.spyOn(mockDb, 'toRow')

    const mockFromWithAudit = vi.fn((table: string) => {
      if (table === 'audit_log') {
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
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: ALLERGY_UUID }, error: null }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFromWithAudit, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.allergy.create({
      id: ALLERGY_UUID,
      clinicalStatusCode: 'active',
      verificationStatusCode: 'confirmed',
      type: 'allergy',
      criticality: 'high',
      substanceText: 'Penicillin',
      substanceFreeText: 'Pen VK 500mg',
      patientRef: 'Patient/patient-001',
      recordedDate: '2026-05-01T10:00:00.000Z',
      hlcTimestamp: '000001714600000:00001:node-1',
    })

    try {
      expect(toRowSpy).toHaveBeenCalledWith(
        expect.objectContaining({ substanceFreeText: 'Pen VK 500mg' }),
      )
    } finally {
      toRowSpy.mockRestore()
    }
  })
})
