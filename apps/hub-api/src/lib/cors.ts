/**
 * Story 21.4: CORS origin validation utility.
 *
 * Allowed origins come from CORS_ALLOWED_ORIGINS env var (comma-separated).
 * In development, localhost origins are allowed by default.
 */

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3007',
  'http://localhost:3008',
]

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS
  if (envOrigins) {
    return envOrigins.split(',').map((o) => o.trim()).filter(Boolean)
  }
  if (process.env.NODE_ENV !== 'production') {
    return DEV_ORIGINS
  }
  return []
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  return getAllowedOrigins().includes(origin)
}

export function validateCorsConfig(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.CORS_ALLOWED_ORIGINS
  ) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must be set in production. ' +
        'Provide a comma-separated list of allowed spoke app origins.'
    )
  }
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
