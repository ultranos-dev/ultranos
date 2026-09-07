import { db } from '@/lib/db'
import type { PatientAccount, LedgerEntry } from './types'
import { computeAging, type AgingBuckets } from './aging'
export type { AgingBuckets } from './aging'

/**
 * Returns all patient accounts with a non-zero balance.
 */
export async function getAccountsWithBalance(): Promise<PatientAccount[]> {
  const all = await db.patientAccounts.toArray()
  return all.filter((account) => account.balance !== 0)
}

/**
 * Returns ledger entries for a patient, most recent first.
 */
export async function getPatientLedger(patientId: string): Promise<LedgerEntry[]> {
  const entries = await db.ledgerEntries
    .where('patientId')
    .equals(patientId)
    .reverse()
    .sortBy('timestamp')

  return entries
}

/**
 * Computes aging buckets for a patient's outstanding charges.
 * Only considers positive-amount (charge) entries not fully offset.
 */
export async function getAgingBuckets(patientId: string): Promise<AgingBuckets> {
  const entries = await db.ledgerEntries
    .where('patientId')
    .equals(patientId)
    .toArray()

  return computeAging(entries)
}

export interface TotalAging {
  totalOutstanding: number
  accountsCount: number
  overdueCount: number
}

/**
 * Returns aggregate aging info across all patient accounts.
 * overdueCount = accounts with charges older than 30 days.
 */
export async function getTotalAging(): Promise<TotalAging> {
  const accounts = await getAccountsWithBalance()

  let totalOutstanding = 0
  let overdueCount = 0

  const now = Date.now()
  const DAY_MS = 86_400_000
  const THIRTY_DAYS_MS = 30 * DAY_MS

  for (const account of accounts) {
    if (account.balance > 0) {
      totalOutstanding += account.balance

      // Check if any charge entries are older than 30 days
      const entries = await db.ledgerEntries
        .where('patientId')
        .equals(account.patientId)
        .toArray()

      const hasOverdue = entries.some(
        (e) =>
          e.amount > 0 &&
          now - new Date(e.timestamp).getTime() > THIRTY_DAYS_MS
      )

      if (hasOverdue) {
        overdueCount++
      }
    }
  }

  return {
    totalOutstanding,
    accountsCount: accounts.filter((a) => a.balance > 0).length,
    overdueCount,
  }
}
