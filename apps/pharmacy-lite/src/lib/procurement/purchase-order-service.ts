import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'
import { computePoTotals } from './po-totals'
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from './types'
import { auditProcurementEvent } from './audit'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'

/**
 * Allocate the next human-readable PO number from a local monotonic counter.
 * Atomic read-increment-write on pharmacySettings so concurrent creates never
 * collide. `year` is supplied by the caller (services own timestamps).
 */
export async function generatePoNumber(year: number): Promise<string> {
  let poNumber = ''
  await db.transaction('rw', db.pharmacySettings, async () => {
    const existing = await db.pharmacySettings.toCollection().first()
    const settings = existing ?? { ...DEFAULT_PHARMACY_SETTINGS }
    const seq = settings.poSequenceNext ?? DEFAULT_PHARMACY_SETTINGS.poSequenceNext
    const prefix = settings.poNumberPrefix ?? DEFAULT_PHARMACY_SETTINGS.poNumberPrefix
    const code = settings.pharmacyCode ?? DEFAULT_PHARMACY_SETTINGS.pharmacyCode
    await db.pharmacySettings.put({ ...settings, poSequenceNext: seq + 1 })
    poNumber = `${prefix}${code ? `${code}-` : ''}${year}-${String(seq).padStart(4, '0')}`
  })
  return poNumber
}

export async function createPurchaseOrder(params: {
  supplierId: string
  supplierName: string
  items: Omit<PurchaseOrderItem, 'quantityReceived'>[]
  taxRate?: number
  freight?: number
  notes?: string
  createdBy: string
}): Promise<PurchaseOrder> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const year = new Date().getFullYear()

  const settings = await db.pharmacySettings.toCollection().first()
  const taxRate = params.taxRate ?? settings?.taxRate ?? 0
  const freight = params.freight ?? 0

  const totals = computePoTotals(
    params.items.map((i) => ({
      catalogItemId: i.catalogItemId,
      catalogItemName: i.catalogItemName,
      quantityOrdered: i.quantityOrdered,
      unitCost: i.unitCost,
      discountType: i.discountType,
      discountValue: i.discountValue,
    })),
    taxRate,
    freight,
  )

  const items: PurchaseOrderItem[] = params.items.map((item) => ({ ...item, quantityReceived: 0 }))
  const poNumber = await generatePoNumber(year)

  const po: PurchaseOrder = {
    id,
    poNumber,
    supplierId: params.supplierId,
    supplierName: params.supplierName,
    status: 'draft',
    items,
    subtotal: totals.subtotal,
    taxRate,
    taxAmount: totals.taxAmount,
    freight,
    totalCost: totals.grandTotal,
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
  auditProcurementEvent(po.createdBy, AuditAction.PO_CREATED, AuditResourceType.PURCHASE_ORDER, po.id, {
    poNumber: po.poNumber, supplierId: po.supplierId, totalCost: po.totalCost, lineCount: items.length,
  })
  return po
}

export async function markPurchaseOrderSent(poId: string, sentBy?: string): Promise<void> {
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, { status: 'sent' as PurchaseOrderStatus, sentAt: now, sentBy, hlcTimestamp: now })
  await enqueuePOUpdate(poId, now)
  const po = await db.purchaseOrders.get(poId)
  auditProcurementEvent(sentBy ?? 'unknown', AuditAction.PO_SENT, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po?.poNumber, supplierId: po?.supplierId,
  })
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
  const po = await db.purchaseOrders.get(poId)
  auditProcurementEvent(cancelledBy ?? 'unknown', AuditAction.PO_CANCELLED, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po?.poNumber, reason: reason?.trim() || undefined,
  })
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
