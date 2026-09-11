export interface PoLineInput {
  catalogItemId: string
  catalogItemName: string
  quantityOrdered: number
  unitCost: number
  discountType?: 'percent' | 'amount'
  discountValue?: number
}

export interface PoLineComputed extends PoLineInput {
  lineGross: number
  lineDiscount: number
  lineNet: number
  netUnitCost: number
}

export interface PoTotals {
  items: PoLineComputed[]
  subtotal: number
  discountTotal: number
  taxRate: number
  taxAmount: number
  freight: number
  grandTotal: number
}

/** Pure PO line + document totals. All amounts are integer minor units. */
export function computePoTotals(items: PoLineInput[], taxRate: number, freight: number): PoTotals {
  const computed: PoLineComputed[] = items.map((it) => {
    const qty = it.quantityOrdered > 0 ? it.quantityOrdered : 0
    const lineGross = it.unitCost * qty
    let lineDiscount = 0
    if (it.discountType === 'percent') {
      lineDiscount = Math.round((lineGross * (it.discountValue ?? 0)) / 100)
    } else if (it.discountType === 'amount') {
      lineDiscount = it.discountValue ?? 0
    }
    lineDiscount = Math.max(0, Math.min(lineDiscount, lineGross))
    const lineNet = lineGross - lineDiscount
    const netUnitCost = qty > 0 ? Math.round(lineNet / qty) : 0
    return { ...it, lineGross, lineDiscount, lineNet, netUnitCost }
  })

  const subtotal = computed.reduce((s, l) => s + l.lineNet, 0)
  const discountTotal = computed.reduce((s, l) => s + l.lineDiscount, 0)
  const taxAmount = Math.round((subtotal * taxRate) / 100)
  const grandTotal = subtotal + taxAmount + freight

  return { items: computed, subtotal, discountTotal, taxRate, taxAmount, freight, grandTotal }
}
