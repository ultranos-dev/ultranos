import { describe, it, expect } from 'vitest'

// Test the Accept-Language header normalisation logic extracted from middleware.
// We test the pure normalisation function, not the Next.js middleware itself.
function normaliseAcceptLanguage(header: string): string {
  return header
    .replace(/\b(fa-AF|fa|prs)\b/g, 'prs')
    .replace(/\b(ps-AF)\b/g, 'ps')
}

describe('normaliseAcceptLanguage', () => {
  it('rewrites fa to prs', () => {
    expect(normaliseAcceptLanguage('fa,en;q=0.9')).toBe('prs,en;q=0.9')
  })

  it('rewrites fa-AF to prs', () => {
    expect(normaliseAcceptLanguage('fa-AF,en;q=0.8')).toBe('prs,en;q=0.8')
  })

  it('rewrites ps-AF to ps', () => {
    expect(normaliseAcceptLanguage('ps-AF,en;q=0.7')).toBe('ps,en;q=0.7')
  })

  it('leaves ar unchanged', () => {
    expect(normaliseAcceptLanguage('ar,en;q=0.9')).toBe('ar,en;q=0.9')
  })

  it('leaves en unchanged', () => {
    expect(normaliseAcceptLanguage('en-US,en;q=0.9')).toBe('en-US,en;q=0.9')
  })
})
