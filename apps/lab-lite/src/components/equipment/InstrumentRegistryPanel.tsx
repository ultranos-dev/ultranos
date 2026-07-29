'use client'

/**
 * Story 51.4 — Instrument Registry Panel
 * Task 5: Lab manager can register, edit, and set out-of-service instruments.
 * Gated to LAB_MANAGER role.
 * No PHI — instrument metadata is operational configuration only.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
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
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}
        {required && <span className="text-red-500 ms-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

/**
 * P8: Inline modal to collect an out-of-service reason.
 * Replaces window.prompt — accessible, RTL-safe, works in all PWA contexts.
 */
function OutOfServiceModal({
  instrumentName,
  onConfirm,
  onCancel,
}: {
  instrumentName: string
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const t = useTranslations('equipment')
  const [reason, setReason] = useState('')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t('setOutOfService') ?? 'Set Out of Service'}
    >
      <div className="w-full max-w-sm rounded-xl bg-card shadow-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          {t('setOutOfService') ?? 'Set Out of Service'}
        </h2>
        <p className="text-sm text-muted-foreground">{instrumentName}</p>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('outOfServiceReason') ?? 'Reason'}
          </label>
          <input
            type="text"
            className="form-input w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('outOfServiceReasonPrompt') ?? 'Reason for taking out of service'}
            autoFocus
            data-testid="oos-reason-input"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {t('cancel') ?? 'Cancel'}
          </Button>
          <Button onClick={() => onConfirm(reason)} data-testid="oos-confirm-btn">
            {t('setOutOfService') ?? 'Confirm'}
          </Button>
        </div>
      </div>
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
  // P8: modal state for out-of-service reason
  const [oosTarget, setOosTarget] = useState<Instrument | null>(null)

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

  // P3: guard against acting on a cancelled prompt.
  // P8: use inline modal instead of window.prompt for out-of-service reason.
  async function handleToggleStatus(instrument: Instrument) {
    if (instrument.status === 'IN_SERVICE') {
      // Show modal to collect reason before committing status change
      setOosTarget(instrument)
    } else {
      // Restoring to IN_SERVICE needs no reason — apply immediately
      await setInstrumentStatus(instrument.id, 'IN_SERVICE')
      await reload()
    }
  }

  async function handleOosConfirm(reason: string) {
    if (!oosTarget) return
    await setInstrumentStatus(oosTarget.id, 'OUT_OF_SERVICE', reason || undefined)
    setOosTarget(null)
    await reload()
  }

  function handleOosCancel() {
    setOosTarget(null)
    // P3: user cancelled — no status change occurs
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
      <div className="flex flex-col gap-4" data-testid="instrument-registry-panel">
        {/* P8: out-of-service reason modal */}
        {oosTarget && (
          <OutOfServiceModal
            instrumentName={oosTarget.name}
            onConfirm={handleOosConfirm}
            onCancel={handleOosCancel}
          />
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{t('instruments')}</h3>
          <Button onClick={handleAddNew} data-testid="add-instrument-btn">
            {t('addInstrument')}
          </Button>
        </div>

        {instruments.length === 0 ? (
          <EmptyState title={t('noInstruments') ?? 'No instruments registered yet.'} data-testid="no-instruments-message" />
        ) : (
          <ul className="space-y-2" data-testid="instrument-list">
            {instruments.map((inst) => (
              <li
                key={inst.id}
                className="flex items-start justify-between rounded-lg border border-border px-3 py-2 gap-2"
                data-testid={`instrument-item-${inst.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{inst.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {inst.type} · {inst.model}
                    {inst.serialNumber && ` · S/N: ${inst.serialNumber}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
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
                      className="text-xs text-primary hover:underline"
                      data-testid={`edit-instrument-${inst.id}`}
                    >
                      {t('editInstrument') ?? 'Edit'}
                    </button>
                    <button
                      onClick={() => void handleToggleStatus(inst)}
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
    <div className="flex flex-col gap-4" data-testid="instrument-form">
      <div className="flex items-center gap-2">
        {/* P9: RTL-safe back arrow using DirectionalIcon */}
        <button
          onClick={() => setView('list')}
          className="text-sm text-muted-foreground hover:text-foreground"
          aria-label={t('backToList') ?? 'Back to list'}
        >
          <DirectionalIcon category="navigation">
            <ChevronLeft size={18} />
          </DirectionalIcon>
        </button>
        <h3 className="text-sm font-semibold text-foreground">
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
