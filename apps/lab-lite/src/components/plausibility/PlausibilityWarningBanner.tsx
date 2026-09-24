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
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 dark:border-destructive dark:bg-destructive/20">
          <div className="flex items-start gap-3">
            {/* Blocked icon */}
            <Ban size={20} className="mt-0.5 flex-shrink-0 text-destructive dark:text-destructive" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive dark:text-destructive">
                {t('bannerCriticalTitle')}
              </p>
              <p className="mt-0.5 text-xs text-destructive dark:text-destructive">
                {t('bannerCriticalCount', { count: criticalFlags.filter((f) => !f.acknowledged).length })}
              </p>
              <ul className="mt-2 space-y-2">
                {criticalFlags.map((flag) => (
                  <li
                    key={flag.id}
                    className="rounded border border-destructive/30 bg-card px-3 py-2 dark:border-destructive dark:bg-destructive/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive dark:bg-destructive dark:text-destructive">
                            {t('severityCritical')}
                          </span>
                          <FlagTypeLabel ruleType={flag.ruleType} t={t} />
                          <span className="text-xs text-destructive dark:text-destructive">{flag.analyte}</span>
                        </div>
                        <p className="mt-1 text-xs text-destructive dark:text-destructive">{flag.message}</p>
                      </div>
                      <div className="flex-shrink-0">
                        {flag.acknowledged ? (
                          <span className="text-xs text-success dark:text-success">
                            {t('acknowledgedLabel')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAcknowledge(flag)}
                            className="rounded bg-destructive px-2.5 py-1 text-xs font-medium text-white hover:bg-destructive focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-1 dark:bg-destructive dark:hover:bg-destructive"
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
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 dark:border-warning dark:bg-warning/20">
          <div className="flex items-start gap-3">
            {/* Warning triangle icon */}
            <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-warning dark:text-warning" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-warning dark:text-warning">
                {t('bannerWarningTitle')}
              </p>
              <p className="mt-0.5 text-xs text-warning dark:text-warning">
                {t('bannerWarningCount', { count: warningFlags.filter((f) => !f.acknowledged).length })}
              </p>
              <ul className="mt-2 space-y-2">
                {warningFlags.map((flag) => (
                  <li
                    key={flag.id}
                    className="rounded border border-warning/30 bg-card px-3 py-2 dark:border-warning dark:bg-warning/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning dark:bg-warning dark:text-warning">
                            {t('severityWarning')}
                          </span>
                          <FlagTypeLabel ruleType={flag.ruleType} t={t} />
                          <span className="text-xs text-warning dark:text-warning">{flag.analyte}</span>
                        </div>
                        <p className="mt-1 text-xs text-warning dark:text-warning">{flag.message}</p>
                      </div>
                      <div className="flex-shrink-0">
                        {flag.acknowledged ? (
                          <span className="text-xs text-success dark:text-success">
                            {t('acknowledgedLabel')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAcknowledge(flag)}
                            className="rounded bg-warning px-2.5 py-1 text-xs font-medium text-white hover:bg-warning focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-1 dark:bg-warning dark:hover:bg-warning"
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
