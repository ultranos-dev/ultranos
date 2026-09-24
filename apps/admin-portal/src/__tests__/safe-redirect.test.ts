import { describe, it, expect } from 'vitest'
import { isSafeReturnUrl, safeReturnUrl } from '@/lib/safe-redirect'

/**
 * Story 56.4 (audit H-ADM-1): open-redirect guard for post-login returnUrl.
 */
describe('isSafeReturnUrl', () => {
  it('accepts a same-origin absolute path', () => {
    expect(isSafeReturnUrl('/dashboard')).toBe(true)
    expect(isSafeReturnUrl('/ar/dashboard')).toBe(true)
    expect(isSafeReturnUrl('/users?tab=active#top')).toBe(true)
    expect(isSafeReturnUrl('/')).toBe(true)
  })

  it('rejects protocol-relative // payloads', () => {
    expect(isSafeReturnUrl('//evil.com')).toBe(false)
    expect(isSafeReturnUrl('//evil.com/path')).toBe(false)
  })

  it('rejects backslash /\\ payloads', () => {
    expect(isSafeReturnUrl('/\\evil.com')).toBe(false)
    expect(isSafeReturnUrl('/\\/evil.com')).toBe(false)
  })

  it('rejects absolute off-origin URLs', () => {
    expect(isSafeReturnUrl('http://evil.com')).toBe(false)
    expect(isSafeReturnUrl('https://evil.com')).toBe(false)
    expect(isSafeReturnUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects relative paths without a leading slash', () => {
    expect(isSafeReturnUrl('dashboard')).toBe(false)
    expect(isSafeReturnUrl('evil.com')).toBe(false)
  })

  it('rejects empty, null, and non-string input', () => {
    expect(isSafeReturnUrl('')).toBe(false)
    expect(isSafeReturnUrl(null)).toBe(false)
    expect(isSafeReturnUrl(undefined)).toBe(false)
    // @ts-expect-error — defensive against non-string runtime input
    expect(isSafeReturnUrl(123)).toBe(false)
  })
})

describe('safeReturnUrl', () => {
  it('returns the returnUrl when safe', () => {
    expect(safeReturnUrl('/ar/dashboard', '/dashboard')).toBe('/ar/dashboard')
  })

  it('falls back for //evil.com', () => {
    expect(safeReturnUrl('//evil.com', '/dashboard')).toBe('/dashboard')
  })

  it('falls back for /\\evil.com', () => {
    expect(safeReturnUrl('/\\evil.com', '/dashboard')).toBe('/dashboard')
  })

  it('falls back for null / missing returnUrl', () => {
    expect(safeReturnUrl(null, '/dashboard')).toBe('/dashboard')
    expect(safeReturnUrl(undefined, '/dashboard')).toBe('/dashboard')
  })
})
