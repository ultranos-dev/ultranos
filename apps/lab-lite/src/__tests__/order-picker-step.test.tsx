/**
 * Tests for OrderPickerStep component:
 * - Renders orders from a mocked getOrders()
 * - Selecting an order invokes onOrderSelected with the correct { patient, orderId }
 * - "Upload without an order" button invokes onSkip
 * - Empty list shows the escape action via EmptyState
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LabOrderEntry } from '../lib/db'

// Mock next-intl — key-echo with simple param injection
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (!params) return key
    return Object.entries(params).reduce(
      (s, [k, v]) => s.replace(`{${k}}`, String(v)),
      key,
    )
  },
}))

// Mock @ultranos/ui-kit/icons
vi.mock('@ultranos/ui-kit/icons', () => ({
  ClipboardList: () => null,
  Inbox: () => null,
}))

// Mock EmptyState so we can see its action button
vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      {action && (
        <button type="button" onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  ),
}))

// Mock Button
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, type, className }: { children: React.ReactNode; onClick?: () => void; type?: string; className?: string }) => (
    <button type={(type ?? 'button') as 'button' | 'submit' | 'reset'} onClick={onClick} className={className}>{children}</button>
  ),
}))

const mockGetOrders = vi.fn()
vi.mock('@/lib/db', () => ({
  getOrders: (...args: unknown[]) => mockGetOrders(...args),
}))

function makeOrder(overrides: Partial<LabOrderEntry> = {}): LabOrderEntry {
  return {
    orderId: 'order-001',
    patientFirstName: 'Ahmad',
    patientAge: 34,
    patientRef: 'Patient/abc-opaque',
    testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
    urgency: 'routine',
    orderingPhysicianName: 'Dr. Hassan',
    specialInstructions: null,
    status: 'RECEIVED',
    authoredOn: '2026-09-01T08:00:00Z',
    receivedAt: '2026-09-01T09:00:00Z',
    syncedAt: '2026-09-01T09:05:00Z',
    ...overrides,
  }
}

// Import the component once — mocks are set up at module level
import { OrderPickerStep } from '../components/upload/OrderPickerStep'

describe('OrderPickerStep', () => {
  beforeEach(() => {
    mockGetOrders.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders orders returned by getOrders (RECEIVED and IN_PROGRESS only)', async () => {
    mockGetOrders.mockResolvedValue([
      makeOrder({ orderId: 'order-001', status: 'RECEIVED', patientFirstName: 'Ahmad' }),
      makeOrder({ orderId: 'order-002', status: 'IN_PROGRESS', patientFirstName: 'Sara' }),
      makeOrder({ orderId: 'order-003', status: 'COMPLETED', patientFirstName: 'Khalid' }), // filtered out
    ])

    render(<OrderPickerStep onOrderSelected={vi.fn()} onSkip={vi.fn()} />)

    await waitFor(() => {
      // Names appear in the list items
      expect(screen.queryAllByText(/Ahmad/).length).toBeGreaterThan(0)
      expect(screen.queryAllByText(/Sara/).length).toBeGreaterThan(0)
    })
    // COMPLETED orders are excluded
    expect(screen.queryByText(/Khalid/)).toBeNull()
  })

  it('selecting an order calls onOrderSelected with correct { patient, orderId }', async () => {
    const order = makeOrder({
      orderId: 'order-007',
      patientFirstName: 'Omar',
      patientAge: 28,
      patientRef: 'Patient/opaque-ref',
    })
    mockGetOrders.mockResolvedValue([order])

    const onOrderSelected = vi.fn()
    render(<OrderPickerStep onOrderSelected={onOrderSelected} onSkip={vi.fn()} />)

    // Wait for the list to load
    await waitFor(() => expect(screen.queryAllByText(/Omar/).length).toBeGreaterThan(0))

    // Click the order button (it's the first button in the list)
    const listItem = screen.getByRole('list').querySelectorAll('li')[0]!
    const orderBtn = within(listItem).getByRole('button')
    await userEvent.click(orderBtn)

    expect(onOrderSelected).toHaveBeenCalledOnce()
    expect(onOrderSelected).toHaveBeenCalledWith({
      patient: {
        patientRef: 'Patient/opaque-ref',
        patientFirstName: 'Omar',
        patientAge: 28,
      },
      orderId: 'order-007',
    })
  })

  it('"Upload without an order" (skip) button calls onSkip', async () => {
    mockGetOrders.mockResolvedValue([makeOrder()])
    const onSkip = vi.fn()
    render(<OrderPickerStep onOrderSelected={vi.fn()} onSkip={onSkip} />)

    await waitFor(() => expect(screen.queryAllByText(/Ahmad/).length).toBeGreaterThan(0))

    // The skip button text is the i18n key (mocked as key-echo)
    const skipBtn = screen.getByText('uploadWithoutOrder')
    await userEvent.click(skipBtn)

    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('empty list shows EmptyState with the escape action that calls onSkip', async () => {
    mockGetOrders.mockResolvedValue([])
    const onSkip = vi.fn()
    render(<OrderPickerStep onOrderSelected={vi.fn()} onSkip={onSkip} />)

    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeDefined())

    // EmptyState renders the action button; click it (may be multiple 'uploadWithoutOrder' buttons — pick the one inside empty-state)
    const emptyState = screen.getByTestId('empty-state')
    const actionBtn = within(emptyState).getByRole('button', { name: 'uploadWithoutOrder' })
    await userEvent.click(actionBtn)
    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('patientAge null displays as — in the order row', async () => {
    mockGetOrders.mockResolvedValue([makeOrder({ patientAge: null })])
    render(<OrderPickerStep onOrderSelected={vi.fn()} onSkip={vi.fn()} />)

    await waitFor(() => expect(screen.queryAllByText(/Ahmad/).length).toBeGreaterThan(0))
    // The age renders as literal '—' when null
    expect(screen.getByText(/—/)).toBeDefined()
  })
})
