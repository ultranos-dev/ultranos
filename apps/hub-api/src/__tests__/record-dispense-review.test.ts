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

// Mock MPI modules loaded via _app
vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return { ...actual, computeMpiResult: vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] }) }
})
vi.mock('@/lib/mpi-candidate-query', () => ({ fetchMpiCandidates: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken: vi.fn().mockResolvedValue('t'),
  verifyProceedToken: vi.fn().mockResolvedValue({ jti: 'j', candidateIds: [], maxScore: 0, issuedTo: 'doctor-001', exp: 9999999999 }),
  consumeProceedToken: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/async-mpi-scoring', () => ({ runAsyncMpiScoring: vi.fn().mockResolvedValue(undefined) }))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

const DISPENSE_UUID   = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PRESCRIPTION_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PATIENT_UUID    = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PHARM_SUB       = 'pharm-uuid-1'
const SUPERVISOR_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SUPERVISOR_PIN  = '4321'

const { createHash } = await import('node:crypto')
const SUPERVISOR_PIN_HASH = createHash('sha256').update(SUPERVISOR_PIN).digest('hex')

const PHARMACIST_USER = { sub: PHARM_SUB, role: 'PHARMACIST' as const, sessionId: 'sess-dispense-1', orgId: 'org-test-001', facilityId: null, status: 'ACTIVE' }

const VALID_DISPENSE_INPUT = {
  dispenseId: DISPENSE_UUID,
  prescriptionId: PRESCRIPTION_UUID,
  medicationCode: 'MED-001',
  medicationDisplay: 'Amoxicillin 500mg',
  patientRef: `Patient/${PATIENT_UUID}`,
  pharmacistRef: `Practitioner/${PHARM_SUB}`,
  whenHandedOver: '2026-09-08T10:00:00.000Z',
  hlcTimestamp: '000001757376000:00001:node-1',
  status: 'completed' as const,
}

// Story 57.2: a structured, server-verifiable supervisor override.
const STRUCTURED_OVERRIDE = {
  overrideReasonCode: OverrideReasonCode.BENEFIT_OUTWEIGHS_RISK,
  overrideReason: 'Supervisor: Dr. Sahar. Reason: chronic med, benefit outweighs risk.',
  supervisorAuth: { supervisorId: SUPERVISOR_UUID, supervisorPin: SUPERVISOR_PIN },
}

/** practitioners lookup for a valid distinct supervisor in the same org. */
function supervisorMock() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: SUPERVISOR_UUID,
            role: 'DOCTOR',
            org_id: 'org-test-001',
            kyc_status: 'ACTIVE',
            supervisor_pin_hash: SUPERVISOR_PIN_HASH,
          },
          error: null,
        }),
      }),
    }),
  }
}

/** Standard CLEAR (server-authoritative) active-rx fetch row. */
const RX_SELECT_DATA = {
  id: PRESCRIPTION_UUID,
  prescription_status: 'ACTIVE',
  status: 'active',
  hlc_timestamp: null,
  interaction_check: 'CLEAR',
  interaction_check_server: 'CLEAR',
  subject_reference: PATIENT_UUID,
  medication_display: 'Amoxicillin 500mg',
  requester_id: null,
}

/**
 * Build a mockFrom function that:
 * - Records all inserts by table name in the provided `inserts` map.
 * - Handles the DB operations recordDispense calls:
 *   1. medication_requests SELECT (fetch current prescription)
 *   2. medication_dispenses SELECT (idempotency check — returns empty)
 *   3. medication_dispenses INSERT (the dispense itself)
 *   4. medication_requests UPDATE (status update)
 *   5. medication_statements SELECT/INSERT (createMedicationStatementOnDispense)
 *   6. dispense_reviews INSERT (the new review — what we're testing)
 *   7. audit_log / rpc (audit emissions — handled via rpc mock)
 */
function buildMockFrom(inserts: Record<string, unknown[]>) {
  let dispenseInsertCount = 0
  let rxUpdateCount = 0

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
                    dispensed_at: '2026-09-08T10:00:00.000Z',
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
      dispenseInsertCount++
      // First call is the idempotency check SELECT
      if (dispenseInsertCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          // Also needs to handle the actual dispense INSERT
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: DISPENSE_UUID }, error: null }),
            }),
          }),
        }
      }
      // Subsequent call is the actual INSERT
      return {
        insert: (row: unknown) => {
          ;(inserts[table] ??= []).push(row)
          return Promise.resolve({ data: { id: DISPENSE_UUID }, error: null })
        },
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }
    }

    if (table === 'dispense_reviews') {
      return {
        insert: (row: unknown) => {
          ;(inserts[table] ??= []).push(row)
          return Promise.resolve({ error: null })
        },
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

    // Default: audit_log and anything else — best-effort resolves
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

function createTestContext(mockFrom: ReturnType<typeof vi.fn>, user = PHARMACIST_USER) {
  return {
    supabase: {
      from: mockFrom,
      rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'abc123' }], error: null }),
    } as never,
    user,
    headers: new Headers(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── recordDispense + dispense_reviews ──────────────────────────────────────

describe('medication.recordDispense — dispense_reviews on override', () => {
  it('creates a PENDING dispense_reviews row when overrideReason is provided', async () => {
    const inserts: Record<string, unknown[]> = {}

    /*
     * This mockFrom uses a simpler table-keyed approach: every table that
     * recordDispense queries returns the happy-path data it needs.  We
     * intercept inserts into dispense_reviews to assert the review row.
     */
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'practitioners') return supervisorMock()
      if (table === 'medication_requests') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: RX_SELECT_DATA,
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
                      dispensed_at: '2026-09-08T10:00:00.000Z',
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
          // idempotency check
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          // actual insert
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: DISPENSE_UUID }, error: null }),
            }),
          }),
        }
      }

      if (table === 'dispense_reviews') {
        return {
          insert: (row: unknown) => {
            ;(inserts[table] ??= []).push(row)
            return Promise.resolve({ error: null })
          },
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

      // Catch-all (audit_log, etc.)
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

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    await caller.medication.recordDispense({
      ...VALID_DISPENSE_INPUT,
      ...STRUCTURED_OVERRIDE,
    })

    const review = (inserts['dispense_reviews'] ?? [])[0] as Record<string, unknown>
    expect(review).toBeTruthy()
    // Story 57.2: a VERIFIED supervisor override is recorded PENDING with the
    // REAL supervisor id (H-HUB-2 — never the pharmacist's own), the structured
    // reason code, and the verified flag set true.
    expect(review.status).toBe('PENDING')
    expect(review.override_supervisor).toBe(SUPERVISOR_UUID)
    expect(review.override_supervisor).not.toBe(PHARM_SUB)
    expect(review.override_supervisor_verified).toBe(true)
    expect(review.override_reason_code).toBe('BENEFIT_OUTWEIGHS_RISK')
    expect(review.dispense_id).toBe(DISPENSE_UUID)
    expect(review.prescription_id).toBe(PRESCRIPTION_UUID)
    expect(String(review.override_reason)).toContain('Supervisor: Dr. Sahar')
  })

  it('does NOT create a dispense_reviews row when no overrideReason is provided', async () => {
    const inserts: Record<string, unknown[]> = {}

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'practitioners') return supervisorMock()
      if (table === 'medication_requests') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: RX_SELECT_DATA,
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
                      dispensed_at: '2026-09-08T10:00:00.000Z',
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
          insert: (row: unknown) => {
            ;(inserts[table] ??= []).push(row)
            return Promise.resolve({ error: null })
          },
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

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    await caller.medication.recordDispense(VALID_DISPENSE_INPUT)

    // No dispense_reviews insert should have occurred
    expect(inserts['dispense_reviews']).toBeUndefined()

    // Story 57.2: a free-text-only overrideReason (no structured code + supervisor
    // credential) is NOT a valid override — it must NOT create a review either.
    await caller.medication.recordDispense({
      ...VALID_DISPENSE_INPUT,
      dispenseId: '00000000-0000-4000-8000-0000000000ff',
      overrideReason: 'free text only, no structured override',
    })
    expect(inserts['dispense_reviews']).toBeUndefined()
  })

  it('does NOT throw if dispense_reviews insert fails (best-effort)', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'practitioners') return supervisorMock()
      if (table === 'medication_requests') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: RX_SELECT_DATA,
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
                      dispensed_at: '2026-09-08T10:00:00.000Z',
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
        // Simulate a DB error on review insert
        return {
          insert: () => Promise.resolve({ error: { code: '42P01', message: 'relation does not exist' } }),
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

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    // Must NOT throw — the dispense is committed and the review insert failure is best-effort
    await expect(
      caller.medication.recordDispense({
        ...VALID_DISPENSE_INPUT,
        ...STRUCTURED_OVERRIDE,
      }),
    ).resolves.toMatchObject({ success: true })
  })
})
