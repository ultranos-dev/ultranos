import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SignJWT, UnsecuredJWT } from 'jose'

/**
 * Story 56.4 (audit H-HUB-8): JWT algorithm pinning.
 *
 * The verifier must NOT select the accepted algorithm from the token's own
 * (unverified) header. Each path pins an explicit `algorithms` allowlist, so a
 * token whose header requests an unexpected/forgeable algorithm is rejected.
 */
const SECRET = 'test-secret-key-at-least-32-chars-long'

async function importFresh() {
  const { verifySupabaseJwt } = await import('../lib/jwt')
  return verifySupabaseJwt
}

describe('verifySupabaseJwt — algorithm pinning (H-HUB-8)', () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = SECRET
    // Ensure no issuer/audience is asserted for these bare test tokens.
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_JWT_AUD
  })

  afterEach(() => {
    delete process.env.SUPABASE_JWT_SECRET
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_JWT_AUD
  })

  it('verifies a legitimate HS256 token (regression — no false negatives)', async () => {
    const verifySupabaseJwt = await importFresh()
    const secret = new TextEncoder().encode(SECRET)
    const token = await new SignJWT({ sub: 'user-1', role: 'DOCTOR' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret)

    const result = await verifySupabaseJwt(token)
    expect(result).not.toBeNull()
    expect(result!.sub).toBe('user-1')
  })

  it('rejects an unsigned "alg: none" token (algorithm confusion)', async () => {
    const verifySupabaseJwt = await importFresh()
    // UnsecuredJWT emits header { alg: 'none' } — must never be accepted.
    const token = new UnsecuredJWT({ sub: 'attacker', role: 'ADMIN' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .encode()

    const result = await verifySupabaseJwt(token)
    expect(result).toBeNull()
  })

  it('rejects a token whose header requests an algorithm outside the allowlist (HS512)', async () => {
    const verifySupabaseJwt = await importFresh()
    // Signed HS512 with the shared secret, header alg: HS512. Even though the key
    // material matches, HS512 is not in the HS256 allowlist → rejected.
    const secret = new TextEncoder().encode(SECRET)
    const token = await new SignJWT({ sub: 'attacker', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret)

    const result = await verifySupabaseJwt(token)
    expect(result).toBeNull()
  })

  it('rejects a malformed / non-JWT token', async () => {
    const verifySupabaseJwt = await importFresh()
    expect(await verifySupabaseJwt('not.a.jwt')).toBeNull()
    expect(await verifySupabaseJwt('')).toBeNull()
  })

  it('rejects an ES256-header token when no JWKS (SUPABASE_URL) is configured', async () => {
    const verifySupabaseJwt = await importFresh()
    // Craft a token with an ES256 header but a bogus body/sig. Routing selects the
    // JWKS path; with no SUPABASE_URL there is no key source → null (never falls
    // back to the HMAC secret).
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url')
    const token = `${header}.${body}.bogussignature`

    const result = await verifySupabaseJwt(token)
    expect(result).toBeNull()
  })
})
