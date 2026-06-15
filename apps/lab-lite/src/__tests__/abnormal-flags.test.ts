import { describe, it, expect } from 'vitest'
import { evaluateFlag } from '../lib/abnormal-flags'
import type { TemplateField } from '../lib/result-templates'

// Minimal template field fixtures
function makeNumericField(ranges: TemplateField['referenceRanges']): TemplateField {
  return {
    code: 'test_field',
    loincCode: 'custom',
    label: 'test',
    type: 'numeric',
    required: true,
    sortOrder: 1,
    referenceRanges: ranges,
  }
}

describe('evaluateFlag — numeric fields', () => {
  const STANDARD_FIELD = makeNumericField([
    { referenceLow: 4.5, referenceHigh: 11.0, criticalLow: 2.0, criticalHigh: 30.0 },
  ])

  it('returns null for a value within normal range', () => {
    expect(evaluateFlag(7.0, STANDARD_FIELD, 30, 'male')).toBeNull()
  })

  it('returns null at exactly referenceLow boundary (inclusive normal)', () => {
    expect(evaluateFlag(4.5, STANDARD_FIELD, 30, 'male')).toBeNull()
  })

  it('returns null at exactly referenceHigh boundary (inclusive normal)', () => {
    expect(evaluateFlag(11.0, STANDARD_FIELD, 30, 'male')).toBeNull()
  })

  it('returns L for value below referenceLow but above criticalLow', () => {
    expect(evaluateFlag(3.0, STANDARD_FIELD, 30, 'male')).toBe('L')
  })

  it('returns LL for value at exactly criticalLow boundary', () => {
    expect(evaluateFlag(2.0, STANDARD_FIELD, 30, 'male')).toBe('LL')
  })

  it('returns LL for value below criticalLow', () => {
    expect(evaluateFlag(1.0, STANDARD_FIELD, 30, 'male')).toBe('LL')
  })

  it('returns H for value above referenceHigh but below criticalHigh', () => {
    expect(evaluateFlag(15.0, STANDARD_FIELD, 30, 'male')).toBe('H')
  })

  it('returns HH for value at exactly criticalHigh boundary', () => {
    expect(evaluateFlag(30.0, STANDARD_FIELD, 30, 'male')).toBe('HH')
  })

  it('returns HH for value above criticalHigh', () => {
    expect(evaluateFlag(35.0, STANDARD_FIELD, 30, 'male')).toBe('HH')
  })
})

describe('evaluateFlag — gender-specific ranges', () => {
  const GENDER_FIELD = makeNumericField([
    { gender: 'male', referenceLow: 13.5, referenceHigh: 17.5, criticalLow: 7.0, criticalHigh: 20.0 },
    { gender: 'female', referenceLow: 12.0, referenceHigh: 16.0, criticalLow: 7.0, criticalHigh: 20.0 },
  ])

  it('applies male range for male patient', () => {
    // 12.5 is within female range but below male referenceLow (13.5)
    expect(evaluateFlag(12.5, GENDER_FIELD, 30, 'male')).toBe('L')
  })

  it('applies female range for female patient', () => {
    // 12.5 is within female range
    expect(evaluateFlag(12.5, GENDER_FIELD, 30, 'female')).toBeNull()
  })

  it('returns null when no range matches the gender (falls through to no flag)', () => {
    const MALE_ONLY_FIELD = makeNumericField([
      { gender: 'male', referenceLow: 10, referenceHigh: 20 },
    ])
    expect(evaluateFlag(5.0, MALE_ONLY_FIELD, 30, 'female')).toBeNull()
  })
})

describe('evaluateFlag — age-specific ranges', () => {
  const AGE_FIELD = makeNumericField([
    { ageMin: 0, ageMax: 17, referenceLow: 5.0, referenceHigh: 15.0 },
    { ageMin: 18, ageMax: 65, referenceLow: 4.5, referenceHigh: 11.0 },
    { ageMin: 66, referenceLow: 4.0, referenceHigh: 10.5 },
  ])

  it('selects pediatric range for patient aged 10', () => {
    // 4.8 is within adult range but below pediatric range
    expect(evaluateFlag(4.8, AGE_FIELD, 10, 'male')).toBe('L')
  })

  it('selects adult range for patient aged 30', () => {
    // 4.8 is within adult range
    expect(evaluateFlag(4.8, AGE_FIELD, 30, 'male')).toBeNull()
  })

  it('selects elderly range for patient aged 70', () => {
    // 4.2 is within elderly range
    expect(evaluateFlag(4.2, AGE_FIELD, 70, 'male')).toBeNull()
  })
})

describe('evaluateFlag — missing reference ranges', () => {
  it('returns null when field has no referenceRanges', () => {
    const NO_RANGE_FIELD = makeNumericField(undefined)
    expect(evaluateFlag(999, NO_RANGE_FIELD, 30, 'male')).toBeNull()
  })

  it('returns null when referenceRanges is empty array', () => {
    const EMPTY_FIELD = makeNumericField([])
    expect(evaluateFlag(999, EMPTY_FIELD, 30, 'male')).toBeNull()
  })
})

describe('evaluateFlag — no critical thresholds', () => {
  const NO_CRITICAL_FIELD = makeNumericField([
    { referenceLow: 80, referenceHigh: 100 },
  ])

  it('returns H when above referenceHigh with no criticalHigh', () => {
    expect(evaluateFlag(110, NO_CRITICAL_FIELD, 30, 'male')).toBe('H')
  })

  it('returns L when below referenceLow with no criticalLow', () => {
    expect(evaluateFlag(70, NO_CRITICAL_FIELD, 30, 'male')).toBe('L')
  })
})

describe('evaluateFlag — LL evaluated before L (boundary order)', () => {
  const FIELD = makeNumericField([
    { referenceLow: 4.5, referenceHigh: 11.0, criticalLow: 2.0, criticalHigh: 30.0 },
  ])

  it('value below referenceLow AND below criticalLow → LL, not L', () => {
    expect(evaluateFlag(1.5, FIELD, 30, 'male')).toBe('LL')
  })

  it('value above referenceHigh AND above criticalHigh → HH, not H', () => {
    expect(evaluateFlag(35, FIELD, 30, 'male')).toBe('HH')
  })
})
