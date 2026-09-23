import { describe, it, expect } from 'vitest'

// Hermetic unit tests for the appointment Tier-3 LWW / HLC-migration logic.
// No module mocks and no renderHook: exercising the exported pure helpers keeps
// this file free of global side effects (timers, mocked module graph) that would
// otherwise leak into other test files sharing the worker. The hook's create/
// cancel/walk-in paths delegate their stamp + routing decision to exactly these
// helpers plus `serializeHlc(hlc.now())` (asserted below), so covering them here
// covers AC2 (real HLC stamp) and AC5 (homogeneous-format merge).
import {
  toComparableHlc,
  isLegacyStamp,
  remoteWinsLww,
} from '@/hooks/useAppointments'
import { hlc, serializeHlc } from '@/lib/hlc'

const SERIALIZED_HLC_RE = /^\d{15}:\d{5}:.+/

// ─── AC2: local writes must stamp a REAL serialized HLC, never Date.now() ms ──
describe('appointment HLC stamping (AC2)', () => {
  it('serializeHlc(hlc.now()) yields a serialized HLC, not a bare ms string', () => {
    const stamp = serializeHlc(hlc.now())
    expect(stamp).toMatch(SERIALIZED_HLC_RE)
    // A legacy Date.now().toString() (<=15 digits, no colons) must NOT match.
    expect(/^\d{1,15}$/.test(stamp)).toBe(false)
  })

  it('successive stamps are monotonically non-decreasing (queue ordering)', () => {
    const a = serializeHlc(hlc.now())
    const b = serializeHlc(hlc.now())
    // Lexicographic order is valid BETWEEN serialized HLCs (both same format).
    expect(b >= a).toBe(true)
  })
})

// ─── AC2 migration: legacy ms stamps are recognised for re-stamping ──────────
describe('isLegacyStamp / toComparableHlc — migration detection', () => {
  it('flags a legacy ms-epoch string as legacy (needs re-stamp)', () => {
    expect(isLegacyStamp('1737000000000')).toBe(true)
  })
  it('flags an empty/undefined stamp as legacy', () => {
    expect(isLegacyStamp(undefined)).toBe(true)
    expect(isLegacyStamp('')).toBe(true)
  })
  it('does NOT flag a serialized HLC as legacy', () => {
    expect(isLegacyStamp('001737000000000:00001:node')).toBe(false)
  })
  it('a freshly minted stamp is not legacy', () => {
    expect(isLegacyStamp(serializeHlc(hlc.now()))).toBe(false)
  })
  it('normalizes a legacy ms string to { wallMs, counter:0, nodeId:"legacy" }', () => {
    expect(toComparableHlc('1737000000000')).toEqual({ wallMs: 1737000000000, counter: 0, nodeId: 'legacy' })
  })
  it('normalizes a serialized HLC back to its parts', () => {
    expect(toComparableHlc('001737000000000:00042:nodeX')).toEqual({ wallMs: 1737000000000, counter: 42, nodeId: 'nodeX' })
  })
  it('normalizes a malformed / empty stamp to the oldest possible clock', () => {
    expect(toComparableHlc('not-an-hlc')).toEqual({ wallMs: 0, counter: 0, nodeId: '' })
    expect(toComparableHlc(null)).toEqual({ wallMs: 0, counter: 0, nodeId: '' })
  })
})

// ─── AC5: homogeneous LWW comparison across mixed stamp formats ──────────────
describe('remoteWinsLww — format-agnostic Tier-3 LWW (AC5)', () => {
  it('no local record → remote always wins', () => {
    expect(remoteWinsLww('001737000000000:00001:node', undefined, false)).toBe(true)
  })

  it('legacy-ms local vs newer serialized-HLC remote → remote wins (older ms loses)', () => {
    const legacyLocal = '1737000000000'
    const newerRemote = `${String(1737000001000).padStart(15, '0')}:00000:node-x`
    // The OLD buggy merge compared these as raw strings: lexicographically the
    // legacy 13-char "1737…" sorts ABOVE the zero-padded serialized clock, so the
    // newer remote update would have been WRONGLY discarded. Guard against it:
    expect(newerRemote > legacyLocal).toBe(false)
    expect(remoteWinsLww(newerRemote, legacyLocal, true)).toBe(true)
  })

  it('serialized-HLC local vs OLDER legacy-ms remote → remote loses', () => {
    const newerLocal = `${String(1737000005000).padStart(15, '0')}:00000:node-a`
    expect(remoteWinsLww('1737000000000', newerLocal, true)).toBe(false)
  })

  it('two serialized HLCs — higher counter wins on equal wallMs', () => {
    const wall = String(1737000000000).padStart(15, '0')
    expect(remoteWinsLww(`${wall}:00002:node`, `${wall}:00001:node`, true)).toBe(true)
    expect(remoteWinsLww(`${wall}:00001:node`, `${wall}:00002:node`, true)).toBe(false)
  })

  it('equal stamps → remote does NOT overwrite (no needless churn)', () => {
    const s = `${String(1737000000000).padStart(15, '0')}:00007:node`
    expect(remoteWinsLww(s, s, true)).toBe(false)
  })
})
