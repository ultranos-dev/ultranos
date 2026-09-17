import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReorderReportPage } from '@/components/pharmacy/inventory/ReorderReportPage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const getReorderReport = vi.fn()
const generateReorderPurchaseOrders = vi.fn().mockResolvedValue([{ id: 'po1' }])
vi.mock('@/lib/procurement/reorder-service', () => ({
  getReorderReport: () => getReorderReport(),
  generateReorderPurchaseOrders: (...a: unknown[]) => generateReorderPurchaseOrders(...a),
}))
vi.mock('@/lib/procurement/supplier-service', () => ({ getActiveSuppliers: async () => [{ id: 'sup1', name: 'Acme' }, { id: 'sup2', name: 'Globex' }] }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: Object.assign((sel: (s: unknown) => unknown) => sel({ session: { userId: 'u1', practitionerId: 'u1' } }), { getState: () => ({ session: { userId: 'u1', practitionerId: 'u1' } }) }) }))
vi.mock('@/lib/db', () => ({ db: { pharmacySettings: { toCollection: () => ({ first: async () => ({ currency: 'AFN', currencyMinorUnits: 2 }) }) } } }))

beforeEach(() => { getReorderReport.mockReset(); generateReorderPurchaseOrders.mockClear() })

describe('ReorderReportPage', () => {
  it('renders a reorder line and generates draft POs for a line with a preferred supplier', async () => {
    getReorderReport.mockResolvedValue([
      { catalogItemId: 'c1', catalogItemName: 'Amoxicillin', onHand: 5, reorderPoint: 10, suggestedQty: 95, preferredSupplierId: 'sup1', preferredSupplierName: 'Acme', unitCost: 100 },
    ])
    render(<ReorderReportPage />)
    expect(await screen.findByText('Amoxicillin')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('generate-pos-btn'))
    await waitFor(() => expect(generateReorderPurchaseOrders).toHaveBeenCalled())
  })
  it('shows the empty state when nothing needs reordering', async () => {
    getReorderReport.mockResolvedValue([])
    render(<ReorderReportPage />)
    expect(await screen.findByText('empty')).toBeInTheDocument()
  })
  it('shows unavailable error state (not "nothing to reorder") when load fails', async () => {
    getReorderReport.mockRejectedValue(new Error('DB offline'))
    render(<ReorderReportPage />)
    // Error state must appear; the false-empty "empty" must NOT appear
    expect(await screen.findByTestId('reorder-error')).toBeInTheDocument()
    expect(screen.queryByText('empty')).not.toBeInTheDocument()
  })
})
