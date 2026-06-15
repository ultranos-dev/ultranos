import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LabOrderEntry } from '../lib/db'

// Mock next-intl
const ordersMessages: Record<string, any> = {
  title: 'Test Orders',
  emptyState: 'No test orders',
  refresh: 'Refresh',
  filters: {
    all: 'All',
    received: 'Received',
    inProgress: 'In Progress',
    completed: 'Completed',
  },
  urgency: {
    stat: 'STAT',
    asap: 'ASAP',
    urgent: 'Urgent',
    routine: 'Routine',
  },
  card: {
    orderedBy: 'Ordered by',
    testsRequested: 'Tests',
    specialInstructions: 'Special Instructions',
    orderedAt: 'Ordered',
  },
  badge: 'pending',
}

function resolveKey(key: string): string {
  const parts = key.split('.')
  let result: any = ordersMessages
  for (const part of parts) {
    result = result?.[part]
  }
  return typeof result === 'string' ? result : key
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string, _opts?: any) => resolveKey(key)
    return t
  },
  useLocale: () => 'en',
}))

// Fixed dates for deterministic snapshots
const FIXED_AUTHORED = '2026-01-01T10:00:00.000Z'
const FIXED_RECEIVED = '2026-01-01T10:05:00.000Z'

function makeOrder(overrides: Partial<LabOrderEntry> = {}): LabOrderEntry {
  return {
    orderId: '550e8400-e29b-41d4-a716-446655440000',
    patientFirstName: 'Ahmad',
    patientAge: 45,
    patientRef: 'Patient/123',
    testsRequested: [
      { loincCode: '58410-2', loincDisplay: 'CBC' },
      { loincCode: '2093-3', loincDisplay: 'Cholesterol' },
    ],
    urgency: 'stat',
    orderingPhysicianName: 'Dr. Karimi',
    specialInstructions: null,
    status: 'RECEIVED',
    authoredOn: FIXED_AUTHORED,
    receivedAt: FIXED_RECEIVED,
    syncedAt: FIXED_RECEIVED,
    ...overrides,
  }
}

// Import components after mocks
const { OrderCard } = await import('../components/orders/OrderCard')
const { OrdersWorklist } = await import('../components/orders/OrdersWorklist')

describe('OrderCard', () => {
  it('renders patient first name + age', () => {
    render(<OrderCard order={makeOrder()} />)
    expect(screen.getByText(/Ahmad, 45y/)).toBeDefined()
  })

  it('renders test names', () => {
    render(<OrderCard order={makeOrder()} />)
    expect(screen.getByText(/CBC, Cholesterol/)).toBeDefined()
  })

  it('renders ordering physician', () => {
    render(<OrderCard order={makeOrder()} />)
    expect(screen.getByText(/Dr. Karimi/)).toBeDefined()
  })

  it('renders urgency badge with STAT text', () => {
    render(<OrderCard order={makeOrder({ urgency: 'stat' })} />)
    expect(screen.getByText('STAT')).toBeDefined()
  })

  it('renders urgency badge with Routine text', () => {
    render(<OrderCard order={makeOrder({ urgency: 'routine' })} />)
    expect(screen.getByText('Routine')).toBeDefined()
  })

  it('renders STAT badge with red styling', () => {
    const { container } = render(<OrderCard order={makeOrder({ urgency: 'stat' })} />)
    const badge = container.querySelector('.bg-red-100')
    expect(badge).not.toBeNull()
  })

  it('renders URGENT badge with amber styling', () => {
    const { container } = render(<OrderCard order={makeOrder({ urgency: 'urgent' })} />)
    const badge = container.querySelector('.bg-amber-100')
    expect(badge).not.toBeNull()
  })

  it('renders ROUTINE badge with green styling', () => {
    const { container } = render(<OrderCard order={makeOrder({ urgency: 'routine' })} />)
    const badge = container.querySelector('.bg-green-100')
    expect(badge).not.toBeNull()
  })

  it('renders special instructions when present', () => {
    render(<OrderCard order={makeOrder({ specialInstructions: 'Fasting required' })} />)
    expect(screen.getByText('Special Instructions')).toBeDefined()
    expect(screen.getByText('Fasting required')).toBeDefined()
  })

  it('does not render special instructions when null', () => {
    render(<OrderCard order={makeOrder({ specialInstructions: null })} />)
    expect(screen.queryByText('Special Instructions')).toBeNull()
  })

  it('does NOT render any PHI beyond first name + age', () => {
    const { container } = render(<OrderCard order={makeOrder()} />)
    const html = container.innerHTML
    // Patient ref should not be visible
    expect(html).not.toContain('Patient/123')
    // No date of birth, ID, gender, etc.
    expect(html).not.toContain('birthDate')
    expect(html).not.toContain('gender')
    expect(html).not.toContain('identifier')
  })
})

describe('OrdersWorklist', () => {
  it('renders empty state when no orders', () => {
    render(<OrdersWorklist orders={[]} loading={false} />)
    expect(screen.getByText('No test orders')).toBeDefined()
  })

  it('renders loading skeletons when loading', () => {
    const { container } = render(<OrdersWorklist orders={[]} loading={true} />)
    const skeletons = container.querySelectorAll('[aria-busy="true"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders orders sorted by urgency (STAT first)', () => {
    const orders = [
      makeOrder({ orderId: '111e8400-e29b-41d4-a716-446655440001', urgency: 'routine', patientFirstName: 'Routine-Patient' }),
      makeOrder({ orderId: '222e8400-e29b-41d4-a716-446655440002', urgency: 'stat', patientFirstName: 'Stat-Patient' }),
      makeOrder({ orderId: '333e8400-e29b-41d4-a716-446655440003', urgency: 'urgent', patientFirstName: 'Urgent-Patient' }),
    ]

    const { container } = render(<OrdersWorklist orders={orders} loading={false} />)
    const cards = container.querySelectorAll('.rounded-lg.border')
    const names = Array.from(cards).map((c) => c.textContent)

    // STAT should be first, then urgent, then routine
    expect(names[0]).toContain('Stat-Patient')
    expect(names[1]).toContain('Urgent-Patient')
    expect(names[2]).toContain('Routine-Patient')
  })

  it('filters orders by status when filter is changed', async () => {
    const orders = [
      makeOrder({ orderId: '111e8400-e29b-41d4-a716-446655440001', status: 'RECEIVED', patientFirstName: 'Received-Patient' }),
      makeOrder({ orderId: '222e8400-e29b-41d4-a716-446655440002', status: 'IN_PROGRESS', patientFirstName: 'InProgress-Patient' }),
    ]

    render(<OrdersWorklist orders={orders} loading={false} />)

    // Initially shows all
    expect(screen.getByText(/Received-Patient/)).toBeDefined()
    expect(screen.getByText(/InProgress-Patient/)).toBeDefined()

    // Click "Received" filter button (inside the filter bar)
    const user = userEvent.setup()
    const filterButtons = screen.getAllByText('Received')
    // The first "Received" is the filter button; click it
    await user.click(filterButtons[0])

    expect(screen.getByText(/Received-Patient/)).toBeDefined()
    expect(screen.queryByText(/InProgress-Patient/)).toBeNull()
  })
})

describe('OrdersWorklist RTL snapshot', () => {
  it('renders in LTR', () => {
    document.dir = 'ltr'
    const { container } = render(
      <OrdersWorklist
        orders={[makeOrder()]}
        loading={false}
      />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL', () => {
    document.dir = 'rtl'
    const { container } = render(
      <OrdersWorklist
        orders={[makeOrder()]}
        loading={false}
      />,
    )
    expect(container).toMatchSnapshot()
    document.dir = 'ltr' // cleanup
  })
})
