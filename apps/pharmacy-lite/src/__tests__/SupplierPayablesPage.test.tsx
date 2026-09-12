import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SupplierPayablesPage } from '@/components/pharmacy/procurement/SupplierPayablesPage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const getSupplierPayables = vi.fn()
vi.mock('@/lib/procurement/supplier-account-service', () => ({ getSupplierPayables: () => getSupplierPayables() }))
vi.mock('@/lib/db', () => ({ db: { pharmacySettings: { toCollection: () => ({ first: async () => ({ currency: 'AFN', currencyMinorUnits: 2 }) }) } } }))

beforeEach(() => getSupplierPayables.mockReset())

describe('SupplierPayablesPage', () => {
  it('renders a supplier row with outstanding', async () => {
    getSupplierPayables.mockResolvedValue([
      { supplierId: 's1', supplierName: 'Acme', outstanding: 150000, aging: { current: 150000, thirtyDay: 0, sixtyDay: 0, ninetyPlus: 0 }, oldestDueDate: '2026-01-01', invoiceCount: 2 },
    ])
    render(<SupplierPayablesPage />)
    expect(await screen.findByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('AFN 1500.00')).toBeInTheDocument()
  })

  it('shows the empty state when nothing is owed', async () => {
    getSupplierPayables.mockResolvedValue([])
    render(<SupplierPayablesPage />)
    expect(await screen.findByText('noBalances')).toBeInTheDocument()
  })
})
