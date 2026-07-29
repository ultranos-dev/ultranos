'use client'

// ---------------------------------------------------------------------------
// Story 50.2 — Program Registration Settings Card
// Lets the lab manager register, activate/deactivate donor programs.
// Integrated into LabSettingsView.tsx as a card (Task 3.6).
//
// PHI safety: no patient data involved — program registration is financial/
// operational configuration only.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { saveDonorProgram, getDonorPrograms, getDonorProgramByCode } from '@/lib/db'
import type { DonorProgram, ReimbursementRate } from '@/lib/donor-types'
import { BUILT_IN_PROGRAM_DEFAULTS } from '@/lib/donor-templates'
import { Button } from '@/components/ui/Button'
import { reportDonorAuditEvent } from '@/lib/audit-client'

type View = 'list' | 'add' | 'edit'

interface ProgramFormState {
  programCode: string
  programName: string
  donorOrganization: string
  templateCode: string
  contactInfo: string
  contractStartDate: string
  contractEndDate: string
  reimbursementRates: ReimbursementRate[]
  loincCodes: string[]
  status: 'active' | 'inactive'
}

const EMPTY_FORM: ProgramFormState = {
  programCode: '',
  programName: '',
  donorOrganization: '',
  templateCode: '',
  contactInfo: '',
  contractStartDate: '',
  contractEndDate: '',
  reimbursementRates: [],
  loincCodes: [],
  status: 'active',
}

function programToForm(p: DonorProgram): ProgramFormState {
  return {
    programCode: p.programCode,
    programName: p.programName,
    donorOrganization: p.donorOrganization,
    templateCode: p.templateCode,
    contactInfo: p.contactInfo ?? '',
    contractStartDate: p.contractStartDate ?? '',
    contractEndDate: p.contractEndDate ?? '',
    reimbursementRates: p.reimbursementRates,
    loincCodes: p.loincCodes,
    status: p.status,
  }
}

export function ProgramRegistration() {
  const t = useTranslations('donorReport')
  const [view, setView] = useState<View>('list')
  const [programs, setPrograms] = useState<DonorProgram[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProgramFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const all = await getDonorPrograms()
    setPrograms(all)
  }, [])

  useEffect(() => { void reload() }, [reload])

  function handleSelectPreset(presetCode: string) {
    const preset = BUILT_IN_PROGRAM_DEFAULTS.find((p) => p.programCode === presetCode)
    if (!preset) return
    setForm({
      ...EMPTY_FORM,
      programCode: preset.programCode,
      programName: preset.programName,
      donorOrganization: preset.donorOrganization,
      templateCode: preset.templateCode,
      loincCodes: preset.loincCodes,
      status: 'active',
    })
  }

  async function handleSave() {
    if (!form.programCode || !form.programName || !form.templateCode) {
      setError(t('validationRequired'))
      return
    }
    // Uniqueness check (only for new programs) — normalize before checking
    const normalizedCode = form.programCode.toUpperCase().replace(/\s+/g, '_')
    if (!editingId) {
      const existing = await getDonorProgramByCode(normalizedCode)
      if (existing) {
        setError(t('programCodeExists'))
        return
      }
    }

    setSaving(true)
    setError(null)
    const now = new Date().toISOString()
    const program: DonorProgram = {
      id: editingId ?? crypto.randomUUID(),
      programCode: normalizedCode,
      programName: form.programName,
      donorOrganization: form.donorOrganization,
      status: form.status,
      contactInfo: form.contactInfo || undefined,
      contractStartDate: form.contractStartDate || undefined,
      contractEndDate: form.contractEndDate || undefined,
      reimbursementRates: form.reimbursementRates,
      loincCodes: form.loincCodes,
      templateCode: form.templateCode,
      createdAt: editingId ? (programs.find((p) => p.id === editingId)?.createdAt ?? now) : now,
      updatedAt: now,
      syncStatus: 'pending',
    }
    try {
      await saveDonorProgram(program)
      reportDonorAuditEvent({
        action: 'DONOR_PROGRAM_REGISTERED',
        programCode: program.programCode,
        programId: program.id,
      })
      await reload()
      setView('list')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus(program: DonorProgram) {
    try {
      const updated: DonorProgram = {
        ...program,
        status: program.status === 'active' ? 'inactive' : 'active',
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      }
      await saveDonorProgram(updated)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    }
  }

  function handleEditProgram(program: DonorProgram) {
    setEditingId(program.id)
    setForm(programToForm(program))
    setView('edit')
    setError(null)
  }

  function handleAddNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setView('add')
  }

  if (view === 'list') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{t('programRegistration')}</h3>
          <Button onClick={handleAddNew}>{t('addProgram')}</Button>
        </div>

        {programs.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t('noPrograms')}</p>
        ) : (
          <ul className="space-y-2">
            {programs.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.programName}</p>
                  <p className="text-xs text-muted-foreground">{p.donorOrganization} · {p.programCode}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                    {p.status === 'active' ? t('active') : t('inactive')}
                  </span>
                  <button
                    onClick={() => handleToggleStatus(p)}
                    className="text-xs text-primary hover:underline"
                  >
                    {p.status === 'active' ? t('inactive') : t('active')}
                  </button>
                  <button
                    onClick={() => handleEditProgram(p)}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {t('editProgram')}
                  </button>
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground">←</button>
        <h3 className="text-sm font-semibold text-foreground">
          {view === 'add' ? t('addProgram') : t('editProgram')}
        </h3>
      </div>

      {view === 'add' && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('selectPreset')}
          </label>
          <select
            className="w-full rounded border border-border px-2 py-1 text-sm"
            value=""
            onChange={(e) => { if (e.target.value) handleSelectPreset(e.target.value) }}
          >
            <option value="">{t('customProgram')}</option>
            {BUILT_IN_PROGRAM_DEFAULTS.map((p) => (
              <option key={p.programCode} value={p.programCode}>{p.programName}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('programName')} required>
          <input
            type="text"
            className="form-input"
            value={form.programName}
            onChange={(e) => setForm({ ...form, programName: e.target.value })}
          />
        </FormField>
        <FormField label={t('programCode')} required>
          <input
            type="text"
            className="form-input uppercase"
            value={form.programCode}
            onChange={(e) => setForm({ ...form, programCode: e.target.value })}
            disabled={!!editingId}
          />
        </FormField>
        <FormField label={t('donorOrg')}>
          <input
            type="text"
            className="form-input"
            value={form.donorOrganization}
            onChange={(e) => setForm({ ...form, donorOrganization: e.target.value })}
          />
        </FormField>
        <FormField label={t('contactInfo')}>
          <input
            type="text"
            className="form-input"
            value={form.contactInfo}
            onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
          />
        </FormField>
        <FormField label={t('contractDates')}>
          <div className="flex gap-1">
            <input
              type="date"
              className="form-input flex-1"
              value={form.contractStartDate}
              onChange={(e) => setForm({ ...form, contractStartDate: e.target.value })}
            />
            <span className="self-center text-muted-foreground">–</span>
            <input
              type="date"
              className="form-input flex-1"
              value={form.contractEndDate}
              onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })}
            />
          </div>
        </FormField>
      </div>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setView('list')}>{t('cancel') ?? 'Cancel'}</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('saving') ?? 'Saving…' : t('saveProgram') ?? 'Save Program'}
        </Button>
      </div>
    </div>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}{required && <span className="text-red-500 ms-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
