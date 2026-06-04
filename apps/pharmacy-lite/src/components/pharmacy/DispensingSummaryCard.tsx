'use client'

import { memo } from 'react'

interface DispensingSummaryCardProps {
  dispensedToday: number
  pendingSync: number
  failedSync: number
}

export const DispensingSummaryCard = memo(function DispensingSummaryCard({
  dispensedToday,
  pendingSync,
  failedSync,
}: DispensingSummaryCardProps) {
  return (
    <div data-testid="dispensing-summary-card" className="space-y-3">
      {/* Primary metric — dispensed today (largest, most prominent) */}
      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-primary uppercase tracking-wide">Dispensed Today</p>
          <p className="text-sm text-muted-foreground mt-0.5">Prescriptions fulfilled this shift</p>
        </div>
        <div data-testid="dispensed-today-count" className="text-3xl font-bold text-primary tabular-nums">
          {dispensedToday}
        </div>
      </div>

      {/* Secondary metrics row */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-2xl border p-3 flex items-center justify-between ${
          pendingSync > 0 ? 'border-warning/20 bg-warning/10' : 'border-border bg-card'
        }`}>
          <p className="text-xs font-medium text-muted-foreground">Pending Sync</p>
          <span
            data-testid="pending-sync-count"
            className={`text-lg font-bold tabular-nums ${pendingSync > 0 ? 'text-warning' : 'text-muted-foreground'}`}
          >
            {pendingSync}
          </span>
        </div>

        <div className={`rounded-2xl border p-3 flex items-center justify-between ${
          failedSync > 0 ? 'border-destructive/30 bg-destructive/10' : 'border-border bg-card'
        }`}>
          <p className="text-xs font-medium text-muted-foreground">Failed</p>
          <span
            data-testid="failed-sync-count"
            className={`text-lg font-bold tabular-nums ${failedSync > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {failedSync}
          </span>
        </div>
      </div>
    </div>
  )
})
