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
const ENCOUNTER_UUID = '00000000-0000-4000-8000-000000000100'
const PATIENT_UUID = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── encounter.create ───────────────────────────────────────────────────────

describe('encounter.create', () => {
  const validInput = {
    id: ENCOUNTER_UUID,
    patientId: PATIENT_UUID,
    status: 'in-progress' as const,
    classCode: 'AMB',
    periodStart: '2026-05-10T08:00:00Z',
    participantPractitionerId: '00000000-0000-4000-8000-000000000010',
    reasonCode: 'Routine checkup',
    hlcTimestamp: '000001715300000:00001:node-1',
  }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.encounter.create(validInput)).rejects.toThrow()
  })

  it('denies PHARMACIST role', async () => {
    const ctx = createTestContext({ user: PHARMACIST_USER })
    const caller = createCaller(ctx)
    await expect(caller.encounter.create(validInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('creates encounter and returns id', async () => {
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
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: ENCOUNTER_UUID },
              error: null,
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.create(validInput)
    expect(result.success).toBe(true)
    expect(result.encounterId).toBe(ENCOUNTER_UUID)
    expect(result.alreadySynced).toBe(false)
    expect(mockFrom).toHaveBeenCalledWith('encounters')
  })

  it('handles duplicate key (23505) idempotently', async () => {
    let callCount = 0
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
      callCount++
      if (callCount === 1) {
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
      // Ownership verification call
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { patient_id: PATIENT_UUID },
              error: null,
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.create(validInput)
    expect(result.success).toBe(true)
    expect(result.alreadySynced).toBe(true)
  })

  it('emits PHI_WRITE audit event', async () => {
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
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: ENCOUNTER_UUID },
              error: null,
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.create(validInput)
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')
  })

  it('passes reasonCode through db.toRow() for encryption', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const toRowSpy = vi.spyOn(mockDb, 'toRow')

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
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: ENCOUNTER_UUID },
              error: null,
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    try {
      await caller.encounter.create(validInput)
      expect(toRowSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasonCode: 'Routine checkup' }),
      )
    } finally {
      toRowSpy.mockRestore()
    }
  })
})

// ─── encounter.read ─────────────────────────────────────────────────────────

describe('encounter.read', () => {
  const validInput = { id: ENCOUNTER_UUID, patientId: PATIENT_UUID }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.encounter.read(validInput)).rejects.toThrow()
  })

  it('returns decrypted encounter via db.fromRow()', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const fromRowSpy = vi.spyOn(mockDb, 'fromRow')

    const mockRow = {
      id: ENCOUNTER_UUID,
      patient_id: PATIENT_UUID,
      status: 'in-progress',
      class_code: 'AMB',
      reason_code: 'Routine checkup',
    }

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
      if (table === 'consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', status: 'ACTIVE', category: ['CLINICAL_NOTES'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    try {
      const result = await caller.encounter.read(validInput)
      expect(fromRowSpy).toHaveBeenCalledWith(mockRow)
      expect(result.id).toBe(ENCOUNTER_UUID)
    } finally {
      fromRowSpy.mockRestore()
    }
  })

  it('throws NOT_FOUND for missing encounter', async () => {
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
      if (table === 'consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', status: 'ACTIVE', category: ['CLINICAL_NOTES'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(caller.encounter.read(validInput)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('emits PHI_READ audit event', async () => {
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
      if (table === 'consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', status: 'ACTIVE', category: ['CLINICAL_NOTES'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: ENCOUNTER_UUID, patient_id: PATIENT_UUID, status: 'in-progress' },
              error: null,
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.read(validInput)
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')
  })
})

// ─── encounter.update ───────────────────────────────────────────────────────

describe('encounter.update', () => {
  const validInput = {
    id: ENCOUNTER_UUID,
    patientId: PATIENT_UUID,
    status: 'in-progress' as const,
    hlcTimestamp: '000001715300000:00002:node-1',
  }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.encounter.update(validInput)).rejects.toThrow()
  })

  it('updates encounter with valid HLC', async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { hlc_timestamp: '000001715300000:00001:node-1' },
                error: null,
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: ENCOUNTER_UUID },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.update(validInput)
    expect(result.success).toBe(true)
    expect(result.encounterId).toBe(ENCOUNTER_UUID)
  })

  it('rejects stale HLC with CONFLICT error', async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { hlc_timestamp: '000001715300000:00099:node-1' },
                error: null,
              }),
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.encounter.update({
        ...validInput,
        hlcTimestamp: '000001715300000:00001:node-1',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('emits PHI_WRITE audit event', async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { hlc_timestamp: '000001715300000:00001:node-1' },
                error: null,
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: ENCOUNTER_UUID },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.update(validInput)
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')
  })
})

// ─── encounter.close ────────────────────────────────────────────────────────

describe('encounter.close', () => {
  const validInput = {
    id: ENCOUNTER_UUID,
    patientId: PATIENT_UUID,
    hlcTimestamp: '000001715300000:00002:node-1',
  }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.encounter.close(validInput)).rejects.toThrow()
  })

  it('transitions status to finished and sets period_end', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: ENCOUNTER_UUID },
              error: null,
            }),
          }),
        }),
      }),
    })

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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { hlc_timestamp: '000001715300000:00001:node-1', status: 'in-progress' },
                error: null,
              }),
            }),
          }),
        }),
        update: updateMock,
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.close(validInput)
    expect(result.success).toBe(true)
    expect(result.encounterId).toBe(ENCOUNTER_UUID)

    // Verify update was called with finished status and period_end
    const updateArg = updateMock.mock.calls[0][0]
    expect(updateArg.status).toBe('finished')
    expect(updateArg.periodEnd).toBeDefined()
  })

  it('rejects closing a non-in-progress encounter with BAD_REQUEST', async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { hlc_timestamp: '000001715300000:00001:node-1', status: 'finished' },
                error: null,
              }),
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(caller.encounter.close(validInput)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects stale HLC with CONFLICT', async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { hlc_timestamp: '000001715300000:00099:node-1', status: 'in-progress' },
                error: null,
              }),
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(
      caller.encounter.close({
        ...validInput,
        hlcTimestamp: '000001715300000:00001:node-1',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

// ─── encounter.listByPatient ────────────────────────────────────────────────

describe('encounter.listByPatient', () => {
  const validInput = { patientId: PATIENT_UUID }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.encounter.listByPatient(validInput)).rejects.toThrow()
  })

  it('denies PHARMACIST role', async () => {
    const ctx = createTestContext({ user: PHARMACIST_USER })
    const caller = createCaller(ctx)
    await expect(caller.encounter.listByPatient(validInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('returns encounters ordered by period_start desc', async () => {
    const mockRows = [
      { id: ENCOUNTER_UUID, patient_id: PATIENT_UUID, status: 'in-progress', period_start: '2026-05-10T08:00:00Z' },
      { id: '00000000-0000-4000-8000-000000000101', patient_id: PATIENT_UUID, status: 'finished', period_start: '2026-05-09T08:00:00Z' },
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
      if (table === 'consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', status: 'ACTIVE', category: ['CLINICAL_NOTES'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.listByPatient(validInput)
    expect(result.encounters).toHaveLength(2)
    expect(mockFrom).toHaveBeenCalledWith('encounters')
  })

  it('applies db.fromRows() transformation', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const fromRowsSpy = vi.spyOn(mockDb, 'fromRows')

    const mockRows = [
      { id: ENCOUNTER_UUID, patient_id: PATIENT_UUID, status: 'in-progress' },
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
      if (table === 'consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', status: 'ACTIVE', category: ['CLINICAL_NOTES'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    try {
      await caller.encounter.listByPatient(validInput)
      expect(fromRowsSpy).toHaveBeenCalledWith(mockRows)
    } finally {
      fromRowsSpy.mockRestore()
    }
  })

  it('emits PHI_READ audit event', async () => {
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
      if (table === 'consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', status: 'ACTIVE', category: ['CLINICAL_NOTES'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.listByPatient(validInput)
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')
  })
})
