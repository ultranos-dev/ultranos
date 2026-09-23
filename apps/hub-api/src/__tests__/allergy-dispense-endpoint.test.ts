/**
 * Story 57.1 — allergy.listForDispense (pharmacy dispense-time allergy gate).
 *
 * Asserts (AC 5, 6):
 * - PHARMACIST role can read a patient's active allergies for dispensing
 * - the endpoint is consent-gated (no active PRESCRIPTIONS/FULL_RECORD
 *   consent → FORBIDDEN)
 * - a PHI_READ audit event is emitted (CLAUDE.md Rule #6)
 * - the response is data-minimized: substance identity + criticality ONLY
 * - other roles (LAB_TECH, PATIENT) and unauthenticated callers are rejected
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Supabase client before importing the router
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => ({
      substanceText: data.substance_text,
      substanceCode: data.substance_code,
      substanceSystem: data.substance_system,
      substanceFreeText: data.substance_free_text,
      criticality: data.criticality,
    }),
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

type TestRole = 'DOCTOR' | 'PHARMACIST' | 'LAB_TECH' | 'PATIENT' | 'GUARDIAN' | 'SYSTEM' | 'ADMIN' | 'PLATFORM_ADMIN'

function createTestContext(overrides?: {
  supabaseFrom?: any
  user?: { sub: string; role: TestRole; sessionId: string; orgId: string | null; facilityId: string | null; status: string | null } | null
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

function mockOrganizationsTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { status: 'TRIAL' }, error: null }),
      }),
    }),
  }
}

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

/** Consents table mock: newest-first list for the patient. */
function mockConsentsTable(consents: Array<{ status: string; category: string[]; provision_end?: string | null }>) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: consents.map((c, i) => ({
            id: `consent-${i}`,
            status: c.status,
            category: c.category,
            date_time: '2026-09-01T00:00:00Z',
            provision_end: c.provision_end ?? null,
          })),
          error: null,
        }),
      }),
    }),
  }
}

/** allergy_intolerances mock: select → eq → eq resolves rows. */
function mockAllergiesTable(rows: any[]) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  }
}

const PHARMACIST_USER = { sub: 'pharm-001', role: 'PHARMACIST' as const, sessionId: 'sess-2', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }
const PATIENT_ID = '00000000-0000-4000-8000-000000000001'

const ACTIVE_PRESCRIPTIONS_CONSENT = [{ status: 'ACTIVE', category: ['PRESCRIPTIONS'] }]

const DB_ALLERGY_ROW = {
  id: 'a-1',
  substance_text: 'Penicillin',
  substance_code: 'Z88.0',
  substance_system: 'http://hl7.org/fhir/sid/icd-10',
  substance_free_text: 'Penicillin (free text)',
  criticality: 'high',
}

function buildFrom(opts: {
  consents?: Array<{ status: string; category: string[]; provision_end?: string | null }>
  allergyRows?: any[]
  auditInsert?: ReturnType<typeof vi.fn>
}) {
  const auditMock =
    opts.auditInsert ??
    vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
      }),
    })

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === 'organizations') return mockOrganizationsTable()
    if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
    if (table === 'consents') return mockConsentsTable(opts.consents ?? [])
    if (table === 'allergy_intolerances') return mockAllergiesTable(opts.allergyRows ?? [])
    return { insert: auditMock }
  })
  return { mockFrom, auditMock }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('allergy.listForDispense', () => {
  it('returns active allergies for a consented patient (PHARMACIST role)', async () => {
    const { mockFrom } = buildFrom({
      consents: ACTIVE_PRESCRIPTIONS_CONSENT,
      allergyRows: [DB_ALLERGY_ROW],
    })
    const caller = createCaller(createTestContext({ supabaseFrom: mockFrom, user: PHARMACIST_USER }))

    const result = await caller.allergy.listForDispense({ patientRef: PATIENT_ID })

    expect(result.count).toBe(1)
    expect(result.allergies[0]).toEqual({
      substanceText: 'Penicillin',
      substanceCode: 'Z88.0',
      substanceSystem: 'http://hl7.org/fhir/sid/icd-10',
      criticality: 'high',
    })
    expect(mockFrom).toHaveBeenCalledWith('allergy_intolerances')
  })

  it('is data-minimized — response items carry ONLY substance identity + criticality', async () => {
    const { mockFrom } = buildFrom({
      consents: ACTIVE_PRESCRIPTIONS_CONSENT,
      allergyRows: [{ ...DB_ALLERGY_ROW, patient_ref: PATIENT_ID, recorder_ref: 'pract-1', note: 'PHI note' }],
    })
    const caller = createCaller(createTestContext({ supabaseFrom: mockFrom, user: PHARMACIST_USER }))

    const result = await caller.allergy.listForDispense({ patientRef: PATIENT_ID })

    expect(Object.keys(result.allergies[0]!).sort()).toEqual([
      'criticality',
      'substanceCode',
      'substanceSystem',
      'substanceText',
    ])
  })

  it('accepts a "Patient/"-prefixed ref (the QR pat ref join key)', async () => {
    const { mockFrom } = buildFrom({
      consents: ACTIVE_PRESCRIPTIONS_CONSENT,
      allergyRows: [DB_ALLERGY_ROW],
    })
    const caller = createCaller(createTestContext({ supabaseFrom: mockFrom, user: PHARMACIST_USER }))

    const result = await caller.allergy.listForDispense({ patientRef: `Patient/${PATIENT_ID}` })
    expect(result.count).toBe(1)
  })

  it('is consent-gated: FORBIDDEN when the patient has no active consent (AC 6)', async () => {
    const { mockFrom } = buildFrom({ consents: [], allergyRows: [DB_ALLERGY_ROW] })
    const caller = createCaller(createTestContext({ supabaseFrom: mockFrom, user: PHARMACIST_USER }))

    await expect(
      caller.allergy.listForDispense({ patientRef: PATIENT_ID }),
    ).rejects.toThrow(/consent/i)
  })

  it('FORBIDDEN when consent is WITHDRAWN', async () => {
    const { mockFrom } = buildFrom({
      consents: [{ status: 'WITHDRAWN', category: ['PRESCRIPTIONS'] }],
      allergyRows: [DB_ALLERGY_ROW],
    })
    const caller = createCaller(createTestContext({ supabaseFrom: mockFrom, user: PHARMACIST_USER }))

    await expect(
      caller.allergy.listForDispense({ patientRef: PATIENT_ID }),
    ).rejects.toThrow(/consent/i)
  })

  it('a FULL_RECORD consent also grants access', async () => {
    const { mockFrom } = buildFrom({
      consents: [{ status: 'ACTIVE', category: ['FULL_RECORD'] }],
      allergyRows: [DB_ALLERGY_ROW],
    })
    const caller = createCaller(createTestContext({ supabaseFrom: mockFrom, user: PHARMACIST_USER }))

    const result = await caller.allergy.listForDispense({ patientRef: PATIENT_ID })
    expect(result.count).toBe(1)
  })

  it('emits a PHI_READ audit event (CLAUDE.md Rule #6)', async () => {
    // AuditLogger.emit writes via the audit_emit_with_lock RPC — assert on it.
    const { mockFrom } = buildFrom({
      consents: ACTIVE_PRESCRIPTIONS_CONSENT,
      allergyRows: [DB_ALLERGY_ROW],
    })
    const rpcMock = vi.fn().mockResolvedValue({
      data: [{ chain_hash: 'test-hash', chain_seq: 1 }],
      error: null,
    })
    const ctx = {
      supabase: { from: mockFrom, rpc: rpcMock } as never,
      user: PHARMACIST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    await caller.allergy.listForDispense({ patientRef: PATIENT_ID })

    const auditCall = rpcMock.mock.calls.find((c) => c[0] === 'audit_emit_with_lock')
    expect(auditCall).toBeTruthy()
    const params = auditCall![1] as Record<string, unknown>
    expect(params.p_action).toBe('PHI_READ')
    expect(params.p_resource_type).toBe('ALLERGY')
    expect(params.p_patient_id).toBe(PATIENT_ID)
    expect(params.p_actor_id).toBe('pharm-001')
  })

  it('rejects LAB_TECH role', async () => {
    const { mockFrom } = buildFrom({ consents: ACTIVE_PRESCRIPTIONS_CONSENT, allergyRows: [] })
    const caller = createCaller(
      createTestContext({
        supabaseFrom: mockFrom,
        user: { ...PHARMACIST_USER, role: 'LAB_TECH' as const },
      }),
    )

    await expect(
      caller.allergy.listForDispense({ patientRef: PATIENT_ID }),
    ).rejects.toThrow(/denied|forbidden/i)
  })

  it('rejects PATIENT role', async () => {
    const { mockFrom } = buildFrom({ consents: ACTIVE_PRESCRIPTIONS_CONSENT, allergyRows: [] })
    const caller = createCaller(
      createTestContext({
        supabaseFrom: mockFrom,
        user: { ...PHARMACIST_USER, role: 'PATIENT' as const },
      }),
    )

    await expect(
      caller.allergy.listForDispense({ patientRef: PATIENT_ID }),
    ).rejects.toThrow(/denied|forbidden/i)
  })

  it('requires authentication', async () => {
    const caller = createCaller(createTestContext({ user: null }))

    await expect(
      caller.allergy.listForDispense({ patientRef: PATIENT_ID }),
    ).rejects.toThrow()
  })
})
