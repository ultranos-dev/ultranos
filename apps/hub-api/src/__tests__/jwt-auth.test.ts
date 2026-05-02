import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import type { KeyLike } from 'jose'

// Mock Supabase before imports
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

let privateKey: KeyLike
let publicKey: KeyLike
let jwkPublic: object

beforeEach(async () => {
  const keyPair = await generateKeyPair('RS256')
  privateKey = keyPair.privateKey
  publicKey = keyPair.publicKey
  jwkPublic = await exportJWK(publicKey)
})

async function createTestJwt(
  payload: Record<string, unknown>,
  key: KeyLike,
  options?: { expiresIn?: string },
) {
  let builder = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()

  if (options?.expiresIn) {
    builder = builder.setExpirationTime(options.expiresIn)
  } else {
    builder = builder.setExpirationTime('15m')
  }

  return builder.sign(key)
}

describe('verifySupabaseJwt', () => {
  it('returns decoded payload for a valid JWT', async () => {
    const { verifySupabaseJwt } = await import('../lib/jwt')

    const token = await createTestJwt(
      { sub: 'user-123', role: 'DOCTOR', session_id: 'sess-abc' },
      privateKey,
    )

    const result = await verifySupabaseJwt(token, jwkPublic)
    expect(result).not.toBeNull()
    expect(result!.sub).toBe('user-123')
    expect(result!.role).toBe('DOCTOR')
    expect(result!.session_id).toBe('sess-abc')
  })

  it('returns null for an expired JWT', async () => {
    const { verifySupabaseJwt } = await import('../lib/jwt')

    const token = await createTestJwt(
      { sub: 'user-123', role: 'DOCTOR', session_id: 'sess-abc' },
      privateKey,
      { expiresIn: '0s' },
    )

    // Wait a moment for token to expire
    await new Promise((r) => setTimeout(r, 1100))

    const result = await verifySupabaseJwt(token, jwkPublic)
    expect(result).toBeNull()
  })

  it('returns null for an invalid signature', async () => {
    const { verifySupabaseJwt } = await import('../lib/jwt')

    // Sign with a different key
    const other = await generateKeyPair('RS256')
    const token = await createTestJwt(
      { sub: 'user-123', role: 'DOCTOR', session_id: 'sess-abc' },
      other.privateKey,
    )

    const result = await verifySupabaseJwt(token, jwkPublic)
    expect(result).toBeNull()
  })

  it('returns null for a malformed token', async () => {
    const { verifySupabaseJwt } = await import('../lib/jwt')

    const result = await verifySupabaseJwt('not.a.jwt', jwkPublic)
    expect(result).toBeNull()
  })
})

describe('createTRPCContext — JWT integration', () => {
  it('populates user from valid JWT Authorization header', async () => {
    // Dynamically set env for JWK
    const jwkJson = JSON.stringify(jwkPublic)
    vi.stubEnv('SUPABASE_JWT_JWK', jwkJson)

    // Must re-import to pick up env stub
    vi.resetModules()
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
    const { createTRPCContext } = await import('../trpc/init')

    const token = await createTestJwt(
      { sub: 'user-456', role: 'PHARMACIST', session_id: 'sess-xyz' },
      privateKey,
    )

    const ctx = await createTRPCContext({
      headers: new Headers({ authorization: `Bearer ${token}` }),
    })

    expect(ctx.user).not.toBeNull()
    expect(ctx.user!.sub).toBe('user-456')
    expect(ctx.user!.role).toBe('PHARMACIST')
    expect(ctx.user!.sessionId).toBe('sess-xyz')

    vi.unstubAllEnvs()
  })

  it('sets user to null when no Authorization header is present', async () => {
    vi.resetModules()
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
    const { createTRPCContext } = await import('../trpc/init')

    const ctx = await createTRPCContext({
      headers: new Headers(),
    })

    expect(ctx.user).toBeNull()
  })

  it('sets user to null for invalid JWT', async () => {
    vi.stubEnv('SUPABASE_JWT_JWK', JSON.stringify(jwkPublic))

    vi.resetModules()
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
    const { createTRPCContext } = await import('../trpc/init')

    const ctx = await createTRPCContext({
      headers: new Headers({ authorization: 'Bearer invalid.token.here' }),
    })

    expect(ctx.user).toBeNull()

    vi.unstubAllEnvs()
  })
})
