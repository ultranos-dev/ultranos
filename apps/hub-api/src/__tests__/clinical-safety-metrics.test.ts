import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the shared metrics registry (Story 23.1)
vi.mock('@/trpc/middleware/metrics', () => {
  const { Registry } = require('prom-client')
  return { getMetricsRegistry: () => new Registry() }
})

// Mock prom-client
vi.mock('prom-client', () => {
  class MockCounter {
    name: string
    private counts: Map<string, number> = new Map()
    constructor(opts: { name: string }) { this.name = opts.name }
    inc(labels?: Record<string, string>, value?: number) {
      const key = labels ? JSON.stringify(labels) : '__default__'
      this.counts.set(key, (this.counts.get(key) ?? 0) + (value ?? 1))
    }
    getCount(labels?: Record<string, string>): number {
      const key = labels ? JSON.stringify(labels) : '__default__'
      return this.counts.get(key) ?? 0
    }
    reset() { this.counts.clear() }
  }
  class MockGauge {
    name: string
    private value = 0
    constructor(opts: { name: string }) { this.name = opts.name }
    set(v: number) { this.value = v }
    getValue() { return this.value }
  }
  class MockRegistry {}
  return { Counter: MockCounter, Gauge: MockGauge, Registry: MockRegistry }
})

const {
  drugInteractionChecksTotal,
  drugInteractionOverridesTotal,
  prescriptionsWithoutInteractionCheckTotal,
  unresolvedTier1Conflicts,
  oldestTier1ConflictAgeHours,
  contraindicatedOverrideRate,
  interactionCheckCompletionRate,
} = await import('../lib/clinical-safety-metrics')

beforeEach(() => {
  // Reset counters
  ;(drugInteractionChecksTotal as any).reset?.()
  ;(drugInteractionOverridesTotal as any).reset?.()
  ;(prescriptionsWithoutInteractionCheckTotal as any).reset?.()
})

describe('Clinical Safety Prometheus Metrics', () => {
  describe('drug_interaction_checks_total counter', () => {
    it('increments with CLEAR result label', () => {
      drugInteractionChecksTotal.inc({ result: 'CLEAR' })
      expect((drugInteractionChecksTotal as any).getCount({ result: 'CLEAR' })).toBe(1)
    })

    it('increments with WARNING result label', () => {
      drugInteractionChecksTotal.inc({ result: 'WARNING' })
      drugInteractionChecksTotal.inc({ result: 'WARNING' })
      expect((drugInteractionChecksTotal as any).getCount({ result: 'WARNING' })).toBe(2)
    })

    it('increments with BLOCKED result label', () => {
      drugInteractionChecksTotal.inc({ result: 'BLOCKED' })
      expect((drugInteractionChecksTotal as any).getCount({ result: 'BLOCKED' })).toBe(1)
    })

    it('increments with UNAVAILABLE result label', () => {
      drugInteractionChecksTotal.inc({ result: 'UNAVAILABLE' })
      expect((drugInteractionChecksTotal as any).getCount({ result: 'UNAVAILABLE' })).toBe(1)
    })
  })

  describe('drug_interaction_overrides_total counter', () => {
    it('increments with CONTRAINDICATED severity', () => {
      drugInteractionOverridesTotal.inc({ severity: 'CONTRAINDICATED' })
      expect((drugInteractionOverridesTotal as any).getCount({ severity: 'CONTRAINDICATED' })).toBe(1)
    })

    it('increments with ALLERGY_MATCH severity', () => {
      drugInteractionOverridesTotal.inc({ severity: 'ALLERGY_MATCH' })
      expect((drugInteractionOverridesTotal as any).getCount({ severity: 'ALLERGY_MATCH' })).toBe(1)
    })

    it('increments with MAJOR severity', () => {
      drugInteractionOverridesTotal.inc({ severity: 'MAJOR' })
      expect((drugInteractionOverridesTotal as any).getCount({ severity: 'MAJOR' })).toBe(1)
    })

    it('increments with MODERATE severity', () => {
      drugInteractionOverridesTotal.inc({ severity: 'MODERATE' })
      expect((drugInteractionOverridesTotal as any).getCount({ severity: 'MODERATE' })).toBe(1)
    })
  })

  describe('prescriptions_without_interaction_check_total counter', () => {
    it('increments for UNAVAILABLE prescriptions', () => {
      prescriptionsWithoutInteractionCheckTotal.inc()
      prescriptionsWithoutInteractionCheckTotal.inc()
      expect((prescriptionsWithoutInteractionCheckTotal as any).getCount()).toBe(2)
    })
  })

  describe('Tier 1 conflict gauges', () => {
    it('sets unresolved conflict count', () => {
      unresolvedTier1Conflicts.set(5)
      expect((unresolvedTier1Conflicts as any).getValue()).toBe(5)
    })

    it('sets oldest conflict age in hours', () => {
      oldestTier1ConflictAgeHours.set(36.5)
      expect((oldestTier1ConflictAgeHours as any).getValue()).toBe(36.5)
    })
  })

  describe('Clinical safety alert gauges', () => {
    it('sets CONTRAINDICATED override rate', () => {
      contraindicatedOverrideRate.set(2.5)
      expect((contraindicatedOverrideRate as any).getValue()).toBe(2.5)
    })

    it('sets interaction check completion rate', () => {
      interactionCheckCompletionRate.set(99.5)
      expect((interactionCheckCompletionRate as any).getValue()).toBe(99.5)
    })
  })
})
