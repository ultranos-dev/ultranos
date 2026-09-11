export interface Supplier {
  id: string
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  leadTimeDays?: number
  paymentTerms?: string
  isActive: boolean
  createdAt: string
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partially_received' | 'closed' | 'cancelled'

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
