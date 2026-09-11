import { computePoTotals } from './po-totals'
import type { PurchaseOrder, SupplierInvoice } from './types'

export interface InvoiceMatchLine {
  catalogItemId: string
  catalogItemName: string
  billedQty: number
  receivedQty: number
  unitPrice: number
  poNetUnitCost: number
  qtyVariance: number
  priceVariance: number
  overBilled: boolean
  offPo: boolean
  priceOverTolerance: boolean
  matched: boolean
}

export interface InvoiceMatchResult {
  status: 'matched' | 'variance'
  lines: InvoiceMatchLine[]
  hasOverBill: boolean
  hasOffPo: boolean
  totalVariance: number
}

/**
 * Pure 3-way match: invoice billed ↔ PO received ↔ PO net cost. Reads the PO's
 * live quantityReceived, so it is reversal/adjustment-safe. No DB access.
 */
export function computeInvoiceMatch(
  invoice: SupplierInvoice,
  po: PurchaseOrder,
  tolerancePercent: number,
): InvoiceMatchResult {
  const poTotals = computePoTotals(
    po.items.map((i) => ({
      catalogItemId: i.catalogItemId,
      catalogItemName: i.catalogItemName,
      quantityOrdered: i.quantityOrdered,
      unitCost: i.unitCost,
      discountType: i.discountType,
      discountValue: i.discountValue,
    })),
    po.taxRate ?? 0,
    po.freight ?? 0,
  )
  const poByItem = new Map(
    po.items.map((p, idx) => [p.catalogItemId, { received: p.quantityReceived, net: poTotals.items[idx]!.netUnitCost }]),
  )

  const lines: InvoiceMatchLine[] = invoice.items.map((it) => {
    const poEntry = poByItem.get(it.catalogItemId)
    const offPo = !poEntry
    const receivedQty = poEntry?.received ?? 0
    const poNetUnitCost = poEntry?.net ?? 0
    const qtyVariance = it.billedQty - receivedQty
    const overBilled = it.billedQty > receivedQty
    const priceVariance = it.unitPrice - poNetUnitCost
    const priceOverTolerance = !offPo && Math.abs(priceVariance) > Math.round((poNetUnitCost * tolerancePercent) / 100)
    const matched = !offPo && !overBilled && !priceOverTolerance
    return {
      catalogItemId: it.catalogItemId,
      catalogItemName: it.catalogItemName,
      billedQty: it.billedQty,
      receivedQty,
      unitPrice: it.unitPrice,
      poNetUnitCost,
      qtyVariance,
      priceVariance,
      overBilled,
      offPo,
      priceOverTolerance,
      matched,
    }
  })

  const hasOverBill = lines.some((l) => l.overBilled)
  const hasOffPo = lines.some((l) => l.offPo)
  const status: 'matched' | 'variance' = lines.every((l) => l.matched) ? 'matched' : 'variance'
  const expectedValue =
    lines.reduce((s, l) => s + Math.min(l.billedQty, l.receivedQty) * l.poNetUnitCost, 0) + invoice.taxAmount + invoice.freight
  const totalVariance = invoice.total - expectedValue

  return { status, lines, hasOverBill, hasOffPo, totalVariance }
}
