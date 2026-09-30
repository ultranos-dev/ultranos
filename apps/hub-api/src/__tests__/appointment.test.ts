import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mirror the encounter test harness: stub the supabase module + db row mappers.
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')
const { hasResourceAccess, ROLE_PERMISSIONS } = await import('../trpc/rbac')

const createCaller = createCallerFactory(appRouter)

type TestUser = NonNullable<import('../trpc/init').TRPCContext['user']>

function createTestContext(overrides?: { supabaseFrom?: any; user?: TestUser | null }) {
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

const DOCTOR_USER: TestUser = { sub: 'doctor-001', role: 'DOCTOR' as const, sessionId: 'sess-1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }
const ADMIN_USER: TestUser = { sub: 'admin-001', role: 'ADMIN' as const, sessionId: 'sess-3', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }
const PHARMACIST_USER: TestUser = { sub: 'pharma-001', role: 'PHARMACIST' as const, sessionId: 'sess-4', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }

// A practitioner whose FHIR practitioner identity (participant_refs value, =
// `practitioner_id ?? sub`) DIFFERS from the raw auth `sub`. Scoping MUST match on
// this identity, not sub, or a `practitioner_id` claim would 403 the pull. UUID
// values because listByPractitioner input requires z.string().uuid().
const DOCTOR_DISTINCT: TestUser = {
  sub: '00000000-0000-4000-8000-0000000000d1',
  practitionerId: '00000000-0000-4000-8000-0000000000d2',
  role: 'DOCTOR' as const, sessionId: 'sess-5', orgId: 'org-1', facilityId: null, status: 'ACTIVE',
}
// Legacy/no-claim case: no practitionerId → falls back to sub (zero-regression).
const DOCTOR_UUID_SUB: TestUser = {
  sub: '00000000-0000-4000-8000-0000000000d0',
  role: 'DOCTOR' as const, sessionId: 'sess-6', orgId: 'org-1', facilityId: null, status: 'ACTIVE',
}

const PATIENT_UUID = '00000000-0000-4000-8000-000000000001'

/** audit_log table stub so AuditLogger.emit never throws in tests. */
function mockAuditLogTable() {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
}

/**
 * Thenable appointments query builder. All chainable methods return `q`; awaiting
 * `q` resolves to { data, error }. `q.contains` captures its args for scoping
 * assertions.
 */
function buildAppointmentsQuery(rows: unknown[] = []) {
  const result = { data: rows, error: null }
  const q: Record<string, any> = {}
  Object.assign(q, {
    select: vi.fn(() => q),
    contains: vi.fn(() => q),
    in: vi.fn(() => q),
    lt: vi.fn(() => q),
    gt: vi.fn(() => q),
    gte: vi.fn(() => q),
    lte: vi.fn(() => q),
    neq: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => q),
    range: vi.fn(() => q),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  })
  return q
}

// ─── AC1: RBAC — Appointment now granted to clinical roles ───────────────────
describe('rbac — Appointment resource permission (M-HUB-6)', () => {
  it('grants Appointment to DOCTOR and CLINICIAN', () => {
    expect(hasResourceAccess('DOCTOR', 'Appointment')).toBe(true)
    expect(hasResourceAccess('CLINICIAN', 'Appointment')).toBe(true)
  })
  it('grants Appointment to ADMIN (wildcard)', () => {
    expect(hasResourceAccess('ADMIN', 'Appointment')).toBe(true)
  })
  it('denies Appointment to PHARMACIST and PATIENT', () => {
    expect(hasResourceAccess('PHARMACIST', 'Appointment')).toBe(false)
    expect(hasResourceAccess('PATIENT', 'Appointment')).toBe(false)
  })
  it('grants Slot to clinical roles (availability management)', () => {
    expect(hasResourceAccess('DOCTOR', 'Slot')).toBe(true)
    expect(hasResourceAccess('PHARMACIST', 'Slot')).toBe(false)
  })
  it('an unknown role is denied (fail-safe)', () => {
    expect(hasResourceAccess('NURSE_UNKNOWN', 'Appointment')).toBe(false)
    expect(ROLE_PERMISSIONS['NURSE_UNKNOWN']).toBeUndefined()
  })
})

// ─── AC1: listByPatient ownership / facility scoping ─────────────────────────
describe('appointment.listByPatient — RBAC + ownership scoping', () => {
  const input = { patientId: PATIENT_UUID }

  it('requires authentication', async () => {
    const caller = createCaller(createTestContext({ user: null }))
    await expect(caller.appointment.listByPatient(input)).rejects.toThrow()
  })

  it('denies PHARMACIST (Appointment not in role permissions)', async () => {
    const caller = createCaller(createTestContext({ user: PHARMACIST_USER }))
    await expect(caller.appointment.listByPatient(input)).rejects.toThrow(/denied|permission|forbidden/i)
  })

  it('scopes a clinician query to BOTH the patient ref AND the caller sub', async () => {
    const q = buildAppointmentsQuery([])
    const from = vi.fn((t: string) => (t === 'audit_log' ? mockAuditLogTable() : q))
    const caller = createCaller(createTestContext({ supabaseFrom: from, user: DOCTOR_USER }))

    await caller.appointment.listByPatient(input)

    expect(q.contains).toHaveBeenCalledWith('participant_refs', [PATIENT_UUID, DOCTOR_USER.sub])
  })

  it('does NOT restrict to the caller for ADMIN (patient ref only)', async () => {
    const q = buildAppointmentsQuery([])
    const from = vi.fn((t: string) => (t === 'audit_log' ? mockAuditLogTable() : q))
    const caller = createCaller(createTestContext({ supabaseFrom: from, user: ADMIN_USER }))

    await caller.appointment.listByPatient(input)

    expect(q.contains).toHaveBeenCalledWith('participant_refs', [PATIENT_UUID])
  })

  it('scopes a clinician by practitionerId (not raw sub) when they differ', async () => {
    const q = buildAppointmentsQuery([])
    const from = vi.fn((t: string) => (t === 'audit_log' ? mockAuditLogTable() : q))
    const caller = createCaller(createTestContext({ supabaseFrom: from, user: DOCTOR_DISTINCT }))

    await caller.appointment.listByPatient(input)

    // participant_refs stores the practitioner IDENTITY, not the auth sub — scope on it.
    expect(q.contains).toHaveBeenCalledWith('participant_refs', [PATIENT_UUID, DOCTOR_DISTINCT.practitionerId])
  })

  it('emits a PHI_READ audit event', async () => {
    const q = buildAppointmentsQuery([])
    const auditTable = mockAuditLogTable()
    const from = vi.fn((t: string) => (t === 'audit_log' ? auditTable : q))
    const ctx = createTestContext({ supabaseFrom: from, user: DOCTOR_USER })
    const caller = createCaller(ctx)

    await caller.appointment.listByPatient(input)
    // AuditLogger writes via rpc('audit_emit_with_lock'); assert it was invoked.
    expect((ctx.supabase as any).rpc).toHaveBeenCalled()
  })
})

// ─── listByPractitioner RBAC — scope by practitioner identity, not raw sub ────
describe('appointment.listByPractitioner — scopes by practitioner identity', () => {
  const range = { startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-06-08T00:00:00.000Z' }

  it('allows a practitioner whose practitionerId differs from sub to list their own appointments', async () => {
    const q = buildAppointmentsQuery([])
    const from = vi.fn((t: string) => (t === 'audit_log' ? mockAuditLogTable() : q))
    const caller = createCaller(createTestContext({ supabaseFrom: from, user: DOCTOR_DISTINCT }))

    // RBAC must compare input.practitionerId against ctx.user.practitionerId — NOT sub —
    // so this own-record query is allowed rather than 403'd.
    await expect(
      caller.appointment.listByPractitioner({ practitionerId: DOCTOR_DISTINCT.practitionerId as string, ...range }),
    ).resolves.toBeDefined()
    expect(q.contains).toHaveBeenCalledWith('participant_refs', [DOCTOR_DISTINCT.practitionerId])
  })

  it('forbids a practitioner from querying a DIFFERENT practitioner’s appointments', async () => {
    const from = vi.fn((t: string) => (t === 'audit_log' ? mockAuditLogTable() : buildAppointmentsQuery([])))
    const caller = createCaller(createTestContext({ supabaseFrom: from, user: DOCTOR_DISTINCT }))

    await expect(
      caller.appointment.listByPractitioner({ practitionerId: '00000000-0000-4000-8000-0000000000ff', ...range }),
    ).rejects.toThrow(/denied|forbidden/i)
  })

  it('legacy case: practitionerId absent → falls back to sub (zero-regression)', async () => {
    const q = buildAppointmentsQuery([])
    const from = vi.fn((t: string) => (t === 'audit_log' ? mockAuditLogTable() : q))
    const caller = createCaller(createTestContext({ supabaseFrom: from, user: DOCTOR_UUID_SUB }))

    await expect(
      caller.appointment.listByPractitioner({ practitionerId: DOCTOR_UUID_SUB.sub, ...range }),
    ).resolves.toBeDefined()
    expect(q.contains).toHaveBeenCalledWith('participant_refs', [DOCTOR_UUID_SUB.sub])
  })
})

// ─── AC6 / Tier-3: syncBatch LWW skip on equal-or-older incoming HLC ─────────
describe('appointment.syncBatch — Tier-3 LWW', () => {
  const wall = String(1737000000000).padStart(15, '0')
  const olderHlc = `${wall}:00001:node`
  const newerHlc = `${wall}:00009:node`

  function makeApptInput(hlcTimestamp: string) {
    return {
      id: '00000000-0000-4000-8000-0000000000aa',
      status: 'booked' as const,
      serviceType: [{ code: 'new-consult' }],
      start: '2026-06-01T09:00:00.000Z',
      end: '2026-06-01T09:30:00.000Z',
      participant: [
        { actor: { reference: `Practitioner/${DOCTOR_USER.sub}` }, status: 'accepted' as const },
        { actor: { reference: `Patient/${PATIENT_UUID}` }, status: 'accepted' as const },
      ],
      _ultranos: {
        walkIn: false,
        queuePosition: null,
        isOfflineCreated: true,
        hlcTimestamp,
        createdAt: '2026-06-01T09:00:00.000Z',
      },
    }
  }

  it('skips an incoming appointment whose HLC is older-or-equal to the stored one', async () => {
    // existing check: .select('id, hlc_timestamp').eq('id', ...).single() → stored newerHlc
    const existingQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'x', hlc_timestamp: newerHlc }, error: null }),
        }),
      }),
    }
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((t: string) => {
      if (t === 'audit_log') return mockAuditLogTable()
      // Return an object supporting BOTH the existing-check chain and upsert.
      return { ...existingQuery, upsert }
    })
    const caller = createCaller(createTestContext({ supabaseFrom: from, user: DOCTOR_USER }))

    const res = await caller.appointment.syncBatch({ appointments: [makeApptInput(olderHlc)] })

    expect(res.results[0]!.action).toBe('skipped')
    // LWW loser must NOT be written.
    expect(upsert).not.toHaveBeenCalled()
  })
})
