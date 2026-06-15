/**
 * Story 46.7 — Monthly Quality Metrics Calculator Tests (Task 9)
 *
 * Tests:
 *  - CV% calculation
 *  - Trend determination
 *  - Edge cases (no data)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
  setAuditStoreAdapter: vi.fn(),
}))
vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallTime: Date.now(), logicalTime: 0, nodeId: 'test' }) },
  serializeHlc: () => new Date().toISOString(),
}))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: vi.fn() }))
vi.mock('@/lib/delegate-crypto', () => ({
  crypto: { randomUUID: () => 'test-uuid' },
}))

import { calculateMonthlyMetrics, getMetricsForPeriod, currentPeriod } from '@/lib/quality-metrics-calculator'
import { getDb } from '@/lib/db'

const TECH_ID = 'tech-001'
const PERIOD = '2026-05'

beforeEach(async () => {
  const db = getDb()
  await db.qcRuns.clear()
  await db.quality_metrics.clear()
  await db.samples.clear()
  await db.lab_results.clear()
  await db.module_completions.clear()
  await db.micro_learning_modules.clear()
})

describe('calculateMonthlyMetrics', () => {
  it('returns 4 metric types for any period', async () => {
    const metrics = await calculateMonthlyMetrics(TECH_ID, PERIOD)
    expect(metrics).toHaveLength(4)
    const types = metrics.map((m) => m.metricType)
    expect(types).toContain('hemoglobin_cv')
    expect(types).toContain('turnaround_time')
    expect(types).toContain('rejection_rate')
    expect(types).toContain('training_completion')
  })

  it('returns 0 for all metrics when no data exists', async () => {
    const metrics = await calculateMonthlyMetrics(TECH_ID, PERIOD)
    for (const m of metrics) {
      expect(m.value).toBe(0)
    }
  })

  it('calculates hemoglobin CV% from QC run data', async () => {
    const db = getDb()
    // Add hemoglobin QC runs for the period — values: 14.0, 14.2, 13.8, 14.1, 13.9
    const runs = [14.0, 14.2, 13.8, 14.1, 13.9].map((val, i) => ({
      id: `qc-hgb-${i}`,
      analyte: 'Hemoglobin',
      loincCode: '718-7',
      instrumentId: 'analyzer-01',
      controlLevel: 'LEVEL_2' as const,
      targetMean: 14.0,
      targetSd: 0.5,
      observedValue: val,
      runDate: `2026-05-${String(i + 1).padStart(2, '0')}`,
      runBy: TECH_ID,
      hlcTimestamp: new Date().toISOString(),
    }))
    await db.qcRuns.bulkAdd(runs)

    const metrics = await calculateMonthlyMetrics(TECH_ID, PERIOD)
    const cvMetric = metrics.find((m) => m.metricType === 'hemoglobin_cv')!
    // Mean = 14.0, SD ≈ 0.158, CV ≈ 1.13%
    expect(cvMetric.value).toBeGreaterThan(0)
    expect(cvMetric.value).toBeLessThan(5) // reasonable CV%
    expect(cvMetric.unit).toBe('%')
  })

  it('sets trend to stable on first month (no previous data)', async () => {
    const metrics = await calculateMonthlyMetrics(TECH_ID, PERIOD)
    for (const m of metrics) {
      expect(m.trend).toBe('stable')
    }
  })

  it('sets improving trend when CV% decreases from previous month', async () => {
    const db = getDb()
    // Seed previous month metric (high CV%)
    await db.quality_metrics.put({
      id: `qm-cv-${TECH_ID}-2026-04`,
      technicianId: TECH_ID,
      metricType: 'hemoglobin_cv',
      period: '2026-04',
      value: 5.0, // poor CV last month
      unit: '%',
      trend: 'stable',
      updatedAt: new Date().toISOString(),
    })

    // Add QC runs with very consistent values (low CV%)
    const runs = [14.00, 14.01, 13.99, 14.00, 14.01].map((val, i) => ({
      id: `qc-hgb-${i}`,
      analyte: 'Hemoglobin',
      loincCode: '718-7',
      instrumentId: 'analyzer-01',
      controlLevel: 'LEVEL_2' as const,
      targetMean: 14.0,
      targetSd: 0.5,
      observedValue: val,
      runDate: `2026-05-${String(i + 1).padStart(2, '0')}`,
      runBy: TECH_ID,
      hlcTimestamp: new Date().toISOString(),
    }))
    await db.qcRuns.bulkAdd(runs)

    const metrics = await calculateMonthlyMetrics(TECH_ID, PERIOD)
    const cvMetric = metrics.find((m) => m.metricType === 'hemoglobin_cv')!
    // CV went from 5.0% to <1%, that's improving (lower is better for CV)
    expect(cvMetric.trend).toBe('improving')
  })

  it('calculates training completion rate correctly', async () => {
    const db = getDb()
    // 2 modules total, 1 completed
    await db.micro_learning_modules.bulkPut([
      { id: 'mod-1', procedureRef: 'proc-1', version: '1.0', meta: { lastUpdated: '2026-01-01' } } as any,
      { id: 'mod-2', procedureRef: 'proc-2', version: '1.0', meta: { lastUpdated: '2026-01-01' } } as any,
    ])
    await db.module_completions.add({
      id: 'comp-1',
      moduleId: 'mod-1',
      technicianId: TECH_ID,
      completedAt: '2026-05-10T10:00:00Z',
      syncStatus: 'synced',
    } as any)

    const metrics = await calculateMonthlyMetrics(TECH_ID, PERIOD)
    const trainMetric = metrics.find((m) => m.metricType === 'training_completion')!
    expect(trainMetric.value).toBe(50) // 1/2 = 50%
  })

  it('persists metrics to Dexie', async () => {
    await calculateMonthlyMetrics(TECH_ID, PERIOD)

    const saved = await getMetricsForPeriod(TECH_ID, PERIOD)
    expect(saved).toHaveLength(4)
  })

  it('stores correct technician ID and period on each metric', async () => {
    const metrics = await calculateMonthlyMetrics(TECH_ID, PERIOD)
    for (const m of metrics) {
      expect(m.technicianId).toBe(TECH_ID)
      expect(m.period).toBe(PERIOD)
    }
  })
})

describe('currentPeriod', () => {
  it('returns YYYY-MM format', () => {
    const period = currentPeriod()
    expect(period).toMatch(/^\d{4}-\d{2}$/)
  })
})
