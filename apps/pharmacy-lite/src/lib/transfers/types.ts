export type TransferStatus = 'requested' | 'approved' | 'shipped' | 'received' | 'cancelled'

export interface TransferItem {
  catalogItemId: string
  catalogItemName: string
  stockBatchId: string
  batchNumber: string
  quantity: number
}

export interface StockTransfer {
  id: string
  fromLocationId: string
  fromLocationName: string
  toLocationId: string
  toLocationName: string
  status: TransferStatus
  items: TransferItem[]
  requestedBy: string
  requestedAt: string
  approvedBy?: string
  approvedAt?: string
  shippedAt?: string
  receivedAt?: string
  receivedBy?: string
  cancelledReason?: string
  hlcTimestamp: string
}

export interface NetworkStockItem {
  catalogItemId: string
  catalogItemName: string
  locationId: string
  locationName: string
  totalOnHand: number
  nearestExpiry?: string
}
