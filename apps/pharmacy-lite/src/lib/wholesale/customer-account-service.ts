import { db } from '@/lib/db'
import { computeAging, type AgingBuckets } from '@/lib/pos/aging'
import type { CustomerAccount, CustomerLedgerEntry } from './types'

async function upsertBalanceDelta(customerId: string, delta: number): Promise<void> {
  const now = new Date().toISOString()
  const account = await db.customerAccounts.where('customerId').equals(customerId).first()
  if (account) {
    await db.customerAccounts.update(account.id, { balance: account.balance + delta, lastActivityAt: now })
  } else {
    const created: CustomerAccount = { id: crypto.randomUUID(), customerId, balance: delta, lastActivityAt: now }
    await db.customerAccounts.add(created)
  }
}

export async function postCharge(customerId: string, amount: number, salesOrderId: string, createdBy: string): Promise<void> {
  const entry: CustomerLedgerEntry = {
    id: crypto.randomUUID(),
    customerId,
    type: 'charge',
    amount: Math.abs(amount),
    salesOrderId,
    createdBy,
    timestamp: new Date().toISOString(),
  }
  await db.transaction('rw', [db.customerLedgerEntries, db.customerAccounts], async () => {
    await db.customerLedgerEntries.add(entry)
    await upsertBalanceDelta(customerId, Math.abs(amount))
  })
}

export async function recordPayment(params: { customerId: string; amount: number; receivedBy: string; note?: string }): Promise<void> {
  const { customerId, amount, receivedBy, note } = params
  const entry: CustomerLedgerEntry = {
    id: crypto.randomUUID(),
    customerId,
    type: 'payment',
    amount: -Math.abs(amount),
    note,
    createdBy: receivedBy,
    timestamp: new Date().toISOString(),
  }
  await db.transaction('rw', [db.customerLedgerEntries, db.customerAccounts, db.cashDrawers], async () => {
    await db.customerLedgerEntries.add(entry)
    await upsertBalanceDelta(customerId, -Math.abs(amount))
    // Mirror the cash-in pattern from recordCreditPayment in payment-service.ts:
    // resolve the open drawer inside the transaction and update cashIn by the payment amount.
    const drawer = await db.cashDrawers.where('status').equals('open').first()
    if (drawer) {
      await db.cashDrawers.update(drawer.id, { cashIn: drawer.cashIn + Math.abs(amount) })
    }
  })
}

export async function getAccountsWithBalance(): Promise<CustomerAccount[]> {
  return (await db.customerAccounts.toArray()).filter((a) => a.balance !== 0)
}

export async function getCustomerLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
  return db.customerLedgerEntries.where('customerId').equals(customerId).reverse().sortBy('timestamp')
}

export async function getAgingBuckets(customerId: string): Promise<AgingBuckets> {
  const entries = await db.customerLedgerEntries.where('customerId').equals(customerId).toArray()
  return computeAging(entries)
}
