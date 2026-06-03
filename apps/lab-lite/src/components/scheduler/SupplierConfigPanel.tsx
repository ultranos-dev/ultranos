'use client'

/**
 * Story 48.2 — Supplier Lead Time Configuration Panel
 *
 * CRUD for supplier records and reagent-to-supplier mapping.
 * Persisted to Dexie supplier_config and reagent_supplier_mapping tables.
 * Accessible from the Settings page (/[locale]/settings/suppliers).
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2, Plus, Save } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import {
  getAllSuppliers,
  addSupplier,
  updateSupplier,
  deleteSupplier,
  getAllReagents,
  getAllReagentSupplierMappings,
  setReagentSupplier,
  removeReagentSupplier,
  type SupplierConfig,
  type ReagentInventoryEntry,
  type ReagentSupplierMapping,
} from '@/lib/db'

// ---------------------------------------------------------------------------
// Supplier form
// ---------------------------------------------------------------------------

interface SupplierFormState {
  supplierName: string
  leadTimeDays: string   // string for controlled input
  contactInfo: string
  notes: string
}

const EMPTY_FORM: SupplierFormState = {
  supplierName: '',
  leadTimeDays: '14',
  contactInfo: '',
  notes: '',
}

function SupplierForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: SupplierFormState
  onSave: (values: SupplierFormState) => Promise<void>
  onCancel: () => void
}) {
  const t = useTranslations('scheduler.supplier')
  const [values, setValues] = useState<SupplierFormState>(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<SupplierFormState>>({})

  function validate(): boolean {
    const e: Partial<SupplierFormState> = {}
    if (!values.supplierName.trim()) e.supplierName = t('validation.nameRequired')
    const days = Number(values.leadTimeDays)
    if (isNaN(days) || days < 1 || days > 365) e.leadTimeDays = t('validation.leadTimeRange')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      await onSave(values)
    } finally {
      setSaving(false)
    }
  }

  const field = (
    name: keyof SupplierFormState,
    label: string,
    type: string = 'text',
    extra?: React.InputHTMLAttributes<HTMLInputElement>,
  ) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-700" htmlFor={`supplier-${name}`}>
        {label}
      </label>
      <input
        id={`supplier-${name}`}
        type={type}
        value={values[name]}
        onChange={(ev) => setValues((v) => ({ ...v, [name]: ev.target.value }))}
        className={`rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          errors[name] ? 'border-red-400' : 'border-neutral-300'
        }`}
        {...extra}
      />
      {errors[name] && <p className="text-xs text-red-600">{errors[name]}</p>}
    </div>
  )

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 border border-neutral-200 rounded-lg bg-neutral-50">
      {field('supplierName', t('name'))}
      {field('leadTimeDays', t('leadTimeDays'), 'number', { min: 1, max: 365 })}
      {field('contactInfo', t('contactInfo'))}
      {field('notes', t('notes'))}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          <Save size={13} aria-hidden="true" className="me-1" />
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Reagent–Supplier mapping row
// ---------------------------------------------------------------------------

function ReagentMappingRow({
  reagent,
  suppliers,
  currentSupplierId,
  onChange,
}: {
  reagent: ReagentInventoryEntry
  suppliers: SupplierConfig[]
  currentSupplierId: string | undefined
  onChange: (reagentId: string, supplierId: string | null) => void
}) {
  const t = useTranslations('scheduler.supplier')
  return (
    <tr className="border-b border-neutral-100 last:border-0">
      <td className="py-2 ps-3 pe-2 text-sm text-neutral-800">{reagent.name}</td>
      <td className="py-2 ps-2 pe-3">
        <select
          aria-label={t('assignSupplier', { reagent: reagent.name })}
          value={currentSupplierId ?? ''}
          onChange={(e) => onChange(reagent.reagentId, e.target.value || null)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid={`mapping-${reagent.reagentId}`}
        >
          <option value="">{t('noSupplier')}</option>
          {suppliers.map((s) => (
            <option key={s.supplierId} value={s.supplierId}>
              {s.supplierName} ({s.leadTimeDays}d)
            </option>
          ))}
        </select>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function SupplierConfigPanel() {
  const t = useTranslations('scheduler.supplier')
  const [suppliers, setSuppliers] = useState<SupplierConfig[]>([])
  const [reagents, setReagents] = useState<ReagentInventoryEntry[]>([])
  const [mappings, setMappings] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [s, r, m] = await Promise.all([
        getAllSuppliers(),
        getAllReagents(),
        getAllReagentSupplierMappings(),
      ])
      setSuppliers(s)
      setReagents(r.filter((r) => r.status === 'ACTIVE' as unknown as string || true))
      setMappings(new Map(m.map((mp: ReagentSupplierMapping) => [mp.reagentId, mp.supplierId])))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  async function handleSaveSupplier(values: SupplierFormState, existingId?: number) {
    const payload = {
      supplierId: crypto.randomUUID(),
      supplierName: values.supplierName.trim(),
      leadTimeDays: Number(values.leadTimeDays),
      contactInfo: values.contactInfo.trim(),
      notes: values.notes.trim(),
      updatedAt: new Date().toISOString(),
    }

    if (existingId != null) {
      await updateSupplier(existingId, payload)
    } else {
      await addSupplier(payload)
    }

    setEditingId(null)
    await loadData()
  }

  async function handleDelete(id: number, reagentId?: string) {
    await deleteSupplier(id)
    if (reagentId) await removeReagentSupplier(reagentId)
    await loadData()
  }

  async function handleMappingChange(reagentId: string, supplierId: string | null) {
    if (supplierId) {
      await setReagentSupplier(reagentId, supplierId)
    } else {
      await removeReagentSupplier(reagentId)
    }
    setMappings((prev) => {
      const next = new Map(prev)
      if (supplierId) next.set(reagentId, supplierId)
      else next.delete(reagentId)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-neutral-500">
        <svg className="animate-spin h-4 w-4 mx-auto text-neutral-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-6" data-testid="supplier-config-panel">
      {/* Supplier list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-neutral-900">{t('title')}</h3>
          <Button
            size="sm"
            onClick={() => setEditingId('new')}
            data-testid="add-supplier"
          >
            <Plus size={13} aria-hidden="true" className="me-1" />
            {t('addSupplier')}
          </Button>
        </div>

        {editingId === 'new' && (
          <div className="mb-4">
            <SupplierForm
              onSave={(values) => handleSaveSupplier(values)}
              onCancel={() => setEditingId(null)}
            />
          </div>
        )}

        {suppliers.length === 0 && editingId !== 'new' && (
          <p className="text-sm text-neutral-500">{t('noSuppliers')}</p>
        )}

        <div className="flex flex-col gap-3">
          {suppliers.map((supplier) => (
            <div key={supplier.id} className="rounded-lg border border-neutral-200 p-3">
              {editingId === supplier.id ? (
                <SupplierForm
                  initial={{
                    supplierName: supplier.supplierName,
                    leadTimeDays: String(supplier.leadTimeDays),
                    contactInfo: supplier.contactInfo,
                    notes: supplier.notes,
                  }}
                  onSave={(values) => handleSaveSupplier(values, supplier.id)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-neutral-900">{supplier.supplierName}</span>
                    <span className="text-xs text-neutral-500">
                      {t('leadTime', { days: supplier.leadTimeDays })}
                      {supplier.contactInfo && ` · ${supplier.contactInfo}`}
                    </span>
                    {supplier.notes && (
                      <span className="text-xs text-neutral-400">{supplier.notes}</span>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(supplier.id ?? null)}
                      data-testid={`edit-supplier-${supplier.id}`}
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(supplier.id!)}
                      className="text-red-500 hover:text-red-700"
                      data-testid={`delete-supplier-${supplier.id}`}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Reagent-supplier mapping */}
      {reagents.length > 0 && suppliers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 mb-3">{t('mappingTitle')}</h3>
          <div className="rounded-lg border border-neutral-200 overflow-hidden">
            <table className="w-full text-start">
              <thead>
                <tr className="text-xs text-neutral-500 border-b border-neutral-100 bg-neutral-50">
                  <th className="ps-3 pe-2 py-2 text-start font-medium">{t('reagent')}</th>
                  <th className="ps-2 pe-3 py-2 text-start font-medium">{t('defaultSupplier')}</th>
                </tr>
              </thead>
              <tbody>
                {reagents.map((r) => (
                  <ReagentMappingRow
                    key={r.reagentId}
                    reagent={r}
                    suppliers={suppliers}
                    currentSupplierId={mappings.get(r.reagentId)}
                    onChange={handleMappingChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
