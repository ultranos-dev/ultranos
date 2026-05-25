import type { EntityTable } from 'dexie'
import type {
  CatalogItem,
  StockBatch,
  StockMovement,
  GoodsReceipt,
  PharmacyInventorySettings,
} from './inventory/types'

export type InventoryTables = {
  catalogItems: EntityTable<CatalogItem, 'id'>
  stockBatches: EntityTable<StockBatch, 'id'>
  stockMovements: EntityTable<StockMovement, 'id'>
  goodsReceipts: EntityTable<GoodsReceipt, 'id'>
  pharmacySettings: EntityTable<PharmacyInventorySettings, 'locationId'>
}

export const INVENTORY_STORES = {
  catalogItems: 'id, barcode, name, category, controlledSchedule, isActive',
  stockBatches: 'id, catalogItemId, expiryDate, status, locationId, [catalogItemId+status]',
  stockMovements: 'id, stockBatchId, catalogItemId, type, timestamp, hlcTimestamp',
  goodsReceipts: 'id, receivedAt, supplierId',
  pharmacySettings: 'locationId',
}
