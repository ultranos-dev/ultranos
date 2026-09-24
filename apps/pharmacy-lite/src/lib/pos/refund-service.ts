import { db } from '@/lib/db'
import { buildEncryptedSyncEntry } from '@/lib/dexie-sync-adapter'
import { addStock } from '@/lib/inventory/stock-service'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { auditPosEvent } from './audit'
import type { Invoice, Refund, RefundStockDisposition, PaymentMethod } from './types'

export interface VoidSaleParams {
  invoiceId: string
  reason: string
  voidedBy: string
  hlcTimestamp: string
  /** What to do with the dispensed stock. Defaults to 'restock'. */
  stockDisposition?: RefundStockDisposition
}

export interface RefundSaleParams {
  invoiceId: string
  /** Refund amount in minor units. Defaults to the invoice's amountPaid (full refund). */
  amount?: number
  method: PaymentMethod
  reason: string
  refundedBy: string
  hlcTimestamp: string
  /** What to do with the returned stock. Defaults to 'restock'. */
  stockDisposition?: RefundStockDisposition
  patientId?: string
}

/**
 * Re-enter (or quarantine) the stock from a voided/refunded invoice's line items.
 * Story 62.1 (Task 2): the pharmacist chooses restock vs quarantine.
 *  - `'restock'`    → add units back to the original batch (`type: 'returned'`).
 *  - `'quarantine'` → dispose as unusable (`type: 'disposed'`, reason
 *                     `patient_return_unusable`) so they never re-enter sellable
 *                     stock, but the movement is still ledgered (never silent).
 * Lines with no `stockBatchId` (batch unknown) are skipped — there is nothing to
 * re-enter against. Never throws so a stock hiccup can't strand the refund/void.
 */
async function reenterStock(
  invoice: Invoice,
  disposition: RefundStockDisposition,
  performedBy: string,
  referenceType: 'void' | 'dispense',
): Promise<void> {
  for (const line of invoice.items) {
    if (!line.stockBatchId || line.quantity <= 0) continue
    try {
      if (disposition === 'restock') {
        await addStock({
          stockBatchId: line.stockBatchId,
          catalogItemId: line.catalogItemId,
          quantity: line.quantity,
          type: 'returned',
          reason: 'Returned to stock on sale void/refund',
          referenceId: invoice.id,
          referenceType,
          performedBy,
        })
      } else {
        // Quarantine: record a disposal movement (negative-effect) so the units
        // are removed from sellable stock but the return is still ledgered.
        await addStock({
          stockBatchId: line.stockBatchId,
          catalogItemId: line.catalogItemId,
          quantity: 0, // no add-back to sellable qty; movement documents the return
          type: 'disposed',
          reasonCode: 'patient_return_unusable',
          reason: 'Quarantined patient return (not resellable)',
          referenceId: invoice.id,
          referenceType,
          performedBy,
        })
      }
    } catch {
      // A single line's stock re-entry failing must not strand the whole
      // void/refund. The financial record is the source of truth; a manual
      // stock reconciliation can follow. No PHI in this swallow.
    }
  }
}

/**
 * VOID a same-day sale (Story 62.1, minimal viable flow).
 * Sets the invoice to 'voided', re-enters/quarantines the dispensed stock, and —
 * for the amount already paid in cash — writes `cashOut` on the open drawer so
 * the drawer close reconciles. Emits an INVOICE_VOIDED audit event.
 *
 * A void is the "cancel the whole sale" path (typically same day, before the
 * customer leaves). For a partial return of an already-settled sale use
 * `refundSale`. Full returns-management (partial line returns, restocking fees)
 * is future scope.
 */
export async function voidSale(params: VoidSaleParams): Promise<Invoice> {
  const { invoiceId, reason, voidedBy, hlcTimestamp, stockDisposition = 'restock' } = params

  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`)
  }
  if (invoice.status === 'voided') {
    return invoice
  }
  if (invoice.status === 'refunded') {
    throw new Error('Invoice already refunded — cannot void')
  }

  // Cash actually collected on this invoice (drives the drawer cash-out).
  const payments = await db.payments.where('invoiceId').equals(invoiceId).toArray()
  const cashPaid = payments
    .filter((p) => p.method === 'cash')
    .reduce((sum, p) => sum + p.amount, 0)

  const updated: Invoice = {
    ...invoice,
    status: 'voided',
    voidReason: reason,
    voidedBy,
    voidedAt: new Date().toISOString(),
  }

  await db.transaction('rw', [db.invoices, db.cashDrawers], async () => {
    // Return the cash that was collected: increase drawer cashOut.
    if (cashPaid > 0) {
      const openDrawer = await db.cashDrawers.where('status').equals('open').first()
      if (!openDrawer) {
        throw new Error('No open cash drawer — open a cash drawer before voiding a cash sale')
      }
      await db.cashDrawers.update(openDrawer.id, {
        cashOut: openDrawer.cashOut + cashPaid,
      })
    }
    await db.invoices.put(updated)
  })

  // Stock re-entry after the financial commit (own transactions in addStock).
  await reenterStock(updated, stockDisposition, voidedBy, 'void')

  // Sync the voided invoice (carries PHI-adjacent references — encrypt).
  const syncEntry = await buildEncryptedSyncEntry({
    resourceType: 'Invoice',
    resourceId: invoiceId,
    action: 'update',
    payload: updated as unknown as Record<string, unknown>,
    hlcTimestamp,
  })
  await db.syncQueue.add(syncEntry)

  auditPosEvent(voidedBy, AuditAction.INVOICE_VOIDED, AuditResourceType.INVOICE, invoiceId, {
    invoiceNumber: invoice.invoiceNumber,
    cashOut: cashPaid,
    stockDisposition,
    reason,
  })

  return updated
}

/**
 * REFUND an already-paid sale (Story 62.1, minimal viable flow).
 * Records a `Refund`, marks the invoice 'refunded', re-enters/quarantines stock,
 * and applies the money effect:
 *  - cash   → `cashOut` on the open drawer (so drawer close reconciles),
 *  - credit → reverses the patient-account charge (a credit ledger entry),
 *  - card   → recorded for reconciliation; no drawer effect.
 * Emits INVOICE_REFUNDED (and, for cash, CASH_DRAWER_PAYOUT) audit events.
 */
export async function refundSale(params: RefundSaleParams): Promise<Refund> {
  const {
    invoiceId,
    method,
    reason,
    refundedBy,
    hlcTimestamp,
    stockDisposition = 'restock',
    patientId,
  } = params

  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`)
  }
  if (invoice.status === 'voided') {
    throw new Error('Invoice is voided — cannot refund')
  }

  // Default to a full refund of what was paid.
  const amount = Math.abs(params.amount ?? invoice.amountPaid)
  if (amount <= 0) {
    throw new Error('Refund amount must be greater than zero')
  }
  const alreadyRefunded = invoice.refundedAmount ?? 0
  if (alreadyRefunded + amount > invoice.amountPaid) {
    throw new Error('Refund exceeds the amount paid on this invoice')
  }

  const refund: Refund = {
    id: crypto.randomUUID(),
    invoiceId,
    amount,
    method,
    reason,
    stockDisposition,
    patientId: patientId ?? invoice.patientId,
    refundedBy,
    timestamp: new Date().toISOString(),
    hlcTimestamp,
  }

  const updatedInvoice: Invoice = {
    ...invoice,
    refundedAmount: alreadyRefunded + amount,
    refundedBy,
    refundedAt: new Date().toISOString(),
    refundReason: reason,
    status: alreadyRefunded + amount >= invoice.amountPaid ? 'refunded' : invoice.status,
  }

  await db.transaction(
    'rw',
    [db.invoices, db.refunds, db.cashDrawers, db.ledgerEntries, db.patientAccounts],
    async () => {
      if (method === 'cash') {
        const openDrawer = await db.cashDrawers.where('status').equals('open').first()
        if (!openDrawer) {
          throw new Error('No open cash drawer — open a cash drawer before a cash refund')
        }
        refund.cashDrawerId = openDrawer.id
        await db.cashDrawers.update(openDrawer.id, {
          cashOut: openDrawer.cashOut + amount,
        })
      }

      if (method === 'credit' && refund.patientId) {
        // Reverse the charge: reduce the patient's outstanding balance.
        const ledgerEntry = {
          id: crypto.randomUUID(),
          patientId: refund.patientId,
          type: 'adjustment' as const,
          amount: -amount,
          invoiceId,
          note: 'Refund reversal',
          createdBy: refundedBy,
          timestamp: new Date().toISOString(),
        }
        await db.ledgerEntries.add(ledgerEntry)
        const account = await db.patientAccounts
          .where('patientId')
          .equals(refund.patientId)
          .first()
        if (account) {
          await db.patientAccounts.update(account.id, {
            balance: account.balance - amount,
            lastActivityAt: new Date().toISOString(),
          })
        }
      }

      await db.refunds.add(refund)
      await db.invoices.put(updatedInvoice)
    }
  )

  await reenterStock(invoice, stockDisposition, refundedBy, 'void')

  const invoiceSync = await buildEncryptedSyncEntry({
    resourceType: 'Invoice',
    resourceId: invoiceId,
    action: 'update',
    payload: updatedInvoice as unknown as Record<string, unknown>,
    hlcTimestamp,
  })
  const refundSync = await buildEncryptedSyncEntry({
    resourceType: 'Refund',
    resourceId: refund.id,
    action: 'create',
    payload: refund as unknown as Record<string, unknown>,
    hlcTimestamp,
  })
  await db.syncQueue.bulkAdd([invoiceSync, refundSync])

  auditPosEvent(refundedBy, AuditAction.INVOICE_REFUNDED, AuditResourceType.REFUND, refund.id, {
    invoiceNumber: invoice.invoiceNumber,
    amount,
    method,
    stockDisposition,
    reason,
  })
  if (method === 'cash') {
    auditPosEvent(
      refundedBy,
      AuditAction.CASH_DRAWER_PAYOUT,
      AuditResourceType.CASH_DRAWER,
      refund.cashDrawerId ?? 'unknown',
      { invoiceId, amount, kind: 'refund' },
    )
  }

  return refund
}
