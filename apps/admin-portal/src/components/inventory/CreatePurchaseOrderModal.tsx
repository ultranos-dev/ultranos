'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface Supplier {
  id: string
  name: string
}

interface Lab {
  id: string
  name: string
}

interface ItemRow {
  labId: string
  reagentCategory: string
  quantity: string
  unit: string
}

interface CreatePurchaseOrderModalProps {
  suppliers: Supplier[]
  labs: Lab[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const EMPTY_ROW: ItemRow = { labId: '', reagentCategory: '', quantity: '', unit: '' }

export function CreatePurchaseOrderModal({ suppliers, labs, open, onOpenChange, onSuccess }: CreatePurchaseOrderModalProps) {
  const [supplierId, setSupplierId] = useState('')
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ROW }])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateItem(idx: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)))
  }

  function addRow() {
    setItems((prev) => [...prev, { ...EMPTY_ROW }])
  }

  function removeRow(idx: number) {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const isValid =
    supplierId !== '' &&
    items.every((r) => r.labId && r.reagentCategory.trim() && parseInt(r.quantity) > 0 && r.unit.trim())

  async function handleSubmit() {
    if (!isValid) return
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.createPurchaseOrder.mutate({
        supplierId,
        items: items.map((r) => ({
          labId: r.labId,
          reagentCategory: r.reagentCategory.trim(),
          quantity: parseInt(r.quantity),
          unit: r.unit.trim(),
        })),
        notes: notes.trim() || undefined,
      })
      onSuccess()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to create purchase order')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
          <DialogDescription className="sr-only">Create a new purchase order for reagents</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mt-3 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Supplier */}
        <div className="mt-4">
          <label htmlFor="po-supplier" className="block text-sm font-medium text-foreground">
            Supplier <span className="text-destructive">*</span>
          </label>
          <select
            id="po-supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Select supplier...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Items */}
        <div className="mt-4">
          <span className="block text-sm font-medium text-foreground">
            Items <span className="text-destructive">*</span>
          </span>
          <div className="mt-2 space-y-3">
            {items.map((row, idx) => (
              <div key={idx} className="flex items-end gap-2 rounded-xl bg-card p-3">
                <div className="flex-1">
                  <label className="block text-xs text-muted-foreground">Lab</label>
                  <select
                    value={row.labId}
                    onChange={(e) => updateItem(idx, 'labId', e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">Select lab...</option>
                    {labs.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-muted-foreground">Reagent Category</label>
                  <Input
                    type="text"
                    value={row.reagentCategory}
                    onChange={(e) => updateItem(idx, 'reagentCategory', e.target.value)}
                    className="mt-0.5 h-8 text-sm"
                    placeholder="e.g. Malaria RDT"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs text-muted-foreground">Qty</label>
                  <Input
                    type="number"
                    min="1"
                    value={row.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    className="mt-0.5 h-8 text-sm"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs text-muted-foreground">Unit</label>
                  <Input
                    type="text"
                    value={row.unit}
                    onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                    className="mt-0.5 h-8 text-sm"
                    placeholder="tests"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(idx)}
                  disabled={items.length <= 1}
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Remove item"
                >
                  &times;
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={addRow}
            className="mt-2"
          >
            + Add item
          </Button>
        </div>

        {/* Notes */}
        <div className="mt-4">
          <label htmlFor="po-notes" className="block text-sm font-medium text-foreground">Notes</label>
          <Textarea
            id="po-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1"
            placeholder="Optional notes..."
          />
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? 'Creating...' : 'Create Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
