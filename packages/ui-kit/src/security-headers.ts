/**
 * Shared security headers for PWA spoke apps (Next.js).
 *
 * Returns a Next.js-compatible headers config array that applies
 * Content-Security-Policy (Report-Only), HSTS, and other hardening headers
 * to every route.
 *
 * CSP is in Report-Only mode until nonce-based script-src middleware is
 * implemented. Next.js injects inline scripts for hydration that would be
 * blocked by an enforced `script-src 'self'` policy.
 */

export interface SecurityHeadersConfig {
  /** Origin of the Hub API, e.g. "http://localhost:3001" */
  hubApiOrigin: string
  /** Optional CSP report-uri endpoint */
  reportUri?: string
  /**
   * Optional Supabase project origin, e.g. "https://xxxx.supabase.co". When set,
   * it is added to `connect-src` (the Supabase auth/storage/realtime client) and
   * `img-src` (signed-URL patient photos served from Supabase Storage) so those
   * requests are not blocked once CSP moves from report-only to enforcing.
   */
  supabaseOrigin?: string
}

interface HeaderEntry {
  key: string
  value: string
}

interface HeaderRule {
  source: string
  headers: HeaderEntry[]
}

/**
 * Extracts the origin (scheme + host + port) from a URL string.
 * Rejects values containing semicolons or whitespace to prevent CSP injection.
 */
function sanitizeOrigin(raw: string): string {
  if (/[;\s]/.test(raw)) {
    throw new Error(
      `Invalid hubApiOrigin: value must not contain semicolons or whitespace. Got: "${raw}"`,
    )
  }
  try {
    const url = new URL(raw)
    return url.origin
  } catch {
    return raw
  }
}

function buildCsp(hubApiOrigin: string, reportUri?: string, supabaseOrigin?: string): string {
  const origin = sanitizeOrigin(hubApiOrigin)
  const supabase = supabaseOrigin ? sanitizeOrigin(supabaseOrigin) : ''

  // Supabase origin (when provided) joins connect-src (auth/storage/realtime
  // client) and img-src (signed-URL patient photos).
  const connectSrc = ["'self'", origin, supabase].filter(Boolean).join(' ')
  const imgSrc = ["'self'", 'data:', 'blob:', supabase].filter(Boolean).join(' ')

  const directives: string[] = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSrc}`,
    `img-src ${imgSrc}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ]

  if (reportUri) {
    directives.push(`report-uri ${reportUri}`)
  }

  return directives.join('; ')
}

/**
 * Returns a Next.js `headers()` config array that attaches security headers
 * to every route matching `/(.*)`.\
 */
export function getSecurityHeaders(config: SecurityHeadersConfig): HeaderRule[] {
  const csp = buildCsp(config.hubApiOrigin, config.reportUri, config.supabaseOrigin)

  return [
    {
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy-Report-Only', value: csp },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-DNS-Prefetch-Control', value: 'off' },
      ],
    },
  ]
}
