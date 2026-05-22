import { describe, it, expect } from 'vitest'
import { jaroWinkler } from '../scoring/jaro-winkler.js'
import { WEIGHTS, THRESHOLDS } from '../scoring/weights.js'

describe('jaroWinkler', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroWinkler('muhammad', 'muhammad')).toBe(1.0)
  })

  it('returns 0.0 when either string is empty', () => {
    expect(jaroWinkler('', '')).toBe(0.0)
    expect(jaroWinkler('ahmad', '')).toBe(0.0)
    expect(jaroWinkler('', 'ahmad')).toBe(0.0)
  })

  it('returns > 0.85 for very similar names (one char difference)', () => {
    expect(jaroWinkler('ahmad', 'ahmd')).toBeGreaterThan(0.85)
  })

  it('returns < 0.85 for clearly different names', () => {
    expect(jaroWinkler('ahmad', 'zubair')).toBeLessThan(0.85)
  })

  it('is symmetric', () => {
    const ab = jaroWinkler('muhammad', 'mohammed')
    const ba = jaroWinkler('mohammed', 'muhammad')
    expect(ab).toBeCloseTo(ba, 10)
  })

  it('gives Winkler prefix bonus — martha/marhta classic example > 0.9', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeGreaterThan(0.9)
  })
})

describe('WEIGHTS constants', () => {
  it('GIVEN_NAME_HIGH is 30', () => expect(WEIGHTS.GIVEN_NAME_HIGH).toBe(30))
  it('GIVEN_NAME_LOW is 15', () => expect(WEIGHTS.GIVEN_NAME_LOW).toBe(15))
  it('FATHER_NAME_HIGH is 30', () => expect(WEIGHTS.FATHER_NAME_HIGH).toBe(30))
  it('GRANDFATHER_NAME_HIGH is 20', () => expect(WEIGHTS.GRANDFATHER_NAME_HIGH).toBe(20))
  it('BIRTH_YEAR_EXACT is 20', () => expect(WEIGHTS.BIRTH_YEAR_EXACT).toBe(20))
  it('BIRTH_YEAR_NEAR is 8', () => expect(WEIGHTS.BIRTH_YEAR_NEAR).toBe(8))
  it('GENDER_EXACT is 10', () => expect(WEIGHTS.GENDER_EXACT).toBe(10))
  it('DISTRICT_ORIGIN_EXACT is 20', () => expect(WEIGHTS.DISTRICT_ORIGIN_EXACT).toBe(20))
  it('PHONE_EXACT is 25', () => expect(WEIGHTS.PHONE_EXACT).toBe(25))
})

describe('THRESHOLDS constants', () => {
  it('BLOCK is 90', () => expect(THRESHOLDS.BLOCK).toBe(90))
  it('WARN is 60', () => expect(THRESHOLDS.WARN).toBe(60))
})
