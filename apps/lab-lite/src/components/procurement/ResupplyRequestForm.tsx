'use client'

/**
 * ResupplyRequestForm — Story 52.3 Task 2
 *
 * Multi-item resupply request form with:
 *  - Pre-population from burndown alerts and inventory context
 *  - Urgency selector with guidance text (routine/urgent/critical)
 *  - Review screen before submission
 *  - Offline-first: saves to Dexie immediately, syncs when online
 *  - RTL-ready: logical CSS properties throughout
 *
 * No PHI: reagent operational data only.
 */

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Plus, Trash2, ShoppingCart, CheckCircle } from '@ultranos/ui-kit/icons'
import { validateResupplyRequest, submitResupplyRequest } from '@/lib/procurement/request-sync'
import type { ResupplyRequestDraft } from '@/lib/procurement/request-sync'
import type { ResupplyRequestItem } from '@/lib/db'

type ItemDraft = Omit<ResupplyRequestItem, 'unitPrice' | 'totalPrice'>

interface ResupplyRequestFormProps {
  /** Pre-filled items (from burndown alert or inventory view) */
  initialItems?: ItemDraft[]
  /** Pre-selected urgency */
  initialUrgency?: 'routine' | 'urgent' | 'critical'
  /** Called after successful submission */
  onSuccess?: (requestId: string) => void
  /** Called when user cancels */
  onCancel?: () => void
}

const URGENCY_CONFIG = {
  routine: {
    color: 'text-green-700 border-green-300 bg-green-50',
    badge: 'bg-green-100 text-green-800',
  },
  urgent: {
    color: 'text-yellow-700 border-yellow-300 bg-yellow-50',
    badge: 'bg-yellow-100 text-yellow-800',
  },
  critical: {
    color: 'text-red-700 border-red-300 bg-red-50',
    badge: 'bg-red-100 text-red-800',
  },
}

function emptyItem(): ItemDraft {
  return {
    reagentCode: '',
    reagentDisplay: '',
    quantityRequested: 1,
    unitOfMeasure: 'tests',
    currentStock: 0,
    daysOfSupplyRemaining: 0,
  }
}

export function ResupplyRequestForm({
  initialItems,
  initialUrgency = 'routine',
  onSuccess,
  onCancel,
}: ResupplyRequestFormProps) {
  const t = useTranslations('procurement')

  const [items, setItems] = useState<ItemDraft[]>(
    initialItems && initialItems.length > 0 ? initialItems : [emptyItem()],
  )
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'critical'>(initialUrgency)
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [step, setStep] = useState<'form' | 'review' | 'success'>('form')
  const [submitting, setSubmitting] = useState(false)
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null)

  const updateItem = useCallback((index: number, updates: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)))
  }, [])

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, emptyItem()])
  }, [])

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleReview = useCallback(() => {
    const draft: ResupplyRequestDraft = { items, urgency, notes }
    const result = validateResupplyRequest(draft)
    if (!result.valid) {
      setErrors(result.errors)
      return
    }
    setErrors([])
    setStep('review')
  }, [items, urgency, notes])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    try {
      const { requestId } = await submitResupplyRequest({ items, urgency, notes })
      setSubmittedRequestId(requestId)
      setStep('success')
      onSuccess?.(requestId)
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Submission failed'])
      setStep('form')
    } finally {
      setSubmitting(false)
    }
  }, [items, urgency, notes, onSuccess])

  const urgencyConfig = URGENCY_CONFIG[urgency]

  // ---- Success screen ----
  if (step === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CheckCircle className="text-green-600" size={48} />
        <h2 className="text-xl font-semibold">{t('form.successTitle')}</h2>
        <p className="text-sm text-gray-600">{t('form.successBody')}</p>
        <p className="font-mono text-xs text-gray-400">{submittedRequestId}</p>
      </div>
    )
  }

  // ---- Review screen ----
  if (step === 'review') {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t('form.reviewTitle')}</h2>

        <div className={`rounded-md border p-3 ${urgencyConfig.color}`}>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${urgencyConfig.badge}`}>
            {t(`urgency.${urgency}`)}
          </span>
        </div>

        <ul className="divide-y divide-gray-100 rounded-md border">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">{item.reagentDisplay || item.reagentCode}</p>
                <p className="text-sm text-gray-500">
                  {item.reagentCode} · {t('form.currentStock')}: {item.currentStock} {item.unitOfMeasure}
                </p>
              </div>
              <span className="font-semibold">
                {item.quantityRequested} {item.unitOfMeasure}
              </span>
            </li>
          ))}
        </ul>

        {notes && (
          <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
            <span className="font-medium">{t('form.notesLabel')}: </span>
            {notes}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep('form')}
            className="flex-1 rounded-md border px-4 py-2 text-sm font-medium"
          >
            {t('form.back')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? t('form.submitting') : t('form.confirm')}
          </button>
        </div>
      </div>
    )
  }

  // ---- Main form ----
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t('form.title')}</h2>

      {/* Urgency selector */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('form.urgencyLabel')}</legend>
        {(['routine', 'urgent', 'critical'] as const).map((u) => (
          <label
            key={u}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${urgency === u ? URGENCY_CONFIG[u].color : 'border-gray-200'}`}
          >
            <input
              type="radio"
              name="urgency"
              value={u}
              checked={urgency === u}
              onChange={() => setUrgency(u)}
              className="mt-0.5"
            />
            <div>
              <p className="font-medium">{t(`urgency.${u}`)}</p>
              <p className="text-xs text-gray-600">{t(`urgencyHelp.${u}`)}</p>
            </div>
          </label>
        ))}
      </fieldset>

      {/* Items list */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{t('form.itemsLabel')}</p>

        {items.map((item, i) => (
          <div key={i} className="rounded-md border p-4">
            <div className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">{t('form.reagentCode')}</label>
                  <input
                    type="text"
                    value={item.reagentCode}
                    onChange={(e) => updateItem(i, { reagentCode: e.target.value })}
                    placeholder="e.g. MAL-001"
                    className="w-full rounded border px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">{t('form.reagentDisplay')}</label>
                  <input
                    type="text"
                    value={item.reagentDisplay}
                    onChange={(e) => updateItem(i, { reagentDisplay: e.target.value })}
                    placeholder="e.g. Malaria RDT"
                    className="w-full rounded border px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">{t('form.quantity')}</label>
                  <input
                    type="number"
                    min={1}
                    value={item.quantityRequested}
                    onChange={(e) => updateItem(i, { quantityRequested: parseInt(e.target.value, 10) || 1 })}
                    className="w-full rounded border px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">{t('form.unit')}</label>
                  <select
                    value={item.unitOfMeasure}
                    onChange={(e) => updateItem(i, { unitOfMeasure: e.target.value })}
                    className="w-full rounded border px-3 py-1.5 text-sm"
                  >
                    <option value="tests">tests</option>
                    <option value="mL">mL</option>
                    <option value="strips">strips</option>
                    <option value="kits">kits</option>
                    <option value="bottles">bottles</option>
                  </select>
                </div>
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="mt-1 text-gray-400 hover:text-red-600"
                  aria-label={t('form.removeItem')}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 rounded-md border border-dashed px-4 py-2 text-sm text-blue-600 hover:border-blue-400"
        >
          <Plus size={14} />
          {t('form.addItem')}
        </button>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-sm font-medium">{t('form.notesLabel')}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder={t('form.notesPlaceholder')}
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <p className="mt-1 text-end text-xs text-gray-400">{notes.length}/500</p>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <ul className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errors.map((e, i) => (
            <li key={i} className="flex items-start gap-1">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border px-4 py-2 text-sm font-medium"
          >
            {t('form.cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={handleReview}
          className="flex-1 flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <ShoppingCart size={16} />
          {t('form.review')}
        </button>
      </div>
    </div>
  )
}
