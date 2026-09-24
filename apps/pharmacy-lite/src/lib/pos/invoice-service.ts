import { db } from '@/lib/db'
import { buildEncryptedSyncEntry } from '@/lib/dexie-sync-adapter'
import type { Invoice, InvoiceLineItem, InvoiceStatus } from './types'

/**
 * Computes the next sequential invoice number for a prefix by scanning existing
 * invoices. The `.reverse().sortBy()` read pattern is correct; the collision
 * risk (Story 62.1, M-PHARM-5) is the read→write gap between concurrent tabs,
 * which `getNextInvoiceNumber` closes by wrapping this in a Dexie transaction.
 */
function computeNextInvoiceNumber(existing: Invoice[], prefix: string): string {
  let nextNumber = 1
  for (const inv of existing) {
    if (!inv.invoiceNumber.startsWith(prefix)) continue
    const parsed = parseInt(inv.invoiceNumber.slice(prefix.length), 10)
    if (!isNaN(parsed) && parsed + 1 > nextNumber) {
      nextNumber = parsed + 1
    }
  }
  return `${prefix}${String(nextNumber).padStart(5, '0')}`
}

/**
 * Generates the next invoice number with the given prefix.
 * Format: {prefix}{00001} (5-digit zero-padded sequential).
 *
 * Story 62.1 (Task 4): the read-then-compute runs INSIDE a Dexie `rw`
 * transaction on `invoices`. Because IndexedDB serializes overlapping `rw`
 * transactions on the same store, two tabs allocating a number concurrently are
 * ordered — the second sees the first's committed invoice and cannot duplicate.
 * When called within `createInvoiceFromDispense` the caller supplies its own tx
 * scope, so the whole allocate+insert is one atomic unit (`ensureTx`).
 */
export async function getNextInvoiceNumber(prefix: string): Promise<string> {
  return db.transaction('rw', db.invoices, async () => {
    const existing = await db.invoices
      .where('invoiceNumber')
      .startsWith(prefix)
      .toArray()
    return computeNextInvoiceNumber(existing, prefix)
  })
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

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
  // Story 62.1 (C-PHARM-2): taxRate is now a PERCENT (e.g. 10 = 10%), matching
  // procurement (po-totals.ts) and wholesale (sales-order-service.ts). Integer
  // minor-unit discipline preserved via Math.round.
  const taxAmount = Math.round((subtotal * taxRate) / 100)
  const total = subtotal + taxAmount

  const invoice: Invoice = {
    id: crypto.randomUUID(),
    // invoiceNumber assigned inside the tx (Task 4 — no cross-tab collision).
    invoiceNumber: '',
    patientId,
    dispenseIds,
    items,
    subtotal,
    taxRate,
    taxRateConvention: 'percent',
    taxAmount,
    total,
    amountPaid: 0,
    amountDue: total,
    status: 'draft',
    createdBy,
    createdAt: new Date().toISOString(),
    hlcTimestamp,
  }

  // Allocate the invoice number and insert the row in ONE transaction so the
  // number can't collide across tabs (Task 4). The encrypted sync entry cannot
  // be built inside the tx (Web Crypto is unavailable in a Dexie tx zone), so we
  // build it AFTER the number is known but enqueue it in a short second tx.
  await db.transaction('rw', db.invoices, async () => {
    const existing = await db.invoices
      .where('invoiceNumber')
      .startsWith(prefix)
      .toArray()
    invoice.invoiceNumber = computeNextInvoiceNumber(existing, prefix)
    await db.invoices.add(invoice)
  })

  // The payload carries PHI (patientId, line items) — encrypt before enqueue.
  const syncEntry = await buildEncryptedSyncEntry({
    resourceType: 'Invoice',
    resourceId: invoice.id,
    action: 'create',
    payload: invoice as unknown as Record<string, unknown>,
    hlcTimestamp,
  })
  await db.syncQueue.add(syncEntry)

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

  if (invoice.status === 'voided' || invoice.status === 'refunded') {
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

  const syncEntry = await buildEncryptedSyncEntry({
    resourceType: 'Invoice',
    resourceId: invoiceId,
    action: 'update',
    payload: updated as unknown as Record<string, unknown>,
    hlcTimestamp,
  })

  await db.transaction('rw', [db.invoices, db.syncQueue], async () => {
    await db.invoices.put(updated)
    await db.syncQueue.add(syncEntry)
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
