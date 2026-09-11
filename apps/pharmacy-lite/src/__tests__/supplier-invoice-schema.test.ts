import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'
import type { SupplierInvoice } from '@/lib/procurement/types'

beforeEach(async () => { await db.supplierInvoices.clear() })

describe('supplier invoice schema v18', () => {
  it('DEFAULT_PHARMACY_SETTINGS includes invoiceMatchTolerancePercent = 0', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.invoiceMatchTolerancePercent).toBe(0)
  })
  it('supplierInvoices is queryable by purchaseOrderId and by [supplierId+invoiceNumber]', async () => {
    const inv: SupplierInvoice = {
      id: 'inv-1', invoiceNumber: 'SUP-77', purchaseOrderId: 'po-1', supplierId: 's1', supplierName: 'Acme',
      items: [], subtotal: 0, taxRate: 0, taxAmount: 0, freight: 0, total: 0, status: 'pending',
      createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    }
    await db.supplierInvoices.put(inv)
    expect((await db.supplierInvoices.where('purchaseOrderId').equals('po-1').toArray()).map((x) => x.id)).toEqual(['inv-1'])
    expect((await db.supplierInvoices.where('[supplierId+invoiceNumber]').equals(['s1', 'SUP-77']).first())?.id).toBe('inv-1')
  })
})
