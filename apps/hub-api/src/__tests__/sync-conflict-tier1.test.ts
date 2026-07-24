import { describe, it, expect, vi, beforeEach } from 'vitest'

// Field-encryption keys — importing the router pulls in modules that validate env.
vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

// db.toRow/fromRow identity so asserted rows keep the mapper's camelCase keys.
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

// Field encryption: capture calls, return an opaque ciphertext marker (never
// echoes the plaintext) so we can assert the version snapshots are encrypted.
const encryptJsonbValue = vi.fn((_v: unknown) => 'v1:ciphertext')
vi.mock('@/lib/field-encryption', () => ({
  encryptRow: (d: Record<string, unknown>) => d,
  decryptRow: (d: Record<string, unknown>) => d,
  decryptRows: (d: Record<string, unknown>[]) => d,
  getCachedEncryptionKey: () => 'a'.repeat(64),
  validateEncryptionConfig: () => {},
  encryptJsonbValue,
  decryptJsonbValue: (c: unknown) => c,
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '55555555-5555-5555-5555-555555555555'
const PRACT_UUID = '77777777-7777-7777-7777-777777777777'
const ORG_UUID = '269c2a80-c6ee-4c69-90ad-434afc77f027'
const ALLERGY_UUID = 'a1a1a1a1-0000-0000-0000-000000000001'
const ENCOUNTER_UUID = '66666666-6666-6666-6666-666666666666'

const TEST_USER = {
  sub: PRACT_UUID,
  role: 'DOCTOR',
  sessionId: 'sess-1',
  orgId: ORG_UUID,
  facilityId: null,
  status: null,
}

// HLC format: <wallMs>:<counter>:<nodeId>
const STORED_HLC = '000001700000000:00000:node-A'
const HLC_CONCURRENT_NEWER_OTHER = '000001700000005:00000:node-B' // +5ms, different device → concurrent
const HLC_CONCURRENT_OLDER_OTHER = '000001699999990:00000:node-B' // -10ms, different device → stale concurrent
const HLC_SEQUENTIAL_SAME = '000002000000000:00000:node-A' // far-future, same device → sequential self-update
const HLC_LATER_OTHER_OUTSIDE = '000002000000000:00000:node-B' // far-future, different device, outside 60s window

interface Sink {
  upserts: Array<{ table: string; row: Record<string, unknown> }>
  conflicts: Record<string, unknown>[]
}

function makeSupabase(
  sink: Sink,
  opts: { storedHlc?: string | null; storedFull?: Record<string, unknown> | null; conflictInsertError?: unknown } = {},
) {
  const storedHlc = opts.storedHlc === undefined ? STORED_HLC : opts.storedHlc
  const storedFull =
    opts.storedFull === undefined
      ? {
          id: ALLERGY_UUID,
          clinicalStatusCode: 'active',
          criticality: 'high',
          substanceText: 'Penicillin',
          patientRef: PATIENT_UUID,
          hlc_timestamp: storedHlc,
        }
      : opts.storedFull

  return {
    from: (table: string) => {
      if (table === 'sync_conflicts') {
        return {
          insert: (row: Record<string, unknown>) => {
            sink.conflicts.push(row)
            return Promise.resolve({ error: opts.conflictInsertError ?? null })
          },
        }
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: storedHlc ? { id: ALLERGY_UUID, hlc_timestamp: storedHlc } : null,
              error: null,
            }),
            single: async () => ({ data: storedFull, error: null }),
          }),
        }),
        upsert: (row: Record<string, unknown>) => {
          sink.upserts.push({ table, row })
          return Promise.resolve({ error: null })
        },
      }
    },
    rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'h' }], error: null }),
  } as never
}

function allergyOp(hlc: string) {
  return {
    resourceType: 'AllergyIntolerance',
    resourceId: ALLERGY_UUID,
    action: 'update' as const,
    hlcTimestamp: hlc,
    payload: JSON.stringify({
      id: ALLERGY_UUID,
      resourceType: 'AllergyIntolerance',
      clinicalStatus: { coding: [{ code: 'active' }] },
      verificationStatus: { coding: [{ code: 'confirmed' }] },
      type: 'allergy',
      criticality: 'high',
      code: { text: 'Penicillin' },
      patient: { reference: `Patient/${PATIENT_UUID}` },
      recorder: { reference: `Practitioner/${PRACT_UUID}` },
      meta: { lastUpdated: '2026-06-25T10:00:00.000Z', versionId: '2' },
    }),
  }
}

function encounterOp(hlc: string) {
  return {
    resourceType: 'Encounter',
    resourceId: ENCOUNTER_UUID,
    action: 'update' as const,
    hlcTimestamp: hlc,
    payload: JSON.stringify({
      id: ENCOUNTER_UUID,
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { code: 'AMB' },
      subject: { reference: `Patient/${PATIENT_UUID}` },
      participant: [{ individual: { reference: `Practitioner/${PRACT_UUID}` } }],
      period: { start: '2026-06-25T10:00:00.000Z' },
      meta: { lastUpdated: '2026-06-25T10:00:00.000Z', versionId: '2' },
    }),
  }
}

describe('sync.push — Tier-1 append-only conflict pipeline', () => {
  const createCaller = createCallerFactory(appRouter)
  beforeEach(() => vi.clearAllMocks())

  it('records a conflict (never overwrites) when a concurrent allergy edit arrives from another device', async () => {
    const sink: Sink = { upserts: [], conflicts: [] }
    const caller = createCaller({ supabase: makeSupabase(sink), user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [allergyOp(HLC_CONCURRENT_NEWER_OTHER)] })

    // Conflict returned to the spoke, NOT a silent LWW overwrite.
    expect(results[0]!.success).toBe(false)
    expect(results[0]!.conflict).toBeDefined()
    expect(results[0]!.conflict!.remoteVersion.id).toBe(ALLERGY_UUID)

    // A conflict row was persisted (UNRESOLVED) and NO upsert happened.
    expect(sink.conflicts).toHaveLength(1)
    expect(sink.upserts).toHaveLength(0)

    const c = sink.conflicts[0]!
    expect(c.status).toBe('UNRESOLVED')
    expect(c.resource_type).toBe('AllergyIntolerance')
    expect(c.resource_id).toBe(ALLERGY_UUID)
    expect(c.patient_ref).toBe(`Patient/${PATIENT_UUID}`)
  })

  it('captures the append-only resolution metadata (blocks prescription)', async () => {
    const sink: Sink = { upserts: [], conflicts: [] }
    const caller = createCaller({ supabase: makeSupabase(sink), user: TEST_USER, headers: new Headers() })

    await caller.sync.push({ operations: [allergyOp(HLC_CONCURRENT_NEWER_OTHER)] })

    const resolution = sink.conflicts[0]!.resolution as Record<string, unknown>
    expect(resolution.strategy).toBe('APPEND_ONLY')
    expect(resolution.blocksPrescription).toBe(true)
  })

  it('records a conflict for a stale concurrent write (incoming older, different device)', async () => {
    const sink: Sink = { upserts: [], conflicts: [] }
    const caller = createCaller({ supabase: makeSupabase(sink), user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [allergyOp(HLC_CONCURRENT_OLDER_OTHER)] })

    expect(results[0]!.success).toBe(false)
    expect(sink.conflicts).toHaveLength(1)
    expect(sink.upserts).toHaveLength(0)
  })

  it('encrypts both version snapshots — no plaintext PHI in the conflict row', async () => {
    const sink: Sink = { upserts: [], conflicts: [] }
    const caller = createCaller({ supabase: makeSupabase(sink), user: TEST_USER, headers: new Headers() })

    await caller.sync.push({ operations: [allergyOp(HLC_CONCURRENT_NEWER_OTHER)] })

    const c = sink.conflicts[0]!
    // Version blobs are the ciphertext marker, not raw objects.
    expect(c.local_version).toBe('v1:ciphertext')
    expect(c.remote_version).toBe('v1:ciphertext')
    // The encryptor was actually invoked for both versions.
    expect(encryptJsonbValue).toHaveBeenCalledTimes(2)
    // Belt-and-suspenders: the stored row is serialized with no plaintext substance.
    expect(JSON.stringify(c)).not.toContain('Penicillin')
  })

  it('does NOT flag a normal sequential allergy update from the same device (applies the update)', async () => {
    const sink: Sink = { upserts: [], conflicts: [] }
    const caller = createCaller({ supabase: makeSupabase(sink), user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [allergyOp(HLC_SEQUENTIAL_SAME)] })

    expect(results[0]!.success).toBe(true)
    expect(sink.conflicts).toHaveLength(0)
    expect(sink.upserts).toHaveLength(1)
    expect(sink.upserts[0]!.table).toBe('allergy_intolerances')
  })

  it('does NOT flag a clearly-later edit from another device outside the 60s window (applies the update)', async () => {
    const sink: Sink = { upserts: [], conflicts: [] }
    const caller = createCaller({ supabase: makeSupabase(sink), user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [allergyOp(HLC_LATER_OTHER_OUTSIDE)] })

    expect(results[0]!.success).toBe(true)
    expect(sink.conflicts).toHaveLength(0)
    expect(sink.upserts).toHaveLength(1)
  })

  it('does NOT create a Tier-1 conflict row for a non-Tier-1 resource (Encounter uses timestamp-wins)', async () => {
    const sink: Sink = { upserts: [], conflicts: [] }
    // Encounter stored row present; concurrent newer from another device.
    const supabase = {
      from: (table: string) => {
        if (table === 'sync_conflicts') {
          return { insert: (row: Record<string, unknown>) => { sink.conflicts.push(row); return Promise.resolve({ error: null }) } }
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: ENCOUNTER_UUID, hlc_timestamp: STORED_HLC }, error: null }),
              single: async () => ({ data: { id: ENCOUNTER_UUID, status: 'planned', hlc_timestamp: STORED_HLC }, error: null }),
            }),
          }),
          upsert: (row: Record<string, unknown>) => { sink.upserts.push({ table, row }); return Promise.resolve({ error: null }) },
        }
      },
      rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'h' }], error: null }),
    } as never
    const caller = createCaller({ supabase, user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [encounterOp(HLC_CONCURRENT_NEWER_OTHER)] })

    // Tier-2: incoming newer wins via upsert; no sync_conflicts row.
    expect(results[0]!.success).toBe(true)
    expect(sink.conflicts).toHaveLength(0)
    expect(sink.upserts).toHaveLength(1)
    expect(sink.upserts[0]!.table).toBe('encounters')
  })

  it('fails closed: if the conflict row cannot be persisted, the write is rejected (no silent Tier-1 loss)', async () => {
    const sink: Sink = { upserts: [], conflicts: [] }
    const caller = createCaller({
      supabase: makeSupabase(sink, { conflictInsertError: { message: 'db down' } }),
      user: TEST_USER,
      headers: new Headers(),
    })

    const { results } = await caller.sync.push({ operations: [allergyOp(HLC_CONCURRENT_NEWER_OTHER)] })

    expect(results[0]!.success).toBe(false)
    expect(results[0]!.error).toBe('CONFLICT_PERSIST_FAILED')
    // Never overwrote the stored Tier-1 row.
    expect(sink.upserts).toHaveLength(0)
  })
})
