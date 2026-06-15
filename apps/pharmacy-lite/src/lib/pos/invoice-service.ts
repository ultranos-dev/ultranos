import { db } from '@/lib/db'
import type { Invoice, InvoiceLineItem, InvoiceStatus } from './types'

/**
 * Generates the next invoice number with the given prefix.
 * Format: {prefix}{00001} (5-digit zero-padded sequential).
 */
export async function getNextInvoiceNumber(prefix: string): Promise<string> {
  const lastInvoice = await db.invoices
    .where('invoiceNumber')
    .startsWith(prefix)
    .reverse()
    .sortBy('invoiceNumber')
    .then((invoices) => invoices[0])

  let nextNumber = 1
  if (lastInvoice) {
    const numericPart = lastInvoice.invoiceNumber.slice(prefix.length)
    const parsed = parseInt(numericPart, 10)
    if (!isNaN(parsed)) {
      nextNumber = parsed + 1
    }
  }

  return `${prefix}${String(nextNumber).padStart(5, '0')}`
}

export interface CreateInvoiceParams {
  patientId?: string
  dispenseIds: string[]
  items: InvoiceLineItem[]
  taxRate: number
  createdBy: string
  hlcTimestamp: string
  prefix?: string
}

/**
 * Creates a draft invoice from dispensed items and enqueues a sync entry.
 */
export async function createInvoiceFromDispense(
  params: CreateInvoiceParams
): Promise<Invoice> {
  const {
    patientId,
    dispenseIds,
    items,
    taxRate,
    createdBy,
    hlcTimestamp,
    prefix = 'INV',
  } = params

  const invoiceNumber = await getNextInvoiceNumber(prefix)
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
  const taxAmount = Math.round(subtotal * taxRate)
  const total = subtotal + taxAmount

  const invoice: Invoice = {
    id: crypto.randomUUID(),
    invoiceNumber,
    patientId,
    dispenseIds,
    items,
    subtotal,
    taxRate,
    taxAmount,
    total,
    amountPaid: 0,
    amountDue: total,
    status: 'draft',
    createdBy,
    createdAt: new Date().toISOString(),
    hlcTimestamp,
  }

  await db.transaction('rw', [db.invoices, db.syncQueue], async () => {
    await db.invoices.add(invoice)
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      resourceType: 'Invoice',
      resourceId: invoice.id,
      action: 'create',
      payload: JSON.stringify(invoice),
      status: 'pending',
      hlcTimestamp,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    })
  })

  return invoice
}

/**
 * Recalculates and updates invoice payment status based on payments received.
 * Transitions: draft → finalized → partial → paid
 */
export async function updateInvoicePaymentStatus(
  invoiceId: string
): Promise<Invoice> {
  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`)
  }

  if (invoice.status === 'voided') {
    return invoice
  }

  const payments = await db.payments
    .where('invoiceId')
    .equals(invoiceId)
    .toArray()

  const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const amountDue = invoice.total - amountPaid

  let status: InvoiceStatus
  if (amountPaid === 0) {
    status = invoice.status === 'draft' ? 'draft' : 'finalized'
  } else if (amountDue <= 0) {
    status = 'paid'
  } else {
    status = 'partial'
  }

  const updated: Invoice = {
    ...invoice,
    amountPaid,
    amountDue: Math.max(0, amountDue),
    status,
  }

  await db.invoices.put(updated)
  return updated
}

export interface VoidInvoiceParams {
  invoiceId: string
  reason: string
  voidedBy: string
  hlcTimestamp: string
}

/**
 * Voids an invoice with reason, setting status to 'voided'.
 */
export async function voidInvoice(params: VoidInvoiceParams): Promise<Invoice> {
  const { invoiceId, reason, voidedBy, hlcTimestamp } = params

  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`)
  }

  if (invoice.status === 'voided') {
    return invoice
  }

  const updated: Invoice = {
    ...invoice,
    status: 'voided',
    voidReason: reason,
    voidedBy,
    voidedAt: new Date().toISOString(),
  }

  await db.transaction('rw', [db.invoices, db.syncQueue], async () => {
    await db.invoices.put(updated)
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      resourceType: 'Invoice',
      resourceId: invoiceId,
      action: 'update',
      payload: JSON.stringify(updated),
      status: 'pending',
      hlcTimestamp,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    })
  })

  return updated
}

/**
 * Returns all invoices created today.
 */
export async function getTodayInvoices(): Promise<Invoice[]> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  return db.invoices
    .where('createdAt')
    .aboveOrEqual(todayIso)
    .toArray()
}

/**
 * Returns the sum of amountPaid on paid/partial invoices for today.
 */
export async function getTodayRevenue(): Promise<number> {
  const invoices = await getTodayInvoices()
  return invoices
    .filter((inv) => inv.status === 'paid' || inv.status === 'partial')
    .reduce((sum, inv) => sum + inv.amountPaid, 0)
}
