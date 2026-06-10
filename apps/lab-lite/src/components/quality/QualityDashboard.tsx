'use client'

/**
 * Quality Dashboard — Story 46.7
 *
 * Personal quality dashboard for solo lab technicians.
 * Displays:
 *  - QC passing streak and zero-rejection streak
 *  - Monthly quality metrics (hemoglobin CV%, TAT, rejection rate, training)
 *  - Earned badges grid
 *
 * Design requirements (non-negotiable per Dev Notes):
 *  - NO leaderboards, NO comparisons to other techs, NO rankings
 *  - All badge/achievement text uses "You" language
 *  - Streak reset messages are encouraging, not punitive
 *  - RTL-compatible (logical CSS via Tailwind's rtl: prefix and dir-aware layout)
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Flame, Star, Shield, ShieldCheck, TrendingUp, TrendingDown, Minus,
  Trophy, Award, Medal, Gem, BookOpen, LineChart, CircleCheck,
} from '@ultranos/ui-kit/icons'
import type { ReactNode } from 'react'
import type { QualityStreak, QualityMetric, Badge, EarnedBadge } from '@/lib/quality-streak-types'
import { calculateQCStreak, calculateRejectionStreak, buildResetMessage } from '@/lib/streak-calculator'
import { calculateMonthlyMetrics, getMetricsForPeriod, currentPeriod } from '@/lib/quality-metrics-calculator'
import { evaluateBadges, seedBadgeCatalogue, getEarnedBadges } from '@/lib/badge-evaluator'
import { BADGE_CATALOGUE, BADGE_BY_ID } from '@/lib/badge-definitions'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getDb } from '@/lib/db'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StreakCardProps {
  label: string
  currentStreak: number
  longestStreak: number
  resetMessage: string | null
  icon: 'flame' | 'shield'
}

function StreakCard({ label, currentStreak, longestStreak, resetMessage, icon }: StreakCardProps) {
  const Icon = icon === 'flame' ? Flame : Shield
  const t = useTranslations('quality')

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon size={16} aria-hidden />
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-bold tabular-nums text-foreground" aria-label={`${currentStreak} days`}>
          {currentStreak}
        </span>
        <span className="text-sm text-muted-foreground">{t('days')}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('longestStreak')}: <strong>{longestStreak}</strong> {t('days')}
      </p>
      {resetMessage && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200" role="status">
          {resetMessage}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

type MetricTrendIcon = 'up' | 'down' | 'stable'

function TrendIndicator({ trend, lowerIsBetter }: { trend: string; lowerIsBetter: boolean }) {
  const isImproving = trend === 'improving'
  const isDeclining = trend === 'declining'

  let icon: MetricTrendIcon = 'stable'
  let className = 'text-muted-foreground'

  if (isImproving) { icon = 'up'; className = 'text-green-600 dark:text-green-400' }
  else if (isDeclining) { icon = 'down'; className = 'text-red-600 dark:text-red-400' }

  // For lower-is-better metrics, flip the arrow direction
  const showUp = lowerIsBetter ? icon === 'down' : icon === 'up'
  const showDown = lowerIsBetter ? icon === 'up' : icon === 'down'

  return (
    <span className={className} aria-hidden>
      {showUp ? <TrendingUp size={14} /> : showDown ? <TrendingDown size={14} /> : <Minus size={14} />}
    </span>
  )
}

function MetricCard({ metric }: { metric: QualityMetric }) {
  const t = useTranslations('quality.metrics')
  const label = t(metric.metricType as any, { defaultValue: metric.metricType })
  const lowerIsBetter = metric.metricType !== 'training_completion'

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-3xl font-bold tabular-nums text-foreground">
          {metric.value}
        </span>
        <span className="text-sm text-muted-foreground">{metric.unit}</span>
        <TrendIndicator trend={metric.trend} lowerIsBetter={lowerIsBetter} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const BADGE_ICON_MAP: Record<string, ReactNode> = {
  Flame:       <Flame size={22} aria-hidden="true" />,
  Star:        <Star size={22} aria-hidden="true" />,
  Trophy:      <Trophy size={22} aria-hidden="true" />,
  Shield:      <Shield size={22} aria-hidden="true" />,
  ShieldCheck: <ShieldCheck size={22} aria-hidden="true" />,
  BookOpen:    <BookOpen size={22} aria-hidden="true" />,
  Award:       <Award size={22} aria-hidden="true" />,
  Medal:       <Medal size={22} aria-hidden="true" />,
  LineChart:   <LineChart size={22} aria-hidden="true" />,
  CheckCircle: <CircleCheck size={22} aria-hidden="true" />,
  Gem:         <Gem size={22} aria-hidden="true" />,
  Certificate: <Award size={22} aria-hidden="true" />,
}

function BadgeIcon({ icon }: { icon: string }) {
  return (
    <span className="flex items-center justify-center text-current">
      {BADGE_ICON_MAP[icon] ?? <Star size={22} aria-hidden="true" />}
    </span>
  )
}

interface BadgeTileProps {
  badge: Badge
  earnedAt?: string
}

function BadgeTile({ badge, earnedAt }: BadgeTileProps) {
  const t = useTranslations('quality.badges')
  const earned = !!earnedAt

  return (
    <div
      className={`rounded-xl border p-4 flex flex-col items-center gap-2 text-center transition-opacity ${
        earned
          ? 'border-border bg-card shadow-sm'
          : 'border-border/50 bg-muted/30 opacity-50'
      }`}
      aria-label={earned ? `${badge.name} — ${t('earned')} ${earnedAt}` : `${badge.name} — ${t('notYetEarned')}`}
    >
      <BadgeIcon icon={badge.icon} />
      <p className="text-xs font-semibold text-foreground leading-tight">{badge.name}</p>
      {earned ? (
        <p className="text-xs text-muted-foreground">{t('earned')} {earnedAt?.slice(0, 10)}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">{t('keepWorking')}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function QualityDashboard() {
  const t = useTranslations('quality')
  const session = useAuthSessionStore((s) => s.session)
  const technicianId = session?.userId ?? ''

  const [qcStreak, setQcStreak] = useState<QualityStreak | null>(null)
  const [rejStreak, setRejStreak] = useState<QualityStreak | null>(null)
  const [metrics, setMetrics] = useState<QualityMetric[]>([])
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([])
  const [trainingCount, setTrainingCount] = useState(0)
  const [moduleCount, setModuleCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!technicianId) return

    async function load() {
      try {
        await seedBadgeCatalogue()

        const period = currentPeriod()
        const [qc, rej, monthMetrics] = await Promise.all([
          calculateQCStreak(technicianId),
          calculateRejectionStreak(technicianId),
          calculateMonthlyMetrics(technicianId, period),
        ])

        setQcStreak(qc)
        setRejStreak(rej)
        setMetrics(monthMetrics)

        await evaluateBadges(technicianId)
        const earned = await getEarnedBadges(technicianId)
        setEarnedBadges(earned)

        // Training progress
        const db = getDb()
        const [completions, modules] = await Promise.all([
          db.module_completions.where('technicianId').equals(technicianId).count(),
          db.micro_learning_modules.count(),
        ])
        setTrainingCount(completions)
        setModuleCount(modules)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [technicianId])

  const earnedByBadgeId = new Map(earnedBadges.map((e) => [e.badgeId, e]))

  const qcResetMsg = qcStreak ? buildResetMessage(qcStreak) : null
  const rejResetMsg = rejStreak ? buildResetMessage(rejStreak) : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground" role="status" aria-live="polite">
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4" dir="auto">
      {/* Streaks section */}
      <section aria-labelledby="streaks-heading">
        <h2 id="streaks-heading" className="text-lg font-semibold mb-4 text-foreground">
          {t('streaks.heading')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {qcStreak && (
            <StreakCard
              label={t('streaks.qcPassing')}
              currentStreak={qcStreak.currentStreak}
              longestStreak={qcStreak.longestStreak}
              resetMessage={qcResetMsg}
              icon="flame"
            />
          )}
          {rejStreak && (
            <StreakCard
              label={t('streaks.zeroRejection')}
              currentStreak={rejStreak.currentStreak}
              longestStreak={rejStreak.longestStreak}
              resetMessage={rejResetMsg}
              icon="shield"
            />
          )}
        </div>
      </section>

      {/* Monthly metrics section */}
      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="text-lg font-semibold mb-4 text-foreground">
          {t('metrics.heading')}
        </h2>
        {metrics.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {metrics.map((m) => (
              <MetricCard key={m.id} metric={m} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('metrics.noData')}</p>
        )}
      </section>

      {/* Training section */}
      <section aria-labelledby="training-heading">
        <h2 id="training-heading" className="text-lg font-semibold mb-4 text-foreground">
          {t('training.heading')}
        </h2>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">{t('training.quarterProgress')}</span>
            <span className="text-sm font-semibold">
              {trainingCount} / {moduleCount}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2" role="progressbar" aria-valuenow={trainingCount} aria-valuemax={moduleCount}>
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: moduleCount > 0 ? `${Math.min((trainingCount / moduleCount) * 100, 100)}%` : '0%' }}
            />
          </div>
        </div>
      </section>

      {/* Badges section */}
      <section aria-labelledby="badges-heading">
        <h2 id="badges-heading" className="text-lg font-semibold mb-4 text-foreground">
          {t('badges.heading')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {BADGE_CATALOGUE.map((badge) => {
            const earned = earnedByBadgeId.get(badge.id)
            return (
              <BadgeTile
                key={badge.id}
                badge={badge}
                earnedAt={earned?.earnedAt}
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}
