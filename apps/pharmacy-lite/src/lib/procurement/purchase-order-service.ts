import { db } from '@/lib/db'
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from './types'

export async function createPurchaseOrder(params: {
  supplierId: string
  supplierName: string
  items: Omit<PurchaseOrderItem, 'quantityReceived'>[]
  notes?: string
  createdBy: string
}): Promise<PurchaseOrder> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const items: PurchaseOrderItem[] = params.items.map((item) => ({ ...item, quantityReceived: 0 }))
  const totalCost = items.reduce((sum, item) => sum + item.unitCost * item.quantityOrdered, 0)

  const po: PurchaseOrder = {
    id,
    supplierId: params.supplierId,
    supplierName: params.supplierName,
    status: 'draft',
    items,
    totalCost,
    notes: params.notes?.trim() || undefined,
    createdBy: params.createdBy,
    createdAt: now,
    hlcTimestamp: now,
  }
  await db.purchaseOrders.put(po)
  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'PurchaseOrder',
    resourceId: id,
    action: 'create',
    payload: JSON.stringify(po),
    status: 'pending',
    hlcTimestamp: now,
    createdAt: now,
    retryCount: 0,
  })
  return po
}

export async function markPurchaseOrderSent(poId: string): Promise<void> {
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, { status: 'sent' as PurchaseOrderStatus, sentAt: now, hlcTimestamp: now })
}

export async function recordReceiptAgainstPO(
  poId: string,
  receivedItems: { catalogItemId: string; quantityReceived: number }[],
): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) throw new Error('Purchase order not found')
  const now = new Date().toISOString()
  const updatedItems = po.items.map((item) => {
    const received = receivedItems.find((r) => r.catalogItemId === item.catalogItemId)
    if (received) return { ...item, quantityReceived: item.quantityReceived + received.quantityReceived }
    return item
  })
  const allFullyReceived = updatedItems.every((item) => item.quantityReceived >= item.quantityOrdered)
  const anyReceived = updatedItems.some((item) => item.quantityReceived > 0)
  let status: PurchaseOrderStatus = po.status
  if (allFullyReceived) status = 'closed'
  else if (anyReceived) status = 'partially_received'
  await db.purchaseOrders.update(poId, {
    items: updatedItems,
    status,
    closedAt: status === 'closed' ? now : undefined,
    hlcTimestamp: now,
  })
}

export async function cancelPurchaseOrder(poId: string): Promise<void> {
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, { status: 'cancelled' as PurchaseOrderStatus, hlcTimestamp: now })
}

export async function getPurchaseOrders(statusFilter?: PurchaseOrderStatus): Promise<PurchaseOrder[]> {
  if (statusFilter) return db.purchaseOrders.where('status').equals(statusFilter).reverse().sortBy('createdAt')
  return db.purchaseOrders.orderBy('createdAt').reverse().toArray()
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder | undefined> {
  return db.purchaseOrders.get(id)
}

export async function getOpenPurchaseOrdersForSupplier(supplierId: string): Promise<PurchaseOrder[]> {
  return db.purchaseOrders
    .where('supplierId')
    .equals(supplierId)
    .filter((po) => po.status === 'sent' || po.status === 'partially_received')
    .toArray()
}
