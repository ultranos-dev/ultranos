'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { CatalogSearchInput } from '@/components/pharmacy/inventory/CatalogSearchInput'
import { addCountItem, completeStockCount } from '@/lib/procurement/stock-count-service'
import { getFefoBatches } from '@/lib/inventory/fefo'
import type { StockCount, StockCountItem } from '@/lib/procurement/types'
import type { CatalogItem } from '@/lib/inventory/types'

interface StockCountFormProps {
  count: StockCount
  onCompleted: () => void
}

export function StockCountForm({ count, onCompleted }: StockCountFormProps) {
  const t = useTranslations('procurement')
  const [items, setItems] = useState<StockCountItem[]>(count.items)
  const [completing, setCompleting] = useState(false)

  const typeLabels: Record<string, string> = {
    full: t('fullCount'),
    spot: t('spotCheck'),
    controlled_only: t('controlledOnly'),
  }

  async function handleProductSelect(catalogItem: CatalogItem) {
    const batches = await getFefoBatches(catalogItem.id)
    const newItems: StockCountItem[] = []

    for (const batch of batches) {
      const alreadyExists = items.some((i) => i.stockBatchId === batch.id)
      if (alreadyExists) continue

      const item: StockCountItem = {
        catalogItemId: catalogItem.id,
        catalogItemName: catalogItem.name,
        stockBatchId: batch.id,
        batchNumber: batch.batchNumber,
        expectedQty: batch.quantityOnHand,
        actualQty: batch.quantityOnHand,
        variance: 0,
      }
      newItems.push(item)
      await addCountItem(count.id, item)
    }

    if (newItems.length > 0) {
      setItems((prev) => [...prev, ...newItems])
    }
  }

  function handleActualQtyChange(index: number, value: string) {
    const qty = parseInt(value, 10)
    if (isNaN(qty) || qty < 0) return

    setItems((prev) => {
      const updated = [...prev]
      const item = updated[index]
      updated[index] = {
        ...item,
        actualQty: qty,
        variance: qty - item.expectedQty,
      }
      return updated
    })

    const item = items[index]
    const updatedItem: StockCountItem = {
      ...item,
      actualQty: qty,
      variance: qty - item.expectedQty,
    }
    addCountItem(count.id, updatedItem)
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      await completeStockCount(count.id)
      onCompleted()
    } finally {
      setCompleting(false)
    }
  }

  const varianceCount = items.filter((i) => i.variance !== 0).length

  function varianceColor(variance: number) {
    if (variance > 0) return 'text-success'
    if (variance < 0) return 'text-destructive'
    return 'text-muted-foreground'
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t('stockCountTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {typeLabels[count.type]} — started{' '}
            {new Date(count.startedAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div>
        <CatalogSearchInput
          onSelect={handleProductSelect}
          placeholder={t('searchProductsPlaceholder')}
        />
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-muted-foreground">{t('noItemsAdded')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('searchProductsToCount')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('productCol')}</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('batchCol')}</th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">{t('expectedCol')}</th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">{t('actualCol')}</th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">{t('varianceCol')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, index) => (
                <tr
                  key={item.stockBatchId}
                  className={item.variance !== 0 ? 'bg-warning/5' : ''}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {item.catalogItemName}
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{item.batchNumber}</td>
                  <td className="px-4 py-3 text-end text-muted-foreground">{item.expectedQty}</td>
                  <td className="px-4 py-3 text-end">
                    <input
                      type="number"
                      value={item.actualQty}
                      onChange={(e) => handleActualQtyChange(index, e.target.value)}
                      min={0}
                      className="w-20 rounded border border-border px-2 py-1 text-end text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
                    />
                  </td>
                  <td className={`px-4 py-3 text-end font-medium ${varianceColor(item.variance)}`}>
                    {item.variance > 0 ? '+' : ''}{item.variance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <p className="text-sm text-muted-foreground">
          {t('itemsWithVariance', { count: items.length, variances: varianceCount })}
        </p>
        <Button onClick={handleComplete} disabled={completing || items.length === 0}>
          {completing ? t('completing') : varianceCount > 0 ? t('completeCountWithVariances', { variances: varianceCount }) : t('completeCount')}
        </Button>
      </div>
    </div>
  )
}
