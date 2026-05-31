'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { X } from '@ultranos/ui-kit/icons'
import {
  CulturalFlagType,
  PREDEFINED_FLAG_TYPES,
  CULTURAL_FLAG_COLORS,
  FLAG_ICON_PATHS,
  flagLabelKey,
  flagDescKey,
} from '@/lib/cultural-flags'
import type { CulturalFlag, PatientCulturalPreferences } from '@/lib/cultural-flags'
import { setPatientCulturalPreferences } from '@/lib/db'
import { Tooltip } from '@/components/ui/Tooltip'

interface CulturalFlagsEditorProps {
  patientRef: string
  existingPrefs?: PatientCulturalPreferences | null
  techId: string
  hlcTimestamp: string
  onSave?: (prefs: PatientCulturalPreferences) => void
  onClose?: () => void
}

/**
 * Toggle-based editor for managing patient cultural sensitivity flags.
 * Accessible from patient profile, queue registration, and order view.
 * Non-punitive framing: "Prefers", not "REQUIRES".
 */
export function CulturalFlagsEditor({
  patientRef,
  existingPrefs,
  techId,
  hlcTimestamp,
  onSave,
  onClose,
}: CulturalFlagsEditorProps) {
  const t = useTranslations()

  // Build initial flag state from existing prefs
  const buildInitialState = useCallback((): Record<string, boolean> => {
    const state: Record<string, boolean> = {}
    for (const type of PREDEFINED_FLAG_TYPES) {
      const existing = existingPrefs?.flags.find((f) => f.type === type)
      state[type] = existing?.isActive ?? false
    }
    return state
  }, [existingPrefs])

  const [flagStates, setFlagStates] = useState<Record<string, boolean>>(buildInitialState)
  const [customFlags, setCustomFlags] = useState<Array<{ description: string; isActive: boolean }>>(
    () =>
      existingPrefs?.flags
        .filter((f) => f.type === CulturalFlagType.CUSTOM && f.customDescription)
        .map((f) => ({ description: f.customDescription!, isActive: f.isActive })) ?? [],
  )
  const [newCustomText, setNewCustomText] = useState('')
  const [saving, setSaving] = useState(false)

  const handleToggle = (type: string) => {
    setFlagStates((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const handleAddCustom = () => {
    const trimmed = newCustomText.trim()
    if (!trimmed) return
    setCustomFlags((prev) => [...prev, { description: trimmed, isActive: true }])
    setNewCustomText('')
  }

  const handleRemoveCustom = (index: number) => {
    setCustomFlags((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setSaving(true)
    const now = new Date().toISOString()

    const flags: CulturalFlag[] = []

    // Predefined flags
    for (const type of PREDEFINED_FLAG_TYPES) {
      if (flagStates[type]) {
        flags.push({
          type,
          isActive: true,
          setAt: existingPrefs?.flags.find((f) => f.type === type)?.setAt ?? now,
          setByTechId: techId,
        })
      }
    }

    // Custom flags
    for (const custom of customFlags) {
      if (custom.isActive) {
        flags.push({
          type: CulturalFlagType.CUSTOM,
          customDescription: custom.description,
          isActive: true,
          setAt: now,
          setByTechId: techId,
        })
      }
    }

    const prefs: PatientCulturalPreferences = {
      patientRef,
      flags,
      lastUpdatedAt: now,
      lastUpdatedByTechId: techId,
      hlcTimestamp,
    }

    await setPatientCulturalPreferences(prefs)
    setSaving(false)
    onSave?.(prefs)
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
      data-testid="cultural-flags-editor"
    >
      {/* Header with help tooltip */}
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('culturalFlags.title')}
        </h3>
        <Tooltip content={t('culturalFlags.helpText')} />
      </div>

      {/* Predefined flag toggles */}
      <div className="flex flex-col gap-2">
        {PREDEFINED_FLAG_TYPES.map((type) => (
          <label
            key={type}
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
            data-testid={`cultural-flag-toggle-${type}`}
          >
            <button
              type="button"
              role="switch"
              aria-checked={flagStates[type]}
              onClick={() => handleToggle(type)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                flagStates[type]
                  ? 'bg-indigo-500'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  flagStates[type]
                    ? 'translate-x-4 rtl:-translate-x-4'
                    : 'translate-x-0.5 rtl:-translate-x-0.5'
                }`}
              />
            </button>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={`h-5 w-5 shrink-0 ${CULTURAL_FLAG_COLORS.icon}`}
              aria-hidden="true"
            >
              <path d={FLAG_ICON_PATHS[type]} />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t(flagLabelKey(type))}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t(flagDescKey(type))}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* Custom flags */}
      {customFlags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {customFlags.map((custom, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${CULTURAL_FLAG_COLORS.bg}`}
              data-testid={`custom-flag-${idx}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className={`h-4 w-4 shrink-0 ${CULTURAL_FLAG_COLORS.icon}`}
                aria-hidden="true"
              >
                <path d={FLAG_ICON_PATHS[CulturalFlagType.CUSTOM]} />
              </svg>
              <span className={`flex-1 text-sm ${CULTURAL_FLAG_COLORS.text}`}>
                {custom.description}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveCustom(idx)}
                className="text-gray-400 hover:text-red-500"
                aria-label={`Remove ${custom.description}`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add custom flag */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newCustomText}
          onChange={(e) => setNewCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddCustom()
            }
          }}
          placeholder={t('culturalFlags.customDescription')}
          className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
          data-testid="custom-flag-input"
        />
        <button
          type="button"
          onClick={handleAddCustom}
          disabled={!newCustomText.trim()}
          className="rounded-md bg-indigo-100 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 dark:bg-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-800"
          data-testid="add-custom-flag-btn"
        >
          {t('culturalFlags.addCustom')}
        </button>
      </div>

      {/* Save / Cancel */}
      <div className="flex justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t('common.cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          data-testid="save-cultural-flags-btn"
        >
          {saving ? t('common.loading') : t('culturalFlags.save')}
        </button>
      </div>
    </div>
  )
}
