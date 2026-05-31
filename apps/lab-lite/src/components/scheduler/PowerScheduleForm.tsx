'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import {
  getPowerSchedules,
  putPowerSchedule,
  deletePowerSchedule,
  type PowerScheduleEntry,
} from '@/lib/db'

const DAY_KEYS = [
  'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday',
] as const

export function PowerScheduleForm() {
  const t = useTranslations('scheduler.powerSchedule')
  const [schedules, setSchedules] = useState<PowerScheduleEntry[]>([])
  const [startTime, setStartTime] = useState('09:00')
  const [durationHours, setDurationHours] = useState(4)
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const loadSchedules = useCallback(async () => {
    const all = await getPowerSchedules()
    setSchedules(all)
  }, [])

  useEffect(() => {
    loadSchedules()
  }, [loadSchedules])

  const handleSave = useCallback(async () => {
    setError(null)
    setSuccessMsg(null)

    if (!startTime) {
      setError(t('validationStartTime'))
      return
    }
    if (durationHours <= 0) {
      setError(t('validationDuration'))
      return
    }

    // Check for overlap
    const existing = schedules.find(
      (s) => s.dayOfWeek === dayOfWeek,
    )
    if (existing) {
      setError(t('validationOverlap'))
      return
    }

    setSaving(true)
    try {
      await putPowerSchedule({
        dayOfWeek,
        startTime,
        durationMinutes: Math.round(durationHours * 60),
        isActive,
        updatedAt: new Date().toISOString(),
      })
      setSuccessMsg(t('saved'))
      await loadSchedules()
      // Reset form for next entry
      setDayOfWeek(null)
    } finally {
      setSaving(false)
    }
  }, [startTime, durationHours, dayOfWeek, isActive, schedules, t, loadSchedules])

  const handleDelete = useCallback(
    async (id: number) => {
      await deletePowerSchedule(id)
      setSuccessMsg(t('deleted'))
      await loadSchedules()
    },
    [t, loadSchedules],
  )

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-neutral-900">{t('title')}</h2>

      {/* Existing schedules */}
      {schedules.length > 0 && (
        <div className="flex flex-col gap-2">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-neutral-900">
                  {s.dayOfWeek !== null ? t(DAY_KEYS[s.dayOfWeek]) : t('defaultSchedule')}
                </span>
                <span className="text-xs text-neutral-500">
                  {s.startTime} — {Math.round(s.durationMinutes / 60 * 10) / 10}h
                  {!s.isActive && (
                    <span className="ms-2 text-amber-600">({t('active')}: off)</span>
                  )}
                </span>
              </div>
              <Button
                variant="danger"
                onClick={() => s.id != null && handleDelete(s.id)}
              >
                {t('delete')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add schedule form */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex flex-col gap-3">
          {/* Day of week */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">{t('dayOfWeek')}</span>
            <select
              value={dayOfWeek ?? 'default'}
              onChange={(e) =>
                setDayOfWeek(e.target.value === 'default' ? null : Number(e.target.value))
              }
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="default">{t('defaultSchedule')}</option>
              {DAY_KEYS.map((key, i) => (
                <option key={key} value={i}>
                  {t(key)}
                </option>
              ))}
            </select>
          </label>

          {/* Start time */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">{t('startTime')}</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          {/* Duration */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">{t('duration')}</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          {/* Active toggle */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            <span className="text-sm text-neutral-700">{t('active')}</span>
          </label>

          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}
          {successMsg && (
            <p className="text-sm text-green-700" role="status">{successMsg}</p>
          )}

          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
