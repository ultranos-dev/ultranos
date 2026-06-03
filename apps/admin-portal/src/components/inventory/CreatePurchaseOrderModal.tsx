'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  onClose: () => void
  onSuccess: () => void
}

const EMPTY_ROW: ItemRow = { labId: '', reagentCategory: '', quantity: '', unit: '' }

export function CreatePurchaseOrderModal({ suppliers, labs, onClose, onSuccess }: CreatePurchaseOrderModalProps) {
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create purchase order')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">Create Purchase Order</h2>

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
                <button
                  onClick={() => removeRow(idx)}
                  disabled={items.length <= 1}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 transition-colors"
                  aria-label="Remove item"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addRow}
            className="mt-2 text-sm text-primary font-medium hover:underline"
          >
            + Add item
          </button>
        </div>

        {/* Notes */}
        <div className="mt-4">
          <label htmlFor="po-notes" className="block text-sm font-medium text-foreground">Notes</label>
          <textarea
            id="po-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Optional notes..."
          />
        </div>

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? 'Creating...' : 'Create Order'}
          </Button>
        </div>
      </div>
    </div>
  )
}
