import { jwtVerify, importJWK, createRemoteJWKSet, type JWTPayload, type KeyLike } from 'jose'

type JwtResult = JWTPayload & {
  sub?: string
  role?: string
  session_id?: string
  user_metadata?: Record<string, unknown>
}

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let _hmacKey: Uint8Array | null = null

/**
 * Verifies a Supabase JWT.
 * Supports:
 * - ES256 via JWKS (Supabase Auth user session tokens)
 * - HS256 via secret (Supabase anon/service role keys, legacy)
 *
 * Fail-Safe: returns null rather than throwing — callers default to "No Access".
 */
export async function verifySupabaseJwt(
  token: string,
  _unused?: unknown,
): Promise<JwtResult | null> {
  try {
    // Peek at the header to determine algorithm
    const headerB64 = token.split('.')[0]
    const header = JSON.parse(Buffer.from(headerB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())

    if (header.alg === 'ES256') {
      // Use JWKS endpoint for ES256 (Supabase Auth tokens)
      if (!_jwks) {
        const supabaseUrl = process.env.SUPABASE_URL
        if (!supabaseUrl) return null
        _jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))
      }
      const { payload } = await jwtVerify(token, _jwks, { clockTolerance: '30s' })
      return payload as JwtResult
    }

    // HS256 fallback (anon key, service role key, legacy tokens)
    if (!_hmacKey) {
      const secret = process.env.SUPABASE_JWT_SECRET
      if (!secret) return null
      _hmacKey = new TextEncoder().encode(secret)
    }
    const { payload } = await jwtVerify(token, _hmacKey, { clockTolerance: '30s' })
    return payload as JwtResult
  } catch {
    return null
  }
}

/**
 * @deprecated - kept for backward compat with init.ts call signature.
 * The new verifySupabaseJwt auto-detects the algorithm.
 */
export function getSupabaseJwk(): object | Uint8Array | null {
  // Return a truthy marker so init.ts still calls verifySupabaseJwt
  return { _marker: true }
}
