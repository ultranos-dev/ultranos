'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { recordDisposal } from '@/lib/inventory/stock-movement'
import type { StockBatch, StockDisposalReason } from '@/lib/inventory/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const DISPOSE_REASONS: StockDisposalReason[] = [
  'expired', 'damaged', 'contaminated', 'recalled', 'patient_return_unusable',
]

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  batch: StockBatch
  performedBy: string
  onSaved: () => void
}

export function DisposeStockDialog({ open, onOpenChange, batch, performedBy, onSaved }: Props) {
  const t = useTranslations('inventory')
  const [qty, setQty] = useState(String(batch.quantityOnHand))
  const [reason, setReason] = useState<StockDisposalReason | ''>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQty(String(batch.quantityOnHand))
    setReason('')
    setNote('')
    setError(null)
  }, [open, batch.quantityOnHand])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const q = parseInt(qty, 10)
    if (Number.isNaN(q) || q <= 0 || q > batch.quantityOnHand) { setError(t('disposeQty')); return }
    if (!reason) { setError(t('selectReason')); return }
    setSaving(true)
    try {
      await recordDisposal({ stockBatchId: batch.id, quantity: q, reasonCode: reason, note: note.trim() || undefined, performedBy })
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
          <DialogTitle>{t('disposeTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('disposeTitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {error && (
            <div role="alert" className="mb-3 rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
          )}
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="dispose-qty">{t('disposeQty')} <span className="text-destructive">*</span></Label>
              <Input id="dispose-qty" data-testid="dispose-qty" type="number" min={1} max={batch.quantityOnHand}
                value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="dispose-reason">{t('disposeReason')} <span className="text-destructive">*</span></Label>
              <select id="dispose-reason" data-testid="dispose-reason" value={reason}
                onChange={(e) => setReason(e.target.value as StockDisposalReason)}
                className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm">
                <option value="">{t('selectReason')}</option>
                {DISPOSE_REASONS.map((r) => (
                  <option key={r} value={r}>{t(`reason_${r}`)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="dispose-note">{t('disposeNote')}</Label>
              <Input id="dispose-note" dir="auto" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button type="submit" data-testid="dispose-submit" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
