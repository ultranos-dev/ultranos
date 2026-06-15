/**
 * Procurement RTL Snapshot Tests — Story 52.3 Task 9 (AC 5, 6, RTL)
 *
 * Tests:
 *  - OrderStatusPipeline: LTR and RTL layouts
 *  - OrderStatusPipeline: Cancelled status shows red X with reason
 *  - OrderStatusPipeline: Delivered status shows all stages completed
 *  - OrderStatusPipeline: ETA banner renders when estimatedDelivery set
 *  - Status history is visible and append-only (displayed newest first)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render } from '@testing-library/react'
import { OrderStatusPipeline } from '../components/procurement/OrderStatusPipeline'
import type { ResupplyRequest } from '../lib/db'

// ---------------------------------------------------------------------------
// Freeze time so ETA "Arriving in X days" calculations are deterministic
// ---------------------------------------------------------------------------
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-01T00:00:00Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@ultranos/ui-kit/icons', () => ({
  CheckCircle: ({ size, className }: { size?: number; className?: string }) => (
    <svg data-testid="check-circle" data-size={size} className={className} />
  ),
  XCircle: ({ size, className }: { size?: number; className?: string }) => (
    <svg data-testid="x-circle" data-size={size} className={className} />
  ),
  Clock: ({ size, className }: { size?: number; className?: string }) => (
    <svg data-testid="clock" data-size={size} className={className} />
  ),
  Truck: ({ size, className }: { size?: number; className?: string }) => (
    <svg data-testid="truck" data-size={size} className={className} />
  ),
  Package: ({ size, className }: { size?: number; className?: string }) => (
    <svg data-testid="package" data-size={size} className={className} />
  ),
  ShoppingBag: ({ size, className }: { size?: number; className?: string }) => (
    <svg data-testid="shopping-bag" data-size={size} className={className} />
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<ResupplyRequest> = {}): ResupplyRequest {
  return {
    id: 1,
    requestId: 'req-uuid-001',
    labId: 'lab-001',
    requestedBy: 'tech-001',
    requestedAt: '2026-05-01T08:00:00Z',
    hlcTimestamp: '2026-05-01T08:00:00Z:0:test',
    items: [
      {
        reagentCode: 'MAL-001',
        reagentDisplay: 'Malaria RDT',
        quantityRequested: 50,
        unitOfMeasure: 'tests',
        currentStock: 5,
        daysOfSupplyRemaining: 10,
        unitPrice: null,
        totalPrice: null,
      },
    ],
    urgency: 'urgent',
    notes: '',
    status: 'submitted',
    statusHistory: [
      { status: 'submitted', updatedAt: '2026-05-01T08:00:00Z', updatedBy: 'tech-001', note: null },
    ],
    batchOrderId: null,
    estimatedDelivery: null,
    actualDelivery: null,
    syncStatus: 'synced',
    createdAt: '2026-05-01T08:00:00Z',
    updatedAt: '2026-05-01T08:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Snapshot tests: LTR and RTL
// ---------------------------------------------------------------------------

describe('OrderStatusPipeline — LTR snapshot', () => {
  it('renders submitted status in LTR', () => {
    const request = makeRequest({ status: 'submitted' })
    const { container } = render(<OrderStatusPipeline request={request} />)
    expect(container).toMatchSnapshot()
  })

  it('renders approved status with estimatedDelivery in LTR', () => {
    const request = makeRequest({
      status: 'approved',
      statusHistory: [
        { status: 'submitted', updatedAt: '2026-05-01T08:00:00Z', updatedBy: 'tech-001', note: null },
        { status: 'received', updatedAt: '2026-05-02T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'approved', updatedAt: '2026-05-03T08:00:00Z', updatedBy: 'coordinator-001', note: null },
      ],
      estimatedDelivery: '2099-12-31',
    })
    const { container } = render(<OrderStatusPipeline request={request} />)
    expect(container).toMatchSnapshot()
  })

  it('renders delivered status with all stages completed', () => {
    const request = makeRequest({
      status: 'delivered',
      statusHistory: [
        { status: 'submitted', updatedAt: '2026-05-01T08:00:00Z', updatedBy: 'tech-001', note: null },
        { status: 'received', updatedAt: '2026-05-02T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'approved', updatedAt: '2026-05-03T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'ordered', updatedAt: '2026-05-04T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'shipped', updatedAt: '2026-05-05T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'delivered', updatedAt: '2026-05-15T08:00:00Z', updatedBy: 'system', note: null },
      ],
      actualDelivery: '2026-05-15T08:00:00Z',
    })
    const { container } = render(<OrderStatusPipeline request={request} />)
    expect(container).toMatchSnapshot()
  })

  it('renders cancelled status with red X and reason', () => {
    const request = makeRequest({
      status: 'cancelled',
      statusHistory: [
        { status: 'submitted', updatedAt: '2026-05-01T08:00:00Z', updatedBy: 'tech-001', note: null },
        { status: 'received', updatedAt: '2026-05-02T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'approved', updatedAt: '2026-05-03T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'cancelled', updatedAt: '2026-05-04T08:00:00Z', updatedBy: 'coordinator-001', note: 'Another lab offered transfer' },
      ],
    })
    const { container, getAllByText } = render(<OrderStatusPipeline request={request} />)
    // Reason note should be displayed (may appear in both the banner and history log)
    const noteEls = getAllByText('Another lab offered transfer')
    expect(noteEls.length).toBeGreaterThanOrEqual(1)
    expect(container).toMatchSnapshot()
  })

  it('renders rejected status with reason note', () => {
    const request = makeRequest({
      status: 'rejected',
      statusHistory: [
        { status: 'submitted', updatedAt: '2026-05-01T08:00:00Z', updatedBy: 'tech-001', note: null },
        { status: 'received', updatedAt: '2026-05-02T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'rejected', updatedAt: '2026-05-03T08:00:00Z', updatedBy: 'coordinator-001', note: 'Use existing stock from Lab B first' },
      ],
    })
    const { getAllByText } = render(<OrderStatusPipeline request={request} />)
    const noteEls = getAllByText('Use existing stock from Lab B first')
    expect(noteEls.length).toBeGreaterThanOrEqual(1)
  })
})

describe('OrderStatusPipeline — RTL snapshot', () => {
  it('renders in RTL direction (dir=auto on pipeline container)', () => {
    const request = makeRequest({ status: 'ordered' })
    const { container } = render(
      <div dir="rtl">
        <OrderStatusPipeline request={request} />
      </div>,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders approved status RTL with ETA banner', () => {
    const request = makeRequest({
      status: 'shipped',
      estimatedDelivery: '2099-12-31',
      statusHistory: [
        { status: 'submitted', updatedAt: '2026-05-01T08:00:00Z', updatedBy: 'tech-001', note: null },
        { status: 'received', updatedAt: '2026-05-02T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'approved', updatedAt: '2026-05-03T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'ordered', updatedAt: '2026-05-04T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'shipped', updatedAt: '2026-05-05T08:00:00Z', updatedBy: 'coordinator-001', note: null },
      ],
    })
    const { container } = render(
      <div dir="rtl">
        <OrderStatusPipeline request={request} />
      </div>,
    )
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Status history append-only display test
// ---------------------------------------------------------------------------

describe('OrderStatusPipeline — status history display', () => {
  it('shows all history entries in the details section', () => {
    const request = makeRequest({
      status: 'ordered',
      statusHistory: [
        { status: 'submitted', updatedAt: '2026-05-01T08:00:00Z', updatedBy: 'tech-001', note: null },
        { status: 'received', updatedAt: '2026-05-02T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'approved', updatedAt: '2026-05-03T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'ordered', updatedAt: '2026-05-04T08:00:00Z', updatedBy: 'coordinator-001', note: 'Placed with Supplier X' },
      ],
    })
    const { getByText } = render(<OrderStatusPipeline request={request} />)
    expect(getByText('Status history (4 events)')).toBeDefined()
    expect(getByText('Placed with Supplier X')).toBeDefined()
  })
})
