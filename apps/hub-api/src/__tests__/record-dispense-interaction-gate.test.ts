import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

vi.mock('../trpc/middleware/enforceEntitlement', () => ({
  enforceEntitlement: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

vi.mock('../trpc/middleware/enforceVerifiedOrg', () => ({
  enforceVerifiedOrg: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return { ...actual, computeMpiResult: vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] }) }
})
vi.mock('@/lib/mpi-candidate-query', () => ({ fetchMpiCandidates: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken: vi.fn().mockResolvedValue('t'),
  verifyProceedToken: vi.fn().mockResolvedValue({ jti: 'j', candidateIds: [], maxScore: 0, issuedTo: 'pharm-uuid-1', exp: 9999999999 }),
  consumeProceedToken: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/async-mpi-scoring', () => ({ runAsyncMpiScoring: vi.fn().mockResolvedValue(undefined) }))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

// ─── Constants ────────────────────────────────────────────────────────────────

const DISPENSE_UUID     = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PRESCRIPTION_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PATIENT_UUID      = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PHARM_SUB         = 'pharm-uuid-1'

const PHARMACIST_USER = { sub: PHARM_SUB, role: 'PHARMACIST' as const, sessionId: 'sess-gate-1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }

const BASE_INPUT = {
  dispenseId: DISPENSE_UUID,
  prescriptionId: PRESCRIPTION_UUID,
  medicationCode: 'B01AA03',
  medicationDisplay: 'Warfarin',
  patientRef: `Patient/${PATIENT_UUID}`,
  pharmacistRef: `Practitioner/${PHARM_SUB}`,
  whenHandedOver: new Date().toISOString(),
  hlcTimestamp: '000001757376000:00001:node-1',
  status: 'completed' as const,
}

// ─── Mock builder ─────────────────────────────────────────────────────────────

/**
 * Build a mock supabase.from() for recordDispense.
 * The `interaction_check` value on the medication_requests row controls the gate.
 * Happy-path tables (dispenses, statements, etc.) resolve with success data.
 */
function buildMockFrom(interactionCheck: 'CLEAR' | 'BLOCKED' | 'UNAVAILABLE') {
  return vi.fn().mockImplementation((table: string) => {
    if (table === 'medication_requests') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: PRESCRIPTION_UUID,
                prescription_status: 'ACTIVE',
                status: 'active',
                hlc_timestamp: null,
                interaction_check: interactionCheck,
              },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: PRESCRIPTION_UUID,
                    prescription_status: 'DISPENSED',
                    status: 'completed',
                    dispensed_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'medication_dispenses') {
      return {
        // idempotency check (first call is SELECT)
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        // dispense INSERT
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: DISPENSE_UUID }, error: null }),
          }),
        }),
      }
    }

    if (table === 'dispense_reviews') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    if (table === 'medication_statements') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'ms-001' }, error: null }),
          }),
        }),
      }
    }

    // Catch-all (audit_log, dispense_conflicts, etc.)
    return {
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }
  })
}

function createTestContext(mockFrom: ReturnType<typeof vi.fn>) {
  return {
    supabase: {
      from: mockFrom,
      rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'abc123' }], error: null }),
    } as never,
    user: PHARMACIST_USER,
    headers: new Headers(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('recordDispense interaction gate (P0.2)', () => {
  it('rejects a BLOCKED prescription with no override', async () => {
    const ctx = createTestContext(buildMockFrom('BLOCKED'))
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(BASE_INPUT),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('rejects UNAVAILABLE with no override', async () => {
    const ctx = createTestContext(buildMockFrom('UNAVAILABLE'))
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(BASE_INPUT),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('ALLOWS a BLOCKED prescription WITH an overrideReason', async () => {
    const ctx = createTestContext(buildMockFrom('BLOCKED'))
    const caller = createCaller(ctx)

    const res = await caller.medication.recordDispense({
      ...BASE_INPUT,
      overrideReason: 'Prescriber consulted; benefit outweighs risk',
    })

    expect(res.success).toBe(true)
  })

  it('allows CLEAR without override', async () => {
    const ctx = createTestContext(buildMockFrom('CLEAR'))
    const caller = createCaller(ctx)

    const res = await caller.medication.recordDispense(BASE_INPUT)

    expect(res.success).toBe(true)
  })
})
