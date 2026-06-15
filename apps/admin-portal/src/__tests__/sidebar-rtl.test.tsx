import { describe, it, expect } from 'vitest'

// Test the side prop derivation logic directly.
function getSidebarSide(locale: string): 'left' | 'right' {
  return ['ar', 'prs', 'ps'].includes(locale) ? 'right' : 'left'
}

describe('getSidebarSide', () => {
  it('returns left for en', () => {
    expect(getSidebarSide('en')).toBe('left')
  })

  it('returns right for ar', () => {
    expect(getSidebarSide('ar')).toBe('right')
  })

  it('returns right for prs', () => {
    expect(getSidebarSide('prs')).toBe('right')
  })

  it('returns right for ps', () => {
    expect(getSidebarSide('ps')).toBe('right')
  })

  it('returns left for unknown locale', () => {
    expect(getSidebarSide('fr')).toBe('left')
  })
})
