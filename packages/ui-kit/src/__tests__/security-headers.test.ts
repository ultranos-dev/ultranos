import { describe, it, expect } from 'vitest'
import { getSecurityHeaders } from '../security-headers'

describe('getSecurityHeaders', () => {
  const defaultConfig = { hubApiOrigin: 'https://hub.example.com' }

  it('returns a single header rule matching all routes', () => {
    const rules = getSecurityHeaders(defaultConfig)
    expect(rules).toHaveLength(1)
    expect(rules[0].source).toBe('/(.*)')
  })

  it('includes Content-Security-Policy-Report-Only header', () => {
    const rules = getSecurityHeaders(defaultConfig)
    const csp = rules[0].headers.find(h => h.key === 'Content-Security-Policy-Report-Only')
    expect(csp).toBeDefined()
    expect(csp!.value).toContain("default-src 'self'")
    expect(csp!.value).toContain("script-src 'self'")
    expect(csp!.value).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp!.value).toContain("connect-src 'self' https://hub.example.com")
    expect(csp!.value).toContain("img-src 'self' data: blob:")
    expect(csp!.value).toContain("font-src 'self'")
    expect(csp!.value).toContain("object-src 'none'")
    expect(csp!.value).toContain("base-uri 'self'")
    expect(csp!.value).toContain("form-action 'self'")
    expect(csp!.value).toContain("frame-ancestors 'none'")
  })

  it('includes worker-src and manifest-src for PWA compatibility', () => {
    const rules = getSecurityHeaders(defaultConfig)
    const csp = rules[0].headers.find(h => h.key === 'Content-Security-Policy-Report-Only')
    expect(csp!.value).toContain("worker-src 'self'")
    expect(csp!.value).toContain("manifest-src 'self'")
  })

  it('includes Strict-Transport-Security header', () => {
    const rules = getSecurityHeaders(defaultConfig)
    const hsts = rules[0].headers.find(h => h.key === 'Strict-Transport-Security')
    expect(hsts).toBeDefined()
    expect(hsts!.value).toBe('max-age=31536000; includeSubDomains')
  })

  it('includes X-Content-Type-Options: nosniff', () => {
    const rules = getSecurityHeaders(defaultConfig)
    const header = rules[0].headers.find(h => h.key === 'X-Content-Type-Options')
    expect(header).toBeDefined()
    expect(header!.value).toBe('nosniff')
  })

  it('includes X-Frame-Options: DENY', () => {
    const rules = getSecurityHeaders(defaultConfig)
    const header = rules[0].headers.find(h => h.key === 'X-Frame-Options')
    expect(header).toBeDefined()
    expect(header!.value).toBe('DENY')
  })

  it('includes Referrer-Policy header', () => {
    const rules = getSecurityHeaders(defaultConfig)
    const header = rules[0].headers.find(h => h.key === 'Referrer-Policy')
    expect(header).toBeDefined()
    expect(header!.value).toBe('strict-origin-when-cross-origin')
  })

  it('includes X-DNS-Prefetch-Control header', () => {
    const rules = getSecurityHeaders(defaultConfig)
    const header = rules[0].headers.find(h => h.key === 'X-DNS-Prefetch-Control')
    expect(header).toBeDefined()
    expect(header!.value).toBe('off')
  })

  it('includes report-uri in CSP when reportUri is provided', () => {
    const rules = getSecurityHeaders({
      hubApiOrigin: 'https://hub.example.com',
      reportUri: 'https://report.example.com/csp',
    })
    const csp = rules[0].headers.find(h => h.key === 'Content-Security-Policy-Report-Only')
    expect(csp!.value).toContain('report-uri https://report.example.com/csp')
  })

  it('omits report-uri from CSP when reportUri is not provided', () => {
    const rules = getSecurityHeaders(defaultConfig)
    const csp = rules[0].headers.find(h => h.key === 'Content-Security-Policy-Report-Only')
    expect(csp!.value).not.toContain('report-uri')
  })

  it('uses the provided hubApiOrigin in connect-src', () => {
    const rules = getSecurityHeaders({ hubApiOrigin: 'https://custom-api.example.com' })
    const csp = rules[0].headers.find(h => h.key === 'Content-Security-Policy-Report-Only')
    expect(csp!.value).toContain("connect-src 'self' https://custom-api.example.com")
  })

  it('extracts origin from URL with path (strips path)', () => {
    const rules = getSecurityHeaders({ hubApiOrigin: 'http://localhost:3000/api/trpc' })
    const csp = rules[0].headers.find(h => h.key === 'Content-Security-Policy-Report-Only')
    expect(csp!.value).toContain("connect-src 'self' http://localhost:3000")
    expect(csp!.value).not.toContain('/api/trpc')
  })

  it('throws on hubApiOrigin containing semicolons (CSP injection)', () => {
    expect(() =>
      getSecurityHeaders({ hubApiOrigin: "http://evil.com; script-src 'unsafe-eval'" }),
    ).toThrow(/must not contain semicolons/)
  })

  it('throws on hubApiOrigin containing whitespace', () => {
    expect(() =>
      getSecurityHeaders({ hubApiOrigin: 'http://evil.com http://also-evil.com' }),
    ).toThrow(/must not contain semicolons or whitespace/)
  })
})
