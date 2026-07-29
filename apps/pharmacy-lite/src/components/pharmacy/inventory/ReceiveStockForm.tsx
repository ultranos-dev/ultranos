'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Package } from '@ultranos/ui-kit/icons'
import { CatalogSearchInput } from './CatalogSearchInput'
import { ReceiveStockItemRow, type ReceiveLineItem } from './ReceiveStockItemRow'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { setDrugPrice } from '@/lib/trpc'
import type { CatalogItem } from '@/lib/inventory/types'

interface ReceiveStockFormProps {
  locationId: string
  currencyMinorUnits: number
  onComplete: () => void
}

export function ReceiveStockForm({ locationId, currencyMinorUnits, onComplete }: ReceiveStockFormProps) {
  const t = useTranslations('inventory')
  const [items, setItems] = useState<ReceiveLineItem[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const session = useAuthSessionStore((s) => s.session)

  const handleAddItem = useCallback((catalogItem: CatalogItem) => {
    setItems((prev) => [...prev, {
      catalogItem,
      batchNumber: '',
      lotNumber: '',
      expiryDate: '',
      quantity: 0,
      costPrice: 0,
      sellingPrice: catalogItem.defaultSellingPrice,
    }])
  }, [])

  const handleUpdateItem = useCallback((index: number, updates: Partial<ReceiveLineItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)))
  }, [])

  const handleRemoveItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const isValid = items.length > 0 && items.every(
    (item) => item.batchNumber.trim() && item.expiryDate && item.quantity > 0 && item.costPrice > 0 && item.sellingPrice > 0
  )

  const handleSubmit = async () => {
    if (!isValid || !session) return
    setSaving(true)
    setError(null)
    try {
      await processGoodsReceipt({
        items: items.map((item) => ({
          catalogItemId: item.catalogItem.id,
          batchNumber: item.batchNumber.trim(),
          lotNumber: item.lotNumber.trim() || undefined,
          expiryDate: item.expiryDate,
          quantity: item.quantity,
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
        })),
        receivedBy: session.practitionerId ?? session.userId,
        locationId,
        notes: notes.trim() || undefined,
      })
      onComplete()

      // Best-effort: publish retail prices to the Hub drug catalog.
      // Fire-and-forget — never awaited to avoid blocking onComplete.
      for (const item of items) {
        if (item.catalogItem.atcCode && item.sellingPrice > 0) {
          void setDrugPrice({
            atcCode: item.catalogItem.atcCode,
            facilityId: locationId,
            retailPrice: item.sellingPrice / Math.pow(10, currencyMinorUnits),
            stockSignal: 'in_stock',
            doseForm: item.catalogItem.form,
          }).catch(() => {
            // best-effort — swallow any error
          })
        }
      }
    } catch {
      setError(t('failedProcessReceipt'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="receive-stock-form">
      <CatalogSearchInput onSelect={handleAddItem} />
      {error && (
        <div role="alert" className="rounded-md bg-destructive/5 border border-destructive/20 px-4 py-2 text-sm text-destructive">{error}</div>
      )}
      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t('searchOrScanProduct')}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <ReceiveStockItemRow key={`${item.catalogItem.id}-${index}`} item={item} index={index} currencyMinorUnits={currencyMinorUnits} onUpdate={handleUpdateItem} onRemove={handleRemoveItem} />
          ))}
        </div>
      )}
      {items.length > 0 && (
        <>
          <div>
            <label htmlFor="receipt-notes" className="mb-1 block text-xs font-medium text-muted-foreground">{t('notesOptional')}</label>
            <input id="receipt-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('notesPlaceholder')} className="w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
          </div>
          <Button variant="default" className="w-full" type="button" disabled={!isValid || saving} onClick={handleSubmit} data-testid="confirm-receipt-btn">
            {saving ? t('processingReceipt') : t('confirmReceipt', { count: items.length })}
          </Button>
        </>
      )}
    </div>
  )
}
