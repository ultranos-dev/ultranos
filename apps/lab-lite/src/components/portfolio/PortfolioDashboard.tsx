'use client'

/**
 * Story 51.6 — Technician Performance Portfolio: PortfolioDashboard component
 *
 * Main portfolio view for self-view and supervisor view.
 * AC 1: Displays 6 metrics with trend indicators.
 * AC 2: Professional development language (not surveillance).
 * AC 3: Self-view available to all authenticated techs.
 * AC 4: Supervisor view shows banner when viewing another tech.
 * AC 5: Export for Review button.
 *
 * RTL-safe via Tailwind logical CSS utilities.
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Download, Info } from '@ultranos/ui-kit/icons'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { calculatePortfolioMetrics } from '@/lib/portfolio-service'
import type { FullPortfolioMetrics, DateRange } from '@/lib/portfolio-service'
import { exportPortfolio, getExportFilename } from '@/lib/portfolio-export'
import { MetricCard } from './MetricCard'
import { TATBreakdown } from './TATBreakdown'
import { AchievementBadges } from './AchievementBadges'
import { reportPortfolioAuditEvent } from '@/lib/audit-client'

type DayRange = 30 | 60 | 90

function buildDateRange(days: DayRange): DateRange {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

interface PortfolioDashboardProps {
  targetTechId?: string
  targetTechName?: string
}

export function PortfolioDashboard({ targetTechId, targetTechName }: PortfolioDashboardProps) {
  const t = useTranslations('portfolio')
  const session = useAuthSessionStore((s) => s.session)

  const viewingOwnPortfolio = !targetTechId
  const techId = targetTechId ?? session?.practitionerId ?? ''

  const [dayRange, setDayRange] = useState<DayRange>(30)
  const [metrics, setMetrics] = useState<FullPortfolioMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadMetrics = useCallback(async () => {
    if (!techId) return
    setIsLoading(true)
    try {
      const dateRange = buildDateRange(dayRange)
      const data = await calculatePortfolioMetrics(techId, dateRange)
      setMetrics(data)

      // AC 4: Audit supervisor access — self-view is NOT audited
      if (!viewingOwnPortfolio && session?.practitionerId) {
        reportPortfolioAuditEvent({
          action: 'PORTFOLIO_VIEWED_BY_SUPERVISOR',
          targetTechId: techId,
          viewedBy: session.practitionerId,
        })
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false)
    }
  }, [techId, dayRange, viewingOwnPortfolio, session?.practitionerId])

  useEffect(() => {
    void loadMetrics()
  }, [loadMetrics])

  const handleExport = async () => {
    if (!metrics) return
    try {
      const blob = exportPortfolio(metrics, {
        techId,
        techName: targetTechName ?? session?.email?.split('@')[0] ?? techId,
        labName: 'Lab Lite',
      })
      const filename = getExportFilename(techId, metrics.dateRange)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      if (session?.practitionerId) {
        reportPortfolioAuditEvent({
          action: 'PORTFOLIO_EXPORTED',
          targetTechId: techId,
          viewedBy: session.practitionerId,
          dateRange: metrics.dateRange,
        })
      }
    } catch {
      // Export failure is non-fatal
    }
  }

  const displayDays: DayRange[] = [30, 60, 90]

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4" data-testid="portfolio-dashboard">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="portfolio-title">
            {t('title')}
          </h1>
          {targetTechName && (
            <p className="text-sm text-muted-foreground mt-0.5">{targetTechName}</p>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={!metrics || isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          data-testid="export-button"
          aria-label={t('exportForReview')}
        >
          <Download size={16} aria-hidden />
          {t('exportForReview')}
        </button>
      </div>

      {/* Supervisor banner — AC 4 */}
      {!viewingOwnPortfolio && targetTechName && (
        <div
          className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"
          role="note"
          data-testid="supervisor-banner"
        >
          <Info size={16} className="text-blue-600 mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm text-blue-800">
            {t('sharedBanner', { name: targetTechName })}
          </p>
        </div>
      )}

      {/* Date range selector */}
      <div className="flex items-center gap-2" role="group" aria-label={t('selectPeriod')}>
        {displayDays.map((days) => (
          <button
            key={days}
            onClick={() => setDayRange(days)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              dayRange === days
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            aria-pressed={dayRange === days}
            data-testid={`range-${days}`}
          >
            {days === 30 ? t('last30Days') : days === 60 ? t('last60Days') : t('last90Days')}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" data-testid="loading-skeleton">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 h-32 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && metrics && (
        <>
          {/* Strengths section — AC 2 */}
          <section aria-label={t('strengths')}>
            <h2 className="text-base font-semibold text-foreground mb-3" data-testid="strengths-heading">
              {t('strengths')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                title={t('testsPerShift')}
                value={metrics.testsPerShift.noData ? 0 : metrics.testsPerShift.value}
                unit={metrics.testsPerShift.unit}
                trend={metrics.testsPerShift.noData ? undefined : metrics.testsPerShift.trend}
                noData={metrics.testsPerShift.noData}
                description={
                  !metrics.testsPerShift.noData && metrics.testsPerShift.previousValue !== null
                    ? `${t('previousPeriod')}: ${metrics.testsPerShift.previousValue} ${metrics.testsPerShift.unit}`
                    : undefined
                }
              />

              <MetricCard
                title={t('qcPassRate')}
                value={metrics.qcPassRate.noData ? 0 : metrics.qcPassRate.value}
                unit={metrics.qcPassRate.unit}
                trend={metrics.qcPassRate.noData ? undefined : metrics.qcPassRate.trend}
                noData={metrics.qcPassRate.noData}
                description={
                  !metrics.qcPassRate.noData
                    ? `${t('basedOn')} ${metrics.qcPassRate.dataPoints} ${t('runs')}`
                    : undefined
                }
              />

              <MetricCard
                title={t('trainingModules')}
                value={metrics.trainingModules.length}
                unit={t('completed')}
              >
                {metrics.trainingModules.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      {t('viewList')}
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {metrics.trainingModules.slice(0, 5).map((m) => (
                        <li key={m.sopId} className="text-muted-foreground">{m.title}</li>
                      ))}
                      {metrics.trainingModules.length > 5 && (
                        <li className="text-muted-foreground">
                          +{metrics.trainingModules.length - 5} {t('more')}
                        </li>
                      )}
                    </ul>
                  </details>
                )}
              </MetricCard>
            </div>
          </section>

          {/* Growth areas — AC 2 */}
          <section aria-label={t('growthAreas')}>
            <h2 className="text-base font-semibold text-foreground mb-3" data-testid="growth-areas-heading">
              {t('growthAreas')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard
                title={t('rejectionRate')}
                value={metrics.rejectionRate.noData ? 0 : metrics.rejectionRate.value}
                unit={metrics.rejectionRate.unit}
                trend={metrics.rejectionRate.noData ? undefined : metrics.rejectionRate.trend}
                noData={metrics.rejectionRate.noData}
              >
                {!metrics.rejectionRate.noData &&
                  metrics.rejectionRate.rejectionBreakdown &&
                  metrics.rejectionRate.rejectionBreakdown.length > 0 && (
                    <ul className="text-xs space-y-1 mt-1">
                      {metrics.rejectionRate.rejectionBreakdown.map((b) => (
                        <li key={b.reason} className="text-muted-foreground">
                          {b.reason}: {b.count}
                        </li>
                      ))}
                    </ul>
                  )}
              </MetricCard>

              <MetricCard
                title={t('mentorship')}
                value={metrics.mentorshipCount}
                unit={t('sessions')}
              />
            </div>
          </section>

          {/* TAT breakdown */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">{t('averageTAT')}</h2>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <TATBreakdown categories={metrics.averageTAT} />
            </div>
          </section>

          {/* Achievements — Story 51.7 integration */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">{t('achievements')}</h2>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <AchievementBadges techId={techId} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
