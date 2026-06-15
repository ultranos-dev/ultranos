'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { DirectionalIcon } from '@ultranos/ui-kit'
import {
  Users,
  FlaskConical,
  Microscope,
  ClipboardList,
  Zap,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
} from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { useReadinessBriefing } from '@/hooks/useReadinessBriefing'
import type { DimensionResult, RAGStatus, ReadinessDimension } from '@/lib/readiness-engine'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_KEY = 'readiness_briefing_expanded_date'

// ---------------------------------------------------------------------------
// RAG badge styles
// ---------------------------------------------------------------------------

const RAG_BADGE: Record<RAGStatus, { container: string; dot: string; labelKey: string }> = {
  green: {
    container: 'bg-green-50 text-green-700 border border-green-200',
    dot: 'bg-green-500',
    labelKey: 'readiness.status.ready',
  },
  amber: {
    container: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
    labelKey: 'readiness.status.caution',
  },
  red: {
    container: 'bg-red-50 text-red-700 border border-red-200',
    dot: 'bg-red-500',
    labelKey: 'readiness.status.actionNeeded',
  },
}

const OVERALL_CARD: Record<RAGStatus, string> = {
  green: 'border-green-200 bg-green-50/20',
  amber: 'border-amber-300 bg-amber-50/20',
  red: 'border-red-300 bg-red-50/20',
}

const RECOMMENDATION_STYLE: Record<'amber' | 'red', string> = {
  amber: 'bg-amber-50 border border-amber-200 text-amber-800',
  red: 'bg-red-50 border border-red-200 text-red-800',
}

// ---------------------------------------------------------------------------
// Per-dimension icon
// ---------------------------------------------------------------------------

function DimensionIcon({ dimension }: { dimension: ReadinessDimension }) {
  switch (dimension) {
    case 'personnel':
      return <Users size={16} aria-hidden="true" />
    case 'reagents':
      return (
        <DirectionalIcon category="medical">
          <FlaskConical size={16} aria-hidden="true" />
        </DirectionalIcon>
      )
    case 'equipment':
      return (
        <DirectionalIcon category="medical">
          <Microscope size={16} aria-hidden="true" />
        </DirectionalIcon>
      )
    case 'pendingOrders':
      return <ClipboardList size={16} aria-hidden="true" />
    case 'power':
      return <Zap size={16} aria-hidden="true" />
  }
}

// ---------------------------------------------------------------------------
// RAG badge pill
// ---------------------------------------------------------------------------

function RAGBadge({ status }: { status: RAGStatus }) {
  const t = useTranslations()
  const cfg = RAG_BADGE[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.container}`}
      aria-label={t(cfg.labelKey)}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {t(cfg.labelKey)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Recommendation callout
// ---------------------------------------------------------------------------

function RecommendationCallout({
  msgKey,
  args,
  status,
}: {
  msgKey: string
  args?: Record<string, string | number>
  status: 'amber' | 'red'
}) {
  const t = useTranslations()
  const styleClass = RECOMMENDATION_STYLE[status]

  return (
    <div className={`flex items-start gap-2 rounded-md p-2.5 text-xs ${styleClass}`}>
      <DirectionalIcon category="navigation">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
      </DirectionalIcon>
      <span>{t(msgKey, args as Record<string, string | number | Date> | undefined)}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single dimension row
// ---------------------------------------------------------------------------

function DimensionRow({ result }: { result: DimensionResult }) {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(result.status !== 'green')
  const hasDetails = result.details.length > 0 || result.recommendations.length > 0

  return (
    <div className="border-b border-border/50 last:border-0">
      {/* Main row */}
      <button
        type="button"
        className="flex w-full items-center gap-3 py-3 text-start hover:bg-muted/50 disabled:cursor-default"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        aria-expanded={hasDetails ? expanded : undefined}
        disabled={!hasDetails}
      >
        <span className="text-muted-foreground">
          <DimensionIcon dimension={result.dimension} />
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-foreground">
            {t(result.titleKey)}
          </span>
          {result.summaryKey && (
            <span className="block text-xs text-muted-foreground truncate">
              {t(result.summaryKey, result.summaryArgs as Record<string, string | number | Date> | undefined)}
            </span>
          )}
        </span>

        <RAGBadge status={result.status} />

        {hasDetails && (
          <span className="text-muted-foreground shrink-0">
            <DirectionalIcon category="navigation">
              {expanded ? (
                <ChevronDown size={14} aria-hidden="true" />
              ) : (
                <ChevronRight size={14} aria-hidden="true" />
              )}
            </DirectionalIcon>
          </span>
        )}
      </button>

      {/* Expanded detail section */}
      {expanded && hasDetails && (
        <div className="pb-3 ps-8 pe-2 space-y-1.5">
          {result.details.map((detailKey, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              {t(detailKey)}
            </p>
          ))}

          {result.recommendations.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {result.recommendations.map((recKey, i) => {
                const recStatus = result.status === 'green' ? 'amber' : result.status
                return (
                  <RecommendationCallout
                    key={i}
                    msgKey={recKey}
                    args={result.recommendationArgs?.[i]}
                    status={recStatus as 'amber' | 'red'}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function ReadinessBriefingCard() {
  const t = useTranslations()
  const { briefing, isLoading, refresh, lastRefreshedAt } = useReadinessBriefing()

  // Auto-expand on first load of the calendar day
  const [cardExpanded, setCardExpanded] = useState(false)

  useEffect(() => {
    const today = new Date().toDateString()
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored !== today) {
      setCardExpanded(true)
      sessionStorage.setItem(SESSION_KEY, today)
    }
  }, [])

  const handleRefresh = useCallback(() => {
    refresh()
  }, [refresh])

  const overallStatus = briefing?.overallStatus ?? 'amber'
  const readyCount = briefing?.dimensions.filter((d) => d.status === 'green').length ?? 0
  const totalCount = briefing?.dimensions.length ?? 5

  return (
    <div
      className={`rounded-lg border-2 p-4 ${OVERALL_CARD[overallStatus]}`}
      aria-label={t('readiness.cardAriaLabel')}
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-start"
          onClick={() => setCardExpanded((v) => !v)}
          aria-expanded={cardExpanded}
        >
          <span
            className={`h-3 w-3 shrink-0 rounded-full ${RAG_BADGE[overallStatus].dot}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              {t('readiness.title')}
            </h2>
            {!cardExpanded && (
              <p className="text-xs text-muted-foreground">
                {t('readiness.collapsedSummary', { ready: readyCount, total: totalCount })}
              </p>
            )}
          </div>
          <span className="ms-auto text-muted-foreground shrink-0">
            <DirectionalIcon category="navigation">
              {cardExpanded ? (
                <ChevronDown size={16} aria-hidden="true" />
              ) : (
                <ChevronRight size={16} aria-hidden="true" />
              )}
            </DirectionalIcon>
          </span>
        </button>

        <Button
          variant="ghost"
          className="shrink-0 !p-1.5 text-muted-foreground"
          onClick={handleRefresh}
          disabled={isLoading}
          aria-label={t('readiness.refresh')}
        >
          <RefreshCw
            size={15}
            aria-hidden="true"
            className={isLoading ? 'animate-spin' : undefined}
          />
        </Button>
      </div>

      {/* Expanded body */}
      {cardExpanded && (
        <div className="mt-3">
          {isLoading && !briefing ? (
            // Loading skeleton
            <div aria-busy="true" aria-label={t('readiness.loading')}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-border/50 py-3 last:border-0"
                >
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-40 animate-pulse rounded bg-muted/60" />
                  </div>
                  <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
                </div>
              ))}
            </div>
          ) : briefing ? (
            <div>
              {briefing.dimensions.map((dim) => (
                <DimensionRow key={dim.dimension} result={dim} />
              ))}
            </div>
          ) : null}

          {/* Timestamp footer */}
          {lastRefreshedAt && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t('readiness.lastEvaluated', {
                time: lastRefreshedAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
