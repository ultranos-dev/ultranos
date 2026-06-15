import { describe, it, expect } from 'vitest'
import { getDirection } from '@ultranos/ui-kit'

describe('getDirection (used by root layout)', () => {
  it('returns ltr for en', () => {
    expect(getDirection('en')).toBe('ltr')
  })

  it('returns rtl for ar', () => {
    expect(getDirection('ar')).toBe('rtl')
  })

  it('returns rtl for prs', () => {
    expect(getDirection('prs')).toBe('rtl')
  })

  it('returns rtl for ps', () => {
    expect(getDirection('ps')).toBe('rtl')
  })
})
