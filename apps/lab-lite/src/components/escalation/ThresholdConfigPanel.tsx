'use client'

/**
 * ThresholdConfigPanel — Story 48.4 (AC: 8)
 *
 * Table of all configured critical value thresholds with inline editing.
 * Access control: only LAB_MANAGER and physician roles can modify.
 * "Reset to defaults" restores the seeded values from v20 migration.
 *
 * PHI: no patient data. Thresholds are purely clinical configuration.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  getAllCriticalThresholds,
  putCriticalThreshold,
  deactivateCriticalThreshold,
  resetCriticalThresholdsToDefaults,
} from '@/lib/db'
import type { CriticalThreshold } from '@/lib/db'

interface EditingState {
  id: number
  field: 'criticalLow' | 'criticalHigh'
  value: string
}

const ALLOWED_ROLES: string[] = [LabRole.LAB_MANAGER, 'physician']

export function ThresholdConfigPanel() {
  const t = useTranslations('escalation.thresholds')
  const session = useAuthSessionStore((s) => s.session)
  const canEdit = session?.labRole ? ALLOWED_ROLES.includes(session.labRole) : false

  const [thresholds, setThresholds] = useState<CriticalThreshold[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  const load = useCallback(async () => {
    try {
      const all = await getAllCriticalThresholds()
      setThresholds(all.sort((a, b) => a.analyte.localeCompare(b.analyte)))
    } catch {
      setError(t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const startEditing = (id: number, field: EditingState['field'], currentValue: number | null) => {
    if (!canEdit) return
    setEditing({ id, field, value: currentValue?.toString() ?? '' })
  }

  const commitEdit = async () => {
    if (!editing || saving) return
    const threshold = thresholds.find((t) => t.id === editing.id)
    if (!threshold) return

    const numValue = editing.value === '' ? null : parseFloat(editing.value)
    if (editing.value !== '' && (isNaN(numValue!) || numValue! < 0)) {
      setError(t('invalidValue'))
      return
    }

    // Validate: criticalLow must be less than criticalHigh
    const newLow = editing.field === 'criticalLow' ? numValue : threshold.criticalLow
    const newHigh = editing.field === 'criticalHigh' ? numValue : threshold.criticalHigh
    if (newLow != null && newHigh != null && newLow >= newHigh) {
      setError(t('lowHighConflict'))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const updated: CriticalThreshold = {
        ...threshold,
        [editing.field]: numValue,
        configuredBy: session?.userId ?? 'unknown',
        updatedAt: new Date().toISOString(),
      }
      await putCriticalThreshold(updated)
      setThresholds((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      setEditing(null)
    } catch {
      setError(t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (threshold: CriticalThreshold) => {
    if (!canEdit || threshold.id == null) return
    if (threshold.isActive) {
      await deactivateCriticalThreshold(threshold.id)
    } else {
      await putCriticalThreshold({
        ...threshold,
        isActive: true,
        updatedAt: new Date().toISOString(),
      })
    }
    await load()
  }

  const handleReset = async () => {
    if (!canEdit) return
    setResetting(true)
    try {
      await resetCriticalThresholdsToDefaults()
      await load()
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500 p-4">{t('loading')}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t('title')}</h2>
        {canEdit && (
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {resetting ? t('resetting') : t('resetToDefaults')}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-start font-medium text-gray-700">{t('col.analyte')}</th>
              <th className="px-4 py-3 text-start font-medium text-gray-700">{t('col.testName')}</th>
              <th className="px-4 py-3 text-end font-medium text-gray-700">{t('col.criticalLow')}</th>
              <th className="px-4 py-3 text-end font-medium text-gray-700">{t('col.criticalHigh')}</th>
              <th className="px-4 py-3 text-start font-medium text-gray-700">{t('col.unit')}</th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">{t('col.active')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {thresholds.map((threshold) => (
              <tr key={threshold.id} className={threshold.isActive ? '' : 'opacity-50'}>
                <td className="px-4 py-3 font-medium text-gray-900">{threshold.analyte}</td>
                <td className="px-4 py-3 text-gray-600">{threshold.testName}</td>

                {/* Critical Low — inline editable */}
                <td className="px-4 py-3 text-end">
                  {editing?.id === threshold.id && editing.field === 'criticalLow' ? (
                    <input
                      type="number"
                      value={editing.value}
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      onBlur={commitEdit}
                      onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                      className="w-20 rounded border border-blue-400 px-2 py-1 text-end text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label={t('editCriticalLow', { analyte: threshold.analyte })}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing(threshold.id!, 'criticalLow', threshold.criticalLow)}
                      className={`rounded px-2 py-1 text-end ${canEdit ? 'hover:bg-blue-50 cursor-pointer' : 'cursor-default'}`}
                      disabled={!canEdit}
                      aria-label={canEdit ? t('editCriticalLow', { analyte: threshold.analyte }) : undefined}
                    >
                      {threshold.criticalLow ?? t('notSet')}
                    </button>
                  )}
                </td>

                {/* Critical High — inline editable */}
                <td className="px-4 py-3 text-end">
                  {editing?.id === threshold.id && editing.field === 'criticalHigh' ? (
                    <input
                      type="number"
                      value={editing.value}
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      onBlur={commitEdit}
                      onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                      className="w-20 rounded border border-blue-400 px-2 py-1 text-end text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label={t('editCriticalHigh', { analyte: threshold.analyte })}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing(threshold.id!, 'criticalHigh', threshold.criticalHigh)}
                      className={`rounded px-2 py-1 text-end ${canEdit ? 'hover:bg-blue-50 cursor-pointer' : 'cursor-default'}`}
                      disabled={!canEdit}
                      aria-label={canEdit ? t('editCriticalHigh', { analyte: threshold.analyte }) : undefined}
                    >
                      {threshold.criticalHigh ?? t('notSet')}
                    </button>
                  )}
                </td>

                <td className="px-4 py-3 text-gray-500">{threshold.unit}</td>

                {/* Active toggle */}
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={threshold.isActive}
                    onClick={() => toggleActive(threshold)}
                    disabled={!canEdit}
                    className={`inline-flex h-5 w-10 items-center rounded-full transition ${
                      threshold.isActive ? 'bg-green-500' : 'bg-gray-300'
                    } disabled:opacity-50`}
                    aria-label={t('toggleActive', { analyte: threshold.analyte })}
                  >
                    <span
                      className={`h-4 w-4 rounded-full bg-card shadow transition-transform ${
                        threshold.isActive ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!canEdit && (
        <p className="text-xs text-gray-500">{t('readOnlyNotice')}</p>
      )}
    </div>
  )
}
