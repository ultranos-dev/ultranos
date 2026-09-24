import { describe, it, expect } from 'vitest'
import {
  HybridLogicalClock,
  serializeHlc,
  compareHlc,
  hlcNow,
  isSerializedHlc,
  DEFAULT_MAX_DRIFT_MS,
} from '../hlc.js'
import type { HlcState, HlcTimestamp } from '../hlc.js'

/**
 * Story 60.1 — HLC persistence (restart monotonicity) and clock-drift bounds.
 */

describe('HLC persistence — restart with a backwards wall clock (AC #4)', () => {
  it('seeds from persisted state so a new clock stays strictly monotonic', () => {
    // Session 1: wall clock at t=10_000, issue a few events, persist state.
    let time = 10_000
    const clock1 = new HybridLogicalClock('node-a', () => time)
    clock1.now()
    clock1.now()
    const lastSession1 = clock1.now()
    const persisted: HlcState = clock1.getState()

    // Session 2 after "restart": the wall clock moved BACKWARDS to t=5_000.
    time = 5_000
    const clock2 = new HybridLogicalClock('node-a', () => time)
    clock2.seedFrom(persisted)

    const firstAfterRestart = clock2.now()
    // Strictly greater than the last stamp issued before the restart, despite
    // physical time going backwards.
    expect(compareHlc(lastSession1, firstAfterRestart)).toBeLessThan(0)
  })

  it('takes fresh physical time when it is ahead of the persisted wall time', () => {
    let time = 1_000
    const clock1 = new HybridLogicalClock('node-a', () => time)
    clock1.now()
    const persisted = clock1.getState()

    time = 9_999
    const clock2 = new HybridLogicalClock('node-a', () => time)
    clock2.seedFrom(persisted)
    // seedFrom takes the fresh (larger) physical time with counter 0; the next
    // now() at that same instant then steps the counter to 1.
    const t = clock2.now()
    expect(t.wallMs).toBe(9_999)
    expect(t.counter).toBe(1)
  })

  it('ignores persisted state from a different node id', () => {
    const foreign: HlcState = { wallMs: 999_999, counter: 7, nodeId: 'other-node' }
    const clock = new HybridLogicalClock('node-a', () => 1_000)
    clock.seedFrom(foreign)
    const t = clock.now()
    // Did NOT adopt the foreign wall time — started from local physical time.
    expect(t.wallMs).toBe(1_000)
    expect(t.counter).toBe(0)
  })

  it('tolerates a null/undefined persisted state (cold start)', () => {
    const clock = new HybridLogicalClock('node-a', () => 2_000)
    clock.seedFrom(null)
    clock.seedFrom(undefined)
    const t = clock.now()
    expect(t.wallMs).toBe(2_000)
  })

  it('round-trips getState across a serialize/persist boundary', () => {
    let time = 3_000
    const clock1 = new HybridLogicalClock('node-z', () => time)
    clock1.now()
    clock1.now()
    const json = JSON.stringify(clock1.getState())
    const restored = JSON.parse(json) as HlcState

    time = 3_000 // same instant — force the counter to continue
    const clock2 = new HybridLogicalClock('node-z', () => time)
    clock2.seedFrom(restored)
    const next = clock2.now()
    // counter must advance past the persisted counter at the same wall time
    expect(next.wallMs).toBe(3_000)
    expect(next.counter).toBeGreaterThan(restored.counter)
  })
})

describe('HLC drift bound — reject implausibly-future remotes (AC #5)', () => {
  it('rejects a remote more than maxDriftMs ahead and does not adopt its wall time', () => {
    const localTime = 1_000_000
    const clock = new HybridLogicalClock('node-a', () => localTime)
    clock.now()

    const poisoned: HlcTimestamp = {
      wallMs: localTime + DEFAULT_MAX_DRIFT_MS + 60_000, // well beyond the bound
      counter: 0,
      nodeId: 'future-device',
    }
    const result = clock.receiveWithResult(poisoned)
    expect(result.driftRejected).toBe(true)
    expect(result.driftMs).toBeGreaterThan(DEFAULT_MAX_DRIFT_MS)
    // Local clock advanced locally but never inherited the poisoned future time.
    expect(result.timestamp.wallMs).toBe(localTime)
  })

  it('accepts a remote within the drift bound and merges normally', () => {
    const localTime = 1_000_000
    const clock = new HybridLogicalClock('node-a', () => localTime)
    clock.now()

    const remote: HlcTimestamp = {
      wallMs: localTime + 1_000, // 1s ahead, within the 5-min bound
      counter: 2,
      nodeId: 'peer',
    }
    const result = clock.receiveWithResult(remote)
    expect(result.driftRejected).toBe(false)
    expect(result.timestamp.wallMs).toBe(localTime + 1_000)
  })

  it('honours a custom maxDriftMs', () => {
    const localTime = 500_000
    const clock = new HybridLogicalClock('node-a', { now: () => localTime, maxDriftMs: 1_000 })
    clock.now()

    const remote: HlcTimestamp = { wallMs: localTime + 2_000, counter: 0, nodeId: 'peer' }
    const result = clock.receiveWithResult(remote)
    expect(result.driftRejected).toBe(true)
    expect(result.timestamp.wallMs).toBe(localTime)
  })

  it('a rejected remote still yields a strictly-monotonic local stamp', () => {
    const localTime = 2_000_000
    const clock = new HybridLogicalClock('node-a', () => localTime)
    const before = clock.now()
    const poisoned: HlcTimestamp = { wallMs: localTime + 10 * 60_000, counter: 5, nodeId: 'evil' }
    const after = clock.receive(poisoned)
    expect(compareHlc(before, after)).toBeLessThan(0)
  })
})

describe('hlcNow() convenience + format', () => {
  it('returns a valid serialized HLC that advances monotonically', () => {
    const clock = new HybridLogicalClock('node-a', () => 1_000)
    const a = hlcNow(clock)
    const b = hlcNow(clock)
    expect(isSerializedHlc(a)).toBe(true)
    expect(isSerializedHlc(b)).toBe(true)
    expect(a < b).toBe(true)
  })

  it('isSerializedHlc rejects wall-clock strings, accepts serialized HLCs', () => {
    expect(isSerializedHlc(new Date().toISOString())).toBe(false)
    expect(isSerializedHlc('')).toBe(false)
    expect(isSerializedHlc('not-an-hlc')).toBe(false)
    const clock = new HybridLogicalClock('node-a', () => 1_700_000_000_000)
    expect(isSerializedHlc(serializeHlc(clock.now()))).toBe(true)
  })
})
