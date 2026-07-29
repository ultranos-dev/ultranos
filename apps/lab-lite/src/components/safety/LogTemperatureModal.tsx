'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TemperatureLocation } from '@/types/temperature-monitoring'
import { TemperatureSource } from '@/types/temperature-monitoring'
import { logReading } from '@/lib/safety/temperature-service'
import { generateAlert } from '@/lib/safety/temperature-alerts'
import { reportTemperatureEvent } from '@/lib/audit-client'
import { Button } from '@/components/ui/Button'

interface LogTemperatureModalProps {
  location: TemperatureLocation
  onClose: () => void
  onSaved: () => void
}

const MIN_PLAUSIBLE = -80
const MAX_PLAUSIBLE = 60

export function LogTemperatureModal({
  location,
  onClose,
  onSaved,
}: LogTemperatureModalProps) {
  const t = useTranslations('safety.temperature')
  const [temperature, setTemperature] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [excursionWarning, setExcursionWarning] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const validate = (value: string): number | null => {
    const num = parseFloat(value)
    if (isNaN(num)) return null
    if (num < MIN_PLAUSIBLE || num > MAX_PLAUSIBLE) return null
    return num
  }

  const handleTemperatureChange = (value: string) => {
    setTemperature(value)
    setError(null)
    setExcursionWarning(null)

    const num = validate(value)
    if (num === null && value !== '' && value !== '-') {
      setError(t('invalidTemperature'))
      return
    }

    if (num !== null) {
      if (num < location.minTemp || num > location.maxTemp) {
        setExcursionWarning(
          t('excursionWarningBeforeSave', {
            temp: num,
            min: location.minTemp,
            max: location.maxTemp,
          }),
        )
      }
    }
  }

  const handleSubmit = async () => {
    const num = validate(temperature)
    if (num === null) {
      setError(t('invalidTemperature'))
      return
    }

    setSaving(true)
    try {
      const { reading, excursion } = await logReading({
        locationId: location.id,
        temperatureCelsius: num,
        source: TemperatureSource.MANUAL,
      })

      reportTemperatureEvent({
        action: 'TEMPERATURE_READING_LOGGED',
        locationId: location.id,
        locationName: location.name,
        temperature: num,
        source: 'MANUAL',
      })

      if (excursion) {
        const alert = generateAlert(excursion, location)
        reportTemperatureEvent({
          action: 'TEMPERATURE_EXCURSION_DETECTED',
          locationId: location.id,
          locationName: location.name,
          temperature: num,
          source: 'MANUAL',
        })
      }

      onSaved()
    } catch (err) {
      setError(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-card p-6 shadow-xl mx-4"
        role="dialog"
        aria-modal="true"
        aria-label={t('logReadingTitle')}
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {t('logReadingTitle')}
        </h2>

        {/* Location (pre-selected) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            {t('location')}
          </label>
          <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
            {location.name}
          </div>
        </div>

        {/* Temperature input */}
        <div className="mb-4">
          <label
            htmlFor="temp-input"
            className="block text-sm font-medium text-muted-foreground mb-1"
          >
            {t('temperatureLabel')} (°C)
          </label>
          <input
            id="temp-input"
            type="number"
            step="0.1"
            min={MIN_PLAUSIBLE}
            max={MAX_PLAUSIBLE}
            value={temperature}
            onChange={(e) => handleTemperatureChange(e.target.value)}
            className="w-full rounded border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
        </div>

        {/* Validation error */}
        {error && (
          <div className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Excursion warning before save */}
        {excursionWarning && !error && (
          <div className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700" role="alert">
            {excursionWarning}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleSubmit}
            disabled={saving || !temperature}
          >
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
