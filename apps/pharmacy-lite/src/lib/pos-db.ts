import type { EntityTable } from 'dexie'
import type { Invoice, Payment, LedgerEntry, PatientAccount, CashDrawer, Refund } from './pos/types'

export type PosTables = {
  invoices: EntityTable<Invoice, 'id'>
  payments: EntityTable<Payment, 'id'>
  ledgerEntries: EntityTable<LedgerEntry, 'id'>
  patientAccounts: EntityTable<PatientAccount, 'id'>
  cashDrawers: EntityTable<CashDrawer, 'id'>
  refunds: EntityTable<Refund, 'id'>
}

export const POS_STORES = {
  invoices: 'id, invoiceNumber, patientId, status, createdAt, hlcTimestamp',
  payments: 'id, invoiceId, method, timestamp',
  ledgerEntries: 'id, patientId, type, timestamp, invoiceId',
  patientAccounts: 'id, patientId, balance',
  cashDrawers: 'id, status, openedAt',
  refunds: 'id, invoiceId, cashDrawerId, timestamp',
}
