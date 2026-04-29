import { describe, it, expect } from 'vitest'
import { HybridLogicalClock, serializeHlc, deserializeHlc, compareHlc } from '../hlc.js'
import type { HlcTimestamp } from '../hlc.js'

describe('HybridLogicalClock', () => {
  it('generates monotonically increasing timestamps', () => {
    const time = 1000
    const clock = new HybridLogicalClock('node-1', () => time)

    const t1 = clock.now()
    const t2 = clock.now()
    const t3 = clock.now()

    expect(compareHlc(t1, t2)).toBeLessThan(0)
    expect(compareHlc(t2, t3)).toBeLessThan(0)
  })

  it('advances wall clock when physical time increases', () => {
    let time = 1000
    const clock = new HybridLogicalClock('node-1', () => time)

    const t1 = clock.now()
    expect(t1.wallMs).toBe(1000)
    expect(t1.counter).toBe(0)

    time = 2000
    const t2 = clock.now()
    expect(t2.wallMs).toBe(2000)
    expect(t2.counter).toBe(0)
  })

  it('increments counter when wall clock does not advance', () => {
    const clock = new HybridLogicalClock('node-1', () => 1000)

    const t1 = clock.now()
    expect(t1.counter).toBe(0)

    const t2 = clock.now()
    expect(t2.counter).toBe(1)

    const t3 = clock.now()
    expect(t3.counter).toBe(2)
  })

  it('merges with a remote timestamp that has a higher wall clock', () => {
    const clock = new HybridLogicalClock('node-1', () => 1000)
    clock.now()

    const remote: HlcTimestamp = { wallMs: 5000, counter: 3, nodeId: 'node-2' }
    const merged = clock.receive(remote)

    expect(merged.wallMs).toBe(5000)
    expect(merged.counter).toBe(4)
  })

  it('merges with a remote timestamp that has a lower wall clock', () => {
    const time = 5000
    const clock = new HybridLogicalClock('node-1', () => time)
    clock.now()

    const remote: HlcTimestamp = { wallMs: 1000, counter: 0, nodeId: 'node-2' }
    const merged = clock.receive(remote)

    expect(merged.wallMs).toBe(5000)
    expect(merged.counter).toBe(1)
  })

  it('merges with a remote timestamp with equal wall clocks', () => {
    const clock = new HybridLogicalClock('node-1', () => 1000)
    clock.now() // wallMs=1000, counter=0

    const remote: HlcTimestamp = { wallMs: 1000, counter: 5, nodeId: 'node-2' }
    const merged = clock.receive(remote)

    expect(merged.wallMs).toBe(1000)
    expect(merged.counter).toBe(6) // max(0, 5) + 1
  })

  it('returns the correct nodeId', () => {
    const clock = new HybridLogicalClock('clinic-dubai-01')
    expect(clock.getNodeId()).toBe('clinic-dubai-01')
  })

  it('throws on counter overflow', () => {
    const clock = new HybridLogicalClock('node-1', () => 1000)
    // Generate events to push counter near the limit
    const remote: HlcTimestamp = { wallMs: 1000, counter: 99998, nodeId: 'node-2' }
    clock.receive(remote) // counter = 99999

    // Next event at same wallMs should overflow
    expect(() => clock.now()).toThrow('counter overflow')
  })
})

describe('serializeHlc / deserializeHlc', () => {
  it('round-trips a timestamp', () => {
    const ts: HlcTimestamp = { wallMs: 1705312800000, counter: 42, nodeId: 'node-abc' }
    const serialized = serializeHlc(ts)
    const deserialized = deserializeHlc(serialized)
    expect(deserialized).toEqual(ts)
  })

  it('produces lexicographically sortable strings', () => {
    const a: HlcTimestamp = { wallMs: 1000, counter: 0, nodeId: 'a' }
    const b: HlcTimestamp = { wallMs: 2000, counter: 0, nodeId: 'a' }
    expect(serializeHlc(a) < serializeHlc(b)).toBe(true)
  })

  it('sorts by counter when wall clocks are equal', () => {
    const a: HlcTimestamp = { wallMs: 1000, counter: 1, nodeId: 'a' }
    const b: HlcTimestamp = { wallMs: 1000, counter: 2, nodeId: 'a' }
    expect(serializeHlc(a) < serializeHlc(b)).toBe(true)
  })

  it('handles nodeId with colons', () => {
    const ts: HlcTimestamp = { wallMs: 1000, counter: 0, nodeId: 'node:with:colons' }
    const deserialized = deserializeHlc(serializeHlc(ts))
    expect(deserialized.nodeId).toBe('node:with:colons')
  })

  it('throws on invalid string', () => {
    expect(() => deserializeHlc('invalid')).toThrow('Invalid HLC string')
  })

  it('throws on non-numeric wallMs or counter', () => {
    expect(() => deserializeHlc('abc:def:node1')).toThrow('non-numeric')
  })
})

describe('compareHlc', () => {
  it('orders by wallMs first', () => {
    const a: HlcTimestamp = { wallMs: 1000, counter: 99, nodeId: 'z' }
    const b: HlcTimestamp = { wallMs: 2000, counter: 0, nodeId: 'a' }
    expect(compareHlc(a, b)).toBeLessThan(0)
  })

  it('orders by counter when wallMs is equal', () => {
    const a: HlcTimestamp = { wallMs: 1000, counter: 1, nodeId: 'a' }
    const b: HlcTimestamp = { wallMs: 1000, counter: 2, nodeId: 'a' }
    expect(compareHlc(a, b)).toBeLessThan(0)
  })

  it('orders by nodeId when wallMs and counter are equal', () => {
    const a: HlcTimestamp = { wallMs: 1000, counter: 0, nodeId: 'a' }
    const b: HlcTimestamp = { wallMs: 1000, counter: 0, nodeId: 'b' }
    expect(compareHlc(a, b)).toBeLessThan(0)
  })

  it('returns 0 for identical timestamps', () => {
    const a: HlcTimestamp = { wallMs: 1000, counter: 0, nodeId: 'a' }
    expect(compareHlc(a, { ...a })).toBe(0)
  })
})
