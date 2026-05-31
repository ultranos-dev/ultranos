import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SAMPLE_STABILITY_MAP,
  DEFAULT_STABILITY_MINUTES,
  getStabilityWindowMinutes,
  getStabilityStatus,
} from '@/lib/sample-stability'

// ---------------------------------------------------------------------------
// getStabilityWindowMinutes
// ---------------------------------------------------------------------------

describe('getStabilityWindowMinutes', () => {
  it('returns correct window for Blood Gas (82803-4)', () => {
    expect(getStabilityWindowMinutes('82803-4')).toBe(30)
  })

  it('returns correct window for CBC (58410-2)', () => {
    expect(getStabilityWindowMinutes('58410-2')).toBe(360)
  })

  it('returns correct window for HbA1c (4548-4)', () => {
    expect(getStabilityWindowMinutes('4548-4')).toBe(1440)
  })

  it('returns correct window for Urine Culture (630-4)', () => {
    expect(getStabilityWindowMinutes('630-4')).toBe(120)
  })

  it('returns correct window for CSF Analysis (49581-7)', () => {
    expect(getStabilityWindowMinutes('49581-7')).toBe(30)
  })

  it('returns DEFAULT_STABILITY_MINUTES (480) for unknown LOINC code', () => {
    expect(getStabilityWindowMinutes('99999-9')).toBe(DEFAULT_STABILITY_MINUTES)
    expect(getStabilityWindowMinutes('')).toBe(DEFAULT_STABILITY_MINUTES)
  })

  it('has 14 entries in SAMPLE_STABILITY_MAP', () => {
    expect(Object.keys(SAMPLE_STABILITY_MAP).length).toBe(14)
  })

  it('all stability windows in map are positive numbers', () => {
    for (const [code, minutes] of Object.entries(SAMPLE_STABILITY_MAP)) {
      expect(minutes).toBeGreaterThan(0), `LOINC ${code} has non-positive window`
    }
  })
})

// ---------------------------------------------------------------------------
// getStabilityStatus — boundary tests
// ---------------------------------------------------------------------------

describe('getStabilityStatus', () => {
  let now: number

  beforeEach(() => {
    now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function isoMinsAgo(minutes: number): string {
    return new Date(now - minutes * 60_000).toISOString()
  }

  it('returns "safe" when > 60 minutes remaining', () => {
    // 480 min window, 100 min elapsed → 380 remaining
    const result = getStabilityStatus(isoMinsAgo(100), 480)
    expect(result.status).toBe('safe')
    expect(result.remainingMinutes).toBe(380)
  })

  it('returns "warning" when exactly 60 minutes remaining', () => {
    // 180 min window, 120 min elapsed → 60 remaining
    const result = getStabilityStatus(isoMinsAgo(120), 180)
    expect(result.status).toBe('warning')
    expect(result.remainingMinutes).toBe(60)
  })

  it('returns "warning" when 59 minutes remaining', () => {
    // 180 min window, 121 min elapsed → 59 remaining
    const result = getStabilityStatus(isoMinsAgo(121), 180)
    expect(result.status).toBe('warning')
    expect(result.remainingMinutes).toBe(59)
  })

  it('returns "critical" when exactly 15 minutes remaining', () => {
    // 180 min window, 165 min elapsed → 15 remaining
    const result = getStabilityStatus(isoMinsAgo(165), 180)
    expect(result.status).toBe('critical')
    expect(result.remainingMinutes).toBe(15)
  })

  it('returns "critical" when 1 minute remaining', () => {
    const result = getStabilityStatus(isoMinsAgo(179), 180)
    expect(result.status).toBe('critical')
    expect(result.remainingMinutes).toBe(1)
  })

  it('returns "expired" when exactly at window boundary (0 remaining)', () => {
    const result = getStabilityStatus(isoMinsAgo(180), 180)
    expect(result.status).toBe('expired')
    expect(result.remainingMinutes).toBe(0)
  })

  it('returns "expired" when past the stability window', () => {
    const result = getStabilityStatus(isoMinsAgo(300), 180)
    expect(result.status).toBe('expired')
    expect(result.remainingMinutes).toBe(0)
  })

  it('handles freshly received sample (0 minutes elapsed) as safe', () => {
    const result = getStabilityStatus(isoMinsAgo(0), 480)
    expect(result.status).toBe('safe')
    expect(result.remainingMinutes).toBeGreaterThan(400)
  })

  it('rounds up remainingMinutes to ceiling', () => {
    // 180 min window, 179.3 min elapsed → 0.7 remaining → ceil = 1
    const fractionalMs = 179.3 * 60_000
    const receivedAt = new Date(now - fractionalMs).toISOString()
    const result = getStabilityStatus(receivedAt, 180)
    expect(result.remainingMinutes).toBe(1)
  })
})
