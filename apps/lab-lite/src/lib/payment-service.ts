import { getDb, enqueueSyncEvent, type PaymentEntry, type PaymentMethod } from './db'
import { hlc, serializeHlc } from './hlc'
import { reportPaymentEvent } from './audit-client'

export interface RecordPaymentInput {
  patientRef: string
  testsPayedFor: Array<{ testCode: string; testName: string; price: number }>
  amount: number
  paymentMethod: PaymentMethod
  cashierId: string
  outstandingBalance: number
  relatedPaymentIds?: string[]
  waiverReason?: string
  insurancePolicyRef?: string
}

/**
 * Generate a receipt number in the format LAB-RCP-YYYYMMDD-NNNN.
 * Must be called inside a Dexie transaction to avoid race conditions.
 */
async function generateReceiptNumber(date: Date): Promise<string> {
  const db = getDb()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `LAB-RCP-${dateStr}-`

  // Find the max receipt number for today
  const todayPayments = await db.payments
    .where('createdAt')
    .between(
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString(),
      new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString(),
    )
    .toArray()

  let maxSeq = 0
  for (const p of todayPayments) {
    const match = p.receiptNumber.match(/-(\d{4})$/)
    if (match) {
      const seq = parseInt(match[1], 10)
      if (seq > maxSeq) maxSeq = seq
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(4, '0')
  return `${prefix}${nextSeq}`
}

/**
 * Record a payment in the local Dexie database.
 * Generates receipt number and HLC timestamp atomically within a transaction.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<PaymentEntry> {
  const db = getDb()
  const now = new Date()
  const paymentId = crypto.randomUUID()

  const entry = await db.transaction('rw', db.payments, async () => {
    const receiptNumber = await generateReceiptNumber(now)

    const payment: PaymentEntry = {
      paymentId,
      patientRef: input.patientRef,
      testsPayedFor: input.testsPayedFor,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      cashierId: input.cashierId,
      receiptNumber,
      outstandingBalance: input.outstandingBalance,
      relatedPaymentIds: input.relatedPaymentIds ?? [],
      hlcTimestamp: serializeHlc(hlc.now()),
      createdAt: now.toISOString(),
      syncStatus: 'pending',
      waiverReason: input.waiverReason,
      insurancePolicyRef: input.insurancePolicyRef,
    }

    const id = await db.payments.add(payment)
    return { ...payment, id }
  })

  // Audit — never throw
  void reportPaymentEvent({
    action: 'PAYMENT_CREATED',
    paymentId,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    cashierId: input.cashierId,
    patientRef: input.patientRef,
  })

  // Enqueue for sync to Hub (Tier 3 — LWW acceptable for payments)
  try {
    const { id: _id, ...syncPayload } = entry
    await enqueueSyncEvent({
      resourceType: 'Payment',
      resourceId: paymentId,
      payload: syncPayload,
      hlcTimestamp: entry.hlcTimestamp,
    })
  } catch {
    // Sync enqueue failure is non-blocking — payment is recorded locally
  }

  return entry
}

/** Get all payments for a patient, ordered by date (newest first). */
export async function getPaymentsForPatient(patientRef: string): Promise<PaymentEntry[]> {
  const db = getDb()
  const payments = await db.payments
    .where('patientRef')
    .equals(patientRef)
    .toArray()
  return payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Calculate outstanding balance for a patient from the full payment chain. */
export async function getOutstandingBalance(patientRef: string): Promise<number> {
  const payments = await getPaymentsForPatient(patientRef)
  if (payments.length === 0) return 0
  // The most recent payment's outstandingBalance reflects the current state
  return payments[0].outstandingBalance
}

/** Update the sync status of a payment by paymentId. */
export async function updatePaymentSyncStatus(
  paymentId: string,
  syncStatus: 'pending' | 'synced' | 'failed',
): Promise<void> {
  const db = getDb()
  const payment = await db.payments.where('paymentId').equals(paymentId).first()
  if (payment?.id != null) {
    await db.payments.update(payment.id, { syncStatus })
  }
}

/** Get all payments for a given day (ISO date string YYYY-MM-DD). */
export async function getPaymentsByDate(date: string): Promise<PaymentEntry[]> {
  const db = getDb()
  const startOfDay = new Date(`${date}T00:00:00.000Z`).toISOString()
  const endOfDay = new Date(`${date}T23:59:59.999Z`).toISOString()
  return db.payments
    .where('createdAt')
    .between(startOfDay, endOfDay, true, true)
    .toArray()
}
