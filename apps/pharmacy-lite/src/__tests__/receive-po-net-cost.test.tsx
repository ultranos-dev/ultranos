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

beforeEach(async () => { for (const t of [db.catalogItems, db.purchaseOrders, db.pharmacySettings, db.syncQueue]) await t.clear(); await db.catalogItems.put(ITEM) })

describe('ReceiveStockForm PO-mode net unit cost', () => {
  it('prefills the line cost with the PO net unit cost (after line discount)', async () => {
    const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1',
      items: [{ catalogItemId: 'a', catalogItemName: 'Paracetamol', quantityOrdered: 10, unitCost: 100, discountType: 'percent', discountValue: 10 }] })
    await markPurchaseOrderSent(po.id, 'u1')

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ReceiveStockForm locationId="default" currencyMinorUnits={2} purchaseOrderId={po.id} onComplete={() => {}} />
      </NextIntlClientProvider>,
    )
    // net unit cost = (1000 - 10%) / 10 = 90 minor units = 0.90 major
    const costInput = await waitFor(() => screen.getByTestId('receive-item-0').querySelector('#cost-0') as HTMLInputElement)
    expect(costInput.value).toBe('0.90')
  })
})
