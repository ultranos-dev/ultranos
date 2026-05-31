/**
 * Westgard Multi-Rule Engine Tests — Story 43.6
 *
 * Tests 9.1–9.8 from the story acceptance criteria.
 * All functions are pure (no DB, no mocks needed).
 */

import { describe, it, expect } from 'vitest'
import {
  check1_2s,
  check1_3s,
  check2_2s,
  checkR_4s,
  check4_1s,
  check10x,
  runAllWestgardRules,
} from '@/lib/qc/westgard-rules'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MEAN = 100
const SD = 5

// Helper to make a series of in-range values (within 1SD, alternating sides of mean
// to avoid triggering the 10x systematic bias rule)
function inRangeValues(count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    i % 2 === 0 ? MEAN + SD * 0.3 : MEAN - SD * 0.3,
  )
}

// ---------------------------------------------------------------------------
// 1-3s Rule (AC 9.1, 9.2)
// ---------------------------------------------------------------------------

describe('check1_3s', () => {
  // AC 9.1: detects single value > 3SD from mean
  it('detects a value exceeding +3SD (REJECT)', () => {
    const values = [...inRangeValues(5), MEAN + 3 * SD + 0.01] // 115.01
    const result = check1_3s(values, MEAN, SD)
    expect(result.violated).toBe(true)
    expect(result.rule).toBe('1_3S')
    expect(result.severity).toBe('REJECT')
    expect(result.consecutiveCount).toBe(1)
  })

  it('detects a value exceeding -3SD (REJECT)', () => {
    const values = [...inRangeValues(3), MEAN - 3 * SD - 0.01] // 84.99
    const result = check1_3s(values, MEAN, SD)
    expect(result.violated).toBe(true)
    expect(result.severity).toBe('REJECT')
  })

  // AC 9.2: passes for values within 3SD
  it('does not flag value exactly at 3SD boundary (not exceeded)', () => {
    const values = [...inRangeValues(4), MEAN + 3 * SD] // exactly 115
    const result = check1_3s(values, MEAN, SD)
    expect(result.violated).toBe(false)
  })

  it('passes for all values well within range', () => {
    const values = inRangeValues(10)
    const result = check1_3s(values, MEAN, SD)
    expect(result.violated).toBe(false)
  })

  it('returns non-violated for empty values array', () => {
    const result = check1_3s([], MEAN, SD)
    expect(result.violated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2-2s Rule (AC 9.3, 9.4)
// ---------------------------------------------------------------------------

describe('check2_2s', () => {
  // AC 9.3: detects 2 consecutive values > 2SD in same direction
  it('detects 2 consecutive values above +2SD (REJECT)', () => {
    const values = [
      ...inRangeValues(4),
      MEAN + 2 * SD + 0.1, // 110.1
      MEAN + 2 * SD + 0.5, // 110.5
    ]
    const result = check2_2s(values, MEAN, SD)
    expect(result.violated).toBe(true)
    expect(result.rule).toBe('2_2S')
    expect(result.severity).toBe('REJECT')
    expect(result.consecutiveCount).toBe(2)
  })

  it('detects 2 consecutive values below -2SD (REJECT)', () => {
    const values = [
      ...inRangeValues(3),
      MEAN - 2 * SD - 0.1, // 89.9
      MEAN - 2 * SD - 0.3, // 89.7
    ]
    const result = check2_2s(values, MEAN, SD)
    expect(result.violated).toBe(true)
    expect(result.severity).toBe('REJECT')
  })

  // AC 9.4: does NOT flag when values are on opposite sides of mean
  it('does not flag when the 2 values are on opposite sides of 2SD', () => {
    const values = [
      ...inRangeValues(4),
      MEAN + 2 * SD + 0.1, // +2SD side
      MEAN - 2 * SD - 0.1, // -2SD side
    ]
    const result = check2_2s(values, MEAN, SD)
    expect(result.violated).toBe(false)
  })

  it('requires minimum 2 values to apply', () => {
    const result = check2_2s([MEAN + 2 * SD + 1], MEAN, SD)
    expect(result.violated).toBe(false)
  })

  it('returns non-violated for empty values array', () => {
    const result = check2_2s([], MEAN, SD)
    expect(result.violated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 1-2s Rule (AC 9.5 — warning)
// ---------------------------------------------------------------------------

describe('check1_2s', () => {
  // AC 9.5: detects single value > 2SD as warning
  it('detects a value exceeding +2SD as WARNING', () => {
    const values = [...inRangeValues(3), MEAN + 2 * SD + 0.01] // 110.01
    const result = check1_2s(values, MEAN, SD)
    expect(result.violated).toBe(true)
    expect(result.rule).toBe('1_2S')
    expect(result.severity).toBe('WARNING')
  })

  it('detects a value exceeding -2SD as WARNING', () => {
    const values = [...inRangeValues(2), MEAN - 2 * SD - 0.5] // 89.5
    const result = check1_2s(values, MEAN, SD)
    expect(result.violated).toBe(true)
    expect(result.severity).toBe('WARNING')
  })

  it('does not flag value within 2SD', () => {
    const values = [...inRangeValues(5), MEAN + SD] // within 2SD
    const result = check1_2s(values, MEAN, SD)
    expect(result.violated).toBe(false)
  })

  it('checks only the most recent value', () => {
    // First value way out of range, but LAST value is fine
    const values = [MEAN + 4 * SD, MEAN + 0.1]
    const result = check1_2s(values, MEAN, SD)
    expect(result.violated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// R-4s Rule (AC 9.6)
// ---------------------------------------------------------------------------

describe('checkR_4s', () => {
  // AC 9.6: detects range > 4SD between consecutive values
  it('detects range > 4SD between last 2 values (REJECT)', () => {
    // Range must exceed 4 * SD = 20
    const values = [
      ...inRangeValues(3),
      MEAN + 2 * SD + 0.1,  // 110.1
      MEAN - 2 * SD - 0.1,  // 89.9  — range = 20.2
    ]
    const result = checkR_4s(values, MEAN, SD)
    expect(result.violated).toBe(true)
    expect(result.rule).toBe('R_4S')
    expect(result.severity).toBe('REJECT')
  })

  it('does not flag when range is exactly 4SD (not exceeded)', () => {
    const values = [MEAN + 2 * SD, MEAN - 2 * SD] // range = exactly 4SD = 20
    const result = checkR_4s(values, MEAN, SD)
    expect(result.violated).toBe(false)
  })

  it('requires minimum 2 values to apply', () => {
    const result = checkR_4s([MEAN + 3 * SD], MEAN, SD)
    expect(result.violated).toBe(false)
  })

  it('does not flag small range between last 2 values', () => {
    const values = [...inRangeValues(5), MEAN + SD * 0.3]
    const result = checkR_4s(values, MEAN, SD)
    expect(result.violated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4-1s Rule (AC 9.7 — systematic shift)
// ---------------------------------------------------------------------------

describe('check4_1s', () => {
  // AC 9.7: detects 4 consecutive values beyond 1SD on same side
  it('detects 4 consecutive values above +1SD (WARNING)', () => {
    const values = [
      ...inRangeValues(3),
      MEAN + SD + 0.1,
      MEAN + SD + 0.2,
      MEAN + SD + 0.5,
      MEAN + SD + 0.3,
    ]
    const result = check4_1s(values, MEAN, SD)
    expect(result.violated).toBe(true)
    expect(result.rule).toBe('4_1S')
    expect(result.severity).toBe('WARNING')
    expect(result.consecutiveCount).toBe(4)
  })

  it('detects 4 consecutive values below -1SD (WARNING)', () => {
    const values = [
      MEAN - SD - 0.1,
      MEAN - SD - 0.3,
      MEAN - SD - 0.2,
      MEAN - SD - 0.4,
    ]
    const result = check4_1s(values, MEAN, SD)
    expect(result.violated).toBe(true)
    expect(result.severity).toBe('WARNING')
  })

  it('does not flag when only 3 consecutive values are beyond 1SD', () => {
    const values = [
      MEAN,                  // in range (no shift)
      MEAN + SD + 0.1,
      MEAN + SD + 0.2,
      MEAN + SD + 0.3,
    ]
    // Only 3 of last 4 are above +1SD (first of the 4 is MEAN, not above +1SD)
    const result = check4_1s(values, MEAN, SD)
    expect(result.violated).toBe(false)
  })

  it('does not flag when values straddle both sides of 1SD', () => {
    const values = [
      MEAN + SD + 0.1,
      MEAN - SD - 0.1,  // opposite side
      MEAN + SD + 0.2,
      MEAN + SD + 0.3,
    ]
    const result = check4_1s(values, MEAN, SD)
    expect(result.violated).toBe(false)
  })

  it('requires minimum 4 values to apply', () => {
    const result = check4_1s([MEAN + SD + 1, MEAN + SD + 2, MEAN + SD + 3], MEAN, SD)
    expect(result.violated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 10x Rule (AC 9.8 — systematic bias)
// ---------------------------------------------------------------------------

describe('check10x', () => {
  // AC 9.8: detects 10 consecutive values on same side of mean
  it('detects 10 consecutive values above mean (WARNING)', () => {
    const values = Array.from({ length: 10 }, (_, i) => MEAN + 0.1 * (i + 1))
    const result = check10x(values, MEAN)
    expect(result.violated).toBe(true)
    expect(result.rule).toBe('10X')
    expect(result.severity).toBe('WARNING')
    expect(result.consecutiveCount).toBe(10)
  })

  it('detects 10 consecutive values below mean (WARNING)', () => {
    const values = Array.from({ length: 10 }, () => MEAN - 0.5)
    const result = check10x(values, MEAN)
    expect(result.violated).toBe(true)
  })

  it('does not flag when a value exactly equals the mean', () => {
    const values = [
      ...Array.from({ length: 9 }, () => MEAN + 0.1),
      MEAN, // exactly at mean — not "above" or "below"
    ]
    const result = check10x(values, MEAN)
    // MEAN is neither > mean nor < mean, so the 10-all-above rule breaks
    expect(result.violated).toBe(false)
  })

  it('skips the rule when fewer than 10 values exist (pitfall #6)', () => {
    const values = Array.from({ length: 9 }, () => MEAN + 1)
    const result = check10x(values, MEAN)
    expect(result.violated).toBe(false)
  })

  it('does not flag when values straddle the mean', () => {
    const values = [
      ...Array.from({ length: 9 }, () => MEAN + 0.1),
      MEAN - 0.1,  // one value below
    ]
    const result = check10x(values, MEAN)
    expect(result.violated).toBe(false)
  })

  it('uses only last 10 values from a longer series', () => {
    // First value is below mean; last 10 are all above
    const values = [
      MEAN - 5,
      ...Array.from({ length: 10 }, () => MEAN + 1),
    ]
    const result = check10x(values, MEAN)
    expect(result.violated).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// runAllWestgardRules (orchestration)
// ---------------------------------------------------------------------------

describe('runAllWestgardRules', () => {
  it('returns empty array when no rules are violated', () => {
    const values = inRangeValues(10)
    const results = runAllWestgardRules(values, MEAN, SD)
    expect(results).toHaveLength(0)
  })

  it('returns 1-3s violation for extreme outlier', () => {
    const values = [...inRangeValues(5), MEAN + 4 * SD] // 120
    const results = runAllWestgardRules(values, MEAN, SD)
    const rules = results.map((r) => r.rule)
    expect(rules).toContain('1_3S')
    // 1-2s should also trigger (same value > 2SD)
    expect(rules).toContain('1_2S')
  })

  it('returns only violated rules', () => {
    // Only 1-2s should trigger (latest value between 2SD and 3SD)
    const values = [...inRangeValues(5), MEAN + 2.5 * SD]
    const results = runAllWestgardRules(values, MEAN, SD)
    expect(results.every((r) => r.violated)).toBe(true)
  })
})
