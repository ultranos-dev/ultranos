'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit, X, CheckCircle } from '@ultranos/ui-kit/icons'
import { getActiveReferenceLabs, addReferenceLab, updateReferenceLab, deactivateReferenceLab } from '@/lib/reference-lab-config'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LabRole } from '@ultranos/shared-types'
import type { ReferenceLab, CreateRefLabInput } from '@/types/reference-lab'

const ALLOWED_ROLES: LabRole[] = [LabRole.LAB_MANAGER, LabRole.SUPERVISOR]

interface LabFormState {
  name: string
  accreditationNumber: string
  address: string
  contactPhone: string
  contactEmail: string
  supportedTests: string
  averageTATDays: string
}

const EMPTY_FORM: LabFormState = {
  name: '',
  accreditationNumber: '',
  address: '',
  contactPhone: '',
  contactEmail: '',
  supportedTests: '',
  averageTATDays: '',
}

export function ReferenceLabConfigPanel() {
  const session = useAuthSessionStore((s) => s.session)
  const [labs, setLabs] = useState<ReferenceLab[]>([])
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<LabFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canEdit = session?.labRole && ALLOWED_ROLES.includes(session.labRole as LabRole)

  const loadLabs = useCallback(async () => {
    const all = await getActiveReferenceLabs()
    setLabs(all)
  }, [])

  useEffect(() => { void loadLabs() }, [loadLabs])

  function startEdit(lab: ReferenceLab) {
    setEditingId(lab.id)
    setForm({
      name: lab.name,
      accreditationNumber: lab.accreditationNumber,
      address: lab.address,
      contactPhone: lab.contactPhone ?? '',
      contactEmail: lab.contactEmail ?? '',
      supportedTests: lab.supportedTests.join(', '),
      averageTATDays: Object.entries(lab.averageTATDays)
        .map(([code, days]) => `${code}:${days}`)
        .join(', '),
    })
  }

  function parseFormToInput(f: LabFormState): CreateRefLabInput {
    const supportedTests = f.supportedTests
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const averageTATDays: Record<string, number> = {}
    f.averageTATDays.split(',').forEach((entry) => {
      const [code, days] = entry.split(':').map((s) => s.trim())
      if (code && days) averageTATDays[code] = Number(days)
    })
    return {
      name: f.name,
      accreditationNumber: f.accreditationNumber,
      address: f.address,
      contactPhone: f.contactPhone || undefined,
      contactEmail: f.contactEmail || undefined,
      supportedTests,
      averageTATDays,
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.userId || !canEdit) return
    setLoading(true)
    setError(null)
    try {
      const input = parseFormToInput(form)
      if (editingId === 'new') {
        await addReferenceLab(input, session.userId)
      } else if (editingId) {
        await updateReferenceLab(editingId, input, session.userId)
      }
      setEditingId(null)
      setForm(EMPTY_FORM)
      await loadLabs()
    } catch {
      setError('Failed to save reference lab.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeactivate(id: string) {
    if (!session?.userId || !canEdit) return
    if (!confirm('Deactivate this reference lab? It will no longer appear in the send-out selector.')) return
    try {
      await deactivateReferenceLab(id, session.userId)
      await loadLabs()
    } catch {
      setError('Failed to deactivate reference lab.')
    }
  }

  if (!canEdit) {
    return (
      <div role="alert" className="rounded-md bg-neutral-50 border border-neutral-200 px-4 py-3 text-sm text-neutral-600">
        Only Lab Managers and Supervisors can configure reference labs.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">Reference Laboratories</h3>
        {canEdit && editingId === null && (
          <button
            type="button"
            onClick={() => { setEditingId('new'); setForm(EMPTY_FORM) }}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus size={14} /> Add Lab
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {/* Add/Edit form */}
      {editingId !== null && (
        <form onSubmit={handleSave} className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-medium text-blue-900">
            {editingId === 'new' ? 'Add Reference Lab' : 'Edit Reference Lab'}
          </p>
          {[
            { id: 'lab-name', label: 'Name', key: 'name', required: true, placeholder: 'e.g., Kabul Central Reference Lab' },
            { id: 'lab-accred', label: 'Accreditation #', key: 'accreditationNumber', required: true, placeholder: 'e.g., AFG-LAB-001' },
            { id: 'lab-address', label: 'Address', key: 'address', required: true, placeholder: '' },
            { id: 'lab-phone', label: 'Phone', key: 'contactPhone', required: false, placeholder: '' },
            { id: 'lab-email', label: 'Email', key: 'contactEmail', required: false, placeholder: '' },
            { id: 'lab-tests', label: 'Supported LOINC codes (comma-separated)', key: 'supportedTests', required: false, placeholder: '2085-9, 4548-4, 10524-7' },
            { id: 'lab-tat', label: 'Average TAT days (LOINC:days, comma-separated)', key: 'averageTATDays', required: false, placeholder: '2085-9:5, 4548-4:3' },
          ].map(({ id, label, key, required, placeholder }) => (
            <div key={id}>
              <label htmlFor={id} className="block text-xs font-medium text-neutral-700 mb-0.5">
                {label}{required && <span aria-hidden="true" className="text-red-500 ms-0.5">*</span>}
              </label>
              <input
                id={id}
                type="text"
                value={form[key as keyof LabFormState]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                required={required}
                placeholder={placeholder}
                className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(EMPTY_FORM) }}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {/* Labs list */}
      {labs.length === 0 && editingId === null ? (
        <p className="text-sm text-neutral-500">No reference labs configured yet.</p>
      ) : (
        <ul className="space-y-2">
          {labs.map((lab) => (
            <li key={lab.id} className="flex items-start justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">{lab.name}</p>
                <p className="text-xs text-neutral-500">Accred. #{lab.accreditationNumber} · {lab.address}</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Supports: {lab.supportedTests.length} test{lab.supportedTests.length !== 1 ? 's' : ''}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-2 ms-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(lab)}
                    aria-label={`Edit ${lab.name}`}
                    className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-blue-600"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeactivate(lab.id)}
                    aria-label={`Deactivate ${lab.name}`}
                    className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
