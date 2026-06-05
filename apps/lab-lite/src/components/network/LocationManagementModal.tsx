'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from '@ultranos/ui-kit/icons'
import type { LabLocation, CreateLocationInput } from '@/types/lab-network'
import {
  addSatelliteLocation,
  updateLocation,
  deactivateLocation,
} from '@/lib/network-service'
import { getActiveLocations } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface Props {
  /** If provided, modal is in edit mode. Otherwise, in add mode. */
  editLocation?: LabLocation
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  name: string
  type: 'main' | 'satellite'
  mode: 'full' | 'collection-only'
  address: string
  parentLabId: string
}

function initialForm(loc?: LabLocation): FormState {
  return {
    name: loc?.name ?? '',
    type: loc?.type ?? 'satellite',
    mode: loc?.mode ?? 'full',
    address: loc?.address ?? '',
    parentLabId: loc?.parentLabId ?? '',
  }
}

export function LocationManagementModal({ editLocation, onClose, onSaved }: Props) {
  const t = useTranslations('network')
  const session = useAuthSessionStore((s) => s.session)
  const actorId = session?.userId ?? 'unknown'

  const [form, setForm] = useState<FormState>(() => initialForm(editLocation))
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mainLabOptions, setMainLabOptions] = useState<Array<{ id: string; name: string }>>([])
  const [mainLabsLoaded, setMainLabsLoaded] = useState(false)

  const isEdit = editLocation != null

  async function loadMainLabs() {
    if (mainLabsLoaded) return
    try {
      const active = await getActiveLocations()
      setMainLabOptions(active.filter((l) => l.type === 'main').map((l) => ({ id: l.id, name: l.name })))
    } catch {
      // non-fatal
    } finally {
      setMainLabsLoaded(true)
    }
  }

  function handleTypeChange(type: FormState['type']) {
    setForm((f) => ({ ...f, type }))
    if (type === 'satellite') void loadMainLabs()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError(t('nameRequired'))
      return
    }
    if (form.type === 'satellite' && !form.parentLabId) {
      setError(t('parentLabRequired'))
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        const updates: Partial<LabLocation> = {
          name: form.name,
          mode: form.mode,
          address: form.address || undefined,
          parentLabId: form.parentLabId || undefined,
        }
        await updateLocation(editLocation.id, updates)
      } else {
        const input: CreateLocationInput = {
          name: form.name,
          type: form.type,
          mode: form.mode,
          address: form.address || undefined,
          parentLabId: form.parentLabId || undefined,
        }
        await addSatelliteLocation(input)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!isEdit) return
    setSaving(true)
    try {
      await deactivateLocation(editLocation.id, actorId)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deactivateError'))
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="location-modal-title" className="text-base font-semibold text-foreground">
            {isEdit ? t('editLocation') : t('addLocation')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded p-1 text-muted-foreground hover:text-muted-foreground"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-4 px-5 py-5">
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="loc-name">
              {t('locationName')} <span aria-hidden="true">*</span>
            </label>
            <input
              id="loc-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type — disabled in edit mode */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="loc-type">
              {t('locationType')}
            </label>
            <select
              id="loc-type"
              value={form.type}
              disabled={isEdit}
              onChange={(e) => handleTypeChange(e.target.value as FormState['type'])}
              className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-muted/30"
            >
              <option value="main">{t('typeMain')}</option>
              <option value="satellite">{t('typeSatellite')}</option>
            </select>
          </div>

          {/* Mode */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="loc-mode">
              {t('locationMode')}
            </label>
            <select
              id="loc-mode"
              value={form.mode}
              onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as FormState['mode'] }))}
              className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="full">{t('modeFull')}</option>
              <option value="collection-only">{t('modeCollectionOnly')}</option>
            </select>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="loc-address">
              {t('locationAddress')}
            </label>
            <input
              id="loc-address"
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Parent Lab — only for satellite */}
          {form.type === 'satellite' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="loc-parent">
                {t('parentLab')} <span aria-hidden="true">*</span>
              </label>
              <select
                id="loc-parent"
                value={form.parentLabId}
                required
                onChange={(e) => setForm((f) => ({ ...f, parentLabId: e.target.value }))}
                className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('selectParentLab')}</option>
                {mainLabOptions.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Deactivate section (edit only) */}
          {isEdit && !confirming && editLocation.status === 'active' && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-2 rounded-md border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              {t('deactivateLocation')}
            </button>
          )}

          {confirming && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{t('deactivateConfirm')}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleDeactivate()}
                  disabled={saving}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? t('saving') : t('confirmDeactivate')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Save / Cancel */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted/30"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
