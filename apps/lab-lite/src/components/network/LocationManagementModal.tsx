'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from '@ultranos/ui-kit/icons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ultranos/ui-kit/components/ui/dialog'
import type { LabLocation, CreateLocationInput } from '@/types/lab-network'
import {
  addSatelliteLocation,
  updateLocation,
  setLocationMode,
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

  // P10: Load parent lab options on mount for existing satellites (type select is disabled)
  useEffect(() => {
    if (isEdit && editLocation?.type === 'satellite') void loadMainLabs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        // P7: Route mode changes through setLocationMode to emit NETWORK_MODE_CHANGED
        const modeChanged = form.mode !== editLocation.mode
        const updates: Partial<LabLocation> = {
          name: form.name,
          address: form.address || undefined,
          parentLabId: form.parentLabId || undefined,
        }
        // Only call updateLocation if non-mode fields changed
        const nonModeChanged =
          form.name !== editLocation.name ||
          (form.address || undefined) !== (editLocation.address ?? undefined) ||
          (form.parentLabId || undefined) !== (editLocation.parentLabId ?? undefined)
        if (nonModeChanged) {
          await updateLocation(editLocation.id, updates)
        }
        if (modeChanged) {
          await setLocationMode(editLocation.id, form.mode, actorId)
        }
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('editLocation') : t('addLocation')}
          </DialogTitle>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
              className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted/30"
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
              className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="mt-2 rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              {t('deactivateLocation')}
            </button>
          )}

          {confirming && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{t('deactivateConfirm')}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleDeactivate()}
                  disabled={saving}
                  className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
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
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
