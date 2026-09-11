/**
 * All monetary values are stored as integers in minor currency units.
 * e.g. 350 = 3.50 AFN (when currencyMinorUnits = 2)
 */

export type MedicationForm =
  | 'tablet'
  | 'capsule'
  | 'syrup'
  | 'injection'
  | 'cream'
  | 'drops'
  | 'inhaler'
  | 'other'

export type ControlledSchedule = 'II' | 'III' | 'IV' | 'V'

export interface CatalogItem {
  id: string
  name: string
  nameLocal?: string
  form: MedicationForm
  strength: string
  strengthUnit: string
  packSize: number
  barcode?: string
  atcCode?: string           // ATC code linking to global drug catalog (optional)
  category: string
  controlledSchedule?: ControlledSchedule
  defaultSellingPrice: number
  wholesalePrice?: number
  reorderPoint: number
  minStock?: number
  maxStock?: number
  isActive: boolean
  lastSyncedAt: string
  /** True when this row was created or edited locally and must be preserved
   *  across a Hub catalog pull (dirty-guard). Absent/false = clean Hub copy. */
  locallyModified?: boolean
  /** 'local' = pharmacy-created item (never on the Hub); 'hub' or absent = pulled. */
  source?: 'hub' | 'local'
}

export type StockBatchStatus = 'active' | 'quarantined' | 'depleted'

export interface StockBatch {
  id: string
  catalogItemId: string
  batchNumber: string
  lotNumber?: string
  expiryDate: string
  quantityOnHand: number
  costPrice: number
  sellingPrice: number
  zoneId?: string
  supplierId?: string
  goodsReceiptId?: string
  receivedAt: string
  status: StockBatchStatus
  locationId: string
  hlcTimestamp: string
}

export type StockMovementType =
  | 'received'
  | 'dispensed'
  | 'adjusted'
  | 'transferred_out'
  | 'transferred_in'
  | 'quarantined'
  | 'disposed'
  | 'returned'
  | 'void_reversal'
  | 'sold'

export type StockMovementRefType =
  | 'dispense'
  | 'purchase_order'
  | 'transfer'
  | 'count'
  | 'goods_receipt'
  | 'void'
  | 'sales_order'
  | 'adjustment'
  | 'disposal'

export type StockAdjustmentReason =
  | 'miscount'
  | 'damage'
  | 'theft'
  | 'expiry_correction'
  | 'system_error'

export type StockDisposalReason =
  | 'expired'
  | 'damaged'
  | 'contaminated'
  | 'recalled'
  | 'patient_return_unusable'

export type StockMovementReason = StockAdjustmentReason | StockDisposalReason

export interface StockMovement {
  id: string
  stockBatchId: string
  catalogItemId: string
  type: StockMovementType
  quantity: number
  reason?: string
  reasonCode?: StockMovementReason
  referenceId?: string
  referenceType?: StockMovementRefType
  performedBy: string
  timestamp: string
  hlcTimestamp: string
}

export interface GoodsReceiptItem {
  catalogItemId: string
  batchNumber: string
  lotNumber?: string
  expiryDate: string
  quantity: number
  costPrice: number
  sellingPrice: number
}

export interface GoodsReceipt {
  id: string
  supplierId?: string
  purchaseOrderId?: string
  receivedBy: string
  items: GoodsReceiptItem[]
  totalCost: number
  notes?: string
  overReceiptReason?: string
  /** Set on a reversing receipt: the id of the receipt it reverses. */
  reversalOf?: string
  /** Set on an original receipt once reversed: the id of the reversing receipt. */
  reversedByReceiptId?: string
  receivedAt: string
  hlcTimestamp: string
}

export interface PharmacyInventorySettings {
  enablePurchaseOrders: boolean
  enableZones: boolean
  enablePatientCredit: boolean
  enableTransfers: boolean
  enableWholesale: boolean
  requirePaymentOnDispense: boolean
  expiryAlertDays: number
  lowStockAlertEnabled: boolean
  fefoEnforcement: 'suggest' | 'enforce'
  currency: string
  currencyMinorUnits: number
  taxRate: number
  invoicePrefix: string
  salesOrderPrefix: string
  overReceiptTolerancePercent: number
  locationId: string
  locationName: string
  organizationId?: string
}

export const DEFAULT_PHARMACY_SETTINGS: PharmacyInventorySettings = {
  enablePurchaseOrders: false,
  enableZones: false,
  enablePatientCredit: false,
  enableTransfers: false,
  enableWholesale: false,
  requirePaymentOnDispense: false,
  expiryAlertDays: 90,
  lowStockAlertEnabled: true,
  fefoEnforcement: 'enforce',
  currency: 'AFN',
  currencyMinorUnits: 2,
  taxRate: 0,
  invoicePrefix: 'INV-',
  salesOrderPrefix: 'SO-',
  overReceiptTolerancePercent: 0,
  locationId: '',
  locationName: '',
}
