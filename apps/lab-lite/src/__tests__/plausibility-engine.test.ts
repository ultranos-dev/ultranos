/**
 * Unit Tests — Story 43.5: Result Plausibility Engine
 *
 * Covers all three check engines (absolute-range, delta, consistency)
 * and the orchestrator (runPlausibilityChecks / hasCriticalFlags).
 *
 * Delta checker tests mock the db module to avoid Dexie setup.
 * All other tests are pure, synchronous, zero-dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAbsoluteRange } from '../lib/plausibility/absolute-range-checker'
import { checkConsistency } from '../lib/plausibility/consistency-checker'
import { checkDelta } from '../lib/plausibility/delta-checker'
import { runPlausibilityChecks, hasCriticalFlags } from '../lib/plausibility/plausibility-checker'
import type { ResultSnapshot } from '../lib/plausibility/types'

// ---------------------------------------------------------------------------
// Mock db module (used by delta-checker and plausibility-checker orchestrator)
// ---------------------------------------------------------------------------

const mockGetPlausibilityConfig = vi.fn()
const mockGetMostRecentSnapshot = vi.fn()

vi.mock('../lib/db', () => ({
  db: {
    getPlausibilityConfig: (...args: unknown[]) => mockGetPlausibilityConfig(...args),
    getMostRecentSnapshot: (...args: unknown[]) => mockGetMostRecentSnapshot(...args),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPlausibilityConfig.mockResolvedValue(undefined)
  mockGetMostRecentSnapshot.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// checkAbsoluteRange
// ---------------------------------------------------------------------------

describe('checkAbsoluteRange — absolute range checker', () => {
  it('returns null for Hemoglobin within normal range (14.0 g/dL)', () => {
    expect(checkAbsoluteRange('718-7', 14.0)).toBeNull()
  })

  it('returns CRITICAL for Hemoglobin below absMin (-1 g/dL — impossible)', () => {
    const flag = checkAbsoluteRange('718-7', -1)
    expect(flag).not.toBeNull()
    expect(flag?.severity).toBe('CRITICAL')
    expect(flag?.ruleType).toBe('ABSOLUTE_RANGE')
    expect(flag?.loincCode).toBe('718-7')
    expect(flag?.acknowledged).toBe(false)
  })

  it('returns CRITICAL for Hemoglobin above absMax (31 g/dL — impossible)', () => {
    const flag = checkAbsoluteRange('718-7', 31)
    expect(flag?.severity).toBe('CRITICAL')
  })

  it('returns CRITICAL for Hemoglobin in critical clinical zone (2.5 g/dL)', () => {
    // criticalMin = 3.0 — value 2.5 is inside abs range but critically low
    const flag = checkAbsoluteRange('718-7', 2.5)
    expect(flag?.severity).toBe('CRITICAL')
  })

  it('returns CRITICAL for Hemoglobin above criticalMax (23 g/dL)', () => {
    const flag = checkAbsoluteRange('718-7', 23)
    expect(flag?.severity).toBe('CRITICAL')
  })

  it('returns WARNING for Hemoglobin between warnMin and criticalMin (5.0 g/dL)', () => {
    // warnMin=7.0, criticalMin=3.0 → 5.0 is below warnMin but not critical
    const flag = checkAbsoluteRange('718-7', 5.0)
    expect(flag?.severity).toBe('WARNING')
    expect(flag?.ruleType).toBe('ABSOLUTE_RANGE')
  })

  it('returns null for unknown analyte LOINC code', () => {
    expect(checkAbsoluteRange('999-9', 42.0)).toBeNull()
  })

  it('returns null for WBC within normal range (7.5 × 10³/μL)', () => {
    expect(checkAbsoluteRange('6690-2', 7.5)).toBeNull()
  })

  it('returns CRITICAL for Potassium below criticalMin (1.5 mEq/L)', () => {
    const flag = checkAbsoluteRange('2823-3', 1.5)
    expect(flag?.severity).toBe('CRITICAL')
  })
})

// ---------------------------------------------------------------------------
// checkConsistency
// ---------------------------------------------------------------------------

describe('checkConsistency — internal consistency rules', () => {
  it('returns empty array when values map has no applicable rule analytes', () => {
    expect(checkConsistency({ '999-9': 5.0 })).toHaveLength(0)
  })

  it('fires rbc-hgb-consistency CRITICAL when RBC < 2.0 and Hgb > 12', () => {
    const flags = checkConsistency({
      '789-8': 1.5,  // RBC
      '718-7': 13.0, // Hemoglobin
    })
    expect(flags).toHaveLength(1)
    expect(flags[0].ruleType).toBe('INTERNAL_CONSISTENCY')
    expect(flags[0].severity).toBe('CRITICAL')
  })

  it('does NOT fire rbc-hgb-consistency for consistent values', () => {
    expect(checkConsistency({ '789-8': 4.5, '718-7': 13.0 })).toHaveLength(0)
  })

  it('does NOT fire when only one required analyte is present (missing partner)', () => {
    // Only RBC, no Hemoglobin — rule requires both
    expect(checkConsistency({ '789-8': 1.5 })).toHaveLength(0)
  })

  it('fires total-protein-albumin-consistency CRITICAL when albumin > total protein', () => {
    const flags = checkConsistency({
      '2885-2': 4.0, // Total Protein
      '1751-7': 5.0, // Albumin (impossible: > TP)
    })
    expect(flags).toHaveLength(1)
    expect(flags[0].severity).toBe('CRITICAL')
  })

  it('fires hgb-hct-consistency WARNING when Hct/Hgb ratio is abnormal', () => {
    // Hgb=10, Hct=50 → ratio 5.0 (outside 2.0–4.0 rule-of-three range)
    const flags = checkConsistency({ '718-7': 10.0, '4544-3': 50.0 })
    expect(flags).toHaveLength(1)
    expect(flags[0].severity).toBe('WARNING')
  })

  it('can fire multiple rules simultaneously', () => {
    const flags = checkConsistency({
      '789-8': 1.5,  // RBC — rbc-hgb-consistency
      '718-7': 13.0, // Hgb
      '2885-2': 3.0, // Total Protein — albumin > TP
      '1751-7': 4.0, // Albumin
    })
    expect(flags.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// checkDelta
// ---------------------------------------------------------------------------

describe('checkDelta — delta check engine', () => {
  const PATIENT_REF = 'Patient/test-uuid-001'
  const HGB_LOINC = '718-7'  // Hemoglobin: maxDeltaPercent=30, maxDeltaAbsolute=3.0, window=72h

  it('returns null when no prior result exists', async () => {
    const flag = await checkDelta(PATIENT_REF, HGB_LOINC, 12.0, new Date().toISOString())
    expect(flag).toBeNull()
  })

  it('returns null for analyte with no threshold defined', async () => {
    const flag = await checkDelta(PATIENT_REF, '9999-0', 5.0, new Date().toISOString())
    expect(flag).toBeNull()
  })

  it('returns WARNING when percent delta exceeds threshold (10 → 14, 40% > 30%)', async () => {
    const now = new Date()
    const prior: ResultSnapshot = {
      id: 'snap-1', patientRef: PATIENT_REF, loincCode: HGB_LOINC,
      analyteName: 'Hemoglobin', value: 10.0,
      enteredAt: new Date(now.getTime() - 2 * 3600_000).toISOString(),
    }
    mockGetMostRecentSnapshot.mockResolvedValue(prior)
    const flag = await checkDelta(PATIENT_REF, HGB_LOINC, 14.0, now.toISOString())
    expect(flag).not.toBeNull()
    expect(flag?.severity).toBe('WARNING')
    expect(flag?.ruleType).toBe('DELTA_CHECK')
    expect(flag?.currentValue).toBe(14.0)
    expect(flag?.referenceValue).toBe(10.0)
  })

  it('returns WARNING when absolute delta exceeds threshold (15 → 18.5, Δ=3.5 > 3.0)', async () => {
    const now = new Date()
    const prior: ResultSnapshot = {
      id: 'snap-2', patientRef: PATIENT_REF, loincCode: HGB_LOINC,
      analyteName: 'Hemoglobin', value: 15.0,
      enteredAt: new Date(now.getTime() - 3600_000).toISOString(),
    }
    mockGetMostRecentSnapshot.mockResolvedValue(prior)
    // 23.3% change (< 30%), but absolute 3.5 > 3.0 threshold
    const flag = await checkDelta(PATIENT_REF, HGB_LOINC, 18.5, now.toISOString())
    expect(flag).not.toBeNull()
    expect(flag?.severity).toBe('WARNING')
  })

  it('returns null when delta is within both thresholds (12 → 13.5)', async () => {
    const now = new Date()
    const prior: ResultSnapshot = {
      id: 'snap-3', patientRef: PATIENT_REF, loincCode: HGB_LOINC,
      analyteName: 'Hemoglobin', value: 12.0,
      enteredAt: new Date(now.getTime() - 3600_000).toISOString(),
    }
    mockGetMostRecentSnapshot.mockResolvedValue(prior)
    const flag = await checkDelta(PATIENT_REF, HGB_LOINC, 13.5, now.toISOString())
    expect(flag).toBeNull()
  })

  it('returns null when prior result is outside the time window (100h > 72h)', async () => {
    const now = new Date()
    const prior: ResultSnapshot = {
      id: 'snap-4', patientRef: PATIENT_REF, loincCode: HGB_LOINC,
      analyteName: 'Hemoglobin', value: 5.0,
      enteredAt: new Date(now.getTime() - 100 * 3600_000).toISOString(),
    }
    mockGetMostRecentSnapshot.mockResolvedValue(prior)
    const flag = await checkDelta(PATIENT_REF, HGB_LOINC, 15.0, now.toISOString())
    expect(flag).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// runPlausibilityChecks — orchestrator
// ---------------------------------------------------------------------------

describe('runPlausibilityChecks — orchestrator', () => {
  it('returns empty array when all values are within range', async () => {
    const flags = await runPlausibilityChecks('Patient/p1', [
      { loincCode: '718-7', analyteName: 'Hemoglobin', value: 14.0 },
      { loincCode: '6690-2', analyteName: 'WBC', value: 7.0 },
    ])
    expect(flags).toHaveLength(0)
  })

  it('CRITICAL flags sort before WARNING flags', async () => {
    // Hgb -1 → CRITICAL (absolute); WBC 35 → WARNING (warning zone)
    const flags = await runPlausibilityChecks('Patient/p1', [
      { loincCode: '718-7', analyteName: 'Hemoglobin', value: -1.0 },
      { loincCode: '6690-2', analyteName: 'WBC', value: 35 },
    ])
    const criticalIdx = flags.findIndex((f) => f.severity === 'CRITICAL')
    const warningIdx = flags.findIndex((f) => f.severity === 'WARNING')
    if (criticalIdx >= 0 && warningIdx >= 0) {
      expect(criticalIdx).toBeLessThan(warningIdx)
    }
  })

  it('includes consistency flags for inconsistent CBC values', async () => {
    const flags = await runPlausibilityChecks('Patient/p1', [
      { loincCode: '789-8', analyteName: 'RBC', value: 1.5 },
      { loincCode: '718-7', analyteName: 'Hemoglobin', value: 13.0 },
    ])
    const consistencyFlags = flags.filter((f) => f.ruleType === 'INTERNAL_CONSISTENCY')
    expect(consistencyFlags.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// hasCriticalFlags
// ---------------------------------------------------------------------------

describe('hasCriticalFlags', () => {
  it('returns false for empty array', () => {
    expect(hasCriticalFlags([])).toBe(false)
  })

  it('returns false when all CRITICAL flags are acknowledged', () => {
    expect(hasCriticalFlags([
      {
        id: '1', ruleType: 'ABSOLUTE_RANGE' as const, analyte: 'Hgb',
        loincCode: '718-7', severity: 'CRITICAL' as const, message: 'x', acknowledged: true,
      },
    ])).toBe(false)
  })

  it('returns true when any CRITICAL flag is unacknowledged', () => {
    expect(hasCriticalFlags([
      {
        id: '1', ruleType: 'ABSOLUTE_RANGE' as const, analyte: 'Hgb',
        loincCode: '718-7', severity: 'CRITICAL' as const, message: 'x', acknowledged: false,
      },
    ])).toBe(true)
  })

  it('returns false when only WARNING flags are present (none critical)', () => {
    expect(hasCriticalFlags([
      {
        id: '1', ruleType: 'DELTA_CHECK' as const, analyte: 'Hgb',
        loincCode: '718-7', severity: 'WARNING' as const, message: 'x', acknowledged: false,
      },
    ])).toBe(false)
  })
})
