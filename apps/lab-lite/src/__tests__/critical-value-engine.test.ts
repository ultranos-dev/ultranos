/**
 * Story 48.4 — Critical Value Detection Engine Tests
 * AC: 1, 9 — Pure rule-based detection; deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isCriticalValue, checkResultForCriticalValues } from '../lib/critical-value-engine'
import type { CriticalValueInput } from '../lib/critical-value-engine'

// Mock the DB threshold lookup
vi.mock('../lib/db', () => ({
  getCriticalThresholdByAnalyte: vi.fn(),
}))

import { getCriticalThresholdByAnalyte } from '../lib/db'

const potassiumThreshold = {
  id: 1,
  loincCode: '2823-3',
  analyte: 'Potassium',
  testName: 'Potassium',
  unit: 'mmol/L',
  criticalLow: 2.5,
  criticalHigh: 6.5,
  isActive: true,
  configuredBy: 'system',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('isCriticalValue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects critical HIGH value', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockResolvedValue(potassiumThreshold)
    const result = await isCriticalValue('2823-3', 'Potassium', 7.2)
    expect(result.isCritical).toBe(true)
    expect(result.direction).toBe('high')
    expect(result.threshold).toBe(6.5)
  })

  it('detects critical LOW value', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockResolvedValue(potassiumThreshold)
    const result = await isCriticalValue('2823-3', 'Potassium', 2.0)
    expect(result.isCritical).toBe(true)
    expect(result.direction).toBe('low')
    expect(result.threshold).toBe(2.5)
  })

  it('returns not critical for normal value', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockResolvedValue(potassiumThreshold)
    const result = await isCriticalValue('2823-3', 'Potassium', 4.0)
    expect(result.isCritical).toBe(false)
    expect(result.direction).toBeNull()
  })

  it('returns not critical when exactly at criticalHigh (boundary — strictly greater than)', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockResolvedValue(potassiumThreshold)
    const result = await isCriticalValue('2823-3', 'Potassium', 6.5)
    expect(result.isCritical).toBe(false)
  })

  it('returns not critical when exactly at criticalLow (boundary — strictly less than)', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockResolvedValue(potassiumThreshold)
    const result = await isCriticalValue('2823-3', 'Potassium', 2.5)
    expect(result.isCritical).toBe(false)
  })

  it('returns not critical when no threshold configured', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockResolvedValue(undefined)
    const result = await isCriticalValue('unknown-loinc', 'Unknown', 999)
    expect(result.isCritical).toBe(false)
  })

  it('skips inactive thresholds', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockResolvedValue({
      ...potassiumThreshold,
      isActive: false,
    })
    const result = await isCriticalValue('2823-3', 'Potassium', 9.0)
    expect(result.isCritical).toBe(false)
  })

  it('returns not critical on threshold lookup failure (fail-open)', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockRejectedValue(new Error('DB error'))
    const result = await isCriticalValue('2823-3', 'Potassium', 9.0)
    expect(result.isCritical).toBe(false)
  })

  it('handles threshold with only criticalHigh set', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockResolvedValue({
      ...potassiumThreshold,
      criticalLow: null,
      criticalHigh: 10.0,
    })
    // Value below missing criticalLow — not critical
    const low = await isCriticalValue('2823-3', 'Potassium', 0.1)
    expect(low.isCritical).toBe(false)
    // Value above criticalHigh — critical
    const high = await isCriticalValue('2823-3', 'Potassium', 11.0)
    expect(high.isCritical).toBe(true)
    expect(high.direction).toBe('high')
  })
})

describe('checkResultForCriticalValues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns multiple criticals from single result', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockImplementation(async (_loinc, analyte) => {
      if (analyte === 'Potassium') return { ...potassiumThreshold }
      if (analyte === 'Glucose') return {
        ...potassiumThreshold,
        loincCode: '2345-7',
        analyte: 'Glucose',
        unit: 'mg/dL',
        criticalLow: 40,
        criticalHigh: 500,
      }
      return undefined
    })

    const observations: CriticalValueInput[] = [
      { loincCode: '2823-3', analyte: 'Potassium', value: 7.5 }, // critical high
      { loincCode: '2345-7', analyte: 'Glucose', value: 30 },    // critical low
      { loincCode: '718-7', analyte: 'Hemoglobin', value: 12 },  // no threshold — normal
    ]

    const criticals = await checkResultForCriticalValues(observations)
    expect(criticals).toHaveLength(2)
    expect(criticals[0].analyte).toBe('Potassium')
    expect(criticals[0].direction).toBe('high')
    expect(criticals[1].analyte).toBe('Glucose')
    expect(criticals[1].direction).toBe('low')
  })

  it('skips null and non-finite values', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockResolvedValue(potassiumThreshold)

    const observations: CriticalValueInput[] = [
      { loincCode: '2823-3', analyte: 'Potassium', value: null as any },
      { loincCode: '2823-3', analyte: 'Potassium', value: NaN },
      { loincCode: '2823-3', analyte: 'Potassium', value: Infinity },
    ]

    const criticals = await checkResultForCriticalValues(observations)
    expect(criticals).toHaveLength(0)
    expect(getCriticalThresholdByAnalyte).not.toHaveBeenCalled()
  })

  it('returns empty array when no criticals found', async () => {
    vi.mocked(getCriticalThresholdByAnalyte).mockResolvedValue(potassiumThreshold)
    const observations: CriticalValueInput[] = [
      { loincCode: '2823-3', analyte: 'Potassium', value: 4.0 },
    ]
    const criticals = await checkResultForCriticalValues(observations)
    expect(criticals).toHaveLength(0)
  })
})
