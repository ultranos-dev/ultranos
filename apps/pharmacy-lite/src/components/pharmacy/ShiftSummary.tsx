'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { getShiftSummary, type ShiftSummaryStats } from '@/lib/history-data'

interface ShiftSummaryProps {
  onClose: () => void
}

export function ShiftSummary({ onClose }: ShiftSummaryProps) {
  const [stats, setStats] = useState<ShiftSummaryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const result = await getShiftSummary()
        if (!cancelled) setStats(result)
      } catch {
        if (!cancelled) setError('Failed to load shift summary.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div
      data-testid="shift-summary-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Shift Summary"
    >
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-card mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">Shift Summary</h3>
          <button
            data-testid="shift-summary-close"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Today&apos;s activity (midnight to now)
        </p>

        {loading ? (
          <div data-testid="shift-summary-loading" className="py-6 text-center text-sm text-muted-foreground">
            Calculating...
          </div>
        ) : error ? (
          <div data-testid="shift-summary-error" className="py-6 text-center text-sm text-destructive">
            {error}
          </div>
        ) : stats ? (
          <div data-testid="shift-summary-stats" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border p-3 text-center">
                <div data-testid="stat-prescriptions" className="text-2xl font-bold text-foreground">
                  {stats.totalPrescriptions}
                </div>
                <div className="text-xs text-muted-foreground">Prescriptions Dispensed</div>
              </div>
              <div className="rounded-2xl border border-border p-3 text-center">
                <div data-testid="stat-items" className="text-2xl font-bold text-foreground">
                  {stats.totalMedicationItems}
                </div>
                <div className="text-xs text-muted-foreground">Medication Items</div>
              </div>
            </div>

            <div className="rounded-2xl border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sync Success Rate</span>
                <span
                  data-testid="stat-sync-rate"
                  className={`text-lg font-bold ${
                    stats.syncSuccessRate === 100
                      ? 'text-success'
                      : stats.syncSuccessRate >= 80
                        ? 'text-warning'
                        : 'text-destructive'
                  }`}
                >
                  {stats.syncSuccessRate}%
                </span>
              </div>
            </div>

            {stats.unresolvedFailures.length > 0 && (
              <div data-testid="unresolved-failures" className="space-y-2">
                <h4 className="text-sm font-semibold text-destructive">
                  Unresolved Sync Failures ({stats.unresolvedFailures.length})
                </h4>
                <ul className="divide-y divide-border rounded-2xl border border-destructive/20 overflow-hidden">
                  {stats.unresolvedFailures.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-foreground truncate">
                          {item.medicationNames.join(', ')}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {item.patientFirstName}
                        </div>
                      </div>
                      <Badge variant="outline" className="ms-2 bg-destructive/10 text-destructive border-destructive/20">
                        Failed
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
