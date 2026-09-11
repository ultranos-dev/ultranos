import { db } from '@/lib/db'

/** Weighted-average cost of ACTIVE on-hand stock for a product; null when none. */
export async function getWac(catalogItemId: string): Promise<number | null> {
  const batches = await db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .toArray()
  let qty = 0
  let value = 0
  for (const b of batches) {
    qty += b.quantityOnHand
    value += b.quantityOnHand * b.costPrice
  }
  if (qty <= 0) return null
  return Math.round(value / qty)
}

/** Inventory valuation across all products, ACTIVE batches only. */
export async function getInventoryValuation(): Promise<{
  totalValue: number
  byItem: { catalogItemId: string; qty: number; wac: number; value: number }[]
}> {
  const batches = await db.stockBatches.where('status').equals('active').toArray()
  const map = new Map<string, { qty: number; value: number }>()
  for (const b of batches) {
    const e = map.get(b.catalogItemId) ?? { qty: 0, value: 0 }
    e.qty += b.quantityOnHand
    e.value += b.quantityOnHand * b.costPrice
    map.set(b.catalogItemId, e)
  }
  const byItem = Array.from(map.entries()).map(([catalogItemId, { qty, value }]) => ({
    catalogItemId,
    qty,
    wac: qty > 0 ? Math.round(value / qty) : 0,
    value,
  }))
  const totalValue = byItem.reduce((s, i) => s + i.value, 0)
  return { totalValue, byItem }
}
