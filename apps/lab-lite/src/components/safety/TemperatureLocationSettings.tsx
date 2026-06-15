'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TemperatureLocation, TemperatureLocationType } from '@/types/temperature-monitoring'
import {
  getTemperatureLocations,
  putTemperatureLocation,
  deleteTemperatureLocation,
} from '@/lib/db'
import { Button } from '@/components/ui/Button'

const LOCATION_TYPE_DEFAULTS: Record<TemperatureLocationType, { min: number; max: number }> = {
  FRIDGE: { min: 2, max: 8 },
  FREEZER: { min: -25, max: -15 },
  AMBIENT: { min: 15, max: 25 },
}

const DEFAULT_LOCATIONS: Omit<TemperatureLocation, 'id'>[] = [
  { name: 'Reagent Fridge 1', minTemp: 2, maxTemp: 8, type: 'FRIDGE', sensorId: null },
  { name: 'Reagent Fridge 2', minTemp: 2, maxTemp: 8, type: 'FRIDGE', sensorId: null },
  { name: 'Ambient', minTemp: 15, maxTemp: 25, type: 'AMBIENT', sensorId: null },
]

interface FormState {
  name: string
  type: TemperatureLocationType
  minTemp: string
  maxTemp: string
  sensorId: string
}

const emptyForm: FormState = {
  name: '',
  type: 'FRIDGE',
  minTemp: '2',
  maxTemp: '8',
  sensorId: '',
}

export function TemperatureLocationSettings() {
  const t = useTranslations('safety.temperature')
  const [locations, setLocations] = useState<TemperatureLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showForm, setShowForm] = useState(false)

  const loadLocations = async () => {
    setLoading(true)
    const locs = await getTemperatureLocations()
    setLocations(locs)
    setLoading(false)
  }

  useEffect(() => {
    void loadLocations()
  }, [])

  const seedDefaults = async () => {
    for (const loc of DEFAULT_LOCATIONS) {
      await putTemperatureLocation({ ...loc, id: crypto.randomUUID() })
    }
    await loadLocations()
  }

  const handleTypeChange = (type: TemperatureLocationType) => {
    const defaults = LOCATION_TYPE_DEFAULTS[type]
    setForm((f) => ({
      ...f,
      type,
      minTemp: String(defaults.min),
      maxTemp: String(defaults.max),
    }))
  }

  const handleEdit = (loc: TemperatureLocation) => {
    setEditingId(loc.id)
    setForm({
      name: loc.name,
      type: loc.type,
      minTemp: String(loc.minTemp),
      maxTemp: String(loc.maxTemp),
      sensorId: loc.sensorId ?? '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    const min = parseFloat(form.minTemp)
    const max = parseFloat(form.maxTemp)
    if (!form.name.trim() || isNaN(min) || isNaN(max) || min >= max) return

    const loc: TemperatureLocation = {
      id: editingId ?? crypto.randomUUID(),
      name: form.name.trim(),
      type: form.type,
      minTemp: min,
      maxTemp: max,
      sensorId: form.sensorId.trim() || null,
    }

    await putTemperatureLocation(loc)
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    await loadLocations()
  }

  const handleDelete = async (id: string) => {
    await deleteTemperatureLocation(id)
    await loadLocations()
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  if (loading) {
    return <div className="animate-pulse h-32 bg-muted rounded-lg" aria-busy="true" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {t('locationsTitle')}
        </h2>
        <Button
          variant="primary"
          className="text-sm"
          onClick={() => {
            setForm(emptyForm)
            setEditingId(null)
            setShowForm(true)
          }}
        >
          {t('addLocation')}
        </Button>
      </div>

      {/* Seed defaults prompt */}
      {locations.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">{t('noLocationsSetup')}</p>
          <Button variant="outline" onClick={seedDefaults}>
            {t('seedDefaults')}
          </Button>
        </div>
      )}

      {/* Location list */}
      {locations.map((loc) => (
        <div
          key={loc.id}
          className="rounded-lg border border-border bg-card p-4 flex items-center justify-between"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{loc.name}</p>
            <p className="text-xs text-muted-foreground">
              {t(`locationType.${loc.type.toLowerCase()}`)} — {loc.minTemp}–{loc.maxTemp}°C
              {loc.sensorId && ` — BLE: ${loc.sensorId}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="text-xs" onClick={() => handleEdit(loc)}>
              {t('edit')}
            </Button>
            <Button
              variant="ghost"
              className="text-xs text-red-600"
              onClick={() => handleDelete(loc.id)}
            >
              {t('delete')}
            </Button>
          </div>
        </div>
      ))}

      {/* Add/Edit form */}
      {showForm && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {editingId ? t('editLocation') : t('addLocation')}
          </h3>

          <div>
            <label htmlFor="loc-name" className="block text-xs text-muted-foreground mb-1">
              {t('locationName')}
            </label>
            <input
              id="loc-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded border border-border px-3 py-1.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="loc-type" className="block text-xs text-muted-foreground mb-1">
              {t('type')}
            </label>
            <select
              id="loc-type"
              value={form.type}
              onChange={(e) => handleTypeChange(e.target.value as TemperatureLocationType)}
              className="w-full rounded border border-border px-3 py-1.5 text-sm"
            >
              <option value="FRIDGE">{t('locationType.fridge')}</option>
              <option value="FREEZER">{t('locationType.freezer')}</option>
              <option value="AMBIENT">{t('locationType.ambient')}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="loc-min" className="block text-xs text-muted-foreground mb-1">
                {t('minTemp')} (°C)
              </label>
              <input
                id="loc-min"
                type="number"
                step="0.5"
                value={form.minTemp}
                onChange={(e) => setForm((f) => ({ ...f, minTemp: e.target.value }))}
                className="w-full rounded border border-border px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="loc-max" className="block text-xs text-muted-foreground mb-1">
                {t('maxTemp')} (°C)
              </label>
              <input
                id="loc-max"
                type="number"
                step="0.5"
                value={form.maxTemp}
                onChange={(e) => setForm((f) => ({ ...f, maxTemp: e.target.value }))}
                className="w-full rounded border border-border px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="loc-sensor" className="block text-xs text-muted-foreground mb-1">
              {t('bleDeviceId')} ({t('optional')})
            </label>
            <input
              id="loc-sensor"
              type="text"
              value={form.sensorId}
              onChange={(e) => setForm((f) => ({ ...f, sensorId: e.target.value }))}
              className="w-full rounded border border-border px-3 py-1.5 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 text-sm" onClick={handleCancel}>
              {t('cancel')}
            </Button>
            <Button variant="primary" className="flex-1 text-sm" onClick={handleSave}>
              {t('save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
