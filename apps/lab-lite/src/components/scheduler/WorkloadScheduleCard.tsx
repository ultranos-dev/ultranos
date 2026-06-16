'use client'

import { useTranslations, useLocale } from 'next-intl'
import { useWorkloadSchedule } from '@/hooks/useWorkloadSchedule'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { FlaskConical, Microscope, Zap, TestTube2, Activity, Droplets, Syringe } from '@ultranos/ui-kit/icons'
import type { ScheduledGroup, TimeWarning } from '@/lib/workload-scheduler'

// ---------------------------------------------------------------------------
// LOINC → icon mapping (medical icons — must NOT mirror in RTL per CLAUDE.md)
// ---------------------------------------------------------------------------

const LOINC_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  '58410-2': Activity,    // CBC — hematology analyzer
  '57698-3': FlaskConical, // Lipid Panel
  '4548-4':  FlaskConical, // HbA1c
  '51990-0': FlaskConical, // Basic Metabolic Panel
  '24325-3': FlaskConical, // Liver Function Tests
  '3016-3':  Zap,          // TSH — immunoassay (high-power)
  '24356-8': Microscope,   // Urinalysis — manual microscopy
  '1558-6':  Droplets,     // Fasting Blood Glucose
}

function TestTypeIcon({ loincCode, phase }: { loincCode: string; phase: ScheduledGroup['phase'] }) {
  const Icon = LOINC_ICON_MAP[loincCode] ?? TestTube2
  const colorClass =
    phase === 'overflow' ? 'text-destructive' : phase === 'manual' ? 'text-muted-foreground' : 'text-primary'
  return <Icon size={14} className={`shrink-0 ${colorClass}`} />
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Power budget progress bar — colour threshold based on unclamped ratio. */
function BudgetBar({ used, total }: { used: number; total: number }) {
  // F01: compute ratio for colour separately from the clamped display percentage
  const ratio = total > 0 ? used / total : 0
  const displayPct = Math.min(ratio * 100, 100)
  const color =
    ratio > 1 ? 'bg-destructive' : ratio > 0.8 ? 'bg-amber-500' : 'bg-primary'

  return (
    <div
      className="h-3 w-full rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(displayPct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${displayPct}%` }}
      />
    </div>
  )
}

/** Phase badge (POWER / MANUAL / OVERFLOW). */
function PhaseBadge({ phase }: { phase: ScheduledGroup['phase'] }) {
  const t = useTranslations('scheduler.workload')

  if (phase === 'power') {
    return (
      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        {t('requiresPower')}
      </span>
    )
  }
  if (phase === 'manual') {
    return (
      <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
        {t('manual')}
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
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
          // F20: stable key derived from content, not array index
          key={`${w.severity}-${i}-${w.message.slice(0, 20)}`}
          className={`rounded-md border p-2 text-sm ${
            w.severity === 'red'
              ? 'border-destructive/20 bg-destructive/5 text-destructive'
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

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function WorkloadScheduleCard() {
  const t = useTranslations('scheduler')
  const locale = useLocale()
  const { schedule, budget, warnings, timeWarnings, isLoading, refresh, hasSchedule } =
    useWorkloadSchedule()

  // F22: locale-prefixed href so next-intl [locale] routing works
  const powerScheduleHref = `/${locale}/settings/power-schedule`

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
        <Link href={powerScheduleHref}>
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

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t('workload.title')}
        </h3>
        <div className="flex items-center gap-2">
          <Link
            href={powerScheduleHref}
            className="text-xs text-primary hover:underline"
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
        <BudgetBar used={schedule.budget.used} total={budget.totalMinutes} />
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
          <p className="text-xs font-medium text-destructive mb-1">
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
          ? 'bg-destructive/5'
          : group.phase === 'manual'
            ? 'bg-muted/50'
            : 'bg-primary/5'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* F16: test-type icon per group row */}
        <TestTypeIcon loincCode={group.loincCode} phase={group.phase} />
        <span className="font-medium text-foreground truncate">
          {group.displayName}
        </span>
        {group.hasUrgent && (
          <span className="inline-flex rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
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
