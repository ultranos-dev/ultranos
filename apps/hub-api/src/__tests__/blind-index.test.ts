import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_ENCRYPTION_KEY = 'a'.repeat(64)
const TEST_HMAC_KEY = 'b'.repeat(64)

vi.stubEnv('FIELD_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', TEST_HMAC_KEY)

// Mock dependencies before importing
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue({}),
  })),
}))

let mockSupabaseClient: {
  from: ReturnType<typeof vi.fn>
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  user?: { sub: string; role: string; sessionId: string } | null
}) {
  return {
    supabase: {
      from: overrides?.supabaseFrom ?? vi.fn(),
    } as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

describe('blind index for national_id', () => {
  const createCaller = createCallerFactory(appRouter)

  it('uses HMAC-based blind index for national_id lookup', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    })

    const ctx = createTestContext({
      supabaseFrom: mockFrom,
      user: { sub: 'user-1', role: 'DOCTOR', sessionId: 'sess-1' },
    })

    const caller = createCaller(ctx)
    await caller.patient.search({ query: '12345' })

    // Verify the query was called
    expect(mockFrom).toHaveBeenCalledWith('patients')

    // Get the `.or()` call and verify it uses HMAC hash, not plain SHA-256
    const selectMock = mockFrom.mock.results[0]!.value.select
    const orMock = selectMock.mock.results[0]!.value.or
    const orArg = orMock.mock.calls[0]![0] as string

    // The hash in the query should be an HMAC-SHA256 (deterministic with key),
    // not a plain SHA-256 hash
    expect(orArg).toContain('ultranos_national_id_hash.eq.')

    // The hash should be a 64-char hex string
    const hashMatch = orArg.match(/ultranos_national_id_hash\.eq\.([0-9a-f]{64})/)
    expect(hashMatch).not.toBeNull()

    // Verify it's NOT the old plain SHA-256 (without HMAC key)
    const { createHash } = await import('crypto')
    const plainSha256 = createHash('sha256').update('12345').digest('hex')
    expect(hashMatch![1]).not.toBe(plainSha256)
  })

  it('produces consistent HMAC hashes for the same input', async () => {
    const { generateBlindIndex } = await import('@ultranos/crypto/server')

    const hash1 = generateBlindIndex('NATIONAL-ID-123', TEST_HMAC_KEY)
    const hash2 = generateBlindIndex('NATIONAL-ID-123', TEST_HMAC_KEY)
    expect(hash1).toBe(hash2)
  })
})
