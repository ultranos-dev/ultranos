import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { ProcurementAuditPage } from '@/components/pharmacy/procurement/ProcurementAuditPage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const getProcurementAuditEvents = vi.fn()
vi.mock('@/lib/procurement/audit', async (orig) => ({
  ...(await orig<typeof import('@/lib/procurement/audit')>()),
  getProcurementAuditEvents: () => getProcurementAuditEvents(),
}))

beforeEach(() => getProcurementAuditEvents.mockReset())

describe('ProcurementAuditPage', () => {
  it('renders an audit row with its reference + action label', async () => {
    getProcurementAuditEvents.mockResolvedValue([
      { id: '1', actorId: 'u1', action: AuditAction.PO_CREATED, resourceType: AuditResourceType.PURCHASE_ORDER, resourceId: 'po1', hlcTimestamp: '2026-01-01T00:00:00.000Z', metadata: { poNumber: 'PO-2026-0001' }, queuedAt: '', status: 'synced' },
    ])
    render(<ProcurementAuditPage />)
    expect(await screen.findByText('PO-2026-0001')).toBeInTheDocument()
    const tbody = document.querySelector('tbody')!
    expect(within(tbody).getByText('actionPoCreated')).toBeInTheDocument()
  })
  it('renders a QC hold event with its batch number + QC action label', async () => {
    getProcurementAuditEvents.mockResolvedValue([
      { id: '1', actorId: 'u1', action: AuditAction.BATCH_QC_HELD, resourceType: AuditResourceType.STOCK_BATCH, resourceId: 'batch1', hlcTimestamp: '2026-01-01T00:00:00.000Z', metadata: { batchNumber: 'B-2026-777' }, queuedAt: '', status: 'synced' },
    ])
    render(<ProcurementAuditPage />)
    expect(await screen.findByText('B-2026-777')).toBeInTheDocument()
    const tbody = document.querySelector('tbody')!
    expect(within(tbody).getByText('actionBatchQcHeld')).toBeInTheDocument()
    expect(within(tbody).getByText('resourceStockBatch')).toBeInTheDocument()
  })
  it('shows the empty state when there are no events', async () => {
    getProcurementAuditEvents.mockResolvedValue([])
    render(<ProcurementAuditPage />)
    expect(await screen.findByText('empty')).toBeInTheDocument()
  })
})
