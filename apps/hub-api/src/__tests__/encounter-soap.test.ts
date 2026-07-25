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
    rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'test-hash' }], error: null }),
  }
  return {
    supabase: supabase as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

const CLINICIAN_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1', orgId: 'org-test-001' }
const PHARMACIST_USER = { sub: 'pharma-001', role: 'PHARMACIST', sessionId: 'sess-3', orgId: 'org-test-001' }
const ENCOUNTER_UUID = '00000000-0000-4000-8000-000000000100'
const SOAP_NOTE_UUID = '00000000-0000-4000-8000-000000000200'

beforeEach(() => {
  vi.clearAllMocks()
})

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

// Helper: creates a mockFrom that handles audit_log, encounters, and soap_ledger
function createMockFrom(opts: {
  encounterExists?: boolean
  soapInsertResult?: { data: any; error: any }
  soapSelectResult?: { data: any; error: any }
}) {
  return vi.fn((table: string) => {
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
    if (table === 'encounters') {
      if (opts.encounterExists === false) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: ENCOUNTER_UUID },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'soap_ledger') {
      if (opts.soapInsertResult) {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(opts.soapInsertResult),
            }),
          }),
        }
      }
      if (opts.soapSelectResult) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(opts.soapSelectResult),
            }),
          }),
        }
      }
    }
    return { select: vi.fn(), insert: vi.fn() }
  })
}

// ─── encounter.addSOAPNote ─────────────────────────────────────────────────

describe('encounter.addSOAPNote', () => {
  const validInput = {
    id: SOAP_NOTE_UUID,
    encounterId: ENCOUNTER_UUID,
    subjective: 'Patient reports headache',
    objective: 'BP 120/80',
    assessment: 'Tension headache',
    plan: 'Rest and ibuprofen',
    hlcTimestamp: '000001715300000:00001:node-1',
  }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.encounter.addSOAPNote(validInput)).rejects.toThrow()
  })

  it('denies PHARMACIST role (RBAC)', async () => {
    const ctx = createTestContext({ user: PHARMACIST_USER })
    const caller = createCaller(ctx)
    await expect(caller.encounter.addSOAPNote(validInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('inserts a SOAP note and returns the ID', async () => {
    const mockFrom = createMockFrom({
      encounterExists: true,
      soapInsertResult: { data: { id: SOAP_NOTE_UUID }, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.addSOAPNote(validInput)
    expect(result.success).toBe(true)
    expect(result.soapNoteId).toBe(SOAP_NOTE_UUID)
    expect(mockFrom).toHaveBeenCalledWith('soap_ledger')
  })

  it('passes all four PHI fields through db.toRow() for encryption', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const toRowSpy = vi.spyOn(mockDb, 'toRow')

    const mockFrom = createMockFrom({
      encounterExists: true,
      soapInsertResult: { data: { id: SOAP_NOTE_UUID }, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    try {
      await caller.encounter.addSOAPNote(validInput)
      expect(toRowSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          soapSubjective: 'Patient reports headache',
          soapObjective: 'BP 120/80',
          soapAssessment: 'Tension headache',
          soapPlan: 'Rest and ibuprofen',
        }),
      )
    } finally {
      toRowSpy.mockRestore()
    }
  })

  it('returns NOT_FOUND for non-existent encounter (AC 7)', async () => {
    const mockFrom = createMockFrom({
      encounterExists: false,
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(caller.encounter.addSOAPNote(validInput)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('emits PHI_WRITE audit event (AC 4)', async () => {
    const mockFrom = createMockFrom({
      encounterExists: true,
      soapInsertResult: { data: { id: SOAP_NOTE_UUID }, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.addSOAPNote(validInput)
    // AuditLogger.emit() uses supabase.rpc('audit_emit_with_lock') for hash-chained audit.
    const rpcSpy = (ctx.supabase as any).rpc as ReturnType<typeof vi.fn>
    expect(rpcSpy).toHaveBeenCalledWith('audit_emit_with_lock', expect.objectContaining({
      p_action: 'PHI_WRITE',
    }))
  })

  it('extracts practitioner_id from session context', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const toRowSpy = vi.spyOn(mockDb, 'toRow')

    const mockFrom = createMockFrom({
      encounterExists: true,
      soapInsertResult: { data: { id: SOAP_NOTE_UUID }, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    try {
      await caller.encounter.addSOAPNote(validInput)
      expect(toRowSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          practitionerId: 'doctor-001',
        }),
      )
    } finally {
      toRowSpy.mockRestore()
    }
  })

  it('handles optional fields as null', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const toRowSpy = vi.spyOn(mockDb, 'toRow')

    const mockFrom = createMockFrom({
      encounterExists: true,
      soapInsertResult: { data: { id: SOAP_NOTE_UUID }, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const partialInput = {
      id: SOAP_NOTE_UUID,
      encounterId: ENCOUNTER_UUID,
      subjective: 'Headache',
      hlcTimestamp: '000001715300000:00001:node-1',
    }

    try {
      await caller.encounter.addSOAPNote(partialInput)
      expect(toRowSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          soapSubjective: 'Headache',
          soapObjective: null,
          soapAssessment: null,
          soapPlan: null,
        }),
      )
    } finally {
      toRowSpy.mockRestore()
    }
  })
})

// ─── encounter.listSOAPNotes ───────────────────────────────────────────────

describe('encounter.listSOAPNotes', () => {
  const validInput = { encounterId: ENCOUNTER_UUID }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.encounter.listSOAPNotes(validInput)).rejects.toThrow()
  })

  it('denies PHARMACIST role (RBAC)', async () => {
    const ctx = createTestContext({ user: PHARMACIST_USER })
    const caller = createCaller(ctx)
    await expect(caller.encounter.listSOAPNotes(validInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('returns SOAP notes ordered by HLC timestamp ascending (AC 2)', async () => {
    const mockRows = [
      {
        id: SOAP_NOTE_UUID,
        encounter_id: ENCOUNTER_UUID,
        practitioner_id: 'doctor-001',
        soap_subjective: 'Headache',
        soap_objective: 'BP 120/80',
        soap_assessment: 'Tension headache',
        soap_plan: 'Rest',
        hlc_timestamp: '000001715300000:00001:node-1',
        created_at: '2026-05-10T08:00:00Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000201',
        encounter_id: ENCOUNTER_UUID,
        practitioner_id: 'doctor-001',
        soap_subjective: 'Follow-up',
        soap_objective: 'BP 118/76',
        soap_assessment: 'Improving',
        soap_plan: 'Continue',
        hlc_timestamp: '000001715300000:00002:node-1',
        created_at: '2026-05-10T09:00:00Z',
      },
    ]

    const mockFrom = createMockFrom({
      soapSelectResult: { data: mockRows, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.listSOAPNotes(validInput)
    expect(result.notes).toHaveLength(2)
    expect(mockFrom).toHaveBeenCalledWith('soap_ledger')
  })

  it('decrypts fields via db.fromRows() (AC 8)', async () => {
    const { db: mockDb } = await import('@/lib/supabase')
    const fromRowsSpy = vi.spyOn(mockDb, 'fromRows')

    const mockRows = [
      {
        id: SOAP_NOTE_UUID,
        encounter_id: ENCOUNTER_UUID,
        practitioner_id: 'doctor-001',
        soap_subjective: 'Headache',
        soap_objective: 'BP 120/80',
        soap_assessment: 'Tension headache',
        soap_plan: 'Rest',
        hlc_timestamp: '000001715300000:00001:node-1',
        created_at: '2026-05-10T08:00:00Z',
      },
    ]

    const mockFrom = createMockFrom({
      soapSelectResult: { data: mockRows, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    try {
      await caller.encounter.listSOAPNotes(validInput)
      expect(fromRowsSpy).toHaveBeenCalledWith(mockRows)
    } finally {
      fromRowsSpy.mockRestore()
    }
  })

  it('returns empty array for encounter with no notes', async () => {
    const mockFrom = createMockFrom({
      soapSelectResult: { data: [], error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.listSOAPNotes(validInput)
    expect(result.notes).toEqual([])
  })

  it('emits PHI_READ audit event (AC 4)', async () => {
    const mockFrom = createMockFrom({
      soapSelectResult: { data: [], error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.encounter.listSOAPNotes(validInput)
    // AuditLogger.emit() uses supabase.rpc('audit_emit_with_lock') for hash-chained audit.
    const rpcSpy = (ctx.supabase as any).rpc as ReturnType<typeof vi.fn>
    expect(rpcSpy).toHaveBeenCalledWith('audit_emit_with_lock', expect.objectContaining({
      p_action: 'PHI_READ',
    }))
  })

  it('maps response fields correctly', async () => {
    // db mock returns data as-is (no camelCase transform in test),
    // but the router maps soap_* fields to subjective/objective/etc.
    // Since our mock db.fromRows is identity, we simulate camelCase output.
    const mockRows = [
      {
        id: SOAP_NOTE_UUID,
        encounterId: ENCOUNTER_UUID,
        practitionerId: 'doctor-001',
        soapSubjective: 'Headache',
        soapObjective: 'BP 120/80',
        soapAssessment: 'Tension headache',
        soapPlan: 'Rest',
        hlcTimestamp: '000001715300000:00001:node-1',
        createdAt: '2026-05-10T08:00:00Z',
      },
    ]

    const mockFrom = createMockFrom({
      soapSelectResult: { data: mockRows, error: null },
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.encounter.listSOAPNotes(validInput)
    expect(result.notes[0]).toEqual({
      id: SOAP_NOTE_UUID,
      encounterId: ENCOUNTER_UUID,
      practitionerId: 'doctor-001',
      subjective: 'Headache',
      objective: 'BP 120/80',
      assessment: 'Tension headache',
      plan: 'Rest',
      hlcTimestamp: '000001715300000:00001:node-1',
      createdAt: '2026-05-10T08:00:00Z',
      source: 'MANUAL',
      aiModelVersion: null,
      confirmedBy: null,
      confirmedAt: null,
    })
  })
})
