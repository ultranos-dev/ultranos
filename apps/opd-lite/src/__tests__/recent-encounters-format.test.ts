import { describe, it, expect } from 'vitest'
import { serializeHlc } from '@ultranos/sync-engine'
import { formatDate } from '@/components/dashboard/RecentEncountersList'

describe('RecentEncountersList formatDate', () => {
  it('formats a valid ISO timestamp without producing "Invalid Date"', () => {
    const result = formatDate('2026-05-11T10:00:00Z')
    expect(result).not.toBe('Invalid Date')
    expect(result.length).toBeGreaterThan(0)
  })

  it('formats an HLC serialized timestamp (wallMs:counter:nodeId) — the format a started encounter stamps', () => {
    const wallMs = Date.UTC(2026, 4, 11, 10, 0, 0)
    const hlc = serializeHlc({ wallMs, counter: 1, nodeId: 'node-abc' })
    // Sanity: this is NOT an ISO string — it is the real on-disk HLC format.
    expect(hlc).toContain(':')

    const result = formatDate(hlc)

    expect(result).not.toBe('Invalid Date')
    expect(result.length).toBeGreaterThan(0)
    // The HLC wallMs and the equivalent ISO instant must format identically.
    expect(result).toBe(formatDate(new Date(wallMs).toISOString()))
  })

  it('returns an empty string (never "Invalid Date") for empty or unparseable input', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate('not-a-date')).toBe('')
  })
})
