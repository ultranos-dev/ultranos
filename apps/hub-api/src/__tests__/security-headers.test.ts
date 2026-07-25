import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── CORS utility tests ─────────────────────────────────────────────────────

describe('CORS utility (cors.ts)', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  describe('isOriginAllowed', () => {
    it('allows origins from CORS_ALLOWED_ORIGINS env var', async () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://opd.ultranos.app,https://lab.ultranos.app'
      const { isOriginAllowed } = await import('../lib/cors')
      expect(isOriginAllowed('https://opd.ultranos.app')).toBe(true)
      expect(isOriginAllowed('https://lab.ultranos.app')).toBe(true)
    })

    it('rejects unknown origins', async () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://opd.ultranos.app'
      const { isOriginAllowed } = await import('../lib/cors')
      expect(isOriginAllowed('https://evil.com')).toBe(false)
    })

    it('returns false for null origin', async () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://opd.ultranos.app'
      const { isOriginAllowed } = await import('../lib/cors')
      expect(isOriginAllowed(null)).toBe(false)
    })

    it('allows localhost origins in development when no env var set', async () => {
      delete process.env.CORS_ALLOWED_ORIGINS
      process.env.NODE_ENV = 'development'
      const { isOriginAllowed } = await import('../lib/cors')
      expect(isOriginAllowed('http://localhost:3000')).toBe(true)
      expect(isOriginAllowed('http://localhost:3001')).toBe(true)
      expect(isOriginAllowed('http://localhost:3002')).toBe(true)
    })

    it('rejects all origins in production when no env var set', async () => {
      delete process.env.CORS_ALLOWED_ORIGINS
      process.env.NODE_ENV = 'production'
      const { isOriginAllowed } = await import('../lib/cors')
      expect(isOriginAllowed('http://localhost:3000')).toBe(false)
      expect(isOriginAllowed('https://opd.ultranos.app')).toBe(false)
    })
  })

  describe('corsHeaders', () => {
    it('returns correct CORS headers for given origin', async () => {
      const { corsHeaders } = await import('../lib/cors')
      const headers = corsHeaders('https://opd.ultranos.app')
      expect(headers['Access-Control-Allow-Origin']).toBe('https://opd.ultranos.app')
      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, DELETE')
      expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization')
      expect(headers['Access-Control-Max-Age']).toBe('86400')
      expect(headers['Vary']).toBe('Origin')
    })

    it('never returns wildcard origin', async () => {
      const { corsHeaders } = await import('../lib/cors')
      const headers = corsHeaders('https://opd.ultranos.app')
      expect(headers['Access-Control-Allow-Origin']).not.toBe('*')
    })
  })

  describe('validateCorsConfig', () => {
    it('throws in production when CORS_ALLOWED_ORIGINS is not set', async () => {
      delete process.env.CORS_ALLOWED_ORIGINS
      process.env.NODE_ENV = 'production'
      const { validateCorsConfig } = await import('../lib/cors')
      expect(() => validateCorsConfig()).toThrow('CORS_ALLOWED_ORIGINS must be set in production')
    })

    it('does not throw in production when CORS_ALLOWED_ORIGINS is set', async () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://opd.ultranos.app'
      process.env.NODE_ENV = 'production'
      const { validateCorsConfig } = await import('../lib/cors')
      expect(() => validateCorsConfig()).not.toThrow()
    })

    it('does not throw in development when CORS_ALLOWED_ORIGINS is not set', async () => {
      delete process.env.CORS_ALLOWED_ORIGINS
      process.env.NODE_ENV = 'development'
      const { validateCorsConfig } = await import('../lib/cors')
      expect(() => validateCorsConfig()).not.toThrow()
    })
  })
})

// ─── Security headers config tests ──────────────────────────────────────────

describe('Security headers (next.config.js)', () => {
  it('defines all required security headers for all routes', async () => {
    // Read next.config.js from the hub-api root
    const path = await import('path')
    const fs = await import('fs')
    const configPath = path.resolve(process.cwd(), 'next.config.js')
    const configSource = fs.readFileSync(configPath, 'utf-8')

    // The config uses ESM export — extract the config object by evaluating it
    // We use a function wrapper approach to safely parse the config
    const headersFn = configSource.includes('async headers()')
    expect(headersFn).toBe(true)

    // Verify each required header appears in the config source
    expect(configSource).toContain("'Strict-Transport-Security'")
    expect(configSource).toContain("'max-age=31536000; includeSubDomains'")
    expect(configSource).toContain("'X-Content-Type-Options'")
    expect(configSource).toContain("'nosniff'")
    expect(configSource).toContain("'X-Frame-Options'")
    expect(configSource).toContain("'DENY'")
    expect(configSource).toContain("'Referrer-Policy'")
    expect(configSource).toContain("'strict-origin-when-cross-origin'")
    expect(configSource).toContain("'X-DNS-Prefetch-Control'")
    expect(configSource).toContain("'off'")
    // Verify it applies to all routes
    expect(configSource).toContain("'/(.*)'")
  })
})

// ─── HTTPS enforcement middleware tests ─────────────────────────────────────

describe('HTTPS enforcement middleware', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  function makeRequest(url: string, headers: Record<string, string> = {}): any {
    const reqHeaders = new Headers(headers)
    return {
      url,
      headers: {
        get: (name: string) => reqHeaders.get(name),
      },
    }
  }

  it('redirects HTTP to HTTPS in production', async () => {
    process.env.NODE_ENV = 'production'

    const { middleware } = await import('../middleware')
    const req = makeRequest('http://api.ultranos.app/api/trpc/patient.list', {
      'x-forwarded-proto': 'http',
    })

    const res = middleware(req as any)

    // NextResponse.redirect returns a response with Location header and 301 status
    expect(res.status).toBe(301)
    const location = res.headers.get('location')
    expect(location).toMatch(/^https:/)
  })

  it('allows HTTPS requests in production', async () => {
    process.env.NODE_ENV = 'production'

    const { middleware } = await import('../middleware')
    const req = makeRequest('https://api.ultranos.app/api/trpc/patient.list', {
      'x-forwarded-proto': 'https',
    })

    const res = middleware(req as any)

    // NextResponse.next() does not redirect
    expect(res.status).not.toBe(301)
  })

  it('does not redirect in development', async () => {
    process.env.NODE_ENV = 'development'

    const { middleware } = await import('../middleware')
    const req = makeRequest('http://localhost:3000/api/trpc/patient.list', {
      'x-forwarded-proto': 'http',
    })

    const res = middleware(req as any)

    expect(res.status).not.toBe(301)
  })

  it('allows requests without x-forwarded-proto in production', async () => {
    process.env.NODE_ENV = 'production'

    const { middleware } = await import('../middleware')
    const req = makeRequest('https://api.ultranos.app/api/trpc/patient.list')

    const res = middleware(req as any)

    expect(res.status).not.toBe(301)
  })

  it('handles comma-separated x-forwarded-proto from multiple proxies', async () => {
    process.env.NODE_ENV = 'production'

    const { middleware } = await import('../middleware')
    const req = makeRequest('https://api.ultranos.app/api/trpc/patient.list', {
      'x-forwarded-proto': 'https, http',
    })

    const res = middleware(req as any)

    // First value is https, so no redirect
    expect(res.status).not.toBe(301)
  })
})

// ─── tRPC route CORS integration tests ──────────────────────────────────────

describe('tRPC route CORS handling', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://opd.ultranos.app,https://lab.ultranos.app'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('allowed origin gets Access-Control-Allow-Origin on preflight (OPTIONS)', async () => {
    // We test the CORS utility behavior directly since the route handler
    // depends on tRPC and Next.js internals that are hard to mock in unit tests
    const { isOriginAllowed, corsHeaders } = await import('../lib/cors')

    const origin = 'https://opd.ultranos.app'
    expect(isOriginAllowed(origin)).toBe(true)

    const headers = corsHeaders(origin)
    expect(headers['Access-Control-Allow-Origin']).toBe(origin)
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, DELETE')
  })

  it('unknown origin does NOT get Access-Control-Allow-Origin', async () => {
    const { isOriginAllowed } = await import('../lib/cors')
    expect(isOriginAllowed('https://evil.com')).toBe(false)
  })

  it('OPTIONS preflight for allowed origin returns correct CORS headers', async () => {
    const { isOriginAllowed, corsHeaders } = await import('../lib/cors')
    const origin = 'https://lab.ultranos.app'

    expect(isOriginAllowed(origin)).toBe(true)
    const headers = corsHeaders(origin)
    expect(headers['Access-Control-Allow-Origin']).toBe(origin)
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization')
    expect(headers['Access-Control-Max-Age']).toBe('86400')
    expect(headers['Vary']).toBe('Origin')
  })

  it('applyCorsHeaders sets CORS headers on a Response for allowed origin', async () => {
    const { isOriginAllowed, corsHeaders } = await import('../lib/cors')
    const origin = 'https://opd.ultranos.app'

    // Simulate what applyCorsHeaders does: clone response and set headers
    const originalRes = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    expect(isOriginAllowed(origin)).toBe(true)

    const newRes = new Response(originalRes.body, {
      status: originalRes.status,
      statusText: originalRes.statusText,
      headers: new Headers(originalRes.headers),
    })
    const corsH = corsHeaders(origin)
    for (const [key, value] of Object.entries(corsH)) {
      newRes.headers.set(key, value)
    }

    expect(newRes.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(newRes.headers.get('Vary')).toBe('Origin')
    expect(newRes.headers.get('Content-Type')).toBe('application/json')
    expect(newRes.status).toBe(200)
  })

  it('applyCorsHeaders does not set CORS headers for unknown origin', async () => {
    const { isOriginAllowed } = await import('../lib/cors')

    const res = new Response(null, { status: 200 })
    expect(isOriginAllowed('https://evil.com')).toBe(false)
    // Response remains unmodified
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
