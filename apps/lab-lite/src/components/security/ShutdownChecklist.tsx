'use client'

/**
 * Story 49.4 — Rapid Shutdown Checklist
 *
 * Displays facility-specific shutdown steps with checkboxes.
 * Each item records a timestamp when checked.
 * Default 7 items; configurable per facility via LabSettings.
 *
 * Designed for high-stress use:
 *   - Large touch targets (min 48×48px)
 *   - Sequential visual ordering
 *   - Progress indicator (X of Y items completed)
 *   - RTL-ready via logical CSS
 */

import { useTranslations } from 'next-intl'
import { useSecurityAlertStore, type ChecklistItem } from '@/stores/security-alert-store'

interface ShutdownChecklistProps {
  onComplete?: () => void
}

export function ShutdownChecklist({ onComplete }: ShutdownChecklistProps) {
  const t = useTranslations('security')
  const { checklistItems, updateChecklist } = useSecurityAlertStore()

  const completedCount = checklistItems.filter((i) => i.checked).length
  const totalCount = checklistItems.length
  const allComplete = completedCount === totalCount

  function handleToggle(item: ChecklistItem) {
    updateChecklist(item.id, !item.checked)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-between text-sm font-medium"
      >
        <span className={allComplete ? 'text-green-700' : 'text-muted-foreground'}>
          {t('checklist.progress', { completed: completedCount, total: totalCount })}
        </span>
        {allComplete && (
          <span className="text-green-700 font-semibold">{t('checklist.allComplete')}</span>
        )}
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={completedCount}
        aria-valuemin={0}
        aria-valuemax={totalCount}
        aria-label={t('checklist.progressBarLabel')}
        className="w-full h-2 bg-muted rounded-full overflow-hidden"
      >
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            allComplete ? 'bg-green-500' : 'bg-amber-500'
          }`}
          style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
        />
      </div>

      {/* Checklist items */}
      <ul className="flex flex-col gap-2" role="list">
        {checklistItems.map((item, index) => (
          <li key={item.id} role="listitem">
            <label
              className={`
                flex items-start gap-3 p-3 rounded-lg border cursor-pointer
                min-h-[48px] transition-colors
                ${item.checked
                  ? 'border-green-300 bg-green-50 text-green-900'
                  : 'border-border bg-card hover:bg-muted/30'}
              `}
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => handleToggle(item)}
                aria-label={t(item.label)}
                className="mt-0.5 h-5 w-5 flex-shrink-0 accent-green-600"
              />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium leading-snug">
                  {index + 1}. {t(item.label)}
                </span>
                {item.checked && item.checkedAt && (
                  <span className="text-xs text-green-600">
                    {t('checklist.checkedAt', {
                      time: new Date(item.checkedAt).toLocaleTimeString(),
                    })}
                  </span>
                )}
              </div>
            </label>
          </li>
        ))}
      </ul>

      {/* Continue button — enabled only when all items are checked */}
      {onComplete && (
        <button
          type="button"
          disabled={!allComplete}
          onClick={onComplete}
          className="
            mt-2 w-full py-4 rounded-lg font-bold text-base transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
            bg-green-600 text-white hover:bg-green-700 active:bg-green-800
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-green-600
          "
        >
          {t('checklist.continue')}
        </button>
      )}
    </div>
  )
}
