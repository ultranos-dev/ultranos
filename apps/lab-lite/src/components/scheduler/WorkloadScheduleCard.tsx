'use client'

import { useTranslations } from 'next-intl'
import { useWorkloadSchedule } from '@/hooks/useWorkloadSchedule'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import type { ScheduledGroup, TimeWarning } from '@/lib/workload-scheduler'

/** Power budget progress bar with green/amber/red coloring. */
function BudgetBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const color =
    pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-green-500'

  return (
    <div
      className="h-3 w-full rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  )
}

/** Phase badge (POWER / MANUAL / overflow). */
function PhaseBadge({ phase }: { phase: ScheduledGroup['phase'] }) {
  const t = useTranslations('scheduler.workload')

  if (phase === 'power') {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
        {t('requiresPower')}
      </span>
    )
  }
  if (phase === 'manual') {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        {t('manual')}
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      {t('overflow')}
    </span>
  )
}

/** Warning banner for budget/time alerts. */
function WarningBanner({ warnings }: { warnings: TimeWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`rounded-md border p-2 text-sm ${
            w.severity === 'red'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
          role="alert"
        >
          {w.message}
        </div>
      ))}
    </div>
  )
}

export function WorkloadScheduleCard() {
  const t = useTranslations('scheduler')
  const { schedule, budget, warnings, timeWarnings, isLoading, refresh, hasSchedule } =
    useWorkloadSchedule()

  // No power schedule configured — show setup prompt
  if (!hasSchedule && !isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">
          {t('workload.title')}
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          {t('powerSchedule.setupPrompt')}
        </p>
        <Link href="/settings/power-schedule">
          <Button variant="outline">
            {t('powerSchedule.setupAction')}
          </Button>
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-4"
        aria-busy="true"
        aria-label={t('workload.title')}
      >
        <div className="h-4 w-36 animate-pulse rounded bg-muted mb-3" />
        <div className="h-3 w-full animate-pulse rounded bg-muted/60 mb-2" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
      </div>
    )
  }

  if (!schedule || !budget) return null

  const allWarnings = [...(warnings ?? []), ...(timeWarnings ?? [])]

  const powerGroups = schedule.scheduledGroups.filter((g) => g.phase === 'power')
  const manualGroups = schedule.scheduledGroups.filter((g) => g.phase === 'manual')
  const overflowGroups = schedule.scheduledGroups.filter((g) => g.phase === 'overflow')

  const budgetUsedPct = budget.total > 0 ? schedule.budget.used : 0

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t('workload.title')}
        </h3>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/power-schedule"
            className="text-xs text-blue-600 hover:underline"
          >
            {t('workload.configureLink')}
          </Link>
          <Button variant="ghost" onClick={refresh}>
            {t('workload.refresh')}
          </Button>
        </div>
      </div>

      {/* Power window header */}
      <p className="text-sm text-foreground mb-2">
        {t('workload.powerWindow', {
          startTime: budget.startTime,
          endTime: budget.endTime,
          hours: Math.round((budget.totalMinutes / 60) * 10) / 10,
        })}
      </p>

      {/* Budget bar */}
      <div className="mb-3">
        <BudgetBar used={budgetUsedPct} total={budget.totalMinutes} />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>
            {t('workload.analyzerTimeNeeded')}: {Math.round(schedule.budget.used)}min
          </span>
          <span>
            {t('workload.available')}: {Math.round(budget.remainingMinutes)}min
          </span>
        </div>
      </div>

      {/* Warnings */}
      <WarningBanner warnings={allWarnings} />

      {/* Empty state */}
      {schedule.scheduledGroups.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t('workload.emptyState')}
        </p>
      )}

      {/* Power phase groups */}
      {powerGroups.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {t('workload.phaseHeaderPower')}
          </p>
          <div className="flex flex-col gap-1">
            {powerGroups.map((group) => (
              <GroupRow key={group.loincCode} group={group} />
            ))}
          </div>
        </div>
      )}

      {/* Overflow groups */}
      {overflowGroups.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-red-600 mb-1">
            {t('workload.phaseHeaderOverflow')}
          </p>
          <div className="flex flex-col gap-1">
            {overflowGroups.map((group) => (
              <GroupRow key={group.loincCode} group={group} />
            ))}
          </div>
        </div>
      )}

      {/* Manual phase groups */}
      {manualGroups.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {t('workload.phaseHeaderManual')}
          </p>
          <div className="flex flex-col gap-1">
            {manualGroups.map((group) => (
              <GroupRow key={group.loincCode} group={group} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GroupRow({ group }: { group: ScheduledGroup }) {
  const t = useTranslations('scheduler.workload')

  return (
    <div
      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
        group.phase === 'overflow'
          ? 'bg-red-50'
          : group.phase === 'manual'
            ? 'bg-green-50'
            : 'bg-blue-50'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-foreground truncate">
          {group.displayName}
        </span>
        {group.hasUrgent && (
          <span className="inline-flex rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {t('urgent')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 ms-2">
        <span className="text-xs text-muted-foreground">
          {t('testCount', { count: group.testCount })}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('estimatedTime', { minutes: group.estimatedMinutes })}
        </span>
        <PhaseBadge phase={group.phase} />
      </div>
    </div>
  )
}
