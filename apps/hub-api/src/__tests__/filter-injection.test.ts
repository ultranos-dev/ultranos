import { describe, it, expect } from 'vitest'
import { sanitizeFilterValue } from '@/lib/filter-sanitize'

// ============================================================
// Filter-injection tests — Story 62.2 (M-HUB-1)
// The shared sanitizer strips PostgREST filter metacharacters and escapes SQL
// LIKE wildcards so hostile search input cannot break out of an `.or()` clause.
// ============================================================

describe('sanitizeFilterValue (M-HUB-1)', () => {
  it('strips commas that would inject additional PostgREST filter clauses', () => {
    // A raw comma splits an `.or()` list — an attacker could append `role.eq.ADMIN`.
    const out = sanitizeFilterValue('foo,role.eq.ADMIN')
    expect(out).not.toContain(',')
    // The dot (filter operator separator) is also stripped.
    expect(out).not.toContain('.')
  })

  it('strips parentheses used for PostgREST grouping / in-lists', () => {
    const out = sanitizeFilterValue('x),actor_id.in.(1')
    expect(out).not.toContain('(')
    expect(out).not.toContain(')')
    expect(out).not.toContain(',')
  })

  it('strips stars and backslashes', () => {
    const out = sanitizeFilterValue('a*b\\c')
    expect(out).not.toContain('*')
    expect(out).not.toContain('\\c')
  })

  it('escapes SQL LIKE wildcards so they match literally', () => {
    expect(sanitizeFilterValue('50%')).toBe('50\\%')
    expect(sanitizeFilterValue('a_b')).toBe('a\\_b')
  })

  it('leaves ordinary search text intact', () => {
    expect(sanitizeFilterValue('Ahmad Shah')).toBe('Ahmad Shah')
    expect(sanitizeFilterValue('HAAD-12345')).toBe('HAAD-12345')
  })

  it('neutralizes a full injection payload end-to-end', () => {
    const hostile = '%,telecom_email.ilike.*@*,given_name.ilike.%'
    const term = `%${sanitizeFilterValue(hostile)}%`
    // The interpolated term must contain no filter-breaking metacharacters.
    const inner = term.slice(1, -1) // drop the intentional wrapping % wildcards
    expect(inner).not.toContain(',')
    expect(inner).not.toContain('(')
    expect(inner).not.toContain(')')
    expect(inner).not.toContain('*')
    // Any user-supplied % is escaped.
    expect(inner).not.toMatch(/(^|[^\\])%/)
  })
})
