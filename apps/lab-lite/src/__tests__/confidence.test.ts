import { describe, it, expect } from 'vitest'
import {
  ConfidenceLevel,
  CONFIDENCE_THRESHOLDS,
  AUTO_ESCALATION_THRESHOLD,
  scoreToLevel,
  shouldAutoEscalate,
} from '../lib/confidence'

describe('ConfidenceLevel enum', () => {
  it('has HIGH, MEDIUM, LOW values', () => {
    expect(ConfidenceLevel.HIGH).toBe('HIGH')
    expect(ConfidenceLevel.MEDIUM).toBe('MEDIUM')
    expect(ConfidenceLevel.LOW).toBe('LOW')
  })
})

describe('CONFIDENCE_THRESHOLDS', () => {
  it('HIGH covers 0.8–1.0', () => {
    expect(CONFIDENCE_THRESHOLDS.HIGH.min).toBe(0.8)
    expect(CONFIDENCE_THRESHOLDS.HIGH.max).toBe(1.0)
  })

  it('MEDIUM covers 0.5–0.8', () => {
    expect(CONFIDENCE_THRESHOLDS.MEDIUM.min).toBe(0.5)
    expect(CONFIDENCE_THRESHOLDS.MEDIUM.max).toBe(0.8)
  })

  it('LOW covers 0.0–0.5', () => {
    expect(CONFIDENCE_THRESHOLDS.LOW.min).toBe(0.0)
    expect(CONFIDENCE_THRESHOLDS.LOW.max).toBe(0.5)
  })
})

describe('AUTO_ESCALATION_THRESHOLD', () => {
  it('defaults to LOW', () => {
    expect(AUTO_ESCALATION_THRESHOLD).toBe(ConfidenceLevel.LOW)
  })
})

describe('scoreToLevel()', () => {
  it('returns HIGH for score >= 0.8', () => {
    expect(scoreToLevel(1.0)).toBe(ConfidenceLevel.HIGH)
    expect(scoreToLevel(0.8)).toBe(ConfidenceLevel.HIGH)
    expect(scoreToLevel(0.95)).toBe(ConfidenceLevel.HIGH)
  })

  it('returns MEDIUM for score >= 0.5 and < 0.8', () => {
    expect(scoreToLevel(0.5)).toBe(ConfidenceLevel.MEDIUM)
    expect(scoreToLevel(0.79)).toBe(ConfidenceLevel.MEDIUM)
    expect(scoreToLevel(0.65)).toBe(ConfidenceLevel.MEDIUM)
  })

  it('returns LOW for score < 0.5', () => {
    expect(scoreToLevel(0.0)).toBe(ConfidenceLevel.LOW)
    expect(scoreToLevel(0.49)).toBe(ConfidenceLevel.LOW)
    expect(scoreToLevel(0.1)).toBe(ConfidenceLevel.LOW)
  })

  it('handles boundary at exactly 0.8 (should be HIGH)', () => {
    expect(scoreToLevel(0.8)).toBe(ConfidenceLevel.HIGH)
  })

  it('handles boundary just below 0.8 (should be MEDIUM)', () => {
    expect(scoreToLevel(0.799)).toBe(ConfidenceLevel.MEDIUM)
  })

  it('handles boundary at exactly 0.5 (should be MEDIUM)', () => {
    expect(scoreToLevel(0.5)).toBe(ConfidenceLevel.MEDIUM)
  })

  it('handles boundary just below 0.5 (should be LOW)', () => {
    expect(scoreToLevel(0.499)).toBe(ConfidenceLevel.LOW)
  })
})

describe('shouldAutoEscalate()', () => {
  it('returns true for LOW (at threshold)', () => {
    expect(shouldAutoEscalate(ConfidenceLevel.LOW)).toBe(true)
  })

  it('returns false for MEDIUM (above threshold)', () => {
    expect(shouldAutoEscalate(ConfidenceLevel.MEDIUM)).toBe(false)
  })

  it('returns false for HIGH (well above threshold)', () => {
    expect(shouldAutoEscalate(ConfidenceLevel.HIGH)).toBe(false)
  })
})
