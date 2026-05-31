'use client'

import { useTranslations } from 'next-intl'
import { usePrioritizedWorklist, type WorklistMode } from '@/hooks/usePrioritizedWorklist'
import { PriorityWorklist } from '@/components/worklist/PriorityWorklist'
import { IncompleteVerificationsAlert } from '@/components/verification/IncompleteVerificationsAlert'

/**
 * Smart Sample Prioritization Worklist page.
 *
 * Features:
 *  - Algorithm-sorted worklist (Auto mode) with 60-second auto-refresh
 *  - Manual mode: drag-reorder only, no auto-resort
 *  - Stability countdowns and expiry warnings
 *  - Batch grouping indicator for same-type tests
 *
 * Works fully offline — all computation is Dexie-local.
 * CLAUDE.md Rule #7: only first name + age displayed.
 */
export default function WorklistPage() {
  const t = useTranslations('worklist')
  const { samples, loading, error, mode, setMode, reorder, resetOverride } =
    usePrioritizedWorklist()

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-neutral-500">{t('subtitle')}</p>
        </div>

        {/* Auto / Manual toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
          {(['auto', 'manual'] as WorklistMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500
                ${mode === m
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
                }`}
              aria-pressed={mode === m}
              aria-label={t(`mode.${m}`)}
            >
              {t(`mode.${m}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Supervisor filter: samples with incomplete identity verification (AC 4.4) */}
      <IncompleteVerificationsAlert />

      {/* Mode description */}
      {mode === 'manual' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {t('manualModeInfo')}
        </div>
      )}

      {/* Stats bar */}
      {!loading && !error && samples.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-neutral-600">
            <strong className="text-neutral-900">{samples.length}</strong> {t('samplesInQueue')}
          </span>
          {samples.filter((s) => s.urgency === 'stat').length > 0 && (
            <span className="font-medium text-red-600">
              {samples.filter((s) => s.urgency === 'stat').length} STAT
            </span>
          )}
          {samples.filter((s) => s.stabilityStatus === 'expired').length > 0 && (
            <span className="font-medium text-red-600">
              {samples.filter((s) => s.stabilityStatus === 'expired').length} {t('expired')}
            </span>
          )}
          {samples.filter((s) => s.stabilityStatus === 'critical').length > 0 && (
            <span className="font-medium text-amber-600">
              {samples.filter((s) => s.stabilityStatus === 'critical').length} {t('critical')}
            </span>
          )}
        </div>
      )}

      {/* Worklist */}
      <PriorityWorklist
        samples={samples}
        loading={loading}
        error={error}
        onReorder={reorder}
        onResetOverride={resetOverride}
      />
    </div>
  )
}
