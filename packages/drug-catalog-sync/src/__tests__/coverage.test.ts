import { describe, it, expect } from 'vitest'
import { hasText, hasList, hasValue, isTier2, isTier3, presence } from '../coverage.js'
import type { DrugEntry } from '../client.js'

describe('coverage helpers', () => {
  it('hasText is true only when some language value is non-empty', () => {
    expect(hasText(undefined)).toBe(false)
    expect(hasText({ en: '' } as never)).toBe(false)
    expect(hasText({ en: '   ' } as never)).toBe(false)
    expect(hasText({ en: 'Take with food' } as never)).toBe(true)
    expect(hasText({ en: '', prs: 'با غذا' } as never)).toBe(true)
  })

  it('hasList / hasValue distinguish empty from present', () => {
    expect(hasList(undefined)).toBe(false)
    expect(hasList([])).toBe(false)
    expect(hasList(['x'])).toBe(true)
    expect(hasValue('')).toBe(false)
    expect(hasValue('rx')).toBe(true)
    expect(hasValue(0)).toBe(true)
    expect(hasValue(null)).toBe(false)
  })

  it('tier guards narrow by sentinel fields', () => {
    const tier1 = { atcCode: 'A' } as unknown as DrugEntry
    const tier2 = { atcCode: 'A', interactions: [] } as unknown as DrugEntry
    const tier3 = { atcCode: 'A', interactions: [], recallAlerts: [] } as unknown as DrugEntry
    expect(isTier2(tier1)).toBe(false)
    expect(isTier2(tier2)).toBe(true)
    expect(isTier3(tier2)).toBe(false)
    expect(isTier3(tier3)).toBe(true)
  })

  it('presence reports absent for empty arrays, objects, and scalars', () => {
    expect(presence([])).toBe('absent')
    expect(presence(['x'])).toBe('present')
    expect(presence({ en: '' })).toBe('absent')
    expect(presence({ en: 'hi' })).toBe('present')
    expect(presence('')).toBe('absent')
    expect(presence(undefined)).toBe('absent')
    // null is absent (not a finite number, not a non-empty string)
    expect(presence(null)).toBe('absent')
    // 0 is a finite number → present
    expect(presence(0)).toBe('present')
  })
})
