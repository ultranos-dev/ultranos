import { describe, it, expect } from 'vitest'
import { jaroWinkler } from '../scoring/jaro-winkler.js'
import { WEIGHTS, THRESHOLDS } from '../scoring/weights.js'
import { scoreCandidate } from '../scoring/score-candidate.js'
import { computeMpiResult, decideMpiAction } from '../decision/index.js'
import { SCORING_SCENARIOS } from './fixtures/afghan-names.js'
import type { MpiCandidate } from '../types.js'

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

describe('decideMpiAction threshold boundaries', () => {
  it('0 → ALLOW',   () => expect(decideMpiAction(0)).toBe('ALLOW'))
  it('59 → ALLOW',  () => expect(decideMpiAction(59)).toBe('ALLOW'))
  it('60 → WARN',   () => expect(decideMpiAction(60)).toBe('WARN'))
  it('89 → WARN',   () => expect(decideMpiAction(89)).toBe('WARN'))
  it('90 → BLOCK',  () => expect(decideMpiAction(90)).toBe('BLOCK'))
  it('999 → BLOCK', () => expect(decideMpiAction(999)).toBe('BLOCK'))
})

describe('scoreCandidate — hard identifier BLOCK', () => {
  it('nationalIdHash exact match → hardIdMatch=true, score=999', () => {
    const result = scoreCandidate(
      { nationalIdHash: 'abc123' },
      { id: 'p1', nationalIdHash: 'abc123' },
    )
    expect(result.hardIdMatch).toBe(true)
    expect(result.score).toBe(999)
  })

  it('tazkiraPaperHash exact match → hardIdMatch=true', () => {
    const result = scoreCandidate(
      { tazkiraPaperHash: 'xyz789' },
      { id: 'p2', tazkiraPaperHash: 'xyz789' },
    )
    expect(result.hardIdMatch).toBe(true)
    expect(result.score).toBe(999)
  })

  it('nationalIdHash mismatch → hardIdMatch=false', () => {
    const result = scoreCandidate(
      { nationalIdHash: 'abc123' },
      { id: 'p3', nationalIdHash: 'different' },
    )
    expect(result.hardIdMatch).toBe(false)
  })

  it('biometricFingerprintHash exact match → hardIdMatch=true', () => {
    const result = scoreCandidate(
      { biometricFingerprintHash: 'bio-hash-001' },
      { id: 'p10', biometricFingerprintHash: 'bio-hash-001' },
    )
    expect(result.hardIdMatch).toBe(true)
    expect(result.score).toBe(999)
  })

  it('patientId (Health Passport QR) exact match → hardIdMatch=true', () => {
    const result = scoreCandidate(
      { patientId: 'patient-uuid-qr-scan' },
      { id: 'patient-uuid-qr-scan' },
    )
    expect(result.hardIdMatch).toBe(true)
    expect(result.score).toBe(999)
  })
})

describe('scoreCandidate — soft scoring', () => {
  it('full name triplet exact + same birth year + same gender ≥ 90 pts', () => {
    const result = scoreCandidate(
      { nameGiven: 'Ahmad', nameFather: 'Mohammad', nameGrandfather: 'Karim', birthYear: 1985, gender: 'male' },
      { id: 'p4', nameGiven: 'Ahmad', nameFather: 'Mohammad', nameGrandfather: 'Karim', birthYear: 1985, gender: 'male' },
    )
    expect(result.score).toBeGreaterThanOrEqual(90)
    expect(result.breakdown.givenName).toBe(WEIGHTS.GIVEN_NAME_HIGH)
    expect(result.breakdown.fatherName).toBe(WEIGHTS.FATHER_NAME_HIGH)
    expect(result.breakdown.birthYear).toBe(WEIGHTS.BIRTH_YEAR_EXACT)
  })

  it('phone match only = exactly 25 pts (no name match)', () => {
    const result = scoreCandidate(
      { phone: '+93701234567' },
      { id: 'p5', nameGiven: 'Completely Different', phone: '+93701234567' },
    )
    expect(result.breakdown.phone).toBe(25)
    expect(result.score).toBe(25)
  })

  it('birth year ±2 years → BIRTH_YEAR_NEAR=8 pts', () => {
    const result = scoreCandidate(
      { nameGiven: 'Ali', birthYear: 1985 },
      { id: 'p6', nameGiven: 'Aly', birthYear: 1987 },
    )
    expect(result.breakdown.birthYear).toBe(WEIGHTS.BIRTH_YEAR_NEAR)
  })

  it('birth year ±3 years → 0 pts (outside NEAR window)', () => {
    const result = scoreCandidate(
      { birthYear: 1985 },
      { id: 'p7', birthYear: 1988 },
    )
    expect(result.breakdown.birthYear).toBe(0)
  })

  it('province match (no district match) → PROVINCE_ORIGIN_EXACT=5 pts', () => {
    const result = scoreCandidate(
      { addressDistrictOrigin: 'Panjwai', addressProvinceOrigin: 'Kandahar' },
      { id: 'p8', addressDistrictOrigin: 'Zhari', addressProvinceOrigin: 'Kandahar' },
    )
    expect(result.breakdown.districtOrigin).toBe(0)
    expect(result.breakdown.provinceOrigin).toBe(WEIGHTS.PROVINCE_ORIGIN_EXACT)
  })

  it('completely different names → score < 30', () => {
    const result = scoreCandidate(
      { nameGiven: 'Zubair', nameFather: 'Latif', birthYear: 1990 },
      { id: 'p9', nameGiven: 'Farida', nameFather: 'Rashid', birthYear: 1975 },
    )
    expect(result.score).toBeLessThan(30)
  })
})

describe('computeMpiResult — SCORING_SCENARIOS from fixtures', () => {
  for (const scenario of SCORING_SCENARIOS) {
    it(scenario.description, () => {
      const result = computeMpiResult([scenario.candidate as MpiCandidate], scenario.input)
      expect(result.decision).toBe(scenario.expectedDecision)
      if (scenario.minScore !== undefined) {
        expect(result.topScore).toBeGreaterThanOrEqual(scenario.minScore)
      }
      if (scenario.maxScore !== undefined) {
        expect(result.topScore).toBeLessThanOrEqual(scenario.maxScore)
      }
    })
  }
})

describe('computeMpiResult — edge cases', () => {
  it('empty candidates → ALLOW with topScore=0', () => {
    const result = computeMpiResult([], { nameGiven: 'Ahmad' })
    expect(result.decision).toBe('ALLOW')
    expect(result.topScore).toBe(0)
    expect(result.candidates).toHaveLength(0)
  })

  it('returns at most 5 candidates even with 10 inputs', () => {
    const candidates: MpiCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      nameGiven: 'Ahmad',
      nameFather: 'Mohammad',
      birthYear: 1985 + i,
    }))
    const result = computeMpiResult(candidates, { nameGiven: 'Ahmad', nameFather: 'Mohammad', birthYear: 1985 })
    expect(result.candidates.length).toBeLessThanOrEqual(5)
  })
})
