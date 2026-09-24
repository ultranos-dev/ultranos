import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { createInvoiceFromDispense } from '../lib/pos/invoice-service'
import { computePoTotals } from '../lib/procurement/po-totals'
import type { InvoiceLineItem } from '../lib/pos/types'

// Story 62.1 (C-PHARM-2): the 100× tax bug. POS used to compute tax as a
// FRACTION (subtotal * taxRate) while procurement/wholesale used PERCENT
// ((subtotal * taxRate)/100) — feeding the SAME pharmacySettings.taxRate into
// both produced a 100× divergence. These tests lock the single PERCENT
// convention across all three domains.

// Encryption key isn't set up in unit tests; buildEncryptedSyncEntry falls back
// to an 'awaiting-key' entry with the raw payload — fine for these assertions.

/** The wholesale sales-order tax formula (sales-order-service.ts) — pure. */
function wholesaleTaxAmount(subtotal: number, taxRate: number): number {
  return Math.round((subtotal * taxRate) / 100)
}

describe('taxRate convention — cross-domain (Story 62.1 / C-PHARM-2)', () => {
  beforeEach(async () => {
    await db.invoices.clear()
    await db.syncQueue.clear()
  })
  afterEach(async () => {
    await db.invoices.clear()
    await db.syncQueue.clear()
    vi.restoreAllMocks()
  })

  it('same settings value → identical tax in POS, procurement, and wholesale', async () => {
    const taxRate = 10 // 10 percent — the ONE convention
    const subtotal = 10_000 // 100.00 in minor units

    // POS
    const items: InvoiceLineItem[] = [
      {
        catalogItemId: 'cat-1',
        stockBatchId: 'batch-1',
        description: 'tablet 500mg',
        quantity: 1,
        unitPrice: subtotal,
        lineTotal: subtotal,
      },
    ]
    const invoice = await createInvoiceFromDispense({
      dispenseIds: ['d1'],
      items,
      taxRate,
      createdBy: 'Practitioner/p1',
      hlcTimestamp: '2026-09-24T00:00:00.000Z-0000-node',
      prefix: 'INV-',
    })

    // Procurement
    const po = computePoTotals(
      [{ catalogItemId: 'cat-1', catalogItemName: 'X', quantityOrdered: 1, unitCost: subtotal }],
      taxRate,
      0,
    )

    // Wholesale
    const wholesale = wholesaleTaxAmount(subtotal, taxRate)

    expect(invoice.taxAmount).toBe(1_000) // 10% of 100.00 = 10.00
    expect(po.taxAmount).toBe(1_000)
    expect(wholesale).toBe(1_000)
    expect(invoice.taxAmount).toBe(po.taxAmount)
    expect(invoice.taxAmount).toBe(wholesale)
  })

  it('POS invoice stamps taxRateConvention = "percent" on new invoices', async () => {
    const invoice = await createInvoiceFromDispense({
      dispenseIds: ['d1'],
      items: [
        {
          catalogItemId: 'cat-1',
          stockBatchId: 'batch-1',
          description: 'x',
          quantity: 1,
          unitPrice: 5_000,
          lineTotal: 5_000,
        },
      ],
      taxRate: 5,
      createdBy: 'Practitioner/p1',
      hlcTimestamp: '2026-09-24T00:00:00.000Z-0000-node',
      prefix: 'INV-',
    })
    expect(invoice.taxRateConvention).toBe('percent')
    expect(invoice.taxAmount).toBe(250) // 5% of 50.00 = 2.50
  })

  it('integer minor-unit discipline: tax is always a rounded integer (no floats)', async () => {
    // 8.5% of 3.33 → 0.28305 → rounds to 28 minor units.
    const invoice = await createInvoiceFromDispense({
      dispenseIds: ['d1'],
      items: [
        {
          catalogItemId: 'cat-1',
          stockBatchId: 'batch-1',
          description: 'x',
          quantity: 1,
          unitPrice: 333,
          lineTotal: 333,
        },
      ],
      taxRate: 8.5,
      createdBy: 'Practitioner/p1',
      hlcTimestamp: '2026-09-24T00:00:00.000Z-0000-node',
      prefix: 'INV-',
    })
    expect(Number.isInteger(invoice.taxAmount)).toBe(true)
    expect(invoice.taxAmount).toBe(Math.round((333 * 8.5) / 100))
    expect(invoice.total).toBe(invoice.subtotal + invoice.taxAmount)
  })

  it('property: POS tax matches procurement tax for many random subtotals/rates', async () => {
    for (let i = 0; i < 50; i++) {
      const subtotal = Math.floor(Math.random() * 1_000_000) + 1
      const taxRate = Math.floor(Math.random() * 300) / 10 // 0.0–30.0 percent
      const posTax = Math.round((subtotal * taxRate) / 100)
      const po = computePoTotals(
        [{ catalogItemId: 'c', catalogItemName: 'X', quantityOrdered: 1, unitCost: subtotal }],
        taxRate,
        0,
      )
      expect(po.taxAmount).toBe(posTax)
      expect(Number.isInteger(po.taxAmount)).toBe(true)
    }
  })
})
