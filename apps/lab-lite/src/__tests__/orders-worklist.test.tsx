import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LabOrderEntry } from '../lib/db'

// Mock next-intl
const ordersMessages: Record<string, any> = {
  title: 'Test Orders',
  emptyState: 'No test orders',
  refresh: 'Refresh',
  unavailableTitle: 'Unable to load orders',
  unavailableDescription: 'The server is unreachable. Check your connection and try again.',
  retry: 'Retry',
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
    ageYears: '{age}y',
    orderId: 'Order',
    assignedToYou: 'Assigned to you',
    available: 'Available',
    receiveSampleFor: 'Receive sample for {name}',
    patientDetails: 'Patient Details',
    sampleReceived: 'Sample received',
    viewInWorklist: 'View {name} in worklist',
  },
  details: {
    title: 'Patient Details',
    patientSection: 'Patient',
    orderSection: 'Order',
    age: 'Age',
    fullName: 'Full name',
    bloodGroup: 'Blood group',
    weight: 'Weight',
    height: 'Height',
    bmi: 'BMI',
    bloodPressure: 'Blood pressure',
    temperature: 'Temperature',
    tests: 'Tests',
    urgency: 'Urgency',
    culturalFlags: 'Cultural care preferences',
    noCulturalFlags: 'None recorded',
    loading: 'Loading…',
    unavailable: 'Unavailable',
    dataMinNote: 'The lab may see name, age, blood group, and basic vitals.',
    close: 'Close',
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

function interpolate(s: string, opts?: Record<string, unknown>): string {
  if (!opts) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in opts ? String(opts[k]) : `{${k}}`))
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string, opts?: Record<string, unknown>) => interpolate(resolveKey(key), opts)
    return t
  },
  useLocale: () => 'en',
}))

// OrderCard uses next/navigation's useRouter to route to the worklist once received.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Stub the on-demand detail-view fetch so PatientDetailsModal renders deterministically.
vi.mock('@/hooks/useOrderPatientDetails', () => ({
  useOrderPatientDetails: () => ({
    details: {
      fullName: { given: 'Ahmad', father: 'Marjan', grandfather: 'Qamar' },
      bloodGroup: 'A+',
      vitals: { weightKg: 77, heightCm: 170, bmi: 26.6, temperatureC: 37, bpSystolic: 101, bpDiastolic: 77, recordedAt: null },
    },
    loading: false,
  }),
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
  it('renders patient first name + age (bidi-isolated as separate fields)', () => {
    render(<OrderCard order={makeOrder()} />)
    // Name and age are now separate elements (a <bdi> + a span) so an RTL name
    // doesn't jumble with the LTR age — assert each independently.
    expect(screen.getByText('Ahmad')).toBeDefined()
    expect(screen.getByText('45y')).toBeDefined()
  })

  it('renders test names with LOINC codes', () => {
    render(<OrderCard order={makeOrder()} />)
    expect(screen.getByText(/CBC \(58410-2\), Cholesterol \(2093-3\)/)).toBeDefined()
  })

  it('is actionable — clicking opens the Receive Sample flow', () => {
    render(<OrderCard order={makeOrder()} />)
    const card = screen.getByRole('button', { name: /Receive sample for Ahmad/ })
    expect(card).toBeDefined()
  })

  it('shows the assigned-lab indicator', () => {
    render(<OrderCard order={makeOrder({ assignedToLab: true })} />)
    expect(screen.getByText('Assigned to you')).toBeDefined()
  })

  it('Patient Details button opens the details modal without triggering Receive Sample', async () => {
    const user = userEvent.setup()
    render(<OrderCard order={makeOrder()} />)
    await user.click(screen.getByRole('button', { name: 'Patient Details' }))
    // Details modal is shown...
    expect(screen.getByTestId('patient-details-modal')).toBeDefined()
    // ...and the click did NOT bubble to open the Receive Sample verification step.
    expect(screen.queryByTestId('patient-verification-form')).toBeNull()
  })

  it('Patient Details modal shows the permitted fields (full name, blood group, vitals, tests)', async () => {
    const user = userEvent.setup()
    render(<OrderCard order={makeOrder()} />)
    await user.click(screen.getByRole('button', { name: 'Patient Details' }))
    const modal = screen.getByTestId('patient-details-modal')
    expect(modal.textContent).toContain('Ahmad · Marjan · Qamar') // full name
    expect(modal.textContent).toContain('A+') // blood group
    expect(modal.textContent).toContain('77 kg') // weight
    expect(modal.textContent).toContain('45y') // age (from order)
    expect(modal.textContent).toContain('CBC (58410-2)') // order test
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
  it('renders empty state when no orders (loaded, no error)', () => {
    render(<OrdersWorklist orders={[]} loading={false} error={null} />)
    expect(screen.getByText('No test orders')).toBeDefined()
  })

  it('does NOT render empty state while still loading — stays in loading state', () => {
    render(<OrdersWorklist orders={[]} loading={true} error={null} />)
    // Must NOT show the genuine-empty text while loading
    expect(screen.queryByText('No test orders')).toBeNull()
    // Must show loading indicator
    const container = document.querySelector('[aria-busy="true"]')
    expect(container).not.toBeNull()
  })

  it('renders unavailable/error state (not "No test orders") when error and no data', () => {
    render(
      <OrdersWorklist
        orders={[]}
        loading={false}
        error="Hub unreachable — unable to load orders"
        onRefresh={() => {}}
      />,
    )
    // Must show the unavailable title — NOT the genuine-empty "No test orders"
    expect(screen.getByText('Unable to load orders')).toBeDefined()
    expect(screen.queryByText('No test orders')).toBeNull()
  })

  it('renders data (not unavailable) when error is set but cached orders exist', () => {
    const order = makeOrder()
    render(
      <OrdersWorklist
        orders={[order]}
        loading={false}
        error={null}
        onRefresh={() => {}}
      />,
    )
    expect(screen.queryByText('Unable to load orders')).toBeNull()
    expect(screen.queryByText('No test orders')).toBeNull()
    expect(screen.getByText('Ahmad')).toBeDefined()
  })

  it('renders a Retry button in the unavailable state that calls onRefresh', async () => {
    const mockRefresh = vi.fn()
    const user = userEvent.setup()
    render(
      <OrdersWorklist
        orders={[]}
        loading={false}
        error="Hub unreachable — unable to load orders"
        onRefresh={mockRefresh}
      />,
    )
    const retryBtn = screen.getByRole('button', { name: 'Retry' })
    await user.click(retryBtn)
    expect(mockRefresh).toHaveBeenCalledOnce()
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
