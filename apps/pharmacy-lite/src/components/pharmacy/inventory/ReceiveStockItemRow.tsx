'use client'

import { Button } from '@/components/ui/button'
import type { CatalogItem } from '@/lib/inventory/types'

export interface ReceiveLineItem {
  catalogItem: CatalogItem
  batchNumber: string
  lotNumber: string
  expiryDate: string
  quantity: number
  costPrice: number
  sellingPrice: number
}

interface ReceiveStockItemRowProps {
  item: ReceiveLineItem
  index: number
  currencyMinorUnits: number
  onUpdate: (index: number, updates: Partial<ReceiveLineItem>) => void
  onRemove: (index: number) => void
}

export function ReceiveStockItemRow({ item, index, currencyMinorUnits, onUpdate, onRemove }: ReceiveStockItemRowProps) {
  const formatPrice = (minorUnits: number) => (minorUnits / Math.pow(10, currencyMinorUnits)).toFixed(currencyMinorUnits)
  const parsePrice = (display: string) => Math.round(parseFloat(display || '0') * Math.pow(10, currencyMinorUnits))

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid={`receive-item-${index}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">{item.catalogItem.name}</p>
          <p className="text-xs text-neutral-500">{item.catalogItem.strength} {item.catalogItem.form}</p>
        </div>
        <Button variant="ghost" type="button" onClick={() => onRemove(index)} aria-label="Remove item">
          &times;
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Batch No. *</label>
          <input type="text" value={item.batchNumber} onChange={(e) => onUpdate(index, { batchNumber: e.target.value })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Expiry Date *</label>
          <input type="date" value={item.expiryDate} onChange={(e) => onUpdate(index, { expiryDate: e.target.value })} min={new Date().toISOString().split('T')[0]} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Quantity *</label>
          <input type="number" min={1} value={item.quantity || ''} onChange={(e) => onUpdate(index, { quantity: parseInt(e.target.value) || 0 })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Cost Price *</label>
          <input type="number" step="0.01" min="0" value={item.costPrice ? formatPrice(item.costPrice) : ''} onChange={(e) => onUpdate(index, { costPrice: parsePrice(e.target.value) })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Selling Price *</label>
          <input type="number" step="0.01" min="0" value={item.sellingPrice ? formatPrice(item.sellingPrice) : ''} onChange={(e) => onUpdate(index, { sellingPrice: parsePrice(e.target.value) })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Lot No.</label>
          <input type="text" value={item.lotNumber} onChange={(e) => onUpdate(index, { lotNumber: e.target.value })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
        </div>
      </div>
    </div>
  )
}
