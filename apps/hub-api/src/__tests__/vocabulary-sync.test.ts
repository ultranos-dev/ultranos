import { describe, it, expect, vi } from 'vitest'

// Mock the Supabase client before importing the router
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function createAuthContext() {
  return {
    supabase: mockSupabaseClient as never,
    user: { sub: 'test-user', role: 'DOCTOR', sessionId: 'test-session' },
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

describe('vocabulary.sync', () => {
  it('returns entries newer than sinceVersion for medications', async () => {
    const mockEntries = [
      { code: 'RX101', display: 'NewDrug', form: 'Tablet', strength: '10 mg', atc_code: null, version: 2 },
    ]

    let callCount = 0
    mockSupabaseClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First call: entries query (select * → gt → order)
        return {
          select: vi.fn().mockReturnValue({
            gt: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockEntries, error: null }),
            }),
          }),
        }
      }
      // Second call: max version query (select version → order → limit → single)
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { version: 2 }, error: null }),
            }),
          }),
        }),
      }
    })

    const caller = createCaller(createAuthContext())
    const result = await caller.vocabulary.sync({ type: 'medications', sinceVersion: 1 })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toHaveProperty('code', 'RX101')
    expect(result.latestVersion).toBe(2)
  })

  it('returns empty entries when vocabulary is up-to-date', async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { version: 1 }, error: null }),
          }),
        }),
      }),
    })

    const caller = createCaller(createAuthContext())
    const result = await caller.vocabulary.sync({ type: 'icd10', sinceVersion: 1 })

    expect(result.entries).toHaveLength(0)
    expect(result.latestVersion).toBe(1)
  })

  it('requires authentication', async () => {
    const caller = createCaller(createUnauthContext())

    await expect(
      caller.vocabulary.sync({ type: 'medications', sinceVersion: 0 }),
    ).rejects.toThrow()
  })

  it('supports all vocabulary types', async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { version: 1 }, error: null }),
          }),
        }),
      }),
    })

    const caller = createCaller(createAuthContext())

    // Should not throw for any valid type
    await expect(caller.vocabulary.sync({ type: 'medications', sinceVersion: 0 })).resolves.toBeDefined()
    await expect(caller.vocabulary.sync({ type: 'icd10', sinceVersion: 0 })).resolves.toBeDefined()
    await expect(caller.vocabulary.sync({ type: 'interactions', sinceVersion: 0 })).resolves.toBeDefined()
  })

  it('rejects invalid vocabulary type', async () => {
    const caller = createCaller(createAuthContext())

    await expect(
      caller.vocabulary.sync({ type: 'invalid' as any, sinceVersion: 0 }),
    ).rejects.toThrow()
  })

  it('excludes entries at or below sinceVersion', async () => {
    // Mock returns empty (simulating server filtered correctly)
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { version: 1 }, error: null }),
          }),
        }),
      }),
    })

    const caller = createCaller(createAuthContext())
    // Request sinceVersion: 1 — server should return no entries (all at version 1 or lower)
    const result = await caller.vocabulary.sync({ type: 'medications', sinceVersion: 1 })

    expect(result.entries).toHaveLength(0)
    // Verify the gt filter was called with the correct sinceVersion
    const fromMock = mockSupabaseClient.from.mock.results[0]?.value
    const gtSpy = fromMock?.select?.mock.results[0]?.value?.gt
    expect(gtSpy).toHaveBeenCalledWith('version', 1)
  })
})
