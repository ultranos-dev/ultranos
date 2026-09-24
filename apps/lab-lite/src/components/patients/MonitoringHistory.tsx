'use client'

/**
 * MonitoringHistory — Story 52.1 Task 7 / Story 58.2
 *
 * Patient monitoring detail view showing all monitoring flags grouped by
 * REQUIRED TEST, with status, last completed date, and next due date.
 *
 * RTL-ready: uses logical CSS properties throughout.
 * Data-minimized: displays only what is stored in MonitoringFlag
 * (first name + age + the LOINC test — NO medication identity, no diagnosis,
 * no prescriber name; audit C-LAB-1).
 */

import { useState, useEffect } from 'react'
import { FlaskConical, CheckCircle, AlertCircle, Clock } from '@ultranos/ui-kit/icons'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { getDb, type MonitoringFlag, type MonitoringFlagStatus } from '@/lib/db'

interface GroupedTest {
  testRequired: string
  testDisplay: string
  flags: MonitoringFlag[]
}

function groupByTest(flags: MonitoringFlag[]): GroupedTest[] {
  const map = new Map<string, GroupedTest>()
  for (const flag of flags) {
    const existing = map.get(flag.testRequired)
    if (existing) {
      existing.flags.push(flag)
    } else {
      map.set(flag.testRequired, {
        testRequired: flag.testRequired,
        testDisplay: flag.testDisplay,
        flags: [flag],
      })
    }
  }
  return Array.from(map.values())
}

function StatusBadge({ status }: { status: MonitoringFlagStatus }) {
  const labels: Record<MonitoringFlagStatus, string> = {
    upcoming: 'Upcoming',
    due: 'Due',
    overdue: 'Overdue',
    completed: 'Completed',
  }
  const styles: Record<MonitoringFlagStatus, string> = {
    upcoming: 'bg-muted text-muted-foreground',
    due: 'bg-warning/10 text-warning',
    overdue: 'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/30',
    completed: 'bg-success/10 text-success',
  }
  const icons: Record<MonitoringFlagStatus, React.ReactNode> = {
    upcoming: <Clock size={12} aria-hidden="true" />,
    due: <AlertCircle size={12} aria-hidden="true" />,
    overdue: <AlertCircle size={12} aria-hidden="true" />,
    completed: <CheckCircle size={12} aria-hidden="true" />,
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {icons[status]}
      {labels[status]}
    </span>
  )
}

interface MonitoringFlagRowProps {
  flag: MonitoringFlag
}

function MonitoringFlagRow({ flag }: MonitoringFlagRowProps) {
  return (
    <div className={`rounded-md border p-3 ${flag.status === 'overdue' ? 'border-destructive/30 bg-destructive/10' : 'border-border/50 bg-card'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{flag.testDisplay}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every {flag.frequencyDays} days
          </p>
        </div>
        <StatusBadge status={flag.status} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="font-medium">Due: </span>
          {flag.dueDate}
        </div>
        {flag.lastCompletedAt && (
          <div>
            <span className="font-medium">Last done: </span>
            {flag.lastCompletedAt.split('T')[0]}
          </div>
        )}
        {flag.status === 'completed' && (
          <div className="col-span-2 text-success">
            <CheckCircle size={12} className="me-1 inline" aria-hidden="true" />
            Completed — next due {flag.dueDate}
          </div>
        )}
      </div>
    </div>
  )
}

interface MonitoringHistoryProps {
  patientRef: string
  patientFirstName?: string
  patientAge?: number
}

export function MonitoringHistory({ patientRef, patientFirstName, patientAge }: MonitoringHistoryProps) {
  const [groups, setGroups] = useState<GroupedTest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const db = getDb()
        const flags = await db.monitoringFlags
          .where('patientRef')
          .equals(patientRef)
          .sortBy('dueDate')
        if (mounted) setGroups(groupByTest(flags))
      } catch {
        // Fail silently
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void load()
    return () => { mounted = false }
  }, [patientRef])

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        <EmptyState
          icon={FlaskConical}
          title="No monitoring flags on record"
          description={
            patientFirstName && patientAge
              ? `${patientFirstName}, ${patientAge} yr — no medications requiring lab follow-up`
              : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {patientFirstName && patientAge && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{patientFirstName}</span>, {patientAge} yr
        </p>
      )}

      {groups.map((group) => (
        <div key={group.testRequired} className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <FlaskConical size={14} className="text-muted-foreground shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">{group.testDisplay}</h3>
          </div>
          <div className="space-y-2">
            {group.flags.map((flag) => (
              <MonitoringFlagRow
                key={`${flag.patientRef}-${flag.testRequired}-${flag.id ?? 0}`}
                flag={flag}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
