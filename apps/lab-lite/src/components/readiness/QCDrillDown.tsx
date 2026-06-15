'use client'

import { useTranslations } from 'next-intl'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ArrowLeft, AlertTriangle, Info } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import type { QcDetail } from '@/lib/rag-service'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QCDrillDownProps {
  details: QcDetail[]
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type QcStatus = QcDetail['status']

const STATUS_ORDER: Record<QcStatus, number> = {
  FAILED: 0,
  DRIFT_WARNING: 1,
  PASSING: 2,
  NOT_RUN: 3,
}

const STATUS_BADGE: Record<
  QcStatus,
  { container: string; dot: string; labelKey: string }
> = {
  PASSING: {
    container: 'bg-green-50 text-green-700 border border-green-200',
    dot: 'bg-green-500',
    labelKey: 'rag.status.passing',
  },
  DRIFT_WARNING: {
    container: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
    labelKey: 'rag.status.driftWarning',
  },
  FAILED: {
    container: 'bg-red-50 text-red-700 border border-red-200',
    dot: 'bg-red-500',
    labelKey: 'rag.status.failed',
  },
  NOT_RUN: {
    container: 'bg-muted text-muted-foreground border border-border',
    dot: 'bg-muted',
    labelKey: 'rag.status.notRun',
  },
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: QcStatus }) {
  const t = useTranslations()
  const cfg = STATUS_BADGE[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.container}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {t(cfg.labelKey)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Single analyte row
// ---------------------------------------------------------------------------

function AnalyteRow({ detail }: { detail: QcDetail }) {
  const t = useTranslations()
  return (
    <li className="px-4 py-3 bg-card">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{detail.analyte}</span>
            {detail.loincCode && (
              <span className="text-xs text-muted-foreground font-mono">{detail.loincCode}</span>
            )}
          </div>

          {detail.lastRunAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('rag.drillDown.lastRun', { time: formatTime(detail.lastRunAt) })}
            </p>
          )}

          {/* Westgard violations */}
          {detail.westgardViolations.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {detail.westgardViolations.map((violation, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700"
                >
                  {violation}
                </span>
              ))}
            </div>
          )}
        </div>

        <StatusBadge status={detail.status} />
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QCDrillDown({ details, onBack }: QCDrillDownProps) {
  const t = useTranslations()

  const hasFailures = details.some((d) => d.status === 'FAILED')

  const sorted = [...details].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          className="!p-1.5 shrink-0"
          onClick={onBack}
          aria-label={t('rag.drillDown.back')}
        >
          <DirectionalIcon category="navigation">
            <ArrowLeft size={18} aria-hidden="true" />
          </DirectionalIcon>
        </Button>
        <h2 className="text-base font-semibold text-foreground">
          {t('rag.drillDown.qcTitle')}
        </h2>
      </div>

      {/* Results-blocked banner */}
      {hasFailures && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg bg-red-600 px-4 py-3 text-white"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">{t('rag.drillDown.resultsBlocked')}</p>
            <p className="text-xs mt-0.5 text-red-100">
              {t('rag.drillDown.resultsBlockedDetail')}
            </p>
          </div>
        </div>
      )}

      {/* Analyte list */}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {t('rag.drillDown.noQcData')}
        </p>
      ) : (
        <ul className="divide-y divide-border/50 rounded-lg border border-border overflow-hidden">
          {sorted.map((detail) => (
            <AnalyteRow key={`${detail.analyte}-${detail.loincCode}`} detail={detail} />
          ))}
        </ul>
      )}

      {/* Action hint — informational only */}
      <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-700">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{t('rag.drillDown.reRunQcHint')}</span>
      </div>
    </div>
  )
}
