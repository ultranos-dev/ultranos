'use client'

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { AcknowledgeAlertModal } from './AcknowledgeAlertModal'

type FilterTab = 'ALL' | 'UNACKNOWLEDGED' | 'ACKNOWLEDGED'

interface Alert {
  id: string
  configId: string
  labId: string
  labName: string
  testCategory: string
  currentRate: number
  threshold: number
  triggeredAt: string
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  notes: string | null
}

const PAGE_SIZE = 25

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SurveillanceAlertHistory() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState<FilterTab>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ackAlert, setAckAlert] = useState<Alert | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const acknowledged =
        filter === 'UNACKNOWLEDGED' ? false : filter === 'ACKNOWLEDGED' ? true : undefined
      const result = await trpc.admin.listSurveillanceAlerts.query({
        acknowledged,
        cursor,
        limit: PAGE_SIZE,
      })
      setAlerts(result.alerts)
      setTotal(result.total)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [filter, cursor])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  function handleFilterChange(newFilter: FilterTab) {
    setFilter(newFilter)
    setCursor(0)
  }

  function handleAckSuccess() {
    setAckAlert(null)
    fetchAlerts()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1
  const FILTERS: FilterTab[] = ['ALL', 'UNACKNOWLEDGED', 'ACKNOWLEDGED']

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Alert History</h3>
        {/* Filter tabs */}
        <div className="flex gap-1 rounded-full bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => handleFilterChange(f)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-accent text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="mt-6 text-text-secondary">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
          <p className="text-text-secondary">
            No surveillance alerts found{filter !== 'ALL' ? ` with status ${filter.toLowerCase()}` : ''}.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black text-white">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Date/Time</th>
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Lab</th>
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Test Category</th>
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Positivity Rate</th>
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-end font-medium text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface-raised">
                {alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-accent-subtle transition-colors">
                    <td className="px-4 py-3 text-text-secondary">{formatDateTime(alert.triggeredAt)}</td>
                    <td className="px-4 py-3 font-medium">{alert.labName}</td>
                    <td className="px-4 py-3 text-text-secondary">{alert.testCategory}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-danger">{alert.currentRate}%</span>
                      <span className="text-text-secondary"> / {alert.threshold}%</span>
                    </td>
                    <td className="px-4 py-3">
                      {alert.acknowledgedAt ? (
                        <span className="inline-block rounded-full bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success">
                          Acknowledged
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-danger-subtle px-2.5 py-0.5 text-xs font-medium text-danger">
                          Unacknowledged
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {!alert.acknowledgedAt && (
                        <button
                          onClick={() => setAckAlert(alert)}
                          className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-primary hover:bg-accent-subtle transition-colors"
                        >
                          Acknowledge
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>
                Showing {cursor + 1}–{Math.min(cursor + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                  disabled={cursor === 0}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
                >
                  Previous
                </button>
                <span className="flex items-center px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCursor(cursor + PAGE_SIZE)}
                  disabled={cursor + PAGE_SIZE >= total}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Acknowledge modal */}
      {ackAlert && (
        <AcknowledgeAlertModal
          alertId={ackAlert.id}
          labName={ackAlert.labName}
          testCategory={ackAlert.testCategory}
          onClose={() => setAckAlert(null)}
          onSuccess={handleAckSuccess}
        />
      )}
    </div>
  )
}
