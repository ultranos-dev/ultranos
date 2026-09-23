import { describe, it, expect, vi, beforeEach } from 'vitest'

// Story 56.2 / audit C-HUB-4 (AC 4, 5): patient.list / patient.search are
// CLINICAL/ADMIN only — PATIENT/GUARDIAN are rejected — and the response shape must
// never include national_id_hash or the raw photo_url storage path.

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

// Rate-limit middleware must be a pass-through (no Redis in unit tests).
vi.mock('../trpc/middleware/rateLimit', () => ({
  rateLimitMiddleware: () => (opts: { next: (a: unknown) => unknown; ctx: unknown }) =>
    opts.next({ ctx: opts.ctx }),
  RATE_LIMIT_TIERS: { default: {}, patientSearch: {} },
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_ROW = {
  id: 'p-1',
  gender: 'male',
  birth_date: '1990-01-01',
  birth_year_only: false,
  birth_year: 1990,
  name_local: 'Local Name',
  name_latin: 'Latin Name',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  name_given: 'Given',
  name_father: 'Father',
  name_grandfather: 'Grandfather',
  name_family: 'Family',
  blood_group: 'O+',
  telecom_phone: '+1234567890',
  // These MUST NOT appear in the response even if present on the row.
  national_id_hash: 'SHOULD-NOT-LEAK',
  photo_url: 'patients/p-1/raw-storage-path.jpg',
}

type Role = 'DOCTOR' | 'PATIENT' | 'GUARDIAN' | 'ADMIN'

function authCtx(role: Role) {
  const supabase = {
    from: () => {
      const b: Record<string, unknown> = {}
      const chain = ['select', 'eq', 'order', 'limit', 'or', 'gt', 'in', 'not']
      for (const m of chain) b[m] = () => b
      b.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [PATIENT_ROW], error: null }).then(res)
      return b
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  return {
    supabase: supabase as never,
    user: { sub: 'u-1', role: role as never, sessionId: 's-1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' },
    headers: new Headers(),
  }
}

describe('patient directory access — role restriction (AC 4)', () => {
  const createCaller = createCallerFactory(appRouter)
  beforeEach(() => { vi.clearAllMocks() })

  it('rejects PATIENT on list and search', async () => {
    const caller = createCaller(authCtx('PATIENT'))
    await expect(caller.patient.list({ limit: 10 })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(caller.patient.search({ query: 'name' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects GUARDIAN on list and search', async () => {
    const caller = createCaller(authCtx('GUARDIAN'))
    await expect(caller.patient.list({ limit: 10 })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(caller.patient.search({ query: 'name' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('allows a DOCTOR (clinician) on list and search', async () => {
    const caller = createCaller(authCtx('DOCTOR'))
    const list = await caller.patient.list({ limit: 10 })
    expect(list.patients).toHaveLength(1)
    const search = await caller.patient.search({ query: 'name' })
    expect(search.patients).toHaveLength(1)
  })
})

describe('patient directory access — forbidden fields absent (AC 5)', () => {
  const createCaller = createCallerFactory(appRouter)
  beforeEach(() => { vi.clearAllMocks() })

  it('list output never exposes national_id_hash or raw photo_url', async () => {
    const caller = createCaller(authCtx('DOCTOR'))
    const { patients } = await caller.patient.list({ limit: 10 })
    const serialized = JSON.stringify(patients)
    expect(serialized).not.toContain('SHOULD-NOT-LEAK')
    expect(serialized).not.toContain('raw-storage-path')
    expect(patients[0]!._ultranos).not.toHaveProperty('nationalIdHash')
    expect(patients[0]!._ultranos).not.toHaveProperty('photoUrl')
  })

  it('search output never exposes national_id_hash or raw photo_url', async () => {
    const caller = createCaller(authCtx('DOCTOR'))
    const { patients } = await caller.patient.search({ query: 'name' })
    const serialized = JSON.stringify(patients)
    expect(serialized).not.toContain('SHOULD-NOT-LEAK')
    expect(serialized).not.toContain('raw-storage-path')
    expect(patients[0]!._ultranos).not.toHaveProperty('nationalIdHash')
    expect(patients[0]!._ultranos).not.toHaveProperty('photoUrl')
  })
})
