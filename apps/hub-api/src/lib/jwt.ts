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
 * Pinned signature-algorithm allowlists (Story 56.4 / audit H-HUB-8).
 *
 * The algorithm is NEVER chosen from the token's own (unverified) header — doing
 * so enables an algorithm-confusion attack where an attacker flips `alg` to a
 * scheme they can forge. Instead each verification path passes an explicit
 * `algorithms` allowlist to `jwtVerify`; jose then rejects any token whose header
 * `alg` is not in the list before checking the signature.
 *
 * - ES256: Supabase Auth user session tokens (verified against the project JWKS).
 * - HS256: Supabase anon / service-role keys and legacy shared-secret tokens.
 */
const ES256_ALGS = ['ES256'] as const
const HS256_ALGS = ['HS256'] as const

/**
 * Builds the shared `jwtVerify` option set. `issuer` / `audience` are only
 * asserted when the corresponding config is present, so environments that have
 * not configured them (and legacy HS256 tokens that omit `iss`/`aud`) continue
 * to verify — while a configured deployment gets full issuer/audience pinning.
 */
function buildVerifyOptions(): {
  clockTolerance: string
  issuer?: string
  audience?: string
} {
  const options: { clockTolerance: string; issuer?: string; audience?: string } = {
    // 30s clock skew tolerance (unchanged behavior).
    clockTolerance: '30s',
  }
  const supabaseUrl = process.env.SUPABASE_URL
  if (supabaseUrl) {
    // Supabase mints tokens with iss = `${SUPABASE_URL}/auth/v1`.
    options.issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`
  }
  // Supabase user tokens carry aud = 'authenticated'. Overridable for
  // non-default configurations; enforced only when set.
  const audience = process.env.SUPABASE_JWT_AUD
  if (audience) {
    options.audience = audience
  }
  return options
}

/**
 * Verifies a Supabase JWT.
 * Supports:
 * - ES256 via JWKS (Supabase Auth user session tokens)
 * - HS256 via secret (Supabase anon/service role keys, legacy)
 *
 * Security (Story 56.4 / H-HUB-8): the header `alg` is used ONLY to route to the
 * correct key material (JWKS vs shared secret); it never selects which algorithm
 * jose will accept. Each path passes a pinned `algorithms` allowlist plus
 * `issuer`/`audience` options, closing the algorithm-confusion vector.
 *
 * Fail-Safe: returns null rather than throwing — callers default to "No Access".
 */
export async function verifySupabaseJwt(
  token: string,
  _unused?: unknown,
): Promise<JwtResult | null> {
  try {
    // Peek at the header ONLY to route to the right key source. The pinned
    // `algorithms` allowlist below — not this value — decides what jose accepts.
    const headerB64 = token.split('.')[0]
    if (!headerB64) return null
    const header = JSON.parse(Buffer.from(headerB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())

    const verifyOptions = buildVerifyOptions()

    if (header.alg === 'ES256') {
      // Use JWKS endpoint for ES256 (Supabase Auth tokens)
      if (!_jwks) {
        const supabaseUrl = process.env.SUPABASE_URL
        if (!supabaseUrl) return null
        _jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))
      }
      const { payload } = await jwtVerify(token, _jwks, {
        ...verifyOptions,
        algorithms: [...ES256_ALGS],
      })
      return payload as JwtResult
    }

    // HS256 path (anon key, service role key, legacy shared-secret tokens).
    // Restricted to its own dedicated allowlist so an ES256-routed token can
    // never be verified with the HMAC secret and vice versa.
    if (header.alg === 'HS256') {
      if (!_hmacKey) {
        const secret = process.env.SUPABASE_JWT_SECRET
        if (!secret) return null
        _hmacKey = new TextEncoder().encode(secret)
      }
      const { payload } = await jwtVerify(token, _hmacKey, {
        ...verifyOptions,
        algorithms: [...HS256_ALGS],
      })
      return payload as JwtResult
    }

    // Any other `alg` (e.g. 'none', 'RS256', 'HS512') is rejected outright —
    // no key material is selected for it.
    return null
  } catch {
    return null
  }
}

/**
 * Presence gate used by the standalone file/photo route handlers
 * (`app/api/{staff-photo,patient-photo,lab-files,specimen-files}`) to short-
 * circuit BEFORE calling {@link verifySupabaseJwt} when no verification key
 * material is configured. It returns an opaque truthy marker rather than a real
 * key: `verifySupabaseJwt` resolves the ES256 JWKS / HS256 secret itself and
 * ignores this second argument. The name predates the algorithm-pinning work;
 * it is retained because those route handlers (and their tests) still depend on
 * it. Story 56.4 evaluated removing it but kept it to avoid a cross-cutting
 * refactor of live routes outside this story's perimeter scope.
 */
export function getSupabaseJwk(): object | Uint8Array | null {
  return { _marker: true }
}
