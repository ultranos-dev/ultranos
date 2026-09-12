import { db } from '@/lib/db'
import { computeAmountDue } from './ap-invoice'
import { getSupplierPayments } from './supplier-payment-service'
import { computeAging, type AgingBuckets } from '@/lib/pos/aging'
import type { SupplierInvoice, SupplierPayment } from './types'

export interface SupplierPayableSummary {
  supplierId: string
  supplierName: string
  outstanding: number
  aging: AgingBuckets
  oldestDueDate: string | null
  invoiceCount: number
}

export interface SupplierAccountDetail {
  supplierId: string
  supplierName: string
  outstanding: number
  aging: AgingBuckets
  invoices: SupplierInvoice[]
  payments: SupplierPayment[]
}

/** Approved invoices with a positive amountDue — the only payable invoices. */
async function getUnpaidApproved(supplierId?: string): Promise<SupplierInvoice[]> {
  const rows = supplierId
    ? await db.supplierInvoices.where('supplierId').equals(supplierId).toArray()
    : await db.supplierInvoices.where('status').equals('approved').toArray()
  return rows.filter((i) => i.status === 'approved' && computeAmountDue(i) > 0)
}

function agingFor(invoices: SupplierInvoice[]): AgingBuckets {
  return computeAging(invoices.map((i) => ({ amount: computeAmountDue(i), timestamp: i.dueDate ?? i.createdAt })))
}

export async function getSupplierPayables(): Promise<SupplierPayableSummary[]> {
  const invoices = await getUnpaidApproved()
  const bySupplier = new Map<string, SupplierInvoice[]>()
  for (const inv of invoices) {
    const list = bySupplier.get(inv.supplierId) ?? []
    list.push(inv)
    bySupplier.set(inv.supplierId, list)
  }
  const out: SupplierPayableSummary[] = []
  for (const [supplierId, list] of bySupplier) {
    const dueDates = list.map((i) => i.dueDate ?? i.createdAt).sort()
    out.push({
      supplierId,
      supplierName: list[0]!.supplierName,
      outstanding: list.reduce((s, i) => s + computeAmountDue(i), 0),
      aging: agingFor(list),
      oldestDueDate: dueDates[0] ?? null,
      invoiceCount: list.length,
    })
  }
  return out.sort((a, b) => b.outstanding - a.outstanding)
}

export async function getSupplierAccount(supplierId: string): Promise<SupplierAccountDetail> {
  const [invoices, payments, supplier] = await Promise.all([
    getUnpaidApproved(supplierId),
    getSupplierPayments(supplierId),
    db.suppliers.get(supplierId),
  ])
  invoices.sort((a, b) => (a.dueDate ?? a.createdAt).localeCompare(b.dueDate ?? b.createdAt))
  return {
    supplierId,
    supplierName: supplier?.name ?? invoices[0]?.supplierName ?? supplierId,
    outstanding: invoices.reduce((s, i) => s + computeAmountDue(i), 0),
    aging: agingFor(invoices),
    invoices,
    payments,
  }
}
