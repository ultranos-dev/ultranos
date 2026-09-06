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
  supabaseRpc?: ReturnType<typeof vi.fn>
  user?: { sub: string; practitionerId?: string; role: string; sessionId: string; orgId?: string } | null
}) {
  const supabase = {
    from: overrides?.supabaseFrom ?? vi.fn(),
    // AuditLogger.emit() writes through rpc('audit_emit_with_lock') and expects a
    // row carrying chain_hash back; default to a successful stub so audit never
    // silently fails in tests. Pass supabaseRpc to assert on the audit call.
    rpc: overrides?.supabaseRpc ?? vi.fn().mockResolvedValue({ data: [{ chain_hash: 'test-hash' }], error: null }),
  }
  return {
    supabase: supabase as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

const CLINICIAN_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1', orgId: 'org-test-001' }
const ADMIN_USER = { sub: 'admin-001', role: 'ADMIN', sessionId: 'sess-2', orgId: 'org-test-001' }
const PHARMACIST_USER = { sub: 'pharma-001', role: 'PHARMACIST', sessionId: 'sess-3', orgId: 'org-test-001' }
const ENCOUNTER_UUID = '00000000-0000-4000-8000-000000000100'
const PATIENT_UUID = '00000000-0000-4000-8000-000000000001'


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

/** Shared audit_log table mock (chain-tail read + insert). */
function mockAuditLogTable() {
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

/**
 * Mock for the `encounters` table in encounter.create tests. create() now:
 *  1) findOpenForPractitioner:  .select('id').eq().eq().contains().maybeSingle()  → { data: open }
 *  2) insert:                   .insert(row).select('id').single()                → insert result / error
 *  3) (on 23505) raceOpen:      same as (1)                                       → { data: open }
 *  4) (on 23505) ownership:     .select('subject_id').eq('id').single()           → { data: ownership }
 * maybeSingle terminal returns the open-encounter probe; single terminal returns ownership.
 */
function mockEncountersCreateTable(opts?: {
  open?: { id: string } | null
  insertError?: { code: string; message: string } | null
  insertData?: { id: string }
  ownership?: { subject_id: string } | null
}) {
  const open = opts?.open ?? null
  const insertError = opts?.insertError ?? null
  const insertData = opts?.insertData ?? { id: ENCOUNTER_UUID }
  const ownership = opts?.ownership ?? { subject_id: PATIENT_UUID }
  const selectChain: Record<string, unknown> = {}
  Object.assign(selectChain, {
    eq: vi.fn(() => selectChain),
    contains: vi.fn(() => selectChain),
    maybeSingle: vi.fn().mockResolvedValue({ data: open, error: null }),
    single: vi.fn().mockResolvedValue({ data: ownership, error: null }),
  })
  return {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: insertError ? null : insertData,
          error: insertError,
        }),
      })),
    })),
  }
}

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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      if (table === 'audit_log') return mockAuditLogTable()
      return mockEncountersCreateTable()
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.create(validInput)
    expect(result.success).toBe(true)
    expect(result.encounterId).toBe(ENCOUNTER_UUID)
    expect(result.alreadySynced).toBe(false)
    expect(mockFrom).toHaveBeenCalledWith('encounters')
  })

  it('resumes an existing open encounter for the same patient+practitioner', async () => {
    // findOpenForPractitioner returns a DIFFERENT open encounter id → resume it,
    // never insert a duplicate (the duplicate-open-encounter fix).
    const EXISTING_OPEN_ID = '00000000-0000-4000-8000-0000000009ff'
    const insertSpy = vi.fn()
    const mockFrom = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      if (table === 'audit_log') return mockAuditLogTable()
      const t = mockEncountersCreateTable({ open: { id: EXISTING_OPEN_ID } })
      t.insert = insertSpy
      return t
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.create(validInput)
    expect(result.success).toBe(true)
    expect(result.encounterId).toBe(EXISTING_OPEN_ID)
    expect((result as { resumed?: boolean }).resumed).toBe(true)
    expect(insertSpy).not.toHaveBeenCalled() // no duplicate insert
  })

  it('handles duplicate key (23505) idempotently', async () => {
    // No pre-existing open encounter (open: null) so the flow reaches insert,
    // which returns 23505; raceOpen is also null → same-id idempotent path.
    const mockFrom = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      if (table === 'audit_log') return mockAuditLogTable()
      return mockEncountersCreateTable({
        open: null,
        insertError: { code: '23505', message: 'duplicate' },
        ownership: { subject_id: PATIENT_UUID },
      })
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.create(validInput)
    expect(result.success).toBe(true)
    expect(result.alreadySynced).toBe(true)
  })

  it('emits PHI_WRITE audit event', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      if (table === 'audit_log') return mockAuditLogTable()
      return mockEncountersCreateTable()
    })

    const rpc = vi.fn().mockResolvedValue({ data: [{ chain_hash: 'test-hash' }], error: null })
    const ctx = createTestContext({ supabaseFrom: mockFrom, supabaseRpc: rpc, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.create(validInput)
    expect(rpc).toHaveBeenCalledWith(
      'audit_emit_with_lock',
      expect.objectContaining({ p_action: 'PHI_WRITE', p_resource_type: 'Encounter' }),
    )
  })

  it('passes reasonCode through db.toRow() for encryption', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const toRowSpy = vi.spyOn(mockDb, 'toRow')

    const mockFrom = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      if (table === 'audit_log') return mockAuditLogTable()
      return mockEncountersCreateTable()
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
      subject_id: PATIENT_UUID,
      status: 'in-progress',
      class_code: 'AMB',
      reason_code: 'Routine checkup',
    }

    const mockFrom = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
              data: { id: ENCOUNTER_UUID, subject_id: PATIENT_UUID, status: 'in-progress' },
              error: null,
            }),
          }),
        }),
      }
    })

    const rpc = vi.fn().mockResolvedValue({ data: [{ chain_hash: 'test-hash' }], error: null })
    const ctx = createTestContext({ supabaseFrom: mockFrom, supabaseRpc: rpc, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.read(validInput)
    expect(rpc).toHaveBeenCalledWith(
      'audit_emit_with_lock',
      expect.objectContaining({ p_action: 'PHI_READ', p_resource_type: 'Encounter' }),
    )
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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

    const rpc = vi.fn().mockResolvedValue({ data: [{ chain_hash: 'test-hash' }], error: null })
    const ctx = createTestContext({ supabaseFrom: mockFrom, supabaseRpc: rpc, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.update(validInput)
    expect(rpc).toHaveBeenCalledWith(
      'audit_emit_with_lock',
      expect.objectContaining({ p_action: 'PHI_WRITE', p_resource_type: 'Encounter' }),
    )
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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

    const rpc = vi.fn().mockResolvedValue({ data: [{ chain_hash: 'test-hash' }], error: null })
    const ctx = createTestContext({ supabaseFrom: mockFrom, supabaseRpc: rpc, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.listByPatient(validInput)
    expect(rpc).toHaveBeenCalledWith(
      'audit_emit_with_lock',
      expect.objectContaining({ p_action: 'PHI_READ', p_resource_type: 'Encounter' }),
    )
  })
})

// ─── encounter.listByPractitioner ───────────────────────────────────────────

describe('encounter.listByPractitioner', () => {
  const validInput = { limit: 100 }

  /**
   * Builds the supabase `from` mock for the keyset chain
   * .from('encounters').select('*').contains(...).in(...).order(...).order(...).limit(...)[.gt(...)]
   * The encounters query builder is a single thenable object whose chainable
   * methods all return itself, so `await query` (with or without a trailing
   * .gt() cursor) resolves to { data, error }. The `q` handle is returned so
   * tests can assert on contains/in/gt.
   */
  function buildMockFrom(encounterRows: unknown[] = []) {
    const result = { data: encounterRows, error: null }
    const q: Record<string, ReturnType<typeof vi.fn> | unknown> = {}
    Object.assign(q, {
      select: vi.fn(() => q),
      contains: vi.fn(() => q),
      in: vi.fn(() => q),
      order: vi.fn(() => q),
      limit: vi.fn(() => q),
      gt: vi.fn(() => q),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    })

    const from = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
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
      if (table === 'encounters') return q
      // Benign default for any table a middleware might touch
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    })

    return { from, q }
  }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.encounter.listByPractitioner(validInput)).rejects.toThrow()
  })

  it('denies PHARMACIST role', async () => {
    const ctx = createTestContext({ user: PHARMACIST_USER })
    const caller = createCaller(ctx)
    await expect(caller.encounter.listByPractitioner(validInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('returns the practitioner\'s encounters', async () => {
    const mockRows = [
      { id: ENCOUNTER_UUID, subject_id: PATIENT_UUID, status: 'planned', created_at: '2026-05-10T08:00:00Z' },
    ]
    const { from } = buildMockFrom(mockRows)
    const ctx = createTestContext({ supabaseFrom: from, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.listByPractitioner(validInput)
    expect(result.encounters).toHaveLength(1)
    expect(from).toHaveBeenCalledWith('encounters')
  })

  it('scopes to the authenticated practitioner and includes active statuses only', async () => {
    const { from, q } = buildMockFrom()
    const ctx = createTestContext({ supabaseFrom: from, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.listByPractitioner(validInput)
    // `participant` is jsonb — the containment value must be a JSON *string*
    // (`cs.[...]`), not a JS array (which supabase-js serializes as a Postgres
    // array literal `cs.{...}` → "invalid input syntax for type json").
    expect((q.contains as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'participant',
      JSON.stringify([{ individual: { reference: `Practitioner/${CLINICIAN_USER.sub}` } }]),
    )
    expect((q.in as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('status', [
      'planned',
      'in-progress',
      'finished',
    ])
  })

  it('matches on the practitioner_id claim reference when present (not raw sub)', async () => {
    // Hardening: if a practitioner_id access-token claim is ever introduced, the
    // spoke stores participant as Practitioner/{practitioner_id}; the endpoint
    // must match that, not raw sub.
    const { from, q } = buildMockFrom()
    const ctx = createTestContext({
      supabaseFrom: from,
      user: { ...CLINICIAN_USER, practitionerId: 'fhir-prac-99' },
    })
    const caller = createCaller(ctx)

    await caller.encounter.listByPractitioner(validInput)
    expect((q.contains as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'participant',
      JSON.stringify([{ individual: { reference: 'Practitioner/fhir-prac-99' } }]),
    )
  })

  it('returns nextCursor (last created_at) when the page is full', async () => {
    const mockRows = [
      { id: ENCOUNTER_UUID, subject_id: PATIENT_UUID, status: 'in-progress', created_at: '2026-05-09T08:00:00Z' },
      { id: '00000000-0000-4000-8000-000000000101', subject_id: PATIENT_UUID, status: 'finished', created_at: '2026-05-10T08:00:00Z' },
    ]
    const { from } = buildMockFrom(mockRows)
    const ctx = createTestContext({ supabaseFrom: from, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.listByPractitioner({ limit: 2 })
    expect(result.nextCursor).toBe('2026-05-10T08:00:00Z')
  })

  it('returns null nextCursor on a partial (last) page', async () => {
    const mockRows = [
      { id: ENCOUNTER_UUID, subject_id: PATIENT_UUID, status: 'finished', created_at: '2026-05-10T08:00:00Z' },
    ]
    const { from } = buildMockFrom(mockRows)
    const ctx = createTestContext({ supabaseFrom: from, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.listByPractitioner({ limit: 100 })
    expect(result.nextCursor).toBeNull()
  })

  it('applies the cursor via gt(created_at) when provided', async () => {
    const { from, q } = buildMockFrom()
    const ctx = createTestContext({ supabaseFrom: from, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.listByPractitioner({ cursor: '2026-05-01T00:00:00Z', limit: 100 })
    expect((q.gt as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('created_at', '2026-05-01T00:00:00Z')
  })

  it('emits a PHI_READ audit event via audit_emit_with_lock', async () => {
    // AuditLogger.emit() writes through the rpc('audit_emit_with_lock') path,
    // so the context needs an rpc mock returning a chain_hash for emit to succeed.
    const { from } = buildMockFrom([])
    const rpc = vi.fn().mockResolvedValue({ data: [{ chain_hash: 'test-hash' }], error: null })
    const ctx = {
      supabase: { from, rpc } as never,
      user: CLINICIAN_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    await caller.encounter.listByPractitioner(validInput)
    expect(rpc).toHaveBeenCalledWith(
      'audit_emit_with_lock',
      expect.objectContaining({
        p_action: 'PHI_READ',
        p_resource_type: 'Encounter',
        p_actor_id: CLINICIAN_USER.sub,
        p_resource_id: `practitioner-encounters:${CLINICIAN_USER.sub}`,
      }),
    )
  })
})
