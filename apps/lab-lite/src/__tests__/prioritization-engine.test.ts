import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  computePriorityScore,
  prioritizeSamples,
  applyManualOverrides,
  type SampleInput,
  type PriorityOverride,
} from '@/lib/prioritization-engine'

let now: number

beforeEach(() => {
  now = Date.now()
  vi.useFakeTimers()
  vi.setSystemTime(now)
})

afterEach(() => {
  vi.useRealTimers()
})

function makeInput(overrides: Partial<SampleInput> = {}): SampleInput {
  return {
    sampleId: `sample-${Math.random().toString(36).slice(2)}`,
    orderId: `order-1`,
    patientRef: { firstName: 'Ahmad', age: 35 },
    loincCode: '58410-2', // CBC — 360 min window
    loincDisplay: 'CBC',
    urgency: 'routine',
    receivedAt: new Date(now - 30 * 60_000).toISOString(), // 30 min ago
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// computePriorityScore
// ---------------------------------------------------------------------------

describe('computePriorityScore', () => {
  it('STAT has lower score than Urgent', () => {
    const stat = computePriorityScore(makeInput({ urgency: 'stat' }))
    const urgent = computePriorityScore(makeInput({ urgency: 'urgent' }))
    expect(stat.priorityScore).toBeLessThan(urgent.priorityScore)
  })

  it('Urgent has lower score than Routine', () => {
    const urgent = computePriorityScore(makeInput({ urgency: 'urgent' }))
    const routine = computePriorityScore(makeInput({ urgency: 'routine' }))
    expect(urgent.priorityScore).toBeLessThan(routine.priorityScore)
  })

  it('expired sample gets a -5000 boost (massive priority)', () => {
    const expired = computePriorityScore(
      makeInput({
        urgency: 'routine',
        loincCode: '82803-4', // 30 min window
        receivedAt: new Date(now - 60 * 60_000).toISOString(), // 60 min ago → expired
      }),
    )
    const fresh = computePriorityScore(makeInput({ urgency: 'routine' }))
    expect(expired.priorityScore).toBeLessThan(fresh.priorityScore - 4000)
  })

  it('longer time in queue decreases score (increases priority)', () => {
    const old = computePriorityScore(
      makeInput({ receivedAt: new Date(now - 120 * 60_000).toISOString() }),
    )
    const fresh = computePriorityScore(
      makeInput({ receivedAt: new Date(now - 10 * 60_000).toISOString() }),
    )
    expect(old.priorityScore).toBeLessThan(fresh.priorityScore)
  })

  it('exposes stability info on returned sample', () => {
    const sample = computePriorityScore(makeInput())
    expect(sample.stabilityStatus).toBeDefined()
    expect(sample.remainingMinutes).toBeGreaterThan(0)
    expect(sample.stabilityWindowMinutes).toBe(360) // CBC
  })

  it('sets batchGroup from known LOINC code', () => {
    const sample = computePriorityScore(makeInput({ loincCode: '58410-2' }))
    expect(sample.batchGroup).toBe('CBC')
  })
})

// ---------------------------------------------------------------------------
// prioritizeSamples — ordering
// ---------------------------------------------------------------------------

describe('prioritizeSamples', () => {
  it('returns empty array for empty input', () => {
    expect(prioritizeSamples([])).toEqual([])
  })

  it('returns single item unchanged', () => {
    const result = prioritizeSamples([makeInput({ urgency: 'routine' })])
    expect(result).toHaveLength(1)
  })

  it('STAT always before Urgent always before Routine', () => {
    const inputs = [
      makeInput({ sampleId: 'r', urgency: 'routine' }),
      makeInput({ sampleId: 'u', urgency: 'urgent' }),
      makeInput({ sampleId: 's', urgency: 'stat' }),
    ]
    const result = prioritizeSamples(inputs)
    const ids = result.map((s) => s.sampleId)
    expect(ids.indexOf('s')).toBeLessThan(ids.indexOf('u'))
    expect(ids.indexOf('u')).toBeLessThan(ids.indexOf('r'))
  })

  it('expired sample sorts to very top regardless of urgency tier', () => {
    const expiredRoutine = makeInput({
      sampleId: 'expired',
      urgency: 'routine',
      loincCode: '82803-4', // 30 min window
      receivedAt: new Date(now - 120 * 60_000).toISOString(), // way past window
    })
    const stat = makeInput({ sampleId: 'stat-fresh', urgency: 'stat' })
    const result = prioritizeSamples([stat, expiredRoutine])
    expect(result[0].sampleId).toBe('expired')
  })

  it('time-in-queue breaks ties within same urgency', () => {
    const olderSample = makeInput({
      sampleId: 'old',
      urgency: 'routine',
      receivedAt: new Date(now - 120 * 60_000).toISOString(),
    })
    const newerSample = makeInput({
      sampleId: 'new',
      urgency: 'routine',
      receivedAt: new Date(now - 10 * 60_000).toISOString(),
    })
    const result = prioritizeSamples([newerSample, olderSample])
    expect(result[0].sampleId).toBe('old')
  })

  it('batching groups same-type samples adjacent within urgency tier', () => {
    // cbc1 and cbc2 are both CBC; lipid is in between initially
    const cbc1 = makeInput({
      sampleId: 'cbc1',
      urgency: 'stat',
      loincCode: '58410-2',
      receivedAt: new Date(now - 90 * 60_000).toISOString(), // oldest → highest priority
    })
    const lipid = makeInput({
      sampleId: 'lipid',
      urgency: 'stat',
      loincCode: '57698-3', // Lipid Panel
      receivedAt: new Date(now - 80 * 60_000).toISOString(),
    })
    const cbc2 = makeInput({
      sampleId: 'cbc2',
      urgency: 'stat',
      loincCode: '58410-2',
      receivedAt: new Date(now - 70 * 60_000).toISOString(), // newest of the 3
    })

    const result = prioritizeSamples([cbc1, lipid, cbc2])
    const ids = result.map((s) => s.sampleId)

    // Both CBCs should be adjacent — either [cbc1, cbc2, lipid] or [cbc1, cbc2] then lipid
    const cbc1Idx = ids.indexOf('cbc1')
    const cbc2Idx = ids.indexOf('cbc2')
    const lipidIdx = ids.indexOf('lipid')
    expect(Math.abs(cbc1Idx - cbc2Idx)).toBe(1) // adjacent
    expect(lipidIdx).toBeGreaterThan(Math.max(cbc1Idx, cbc2Idx)) // after both CBCs
  })

  it('batching does NOT cross urgency boundaries', () => {
    const statCbc = makeInput({ sampleId: 'stat-cbc', urgency: 'stat', loincCode: '58410-2' })
    const urgentLipid = makeInput({ sampleId: 'u-lipid', urgency: 'urgent', loincCode: '57698-3' })
    const routineCbc = makeInput({ sampleId: 'r-cbc', urgency: 'routine', loincCode: '58410-2' })

    const result = prioritizeSamples([statCbc, urgentLipid, routineCbc])
    const ids = result.map((s) => s.sampleId)

    // stat-cbc must come first (stat tier), routine-cbc must come last (routine tier)
    expect(ids[0]).toBe('stat-cbc')
    expect(ids[ids.length - 1]).toBe('r-cbc')
  })

  it('all same urgency — orders by time in queue', () => {
    const samples = [
      makeInput({ sampleId: 'a', urgency: 'urgent', receivedAt: new Date(now - 10 * 60_000).toISOString() }),
      makeInput({ sampleId: 'b', urgency: 'urgent', receivedAt: new Date(now - 30 * 60_000).toISOString() }),
      makeInput({ sampleId: 'c', urgency: 'urgent', receivedAt: new Date(now - 20 * 60_000).toISOString() }),
    ]
    const result = prioritizeSamples(samples)
    const ids = result.map((s) => s.sampleId)
    expect(ids).toEqual(['b', 'c', 'a'])
  })

  it('all same test type — groups them all adjacent', () => {
    const inputs = [1, 2, 3].map((i) =>
      makeInput({ sampleId: `cbc-${i}`, urgency: 'routine', loincCode: '58410-2' }),
    )
    const result = prioritizeSamples(inputs)
    const groups = result.map((s) => s.batchGroup)
    // All 3 are CBC — all adjacent (the only group)
    expect(groups.every((g) => g === 'CBC')).toBe(true)
  })

  it('all expired — all get the -5000 boost, sorted by urgency then queue time', () => {
    const r1 = makeInput({
      sampleId: 'e-stat',
      urgency: 'stat',
      loincCode: '82803-4',
      receivedAt: new Date(now - 200 * 60_000).toISOString(),
    })
    const r2 = makeInput({
      sampleId: 'e-routine',
      urgency: 'routine',
      loincCode: '82803-4',
      receivedAt: new Date(now - 200 * 60_000).toISOString(),
    })
    const result = prioritizeSamples([r2, r1])
    // Both expired, but stat still before routine
    expect(result[0].sampleId).toBe('e-stat')
  })
})

// ---------------------------------------------------------------------------
// applyManualOverrides
// ---------------------------------------------------------------------------

describe('applyManualOverrides', () => {
  it('returns list unchanged when no overrides', () => {
    const inputs = [
      makeInput({ sampleId: 'a' }),
      makeInput({ sampleId: 'b' }),
      makeInput({ sampleId: 'c' }),
    ]
    const prioritized = prioritizeSamples(inputs)
    const result = applyManualOverrides(prioritized, [])
    expect(result.map((s) => s.sampleId)).toEqual(prioritized.map((s) => s.sampleId))
  })

  it('pins a sample at its manual position', () => {
    const inputs = [
      makeInput({ sampleId: 'a', urgency: 'routine', receivedAt: new Date(now - 30 * 60_000).toISOString() }),
      makeInput({ sampleId: 'b', urgency: 'urgent', receivedAt: new Date(now - 30 * 60_000).toISOString() }),
      makeInput({ sampleId: 'c', urgency: 'stat', receivedAt: new Date(now - 30 * 60_000).toISOString() }),
    ]
    const prioritized = prioritizeSamples(inputs)
    // Without override: [c, b, a]
    expect(prioritized[0].sampleId).toBe('c')

    const overrides: PriorityOverride[] = [
      { sampleId: 'a', manualPosition: 0, overriddenAt: new Date().toISOString() },
    ]
    const result = applyManualOverrides(prioritized, overrides)
    expect(result[0].sampleId).toBe('a')
    expect(result[0].isManualOverride).toBe(true)
  })

  it('marks overridden samples with isManualOverride = true', () => {
    const inputs = [makeInput({ sampleId: 'x' }), makeInput({ sampleId: 'y' })]
    const prioritized = prioritizeSamples(inputs)
    const overrides: PriorityOverride[] = [
      { sampleId: 'x', manualPosition: 1, overriddenAt: new Date().toISOString() },
    ]
    const result = applyManualOverrides(prioritized, overrides)
    const xEntry = result.find((s) => s.sampleId === 'x')
    expect(xEntry?.isManualOverride).toBe(true)
    const yEntry = result.find((s) => s.sampleId === 'y')
    expect(yEntry?.isManualOverride).toBe(false)
  })

  it('clamps out-of-bound manual positions to list end', () => {
    const inputs = [makeInput({ sampleId: 'a' }), makeInput({ sampleId: 'b' })]
    const prioritized = prioritizeSamples(inputs)
    const overrides: PriorityOverride[] = [
      { sampleId: 'a', manualPosition: 999, overriddenAt: new Date().toISOString() },
    ]
    const result = applyManualOverrides(prioritized, overrides)
    expect(result).toHaveLength(2)
    // 'a' should be at end (clamped to position 1)
    expect(result[result.length - 1].sampleId).toBe('a')
  })
})
