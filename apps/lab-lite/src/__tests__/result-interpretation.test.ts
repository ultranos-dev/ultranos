/**
 * Tests for Story 45.4 — Plain-Language Audio Result Summaries
 * Task 9.2: interpretResult() boundary value and edge case coverage
 */

import { describe, it, expect } from 'vitest'
import { interpretResult, type ResultReferenceRange } from '../lib/result-interpretation'

// CBC haemoglobin reference range (g/dL) as a concrete fixture
const CBC_RANGE: ResultReferenceRange = {
  low: 12,
  high: 17,
  criticalLow: 7,
  criticalHigh: 20,
}

// Range without critical thresholds
const SIMPLE_RANGE: ResultReferenceRange = { low: 10, high: 20 }

// ---------------------------------------------------------------------------
// 9.2 — interpretResult() boundary and edge cases
// ---------------------------------------------------------------------------

describe('interpretResult — normal range', () => {
  it('returns normal when value is exactly at low boundary (inclusive)', () => {
    expect(interpretResult(12, CBC_RANGE)).toBe('normal')
  })

  it('returns normal when value is exactly at high boundary (inclusive)', () => {
    expect(interpretResult(17, CBC_RANGE)).toBe('normal')
  })

  it('returns normal for a mid-range value', () => {
    expect(interpretResult(14.5, CBC_RANGE)).toBe('normal')
  })
})

describe('interpretResult — low and high', () => {
  it('returns low when value is 1 below the low boundary', () => {
    expect(interpretResult(11.9, CBC_RANGE)).toBe('low')
  })

  it('returns low for a value clearly below the low boundary', () => {
    expect(interpretResult(9, CBC_RANGE)).toBe('low')
  })

  it('returns high when value is 1 above the high boundary', () => {
    expect(interpretResult(17.1, CBC_RANGE)).toBe('high')
  })

  it('returns high for a value clearly above the high boundary', () => {
    expect(interpretResult(19, CBC_RANGE)).toBe('high')
  })
})

describe('interpretResult — critical thresholds (takes priority over low/high)', () => {
  it('returns critical-low when value is exactly at criticalLow (inclusive ≤)', () => {
    expect(interpretResult(7, CBC_RANGE)).toBe('critical-low')
  })

  it('returns critical-low when value is below criticalLow', () => {
    expect(interpretResult(5, CBC_RANGE)).toBe('critical-low')
  })

  it('returns low (not critical) when value is 1 above criticalLow', () => {
    // 7.1 is below normal low (12) but above criticalLow (7) → low
    expect(interpretResult(7.1, CBC_RANGE)).toBe('low')
  })

  it('returns critical-high when value is exactly at criticalHigh (inclusive ≥)', () => {
    expect(interpretResult(20, CBC_RANGE)).toBe('critical-high')
  })

  it('returns critical-high when value is above criticalHigh', () => {
    expect(interpretResult(25, CBC_RANGE)).toBe('critical-high')
  })

  it('returns high (not critical) when value is 1 below criticalHigh', () => {
    // 19.9 is above normal high (17) but below criticalHigh (20) → high
    expect(interpretResult(19.9, CBC_RANGE)).toBe('high')
  })
})

describe('interpretResult — no critical thresholds defined', () => {
  it('returns low when value is below the low boundary', () => {
    expect(interpretResult(9, SIMPLE_RANGE)).toBe('low')
  })

  it('returns high when value is above the high boundary', () => {
    expect(interpretResult(21, SIMPLE_RANGE)).toBe('high')
  })

  it('returns normal when value is within the range', () => {
    expect(interpretResult(15, SIMPLE_RANGE)).toBe('normal')
  })

  it('returns normal when value is exactly at low boundary', () => {
    expect(interpretResult(10, SIMPLE_RANGE)).toBe('normal')
  })

  it('returns normal when value is exactly at high boundary', () => {
    expect(interpretResult(20, SIMPLE_RANGE)).toBe('normal')
  })
})

describe('interpretResult — only criticalLow defined', () => {
  const rangeOnlyCritLow: ResultReferenceRange = { low: 10, high: 20, criticalLow: 5 }

  it('returns critical-low when at criticalLow', () => {
    expect(interpretResult(5, rangeOnlyCritLow)).toBe('critical-low')
  })

  it('returns high when above the high boundary (no criticalHigh defined)', () => {
    expect(interpretResult(25, rangeOnlyCritLow)).toBe('high')
  })
})

describe('interpretResult — only criticalHigh defined', () => {
  const rangeOnlyCritHigh: ResultReferenceRange = { low: 10, high: 20, criticalHigh: 30 }

  it('returns critical-high when at criticalHigh', () => {
    expect(interpretResult(30, rangeOnlyCritHigh)).toBe('critical-high')
  })

  it('returns low when below the low boundary (no criticalLow defined)', () => {
    expect(interpretResult(5, rangeOnlyCritHigh)).toBe('low')
  })
})

describe('interpretResult — floating-point edge cases', () => {
  it('handles very small differences near the boundary', () => {
    // 11.9999... rounds into the low bucket, not normal
    expect(interpretResult(11.999, CBC_RANGE)).toBe('low')
  })

  it('handles zero value (critically low in a 12–17 range with criticalLow 7)', () => {
    expect(interpretResult(0, CBC_RANGE)).toBe('critical-low')
  })

  it('handles very large values (critical-high)', () => {
    expect(interpretResult(999, CBC_RANGE)).toBe('critical-high')
  })
})
