export interface Supplier {
  id: string
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  leadTimeDays?: number
  paymentTerms?: string
  /** Net payment-terms days for AP due-date defaulting (Phase 2b-ii). */
  paymentTermsDays?: number
  supplierCode?: string
  taxId?: string
  minOrderValue?: number   // minor units
  rating?: number
  notes?: string
  isActive: boolean
  createdAt: string
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'sent'
  | 'partially_received'
  | 'closed'
  | 'cancelled'

export interface PurchaseOrderItem {
  catalogItemId: string
  catalogItemName: string
  quantityOrdered: number
  quantityReceived: number
  unitCost: number
  discountType?: 'percent' | 'amount'
  discountValue?: number
}

export interface PurchaseOrder {
  id: string
  supplierId: string
  supplierName: string
  status: PurchaseOrderStatus
  items: PurchaseOrderItem[]
  totalCost: number
  /** Human-readable PO number (assigned at creation). Absent on legacy POs. */
  poNumber?: string
  /** Sum of line nets (minor units). Absent on legacy POs. */
  subtotal?: number
  /** Document tax rate (percent). Absent on legacy POs. */
  taxRate?: number
  /** round(subtotal * taxRate/100). Absent on legacy POs. */
  taxAmount?: number
  /** Freight/other charge (minor units). Absent on legacy POs. */
  freight?: number
  notes?: string
  /** Submitted for approval (Phase 3b). */
  submittedBy?: string
  submittedAt?: string
  /** Approval decision (Phase 3b). */
  approvedBy?: string
  approvedAt?: string
  /** Rejection decision (Phase 3b) — PO returns to draft. */
  rejectedBy?: string
  rejectedReason?: string
  rejectedAt?: string
  createdBy: string
  createdAt: string
  sentAt?: string
  closedAt?: string
  sentBy?: string
  cancelledBy?: string
  cancelledReason?: string
  hlcTimestamp: string
}

export type StockCountType = 'full' | 'spot' | 'controlled_only'
export type StockCountStatus = 'in_progress' | 'completed'

export interface StockCountItem {
  catalogItemId: string
  catalogItemName: string
  stockBatchId: string
  batchNumber: string
  expectedQty: number
  actualQty: number
  variance: number
}

export interface StockCount {
  id: string
  type: StockCountType
  status: StockCountStatus
  countedBy: string
  items: StockCountItem[]
  totalVarianceItems: number
  startedAt: string
  completedAt?: string
  hlcTimestamp: string
}

export type SupplierInvoiceStatus = 'pending' | 'approved' | 'disputed'

export interface SupplierInvoiceItem {
  catalogItemId: string
  catalogItemName: string
  billedQty: number
  unitPrice: number
}

export interface SupplierInvoice {
  id: string
  invoiceNumber: string
  purchaseOrderId: string
  supplierId: string
  supplierName: string
  items: SupplierInvoiceItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  freight: number
  total: number
  status: SupplierInvoiceStatus
  approvedBy?: string
  approvedReason?: string
  disputedBy?: string
  disputeReason?: string
  notes?: string
  /** ISO date the invoice is due (Phase 2b-ii). Absent on legacy invoices → defaults to createdAt on read. */
  dueDate?: string
  /** Total minor units paid so far (Phase 2b-ii). Absent on legacy → treated as 0. */
  amountPaid?: number
  /** Settlement state (Phase 2b-ii). Absent on legacy → derived from amountPaid. */
  settlementStatus?: SettlementStatus
  createdBy: string
  createdAt: string
  hlcTimestamp: string
}

export type SettlementStatus = 'unpaid' | 'partial' | 'paid'

export type SupplierPaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'other'
export type SupplierPaymentStatus = 'active' | 'void'

export interface SupplierPaymentAllocation {
  supplierInvoiceId: string
  invoiceNumber: string   // denormalized for display
  amount: number          // minor units applied to this invoice
}

export interface SupplierPayment {
  id: string
  supplierId: string
  supplierName: string          // denormalized for display
  amount: number                // total minor units == Σ allocations[].amount
  method: SupplierPaymentMethod
  reference?: string
  allocations: SupplierPaymentAllocation[]
  status: SupplierPaymentStatus // 'active' → 'void'
  notes?: string
  paidBy: string
  paidAt: string
  voidedBy?: string
  voidReason?: string
  voidedAt?: string
  hlcTimestamp: string
}

export interface SupplierItem {
  id: string
  supplierId: string
  catalogItemId: string
  supplierSku?: string
  unitPrice?: number       // minor units
  minOrderQty?: number
  leadTimeDays?: number
  isPreferred?: boolean
  createdBy: string
  createdAt: string
  hlcTimestamp: string
}
