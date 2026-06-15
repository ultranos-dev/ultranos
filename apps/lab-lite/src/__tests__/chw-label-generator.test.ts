/**
 * Story 54.2 — CHW Label Generator Tests (Task 14.2)
 *
 * Unit tests for:
 *  - Label format: CHW-MMDD-NNN
 *  - Collision detection against existing Dexie entries
 *  - formatLabelForDisplay: adds spacing for readability
 *  - hasPrinterDetected: browser capability check
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateLabelNumber, formatLabelForDisplay, hasPrinterDetected, isLabelNumberTaken } from '../lib/chw-label-generator'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTodaySamples = vi.fn().mockResolvedValue([])

vi.mock('../lib/db', () => ({
  getTodayCHWSamples: () => mockTodaySamples(),
}))

// ---------------------------------------------------------------------------
// generateLabelNumber
// ---------------------------------------------------------------------------

describe('generateLabelNumber', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Fix date to 2026-06-01
    vi.setSystemTime(new Date('2026-06-01T08:00:00.000Z'))
    mockTodaySamples.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('generates CHW-MMDD-NNN format', async () => {
    const label = await generateLabelNumber()
    expect(label).toMatch(/^CHW-\d{4}-\d{3}$/)
  })

  it('uses today\'s date in MMDD format', async () => {
    const label = await generateLabelNumber()
    expect(label).toBe('CHW-0601-001')
  })

  it('increments sequence when existing labels present', async () => {
    mockTodaySamples.mockResolvedValue([
      { labelNumber: 'CHW-0601-001' },
      { labelNumber: 'CHW-0601-002' },
    ])
    const label = await generateLabelNumber()
    expect(label).toBe('CHW-0601-003')
  })

  it('starts at 001 when no existing labels', async () => {
    mockTodaySamples.mockResolvedValue([])
    const label = await generateLabelNumber()
    expect(label).toBe('CHW-0601-001')
  })
})

// ---------------------------------------------------------------------------
// isLabelNumberTaken
// ---------------------------------------------------------------------------

describe('isLabelNumberTaken', () => {
  it('returns true when label exists', async () => {
    mockTodaySamples.mockResolvedValue([{ labelNumber: 'CHW-0601-001' }])
    expect(await isLabelNumberTaken('CHW-0601-001')).toBe(true)
  })

  it('returns false when label does not exist', async () => {
    mockTodaySamples.mockResolvedValue([])
    expect(await isLabelNumberTaken('CHW-0601-001')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// formatLabelForDisplay
// ---------------------------------------------------------------------------

describe('formatLabelForDisplay', () => {
  it('formats CHW-0601-001 with visual spacing', () => {
    const display = formatLabelForDisplay('CHW-0601-001')
    expect(display).toBe('CHW · 0601 · 001')
  })

  it('returns raw label if format is unrecognized', () => {
    const display = formatLabelForDisplay('INVALID')
    expect(display).toBe('INVALID')
  })
})

// ---------------------------------------------------------------------------
// hasPrinterDetected
// ---------------------------------------------------------------------------

describe('hasPrinterDetected', () => {
  it('returns false when usb is not in navigator', () => {
    const navSpy = vi.spyOn(globalThis, 'navigator', 'get').mockReturnValue({} as Navigator)
    expect(hasPrinterDetected()).toBe(false)
    navSpy.mockRestore()
  })

  it('returns true when usb is in navigator', () => {
    const navSpy = vi.spyOn(globalThis, 'navigator', 'get').mockReturnValue({
      usb: {},
    } as unknown as Navigator)
    expect(hasPrinterDetected()).toBe(true)
    navSpy.mockRestore()
  })
})
