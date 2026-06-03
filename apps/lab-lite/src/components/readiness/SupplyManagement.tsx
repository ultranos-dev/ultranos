'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { DirectionalIcon } from '@ultranos/ui-kit'
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
    currentStock: parseFloat(form.currentStock) || 0,
    unit: form.unit.trim(),
    reorderThreshold: parseFloat(form.reorderThreshold) || 0,
    criticalThreshold: parseFloat(form.criticalThreshold) || 0,
    dailyUsageEstimate: parseFloat(form.dailyUsageEstimate) || 0,
    lastUpdated: new Date().toISOString(),
    updatedBy,
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
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 id="delete-confirm-title" className="text-sm font-semibold text-neutral-800">
              {t('rag.supply.deleteConfirmTitle')}
            </h3>
            <p className="text-sm text-neutral-600 mt-1">
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
}: {
  initialValues: SupplyFormValues
  onSubmit: (values: SupplyFormValues) => void
  onCancel: () => void
  isEdit: boolean
}) {
  const t = useTranslations()
  const [form, setForm] = useState<SupplyFormValues>(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof SupplyFormValues, string>>>({})

  function validate(): boolean {
    const newErrors: Partial<Record<keyof SupplyFormValues, string>> = {}
    if (!form.name.trim()) newErrors.name = t('rag.supply.errorRequired')
    if (form.currentStock === '' || isNaN(parseFloat(form.currentStock))) {
      newErrors.currentStock = t('rag.supply.errorNumber')
    }
    if (!form.unit.trim()) newErrors.unit = t('rag.supply.errorRequired')
    if (form.reorderThreshold === '' || isNaN(parseFloat(form.reorderThreshold))) {
      newErrors.reorderThreshold = t('rag.supply.errorNumber')
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
      <h3 className="text-sm font-semibold text-neutral-800">
        {isEdit ? t('rag.supply.editTitle') : t('rag.supply.addTitle')}
      </h3>

      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          {t('rag.supply.fieldName')} <span aria-hidden="true">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
          aria-required="true"
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          {t('rag.supply.fieldCategory')}
        </label>
        <select
          value={form.category}
          onChange={(e) => handleChange('category', e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
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
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            {t('rag.supply.fieldCurrentStock')} <span aria-hidden="true">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.currentStock}
            onChange={(e) => handleChange('currentStock', e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            aria-required="true"
            aria-invalid={!!errors.currentStock}
          />
          {errors.currentStock && (
            <p className="text-xs text-red-600 mt-1">{errors.currentStock}</p>
          )}
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            {t('rag.supply.fieldUnit')} <span aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            value={form.unit}
            onChange={(e) => handleChange('unit', e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            aria-required="true"
            aria-invalid={!!errors.unit}
          />
          {errors.unit && <p className="text-xs text-red-600 mt-1">{errors.unit}</p>}
        </div>
      </div>

      {/* Reorder + Critical thresholds */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            {t('rag.supply.fieldReorderThreshold')} <span aria-hidden="true">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.reorderThreshold}
            onChange={(e) => handleChange('reorderThreshold', e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            aria-required="true"
            aria-invalid={!!errors.reorderThreshold}
          />
          {errors.reorderThreshold && (
            <p className="text-xs text-red-600 mt-1">{errors.reorderThreshold}</p>
          )}
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            {t('rag.supply.fieldCriticalThreshold')}
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.criticalThreshold}
            onChange={(e) => handleChange('criticalThreshold', e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
        </div>
      </div>

      {/* Daily usage estimate */}
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          {t('rag.supply.fieldDailyUsage')}
        </label>
        <input
          type="number"
          min="0"
          step="any"
          value={form.dailyUsageEstimate}
          onChange={(e) => handleChange('dailyUsageEstimate', e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
        />
        <p className="text-xs text-neutral-400 mt-1">{t('rag.supply.dailyUsageHint')}</p>
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
        className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
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
        className="rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-300"
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
    const item = formToItem(values, crypto.randomUUID(), session.practitionerId)
    await putSupplyItem(item)
    setFormMode('none')
    await loadItems()
  }

  async function handleEdit(values: SupplyFormValues) {
    if (!session || !editingItem) return
    const updated = formToItem(values, editingItem.id, session.practitionerId)
    await putSupplyItem(updated)
    setFormMode('none')
    setEditingItem(null)
    await loadItems()
  }

  async function handleDelete(item: SupplyItem) {
    await deleteSupplyItem(item.id)
    setDeleteTarget(null)
    await loadItems()
  }

  async function handleQuickStock(item: SupplyItem, newStock: number) {
    await updateSupplyItem(item.id, {
      currentStock: newStock,
      lastUpdated: new Date().toISOString(),
      updatedBy: session?.practitionerId ?? 'unknown',
    })
    setQuickStockItem(null)
    await loadItems()
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
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-800">
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
                className="h-14 animate-pulse rounded-lg bg-neutral-100"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-400">
            {t('rag.supply.empty')}
          </div>
        ) : (
          <div className="rounded-lg border border-neutral-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-neutral-500">
                    {t('rag.supply.colName')}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-neutral-500">
                    {t('rag.supply.colCategory')}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-neutral-500">
                    {t('rag.supply.colStock')}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-neutral-500">
                    {t('rag.supply.colThresholds')}
                  </th>
                  <th className="px-4 py-2.5 text-end text-xs font-medium text-neutral-500">
                    {t('rag.supply.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-neutral-800">{item.name}</td>
                    <td className="px-4 py-3 text-neutral-500">{item.category}</td>
                    <td className="px-4 py-3">
                      {quickStockItem === item.id ? (
                        <QuickStockEdit
                          item={item}
                          onSave={(newStock) => handleQuickStock(item, newStock)}
                          onCancel={() => setQuickStockItem(null)}
                        />
                      ) : (
                        <div>
                          <span className="text-neutral-800">
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
                    <td className="px-4 py-3 text-xs text-neutral-500">
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
                          className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                          aria-label={t('rag.supply.editAriaLabel', { name: item.name })}
                        >
                          <DirectionalIcon category="navigation">
                            <Pencil size={14} aria-hidden="true" />
                          </DirectionalIcon>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
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
