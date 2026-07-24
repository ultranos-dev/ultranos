import { describe, it, expect, vi, beforeEach } from 'vitest'

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
const SINCE_HLC = '000001700000000:00000:node-1'

function authCtx(supabase: unknown) {
  return {
    supabase: supabase as never,
    user: { sub: 'user-1', role: 'DOCTOR', sessionId: 'session-1', userId: 'user-1', orgId: 'org-1' },
    headers: new Headers(),
  }
}

interface Calls {
  encountersEq: { col: string; val: unknown } | null
  soapIn: { col: string; vals: unknown } | null
  soapQueriedUnscoped: boolean
  allergyEq: { col: string; val: unknown } | null
}

function makeSupabase(opts: { encounterIds: string[]; soapRows?: Record<string, unknown>[]; allergyRows?: Record<string, unknown>[] }) {
  const calls: Calls = { encountersEq: null, soapIn: null, soapQueriedUnscoped: false, allergyEq: null }

  const supabase = {
    from: (table: string) => {
      if (table === 'encounters') {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.eq = (col: string, val: unknown) => {
          calls.encountersEq = { col, val }
          return b
        }
        // thenable → resolves to the patient's encounter ids
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: opts.encounterIds.map((id) => ({ id })), error: null }).then(res)
        return b
      }
      if (table === 'soap_ledger') {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.gt = () => b
        b.order = () => b
        b.eq = () => b
        b.in = (col: string, vals: unknown) => {
          calls.soapIn = { col, vals }
          return b
        }
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: opts.soapRows ?? [], error: null }).then(res)
        return b
      }
      if (table === 'allergy_intolerances') {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.gt = () => b
        b.order = () => b
        b.eq = (col: string, val: unknown) => {
          calls.allergyEq = { col, val }
          return b
        }
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: opts.allergyRows ?? [], error: null }).then(res)
        return b
      }
      // any other table (audit etc.)
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'gt', 'order', 'eq', 'in', 'limit', 'single', 'maybeSingle', 'insert']) {
        b[m] = () => b
      }
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
      return b
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  }

  return { supabase, calls }
}

describe('sync.pull — patient scoping', () => {
  const createCaller = createCallerFactory(appRouter)
  beforeEach(() => vi.clearAllMocks())

  it('scopes SOAP notes to the patient via their encounters (no cross-patient pull)', async () => {
    const { supabase, calls } = makeSupabase({
      encounterIds: ['enc-1', 'enc-2'],
      soapRows: [{ id: 'soap-1', hlcTimestamp: '000001700000009:00000:node-A' }],
    })
    const caller = createCaller(authCtx(supabase))

    const result = await caller.sync.pull({
      patientId: PATIENT_UUID,
      sinceHlc: SINCE_HLC,
      resourceTypes: ['ClinicalImpression'],
    })

    // Encounters resolved for this patient...
    expect(calls.encountersEq).toEqual({ col: 'subject_id', val: PATIENT_UUID })
    // ...then SOAP filtered by encounter_id IN those ids — never an unfiltered scan.
    expect(calls.soapIn).toEqual({ col: 'encounter_id', vals: ['enc-1', 'enc-2'] })
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]!.resourceType).toBe('ClinicalImpression')
  })

  it('returns no SOAP notes when the patient has no encounters (no mass pull)', async () => {
    const { supabase, calls } = makeSupabase({ encounterIds: [], soapRows: [{ id: 'leak', hlcTimestamp: 'x' }] })
    const caller = createCaller(authCtx(supabase))

    const result = await caller.sync.pull({
      patientId: PATIENT_UUID,
      sinceHlc: SINCE_HLC,
      resourceTypes: ['ClinicalImpression'],
    })

    // soap_ledger was never queried (short-circuited) → no leak.
    expect(calls.soapIn).toBeNull()
    expect(result.changes).toEqual([])
  })

  it('still patient-scopes a normal table by its patient column', async () => {
    const { supabase, calls } = makeSupabase({
      encounterIds: [],
      allergyRows: [{ id: 'alg-1', hlcTimestamp: '000001700000009:00000:node-A' }],
    })
    const caller = createCaller(authCtx(supabase))

    const result = await caller.sync.pull({
      patientId: PATIENT_UUID,
      sinceHlc: SINCE_HLC,
      resourceTypes: ['AllergyIntolerance'],
    })

    expect(calls.allergyEq).toEqual({ col: 'patient_ref', val: PATIENT_UUID })
    expect(result.changes).toHaveLength(1)
  })
})
