import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { computePoTotals } from './po-totals'
import { getPurchaseOrderById } from './purchase-order-service'
import { getSupplierById } from './supplier-service'
import { computeInvoiceMatch } from './invoice-match'
import type { SupplierInvoice, SupplierInvoiceItem, SupplierInvoiceStatus } from './types'

export async function createSupplierInvoice(params: {
  purchaseOrderId: string
  invoiceNumber: string
  items: SupplierInvoiceItem[]
  taxRate?: number
  freight?: number
  notes?: string
  dueDate?: string
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
  const supplier = await getSupplierById(po.supplierId)
  const termsDays = supplier?.paymentTermsDays ?? 0
  const dueDate = params.dueDate ?? new Date(new Date(now).getTime() + termsDays * 86_400_000).toISOString()

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
    dueDate,
    amountPaid: 0,
    settlementStatus: 'unpaid',
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
  const all = await db.supplierInvoices.toArray()
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getSupplierInvoiceById(id: string): Promise<SupplierInvoice | undefined> {
  return db.supplierInvoices.get(id)
}

export async function getInvoicesForPO(purchaseOrderId: string): Promise<SupplierInvoice[]> {
  return db.supplierInvoices.where('purchaseOrderId').equals(purchaseOrderId).toArray()
}

export class InvoiceVarianceUnresolvedError extends Error {
  constructor() {
    super('This invoice has a variance and needs an override reason to approve')
    this.name = 'InvoiceVarianceUnresolvedError'
  }
}

async function enqueueInvoiceUpdate(invoiceId: string, now: string): Promise<void> {
  const inv = await db.supplierInvoices.get(invoiceId)
  if (!inv) return
  await enqueuePharmacySyncEntry({
    resourceType: 'SupplierInvoice', resourceId: invoiceId, action: 'update',
    payload: inv as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
  })
}

export async function approveSupplierInvoice(invoiceId: string, approvedBy: string, overrideReason?: string): Promise<void> {
  const inv = await db.supplierInvoices.get(invoiceId)
  if (!inv) throw new Error('Supplier invoice not found')
  const po = await getPurchaseOrderById(inv.purchaseOrderId)
  if (!po) throw new Error('Purchase order not found')
  const settings = await db.pharmacySettings.toCollection().first()
  const tolerance = settings?.invoiceMatchTolerancePercent ?? 0
  const match = computeInvoiceMatch(inv, po, tolerance)
  if (match.status === 'variance' && !overrideReason?.trim()) throw new InvoiceVarianceUnresolvedError()
  const now = new Date().toISOString()
  await db.supplierInvoices.update(invoiceId, {
    status: 'approved', approvedBy, approvedReason: overrideReason?.trim() || undefined, hlcTimestamp: now,
  })
  await enqueueInvoiceUpdate(invoiceId, now)
}

export async function disputeSupplierInvoice(invoiceId: string, disputedBy: string, reason: string): Promise<void> {
  const inv = await db.supplierInvoices.get(invoiceId)
  if (!inv) throw new Error('Supplier invoice not found')
  const now = new Date().toISOString()
  await db.supplierInvoices.update(invoiceId, {
    status: 'disputed', disputedBy, disputeReason: reason.trim() || undefined, hlcTimestamp: now,
  })
  await enqueueInvoiceUpdate(invoiceId, now)
}
