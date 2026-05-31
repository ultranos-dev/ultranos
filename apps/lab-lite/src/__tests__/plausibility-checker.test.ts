/**
 * Plausibility Checker tests — Story 43.5 + Story 43.8 Task 10.17
 *
 * Covers:
 *   - Physiological impossibility check (absolute ranges)
 *   - Reference range check using localized ranges (Story 43.8 AC #2)
 *   - Overall outcome computation
 */

import { describe, it, expect } from 'vitest'
import { checkPlausibility } from '../lib/plausibility-checker'
import type { ReferenceRange } from '../lib/reference-ranges/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRange(overrides: Partial<ReferenceRange> = {}): ReferenceRange {
  return {
    id: 'test-range-1',
    loincCode: '718-7',
    analyteName: 'Hemoglobin',
    ageMin: 18,
    ageMax: 65,
    gender: 'M',
    altitudeMin: 0,
    rangeMin: 13.5,
    rangeMax: 17.5,
    criticalMin: 7.0,
    criticalMax: 20.0,
    unit: 'g/dL',
    source: 'DEFAULT',
    version: 1,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    createdBy: 'system',
    createdAt: '2026-01-01T00:00:00.000Z',
    hlcTimestamp: 'hlc-test',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Physiological impossibility check
// ---------------------------------------------------------------------------

describe('Plausibility Checker — physiological impossibility (Task 8.1, 8.2)', () => {
  it('PASS for hemoglobin within absolute range', () => {
    const report = checkPlausibility('718-7', 15.0, 'g/dL', null)
    const check = report.checks.find((c) => c.checkType === 'PHYSIOLOGICAL_IMPOSSIBLE')
    expect(check?.outcome).toBe('PASS')
  })

  it('FAIL for hemoglobin above absolute max (25 g/dL)', () => {
    const report = checkPlausibility('718-7', 30.0, 'g/dL', null)
    const check = report.checks.find((c) => c.checkType === 'PHYSIOLOGICAL_IMPOSSIBLE')
    expect(check?.outcome).toBe('FAIL')
  })

  it('FAIL for sodium below absolute min (50 mEq/L)', () => {
    const report = checkPlausibility('2951-2', 30.0, 'mEq/L', null)
    const check = report.checks.find((c) => c.checkType === 'PHYSIOLOGICAL_IMPOSSIBLE')
    expect(check?.outcome).toBe('FAIL')
  })

  it('PASS for unknown LOINC (no absolute range defined)', () => {
    const report = checkPlausibility('99999-9', 50.0, 'unit', null)
    const check = report.checks.find((c) => c.checkType === 'PHYSIOLOGICAL_IMPOSSIBLE')
    expect(check?.outcome).toBe('PASS')
  })

  it('physiological impossibility is not overridable by localized range', () => {
    // Even with a wide localized range, absolute check still blocks
    const wideRange = makeRange({ rangeMin: 0, rangeMax: 50 })
    const report = checkPlausibility('718-7', 30.0, 'g/dL', wideRange)
    const physCheck = report.checks.find((c) => c.checkType === 'PHYSIOLOGICAL_IMPOSSIBLE')
    expect(physCheck?.outcome).toBe('FAIL')
    expect(report.overallOutcome).toBe('FAIL')
  })
})

// ---------------------------------------------------------------------------
// Reference range check — Task 10.17 (Task 8.3, 8.4)
// ---------------------------------------------------------------------------

describe('Plausibility Checker — reference range check (Task 10.17)', () => {
  it('PASS flag N for value in normal range', () => {
    const range = makeRange({ rangeMin: 13.5, rangeMax: 17.5 })
    const report = checkPlausibility('718-7', 15.0, 'g/dL', range)
    const refCheck = report.checks.find((c) => c.checkType === 'REFERENCE_RANGE')
    expect(refCheck?.outcome).toBe('PASS')
    expect(refCheck?.flagCode).toBe('N')
  })

  it('WARNING flag L for value below rangeMin', () => {
    const range = makeRange({ rangeMin: 13.5, rangeMax: 17.5, criticalMin: 7.0 })
    const report = checkPlausibility('718-7', 12.0, 'g/dL', range)
    const refCheck = report.checks.find((c) => c.checkType === 'REFERENCE_RANGE')
    expect(refCheck?.outcome).toBe('WARNING')
    expect(refCheck?.flagCode).toBe('L')
  })

  it('WARNING flag H for value above rangeMax', () => {
    const range = makeRange({ rangeMin: 13.5, rangeMax: 17.5, criticalMax: 20.0 })
    const report = checkPlausibility('718-7', 18.5, 'g/dL', range)
    const refCheck = report.checks.find((c) => c.checkType === 'REFERENCE_RANGE')
    expect(refCheck?.outcome).toBe('WARNING')
    expect(refCheck?.flagCode).toBe('H')
  })

  it('FAIL flag LL for critical low value', () => {
    const range = makeRange({ rangeMin: 13.5, rangeMax: 17.5, criticalMin: 7.0 })
    const report = checkPlausibility('718-7', 6.5, 'g/dL', range)
    const refCheck = report.checks.find((c) => c.checkType === 'REFERENCE_RANGE')
    expect(refCheck?.outcome).toBe('FAIL')
    expect(refCheck?.flagCode).toBe('LL')
  })

  it('FAIL flag HH for critical high value', () => {
    const range = makeRange({ rangeMin: 13.5, rangeMax: 17.5, criticalMax: 20.0 })
    const report = checkPlausibility('718-7', 21.0, 'g/dL', range)
    const refCheck = report.checks.find((c) => c.checkType === 'REFERENCE_RANGE')
    expect(refCheck?.outcome).toBe('FAIL')
    expect(refCheck?.flagCode).toBe('HH')
  })

  it('PASS (skipped) when no reference range provided', () => {
    const report = checkPlausibility('718-7', 15.0, 'g/dL', null)
    const refCheck = report.checks.find((c) => c.checkType === 'REFERENCE_RANGE')
    expect(refCheck?.outcome).toBe('PASS')
  })

  it('uses localized altitude-adjusted range — hemoglobin at altitude', () => {
    // At ≥2000m, normal hemoglobin is higher
    const altitudeRange = makeRange({
      altitudeMin: 2000,
      rangeMin: 15.0,
      rangeMax: 19.5,
      criticalMin: 9.0,
      criticalMax: 22.0,
    })
    // Value of 16.0 is normal at altitude but would be HIGH at sea level
    const report = checkPlausibility('718-7', 16.0, 'g/dL', altitudeRange)
    const refCheck = report.checks.find((c) => c.checkType === 'REFERENCE_RANGE')
    expect(refCheck?.outcome).toBe('PASS')
    expect(refCheck?.flagCode).toBe('N')
  })
})

// ---------------------------------------------------------------------------
// Overall outcome and report structure
// ---------------------------------------------------------------------------

describe('Plausibility Checker — overall outcome', () => {
  it('overall PASS when all checks pass', () => {
    const range = makeRange()
    const report = checkPlausibility('718-7', 15.0, 'g/dL', range)
    expect(report.overallOutcome).toBe('PASS')
    expect(report.checks).toHaveLength(4)
  })

  it('overall WARNING when reference range check warns', () => {
    const range = makeRange({ rangeMin: 13.5, rangeMax: 17.5 })
    const report = checkPlausibility('718-7', 12.0, 'g/dL', range)
    expect(report.overallOutcome).toBe('WARNING')
  })

  it('overall FAIL when physiological check fails', () => {
    const report = checkPlausibility('718-7', 30.0, 'g/dL', null)
    expect(report.overallOutcome).toBe('FAIL')
  })

  it('overall FAIL takes precedence over WARNING', () => {
    // Physiological FAIL + reference range WARNING → overall FAIL
    const range = makeRange({ rangeMin: 13.5, rangeMax: 17.5 })
    const report = checkPlausibility('718-7', 30.0, 'g/dL', range)
    expect(report.overallOutcome).toBe('FAIL')
  })

  it('report contains value, loincCode, unit', () => {
    const report = checkPlausibility('718-7', 15.0, 'g/dL', null)
    expect(report.value).toBe(15.0)
    expect(report.loincCode).toBe('718-7')
    expect(report.unit).toBe('g/dL')
  })
})
