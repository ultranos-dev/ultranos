/**
 * All monetary values are integers in minor currency units.
 * e.g. 350 = 3.50 AFN (when currencyMinorUnits = 2)
 */

export type InvoiceStatus =
  | 'draft'
  | 'finalized'
  | 'paid'
  | 'partial'
  | 'voided'
  | 'refunded'

export interface InvoiceLineItem {
  catalogItemId: string
  stockBatchId: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

/**
 * Which arithmetic convention a stored `taxRate` value follows.
 * - `'percent'`  → `taxAmount = round(subtotal * taxRate / 100)` (e.g. 10 = 10%)
 * - `'fraction'` → `taxAmount = round(subtotal * taxRate)`       (e.g. 0.1 = 10%)
 *
 * Story 62.1 (C-PHARM-2): the whole app standardizes on `'percent'` (matching
 * procurement + wholesale). Invoices created BEFORE this fix used `'fraction'`.
 * The v24 migration stamps every pre-existing invoice with `'fraction'` and all
 * new invoices are written as `'percent'`, so historical documents keep
 * rendering their originally-computed `taxAmount`/rate unchanged. Absent field
 * on very old rows is treated as `'fraction'` (the pre-fix behaviour).
 */
export type TaxRateConvention = 'percent' | 'fraction'

export interface Invoice {
  id: string
  invoiceNumber: string
  patientId?: string
  dispenseIds: string[]
  items: InvoiceLineItem[]
  subtotal: number
  taxRate: number
  /** Convention for `taxRate`. New invoices: 'percent'. Legacy/undefined: 'fraction'. */
  taxRateConvention?: TaxRateConvention
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
  /** Total refunded against this invoice (minor units). Story 62.1. */
  refundedAmount?: number
  refundedBy?: string
  refundedAt?: string
  refundReason?: string
  hlcTimestamp: string
}

/**
 * How refunded stock is dispositioned. Story 62.1 (Task 2):
 * - `'restock'`    → units returned to the original batch (resellable)
 * - `'quarantine'` → units disposed as `patient_return_unusable` (not resellable)
 */
export type RefundStockDisposition = 'restock' | 'quarantine'

/**
 * A refund of an already-paid invoice (Story 62.1, minimal viable flow).
 * Cash refunds write `cashOut` on the open drawer; credit refunds reverse the
 * patient-account charge. Money is in integer minor units.
 */
export interface Refund {
  id: string
  invoiceId: string
  /** Refunded amount in minor units (always positive). */
  amount: number
  method: PaymentMethod
  reason: string
  stockDisposition: RefundStockDisposition
  /** Drawer the cash refund was paid out of (cash method only). */
  cashDrawerId?: string
  patientId?: string
  refundedBy: string
  timestamp: string
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
