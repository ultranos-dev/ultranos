import { db } from '@/lib/db'
import { buildEncryptedSyncEntry } from '@/lib/dexie-sync-adapter'
import type { Payment, PaymentMethod, LedgerEntry, PatientAccount } from './types'
import { updateInvoicePaymentStatus } from './invoice-service'

export interface RecordPaymentParams {
  invoiceId: string
  method: PaymentMethod
  amount: number
  reference?: string
  receivedBy: string
  patientId?: string
  hlcTimestamp: string
}

/**
 * Records a payment against an invoice.
 * - Cash: increments CashDrawer.cashIn
 * - Credit: creates LedgerEntry (charge) and updates PatientAccount balance
 * Then updates the invoice payment status.
 */
export async function recordPayment(params: RecordPaymentParams): Promise<Payment> {
  const { invoiceId, method, amount, reference, receivedBy, patientId, hlcTimestamp } = params

  const payment: Payment = {
    id: crypto.randomUUID(),
    invoiceId,
    method,
    amount,
    reference,
    receivedBy,
    timestamp: new Date().toISOString(),
  }

  // Story 62.1 (Task 3): the cash drawer is resolved EXACTLY ONCE, inside the
  // transaction, and `payment.cashDrawerId` is set from that single resolution.
  // Previously the drawer was resolved once before the tx (to build the sync
  // payload) and AGAIN inside the tx — two reads that could see different open
  // drawers, so the enqueued sync payload (Hub copy) and the local record could
  // disagree on cashDrawerId. The sync entry is now built AFTER the tx from the
  // FINAL `payment` object (Web Crypto can't run inside a Dexie tx zone), so the
  // Hub and local copies are guaranteed identical.
  await db.transaction(
    'rw',
    [db.payments, db.cashDrawers, db.ledgerEntries, db.patientAccounts],
    async () => {
      if (method === 'cash') {
        const openDrawer = await db.cashDrawers
          .where('status')
          .equals('open')
          .first()

        if (!openDrawer) {
          throw new Error('No open cash drawer — open a cash drawer before recording a cash payment')
        }
        payment.cashDrawerId = openDrawer.id
        await db.cashDrawers.update(openDrawer.id, {
          cashIn: openDrawer.cashIn + amount,
        })
      }

      if (method === 'credit' && patientId) {
        const existingAccount = await db.patientAccounts
          .where('patientId')
          .equals(patientId)
          .first()

        if (
          existingAccount?.creditLimit != null &&
          existingAccount.balance + amount > existingAccount.creditLimit
        ) {
          throw new Error('Credit limit exceeded')
        }

        const ledgerEntry: LedgerEntry = {
          id: crypto.randomUUID(),
          patientId,
          type: 'charge',
          amount,
          invoiceId,
          createdBy: receivedBy,
          timestamp: new Date().toISOString(),
        }
        await db.ledgerEntries.add(ledgerEntry)

        if (existingAccount) {
          await db.patientAccounts.update(existingAccount.id, {
            balance: existingAccount.balance + amount,
            lastActivityAt: new Date().toISOString(),
          })
        } else {
          const newAccount: PatientAccount = {
            id: crypto.randomUUID(),
            patientId,
            balance: amount,
            lastActivityAt: new Date().toISOString(),
          }
          await db.patientAccounts.add(newAccount)
        }
      }

      await db.payments.add(payment)
    }
  )

  // Build + enqueue the sync entry from the FINAL payment object (post-tx), so
  // the Hub copy carries the same cashDrawerId that was committed locally. The
  // payload carries PHI-adjacent references — encrypt before it touches IndexedDB.
  const syncEntry = await buildEncryptedSyncEntry({
    resourceType: 'Payment',
    resourceId: payment.id,
    action: 'create',
    payload: payment as unknown as Record<string, unknown>,
    hlcTimestamp,
  })
  await db.syncQueue.add(syncEntry)

  await updateInvoicePaymentStatus(invoiceId)

  return payment
}

export interface RecordCreditPaymentParams {
  patientId: string
  amount: number
  note?: string
  receivedBy: string
  hlcTimestamp: string
  /**
   * How the patient tendered this account payment. Story 62.1 (Task 3): only a
   * CASH tender should touch the drawer. Defaults to 'cash' to preserve the
   * prior behaviour, but 'card'/'credit' tenders no longer silently add to the
   * drawer's cashIn (which caused a phantom over-count at drawer close).
   */
  method?: PaymentMethod
}

/**
 * Records a standalone credit payment from a patient (reduces their balance).
 * Creates a LedgerEntry(type:'payment', amount negative) and updates PatientAccount.
 *
 * Story 62.1 (Task 3):
 *  - The drawer is credited ONLY for a cash tender (`method === 'cash'`). A card
 *    or credit tender no longer unconditionally inflates the drawer.
 *  - The no-account case is handled EXPLICITLY: previously a payment for a
 *    patient with no `patientAccount` row silently dropped the balance reduction
 *    (the ledger entry was written but no account reflected it). We now create
 *    the account with a negative (credit) balance so the payment is not lost.
 */
export async function recordCreditPayment(
  params: RecordCreditPaymentParams
): Promise<LedgerEntry> {
  const { patientId, amount, note, receivedBy, hlcTimestamp, method = 'cash' } = params
  const magnitude = Math.abs(amount)

  const ledgerEntry: LedgerEntry = {
    id: crypto.randomUUID(),
    patientId,
    type: 'payment',
    amount: -magnitude,
    note,
    createdBy: receivedBy,
    timestamp: new Date().toISOString(),
  }

  await db.transaction(
    'rw',
    [db.ledgerEntries, db.patientAccounts, db.cashDrawers],
    async () => {
      // A cash tender requires an open drawer to attribute the cash-in to; fail
      // loudly rather than silently dropping the drawer effect.
      let openDrawer
      if (method === 'cash') {
        openDrawer = await db.cashDrawers.where('status').equals('open').first()
        if (!openDrawer) {
          throw new Error('No open cash drawer — open a cash drawer before recording a cash account payment')
        }
      }

      await db.ledgerEntries.add(ledgerEntry)

      const account = await db.patientAccounts
        .where('patientId')
        .equals(patientId)
        .first()

      if (account) {
        await db.patientAccounts.update(account.id, {
          balance: account.balance - magnitude,
          lastActivityAt: new Date().toISOString(),
        })
      } else {
        // No account row yet — record the credit balance explicitly so the
        // payment is reflected rather than silently lost.
        const newAccount: PatientAccount = {
          id: crypto.randomUUID(),
          patientId,
          balance: -magnitude,
          lastActivityAt: new Date().toISOString(),
        }
        await db.patientAccounts.add(newAccount)
      }

      // Only a cash tender goes into the drawer.
      if (openDrawer) {
        await db.cashDrawers.update(openDrawer.id, {
          cashIn: openDrawer.cashIn + magnitude,
        })
      }
    }
  )

  const syncEntry = await buildEncryptedSyncEntry({
    resourceType: 'LedgerEntry',
    resourceId: ledgerEntry.id,
    action: 'create',
    payload: ledgerEntry as unknown as Record<string, unknown>,
    hlcTimestamp,
  })
  await db.syncQueue.add(syncEntry)

  return ledgerEntry
}
