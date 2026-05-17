'use client'

import { useEffect, useState } from 'react'
import { getShiftSummary, type ShiftSummaryStats } from '@/lib/history-data'

interface ShiftSummaryProps {
  onClose: () => void
}

const syncBadgeClasses = {
  failed: 'bg-red-100 text-red-700',
} as const

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Shift Summary"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-neutral-900">Shift Summary</h3>
          <button
            data-testid="shift-summary-close"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <p className="text-xs text-neutral-500 mb-4">
          Today&apos;s activity (midnight to now)
        </p>

        {loading ? (
          <div data-testid="shift-summary-loading" className="py-6 text-center text-sm text-neutral-400">
            Calculating...
          </div>
        ) : error ? (
          <div data-testid="shift-summary-error" className="py-6 text-center text-sm text-red-600">
            {error}
          </div>
        ) : stats ? (
          <div data-testid="shift-summary-stats" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-neutral-200 p-3 text-center">
                <div data-testid="stat-prescriptions" className="text-2xl font-bold text-neutral-900">
                  {stats.totalPrescriptions}
                </div>
                <div className="text-xs text-neutral-500">Prescriptions Dispensed</div>
              </div>
              <div className="rounded-lg border border-neutral-200 p-3 text-center">
                <div data-testid="stat-items" className="text-2xl font-bold text-neutral-900">
                  {stats.totalMedicationItems}
                </div>
                <div className="text-xs text-neutral-500">Medication Items</div>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600">Sync Success Rate</span>
                <span
                  data-testid="stat-sync-rate"
                  className={`text-lg font-bold ${
                    stats.syncSuccessRate === 100
                      ? 'text-green-700'
                      : stats.syncSuccessRate >= 80
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }`}
                >
                  {stats.syncSuccessRate}%
                </span>
              </div>
            </div>

            {stats.unresolvedFailures.length > 0 && (
              <div data-testid="unresolved-failures" className="space-y-2">
                <h4 className="text-sm font-semibold text-red-700">
                  Unresolved Sync Failures ({stats.unresolvedFailures.length})
                </h4>
                <ul className="divide-y divide-neutral-100 rounded-lg border border-red-200 overflow-hidden">
                  {stats.unresolvedFailures.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-neutral-900 truncate">
                          {item.medicationNames.join(', ')}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">
                          {item.patientFirstName}
                        </div>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ms-2 ${syncBadgeClasses.failed}`}>
                        Failed
                      </span>
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
