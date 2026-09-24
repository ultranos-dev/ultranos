import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OverrideReasonCode } from '@ultranos/shared-types'

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
const SUPERVISOR_UUID   = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SUPERVISOR_PIN    = '4321'

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

// A valid structured supervisor override (distinct supervisor, same org).
const VALID_OVERRIDE = {
  overrideReasonCode: OverrideReasonCode.BENEFIT_OUTWEIGHS_RISK,
  overrideReason: 'Prescriber consulted; benefit outweighs risk',
  supervisorAuth: { supervisorId: SUPERVISOR_UUID, supervisorPin: SUPERVISOR_PIN },
}

// Real SHA-256 hash of the PIN — the service (unmocked) hashes and compares.
const { createHash } = await import('node:crypto')
const SUPERVISOR_PIN_HASH = createHash('sha256').update(SUPERVISOR_PIN).digest('hex')

// ─── Mock builder ─────────────────────────────────────────────────────────────

/**
 * Build a mock supabase.from() for recordDispense.
 * `serverStatus` is the AUTHORITATIVE interaction_check_server that the gate now
 * evaluates (never the client-attested interaction_check). Set them independently
 * to prove the gate ignores the client value.
 */
function buildMockFrom(opts: {
  serverStatus: 'CLEAR' | 'BLOCKED' | 'UNAVAILABLE' | null
  clientStatus?: 'CLEAR' | 'BLOCKED' | 'UNAVAILABLE'
  supervisorRow?: Record<string, unknown> | null
}) {
  const { serverStatus, clientStatus = 'CLEAR', supervisorRow } = opts
  return vi.fn().mockImplementation((table: string) => {
    if (table === 'practitioners') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data:
                supervisorRow === undefined
                  ? {
                      id: SUPERVISOR_UUID,
                      role: 'DOCTOR',
                      org_id: 'org-test-001',
                      kyc_status: 'ACTIVE',
                      supervisor_pin_hash: SUPERVISOR_PIN_HASH,
                    }
                  : supervisorRow,
              error: null,
            }),
          }),
        }),
      }
    }
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
                interaction_check: clientStatus,
                interaction_check_server: serverStatus,
                subject_reference: PATIENT_UUID,
                medication_display: 'Warfarin',
                requester_id: null,
              },
              error: null,
            }),
            // materialization update path (interaction_check_server = ...)
          }),
        }),
        update: vi.fn().mockReturnValue({
          // First .eq() serves BOTH:
          //   - the status update chain: .eq('id').eq('prescription_status').select().single()
          //   - the materialization update: await .update({interaction_check_server}).eq('id')
          // so it is a thenable that also exposes a chainable .eq().
          eq: vi.fn().mockReturnValue(
            Object.assign(Promise.resolve({ data: null, error: null }), {
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
          ),
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

describe('recordDispense server-authoritative interaction gate (Story 57.2)', () => {
  it('rejects a server-BLOCKED prescription with no override', async () => {
    const ctx = createTestContext(buildMockFrom({ serverStatus: 'BLOCKED' }))
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(BASE_INPUT),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('rejects server-UNAVAILABLE with no override', async () => {
    const ctx = createTestContext(buildMockFrom({ serverStatus: 'UNAVAILABLE' }))
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(BASE_INPUT),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('H-HUB-1: a tampered client CLEAR cannot pass when the SERVER status is BLOCKED', async () => {
    // Client attested CLEAR, but the authoritative server value is BLOCKED.
    const ctx = createTestContext(buildMockFrom({ serverStatus: 'BLOCKED', clientStatus: 'CLEAR' }))
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense(BASE_INPUT),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('a free-text-only overrideReason (no structured code / supervisor) NO LONGER bypasses the gate', async () => {
    const ctx = createTestContext(buildMockFrom({ serverStatus: 'BLOCKED' }))
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense({
        ...BASE_INPUT,
        overrideReason: 'benefit outweighs risk',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('rejects self-supervision (supervisor id === dispensing pharmacist) → FORBIDDEN', async () => {
    // The pharmacist's own id must be a valid UUID here so the id passes input
    // validation and the handler's self-supervision guard is what rejects it.
    const selfCtx = {
      supabase: {
        from: buildMockFrom({ serverStatus: 'BLOCKED' }),
        rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'abc123' }], error: null }),
      } as never,
      user: { ...PHARMACIST_USER, sub: SUPERVISOR_UUID },
      headers: new Headers(),
    }
    const caller = createCaller(selfCtx)

    await expect(
      caller.medication.recordDispense({
        ...BASE_INPUT,
        pharmacistRef: `Practitioner/${SUPERVISOR_UUID}`,
        ...VALID_OVERRIDE,
        supervisorAuth: { supervisorId: SUPERVISOR_UUID, supervisorPin: SUPERVISOR_PIN },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects an invalid supervisor PIN → UNAUTHORIZED', async () => {
    const ctx = createTestContext(buildMockFrom({ serverStatus: 'BLOCKED' }))
    const caller = createCaller(ctx)

    await expect(
      caller.medication.recordDispense({
        ...BASE_INPUT,
        ...VALID_OVERRIDE,
        supervisorAuth: { supervisorId: SUPERVISOR_UUID, supervisorPin: '0000' },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('ALLOWS a server-BLOCKED dispense with a VALID verified supervisor override', async () => {
    const ctx = createTestContext(buildMockFrom({ serverStatus: 'BLOCKED' }))
    const caller = createCaller(ctx)

    const res = await caller.medication.recordDispense({ ...BASE_INPUT, ...VALID_OVERRIDE })
    expect(res.success).toBe(true)
  })

  it('allows CLEAR without override', async () => {
    const ctx = createTestContext(buildMockFrom({ serverStatus: 'CLEAR' }))
    const caller = createCaller(ctx)

    const res = await caller.medication.recordDispense(BASE_INPUT)
    expect(res.success).toBe(true)
  })

  it('offline-attested override on a server-BLOCKED rx is accepted (drain-time verification deferred)', async () => {
    const ctx = createTestContext(buildMockFrom({ serverStatus: 'BLOCKED' }))
    const caller = createCaller(ctx)

    const res = await caller.medication.recordDispense({
      ...BASE_INPUT,
      ...VALID_OVERRIDE,
      // even a bogus PIN is accepted offline — it is verified at drain, not here
      supervisorAuth: { supervisorId: SUPERVISOR_UUID, supervisorPin: 'unverifiable-offline' },
      overrideAttestedOffline: true,
    })
    expect(res.success).toBe(true)
  })
})
