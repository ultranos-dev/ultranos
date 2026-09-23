import { describe, it, expect, vi, beforeEach } from 'vitest'

// Story 56.2 / audit C-SYS-2 (AC 3): sync.push must reject cross-org and
// cross-patient overwrites of an EXISTING row. An HLC comparison decides which
// version wins — it must NEVER authorize the write. org_id of an existing row is
// never re-stamped to the caller's org. Rejections are a distinguishable `error`
// (not a `conflict`), so the drain worker dead-letters rather than retries.

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: Record<string, unknown>) => d,
    toRowRaw: (d: Record<string, unknown>) => d,
    fromRow: (d: Record<string, unknown>) => d,
    fromRowRaw: (d: Record<string, unknown>) => d,
    fromRows: (d: Record<string, unknown>[]) => d,
  },
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: vi.fn().mockResolvedValue({}) })),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '55555555-5555-5555-5555-555555555555'
const OBS_UUID = '99999999-9999-9999-9999-999999999999'
const PRACT_UUID = '77777777-7777-7777-7777-777777777777'
const CALLER_ORG = 'aaaaaaaa-0000-0000-0000-000000000001'
const OTHER_ORG = 'bbbbbbbb-0000-0000-0000-000000000002'

// Older / newer HLCs (parseable by deserializeHlc: wallMs:counter:nodeId).
const STORED_HLC = '000001700000005:00000:node-stored'
const NEWER_HLC = '000001700000099:00000:node-incoming'

const TEST_USER = {
  sub: PRACT_UUID,
  role: 'DOCTOR' as const,
  sessionId: 'sess-1',
  orgId: CALLER_ORG,
  facilityId: null,
  status: 'ACTIVE',
}

interface UpsertCall { table: string; row: Record<string, unknown> }

/**
 * Mock Supabase for the observations upsert path.
 * - The ownership SELECT (`select('id, org_id, subject_id').eq('id').maybeSingle()`)
 *   and the conflict SELECT (`select('id, hlc_timestamp').eq('id').maybeSingle()`)
 *   both resolve from `existingRow` (a single stored row, or null for a create).
 * - `select('*').eq('id').single()` (full stored row for conflict resolution)
 *   returns the same row.
 * - upserts are captured.
 */
function makeSupabase(
  upserts: UpsertCall[],
  existingRow: Record<string, unknown> | null,
) {
  return {
    from: (table: string) => {
      if (table === 'practitioners') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: PRACT_UUID }, error: null }) }),
          }),
        }
      }
      return {
        select: (cols?: string) => ({
          eq: () => ({
            maybeSingle: async () => ({ data: existingRow, error: null }),
            single: async () => ({ data: existingRow, error: null }),
          }),
        }),
        upsert: (row: Record<string, unknown>) => {
          upserts.push({ table, row })
          return Promise.resolve({ error: null })
        },
      }
    },
    rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'h' }], error: null }),
  } as never
}

function observationOp(hlc: string) {
  return {
    resourceType: 'Observation',
    resourceId: OBS_UUID,
    action: 'update' as const,
    hlcTimestamp: hlc,
    payload: JSON.stringify({
      id: OBS_UUID,
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body Weight' }] },
      subject: { reference: `Patient/${PATIENT_UUID}` },
      effectiveDateTime: '2026-06-25T10:05:00.000Z',
      valueQuantity: { value: 72, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
      _ultranos: { isOfflineCreated: true, createdAt: '2026-06-25T10:05:00.000Z' },
      meta: { lastUpdated: '2026-06-25T10:05:00.000Z', versionId: '1' },
    }),
  }
}

function ctx(supabase: unknown) {
  return { supabase: supabase as never, user: TEST_USER as never, headers: new Headers() }
}

describe('sync.push — existing-row ownership (AC 3)', () => {
  const createCaller = createCallerFactory(appRouter)
  beforeEach(() => { vi.clearAllMocks() })

  it('rejects a cross-org overwrite even with a strictly-newer HLC (no upsert)', async () => {
    const upserts: UpsertCall[] = []
    // Stored row belongs to OTHER_ORG; incoming write from CALLER_ORG with a newer HLC.
    const existing = { id: OBS_UUID, org_id: OTHER_ORG, subject_id: PATIENT_UUID, hlc_timestamp: STORED_HLC }
    const supabase = makeSupabase(upserts, existing)
    const caller = createCaller(ctx(supabase))

    const res = await caller.sync.push({ operations: [observationOp(NEWER_HLC)] })

    expect(res.results[0]).toMatchObject({ resourceId: OBS_UUID, success: false, error: 'FORBIDDEN' })
    // The rejection is NOT a sync conflict (so the drain worker dead-letters it).
    expect(res.results[0]!.conflict).toBeUndefined()
    // No upsert happened — the newer HLC did not authorize a re-home.
    expect(upserts).toHaveLength(0)
  })

  it('does not re-stamp org_id on a same-org update (stored org preserved)', async () => {
    const upserts: UpsertCall[] = []
    // Same-org existing row. Update should succeed and preserve the stored org_id.
    const existing = { id: OBS_UUID, org_id: CALLER_ORG, subject_id: PATIENT_UUID, hlc_timestamp: STORED_HLC }
    const supabase = makeSupabase(upserts, existing)
    const caller = createCaller(ctx(supabase))

    const res = await caller.sync.push({ operations: [observationOp(NEWER_HLC)] })

    expect(res.results[0]).toMatchObject({ resourceId: OBS_UUID, success: true })
    expect(upserts).toHaveLength(1)
    // org_id on the upserted row is the STORED org (preserved), never re-stamped.
    expect(upserts[0]!.row.orgId ?? upserts[0]!.row.org_id).toBe(CALLER_ORG)
  })

  it('stamps caller org on a CREATE (no existing row) and upserts', async () => {
    const upserts: UpsertCall[] = []
    const supabase = makeSupabase(upserts, null) // create path
    const caller = createCaller(ctx(supabase))

    const res = await caller.sync.push({ operations: [observationOp(NEWER_HLC)] })

    expect(res.results[0]).toMatchObject({ resourceId: OBS_UUID, success: true })
    expect(upserts).toHaveLength(1)
    expect(upserts[0]!.row.orgId ?? upserts[0]!.row.org_id).toBe(CALLER_ORG)
  })
})
