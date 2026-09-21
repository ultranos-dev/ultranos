// dispense-monitoring-producer.test.ts
// Story 52.1: assert that recordDispense (status:'completed') emits exactly one
// dispense_monitoring_events row for a monitored ATC, none for a non-monitored
// ATC, and none (but a MONITORING_CODE_UNRESOLVED audit) for an unresolvable code.
// Also asserts best-effort isolation: a throwing insert must NOT fail the dispense.

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
const MONITORED_ATC     = 'B01AA03'  // warfarin — seeded in medication_lab_mappings
const UNMONITORED_ATC   = 'N05AN01'  // lithium — NOT in medication_lab_mappings

const PHARMACIST_USER = { sub: PHARM_SUB, role: 'PHARMACIST' as const, sessionId: 'sess-mon-1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }

function baseInput(medicationCode: string) {
  return {
    dispenseId: DISPENSE_UUID,
    prescriptionId: PRESCRIPTION_UUID,
    medicationCode,
    medicationDisplay: 'Test Drug',
    patientRef: `Patient/${PATIENT_UUID}`,
    pharmacistRef: `Practitioner/${PHARM_SUB}`,
    whenHandedOver: new Date().toISOString(),
    hlcTimestamp: '000001757376000:00001:node-1',
    status: 'completed' as const,
  }
}

// ─── Mock builder ─────────────────────────────────────────────────────────────

/**
 * Extended buildMockFrom for the monitoring producer tests.
 *
 * @param medicationCode - code passed to recordDispense
 * @param inMappings    - whether medication_lab_mappings has a row for the ATC
 * @param monitoringInsertFn - optional override for the monitoring insert fn
 */
function buildMockFrom(
  medicationCode: string,
  inMappings: boolean,
  monitoringInsertFn?: ReturnType<typeof vi.fn>,
) {
  const monInsert = monitoringInsertFn ?? vi.fn().mockResolvedValue({ error: null })

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
                interaction_check: 'CLEAR',
                requester_id: null,
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
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
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

    if (table === 'drug_catalog') {
      // ATC-shaped codes return themselves (trusted); LOCAL-999 returns null
      const isAtcShaped = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(medicationCode)
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: isAtcShaped ? { atc_code: medicationCode } : null,
            }),
          }),
        }),
      }
    }

    if (table === 'medication_lab_mappings') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: inMappings
                ? { atc_code: medicationCode, medication_display: 'Test Drug (monitored)' }
                : null,
            }),
          }),
        }),
      }
    }

    if (table === 'dispense_monitoring_events') {
      return {
        insert: monInsert,
      }
    }

    // Catch-all (audit_log, notifications, sync_conflicts, etc.)
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

describe('recordDispense monitoring event producer (Story 52.1)', () => {
  it('inserts exactly one dispense_monitoring_events row when ATC is monitored', async () => {
    const monitoringInsert = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = buildMockFrom(MONITORED_ATC, /* inMappings */ true, monitoringInsert)
    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    const res = await caller.medication.recordDispense(baseInput(MONITORED_ATC))

    expect(res.success).toBe(true)
    expect(monitoringInsert).toHaveBeenCalledTimes(1)
    const insertArg = (monitoringInsert.mock.calls[0] as any[])[0]
    expect(insertArg).toMatchObject({
      dispensing_event_id: DISPENSE_UUID,
      patient_id: PATIENT_UUID,
      atc_code: MONITORED_ATC,
    })
  })

  it('inserts NO monitoring row for a non-monitored ATC', async () => {
    const monitoringInsert = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = buildMockFrom(UNMONITORED_ATC, /* inMappings */ false, monitoringInsert)
    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    const res = await caller.medication.recordDispense(baseInput(UNMONITORED_ATC))

    expect(res.success).toBe(true)
    expect(monitoringInsert).not.toHaveBeenCalled()
  })

  it('emits MONITORING_CODE_UNRESOLVED audit and NO monitoring insert for LOCAL code', async () => {
    const monitoringInsert = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = buildMockFrom('LOCAL-999', /* inMappings */ false, monitoringInsert)
    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    const res = await caller.medication.recordDispense(baseInput('LOCAL-999'))

    expect(res.success).toBe(true)
    expect(monitoringInsert).not.toHaveBeenCalled()
    // Audit must contain MONITORING_CODE_UNRESOLVED
    const unresolvedCall = mockAuditEmit.mock.calls.find(
      (c: any[]) => c[0]?.action === 'MONITORING_CODE_UNRESOLVED',
    )
    expect(unresolvedCall).toBeDefined()
  })

  it('still returns success when monitoring insert throws (best-effort isolation)', async () => {
    const monitoringInsert = vi.fn().mockRejectedValue(new Error('DB connection lost'))
    const mockFrom = buildMockFrom(MONITORED_ATC, /* inMappings */ true, monitoringInsert)
    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    // Must NOT throw — dispense is committed
    const res = await caller.medication.recordDispense(baseInput(MONITORED_ATC))

    expect(res.success).toBe(true)
  })
})
