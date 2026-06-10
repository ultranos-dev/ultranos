'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, X, Check, AlertTriangle } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import {
  getAllSupplyItems,
  putSupplyItem,
  updateSupplyItem,
  deleteSupplyItem,
} from '@/lib/db'
import type { SupplyItem } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LabRole } from '@ultranos/shared-types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: string[] = [LabRole.SUPERVISOR, LabRole.LAB_MANAGER]

const CATEGORIES = ['Reagent', 'Consumable', 'Control Material'] as const
type Category = typeof CATEGORIES[number]

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------

interface SupplyFormValues {
  name: string
  category: Category
  currentStock: string
  unit: string
  reorderThreshold: string
  criticalThreshold: string
  dailyUsageEstimate: string
}

const EMPTY_FORM: SupplyFormValues = {
  name: '',
  category: 'Reagent',
  currentStock: '',
  unit: '',
  reorderThreshold: '',
  criticalThreshold: '0',
  dailyUsageEstimate: '0',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formToItem(
  form: SupplyFormValues,
  id: string,
  updatedBy: string,
): SupplyItem {
  return {
    id,
    name: form.name.trim(),
    category: form.category,
    currentStock: Math.max(0, parseFloat(form.currentStock) || 0),
    unit: form.unit.trim(),
    reorderThreshold: Math.max(0, parseFloat(form.reorderThreshold) || 0),
    criticalThreshold: Math.max(0, parseFloat(form.criticalThreshold) || 0),
    dailyUsageEstimate: Math.max(0, parseFloat(form.dailyUsageEstimate) || 0),
    lastUpdated: new Date().toISOString(),
    updatedBy: updatedBy || 'unknown',
  }
}

function itemToForm(item: SupplyItem): SupplyFormValues {
  return {
    name: item.name,
    category: item.category as Category,
    currentStock: String(item.currentStock),
    unit: item.unit,
    reorderThreshold: String(item.reorderThreshold),
    criticalThreshold: String(item.criticalThreshold),
    dailyUsageEstimate: String(item.dailyUsageEstimate),
  }
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  itemName,
  onConfirm,
  onCancel,
}: {
  itemName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useTranslations()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus trap + Escape key handler
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const firstFocusable = dialog.querySelector<HTMLElement>(
      'button, [href], input, select, [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key !== 'Tab') return
      const focusable = Array.from(
        dialog!.querySelectorAll<HTMLElement>(
          'button, [href], input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div ref={dialogRef} className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 id="delete-confirm-title" className="text-sm font-semibold text-foreground">
              {t('rag.supply.deleteConfirmTitle')}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('rag.supply.deleteConfirmBody', { name: itemName })}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t('rag.supply.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t('rag.supply.deleteConfirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Supply form
// ---------------------------------------------------------------------------

function SupplyForm({
  initialValues,
  onSubmit,
  onCancel,
  isEdit,
  saveError,
}: {
  initialValues: SupplyFormValues
  onSubmit: (values: SupplyFormValues) => void
  onCancel: () => void
  isEdit: boolean
  saveError?: string | null
}) {
  const t = useTranslations()
  const [form, setForm] = useState<SupplyFormValues>(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof SupplyFormValues, string>>>({})

  function validate(): boolean {
    const newErrors: Partial<Record<keyof SupplyFormValues, string>> = {}
    if (!form.name.trim()) newErrors.name = t('rag.supply.errorRequired')
    const stock = parseFloat(form.currentStock)
    if (form.currentStock === '' || isNaN(stock) || stock < 0) {
      newErrors.currentStock = t('rag.supply.errorNumber')
    }
    if (!form.unit.trim()) newErrors.unit = t('rag.supply.errorRequired')
    const reorder = parseFloat(form.reorderThreshold)
    if (form.reorderThreshold === '' || isNaN(reorder) || reorder < 0) {
      newErrors.reorderThreshold = t('rag.supply.errorNumber')
    }
    const critical = parseFloat(form.criticalThreshold)
    if (form.criticalThreshold !== '' && (isNaN(critical) || critical < 0)) {
      newErrors.criticalThreshold = t('rag.supply.errorNumber')
    }
    const dailyUsage = parseFloat(form.dailyUsageEstimate)
    if (form.dailyUsageEstimate !== '' && (isNaN(dailyUsage) || dailyUsage < 0)) {
      newErrors.dailyUsageEstimate = t('rag.supply.errorNumber')
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleChange(field: keyof SupplyFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (validate()) onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">
        {isEdit ? t('rag.supply.editTitle') : t('rag.supply.addTitle')}
      </h3>

      {/* Save error banner */}
      {saveError && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700" role="alert">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="supply-name" className="block text-xs font-medium text-foreground mb-1">
          {t('rag.supply.fieldName')} <span aria-hidden="true">*</span>
        </label>
        <input
          id="supply-name"
          type="text"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
          aria-required="true"
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
      </div>

      {/* Category */}
      <div>
        <label htmlFor="supply-category" className="block text-xs font-medium text-foreground mb-1">
          {t('rag.supply.fieldCategory')}
        </label>
        <select
          id="supply-category"
          value={form.category}
          onChange={(e) => handleChange('category', e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Stock + Unit (side by side) */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="supply-current-stock" className="block text-xs font-medium text-foreground mb-1">
            {t('rag.supply.fieldCurrentStock')} <span aria-hidden="true">*</span>
          </label>
          <input
            id="supply-current-stock"
            type="number"
            min="0"
            step="any"
            value={form.currentStock}
            onChange={(e) => handleChange('currentStock', e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            aria-required="true"
            aria-invalid={!!errors.currentStock}
          />
          {errors.currentStock && (
            <p className="text-xs text-red-600 mt-1">{errors.currentStock}</p>
          )}
        </div>
        <div className="flex-1">
          <label htmlFor="supply-unit" className="block text-xs font-medium text-foreground mb-1">
            {t('rag.supply.fieldUnit')} <span aria-hidden="true">*</span>
          </label>
          <input
            id="supply-unit"
            type="text"
            value={form.unit}
            onChange={(e) => handleChange('unit', e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            aria-required="true"
            aria-invalid={!!errors.unit}
          />
          {errors.unit && <p className="text-xs text-red-600 mt-1">{errors.unit}</p>}
        </div>
      </div>

      {/* Reorder + Critical thresholds */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-foreground mb-1">
            {t('rag.supply.fieldReorderThreshold')} <span aria-hidden="true">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.reorderThreshold}
            onChange={(e) => handleChange('reorderThreshold', e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            aria-required="true"
            aria-invalid={!!errors.reorderThreshold}
          />
          {errors.reorderThreshold && (
            <p className="text-xs text-red-600 mt-1">{errors.reorderThreshold}</p>
          )}
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-foreground mb-1">
            {t('rag.supply.fieldCriticalThreshold')}
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.criticalThreshold}
            onChange={(e) => handleChange('criticalThreshold', e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
        </div>
      </div>

      {/* Daily usage estimate */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          {t('rag.supply.fieldDailyUsage')}
        </label>
        <input
          type="number"
          min="0"
          step="any"
          value={form.dailyUsageEstimate}
          onChange={(e) => handleChange('dailyUsageEstimate', e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
        />
        <p className="text-xs text-muted-foreground mt-1">{t('rag.supply.dailyUsageHint')}</p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('rag.supply.cancel')}
        </Button>
        <Button type="submit" variant="primary">
          {isEdit ? t('rag.supply.saveChanges') : t('rag.supply.addSupply')}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Quick stock edit (inline on list row)
// ---------------------------------------------------------------------------

function QuickStockEdit({
  item,
  onSave,
  onCancel,
}: {
  item: SupplyItem
  onSave: (newStock: number) => void
  onCancel: () => void
}) {
  const t = useTranslations()
  const [value, setValue] = useState(String(item.currentStock))
  return (
    <div className="flex items-center gap-2 mt-1">
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 rounded-md border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
        aria-label={t('rag.supply.quickStockAriaLabel')}
      />
      <button
        type="button"
        onClick={() => {
          const parsed = parseFloat(value)
          if (!isNaN(parsed) && parsed >= 0) onSave(parsed)
        }}
        className="rounded-md bg-green-600 p-1.5 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-400"
        aria-label={t('rag.supply.confirm')}
      >
        <Check size={13} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-border"
        aria-label={t('rag.supply.cancel')}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SupplyManagement() {
  const t = useTranslations()
  const session = useAuthSessionStore((s) => s.session)

  const [items, setItems] = useState<SupplyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<'none' | 'add' | 'edit'>('none')
  const [editingItem, setEditingItem] = useState<SupplyItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SupplyItem | null>(null)
  const [quickStockItem, setQuickStockItem] = useState<string | null>(null)

  // Role gate
  const isAuthorized =
    session?.labRole != null && ALLOWED_ROLES.includes(session.labRole)

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const all = await getAllSupplyItems()
      setItems(all)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleAdd(values: SupplyFormValues) {
    if (!session) return
    setError(null)
    try {
      const item = formToItem(values, crypto.randomUUID(), session.practitionerId ?? 'unknown')
      await putSupplyItem(item)
      setFormMode('none')
      await loadItems()
    } catch {
      setError(t('rag.supply.errorSave'))
    }
  }

  async function handleEdit(values: SupplyFormValues) {
    if (!session || !editingItem) return
    setError(null)
    try {
      const updated = formToItem(values, editingItem.id, session.practitionerId ?? 'unknown')
      await putSupplyItem(updated)
      setFormMode('none')
      setEditingItem(null)
      await loadItems()
    } catch {
      setError(t('rag.supply.errorSave'))
    }
  }

  async function handleDelete(item: SupplyItem) {
    setError(null)
    try {
      await deleteSupplyItem(item.id)
      setDeleteTarget(null)
      await loadItems()
    } catch {
      setDeleteTarget(null)
      setError(t('rag.supply.errorDelete'))
    }
  }

  async function handleQuickStock(item: SupplyItem, newStock: number) {
    setError(null)
    try {
      await updateSupplyItem(item.id, {
        currentStock: newStock,
        lastUpdated: new Date().toISOString(),
        updatedBy: session?.practitionerId ?? 'unknown',
      })
      setQuickStockItem(null)
      await loadItems()
    } catch {
      setError(t('rag.supply.errorSave'))
    }
  }

  // ---------------------------------------------------------------------------
  // Role gate render
  // ---------------------------------------------------------------------------

  if (!isAuthorized) {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>{t('rag.supply.accessDenied')}</p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Form view
  // ---------------------------------------------------------------------------

  if (formMode === 'add') {
    return (
      <SupplyForm
        initialValues={EMPTY_FORM}
        onSubmit={handleAdd}
        onCancel={() => setFormMode('none')}
        isEdit={false}
        saveError={error}
      />
    )
  }

  if (formMode === 'edit' && editingItem) {
    return (
      <SupplyForm
        initialValues={itemToForm(editingItem)}
        onSubmit={handleEdit}
        onCancel={() => {
          setFormMode('none')
          setEditingItem(null)
        }}
        isEdit={true}
        saveError={error}
      />
    )
  }

  // ---------------------------------------------------------------------------
  // List view
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmDialog
          itemName={deleteTarget.name}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="flex flex-col gap-4">
        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700" role="alert">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">
            {t('rag.supply.manageTitle')}
          </h2>
          <Button
            variant="primary"
            className="flex items-center gap-1.5"
            onClick={() => setFormMode('add')}
          >
            <Plus size={15} aria-hidden="true" />
            {t('rag.supply.addSupply')}
          </Button>
        </div>

        {/* Loading */}
        {loading ? (
          <div aria-busy="true" className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            {t('rag.supply.empty')}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t('rag.supply.colName')}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t('rag.supply.colCategory')}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t('rag.supply.colStock')}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t('rag.supply.colThresholds')}
                  </th>
                  <th className="px-4 py-2.5 text-end text-xs font-medium text-muted-foreground">
                    {t('rag.supply.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 bg-card">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                    <td className="px-4 py-3">
                      {quickStockItem === item.id ? (
                        <QuickStockEdit
                          item={item}
                          onSave={(newStock) => handleQuickStock(item, newStock)}
                          onCancel={() => setQuickStockItem(null)}
                        />
                      ) : (
                        <div>
                          <span className="text-foreground">
                            {item.currentStock} {item.unit}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQuickStockItem(item.id)}
                            className="ms-2 text-xs text-primary-600 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-300 rounded"
                          >
                            {t('rag.supply.updateStock')}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span>
                        {t('rag.supply.reorder')}: {item.reorderThreshold} /&nbsp;
                        {t('rag.supply.critical')}: {item.criticalThreshold}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(item)
                            setFormMode('edit')
                          }}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-border"
                          aria-label={t('rag.supply.editAriaLabel', { name: item.name })}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
                          aria-label={t('rag.supply.deleteAriaLabel', { name: item.name })}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
