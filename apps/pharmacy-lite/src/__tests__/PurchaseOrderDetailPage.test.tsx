import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks — must be at top level before any imports of the component
// ---------------------------------------------------------------------------

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ id: 'po-detail-001' }),
}))

const mockGetPurchaseOrderById = vi.fn()
const mockMarkPurchaseOrderSent = vi.fn()
const mockCancelPurchaseOrder = vi.fn()

vi.mock('@/lib/procurement/purchase-order-service', () => ({
  getPurchaseOrderById: (...a: unknown[]) => mockGetPurchaseOrderById(...a),
  markPurchaseOrderSent: (...a: unknown[]) => mockMarkPurchaseOrderSent(...a),
  cancelPurchaseOrder: (...a: unknown[]) => mockCancelPurchaseOrder(...a),
}))

const mockPharmacySettingsFirst = vi.fn()
const mockGoodReceiptsWhere = vi.fn().mockReturnValue({ equals: () => ({ toArray: () => Promise.resolve([]) }) })
vi.mock('@/lib/db', () => ({
  db: {
    pharmacySettings: {
      toCollection: () => ({ first: () => mockPharmacySettingsFirst() }),
    },
    goodsReceipts: {
      where: (...a: unknown[]) => mockGoodReceiptsWhere(...a),
    },
  },
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import { PurchaseOrderDetailPage } from '@/components/pharmacy/procurement/PurchaseOrderDetailPage'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const DRAFT_PO = {
  id: 'po-detail-001',
  supplierId: 's1',
  supplierName: 'Kabul Medical Supplies',
  status: 'draft' as const,
  items: [
    {
      catalogItemId: 'cat-1',
      catalogItemName: 'Amoxicillin 500mg',
      quantityOrdered: 10,
      quantityReceived: 0,
      unitCost: 1000, // minor units (10.00 AFN)
    },
  ],
  totalCost: 10000,
  createdBy: 'Practitioner/p1',
  createdAt: '2026-09-08T10:00:00Z',
  hlcTimestamp: '0',
}

const SENT_PO = {
  ...DRAFT_PO,
  status: 'sent' as const,
  sentAt: '2026-09-08T11:00:00Z',
}

const PARTIALLY_RECEIVED_PO = {
  ...DRAFT_PO,
  status: 'partially_received' as const,
  sentAt: '2026-09-08T11:00:00Z',
  items: [
    {
      catalogItemId: 'cat-1',
      catalogItemName: 'Amoxicillin 500mg',
      quantityOrdered: 10,
      quantityReceived: 3,
      unitCost: 1000,
    },
  ],
}

const CLOSED_PO = {
  ...DRAFT_PO,
  status: 'closed' as const,
  sentAt: '2026-09-08T11:00:00Z',
  closedAt: '2026-09-09T09:00:00Z',
}

const CANCELLED_PO = {
  ...DRAFT_PO,
  status: 'cancelled' as const,
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockPharmacySettingsFirst.mockResolvedValue({ currency: 'AFN', currencyMinorUnits: 2 })
  mockGetPurchaseOrderById.mockResolvedValue(DRAFT_PO)
  mockMarkPurchaseOrderSent.mockResolvedValue(undefined)
  mockCancelPurchaseOrder.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PurchaseOrderDetailPage', () => {
  // -------------------------------------------------------------------------
  // Basic rendering — draft PO
  // -------------------------------------------------------------------------

  it('renders back button with w-fit class', async () => {
    render(<PurchaseOrderDetailPage />)
    const backBtn = await screen.findByTestId('back-button')
    expect(backBtn).toBeInTheDocument()
    expect(backBtn.className).toMatch(/w-fit/)
  })

  it('back button navigates to /inventory/orders', async () => {
    const user = userEvent.setup()
    render(<PurchaseOrderDetailPage />)
    const backBtn = await screen.findByTestId('back-button')
    await user.click(backBtn)
    expect(mockPush).toHaveBeenCalledWith('/inventory/orders')
  })

  it('renders the supplier name in the h1', async () => {
    render(<PurchaseOrderDetailPage />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument(),
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Kabul Medical Supplies',
    )
  })

  it('renders the status badge for a draft PO', async () => {
    render(<PurchaseOrderDetailPage />)
    // i18n mock returns key string: statusDraft
    await waitFor(() => expect(screen.getByText('statusDraft')).toBeInTheDocument())
  })

  it('renders item name, quantityOrdered, quantityReceived, and formatted unit cost', async () => {
    render(<PurchaseOrderDetailPage />)
    await waitFor(() => {
      expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument()
    })
    // quantityOrdered
    expect(screen.getByTestId('item-ordered-cat-1').textContent).toBe('10')
    // quantityReceived
    expect(screen.getByTestId('item-received-cat-1').textContent).toBe('0')
    // unit cost — 1000 minor units at 2dp = 10.00 AFN
    expect(screen.getByTestId('item-unitcost-cat-1').textContent).toContain('10.00')
  })

  it('renders the totalCost formatted via formatAmount', async () => {
    render(<PurchaseOrderDetailPage />)
    // totalCost = 10000 minor units = 100.00 AFN
    // May appear in both the info card and the items line total column
    await waitFor(() => {
      const els = screen.getAllByText('AFN 100.00')
      expect(els.length).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // Status-driven actions — draft
  // -------------------------------------------------------------------------

  it('shows Mark sent and Cancel buttons for draft PO', async () => {
    render(<PurchaseOrderDetailPage />)
    await waitFor(() => expect(screen.getByTestId('mark-sent-btn')).toBeInTheDocument())
    expect(screen.getByTestId('cancel-btn')).toBeInTheDocument()
    // No receive link for draft
    expect(screen.queryByTestId('receive-against-po-link')).not.toBeInTheDocument()
  })

  it('calls markPurchaseOrderSent(id) when Mark sent is clicked and reloads', async () => {
    const sentPO = { ...DRAFT_PO, status: 'sent' as const, sentAt: '2026-09-08T12:00:00Z' }
    // First call returns draft, second call (reload) returns sent
    mockGetPurchaseOrderById.mockResolvedValueOnce(DRAFT_PO).mockResolvedValueOnce(sentPO)
    const user = userEvent.setup()
    render(<PurchaseOrderDetailPage />)
    const btn = await screen.findByTestId('mark-sent-btn')
    await user.click(btn)
    await waitFor(() => {
      expect(mockMarkPurchaseOrderSent).toHaveBeenCalledWith('po-detail-001', 'unknown')
    })
    // After reload the status badge should update to sent
    await waitFor(() => expect(screen.getByText('statusSent')).toBeInTheDocument())
  })

  it('calls cancelPurchaseOrder(id) when Cancel is clicked for draft', async () => {
    const cancelledPO = { ...DRAFT_PO, status: 'cancelled' as const }
    mockGetPurchaseOrderById.mockResolvedValueOnce(DRAFT_PO).mockResolvedValueOnce(cancelledPO)
    const user = userEvent.setup()
    render(<PurchaseOrderDetailPage />)
    const btn = await screen.findByTestId('cancel-btn')
    await user.click(btn)
    await waitFor(() => {
      expect(mockCancelPurchaseOrder).toHaveBeenCalledWith('po-detail-001', 'unknown')
    })
    await waitFor(() => expect(screen.getByText('statusCancelled')).toBeInTheDocument())
  })

  // -------------------------------------------------------------------------
  // Status-driven actions — sent
  // -------------------------------------------------------------------------

  it('shows receive-against-PO link and Cancel for sent PO', async () => {
    mockGetPurchaseOrderById.mockResolvedValue(SENT_PO)
    render(<PurchaseOrderDetailPage />)
    await waitFor(() => expect(screen.getByTestId('receive-against-po-link')).toBeInTheDocument())
    expect(screen.getByTestId('cancel-btn')).toBeInTheDocument()
    // No mark-sent button
    expect(screen.queryByTestId('mark-sent-btn')).not.toBeInTheDocument()
  })

  it('shows receive-against-PO link for partially_received PO', async () => {
    mockGetPurchaseOrderById.mockResolvedValue(PARTIALLY_RECEIVED_PO)
    render(<PurchaseOrderDetailPage />)
    await waitFor(() => expect(screen.getByTestId('receive-against-po-link')).toBeInTheDocument())
  })

  // -------------------------------------------------------------------------
  // Read-only states — closed, cancelled
  // -------------------------------------------------------------------------

  it('renders no action buttons for closed PO', async () => {
    mockGetPurchaseOrderById.mockResolvedValue(CLOSED_PO)
    render(<PurchaseOrderDetailPage />)
    await waitFor(() => expect(screen.getByText('statusClosed')).toBeInTheDocument())
    expect(screen.queryByTestId('mark-sent-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('receive-against-po-link')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cancel-btn')).not.toBeInTheDocument()
  })

  it('renders no action buttons for cancelled PO', async () => {
    mockGetPurchaseOrderById.mockResolvedValue(CANCELLED_PO)
    render(<PurchaseOrderDetailPage />)
    await waitFor(() => expect(screen.getByText('statusCancelled')).toBeInTheDocument())
    expect(screen.queryByTestId('mark-sent-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('receive-against-po-link')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cancel-btn')).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Not found state
  // -------------------------------------------------------------------------

  it('renders not-found empty state when getPurchaseOrderById returns undefined', async () => {
    mockGetPurchaseOrderById.mockResolvedValue(undefined)
    render(<PurchaseOrderDetailPage />)
    // i18n mock returns key string: detailNotFound
    await waitFor(() => expect(screen.getByText('detailNotFound')).toBeInTheDocument())
  })

  // -------------------------------------------------------------------------
  // Receipt tracking note
  // -------------------------------------------------------------------------

  it('renders receipt tracking note when PO is actionable (sent)', async () => {
    mockGetPurchaseOrderById.mockResolvedValue(SENT_PO)
    render(<PurchaseOrderDetailPage />)
    // i18n key: receiptTrackingNote
    await waitFor(() => expect(screen.getByText('receiptTrackingNote')).toBeInTheDocument())
  })

  // -------------------------------------------------------------------------
  // Snapshots — LTR + RTL
  // -------------------------------------------------------------------------

  it('LTR snapshot', async () => {
    const { container } = render(
      <div dir="ltr">
        <PurchaseOrderDetailPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('RTL snapshot', async () => {
    const { container } = render(
      <div dir="rtl">
        <PurchaseOrderDetailPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })
})
