import { jwtVerify, importJWK, createRemoteJWKSet, type JWTPayload } from 'jose'

type JwtResult = JWTPayload & {
  sub?: string
  role?: string
  session_id?: string
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
}

/**
 * Server-authoritative authorization claims resolved from a verified JWT.
 * Story 56.1 (audit C-SYS-1).
 */
export interface AuthzClaims {
  /** Uppercased app role ('' when no authoritative role claim exists). */
  role: string
  orgId: string | null
  facilityId: string | null
  status: string | null
}

/**
 * Resolves authorization claims (role / org / facility / status) from a
 * verified Supabase JWT payload.
 *
 * Story 56.1 (audit C-SYS-1): authorization fields are read EXCLUSIVELY from
 * `app_metadata` (writable only via the service-role Admin API) plus top-level
 * claims minted by GoTrue / the custom access-token hook. `user_metadata` is
 * rewritable by any authenticated end user via `supabase.auth.updateUser()`
 * and is NEVER consulted here.
 *
 * Defense-in-depth (Task 1.3): if a token carries a role claim only in
 * `user_metadata`, a security warning is logged (opaque IDs only — no PHI)
 * and the claim is ignored, so role-gated procedures fail closed.
 */
export function resolveAuthzClaims(payload: JwtResult): AuthzClaims {
  const appMeta = (payload.app_metadata as Record<string, unknown>) ?? {}
  const userMeta = (payload.user_metadata as Record<string, unknown>) ?? {}

  if (appMeta.role == null && userMeta.role != null) {
    // Possible privilege-escalation attempt or an unmigrated account.
    // Log opaque identifiers only (sub/session ids carry no PHI).
    console.warn('[SECURITY] Non-authoritative user_metadata role claim ignored', {
      sub: payload.sub ?? 'unknown',
      sessionId: (payload.session_id as string) ?? '',
    })
  }

  return {
    role: ((appMeta.role as string) ?? (payload.role as string) ?? '').toUpperCase(),
    orgId: (appMeta.org_id as string) ?? (payload.org_id as string) ?? null,
    facilityId: (appMeta.facility_id as string) ?? (payload.facility_id as string) ?? null,
    status: (appMeta.status as string) ?? null,
  }
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
    if (!headerB64) return null
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
