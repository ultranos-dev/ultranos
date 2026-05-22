import { describe, it, expect } from 'vitest'
import type { MpiDecision, MpiInput } from '../types.js'
import { normalizeNameComponent, computePhoneticTokens } from '../normalization/index.js'

describe('mpi-engine types', () => {
  it('MpiDecision has BLOCK WARN ALLOW values', () => {
    const decisions: MpiDecision[] = ['BLOCK', 'WARN', 'ALLOW']
    expect(decisions).toHaveLength(3)
  })

  it('MpiInput accepts all optional fields', () => {
    const input: MpiInput = { nameGiven: 'Ahmad', nameFather: 'Mohammad', birthYear: 1985, gender: 'male' }
    expect(input.nameGiven).toBe('Ahmad')
  })
})

describe('normalizeNameComponent', () => {
  it('lowercases and trims Latin input', () => {
    expect(normalizeNameComponent('  Ahmad  ')).toBe('ahmad')
  })

  it('applies Mohammad→muhammad variant (Latin)', () => {
    expect(normalizeNameComponent('Mohammad')).toBe('muhammad')
    expect(normalizeNameComponent('Mohammed')).toBe('muhammad')
    expect(normalizeNameComponent('Muhammad')).toBe('muhammad')
  })

  // محمد (U+0645 U+062D U+0645 U+062F)
  it('romanizes Arabic محمد to muhammad', () => {
    expect(normalizeNameComponent('\u0645\u062D\u0645\u062F')).toBe('muhammad')
  })

  // أحمد (U+0623 U+062D U+0645 U+062F)
  it('romanizes Arabic أحمد to ahmad', () => {
    expect(normalizeNameComponent('\u0623\u062D\u0645\u062F')).toBe('ahmad')
  })

  it('produces identical output for Arabic and Latin variants of the same name', () => {
    const arabic = normalizeNameComponent('\u0645\u062D\u0645\u062F')  // محمد
    const latin = normalizeNameComponent('Mohammed')
    expect(arabic).toBe(latin)
    expect(arabic).toBe('muhammad')
  })

  it('strips Arabic diacritics — مُحَمَّد same as محمد', () => {
    // U+0645 U+064F U+062D U+064E U+0645 U+0651 U+062F (with diacritics)
    const withDiacritics = normalizeNameComponent('\u0645\u064F\u062D\u064E\u0645\u0651\u062F')
    const without = normalizeNameComponent('\u0645\u062D\u0645\u062F')
    expect(withDiacritics).toBe(without)
  })

  it('handles Dari پ (U+067E) as p', () => {
    // پارس — p-a-r-s
    expect(normalizeNameComponent('\u067E\u0627\u0631\u0633')).toBe('pars')
  })

  it('handles Dari چ (U+0686) as ch', () => {
    // چمن — ch-m-n
    expect(normalizeNameComponent('\u0686\u0645\u0646')).toContain('ch')
  })

  it('returns empty string for empty/whitespace input', () => {
    expect(normalizeNameComponent('')).toBe('')
    expect(normalizeNameComponent('   ')).toBe('')
  })
})

describe('computePhoneticTokens', () => {
  it('returns Double Metaphone tokens for a Latin name', () => {
    const tokens = computePhoneticTokens('ahmad')
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens[0]).toBeTruthy()
  })

  it('Arabic محمد and Latin Mohammed produce identical tokens after normalization', () => {
    const arabicNorm = normalizeNameComponent('\u0645\u062D\u0645\u062F')  // muhammad
    const latinNorm = normalizeNameComponent('Mohammed')                    // muhammad
    expect(arabicNorm).toBe(latinNorm)
    const arabicTokens = computePhoneticTokens(arabicNorm)
    const latinTokens = computePhoneticTokens(latinNorm)
    expect(arabicTokens).toEqual(latinTokens)
  })

  it('returns empty array for empty input', () => {
    expect(computePhoneticTokens('')).toEqual([])
  })
})
