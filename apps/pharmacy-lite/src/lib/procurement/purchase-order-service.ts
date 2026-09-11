import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
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
  await enqueuePharmacySyncEntry({
    resourceType: 'PurchaseOrder',
    resourceId: id,
    action: 'create',
    payload: po as unknown as Record<string, unknown>,
    hlcTimestamp: now,
    createdAt: now,
  })
  return po
}

export async function markPurchaseOrderSent(poId: string, sentBy?: string): Promise<void> {
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, { status: 'sent' as PurchaseOrderStatus, sentAt: now, sentBy, hlcTimestamp: now })
  await enqueuePOUpdate(poId, now)
}

export async function cancelPurchaseOrder(poId: string, cancelledBy?: string, reason?: string): Promise<void> {
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, {
    status: 'cancelled' as PurchaseOrderStatus,
    cancelledBy,
    cancelledReason: reason?.trim() || undefined,
    hlcTimestamp: now,
  })
  await enqueuePOUpdate(poId, now)
}

async function enqueuePOUpdate(poId: string, now: string): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) return
  await enqueuePharmacySyncEntry({
    resourceType: 'PurchaseOrder',
    resourceId: poId,
    action: 'update',
    payload: po as unknown as Record<string, unknown>,
    hlcTimestamp: now,
    createdAt: now,
  })
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
