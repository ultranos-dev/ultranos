import { db } from '@/lib/db'
import { computeSuggestedQty } from './reorder'
import { getPreferredSupplierItem } from './supplier-item-service'
import { getSupplierById } from './supplier-service'
import { createPurchaseOrder } from './purchase-order-service'
import type { PurchaseOrder } from './types'

export interface ReorderLine {
  catalogItemId: string
  catalogItemName: string
  onHand: number
  reorderPoint: number
  suggestedQty: number
  preferredSupplierId?: string
  preferredSupplierName?: string
  unitCost: number   // minor units
}

/** costPrice of the most recent stock batch (any status) for the item, or undefined. */
export async function getLastPurchaseCost(catalogItemId: string): Promise<number | undefined> {
  const batches = await db.stockBatches.where('catalogItemId').equals(catalogItemId).toArray()
  if (batches.length === 0) return undefined
  batches.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  return batches[0]!.costPrice
}

export async function getReorderReport(): Promise<ReorderLine[]> {
  const activeBatches = await db.stockBatches.where('status').equals('active').toArray()
  const onHandByItem = new Map<string, number>()
  for (const b of activeBatches) {
    onHandByItem.set(b.catalogItemId, (onHandByItem.get(b.catalogItemId) ?? 0) + b.quantityOnHand)
  }
  const items = (await db.catalogItems.toArray()).filter((c) => c.isActive && c.reorderPoint > 0)
  const lines: ReorderLine[] = []
  for (const item of items) {
    const onHand = onHandByItem.get(item.id) ?? 0
    if (onHand > item.reorderPoint) continue
    const preferred = await getPreferredSupplierItem(item.id)
    const suggestedQty = computeSuggestedQty(item, onHand, preferred?.minOrderQty)
    const unitCost = preferred?.unitPrice ?? (await getLastPurchaseCost(item.id)) ?? 0
    const preferredSupplierName = preferred ? (await getSupplierById(preferred.supplierId))?.name : undefined
    lines.push({
      catalogItemId: item.id, catalogItemName: item.name, onHand, reorderPoint: item.reorderPoint,
      suggestedQty, preferredSupplierId: preferred?.supplierId, preferredSupplierName, unitCost,
    })
  }
  return lines.sort((a, b) => a.catalogItemName.localeCompare(b.catalogItemName))
}

export async function generateReorderPurchaseOrders(
  selected: { catalogItemId: string; catalogItemName: string; quantity: number; unitCost: number; supplierId: string }[],
  createdBy: string,
): Promise<PurchaseOrder[]> {
  const valid = selected.filter((l) => l.quantity > 0)
  const bySupplier = new Map<string, typeof valid>()
  for (const l of valid) {
    const g = bySupplier.get(l.supplierId) ?? []
    g.push(l)
    bySupplier.set(l.supplierId, g)
  }
  const pos: PurchaseOrder[] = []
  for (const [supplierId, group] of bySupplier) {
    const supplier = await getSupplierById(supplierId)
    const po = await createPurchaseOrder({
      supplierId,
      supplierName: supplier?.name ?? supplierId,
      items: group.map((l) => ({
        catalogItemId: l.catalogItemId, catalogItemName: l.catalogItemName,
        quantityOrdered: l.quantity, unitCost: l.unitCost,
      })),
      createdBy,
    })
    pos.push(po)
  }
  return pos
}
