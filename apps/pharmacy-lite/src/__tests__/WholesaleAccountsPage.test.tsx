import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const mockAccounts = vi.fn().mockResolvedValue([{ id: 'a1', customerId: 'c1', balance: 3000, lastActivityAt: '' }])
const mockPay = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/wholesale/customer-account-service', () => ({ getAccountsWithBalance: () => mockAccounts(), recordPayment: (...a: unknown[]) => mockPay(...a), getAgingBuckets: vi.fn().mockResolvedValue({ current: 3000, thirtyDay: 0, sixtyDay: 0, ninetyPlus: 0 }) }))
vi.mock('@/lib/wholesale/customer-service', () => ({ getAllCustomers: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Kabul Pharma', isActive: true, createdAt: '' }]) }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: { getState: () => ({ getPractitionerRef: () => 'Practitioner/p1' }) } }))
import { AccountsPage } from '@/components/pharmacy/wholesale/AccountsPage'
beforeEach(() => { vi.clearAllMocks() })
describe('AccountsPage', () => {
  it('lists balances and records a payment', async () => {
    const user = userEvent.setup()
    render(<AccountsPage />)
    await waitFor(() => expect(screen.getByText('Kabul Pharma')).toBeInTheDocument())
    await user.click(screen.getByTestId('record-payment-c1'))
    await user.type(screen.getByTestId('payment-amount'), '20.00')
    await user.click(screen.getByTestId('confirm-payment'))
    expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c1', amount: 2000 }))
  })

  it('shows empty state when there are no outstanding accounts', async () => {
    mockAccounts.mockResolvedValueOnce([])
    render(<AccountsPage />)
    await waitFor(() => {
      expect(screen.getByText('accountsNoBalances')).toBeInTheDocument()
    })
  })

  it('renders the h1 heading', async () => {
    render(<AccountsPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('LTR snapshot', async () => {
    const { container } = render(
      <div dir="ltr">
        <AccountsPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Kabul Pharma')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('RTL snapshot', async () => {
    const { container } = render(
      <div dir="rtl">
        <AccountsPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Kabul Pharma')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })
})
