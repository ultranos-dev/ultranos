/**
 * All monetary values are integers in minor currency units.
 * e.g. 350 = 3.50 AFN (when currencyMinorUnits = 2)
 */

export type InvoiceStatus = 'draft' | 'finalized' | 'paid' | 'partial' | 'voided'

export interface InvoiceLineItem {
  catalogItemId: string
  stockBatchId: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface Invoice {
  id: string
  invoiceNumber: string
  patientId?: string
  dispenseIds: string[]
  items: InvoiceLineItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  amountPaid: number
  amountDue: number
  status: InvoiceStatus
  createdBy: string
  createdAt: string
  voidedBy?: string
  voidedAt?: string
  voidReason?: string
  hlcTimestamp: string
}

export type PaymentMethod = 'cash' | 'card' | 'credit'

export interface Payment {
  id: string
  invoiceId: string
  method: PaymentMethod
  amount: number
  reference?: string
  cashDrawerId?: string
  receivedBy: string
  timestamp: string
}

export type LedgerEntryType = 'charge' | 'payment' | 'adjustment'

export interface LedgerEntry {
  id: string
  patientId: string
  type: LedgerEntryType
  amount: number
  invoiceId?: string
  note?: string
  createdBy: string
  timestamp: string
}

export interface PatientAccount {
  id: string
  patientId: string
  balance: number
  creditLimit?: number
  lastActivityAt: string
}

export type CashDrawerStatus = 'open' | 'closed'

export interface CashDrawer {
  id: string
  openedBy: string
  openedAt: string
  openingBalance: number
  closedAt?: string
  closingBalance?: number
  expectedBalance?: number
  discrepancy?: number
  status: CashDrawerStatus
  cashIn: number
  cashOut: number
  notes?: string
}
