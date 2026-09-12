import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { computeAmountDue, computeSettlementStatus } from './ap-invoice'
import { getSupplierById } from './supplier-service'
import { auditProcurementEvent } from './audit'
import type { SupplierPayment, SupplierPaymentAllocation, SupplierPaymentMethod } from './types'

export class InvoiceNotApprovedError extends Error {
  constructor() {
    super('Only approved invoices can receive a payment')
    this.name = 'InvoiceNotApprovedError'
  }
}

export class OverpaymentError extends Error {
  constructor() {
    super('Payment allocation exceeds the amount due on an invoice')
    this.name = 'OverpaymentError'
  }
}

export async function recordSupplierPayment(params: {
  supplierId: string
  allocations: { supplierInvoiceId: string; amount: number }[]
  method: SupplierPaymentMethod
  reference?: string
  notes?: string
  paidBy: string
  hlcTimestamp: string
}): Promise<SupplierPayment> {
  const supplier = await getSupplierById(params.supplierId)
  const supplierName = supplier?.name ?? params.supplierId
  const clean = params.allocations.filter((a) => a.amount > 0)
  if (clean.length === 0) throw new Error('No allocations to record')

  const payment: SupplierPayment = {
    id: crypto.randomUUID(),
    supplierId: params.supplierId,
    supplierName,
    amount: 0, // filled below
    method: params.method,
    reference: params.reference?.trim() || undefined,
    allocations: [],
    status: 'active',
    notes: params.notes?.trim() || undefined,
    paidBy: params.paidBy,
    paidAt: params.hlcTimestamp,
    hlcTimestamp: params.hlcTimestamp,
  }

  const built: SupplierPaymentAllocation[] = []
  await db.transaction('rw', [db.supplierInvoices, db.supplierPayments], async () => {
    for (const a of clean) {
      const inv = await db.supplierInvoices.get(a.supplierInvoiceId)
      if (!inv) throw new Error('Supplier invoice not found')
      if (inv.status !== 'approved') throw new InvoiceNotApprovedError()
      if (a.amount > computeAmountDue(inv)) throw new OverpaymentError()
      const nextPaid = (inv.amountPaid ?? 0) + a.amount
      await db.supplierInvoices.update(inv.id, {
        amountPaid: nextPaid,
        settlementStatus: computeSettlementStatus({ total: inv.total, amountPaid: nextPaid }),
        hlcTimestamp: params.hlcTimestamp,
      })
      built.push({ supplierInvoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: a.amount })
    }
    payment.allocations = built
    payment.amount = built.reduce((s, x) => s + x.amount, 0)
    await db.supplierPayments.add(payment)
  })

  await enqueuePharmacySyncEntry({
    resourceType: 'SupplierPayment', resourceId: payment.id, action: 'create',
    payload: payment as unknown as Record<string, unknown>, hlcTimestamp: params.hlcTimestamp, createdAt: params.hlcTimestamp,
  })
  for (const a of built) {
    const inv = await db.supplierInvoices.get(a.supplierInvoiceId)
    if (inv) {
      await enqueuePharmacySyncEntry({
        resourceType: 'SupplierInvoice', resourceId: inv.id, action: 'update',
        payload: inv as unknown as Record<string, unknown>, hlcTimestamp: params.hlcTimestamp, createdAt: params.hlcTimestamp,
      })
    }
  }
  auditProcurementEvent(payment.paidBy, AuditAction.SUPPLIER_PAYMENT_RECORDED, AuditResourceType.SUPPLIER_PAYMENT, payment.id, {
    supplierId: payment.supplierId, amount: payment.amount, method: payment.method, allocationCount: payment.allocations.length,
  })
  return payment
}

export async function voidSupplierPayment(
  paymentId: string, voidedBy: string, reason: string, hlcTimestamp: string,
): Promise<void> {
  const payment = await db.supplierPayments.get(paymentId)
  if (!payment) throw new Error('Supplier payment not found')
  if (payment.status === 'void') throw new Error('Payment is already void')

  await db.transaction('rw', [db.supplierInvoices, db.supplierPayments], async () => {
    for (const a of payment.allocations) {
      const inv = await db.supplierInvoices.get(a.supplierInvoiceId)
      if (!inv) continue
      const nextPaid = Math.max(0, (inv.amountPaid ?? 0) - a.amount)
      await db.supplierInvoices.update(inv.id, {
        amountPaid: nextPaid,
        settlementStatus: computeSettlementStatus({ total: inv.total, amountPaid: nextPaid }),
        hlcTimestamp,
      })
    }
    await db.supplierPayments.update(paymentId, {
      status: 'void', voidedBy, voidReason: reason.trim() || undefined, voidedAt: hlcTimestamp, hlcTimestamp,
    })
  })

  const updated = await db.supplierPayments.get(paymentId)
  if (updated) {
    await enqueuePharmacySyncEntry({
      resourceType: 'SupplierPayment', resourceId: paymentId, action: 'update',
      payload: updated as unknown as Record<string, unknown>, hlcTimestamp, createdAt: hlcTimestamp,
    })
  }
  for (const a of payment.allocations) {
    const inv = await db.supplierInvoices.get(a.supplierInvoiceId)
    if (inv) {
      await enqueuePharmacySyncEntry({
        resourceType: 'SupplierInvoice', resourceId: inv.id, action: 'update',
        payload: inv as unknown as Record<string, unknown>, hlcTimestamp, createdAt: hlcTimestamp,
      })
    }
  }
  auditProcurementEvent(voidedBy, AuditAction.SUPPLIER_PAYMENT_VOIDED, AuditResourceType.SUPPLIER_PAYMENT, paymentId, {
    supplierId: payment.supplierId, reason: reason.trim() || undefined,
  })
}

export async function getSupplierPayments(supplierId?: string): Promise<SupplierPayment[]> {
  const list = supplierId
    ? await db.supplierPayments.where('supplierId').equals(supplierId).toArray()
    : await db.supplierPayments.toArray()
  return list.sort((a, b) => b.paidAt.localeCompare(a.paidAt))
}

export async function getSupplierPaymentById(id: string): Promise<SupplierPayment | undefined> {
  return db.supplierPayments.get(id)
}

export async function getPaymentsForInvoice(supplierInvoiceId: string): Promise<SupplierPayment[]> {
  const all = await db.supplierPayments.toArray()
  return all
    .filter((p) => p.allocations.some((a) => a.supplierInvoiceId === supplierInvoiceId))
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
}
