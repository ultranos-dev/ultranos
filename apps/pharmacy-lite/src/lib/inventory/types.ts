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
  reorderPoint: number
  minStock?: number
  maxStock?: number
  isActive: boolean
  lastSyncedAt: string
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

export type StockMovementRefType =
  | 'dispense'
  | 'purchase_order'
  | 'transfer'
  | 'count'
  | 'goods_receipt'
  | 'void'

export interface StockMovement {
  id: string
  stockBatchId: string
  catalogItemId: string
  type: StockMovementType
  quantity: number
  reason?: string
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
  receivedAt: string
  hlcTimestamp: string
}

export interface PharmacyInventorySettings {
  enablePurchaseOrders: boolean
  enableZones: boolean
  enablePatientCredit: boolean
  enableTransfers: boolean
  requirePaymentOnDispense: boolean
  expiryAlertDays: number
  lowStockAlertEnabled: boolean
  fefoEnforcement: 'suggest' | 'enforce'
  currency: string
  currencyMinorUnits: number
  taxRate: number
  invoicePrefix: string
  locationId: string
  locationName: string
  organizationId?: string
}

export const DEFAULT_PHARMACY_SETTINGS: PharmacyInventorySettings = {
  enablePurchaseOrders: false,
  enableZones: false,
  enablePatientCredit: false,
  enableTransfers: false,
  requirePaymentOnDispense: false,
  expiryAlertDays: 90,
  lowStockAlertEnabled: true,
  fefoEnforcement: 'enforce',
  currency: 'AFN',
  currencyMinorUnits: 2,
  taxRate: 0,
  invoicePrefix: 'INV-',
  locationId: '',
  locationName: '',
}
