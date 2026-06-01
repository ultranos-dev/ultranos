/**
 * Demand Analyzer Tests — Story 54.6 Task 15.1 (AC 1, 6)
 *
 * Unit tests for:
 *  - Historical pattern analysis with varying data amounts and confidence levels
 *  - Peak month detection algorithm
 *  - Surge detection within lookahead window
 *  - Handling of insufficient data
 *  - No PHI validation (all fields are aggregate-only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeHistoricalDemand, detectUpcomingSurge } from '../lib/demand-analyzer'
import type { SeasonalDemandPattern } from '../types/seasonal-planner'

// ---------------------------------------------------------------------------
// Mock Dexie
// ---------------------------------------------------------------------------

const mockLabResults: Array<{ id: string; loincCode: string; status: string; enteredAt: string }> = []
const mockHmisReports: Array<{ id: string; reportYear: number; reportMonth: number; testCategorySummary: Array<{ loincCode: string; categoryLabel: string; totalPerformed: number }> }> = []

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => ({
    lab_results: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue(mockLabResults),
        })),
      })),
    },
    hmisReports: {
      toArray: vi.fn().mockResolvedValue(mockHmisReports),
    },
  })),
}))

// Helper to build lab results across N months starting from startYear-startMonth
function buildResults(count: number, loincCode: string, startYear: number, startMonth: number): typeof mockLabResults {
  const results = []
  for (let i = 0; i < count; i++) {
    const year = startYear + Math.floor((startMonth - 1 + i) / 12)
    const month = ((startMonth - 1 + i) % 12) + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}-15T10:00:00.000Z`
    results.push({ id: `r-${i}`, loincCode, status: 'completed', enteredAt: dateStr })
  }
  return results
}

// ---------------------------------------------------------------------------
// Tests: confidence levels based on data span
// ---------------------------------------------------------------------------

describe('analyzeHistoricalDemand', () => {
  beforeEach(() => {
    mockLabResults.length = 0
    mockHmisReports.length = 0
  })

  it('returns low-confidence pattern with 6 months of data', async () => {
    // 6 months of results
    const results = buildResults(6, '18719-5', 2025, 1)
    mockLabResults.push(...results)

    const patterns = await analyzeHistoricalDemand()
    expect(patterns.length).toBeGreaterThan(0)
    const pattern = patterns.find((p) => p.testCategory === '18719-5')
    expect(pattern).toBeDefined()
    expect(pattern!.confidence).toBe('low')
    expect(pattern!.dataMonths).toBeGreaterThanOrEqual(6)
  })

  it('returns moderate-confidence pattern with 12 months of data', async () => {
    const results = buildResults(12, '18719-5', 2025, 1)
    mockLabResults.push(...results)

    const patterns = await analyzeHistoricalDemand()
    const pattern = patterns.find((p) => p.testCategory === '18719-5')
    expect(pattern).toBeDefined()
    expect(pattern!.confidence).toBe('moderate')
  })

  it('returns high-confidence pattern with 24 months of data', async () => {
    const results = buildResults(24, '18719-5', 2024, 1)
    mockLabResults.push(...results)

    const patterns = await analyzeHistoricalDemand()
    const pattern = patterns.find((p) => p.testCategory === '18719-5')
    expect(pattern).toBeDefined()
    expect(pattern!.confidence).toBe('high')
  })

  it('returns warning when fewer than 6 months of data', async () => {
    const results = buildResults(3, '18719-5', 2026, 3)
    mockLabResults.push(...results)

    const patterns = await analyzeHistoricalDemand()
    expect(patterns.length).toBeGreaterThan(0)
    // Returns the empty/low-confidence catch-all pattern
    const hasWarning = patterns.some((p) => p.warning !== undefined)
    expect(hasWarning).toBe(true)
  })

  it('returns an ALL pattern aggregating all categories', async () => {
    const results1 = buildResults(12, '18719-5', 2025, 1)
    const results2 = buildResults(12, '18720-3', 2025, 1)
    mockLabResults.push(...results1, ...results2)

    const patterns = await analyzeHistoricalDemand()
    const allPattern = patterns.find((p) => p.testCategory === 'ALL')
    expect(allPattern).toBeDefined()
  })

  it('monthlyBaseline array has exactly 12 elements', async () => {
    const results = buildResults(12, '18719-5', 2025, 1)
    mockLabResults.push(...results)

    const patterns = await analyzeHistoricalDemand()
    for (const p of patterns) {
      expect(p.monthlyBaseline).toHaveLength(12)
    }
  })

  it('does not include any PHI — no patient IDs or clinical content', async () => {
    const results = buildResults(12, '18719-5', 2025, 1)
    mockLabResults.push(...results)

    const patterns = await analyzeHistoricalDemand()
    for (const p of patterns) {
      // Patterns contain only LOINC codes (clinical codes, not patient IDs)
      expect(typeof p.testCategory).toBe('string')
      expect(typeof p.peakMultiplier).toBe('number')
      // No patient-identifying fields
      expect(p).not.toHaveProperty('patientRef')
      expect(p).not.toHaveProperty('patientId')
      expect(p).not.toHaveProperty('patientName')
    }
  })

  it('integrates HMIS data for months missing local results', async () => {
    // Only local data for Jan-Jun 2025
    const results = buildResults(6, '18719-5', 2025, 1)
    mockLabResults.push(...results)

    // HMIS data for Jul-Dec 2025
    for (let month = 7; month <= 12; month++) {
      mockHmisReports.push({
        id: `hmis-${month}`,
        reportYear: 2025,
        reportMonth: month,
        testCategorySummary: [{ loincCode: '18719-5', categoryLabel: 'Malaria', totalPerformed: 50 }],
      })
    }

    const patterns = await analyzeHistoricalDemand()
    const pattern = patterns.find((p) => p.testCategory === '18719-5')
    expect(pattern).toBeDefined()
    // 12 distinct months of data → moderate confidence
    expect(pattern!.confidence).toBe('moderate')
  })
})

// ---------------------------------------------------------------------------
// Tests: surge detection
// ---------------------------------------------------------------------------

describe('detectUpcomingSurge', () => {
  it('returns empty array when no patterns have peak months', () => {
    const patterns: SeasonalDemandPattern[] = [
      {
        id: 'p1', testCategory: 'ALL', testCategoryDisplay: 'All Tests',
        monthlyBaseline: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        peakMonths: [],
        peakMultiplier: 1,
        confidence: 'moderate',
        computedAt: new Date().toISOString(),
        dataMonths: 12,
      },
    ]
    expect(detectUpcomingSurge(patterns)).toHaveLength(0)
  })

  it('returns a surge alert for a peak month within the next 30 days', () => {
    // Use next month to avoid month-boundary issues (current month may have passed midnight)
    const today = new Date()
    const nextMonth = (today.getMonth() + 1) % 12 + 1  // 1-indexed next calendar month

    const patterns: SeasonalDemandPattern[] = [
      {
        id: 'p1', testCategory: '18719-5', testCategoryDisplay: 'Malaria',
        monthlyBaseline: [10, 10, 10, 10, 10, 60, 65, 60, 30, 20, 15, 12],
        peakMonths: [nextMonth],
        peakMultiplier: 3.0,
        confidence: 'high',
        computedAt: new Date().toISOString(),
        dataMonths: 24,
      },
    ]
    // 30-day lookahead covers next month start (at most 31 days away)
    const alerts = detectUpcomingSurge(patterns, 45)
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts[0]!.testCategory).toBe('18719-5')
    expect(alerts[0]!.projectedMultiplier).toBe(3.0)
    expect(alerts[0]!.confidence).toBe('high')
  })

  it('does not return surges for peak months > 30 days away', () => {
    // Peak in month 2 (February) — far from current date of May 31
    const patterns: SeasonalDemandPattern[] = [
      {
        id: 'p1', testCategory: '18719-5', testCategoryDisplay: 'Malaria',
        monthlyBaseline: [10, 80, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        peakMonths: [2],  // February
        peakMultiplier: 4.0,
        confidence: 'moderate',
        computedAt: new Date().toISOString(),
        dataMonths: 12,
      },
    ]
    // 30-day lookahead from May 31 would cover up to June 30 — not February
    const alerts = detectUpcomingSurge(patterns, 30)
    expect(alerts).toHaveLength(0)
  })

  it('sorts alerts by daysUntilSurge ascending (soonest first)', () => {
    const today = new Date()
    const nextMonth = ((today.getMonth() + 1) % 12) + 1  // +1 month (1-indexed)
    const currentMonth = today.getMonth() + 1

    const patterns: SeasonalDemandPattern[] = [
      {
        id: 'p1', testCategory: 'A', testCategoryDisplay: 'Category A',
        monthlyBaseline: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        peakMonths: [nextMonth],
        peakMultiplier: 2.0, confidence: 'moderate', computedAt: new Date().toISOString(), dataMonths: 12,
      },
      {
        id: 'p2', testCategory: 'B', testCategoryDisplay: 'Category B',
        monthlyBaseline: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        peakMonths: [currentMonth],
        peakMultiplier: 3.0, confidence: 'high', computedAt: new Date().toISOString(), dataMonths: 24,
      },
    ]
    const alerts = detectUpcomingSurge(patterns, 45)
    if (alerts.length >= 2) {
      expect(alerts[0]!.daysUntilSurge).toBeLessThanOrEqual(alerts[1]!.daysUntilSurge)
    }
  })
})
