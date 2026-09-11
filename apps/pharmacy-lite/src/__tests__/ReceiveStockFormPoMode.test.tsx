import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { ReceiveStockForm } from '@/components/pharmacy/inventory/ReceiveStockForm'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import type { CatalogItem } from '@/lib/inventory/types'

const ITEM: CatalogItem = { id: 'a', name: 'Paracetamol', form: 'tablet', strength: '500', strengthUnit: 'mg',
  packSize: 20, category: 'analgesic', defaultSellingPrice: 500, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

async function seedPO() {
  await db.catalogItems.put(ITEM)
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1',
    items: [{ catalogItemId: 'a', catalogItemName: 'Paracetamol', quantityOrdered: 10, unitCost: 300 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  return po
}

beforeEach(async () => { for (const t of [db.catalogItems, db.purchaseOrders, db.syncQueue]) await t.clear() })

describe('ReceiveStockForm PO mode', () => {
  it('pre-fills a line per PO item and hides the add-item search', async () => {
    const po = await seedPO()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ReceiveStockForm locationId="default" currencyMinorUnits={2} purchaseOrderId={po.id} onComplete={() => {}} />
      </NextIntlClientProvider>,
    )
    await waitFor(() => expect(screen.getByText('Paracetamol')).toBeInTheDocument())
    expect(screen.getByTestId('receive-item-0')).toBeInTheDocument()
    // Add-item search hidden in PO mode
    expect(screen.queryByTestId('catalog-search-input')).not.toBeInTheDocument()
  })
})
