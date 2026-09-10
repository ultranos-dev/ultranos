'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { recordAdjustment } from '@/lib/inventory/stock-movement'
import type { CatalogItem, StockAdjustmentReason, StockBatch } from '@/lib/inventory/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const ADJUST_REASONS: StockAdjustmentReason[] = [
  'miscount', 'damage', 'theft', 'expiry_correction', 'system_error',
]

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  batch: StockBatch
  catalogItem?: CatalogItem
  performedBy: string
  onSaved: () => void
}

export function AdjustStockDialog({ open, onOpenChange, batch, catalogItem, performedBy, onSaved }: Props) {
  const t = useTranslations('inventory')
  const [newQty, setNewQty] = useState(String(batch.quantityOnHand))
  const [reason, setReason] = useState<StockAdjustmentReason | ''>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNewQty(String(batch.quantityOnHand))
    setReason('')
    setNote('')
    setError(null)
  }, [open, batch.quantityOnHand])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const qty = parseInt(newQty, 10)
    if (Number.isNaN(qty) || qty < 0) { setError(t('adjustNewQty')); return }
    if (!reason) { setError(t('selectReason')); return }
    setSaving(true)
    try {
      await recordAdjustment({ stockBatchId: batch.id, newQuantity: qty, reasonCode: reason, note: note.trim() || undefined, performedBy })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('adjustTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('adjustTitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {error && (
            <div role="alert" className="mb-3 rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
          )}
          {catalogItem?.controlledSchedule && (
            <div className="mb-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {t('adjustControlledWarning')}
            </div>
          )}
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>{t('adjustCurrentQty')}</Label>
              <div className="font-numeric text-sm text-muted-foreground">{batch.quantityOnHand}</div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="adjust-new-qty">{t('adjustNewQty')} <span className="text-destructive">*</span></Label>
              <Input id="adjust-new-qty" data-testid="adjust-new-qty" type="number" min={0}
                value={newQty} onChange={(e) => setNewQty(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="adjust-reason">{t('adjustReason')} <span className="text-destructive">*</span></Label>
              <select id="adjust-reason" data-testid="adjust-reason" value={reason}
                onChange={(e) => setReason(e.target.value as StockAdjustmentReason)}
                className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm">
                <option value="">{t('selectReason')}</option>
                {ADJUST_REASONS.map((r) => (
                  <option key={r} value={r}>{t(`reason_${r}`)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="adjust-note">{t('adjustNote')}</Label>
              <Input id="adjust-note" dir="auto" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button type="submit" data-testid="adjust-submit" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
