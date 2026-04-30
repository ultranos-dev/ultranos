import { jwtVerify, importJWK, type JWTPayload, type KeyLike } from 'jose'

/**
 * Verifies a Supabase JWT using the provided JWK public key.
 * Returns the decoded payload on success, or null on any failure
 * (expired, invalid signature, malformed token).
 *
 * Fail-Safe: returns null rather than throwing — callers default to "No Access".
 */
export async function verifySupabaseJwt(
  token: string,
  jwk: object,
): Promise<(JWTPayload & { sub?: string; role?: string; session_id?: string }) | null> {
  try {
    const key = await importJWK(jwk, 'RS256')
    const { payload } = await jwtVerify(token, key as KeyLike, {
      clockTolerance: '30s',
      issuer: process.env.SUPABASE_JWT_ISSUER || undefined,
      audience: process.env.SUPABASE_JWT_AUDIENCE || undefined,
    })
    return payload as JWTPayload & { sub?: string; role?: string; session_id?: string }
  } catch {
    // Any verification failure (expired, bad signature, malformed) → null
    return null
  }
}

let _cachedJwk: object | null = null

/**
 * Returns the Supabase JWT JWK from environment.
 * Caches after first parse for performance.
 */
export function getSupabaseJwk(): object | null {
  if (_cachedJwk) return _cachedJwk

  const raw = process.env.SUPABASE_JWT_JWK
  if (!raw) return null

  try {
    _cachedJwk = JSON.parse(raw)
    return _cachedJwk
  } catch {
    return null
  }
}
