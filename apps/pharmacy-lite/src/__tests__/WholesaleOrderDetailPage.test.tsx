import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'o1' }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: { getState: () => ({ getPractitionerRef: () => 'Practitioner/p1' }) } }))

const order = {
  id: 'o1',
  orderNumber: 'SO-1',
  customerId: 'c1',
  status: 'confirmed',
  lines: [{ catalogItemId: 'i1', description: 'Amox', unit: 'each', quantity: 30, unitPrice: 10, lineTotal: 300, baseUnits: 30, batchAllocations: [] }],
  subtotal: 300,
  taxRate: 0,
  taxAmount: 0,
  total: 300,
  createdBy: 'u1',
  createdAt: '',
  hlcTimestamp: '0',
}

const mockGet = vi.fn().mockResolvedValue(order)
const mockPick = vi.fn().mockResolvedValue({
  ...order,
  status: 'picking',
  lines: [{ ...order.lines[0], batchAllocations: [{ stockBatchId: 'b1', qty: 30 }], shortStock: false }],
})
const mockFulfill = vi.fn().mockResolvedValue(undefined)
const mockCancel = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/wholesale/sales-order-service', () => ({
  getOrderById: () => mockGet(),
  pickOrder: () => mockPick(),
  fulfill: (...a: unknown[]) => mockFulfill(...a),
  cancel: vi.fn(() => mockCancel()),
}))

vi.mock('@/lib/db', () => ({
  db: {
    pharmacySettings: {
      toCollection: () => ({ first: vi.fn().mockResolvedValue({ currency: 'AFN', currencyMinorUnits: 2 }) }),
    },
  },
}))

import { OrderDetailPage } from '@/components/pharmacy/wholesale/OrderDetailPage'

beforeEach(() => { vi.clearAllMocks() })

describe('OrderDetailPage', () => {
  it('picks then fulfils the order', async () => {
    const user = userEvent.setup()
    render(<OrderDetailPage />)
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())
    await user.click(screen.getByTestId('pick-btn'))
    await waitFor(() => expect(screen.getByTestId('fulfil-btn')).toBeEnabled())
    await user.click(screen.getByTestId('fulfil-btn'))
    expect(mockFulfill).toHaveBeenCalledWith('o1', 'Practitioner/p1')
  })

  it('renders a full-width h1 heading with order number', async () => {
    render(<OrderDetailPage />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('SO-1')
  })

  it('renders the back button with w-fit', async () => {
    render(<OrderDetailPage />)
    const backBtn = screen.getByTestId('back-button')
    expect(backBtn).toBeInTheDocument()
    expect(backBtn.className).toMatch(/w-fit/)
  })

  it('shows pick-btn when status is confirmed and hides fulfil-btn initially', async () => {
    render(<OrderDetailPage />)
    await waitFor(() => expect(screen.getByTestId('pick-btn')).toBeInTheDocument())
    expect(screen.queryByTestId('fulfil-btn')).not.toBeInTheDocument()
  })

  it('shows batch allocations after picking', async () => {
    const user = userEvent.setup()
    render(<OrderDetailPage />)
    await waitFor(() => expect(screen.getByTestId('pick-btn')).toBeInTheDocument())
    await user.click(screen.getByTestId('pick-btn'))
    await waitFor(() => expect(screen.getByText(/b1/i)).toBeInTheDocument())
  })

  it('shows cancel button for non-fulfilled orders', async () => {
    render(<OrderDetailPage />)
    await waitFor(() => expect(screen.getByTestId('cancel-btn')).toBeInTheDocument())
  })

  it('LTR snapshot', async () => {
    const { container } = render(
      <div dir="ltr">
        <OrderDetailPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('RTL snapshot', async () => {
    const { container } = render(
      <div dir="rtl">
        <OrderDetailPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('fulfil-btn is enabled when no lines are short-stock', async () => {
    // mockPick returns shortStock:false — fulfil should be enabled after picking
    const user = userEvent.setup()
    render(<OrderDetailPage />)
    await waitFor(() => expect(screen.getByTestId('pick-btn')).toBeInTheDocument())
    await user.click(screen.getByTestId('pick-btn'))
    await waitFor(() => expect(screen.getByTestId('fulfil-btn')).toBeEnabled())
    expect(screen.queryByTestId('short-stock-notice')).not.toBeInTheDocument()
  })

  it('fulfil-btn is disabled and short-stock notice shown when a line has shortStock:true', async () => {
    const user = userEvent.setup()
    // Override mockPick to return a short-stock line
    mockPick.mockResolvedValueOnce({
      ...order,
      status: 'picking',
      lines: [{
        ...order.lines[0],
        batchAllocations: [{ stockBatchId: 'b1', qty: 10 }],
        shortStock: true,
      }],
    })
    render(<OrderDetailPage />)
    await waitFor(() => expect(screen.getByTestId('pick-btn')).toBeInTheDocument())
    await user.click(screen.getByTestId('pick-btn'))
    await waitFor(() => expect(screen.getByTestId('fulfil-btn')).toBeInTheDocument())
    expect(screen.getByTestId('fulfil-btn')).toBeDisabled()
    expect(screen.getByTestId('short-stock-notice')).toBeInTheDocument()
    expect(screen.getByTestId('short-stock-line-i1')).toBeInTheDocument()
  })
})
