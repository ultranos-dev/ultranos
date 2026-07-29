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
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Toolbar: Auto / Manual mode pills — one row */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {(['auto', 'manual'] as WorklistMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
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
        <div className="rounded-2xl bg-warning/10 px-4 py-2 text-sm text-warning">
          {t('manualModeInfo')}
        </div>
      )}

      {/* Stats bar */}
      {!loading && !error && samples.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-muted-foreground">
            <strong className="text-foreground">{samples.length}</strong> {t('samplesInQueue')}
          </span>
          {samples.filter((s) => s.urgency === 'stat').length > 0 && (
            <span className="font-medium text-destructive">
              {samples.filter((s) => s.urgency === 'stat').length} STAT
            </span>
          )}
          {samples.filter((s) => s.stabilityStatus === 'expired').length > 0 && (
            <span className="font-medium text-destructive">
              {samples.filter((s) => s.stabilityStatus === 'expired').length} {t('expired')}
            </span>
          )}
          {samples.filter((s) => s.stabilityStatus === 'critical').length > 0 && (
            <span className="font-medium text-warning">
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
