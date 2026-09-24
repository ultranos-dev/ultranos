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
const OTHER_PATIENT_UUID = '66666666-6666-6666-6666-666666666666'
const SINCE_HLC = '000001700000000:00000:node-1'

type Role = 'DOCTOR' | 'PATIENT' | 'GUARDIAN'

function authCtx(supabase: unknown, opts: { role?: Role; sub?: string } = {}) {
  return {
    supabase: supabase as never,
    user: {
      sub: opts.sub ?? 'user-1',
      role: (opts.role ?? 'DOCTOR') as never,
      sessionId: 'session-1',
      orgId: 'org-1',
      facilityId: null,
      status: 'ACTIVE',
    },
    headers: new Headers(),
  }
}

interface Calls {
  encountersEq: { col: string; val: unknown } | null
  soapIn: { col: string; vals: unknown } | null
  soapQueriedUnscoped: boolean
  allergyEq: { col: string; val: unknown } | null
}

/**
 * Build a mock Supabase.
 * - `consentActive` controls what the `consents` table returns for checkConsent.
 * - `wards` is the set of patient_ids the (guardian) caller is actively linked to.
 */
function makeSupabase(opts: {
  encounterIds: string[]
  soapRows?: Record<string, unknown>[]
  allergyRows?: Record<string, unknown>[]
  medStatementRows?: Record<string, unknown>[]
  consentActive?: boolean
  wards?: string[]
}) {
  const calls: Calls = { encountersEq: null, soapIn: null, soapQueriedUnscoped: false, allergyEq: null }
  const consentActive = opts.consentActive ?? true
  const wards = opts.wards ?? []

  const supabase = {
    from: (table: string) => {
      if (table === 'encounters') {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.eq = (col: string, val: unknown) => {
          calls.encountersEq = { col, val }
          return b
        }
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: opts.encounterIds.map((id) => ({ id })), error: null }).then(res)
        return b
      }
      if (table === 'soap_ledger') {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.gt = () => b
        b.order = () => b
        b.limit = () => b // Story 62.2: pull now caps each table with .limit()
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
        b.limit = () => b // Story 62.2: pull now caps each table with .limit()
        b.eq = (col: string, val: unknown) => {
          calls.allergyEq = { col, val }
          return b
        }
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: opts.allergyRows ?? [], error: null }).then(res)
        return b
      }
      if (table === 'medication_statements') {
        // GUARDIAN can access MedicationStatement (rbac). Patient col: subject_reference.
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.gt = () => b
        b.order = () => b
        b.limit = () => b // Story 62.2: pull now caps each table with .limit()
        b.eq = () => b
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: opts.medStatementRows ?? [], error: null }).then(res)
        return b
      }
      if (table === 'consents') {
        // checkConsent: newest-first list per patient/scope. Return one ACTIVE
        // FULL_RECORD consent when consentActive, else empty (withdrawn/none).
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.eq = () => b
        b.order = () => b
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({
            data: consentActive
              ? [
                  {
                    id: 'consent-1',
                    status: 'ACTIVE',
                    category: ['FULL_RECORD'],
                    date_time: '2026-01-01T00:00:00Z',
                    provision_end: null,
                  },
                ]
              : [],
            error: null,
          }).then(res)
        return b
      }
      if (table === 'guardian_links') {
        // resolvePullScope guardian branch: maybeSingle() → row when patient is a ward.
        let patientArg: string | null = null
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.eq = (col: string, val: unknown) => {
          if (col === 'patient_id') patientArg = val as string
          return b
        }
        b.maybeSingle = () =>
          Promise.resolve({
            data: patientArg && wards.includes(patientArg) ? { id: 'link-1' } : null,
            error: null,
          })
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

describe('sync.pull — patient scoping (column filtering)', () => {
  const createCaller = createCallerFactory(appRouter)
  beforeEach(() => { vi.clearAllMocks() })

  it('scopes SOAP notes to the patient via their encounters (no cross-patient pull)', async () => {
    const { supabase, calls } = makeSupabase({
      encounterIds: ['enc-1', 'enc-2'],
      soapRows: [{ id: 'soap-1', hlcTimestamp: '000001700000009:00000:node-A' }],
      consentActive: true,
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
    const { supabase, calls } = makeSupabase({ encounterIds: [], soapRows: [{ id: 'leak', hlcTimestamp: 'x' }], consentActive: true })
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
      consentActive: true,
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

describe('sync.pull — object-level ownership (AC 1)', () => {
  const createCaller = createCallerFactory(appRouter)
  beforeEach(() => { vi.clearAllMocks() })

  it('rejects a PATIENT pulling another patient with FORBIDDEN', async () => {
    const { supabase } = makeSupabase({ encounterIds: [], consentActive: true })
    // PATIENT sub === own patients.id (convention). Requesting a different patient id.
    const caller = createCaller(authCtx(supabase, { role: 'PATIENT', sub: PATIENT_UUID }))

    await expect(
      caller.sync.pull({
        patientId: OTHER_PATIENT_UUID,
        sinceHlc: SINCE_HLC,
        resourceTypes: ['AllergyIntolerance'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('allows a PATIENT pulling their OWN record', async () => {
    // MedicationStatement is a type PATIENT holds in rbac (AllergyIntolerance is not).
    const { supabase } = makeSupabase({
      encounterIds: [],
      medStatementRows: [{ id: 'ms-own', hlcTimestamp: '000001700000009:00000:node-A' }],
      consentActive: false, // owners bypass consent gate for their own record
    })
    const caller = createCaller(authCtx(supabase, { role: 'PATIENT', sub: PATIENT_UUID }))

    const result = await caller.sync.pull({
      patientId: PATIENT_UUID,
      sinceHlc: SINCE_HLC,
      resourceTypes: ['MedicationStatement'],
    })

    expect(result.changes).toHaveLength(1)
  })

  it('allows a GUARDIAN pulling a linked ward but rejects a non-ward', async () => {
    // MedicationStatement is a type GUARDIAN holds in rbac (AllergyIntolerance is not).
    // Ward case: patient is in the guardian's active links.
    const wardCtx = makeSupabase({
      encounterIds: [],
      medStatementRows: [{ id: 'ms-ward', hlcTimestamp: '000001700000009:00000:node-A' }],
      consentActive: false,
      wards: [PATIENT_UUID],
    })
    const wardCaller = createCaller(authCtx(wardCtx.supabase, { role: 'GUARDIAN', sub: 'guardian-1' }))
    const wardResult = await wardCaller.sync.pull({
      patientId: PATIENT_UUID,
      sinceHlc: SINCE_HLC,
      resourceTypes: ['MedicationStatement'],
    })
    expect(wardResult.changes).toHaveLength(1)

    // Non-ward case: requested patient is NOT in the guardian's links → FORBIDDEN.
    const nonWardCtx = makeSupabase({ encounterIds: [], consentActive: false, wards: [PATIENT_UUID] })
    const nonWardCaller = createCaller(authCtx(nonWardCtx.supabase, { role: 'GUARDIAN', sub: 'guardian-1' }))
    await expect(
      nonWardCaller.sync.pull({
        patientId: OTHER_PATIENT_UUID,
        sinceHlc: SINCE_HLC,
        resourceTypes: ['MedicationStatement'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('sync.pull — consent gating (AC 2)', () => {
  const createCaller = createCallerFactory(appRouter)
  beforeEach(() => { vi.clearAllMocks() })

  it('excludes consent-gated types for a clinician when consent is withdrawn', async () => {
    const { supabase, calls } = makeSupabase({
      encounterIds: ['enc-1'],
      soapRows: [{ id: 'soap-1', hlcTimestamp: '000001700000009:00000:node-A' }],
      consentActive: false, // withdrawn / none
    })
    const caller = createCaller(authCtx(supabase, { role: 'DOCTOR' }))

    const result = await caller.sync.pull({
      patientId: PATIENT_UUID,
      sinceHlc: SINCE_HLC,
      resourceTypes: ['ClinicalImpression'], // consent-gated (clinical notes scope)
    })

    // Consent gate fires BEFORE the query → soap_ledger never scoped, nothing returned.
    expect(calls.soapIn).toBeNull()
    expect(result.changes).toEqual([])
  })

  it('includes NON-consent-gated types (AllergyIntolerance) even without a consent record', async () => {
    const { supabase, calls } = makeSupabase({
      encounterIds: [],
      allergyRows: [{ id: 'alg-1', hlcTimestamp: '000001700000009:00000:node-A' }],
      consentActive: false,
    })
    const caller = createCaller(authCtx(supabase, { role: 'DOCTOR' }))

    const result = await caller.sync.pull({
      patientId: PATIENT_UUID,
      sinceHlc: SINCE_HLC,
      resourceTypes: ['AllergyIntolerance'], // NOT in the consent-gated set
    })

    expect(calls.allergyEq).toEqual({ col: 'patient_ref', val: PATIENT_UUID })
    expect(result.changes).toHaveLength(1)
  })
})
