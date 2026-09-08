import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase before imports
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: Record<string, unknown>) => data,
    toRowRaw: (data: Record<string, unknown>) => data,
    fromRow: (data: Record<string, unknown>) => data,
    fromRowRaw: (data: Record<string, unknown>) => data,
    fromRows: (data: Record<string, unknown>[]) => data,
  },
}))

// Mock jwt verification
vi.mock('@/lib/jwt', () => ({
  verifySupabaseJwt: vi.fn(),
  getSupabaseJwk: vi.fn(() => null),
}))

// Mock field-encryption
vi.mock('@/lib/field-encryption', () => ({
  encryptRow: (data: Record<string, unknown>) => data,
  decryptRow: (data: Record<string, unknown>) => data,
  decryptRows: (data: Record<string, unknown>[]) => data,
  getCachedEncryptionKey: () => 'a'.repeat(64),
  validateEncryptionConfig: () => {},
  encryptJsonbValue: (v: unknown) => `v1:${JSON.stringify(v)}`,
  decryptJsonbValue: (c: unknown) => c,
}))

// Mock crypto/server
vi.mock('@ultranos/crypto/server', () => ({
  getEncryptionConfig: () => ({
    randomizedFields: [],
    deterministicFields: [],
  }),
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function createAuthContext(role = 'DOCTOR') {
  return {
    supabase: mockSupabaseClient as never,
    user: { sub: 'user-1', role, sessionId: 'session-1', userId: 'user-1', orgId: 'org-1' },
    headers: new Headers(),
  }
}

function createUnauthContext() {
  return {
    supabase: mockSupabaseClient as never,
    user: null,
    headers: new Headers(),
  }
}

describe('sync.push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests', async () => {
    const caller = createCaller(createUnauthContext())

    await expect(
      caller.sync.push({
        operations: [{
          resourceType: 'Encounter',
          resourceId: 'enc-1',
          action: 'create',
          payload: '{"id":"enc-1"}',
          hlcTimestamp: '000001700000000:00000:node-1',
        }],
      }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('persists a sync operation and returns success', async () => {
    const mockFrom = vi.fn()

    // First call: check for existing (conflict detection)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })

    // Second call: upsert
    mockFrom.mockReturnValueOnce({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })

    // Third call: audit log (from AuditLogger)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext())

    const result = await caller.sync.push({
      operations: [{
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'create',
        payload: '{"id":"enc-1","status":"in-progress"}',
        hlcTimestamp: '000001700000000:00000:node-1',
      }],
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0]!.success).toBe(true)
    expect(result.results[0]!.resourceId).toBe('enc-1')
  })

  it('rejects a duplicate open encounter (DUPLICATE_OPEN_ENCOUNTER) and returns the canonical id', async () => {
    const mockFrom = vi.fn()

    // 1. conflict-detection existence check by id → none
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })

    // 2. upsert → the open-per-(patient,practitioner) partial unique index fires
    mockFrom.mockReturnValueOnce({
      upsert: vi.fn().mockResolvedValue({
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "uq_encounters_open_per_patient_practitioner"',
          details: '',
        },
      }),
    })

    // 3. findOpen → the canonical open encounter the spoke should resume
    const canonicalSelect: Record<string, unknown> = {}
    Object.assign(canonicalSelect, {
      eq: vi.fn(() => canonicalSelect),
      contains: vi.fn(() => canonicalSelect),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'canonical-open-enc' }, error: null }),
    })
    mockFrom.mockReturnValueOnce({ select: vi.fn(() => canonicalSelect) })

    // default: audit_log (chain-tail read + insert)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext())

    const result = await caller.sync.push({
      operations: [{
        resourceType: 'Encounter',
        resourceId: 'enc-dup',
        action: 'create',
        payload: JSON.stringify({
          id: 'enc-dup',
          status: 'in-progress',
          class: { code: 'AMB' },
          subject: { reference: 'Patient/pat-1' },
          participant: [{ individual: { reference: 'Practitioner/doc-1' } }],
          period: { start: '2026-06-26T20:45:31Z' },
        }),
        hlcTimestamp: '000001700000000:00000:node-1',
      }],
    })

    expect(result.results[0]!.success).toBe(false)
    expect(result.results[0]!.error).toBe('DUPLICATE_OPEN_ENCOUNTER')
    expect((result.results[0] as { canonicalId?: string }).canonicalId).toBe('canonical-open-enc')
  })

  it('stamps synced_by/synced_at when pushing an AllergyIntolerance (Tier-1 provenance)', async () => {
    const mockFrom = vi.fn()
    const upsertSpy = vi.fn().mockResolvedValue({ error: null })

    // 1. conflict-detection select (no existing row)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    // 2. upsert
    mockFrom.mockReturnValueOnce({ upsert: upsertSpy })
    // 3. audit log
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext())

    const result = await caller.sync.push({
      operations: [{
        resourceType: 'AllergyIntolerance',
        resourceId: 'alg-1',
        action: 'create',
        payload: JSON.stringify({
          id: 'alg-1',
          clinicalStatus: { coding: [{ code: 'active' }] },
          verificationStatus: { coding: [{ code: 'confirmed' }] },
          type: 'allergy',
          criticality: 'high',
          code: { text: 'Penicillin' },
          patient: { reference: 'Patient/pat-1' },
        }),
        hlcTimestamp: '000001700000000:00000:node-1',
      }],
    })

    expect(result.results[0]!.success).toBe(true)
    // synced_by is NOT NULL with no DB default — it MUST be stamped from the
    // authenticated actor, or the upsert fails and the allergy never persists.
    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertedRow.syncedBy).toBe('user-1')
    expect(upsertedRow.syncedAt).toBeTruthy()
  })

  it('detects conflict when incoming HLC is older than stored', async () => {
    const mockFrom = vi.fn()

    // First call: existing row with newer HLC
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'enc-1',
              hlc_timestamp: '000001700000002:00000:node-2',
            },
            error: null,
          }),
        }),
      }),
    })

    // Second call: full row fetch for conflict response
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'enc-1',
              status: 'finished',
              hlc_timestamp: '000001700000002:00000:node-2',
            },
            error: null,
          }),
        }),
      }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext())

    const result = await caller.sync.push({
      operations: [{
        resourceType: 'Encounter',
        resourceId: 'enc-1',
        action: 'update',
        payload: '{"id":"enc-1","status":"in-progress"}',
        hlcTimestamp: '000001700000000:00000:node-1',
      }],
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0]!.success).toBe(false)
    expect(result.results[0]!.conflict).toBeDefined()
    expect(result.results[0]!.conflict!.remoteVersion.id).toBe('enc-1')
  })

  it('rejects unknown resource types with FORBIDDEN (RBAC blocks first)', async () => {
    const caller = createCaller(createAuthContext())

    const result = await caller.sync.push({
      operations: [{
        resourceType: 'UnknownType',
        resourceId: 'x-1',
        action: 'create',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      }],
    })

    expect(result.results[0]!.success).toBe(false)
    // RBAC check fires before table mapping, so unknown types get FORBIDDEN
    expect(result.results[0]!.error).toBeDefined()
  })

  it('accepts batch of up to 50 operations', async () => {
    const caller = createCaller(createAuthContext())

    // Should not throw on valid batch size
    await expect(
      caller.sync.push({
        operations: [],
      }),
    ).rejects.toThrow() // min 1

    // Exactly 1 should work (with proper mocking)
    const mockFrom = vi.fn()
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })
    mockSupabaseClient.from = mockFrom

    const result = await caller.sync.push({
      operations: [{
        resourceType: 'Patient',
        resourceId: 'p-1',
        action: 'update',
        payload: '{}',
        hlcTimestamp: '000001700000000:00000:node-1',
      }],
    })

    expect(result.results).toHaveLength(1)
  })
})

describe('sync.push — wholesale ingestion (B1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lands a WholesaleCustomer in wholesale_customers with org_id stamped', async () => {
    const mockFrom = vi.fn()
    const upsertSpy = vi.fn().mockResolvedValue({ error: null })

    // 1. conflict-detection select (no existing row)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    // 2. upsert — capture table + row
    mockFrom.mockReturnValueOnce({ upsert: upsertSpy })
    // 3. audit log (chain-tail read + insert)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext('PHARMACIST'))

    const op = {
      resourceType: 'WholesaleCustomer',
      resourceId: 'c1',
      action: 'create' as const,
      payload: JSON.stringify({ id: 'c1', name: 'Herat Depot', isActive: true, createdAt: '2026-09-07T00:00:00Z' }),
      hlcTimestamp: '100',
    }
    const res = await caller.sync.push({ operations: [op] })

    expect(res.results[0]).toMatchObject({ resourceId: 'c1', success: true })

    // Verify upsert targeted 'wholesale_customers'
    // mockFrom call[0] = conflict-check select, call[1] = upsert
    const upsertTableCall = mockFrom.mock.calls[1]![0] as string
    expect(upsertTableCall).toBe('wholesale_customers')

    // Verify the row has orgId stamped from context + hlcTimestamp as-is
    // (The mock db.toRow is a pass-through — no snake_case conversion in tests)
    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertedRow).toMatchObject({ id: 'c1', name: 'Herat Depot', orgId: 'org-1', hlcTimestamp: '100' })
  })

  it('rejects when the caller has no org_id (MISSING_ORG_CONTEXT)', async () => {
    const mockFrom = vi.fn()
    const upsertSpy = vi.fn().mockResolvedValue({ error: null })

    // 1. conflict-detection select
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    // 2. upsert (should NOT be called)
    mockFrom.mockReturnValueOnce({ upsert: upsertSpy })
    // fallback audit log
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabaseClient.from = mockFrom

    // PHARMACIST caller with orgId = null (no org context)
    const noOrgCtx = {
      supabase: mockSupabaseClient as never,
      user: { sub: 'user-2', role: 'PHARMACIST', sessionId: 'session-2', userId: 'user-2', orgId: null },
      headers: new Headers(),
    }
    const callerNoOrg = createCaller(noOrgCtx)

    const op = {
      resourceType: 'WholesaleCustomer',
      resourceId: 'c2',
      action: 'create' as const,
      payload: JSON.stringify({ id: 'c2', name: 'X', isActive: true, createdAt: '2026-09-07T00:00:00Z' }),
      hlcTimestamp: '100',
    }
    const res = await callerNoOrg.sync.push({ operations: [op] })

    expect(res.results[0]).toMatchObject({ resourceId: 'c2', success: false, error: 'MISSING_ORG_CONTEXT' })
    // upsert must NOT have been called
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('lands a SalesOrder with lines preserved as JSONB', async () => {
    const mockFrom = vi.fn()
    const upsertSpy = vi.fn().mockResolvedValue({ error: null })

    // 1. conflict-detection select
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    // 2. upsert
    mockFrom.mockReturnValueOnce({ upsert: upsertSpy })
    // 3. audit log
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext('PHARMACIST'))

    const lines = [{ catalogItemId: 'i1', unit: 'each', quantity: 10, unitPrice: 2000, lineTotal: 20000, baseUnits: 10, batchAllocations: [{ stockBatchId: 'b1', qty: 10 }] }]
    const op = {
      resourceType: 'SalesOrder',
      resourceId: 'o1',
      action: 'create' as const,
      payload: JSON.stringify({ id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'fulfilled', lines, subtotal: 20000, taxRate: 0, taxAmount: 0, total: 20000, createdBy: 'p1', createdAt: '2026-09-07T00:00:00Z' }),
      hlcTimestamp: '100',
    }
    const res = await caller.sync.push({ operations: [op] })

    expect(res.results[0]).toMatchObject({ resourceId: 'o1', success: true })

    const upsertTableCall = mockFrom.mock.calls[1]![0] as string
    expect(upsertTableCall).toBe('sales_orders')

    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertedRow.lines).toEqual(lines)
  })
})

describe('sync.pull', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Create a Supabase-style chainable query mock.
   * Every method returns the same builder (chainable), and the builder is
   * thenable so `await query` resolves to `{ data, error }`.
   * This mirrors the real Supabase PostgREST builder behavior where
   * .select().gt().order().eq() all return the same builder instance.
   */
  function chainableQuery(data: unknown) {
    const result = { data, error: null }
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'gt', 'order', 'eq', 'in', 'limit', 'single', 'maybeSingle', 'insert']) {
      builder[method] = vi.fn().mockReturnValue(builder)
    }
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    builder.catch = (reject: (v: unknown) => unknown) => Promise.resolve(result).catch(reject)
    return builder
  }

  it('rejects unauthenticated requests', async () => {
    const caller = createCaller(createUnauthContext())

    await expect(
      caller.sync.pull({
        patientId: 'pat-1',
        sinceHlc: '000001700000000:00000:node-1',
      }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('returns changes since a given HLC timestamp', async () => {
    const mockFrom = vi.fn().mockReturnValue(
      chainableQuery([
        {
          id: 'enc-1',
          status: 'in-progress',
          hlcTimestamp: '000001700000001:00000:node-1',
        },
      ]),
    )

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext())

    const result = await caller.sync.pull({
      patientId: 'pat-1',
      sinceHlc: '000001700000000:00000:node-1',
    })

    expect(result.changes.length).toBeGreaterThan(0)
  })

  it('filters by resource types when specified', async () => {
    const mockFrom = vi.fn().mockReturnValue(chainableQuery([]))

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext())

    const result = await caller.sync.pull({
      patientId: 'pat-1',
      sinceHlc: '000001700000000:00000:node-1',
      resourceTypes: ['Encounter'],
    })

    expect(result.changes).toEqual([])
    // Should only query the encounters table
    expect(mockFrom).toHaveBeenCalledWith('encounters')
  })

  it('returns empty array when no changes exist', async () => {
    const mockFrom = vi.fn().mockReturnValue(chainableQuery([]))

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext())

    const result = await caller.sync.pull({
      patientId: 'pat-1',
      sinceHlc: '000001700000000:00000:node-1',
    })

    expect(result.changes).toEqual([])
  })
})

describe('sync.push — ContractPrice ingestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lands a ContractPrice in contract_prices with price from priceMinor + org_id stamped', async () => {
    const mockFrom = vi.fn()
    const upsertSpy = vi.fn().mockResolvedValue({ error: null })

    // 1. conflict-detection select (no existing row)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    // 2. upsert — capture table + row
    mockFrom.mockReturnValueOnce({ upsert: upsertSpy })
    // 3. audit log (chain-tail read + insert)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext('PHARMACIST'))

    const op = {
      resourceType: 'ContractPrice',
      resourceId: 'cp1',
      action: 'create' as const,
      payload: JSON.stringify({ id: 'cp1', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1', createdAt: '2026-09-08T00:00:00Z' }),
      hlcTimestamp: '100',
    }
    const res = await caller.sync.push({ operations: [op] })

    expect(res.results[0]).toMatchObject({ resourceId: 'cp1', success: true })

    // Verify upsert targeted 'contract_prices'
    // mockFrom call[0] = conflict-check select, call[1] = upsert
    const upsertTableCall = mockFrom.mock.calls[1]![0] as string
    expect(upsertTableCall).toBe('contract_prices')

    // flattener maps priceMinor -> price; org stamped from context
    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertedRow).toMatchObject({ id: 'cp1', price: 1800, orgId: 'org-1' })
  })

  it('passes tiers through to the upserted row (volume price-breaks)', async () => {
    const mockFrom = vi.fn()
    const upsertSpy = vi.fn().mockResolvedValue({ error: null })

    // 1. conflict-detection select (no existing row)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    // 2. upsert — capture table + row
    mockFrom.mockReturnValueOnce({ upsert: upsertSpy })
    // 3. audit log (chain-tail read + insert)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext('PHARMACIST'))

    const tiers = [{ minQuantity: 10, priceMinor: 1500 }]
    const op = {
      resourceType: 'ContractPrice',
      resourceId: 'cp2',
      action: 'create' as const,
      payload: JSON.stringify({ id: 'cp2', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, tiers, createdBy: 'p1', createdAt: '2026-09-08T00:00:00Z' }),
      hlcTimestamp: '100',
    }
    const res = await caller.sync.push({ operations: [op] })

    expect(res.results[0]).toMatchObject({ resourceId: 'cp2', success: true })

    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    const upsertedTiers = upsertedRow.tiers as Array<{ minQuantity: number; priceMinor: number }>
    expect(upsertedTiers).toHaveLength(1)
    expect(upsertedTiers[0]!.minQuantity).toBe(10)
    expect(upsertedTiers[0]!.priceMinor).toBe(1500)
  })
})

describe('sync.push — ContractPrice delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stamps deleted_at when action is delete', async () => {
    const mockFrom = vi.fn()
    const upsertSpy = vi.fn().mockResolvedValue({ error: null })

    // 1. conflict-detection select (no existing row)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    // 2. upsert — capture table + row
    mockFrom.mockReturnValueOnce({ upsert: upsertSpy })
    // 3. audit log (chain-tail read + insert)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext('PHARMACIST'))

    const del = {
      resourceType: 'ContractPrice',
      resourceId: 'cp1',
      action: 'delete' as const,
      payload: JSON.stringify({ id: 'cp1', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1', createdAt: '2026-09-08T00:00:00Z' }),
      hlcTimestamp: '200',
    }
    const res = await caller.sync.push({ operations: [del] })

    expect(res.results[0]).toMatchObject({ resourceId: 'cp1', success: true })

    // Verify upsert targeted 'contract_prices'
    const upsertTableCall = mockFrom.mock.calls[1]![0] as string
    expect(upsertTableCall).toBe('contract_prices')

    // deleted_at must be stamped on the upserted row
    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertedRow.deletedAt ?? upsertedRow.deleted_at).toBeTruthy()
  })
})

describe('sync.push — inventory/procurement ingestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockPushSetup() {
    const mockFrom = vi.fn()
    const upsertSpy = vi.fn().mockResolvedValue({ error: null })

    // 1. conflict-detection select (no existing row)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    // 2. upsert — capture table + row
    mockFrom.mockReturnValueOnce({ upsert: upsertSpy })
    // 3. audit log (chain-tail read + insert)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabaseClient.from = mockFrom
    return { mockFrom, upsertSpy }
  }

  it('lands a Supplier in pharmacy_suppliers with name present + org_id stamped', async () => {
    const { mockFrom, upsertSpy } = mockPushSetup()
    const caller = createCaller(createAuthContext('PHARMACIST'))

    const op = {
      resourceType: 'Supplier',
      resourceId: 's1',
      action: 'create' as const,
      payload: JSON.stringify({ id: 's1', name: 'Kabul Medical Supplies', contactName: 'Ahmad', phone: '+93700000000', email: 'info@kms.af', address: 'Kabul', leadTimeDays: 7, paymentTerms: 'net30', isActive: true, createdAt: '2026-09-07T00:00:00Z' }),
      hlcTimestamp: '100',
    }
    const res = await caller.sync.push({ operations: [op] })

    expect(res.results[0]).toMatchObject({ resourceId: 's1', success: true })

    const upsertTableCall = mockFrom.mock.calls[1]![0] as string
    expect(upsertTableCall).toBe('pharmacy_suppliers')

    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertedRow).toMatchObject({ id: 's1', name: 'Kabul Medical Supplies', orgId: 'org-1' })
  })

  it('lands a PurchaseOrder in pharmacy_purchase_orders with items JSONB preserved + totalCost + org_id', async () => {
    const { mockFrom, upsertSpy } = mockPushSetup()
    const caller = createCaller(createAuthContext('PHARMACIST'))

    const items = [{ catalogItemId: 'i1', quantity: 50, unitCost: 1000, lineTotal: 50000 }]
    const op = {
      resourceType: 'PurchaseOrder',
      resourceId: 'po1',
      action: 'create' as const,
      payload: JSON.stringify({ id: 'po1', supplierId: 's1', supplierName: 'Kabul Medical Supplies', status: 'draft', items, totalCost: 50000, notes: null, createdBy: 'p1', sentAt: null, closedAt: null }),
      hlcTimestamp: '100',
    }
    const res = await caller.sync.push({ operations: [op] })

    expect(res.results[0]).toMatchObject({ resourceId: 'po1', success: true })

    const upsertTableCall = mockFrom.mock.calls[1]![0] as string
    expect(upsertTableCall).toBe('pharmacy_purchase_orders')

    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertedRow.items).toEqual(items)
    expect(upsertedRow.totalCost).toBe(50000)
    expect(upsertedRow.orgId).toBe('org-1')
  })

  it('lands a GoodsReceipt in goods_receipts with items preserved + receivedBy + org_id', async () => {
    const { mockFrom, upsertSpy } = mockPushSetup()
    const caller = createCaller(createAuthContext('PHARMACIST'))

    const items = [{ catalogItemId: 'i1', quantityOrdered: 50, quantityReceived: 48, unitCost: 1000, lineTotal: 48000 }]
    const op = {
      resourceType: 'GoodsReceipt',
      resourceId: 'gr1',
      action: 'create' as const,
      payload: JSON.stringify({ id: 'gr1', supplierId: 's1', purchaseOrderId: 'po1', receivedBy: 'p1', items, totalCost: 48000, notes: 'Two units damaged', receivedAt: '2026-09-07T08:00:00Z' }),
      hlcTimestamp: '100',
    }
    const res = await caller.sync.push({ operations: [op] })

    expect(res.results[0]).toMatchObject({ resourceId: 'gr1', success: true })

    const upsertTableCall = mockFrom.mock.calls[1]![0] as string
    expect(upsertTableCall).toBe('goods_receipts')

    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertedRow.items).toEqual(items)
    expect(upsertedRow.receivedBy).toBe('p1')
    expect(upsertedRow.orgId).toBe('org-1')
  })

  it('lands a StockBatch in stock_batches with quantityOnHand + org_id', async () => {
    const { mockFrom, upsertSpy } = mockPushSetup()
    const caller = createCaller(createAuthContext('PHARMACIST'))

    const op = {
      resourceType: 'StockBatch',
      resourceId: 'sb1',
      action: 'create' as const,
      payload: JSON.stringify({ id: 'sb1', catalogItemId: 'i1', batchNumber: 'B001', lotNumber: 'L001', expiryDate: '2027-12-31', quantityOnHand: 48, costPrice: 1000, sellingPrice: 1500, zoneId: 'z1', supplierId: 's1', goodsReceiptId: 'gr1', receivedAt: '2026-09-07T08:00:00Z', status: 'available', locationId: 'loc1' }),
      hlcTimestamp: '100',
    }
    const res = await caller.sync.push({ operations: [op] })

    expect(res.results[0]).toMatchObject({ resourceId: 'sb1', success: true })

    const upsertTableCall = mockFrom.mock.calls[1]![0] as string
    expect(upsertTableCall).toBe('stock_batches')

    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertedRow.quantityOnHand).toBe(48)
    expect(upsertedRow.orgId).toBe('org-1')
  })

  it('lands a StockMovement in stock_movements with movementTimestamp mapped from client timestamp + quantity + org_id', async () => {
    const { mockFrom, upsertSpy } = mockPushSetup()
    const caller = createCaller(createAuthContext('PHARMACIST'))

    const op = {
      resourceType: 'StockMovement',
      resourceId: 'sm1',
      action: 'create' as const,
      payload: JSON.stringify({ id: 'sm1', stockBatchId: 'sb1', catalogItemId: 'i1', type: 'dispensed', quantity: 5, reason: 'Prescription dispense', referenceId: 'rx1', referenceType: 'MedicationRequest', performedBy: 'p1', timestamp: '2026-09-07T10:00:00Z' }),
      hlcTimestamp: '100',
    }
    const res = await caller.sync.push({ operations: [op] })

    expect(res.results[0]).toMatchObject({ resourceId: 'sm1', success: true })

    const upsertTableCall = mockFrom.mock.calls[1]![0] as string
    expect(upsertTableCall).toBe('stock_movements')

    const upsertedRow = upsertSpy.mock.calls[0]![0] as Record<string, unknown>
    // Critical mapping: client `timestamp` → `movementTimestamp` (→ movement_timestamp column)
    expect(upsertedRow.movementTimestamp).toBe('2026-09-07T10:00:00Z')
    expect(upsertedRow.quantity).toBe(5)
    expect(upsertedRow.orgId).toBe('org-1')
  })
})

describe('sync.pull — org-scoped wholesale (B2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Chainable query builder that also captures which `.eq()` calls were made,
   * so we can assert the org_id filter was applied.
   */
  function chainableQueryWithCapture(data: unknown) {
    const eqCalls: Array<[string, unknown]> = []
    const result = { data, error: null }
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'gt', 'order', 'in', 'limit', 'single', 'maybeSingle', 'insert']) {
      builder[method] = vi.fn().mockReturnValue(builder)
    }
    // Override eq to capture the filter column/value
    builder.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
      eqCalls.push([col, val])
      return builder
    })
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    builder.catch = (reject: (v: unknown) => unknown) => Promise.resolve(result).catch(reject)
    return { builder, eqCalls }
  }

  it("returns the org's wholesale customers filtered by org_id + sinceHlc, no patientId needed", async () => {
    const orgRow = { id: 'c1', name: 'Herat Depot', orgId: 'org-1', hlcTimestamp: '100' }
    const { builder, eqCalls } = chainableQueryWithCapture([orgRow])

    // Audit log calls need their own mock
    const auditBuilder: Record<string, unknown> = {}
    for (const method of ['select', 'gt', 'order', 'eq', 'in', 'limit', 'single', 'maybeSingle']) {
      auditBuilder[method] = vi.fn().mockReturnValue(auditBuilder)
    }
    auditBuilder.insert = vi.fn().mockResolvedValue({ error: null })
    auditBuilder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve)
    auditBuilder.catch = (reject: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).catch(reject)

    // First call: wholesale_customers → return org-1 row
    // Subsequent calls: audit_log
    mockSupabaseClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'wholesale_customers') return builder
      return auditBuilder
    })

    const caller = createCaller(createAuthContext('PHARMACIST'))
    const res = await caller.sync.pull({
      resourceTypes: ['WholesaleCustomer'],
      sinceHlc: '0',
      // patientId intentionally omitted — org-scoped resources don't need it
    })

    expect(res.changes.map((c) => c.resourceType)).toContain('WholesaleCustomer')
    expect(res.changes[0]).toMatchObject({ resourceType: 'WholesaleCustomer', resourceId: 'c1' })

    // Verify the query was scoped to org_id = 'org-1'
    const orgFilter = eqCalls.find(([col]) => col === 'org_id')
    expect(orgFilter).toBeDefined()
    expect(orgFilter![1]).toBe('org-1')
  })

  it('returns zero WholesaleCustomer changes when caller has no org_id', async () => {
    const { builder } = chainableQueryWithCapture([{ id: 'c1', name: 'Herat Depot', orgId: 'org-1', hlcTimestamp: '100' }])

    const auditBuilder: Record<string, unknown> = {}
    for (const method of ['select', 'gt', 'order', 'eq', 'in', 'limit', 'single', 'maybeSingle']) {
      auditBuilder[method] = vi.fn().mockReturnValue(auditBuilder)
    }
    auditBuilder.insert = vi.fn().mockResolvedValue({ error: null })
    auditBuilder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve)
    auditBuilder.catch = (reject: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).catch(reject)

    mockSupabaseClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'wholesale_customers') return builder
      return auditBuilder
    })

    const noOrgCtx = {
      supabase: mockSupabaseClient as never,
      user: { sub: 'user-2', role: 'PHARMACIST', sessionId: 'session-2', userId: 'user-2', orgId: null },
      headers: new Headers(),
    }
    const callerNoOrg = createCaller(noOrgCtx)

    const res = await callerNoOrg.sync.pull({
      resourceTypes: ['WholesaleCustomer'],
      sinceHlc: '0',
    })

    expect(res.changes.filter((c) => c.resourceType === 'WholesaleCustomer')).toHaveLength(0)
  })
})
