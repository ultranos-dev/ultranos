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

  // Resolve the open cash drawer before the transaction so the encrypted sync
  // payload carries the correct cashDrawerId. Web Crypto cannot run inside a
  // Dexie transaction zone, so the sync entry is built/encrypted up front.
  if (method === 'cash') {
    const openDrawer = await db.cashDrawers.where('status').equals('open').first()
    if (openDrawer) {
      payment.cashDrawerId = openDrawer.id
    }
  }

  const syncEntry = await buildEncryptedSyncEntry({
    resourceType: 'Payment',
    resourceId: payment.id,
    action: 'create',
    payload: payment as unknown as Record<string, unknown>,
    hlcTimestamp,
  })

  await db.transaction(
    'rw',
    [db.payments, db.cashDrawers, db.ledgerEntries, db.patientAccounts, db.syncQueue],
    async () => {
      if (method === 'cash') {
        const openDrawer = await db.cashDrawers
          .where('status')
          .equals('open')
          .first()

        if (openDrawer) {
          payment.cashDrawerId = openDrawer.id
          await db.cashDrawers.update(openDrawer.id, {
            cashIn: openDrawer.cashIn + amount,
          })
        }
      }

      if (method === 'credit' && patientId) {
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

        const existingAccount = await db.patientAccounts
          .where('patientId')
          .equals(patientId)
          .first()

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

      await db.syncQueue.add(syncEntry)
    }
  )

  await updateInvoicePaymentStatus(invoiceId)

  return payment
}

export interface RecordCreditPaymentParams {
  patientId: string
  amount: number
  note?: string
  receivedBy: string
  hlcTimestamp: string
}

/**
 * Records a standalone credit payment from a patient (reduces their balance).
 * Creates a LedgerEntry(type:'payment', amount negative) and updates PatientAccount.
 */
export async function recordCreditPayment(
  params: RecordCreditPaymentParams
): Promise<LedgerEntry> {
  const { patientId, amount, note, receivedBy, hlcTimestamp } = params

  const ledgerEntry: LedgerEntry = {
    id: crypto.randomUUID(),
    patientId,
    type: 'payment',
    amount: -Math.abs(amount),
    note,
    createdBy: receivedBy,
    timestamp: new Date().toISOString(),
  }

  const syncEntry = await buildEncryptedSyncEntry({
    resourceType: 'LedgerEntry',
    resourceId: ledgerEntry.id,
    action: 'create',
    payload: ledgerEntry as unknown as Record<string, unknown>,
    hlcTimestamp,
  })

  await db.transaction(
    'rw',
    [db.ledgerEntries, db.patientAccounts, db.cashDrawers, db.syncQueue],
    async () => {
      await db.ledgerEntries.add(ledgerEntry)

      const account = await db.patientAccounts
        .where('patientId')
        .equals(patientId)
        .first()

      if (account) {
        await db.patientAccounts.update(account.id, {
          balance: account.balance - Math.abs(amount),
          lastActivityAt: new Date().toISOString(),
        })
      }

      // Credit payment received as cash goes into the drawer
      const openDrawer = await db.cashDrawers
        .where('status')
        .equals('open')
        .first()

      if (openDrawer) {
        await db.cashDrawers.update(openDrawer.id, {
          cashIn: openDrawer.cashIn + Math.abs(amount),
        })
      }

      await db.syncQueue.add(syncEntry)
    }
  )

  return ledgerEntry
}
