/**
 * Story 43.7 — Critical Value Detector Unit Tests
 * Tasks 8.1-8.4: detectCriticalValues and buildObservationFromResult
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectCriticalValues, buildObservationFromResult } from '../lib/critical-values/critical-value-detector'
import type { CriticalValueThreshold } from '../lib/critical-values/types'

const mockGetCriticalThreshold = vi.fn().mockResolvedValue(undefined)

vi.mock('../lib/db', () => ({
  getCriticalThresholdByAnalyte: (...args: unknown[]) => mockGetCriticalThreshold(...args),
  getDb: vi.fn(),
}))

describe('detectCriticalValues', () => {
  beforeEach(() => {
    mockGetCriticalThreshold.mockReset()
    mockGetCriticalThreshold.mockResolvedValue(undefined) // default: use in-memory defaults
  })

  it('8.1 identifies Potassium HH flag as critical high using default threshold', async () => {
    const matches = await detectCriticalValues([
      { loincCode: '2823-3', analyte: 'Potassium', abnormalityFlags: ['HH'] },
    ])

    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      loincCode: '2823-3',
      analyte: 'Potassium',
      direction: 'HIGH',
      threshold: 6.5,
      unit: 'mEq/L',
    })
  })

  it('8.2 identifies Glucose LL flag as critical low using default threshold', async () => {
    const matches = await detectCriticalValues([
      { loincCode: '2345-7', analyte: 'Glucose', abnormalityFlags: ['LL'] },
    ])

    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      loincCode: '2345-7',
      analyte: 'Glucose',
      direction: 'LOW',
      threshold: 40,
      unit: 'mg/dL',
    })
  })

  it('8.3 returns empty array for non-critical flags (H, L, N, or no flags)', async () => {
    const matches = await detectCriticalValues([
      { loincCode: '2823-3', analyte: 'Potassium', abnormalityFlags: ['H'] },
      { loincCode: '2345-7', analyte: 'Glucose', abnormalityFlags: ['L'] },
      { loincCode: '718-7', analyte: 'Hemoglobin', abnormalityFlags: ['N'] },
      { loincCode: '6690-2', analyte: 'WBC', abnormalityFlags: [] },
    ])

    expect(matches).toHaveLength(0)
  })

  it('8.4 uses lab-specific DB threshold override instead of defaults', async () => {
    const labOverride: CriticalValueThreshold = {
      id: 42,
      loincCode: '2823-3',
      analyte: 'Potassium',
      testName: 'Potassium',
      unit: 'mEq/L',
      criticalLow: 3.0,   // stricter than default 2.5
      criticalHigh: 6.0,  // stricter than default 6.5
      isActive: true,
      configuredBy: 'lab-manager-001',
      updatedAt: '2026-01-15T00:00:00.000Z',
    }
    mockGetCriticalThreshold.mockResolvedValue(labOverride)

    const matches = await detectCriticalValues([
      { loincCode: '2823-3', analyte: 'Potassium', abnormalityFlags: ['HH'] },
    ])

    expect(matches).toHaveLength(1)
    expect(matches[0].threshold).toBe(6.0) // lab override, not default 6.5
  })

  it('returns both HIGH and LOW matches when result has both HH and LL flags', async () => {
    const matches = await detectCriticalValues([
      { loincCode: '2823-3', analyte: 'Potassium', abnormalityFlags: ['HH', 'LL'] },
    ])

    expect(matches).toHaveLength(2)
    const directions = matches.map((m) => m.direction).sort()
    expect(directions).toEqual(['HIGH', 'LOW'])
  })

  it('handles multiple observations and returns all critical matches', async () => {
    const matches = await detectCriticalValues([
      { loincCode: '2823-3', analyte: 'Potassium', abnormalityFlags: ['HH'] },
      { loincCode: '2345-7', analyte: 'Glucose', abnormalityFlags: ['LL'] },
      { loincCode: '718-7', analyte: 'Hemoglobin', abnormalityFlags: ['H'] }, // not critical
    ])

    expect(matches).toHaveLength(2)
    const analytes = matches.map((m) => m.analyte)
    expect(analytes).toContain('Potassium')
    expect(analytes).toContain('Glucose')
  })

  it('skips observations whose resolved threshold has isActive: false', async () => {
    const inactiveOverride: CriticalValueThreshold = {
      id: 99,
      loincCode: '2823-3',
      analyte: 'Potassium',
      testName: 'Potassium',
      unit: 'mEq/L',
      criticalLow: 3.0,
      criticalHigh: 6.0,
      isActive: false,
      configuredBy: 'lab-manager-001',
      updatedAt: '2026-01-15T00:00:00.000Z',
    }
    mockGetCriticalThreshold.mockResolvedValue(inactiveOverride)

    const matches = await detectCriticalValues([
      { loincCode: '2823-3', analyte: 'Potassium', abnormalityFlags: ['HH'] },
    ])

    expect(matches).toHaveLength(0)
  })

  it('returns empty array for analyte with no matching threshold', async () => {
    const matches = await detectCriticalValues([
      { loincCode: 'UNKNOWN-99999', analyte: 'UnknownAnalyte', abnormalityFlags: ['HH'] },
    ])

    expect(matches).toHaveLength(0)
  })

  it('returns HIGH match for INR which has null criticalLow', async () => {
    const matches = await detectCriticalValues([
      { loincCode: '6301-6', analyte: 'INR', abnormalityFlags: ['HH'] },
    ])

    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      analyte: 'INR',
      direction: 'HIGH',
      threshold: 5.0,
    })
  })

  it('does not produce a LOW match for INR LL flag when criticalLow is null', async () => {
    const matches = await detectCriticalValues([
      { loincCode: '6301-6', analyte: 'INR', abnormalityFlags: ['LL'] },
    ])

    expect(matches).toHaveLength(0)
  })
})

describe('buildObservationFromResult', () => {
  it('converts result fields to ResultObservation shape', () => {
    const result = {
      loincCode: '2823-3',
      testCategory: 'Potassium',
      abnormalityFlags: ['HH' as const],
    }

    const obs = buildObservationFromResult(result)

    expect(obs).toEqual({
      loincCode: '2823-3',
      analyte: 'Potassium',
      abnormalityFlags: ['HH'],
    })
  })
})
