'use client'

/**
 * Story 51.4 — Instrument Registry Panel
 * Task 5: Lab manager can register, edit, and set out-of-service instruments.
 * Gated to LAB_MANAGER role.
 * No PHI — instrument metadata is operational configuration only.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  getInstruments,
  registerInstrument,
  updateInstrument,
  setInstrumentStatus,
} from '@/lib/equipment-service'
import type { Instrument } from '@/lib/db'
import { Button } from '@/components/ui/Button'

const INSTRUMENT_TYPES = [
  'Hematology Analyzer',
  'Chemistry Analyzer',
  'Microscope',
  'Coagulation Analyzer',
  'Blood Gas Analyzer',
  'Urinalysis Analyzer',
  'Immunoassay Analyzer',
  'Molecular Analyzer',
  'Other',
]

interface FormState {
  name: string
  type: string
  model: string
  serialNumber: string
  avgRunTimeMinutes: number
  status: 'IN_SERVICE' | 'OUT_OF_SERVICE'
  outOfServiceReason: string
}

const EMPTY_FORM: FormState = {
  name: '',
  type: '',
  model: '',
  serialNumber: '',
  avgRunTimeMinutes: 30,
  status: 'IN_SERVICE',
  outOfServiceReason: '',
}

type ViewMode = 'list' | 'add' | 'edit'

function instrumentToForm(i: Instrument): FormState {
  return {
    name: i.name,
    type: i.type,
    model: i.model,
    serialNumber: i.serialNumber ?? '',
    avgRunTimeMinutes: i.avgRunTimeMinutes,
    status: i.status,
    outOfServiceReason: i.outOfServiceReason ?? '',
  }
}

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ms-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export function InstrumentRegistryPanel() {
  const t = useTranslations('equipment')
  const [view, setView] = useState<ViewMode>('list')
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const all = await getInstruments()
    setInstruments(all)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  function handleAddNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setView('add')
  }

  function handleEdit(instrument: Instrument) {
    setEditingId(instrument.id)
    setForm(instrumentToForm(instrument))
    setError(null)
    setView('edit')
  }

  async function handleToggleStatus(instrument: Instrument) {
    const newStatus: 'IN_SERVICE' | 'OUT_OF_SERVICE' =
      instrument.status === 'IN_SERVICE' ? 'OUT_OF_SERVICE' : 'IN_SERVICE'
    const reason =
      newStatus === 'OUT_OF_SERVICE'
        ? window.prompt(t('outOfServiceReasonPrompt') ?? 'Reason for taking out of service:') ?? undefined
        : undefined
    await setInstrumentStatus(instrument.id, newStatus, reason)
    await reload()
  }

  async function handleSave() {
    if (!form.name.trim() || !form.type || !form.model.trim()) {
      setError(t('validationRequired') ?? 'Name, type, and model are required')
      return
    }
    if (form.avgRunTimeMinutes < 1) {
      setError(t('validationRunTime') ?? 'Average run time must be at least 1 minute')
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        await updateInstrument(editingId, {
          name: form.name.trim(),
          type: form.type,
          model: form.model.trim(),
          serialNumber: form.serialNumber.trim() || null,
          avgRunTimeMinutes: form.avgRunTimeMinutes,
        })
      } else {
        await registerInstrument({
          name: form.name.trim(),
          type: form.type,
          model: form.model.trim(),
          serialNumber: form.serialNumber.trim() || null,
          avgRunTimeMinutes: form.avgRunTimeMinutes,
          status: 'IN_SERVICE',
          outOfServiceReason: null,
        })
      }
      await reload()
      setView('list')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (view === 'list') {
    return (
      <div className="space-y-3" data-testid="instrument-registry-panel">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{t('instruments')}</h3>
          <Button onClick={handleAddNew} data-testid="add-instrument-btn">
            {t('addInstrument')}
          </Button>
        </div>

        {instruments.length === 0 ? (
          <p className="text-sm text-gray-500 italic" data-testid="no-instruments-message">
            {t('noInstruments') ?? 'No instruments registered yet.'}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="instrument-list">
            {instruments.map((inst) => (
              <li
                key={inst.id}
                className="flex items-start justify-between rounded-lg border border-gray-200 px-3 py-2 gap-2"
                data-testid={`instrument-item-${inst.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{inst.name}</p>
                  <p className="text-xs text-gray-500">
                    {inst.type} · {inst.model}
                    {inst.serialNumber && ` · S/N: ${inst.serialNumber}`}
                  </p>
                  <p className="text-xs text-gray-400">
                    {t('avgRunTime')}: {inst.avgRunTimeMinutes} min
                  </p>
                  {inst.status === 'OUT_OF_SERVICE' && inst.outOfServiceReason && (
                    <p className="text-xs text-red-500 mt-0.5">
                      {t('outOfServiceReason') ?? 'Reason'}: {inst.outOfServiceReason}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      inst.status === 'IN_SERVICE'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                    data-testid={`instrument-status-${inst.id}`}
                  >
                    {inst.status === 'IN_SERVICE' ? t('inService') : t('outOfService')}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(inst)}
                      className="text-xs text-blue-600 hover:underline"
                      data-testid={`edit-instrument-${inst.id}`}
                    >
                      {t('editInstrument') ?? 'Edit'}
                    </button>
                    <button
                      onClick={() => handleToggleStatus(inst)}
                      className={`text-xs hover:underline ${
                        inst.status === 'IN_SERVICE'
                          ? 'text-red-500'
                          : 'text-green-600'
                      }`}
                      data-testid={`toggle-status-${inst.id}`}
                    >
                      {inst.status === 'IN_SERVICE'
                        ? t('setOutOfService') ?? 'Set Out of Service'
                        : t('setInService') ?? 'Set In Service'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // Add / Edit form
  return (
    <div className="space-y-4" data-testid="instrument-form">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView('list')}
          className="text-sm text-gray-500 hover:text-gray-700"
          aria-label="Back to list"
        >
          ←
        </button>
        <h3 className="text-sm font-semibold text-gray-700">
          {view === 'add' ? t('addInstrument') : t('editInstrument') ?? 'Edit Instrument'}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('instrumentName') ?? 'Name'} required>
          <input
            type="text"
            className="form-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            data-testid="instrument-name-input"
          />
        </FormField>

        <FormField label={t('instrumentType') ?? 'Type'} required>
          <select
            className="form-input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            data-testid="instrument-type-select"
          >
            <option value="">{t('selectType') ?? '— Select type —'}</option>
            {INSTRUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label={t('instrumentModel') ?? 'Model'} required>
          <input
            type="text"
            className="form-input"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            data-testid="instrument-model-input"
          />
        </FormField>

        <FormField label={t('serialNumber') ?? 'Serial Number'}>
          <input
            type="text"
            className="form-input"
            value={form.serialNumber}
            onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
            data-testid="instrument-serial-input"
          />
        </FormField>

        <FormField label={t('avgRunTime')} required>
          <input
            type="number"
            min={1}
            className="form-input"
            value={form.avgRunTimeMinutes}
            onChange={(e) =>
              setForm({ ...form, avgRunTimeMinutes: parseInt(e.target.value, 10) || 1 })
            }
            data-testid="instrument-runtime-input"
          />
        </FormField>
      </div>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setView('list')}>
          {t('cancel') ?? 'Cancel'}
        </Button>
        <Button onClick={handleSave} disabled={saving} data-testid="save-instrument-btn">
          {saving
            ? t('saving') ?? 'Saving…'
            : view === 'add'
              ? t('addInstrument')
              : t('saveInstrument') ?? 'Save'}
        </Button>
      </div>
    </div>
  )
}
