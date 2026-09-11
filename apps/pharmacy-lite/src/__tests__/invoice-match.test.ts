import { describe, it, expect } from 'vitest'
import { computeInvoiceMatch } from '@/lib/procurement/invoice-match'
import type { PurchaseOrder, SupplierInvoice } from '@/lib/procurement/types'

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po-1', poNumber: 'PO-2026-0001', supplierId: 's1', supplierName: 'Acme', status: 'partially_received',
    items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 8, unitCost: 100 }],
    subtotal: 1000, taxRate: 0, taxAmount: 0, freight: 0, totalCost: 1000,
    createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z', ...overrides,
  }
}
function inv(items: SupplierInvoice['items'], overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'inv-1', invoiceNumber: 'S1', purchaseOrderId: 'po-1', supplierId: 's1', supplierName: 'Acme',
    items, subtotal: 0, taxRate: 0, taxAmount: 0, freight: 0, total: 0, status: 'pending',
    createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z', ...overrides,
  }
}

describe('computeInvoiceMatch', () => {
  it('matched: billed = received, price = PO net cost', () => {
    const r = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }], { total: 800 }), po(), 0)
    expect(r.status).toBe('matched')
    expect(r.lines[0]!.matched).toBe(true)
    expect(r.lines[0]!.orderedQty).toBe(10)
    expect(r.lines[0]!.receivedQty).toBe(8)
    expect(r.lines[0]!.poNetUnitCost).toBe(100)
  })
  it('price within tolerance is matched; beyond tolerance is variance', () => {
    const within = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 104 }]), po(), 5) // tol 5 → allow ±5
    expect(within.status).toBe('matched')
    const beyond = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 110 }]), po(), 5)
    expect(beyond.status).toBe('variance')
    expect(beyond.lines[0]!.priceOverTolerance).toBe(true)
  })
  it('over-billing (billed > received) is a hard flag regardless of tolerance', () => {
    const r = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 100 }]), po(), 50)
    expect(r.status).toBe('variance')
    expect(r.lines[0]!.overBilled).toBe(true)
    expect(r.hasOverBill).toBe(true)
    expect(r.lines[0]!.qtyVariance).toBe(2)
  })
  it('an off-PO invoice line is flagged', () => {
    const r = computeInvoiceMatch(inv([{ catalogItemId: 'zzz', catalogItemName: 'Z', billedQty: 1, unitPrice: 50 }]), po(), 0)
    expect(r.status).toBe('variance')
    expect(r.lines[0]!.offPo).toBe(true)
    expect(r.hasOffPo).toBe(true)
  })
  it('price variance uses the PO net unit cost (after discount)', () => {
    const discountedPo = po({ items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 10, unitCost: 100, discountType: 'percent', discountValue: 10 }] })
    // net unit cost = 90; invoice at 90 → matched
    const r = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 90 }]), discountedPo, 0)
    expect(r.lines[0]!.poNetUnitCost).toBe(90)
    expect(r.status).toBe('matched')
  })
  it('totalVariance = invoice.total − expectedValue (min(billed,received) × net + tax + freight)', () => {
    // received 8, billed 8, net 100, tax 0, freight 0 → expected 800; invoice.total 850 → variance 50
    const r = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }], { total: 850 }), po(), 0)
    expect(r.totalVariance).toBe(50)
  })
})
