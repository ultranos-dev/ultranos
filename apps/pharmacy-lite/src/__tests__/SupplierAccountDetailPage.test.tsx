import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { SupplierAccountDetailPage } from '@/components/pharmacy/procurement/SupplierAccountDetailPage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ supplierId: 's1' }) }))
const getSupplierAccount = vi.fn()
const recordSupplierPayment = vi.fn().mockResolvedValue({ id: 'p1' })
const voidSupplierPayment = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/procurement/supplier-account-service', () => ({ getSupplierAccount: () => getSupplierAccount() }))
vi.mock('@/lib/procurement/supplier-payment-service', () => ({
  recordSupplierPayment: (...a: unknown[]) => recordSupplierPayment(...a),
  voidSupplierPayment: (...a: unknown[]) => voidSupplierPayment(...a),
}))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: { getState: () => ({ session: { userId: 'u1', practitionerId: 'pr1' } }) } }))
vi.mock('@/lib/db', () => ({ db: { pharmacySettings: { toCollection: () => ({ first: async () => ({ currency: 'AFN', currencyMinorUnits: 2 }) }) } } }))

beforeEach(() => {
  getSupplierAccount.mockReset(); recordSupplierPayment.mockClear()
  getSupplierAccount.mockResolvedValue({
    supplierId: 's1', supplierName: 'Acme', outstanding: 100000,
    aging: { current: 100000, thirtyDay: 0, sixtyDay: 0, ninetyPlus: 0 },
    invoices: [{ id: 'i1', invoiceNumber: 'S1', total: 100000, amountPaid: 0, settlementStatus: 'unpaid', dueDate: '2026-01-01', supplierId: 's1', supplierName: 'Acme', status: 'approved', items: [], subtotal: 100000, taxRate: 0, taxAmount: 0, freight: 0, createdBy: 'u', createdAt: 'h', hlcTimestamp: 'h' }],
    payments: [],
  })
})

describe('SupplierAccountDetailPage', () => {
  it('renders outstanding and opens a payment dialog with a FIFO preview', async () => {
    render(<SupplierAccountDetailPage />)
    expect(await screen.findByText('Acme')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('open-record-payment'))
    fireEvent.change(screen.getByTestId('payment-amount'), { target: { value: '500' } })
    // 50000 minor units allocated to S1 → preview shows the invoice number inside the dialog
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/S1/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-payment'))
    await waitFor(() => expect(recordSupplierPayment).toHaveBeenCalled())
  })
})
