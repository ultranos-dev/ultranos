export type SalesOrderStatus = 'draft' | 'confirmed' | 'picking' | 'fulfilled' | 'cancelled'
export type OrderUnit = 'each' | 'pack'

export interface WholesaleCustomer {
  id: string
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  paymentTermsDays?: number     // e.g. 30 for net-30
  creditLimit?: number
  ultranosOrgId?: string         // D7: optional link to an Ultranos tenant; sync deferred
  isActive: boolean
  createdAt: string
}

export interface BatchAllocation {
  stockBatchId: string
  qty: number                    // base units drawn from this batch
}

export interface SalesOrderLine {
  catalogItemId: string
  description: string
  unit: OrderUnit                // D4
  quantity: number               // in `unit`
  unitPrice: number              // price for one `unit` (defaults from wholesalePrice; overridable)
  lineTotal: number              // quantity * unitPrice
  baseUnits: number              // unit==='pack' ? quantity*packSize : quantity
  batchAllocations: BatchAllocation[]  // filled at pick time (FEFO)
  shortStock?: boolean           // true when total allocated qty < baseUnits (set at pick time)
}

export interface SalesOrder {
  id: string
  orderNumber: string            // sequential, prefix from settings (e.g. SO-)
  customerId: string
  status: SalesOrderStatus
  lines: SalesOrderLine[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  notes?: string
  createdBy: string
  createdAt: string
  fulfilledAt?: string
  cancelledAt?: string
  hlcTimestamp: string
}

// AR — mirrors pos/types.ts PatientAccount + LedgerEntry
export interface CustomerAccount {
  id: string
  customerId: string
  balance: number
  creditLimit?: number
  lastActivityAt: string
}

export type CustomerLedgerEntryType = 'charge' | 'payment' | 'adjustment'

export interface CustomerLedgerEntry {
  id: string
  customerId: string
  type: CustomerLedgerEntryType
  amount: number                 // positive = charge (owed), payment reduces balance
  salesOrderId?: string
  note?: string
  createdBy: string
  timestamp: string
}
