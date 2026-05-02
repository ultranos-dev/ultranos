import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Mock Supabase client with configurable responses
const mockSingle = vi.fn()
const mockIn = vi.fn(() => ({ data: [], error: null }))
const mockLte = vi.fn(() => ({ data: [], error: null }))
const mockEq = vi.fn().mockReturnThis()
const mockIs = vi.fn().mockReturnThis()
const mockGt = vi.fn(() => ({ data: [], error: null }))
const mockSelect = vi.fn(() => ({ eq: mockEq, single: mockSingle, in: mockIn, lte: mockLte, is: mockIs, gt: mockGt }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const { createTRPCRouter, createCallerFactory, protectedProcedure } = await import('../trpc/init')

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

describe('practitioner key router', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock chain
    mockEq.mockReturnThis()
    mockIs.mockReturnThis()
  })

  describe('getKeyStatus', () => {
    it('returns key status for a valid public key', async () => {
      const { practitionerKeyRouter } = await import('../trpc/routers/practitioner-key')

      const router = createTRPCRouter({ practitionerKey: practitionerKeyRouter })
      const caller = createCallerFactory(router)(makeCtx({
        sub: 'user-1', role: 'DOCTOR', sessionId: 'sess-1',
      }))

      mockSingle.mockResolvedValue({
        data: {
          id: 'key-1',
          practitioner_id: 'prac-1',
          public_key_ed25519: 'dGVzdC1rZXk=',
          revoked_at: null,
          expires_at: '2027-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      })

      const result = await caller.practitionerKey.getKeyStatus({
        publicKey: 'dGVzdC1rZXk=',
      })

      expect(result.status).toBe('active')
      expect(result.practitionerId).toBe('prac-1')
      expect(result.publicKey).toBe('dGVzdC1rZXk=')
      expect(result.revokedAt).toBeNull()
      expect(result.expiresAt).toBe('2027-01-01T00:00:00Z')
    })

    it('returns revoked status for a revoked key', async () => {
      const { practitionerKeyRouter } = await import('../trpc/routers/practitioner-key')

      const router = createTRPCRouter({ practitionerKey: practitionerKeyRouter })
      const caller = createCallerFactory(router)(makeCtx({
        sub: 'user-1', role: 'DOCTOR', sessionId: 'sess-1',
      }))

      mockSingle.mockResolvedValue({
        data: {
          id: 'key-1',
          practitioner_id: 'prac-1',
          public_key_ed25519: 'dGVzdC1rZXk=',
          revoked_at: '2026-06-01T00:00:00Z',
          expires_at: '2027-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      })

      const result = await caller.practitionerKey.getKeyStatus({
        publicKey: 'dGVzdC1rZXk=',
      })

      expect(result.status).toBe('revoked')
      expect(result.revokedAt).toBe('2026-06-01T00:00:00Z')
    })

    it('returns expired status for an expired key', async () => {
      const { practitionerKeyRouter } = await import('../trpc/routers/practitioner-key')

      const router = createTRPCRouter({ practitionerKey: practitionerKeyRouter })
      const caller = createCallerFactory(router)(makeCtx({
        sub: 'user-1', role: 'DOCTOR', sessionId: 'sess-1',
      }))

      mockSingle.mockResolvedValue({
        data: {
          id: 'key-1',
          practitioner_id: 'prac-1',
          public_key_ed25519: 'dGVzdC1rZXk=',
          revoked_at: null,
          expires_at: '2020-01-01T00:00:00Z',
          created_at: '2019-01-01T00:00:00Z',
        },
        error: null,
      })

      const result = await caller.practitionerKey.getKeyStatus({
        publicKey: 'dGVzdC1rZXk=',
      })

      expect(result.status).toBe('expired')
    })

    it('throws NOT_FOUND when key does not exist', async () => {
      const { practitionerKeyRouter } = await import('../trpc/routers/practitioner-key')

      const router = createTRPCRouter({ practitionerKey: practitionerKeyRouter })
      const caller = createCallerFactory(router)(makeCtx({
        sub: 'user-1', role: 'DOCTOR', sessionId: 'sess-1',
      }))

      mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      })

      await expect(caller.practitionerKey.getKeyStatus({
        publicKey: 'nonexistent-key',
      })).rejects.toThrow(TRPCError)
    })

    it('requires authentication', async () => {
      const { practitionerKeyRouter } = await import('../trpc/routers/practitioner-key')

      const router = createTRPCRouter({ practitionerKey: practitionerKeyRouter })
      const caller = createCallerFactory(router)(makeCtx(null))

      await expect(caller.practitionerKey.getKeyStatus({
        publicKey: 'dGVzdC1rZXk=',
      })).rejects.toThrow(TRPCError)
    })
  })

  describe('getRevocationList', () => {
    it('returns list of revoked key hashes', async () => {
      const { practitionerKeyRouter } = await import('../trpc/routers/practitioner-key')

      const router = createTRPCRouter({ practitionerKey: practitionerKeyRouter })
      const caller = createCallerFactory(router)(makeCtx({
        sub: 'user-1', role: 'DOCTOR', sessionId: 'sess-1',
      }))

      // Mock for the "is not null" + select chain
      const mockData = [
        { public_key_ed25519: 'key1', revoked_at: '2026-06-01T00:00:00Z' },
        { public_key_ed25519: 'key2', revoked_at: '2026-06-02T00:00:00Z' },
      ]
      // Reset the chain for this specific query
      const mockIsNotNull = vi.fn().mockResolvedValue({ data: mockData, error: null })
      mockSelect.mockReturnValueOnce({ not: vi.fn().mockReturnValue({ is: vi.fn() }), eq: mockEq, single: mockSingle, in: mockIn, lte: mockLte, is: mockIs, gt: mockGt })
      // Re-approach: mock from for practitioner_keys table
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue(
            Promise.resolve({ data: mockData, error: null })
          ),
        }),
      })

      const result = await caller.practitionerKey.getRevocationList()

      expect(result).toBeDefined()
      expect(result.revokedKeys).toBeDefined()
      expect(Array.isArray(result.revokedKeys)).toBe(true)
    })

    it('requires authentication', async () => {
      const { practitionerKeyRouter } = await import('../trpc/routers/practitioner-key')

      const router = createTRPCRouter({ practitionerKey: practitionerKeyRouter })
      const caller = createCallerFactory(router)(makeCtx(null))

      await expect(caller.practitionerKey.getRevocationList()).rejects.toThrow(TRPCError)
    })
  })

  describe('revokeKey', () => {
    it('allows ADMIN to revoke a key', async () => {
      const { practitionerKeyRouter } = await import('../trpc/routers/practitioner-key')

      const router = createTRPCRouter({ practitionerKey: practitionerKeyRouter })
      const caller = createCallerFactory(router)(makeCtx({
        sub: 'admin-1', role: 'ADMIN', sessionId: 'sess-1',
      }))

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'key-1',
                practitioner_id: 'prac-1',
                public_key_ed25519: 'dGVzdC1rZXk=',
                revoked_at: '2026-06-01T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      })

      mockFrom.mockReturnValueOnce({
        update: mockUpdate,
      })

      const result = await caller.practitionerKey.revokeKey({
        publicKey: 'dGVzdC1rZXk=',
        reason: 'Key compromised',
      })

      expect(result.revoked).toBe(true)
    })

    it('rejects non-ADMIN users from revoking keys', async () => {
      const { practitionerKeyRouter } = await import('../trpc/routers/practitioner-key')

      const router = createTRPCRouter({ practitionerKey: practitionerKeyRouter })
      const caller = createCallerFactory(router)(makeCtx({
        sub: 'doc-1', role: 'DOCTOR', sessionId: 'sess-1',
      }))

      await expect(caller.practitionerKey.revokeKey({
        publicKey: 'dGVzdC1rZXk=',
        reason: 'Test revocation',
      })).rejects.toThrow(TRPCError)
    })
  })
})
