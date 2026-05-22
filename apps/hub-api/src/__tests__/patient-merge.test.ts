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

const ADMIN_USER = { sub: 'admin-001', role: 'ADMIN', sessionId: 'sess-admin', orgId: null, status: null }
const DOCTOR_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-doc', orgId: null, status: null }
const SURVIVOR_ID = '11111111-1111-1111-1111-111111111111'
const DUPLICATE_ID = '22222222-2222-2222-2222-222222222222'
const MERGE_AUDIT_ID = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Helper: build a chainable Supabase query mock ──
// Supports: select, eq, neq, or, ilike, update, insert, single, limit, range, order
function chainMock(resolveValue: any) {
  const chain: any = {}
  const methods = ['select', 'eq', 'neq', 'or', 'ilike', 'update', 'insert', 'single', 'limit', 'range', 'order', 'not']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  // single() resolves the promise
  chain.single = vi.fn().mockResolvedValue(resolveValue)
  // When no .single(), the chain itself should resolve (for select without single)
  chain.then = (onFulfilled: any) => Promise.resolve(resolveValue).then(onFulfilled)
  return chain
}

function makePatientRow(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    name_given: 'Test',
    name_father: 'Father',
    name_grandfather: 'Grandfather',
    gender: 'male',
    birth_year: 1990,
    address_district_origin: 'Kabul',
    address_province_origin: 'Kabul',
    mpi_score: 80,
    mpi_warn: false,
    patient_tier: 'FREE',
    is_active: true,
    ultranos_is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    created_by: 'admin-001',
    merged_into: null,
    ...overrides,
  }
}

// ── Test 1: merge sets merged_into, is_active=false on duplicate, creates merge_audit ──
describe('patientAdmin.merge', () => {
  const createCaller = createCallerFactory(appRouter)

  it('sets merged_into, is_active=false on duplicate, creates merge_audit', async () => {
    const survivorRow = makePatientRow(SURVIVOR_ID)
    const duplicateRow = makePatientRow(DUPLICATE_ID, { name_given: 'DupName' })

    // Track update and insert calls
    const updateCalls: Array<{ table: string; data: any }> = []
    const insertCalls: Array<{ table: string; data: any }> = []

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'patients') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => ({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: val === SURVIVOR_ID ? survivorRow : duplicateRow,
                  error: null,
                }),
              }),
            })),
          }),
          update: vi.fn().mockImplementation((data: any) => {
            updateCalls.push({ table: 'patients', data })
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }
          }),
        }
      }
      if (table === 'merge_audits') {
        return {
          insert: vi.fn().mockImplementation((data: any) => {
            insertCalls.push({ table: 'merge_audits', data })
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: MERGE_AUDIT_ID },
                  error: null,
                }),
              }),
            }
          }),
        }
      }
      if (table === 'duplicate_reviews') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      return {}
    })

    const ctx = { supabase: { from: mockFrom } as never, user: ADMIN_USER, headers: new Headers() }
    const caller = createCaller(ctx)

    const result = await caller.patientAdmin.merge({
      survivorId: SURVIVOR_ID,
      duplicateId: DUPLICATE_ID,
      fieldResolutions: { name_given: 'duplicate' },
    })

    expect(result.success).toBe(true)
    expect(result.mergeAuditId).toBe(MERGE_AUDIT_ID)

    // Verify duplicate was marked inactive
    const duplicateUpdate = updateCalls.find(
      (c) => c.data.is_active === false && c.data.ultranos_is_active === false,
    )
    expect(duplicateUpdate).toBeDefined()
    expect(duplicateUpdate!.data.merged_into).toBe(SURVIVOR_ID)

    // Verify merge_audit was inserted
    expect(insertCalls.some((c) => c.table === 'merge_audits')).toBe(true)

    // Verify audit event emitted
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        metadata: expect.objectContaining({ operation: 'patient_merge' }),
      }),
    )
  })

  // ── Test 2: merge requires ADMIN role ──
  it('requires ADMIN role', async () => {
    const mockFrom = vi.fn()
    const ctx = { supabase: { from: mockFrom } as never, user: DOCTOR_USER, headers: new Headers() }
    const caller = createCaller(ctx)

    await expect(
      caller.patientAdmin.merge({
        survivorId: SURVIVOR_ID,
        duplicateId: DUPLICATE_ID,
        fieldResolutions: {},
      }),
    ).rejects.toThrow(/admin/i)
  })
})

// ── Test 3: unmerge within 72h restores both records ──
describe('patientAdmin.unmerge', () => {
  const createCaller = createCallerFactory(appRouter)

  it('within 72h restores both records', async () => {
    const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const mergeAuditRow = {
      id: MERGE_AUDIT_ID,
      survivor_id: SURVIVOR_ID,
      duplicate_id: DUPLICATE_ID,
      field_resolutions: { name_given: 'duplicate' },
      original_survivor: makePatientRow(SURVIVOR_ID, { name_given: 'OrigSurvivor' }),
      original_duplicate: makePatientRow(DUPLICATE_ID, { name_given: 'OrigDuplicate' }),
      merged_by: 'admin-001',
      unmerge_deadline: futureDeadline,
      status: 'ACTIVE',
    }

    const updateCalls: Array<{ table: string; data: any }> = []

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'merge_audits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mergeAuditRow, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data: any) => {
            updateCalls.push({ table: 'merge_audits', data })
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            }
          }),
        }
      }
      if (table === 'patients') {
        return {
          update: vi.fn().mockImplementation((data: any) => {
            updateCalls.push({ table: 'patients', data })
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            }
          }),
        }
      }
      return {}
    })

    const ctx = { supabase: { from: mockFrom } as never, user: ADMIN_USER, headers: new Headers() }
    const caller = createCaller(ctx)

    const result = await caller.patientAdmin.unmerge({ mergeAuditId: MERGE_AUDIT_ID })

    expect(result.success).toBe(true)

    // Verify duplicate was restored to active
    const duplicateRestore = updateCalls.find(
      (c) => c.table === 'patients' && c.data.is_active === true && c.data.ultranos_is_active === true,
    )
    expect(duplicateRestore).toBeDefined()
    expect(duplicateRestore!.data.merged_into).toBeNull()

    // Verify merge_audit updated to REVERSED
    const auditUpdate = updateCalls.find(
      (c) => c.table === 'merge_audits' && c.data.status === 'REVERSED',
    )
    expect(auditUpdate).toBeDefined()
  })

  // ── Test 4: after 72h throws FORBIDDEN ──
  it('after 72h throws FORBIDDEN', async () => {
    const pastDeadline = new Date(Date.now() - 1000).toISOString()
    const mergeAuditRow = {
      id: MERGE_AUDIT_ID,
      survivor_id: SURVIVOR_ID,
      duplicate_id: DUPLICATE_ID,
      field_resolutions: {},
      original_survivor: makePatientRow(SURVIVOR_ID),
      original_duplicate: makePatientRow(DUPLICATE_ID),
      merged_by: 'admin-001',
      unmerge_deadline: pastDeadline,
      status: 'ACTIVE',
    }

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'merge_audits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mergeAuditRow, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    const ctx = { supabase: { from: mockFrom } as never, user: ADMIN_USER, headers: new Headers() }
    const caller = createCaller(ctx)

    await expect(
      caller.patientAdmin.unmerge({ mergeAuditId: MERGE_AUDIT_ID }),
    ).rejects.toThrow(/72 hours/)
  })
})

// ── Test 5: patient.read follows merged_into link transparently ──
describe('patient.read — follows merged_into', () => {
  const createCaller = createCallerFactory(appRouter)

  it('follows merged_into link and returns the survivor', async () => {
    const mergedRow = {
      id: DUPLICATE_ID,
      merged_into: SURVIVOR_ID,
      is_active: false, // merged patient is inactive
    }
    const survivorRow = makePatientRow(SURVIVOR_ID, {
      ultranos_name_local: 'Survivor',
      ultranos_is_active: true,
      updated_at: '2026-01-02T00:00:00Z',
      meta_version_id: 'v2',
    })

    let callCount = 0
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'patients') {
        callCount++
        if (callCount === 1) {
          // First call: no is_active filter, returns merged patient
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mergedRow, error: null }),
              }),
            }),
          }
        }
        // Second call: fetches survivor with is_active=true
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: survivorRow, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    const ctx = { supabase: { from: mockFrom } as never, user: ADMIN_USER, headers: new Headers() }
    const caller = createCaller(ctx)

    const result = await caller.patient.read({ patientId: DUPLICATE_ID })

    // Should return the survivor's data, not the duplicate's
    expect(result.id).toBe(SURVIVOR_ID)
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })
})
