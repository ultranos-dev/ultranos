import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PurchaseOrderDetailPage } from '@/components/pharmacy/procurement/PurchaseOrderDetailPage'

// ---------------------------------------------------------------------------
// Mocks — must be at top level before any imports of the component
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'po1' }),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (sel: (s: unknown) => unknown) =>
      sel({ session: { userId: 'approver', practitionerId: 'approver' } }),
    {
      getState: () => ({ session: { userId: 'approver', practitionerId: 'approver' } }),
    },
  ),
}))

const getPurchaseOrderById = vi.fn()
const approvePurchaseOrder = vi.fn().mockResolvedValue(undefined)
const submitPurchaseOrderForApproval = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/procurement/purchase-order-service', () => ({
  getPurchaseOrderById: () => getPurchaseOrderById(),
  markPurchaseOrderSent: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
  submitPurchaseOrderForApproval: (...a: unknown[]) => submitPurchaseOrderForApproval(...a),
  approvePurchaseOrder: (...a: unknown[]) => approvePurchaseOrder(...a),
  rejectPurchaseOrder: vi.fn().mockResolvedValue(undefined),
  SelfApprovalError: class extends Error {
    constructor() { super('self approval'); this.name = 'SelfApprovalError' }
  },
  ApprovalRequiredError: class extends Error {
    constructor() { super('approval required'); this.name = 'ApprovalRequiredError' }
  },
}))

vi.mock('@/lib/inventory/goods-receipt-reversal', () => ({
  reverseGoodsReceipt: vi.fn(),
  ReceiptNotReversibleError: class extends Error {},
}))

vi.mock('@/lib/db', () => ({
  db: {
    pharmacySettings: {
      toCollection: () => ({
        first: async () => ({
          currency: 'AFN',
          currencyMinorUnits: 2,
          poApprovalThreshold: 500,
        }),
      }),
    },
    goodsReceipts: {
      where: () => ({ equals: () => ({ toArray: async () => [] }) }),
    },
  },
}))

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const basePo = {
  id: 'po1',
  poNumber: 'PO-1',
  supplierId: 's1',
  supplierName: 'Acme',
  items: [],
  totalCost: 1000,
  createdBy: 'creator',
  createdAt: '2026-09-12T10:00:00Z',
  hlcTimestamp: 'h',
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  getPurchaseOrderById.mockReset()
  approvePurchaseOrder.mockClear()
  submitPurchaseOrderForApproval.mockClear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PO detail approval actions', () => {
  it('pending_approval + not creator → Approve button calls approvePurchaseOrder', async () => {
    // performedBy = 'approver', createdBy = 'creator' → isSelf = false → button enabled
    // totalCost = 1000, threshold = 500 → needsApproval = true (irrelevant for pending_approval)
    getPurchaseOrderById.mockResolvedValue({ ...basePo, status: 'pending_approval' })
    render(<PurchaseOrderDetailPage />)
    const btn = await screen.findByTestId('approve-po-btn')
    expect(btn).toBeInTheDocument()
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    await waitFor(() =>
      expect(approvePurchaseOrder).toHaveBeenCalledWith('po1', 'approver'),
    )
  })

  it('draft over threshold → shows Submit for approval button', async () => {
    // totalCost = 1000 >= threshold 500 → needsApproval = true → submit-approval-btn
    getPurchaseOrderById.mockResolvedValue({ ...basePo, status: 'draft' })
    render(<PurchaseOrderDetailPage />)
    expect(await screen.findByTestId('submit-approval-btn')).toBeInTheDocument()
    // mark-sent-btn must NOT appear
    expect(screen.queryByTestId('mark-sent-btn')).not.toBeInTheDocument()
  })

  it('pending_approval + not creator → Reject button is present', async () => {
    getPurchaseOrderById.mockResolvedValue({ ...basePo, status: 'pending_approval' })
    render(<PurchaseOrderDetailPage />)
    expect(await screen.findByTestId('reject-po-btn')).toBeInTheDocument()
  })

  it('pending_approval + creator (isSelf) → Approve and Reject buttons are disabled', async () => {
    // performedBy = 'approver', createdBy = 'approver' → isSelf = true
    getPurchaseOrderById.mockResolvedValue({ ...basePo, status: 'pending_approval', createdBy: 'approver' })
    render(<PurchaseOrderDetailPage />)
    const approveBtn = await screen.findByTestId('approve-po-btn')
    expect(approveBtn).toBeDisabled()
    const rejectBtn = screen.getByTestId('reject-po-btn')
    expect(rejectBtn).toBeDisabled()
  })

  it('submit-approval-btn click calls submitPurchaseOrderForApproval', async () => {
    getPurchaseOrderById.mockResolvedValue({ ...basePo, status: 'draft' })
    render(<PurchaseOrderDetailPage />)
    const btn = await screen.findByTestId('submit-approval-btn')
    fireEvent.click(btn)
    await waitFor(() =>
      expect(submitPurchaseOrderForApproval).toHaveBeenCalledWith('po1', 'approver'),
    )
  })

  it('reject confirm flow — input + confirm button appear on Reject click', async () => {
    getPurchaseOrderById.mockResolvedValue({ ...basePo, status: 'pending_approval' })
    render(<PurchaseOrderDetailPage />)
    const rejectBtn = await screen.findByTestId('reject-po-btn')
    fireEvent.click(rejectBtn)
    expect(await screen.findByTestId('reject-reason-input')).toBeInTheDocument()
    expect(screen.getByTestId('reject-confirm-btn')).toBeInTheDocument()
  })
})
