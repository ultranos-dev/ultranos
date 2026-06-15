import { db } from '@/lib/db'
import type { PatientAccount, LedgerEntry } from './types'

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

export interface AgingBuckets {
  /** 0-30 days outstanding */
  current: number
  /** 31-60 days outstanding */
  thirtyDay: number
  /** 61-90 days outstanding */
  sixtyDay: number
  /** 90+ days outstanding */
  ninetyPlus: number
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

  const now = Date.now()
  const DAY_MS = 86_400_000

  const buckets: AgingBuckets = {
    current: 0,
    thirtyDay: 0,
    sixtyDay: 0,
    ninetyPlus: 0,
  }

  for (const entry of entries) {
    if (entry.amount <= 0) continue

    const ageMs = now - new Date(entry.timestamp).getTime()
    const ageDays = Math.floor(ageMs / DAY_MS)

    if (ageDays <= 30) {
      buckets.current += entry.amount
    } else if (ageDays <= 60) {
      buckets.thirtyDay += entry.amount
    } else if (ageDays <= 90) {
      buckets.sixtyDay += entry.amount
    } else {
      buckets.ninetyPlus += entry.amount
    }
  }

  return buckets
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
