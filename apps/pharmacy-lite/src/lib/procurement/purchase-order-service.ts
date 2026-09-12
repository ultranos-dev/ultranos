import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'
import { computePoTotals } from './po-totals'
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from './types'
import { auditProcurementEvent } from './audit'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { requiresApproval } from './po-approval'

export class SelfApprovalError extends Error {
  constructor() { super('You cannot approve or reject your own purchase order'); this.name = 'SelfApprovalError' }
}
export class ApprovalRequiredError extends Error {
  constructor() { super('This purchase order requires approval before it can be sent'); this.name = 'ApprovalRequiredError' }
}

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
  const existing = await db.purchaseOrders.get(poId)
  const settings = await db.pharmacySettings.toCollection().first()
  if (existing && requiresApproval(existing.totalCost, settings?.poApprovalThreshold ?? 0)) {
    throw new ApprovalRequiredError()
  }
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

export async function submitPurchaseOrderForApproval(poId: string, submittedBy: string): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) throw new Error('Purchase order not found')
  if (po.status !== 'draft') throw new Error('Only a draft can be submitted for approval')
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, { status: 'pending_approval' as PurchaseOrderStatus, submittedBy, submittedAt: now, hlcTimestamp: now })
  await enqueuePOUpdate(poId, now)
  auditProcurementEvent(submittedBy, AuditAction.PO_SUBMITTED_FOR_APPROVAL, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po.poNumber, totalCost: po.totalCost,
  })
}

export async function approvePurchaseOrder(poId: string, approvedBy: string): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) throw new Error('Purchase order not found')
  if (po.status !== 'pending_approval') throw new Error('Only a pending purchase order can be approved')
  if (approvedBy === po.createdBy) throw new SelfApprovalError()
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, {
    status: 'sent' as PurchaseOrderStatus, approvedBy, approvedAt: now, sentBy: approvedBy, sentAt: now, hlcTimestamp: now,
  })
  await enqueuePOUpdate(poId, now)
  auditProcurementEvent(approvedBy, AuditAction.PO_APPROVED, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po.poNumber, totalCost: po.totalCost,
  })
}

export async function rejectPurchaseOrder(poId: string, rejectedBy: string, reason: string): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) throw new Error('Purchase order not found')
  if (po.status !== 'pending_approval') throw new Error('Only a pending purchase order can be rejected')
  if (rejectedBy === po.createdBy) throw new SelfApprovalError()
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, {
    status: 'draft' as PurchaseOrderStatus, rejectedBy, rejectedReason: reason.trim() || undefined, rejectedAt: now, hlcTimestamp: now,
  })
  await enqueuePOUpdate(poId, now)
  auditProcurementEvent(rejectedBy, AuditAction.PO_REJECTED, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po.poNumber, reason: reason.trim() || undefined,
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
