import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { computePoTotals } from './po-totals'
import { getPurchaseOrderById } from './purchase-order-service'
import type { SupplierInvoice, SupplierInvoiceItem, SupplierInvoiceStatus } from './types'

export async function createSupplierInvoice(params: {
  purchaseOrderId: string
  invoiceNumber: string
  items: SupplierInvoiceItem[]
  taxRate?: number
  freight?: number
  notes?: string
  createdBy: string
}): Promise<SupplierInvoice> {
  const po = await getPurchaseOrderById(params.purchaseOrderId)
  if (!po) throw new Error('Purchase order not found')
  if (po.status === 'cancelled') throw new Error('Cannot invoice a cancelled purchase order')

  const settings = await db.pharmacySettings.toCollection().first()
  const taxRate = params.taxRate ?? settings?.taxRate ?? 0
  const freight = params.freight ?? 0

  const totals = computePoTotals(
    params.items.map((i) => ({
      catalogItemId: i.catalogItemId,
      catalogItemName: i.catalogItemName,
      quantityOrdered: i.billedQty,
      unitCost: i.unitPrice,
    })),
    taxRate,
    freight,
  )

  const now = new Date().toISOString()
  const invoice: SupplierInvoice = {
    id: crypto.randomUUID(),
    invoiceNumber: params.invoiceNumber.trim(),
    purchaseOrderId: po.id,
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    items: params.items,
    subtotal: totals.subtotal,
    taxRate,
    taxAmount: totals.taxAmount,
    freight,
    total: totals.grandTotal,
    status: 'pending',
    notes: params.notes?.trim() || undefined,
    createdBy: params.createdBy,
    createdAt: now,
    hlcTimestamp: now,
  }
  await db.supplierInvoices.put(invoice)
  await enqueuePharmacySyncEntry({
    resourceType: 'SupplierInvoice', resourceId: invoice.id, action: 'create',
    payload: invoice as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
  })
  return invoice
}

export async function findDuplicateInvoice(supplierId: string, invoiceNumber: string): Promise<SupplierInvoice | undefined> {
  return db.supplierInvoices.where('[supplierId+invoiceNumber]').equals([supplierId, invoiceNumber.trim()]).first()
}

export async function getSupplierInvoices(statusFilter?: SupplierInvoiceStatus): Promise<SupplierInvoice[]> {
  if (statusFilter) return db.supplierInvoices.where('status').equals(statusFilter).reverse().sortBy('createdAt')
  return db.supplierInvoices.orderBy('createdAt').reverse().toArray()
}

export async function getSupplierInvoiceById(id: string): Promise<SupplierInvoice | undefined> {
  return db.supplierInvoices.get(id)
}

export async function getInvoicesForPO(purchaseOrderId: string): Promise<SupplierInvoice[]> {
  return db.supplierInvoices.where('purchaseOrderId').equals(purchaseOrderId).toArray()
}
