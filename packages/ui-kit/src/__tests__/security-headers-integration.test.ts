import { describe, it, expect } from 'vitest'
import { getSecurityHeaders } from '../security-headers'

/**
 * Integration-style tests verifying that each PWA app's Hub API origin
 * produces correct CSP connect-src directives.
 */
describe('getSecurityHeaders — per-app CSP integration', () => {
  const appConfigs = [
    { name: 'OPD Lite', hubApiOrigin: 'http://localhost:3000' },
    { name: 'Pharmacy Lite', hubApiOrigin: 'http://localhost:3000' },
    { name: 'Lab Lite', hubApiOrigin: 'http://localhost:3000' },
  ]

  for (const { name, hubApiOrigin } of appConfigs) {
    it(`${name}: CSP connect-src includes Hub API origin (${hubApiOrigin})`, () => {
      const rules = getSecurityHeaders({ hubApiOrigin })
      const csp = rules[0].headers.find(h => h.key === 'Content-Security-Policy-Report-Only')!
      expect(csp.value).toContain(`connect-src 'self' ${hubApiOrigin}`)
    })
  }

  it('strips path from hubApiOrigin URL for CSP connect-src', () => {
    const rules = getSecurityHeaders({ hubApiOrigin: 'http://localhost:3000/api/trpc' })
    const csp = rules[0].headers.find(h => h.key === 'Content-Security-Policy-Report-Only')!
    expect(csp.value).toContain("connect-src 'self' http://localhost:3000")
    expect(csp.value).not.toContain('/api/trpc')
  })

  it('returns all 6 security headers', () => {
    const rules = getSecurityHeaders({ hubApiOrigin: 'https://hub.example.com' })
    const headerKeys = rules[0].headers.map(h => h.key)
    expect(headerKeys).toEqual([
      'Content-Security-Policy-Report-Only',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'X-DNS-Prefetch-Control',
    ])
  })
})
