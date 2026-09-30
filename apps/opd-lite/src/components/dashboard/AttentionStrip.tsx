'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { AlertTriangle } from '@ultranos/ui-kit/icons'
import {
  useUnresolvedConflictsCount,
  usePendingLabResultsCount,
  useDuplicateReviewsCount,
  useTodayEncounters,
  useTodayAppointmentCounts,
} from './use-dashboard-counts'

type Tone = 'alert' | 'warning' | 'neutral'

interface ChipProps {
  href: string
  label: string
  count: number | null
  loading: boolean
  tone: Tone
  unavailableLabel: string
}

/**
 * A single attention chip. Design intent (Calm launcher):
 * - a non-zero safety/queue count is escalated by tone (conflicts = destructive),
 * - a zero count is muted so it stops competing for attention,
 * - a `null` count renders "unavailable", never a false "0".
 */
function AttentionChip({ href, label, count, loading, tone, unavailableLabel }: ChipProps) {
  const active = count !== null && count > 0
  const escalated = active && tone !== 'neutral'

  const toneClasses = !active
    ? 'border-border bg-card text-muted-foreground opacity-60'
    : tone === 'alert'
      ? 'border-destructive/35 bg-destructive/10 text-destructive'
      : tone === 'warning'
        ? 'border-warning/40 bg-warning/10 text-warning'
        : 'border-border bg-card text-foreground'

  return (
    <Link
      href={href}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm transition-colors [@media(hover:hover)and(pointer:fine)]:hover:bg-muted/60 ${toneClasses}`}
      data-testid={`attention-chip`}
    >
      {escalated && tone === 'alert' && (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{label}</span>
      {loading ? (
        <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-current opacity-40" aria-hidden="true" />
      ) : (
        <span className="font-bold tabular-nums">{count === null ? unavailableLabel : count}</span>
      )}
    </Link>
  )
}

/**
 * Compact attention line for the calm-launcher dashboard. Replaces the previous
 * four equal-weight stat cards: the counts are still one tap away but no longer
 * flatten urgency (a 0 and a Tier-1 conflict used to look identical).
 */
export function AttentionStrip() {
  const t = useTranslations('dashboard')
  const conflicts = useUnresolvedConflictsCount()
  const labs = usePendingLabResultsCount()
  const duplicates = useDuplicateReviewsCount()
  const today = useTodayEncounters()
  const appointments = useTodayAppointmentCounts()

  const unavailable = t('unavailableShort')

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2"
      role="group"
      aria-label={t('needsAttention')}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('needsAttention')}
      </span>
      <AttentionChip
        href="/appointments"
        label={t('appointments')}
        count={appointments.counts?.scheduled ?? null}
        loading={appointments.loading}
        tone="neutral"
        unavailableLabel={unavailable}
      />
      <AttentionChip
        href="/appointments"
        label={t('waiting')}
        count={appointments.counts?.waiting ?? null}
        loading={appointments.loading}
        tone="neutral"
        unavailableLabel={unavailable}
      />
      <AttentionChip
        href="/conflicts"
        label={t('unresolvedConflicts')}
        count={conflicts.count}
        loading={conflicts.loading}
        tone="alert"
        unavailableLabel={unavailable}
      />
      <AttentionChip
        href="/notifications"
        label={t('pendingLabResults')}
        count={labs.count}
        loading={labs.loading}
        tone="neutral"
        unavailableLabel={unavailable}
      />
      <AttentionChip
        href="/duplicate-review"
        label={t('pendingDuplicates')}
        count={duplicates.count}
        loading={duplicates.loading}
        tone="warning"
        unavailableLabel={unavailable}
      />
      <AttentionChip
        href="/appointments"
        label={t('todayEncounters')}
        count={today.stats.total}
        loading={today.loading}
        tone="neutral"
        unavailableLabel={unavailable}
      />
    </div>
  )
}
