'use client'

/**
 * Plausibility Warning Banner
 * Story 43.5 — Task 6
 *
 * Displays a summary of plausibility flags raised during result entry.
 * - CRITICAL flags render in red with a release-blocked indicator.
 * - WARNING flags render in amber.
 * - Supports RTL layout (Arabic, Dari, Pashto).
 * - Calls onAcknowledge(flag) when the user clicks the acknowledge button.
 */

import { useTranslations } from 'next-intl'
import type { PlausibilityFlag } from '@/lib/plausibility/types'
import { Ban, AlertTriangle } from '@ultranos/ui-kit/icons'

interface Props {
  flags: PlausibilityFlag[]
  onAcknowledge: (flag: PlausibilityFlag) => void
}

function FlagTypeLabel({
  ruleType,
  t,
}: {
  ruleType: PlausibilityFlag['ruleType']
  t: ReturnType<typeof useTranslations>
}) {
  const map: Record<PlausibilityFlag['ruleType'], string> = {
    ABSOLUTE_RANGE: t('flagTypeAbsolute'),
    DELTA_CHECK: t('flagTypeDelta'),
    INTERNAL_CONSISTENCY: t('flagTypeConsistency'),
  }
  return <span className="font-medium">{map[ruleType]}</span>
}

export function PlausibilityWarningBanner({ flags, onAcknowledge }: Props) {
  const t = useTranslations('plausibility')

  const criticalFlags = flags.filter((f) => f.severity === 'CRITICAL')
  const warningFlags = flags.filter((f) => f.severity === 'WARNING')

  if (flags.length === 0) return null

  return (
    <div className="space-y-3" role="alert" aria-live="polite">
      {/* CRITICAL block */}
      {criticalFlags.length > 0 && (
        <div className="rounded-lg border border-red-400 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20">
          <div className="flex items-start gap-3">
            {/* Blocked icon */}
            <Ban size={20} className="mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                {t('bannerCriticalTitle')}
              </p>
              <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">
                {t('bannerCriticalCount', { count: criticalFlags.filter((f) => !f.acknowledged).length })}
              </p>
              <ul className="mt-2 space-y-2">
                {criticalFlags.map((flag) => (
                  <li
                    key={flag.id}
                    className="rounded border border-red-200 bg-card px-3 py-2 dark:border-red-800 dark:bg-red-900/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
                            {t('severityCritical')}
                          </span>
                          <FlagTypeLabel ruleType={flag.ruleType} t={t} />
                          <span className="text-xs text-red-700 dark:text-red-300">{flag.analyte}</span>
                        </div>
                        <p className="mt-1 text-xs text-red-700 dark:text-red-300">{flag.message}</p>
                      </div>
                      <div className="flex-shrink-0">
                        {flag.acknowledged ? (
                          <span className="text-xs text-green-700 dark:text-green-400">
                            {t('acknowledgedLabel')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAcknowledge(flag)}
                            className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 dark:bg-red-700 dark:hover:bg-red-600"
                          >
                            {t('acknowledgeButton')}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* WARNING block */}
      {warningFlags.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            {/* Warning triangle icon */}
            <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {t('bannerWarningTitle')}
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                {t('bannerWarningCount', { count: warningFlags.filter((f) => !f.acknowledged).length })}
              </p>
              <ul className="mt-2 space-y-2">
                {warningFlags.map((flag) => (
                  <li
                    key={flag.id}
                    className="rounded border border-amber-200 bg-card px-3 py-2 dark:border-amber-700 dark:bg-amber-900/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            {t('severityWarning')}
                          </span>
                          <FlagTypeLabel ruleType={flag.ruleType} t={t} />
                          <span className="text-xs text-amber-700 dark:text-amber-300">{flag.analyte}</span>
                        </div>
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{flag.message}</p>
                      </div>
                      <div className="flex-shrink-0">
                        {flag.acknowledged ? (
                          <span className="text-xs text-green-700 dark:text-green-400">
                            {t('acknowledgedLabel')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAcknowledge(flag)}
                            className="rounded bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 dark:bg-amber-600 dark:hover:bg-amber-500"
                          >
                            {t('acknowledgeButton')}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
