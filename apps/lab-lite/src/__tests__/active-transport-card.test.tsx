/**
 * Story 54.3 — Active Transport Card Tests (Task 8)
 * Story 13.5 — Stability status color coding
 *
 * Tests (8):
 *  1. green status  — pickupTimestamp 2 hours ago → bg-green-100
 *  2. amber status  — pickupTimestamp 5 hours ago → bg-amber-100
 *  3. red status (time) — pickupTimestamp 7 hours ago → bg-red-100
 *  4. red status (flagged) — status === 'flagged', 1 hour ago → still red
 *  5. shows sample count correctly
 *  6. shows elapsed time in hours format
 *  7. onClick fires when card is clicked
 *  8. renders without error when onClick is not provided
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('@ultranos/ui-kit/icons', () => ({
  Truck: () => null,
  Clock: () => null,
  Package: () => null,
}))

import { ActiveTransportCard } from '@/components/transport/ActiveTransportCard'
import type { TransportSession } from '@/types/transport'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(
  pickupTimestamp: string,
  overrides: Partial<TransportSession> = {},
): TransportSession {
  return {
    id: 'sess-test-1',
    courierId: 'C-123',
    originLocationId: 'loc-origin-1',
    destinationLocationId: 'loc-dest-1',
    status: 'in-transit',
    pickupTimestamp,
    deliveryTimestamp: null,
    pickupTemperature: null,
    deliveryTemperature: null,
    sampleIds: ['sp-1', 'sp-2', 'sp-3'],
    sampleCount: 3,
    conditionAtDelivery: null,
    flags: [],
    estimatedTransitMinutes: 60,
    meta: { lastUpdated: pickupTimestamp, versionId: '1' },
    _ultranos: { createdAt: pickupTimestamp, syncStatus: 'synced' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActiveTransportCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Test 1: green (elapsed < 4 hours) ──────────────────────────────────────
  it('shows green stability indicator when elapsed time is 2 hours', () => {
    vi.setSystemTime(new Date())
    const pickup = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
    const session = makeSession(pickup.toISOString())

    render(<ActiveTransportCard session={session} />)

    const badge = screen.getByTestId('stability-indicator')
    expect(badge.className).toContain('bg-green-100')
    expect(badge.className).toContain('text-green-800')
  })

  // ── Test 2: amber (elapsed 4–6 hours) ──────────────────────────────────────
  it('shows amber stability indicator when elapsed time is 5 hours', () => {
    vi.setSystemTime(new Date())
    const pickup = new Date(Date.now() - 5 * 60 * 60 * 1000) // 5 hours ago
    const session = makeSession(pickup.toISOString())

    render(<ActiveTransportCard session={session} />)

    const badge = screen.getByTestId('stability-indicator')
    expect(badge.className).toContain('bg-amber-100')
    expect(badge.className).toContain('text-amber-800')
  })

  // ── Test 3: red (elapsed > 6 hours) ────────────────────────────────────────
  it('shows red stability indicator when elapsed time is 7 hours', () => {
    vi.setSystemTime(new Date())
    const pickup = new Date(Date.now() - 7 * 60 * 60 * 1000) // 7 hours ago
    const session = makeSession(pickup.toISOString())

    render(<ActiveTransportCard session={session} />)

    const badge = screen.getByTestId('stability-indicator')
    expect(badge.className).toContain('bg-red-100')
    expect(badge.className).toContain('text-red-800')
  })

  // ── Test 4: red (flagged overrides time) ───────────────────────────────────
  it('shows red stability indicator when status is flagged, even if elapsed is only 1 hour', () => {
    vi.setSystemTime(new Date())
    const pickup = new Date(Date.now() - 1 * 60 * 60 * 1000) // 1 hour ago — would normally be green
    const session = makeSession(pickup.toISOString(), { status: 'flagged' })

    render(<ActiveTransportCard session={session} />)

    const badge = screen.getByTestId('stability-indicator')
    expect(badge.className).toContain('bg-red-100')
    expect(badge.className).toContain('text-red-800')
    expect(badge.textContent).toContain('FLAGGED')
  })

  // ── Test 5: sample count ───────────────────────────────────────────────────
  it('shows the correct sample count', () => {
    vi.setSystemTime(new Date())
    const pickup = new Date(Date.now() - 1 * 60 * 60 * 1000)
    const session = makeSession(pickup.toISOString(), { sampleCount: 8, sampleIds: Array(8).fill('sp') })

    render(<ActiveTransportCard session={session} />)

    const sampleCount = screen.getByTestId('sample-count')
    expect(sampleCount.textContent).toContain('8')
  })

  // ── Test 6: elapsed time display ──────────────────────────────────────────
  it('shows elapsed time in hours format', () => {
    vi.setSystemTime(new Date())
    const pickup = new Date(Date.now() - 2 * 60 * 60 * 1000) // exactly 2 hours ago
    const session = makeSession(pickup.toISOString())

    render(<ActiveTransportCard session={session} />)

    const elapsed = screen.getByTestId('elapsed-time')
    expect(elapsed.textContent).toMatch(/2h/)
  })

  // ── Test 7: onClick fires ──────────────────────────────────────────────────
  it('calls onClick when the card is clicked', () => {
    vi.setSystemTime(new Date())
    const pickup = new Date(Date.now() - 1 * 60 * 60 * 1000)
    const session = makeSession(pickup.toISOString())
    const handleClick = vi.fn()

    render(<ActiveTransportCard session={session} onClick={handleClick} />)

    const card = screen.getByTestId('active-transport-card')
    fireEvent.click(card)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  // ── Test 8: no onClick — renders without error ─────────────────────────────
  it('renders without error when onClick is not provided', () => {
    vi.setSystemTime(new Date())
    const pickup = new Date(Date.now() - 1 * 60 * 60 * 1000)
    const session = makeSession(pickup.toISOString())

    // Should not throw
    expect(() => render(<ActiveTransportCard session={session} />)).not.toThrow()
    expect(screen.getByTestId('active-transport-card')).toBeInTheDocument()
  })
})
