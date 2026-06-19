import { describe, it, expect } from 'vitest'
import { severityForSection } from '../transforms/onsides-severity.js'

describe('severityForSection', () => {
  it('maps label sections to severity', () => {
    expect(severityForSection('BW')).toBe('severe')
    expect(severityForSection('WP')).toBe('moderate')
    expect(severityForSection('AR')).toBe('mild')
    expect(severityForSection('SP')).toBe('mild')
    expect(severityForSection('')).toBe('mild')
  })
})
