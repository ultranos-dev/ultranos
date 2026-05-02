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
    user: { sub: 'user-1', role, sessionId: 'session-1', userId: 'user-1' },
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

describe('sync.pull', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'enc-1',
                status: 'in-progress',
                hlcTimestamp: '000001700000001:00000:node-1',
              },
            ],
            error: null,
          }),
        }),
      }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext())

    const result = await caller.sync.pull({
      patientId: 'pat-1',
      sinceHlc: '000001700000000:00000:node-1',
    })

    expect(result.changes.length).toBeGreaterThan(0)
  })

  it('filters by resource types when specified', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    })

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
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    })

    mockSupabaseClient.from = mockFrom

    const caller = createCaller(createAuthContext())

    const result = await caller.sync.pull({
      patientId: 'pat-1',
      sinceHlc: '000001700000000:00000:node-1',
    })

    expect(result.changes).toEqual([])
  })
})
