'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getAllHandoverReports } from '@/lib/db'
import type { HandoverReport } from '@/lib/db'

type StatusFilter = 'ALL' | 'PENDING' | 'ACKNOWLEDGED' | 'EXPIRED'

function StatusBadge({ status }: { status: HandoverReport['status'] }) {
  const classes =
    status === 'ACKNOWLEDGED'
      ? 'bg-green-100 text-green-700'
      : status === 'PENDING'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-neutral-100 text-neutral-600'

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {status}
    </span>
  )
}

/**
 * Handover History view — accessible to SUPERVISOR and LAB_MANAGER only (AC 5).
 * Rendered inside the shift-handover page route; role gate is enforced at the page level.
 */
export function HandoverHistory() {
  const t = useTranslations('shift')

  const [records, setRecords] = useState<HandoverReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<HandoverReport | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  useEffect(() => {
    let active = true
    setIsLoading(true)

    getAllHandoverReports()
      .then((all) => {
        if (active) {
          setRecords(all)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setError('Failed to load handover history.')
          setIsLoading(false)
        }
      })

    return () => { active = false }
  }, [])

  const filtered =
    statusFilter === 'ALL' ? records : records.filter((r) => r.status === statusFilter)

  if (selected) {
    return <HandoverDetail report={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">{t('history')}</h2>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="ALL">All</option>
          <option value="PENDING">Pending</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-neutral-500">No handover records found.</p>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-start text-xs text-neutral-500">
                <th className="pb-2 pe-4 font-medium">Date</th>
                <th className="pb-2 pe-4 font-medium">Outgoing Tech</th>
                <th className="pb-2 pe-4 font-medium">Incoming Tech</th>
                <th className="pb-2 pe-4 font-medium">Status</th>
                <th className="pb-2 pe-4 font-medium">Pending Samples</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-neutral-100 last:border-0"
                >
                  <td className="py-2 pe-4 text-neutral-700">
                    {r.shiftDate}
                    <span className="ms-1 text-xs text-neutral-400">
                      {new Date(r.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </td>
                  <td className="py-2 pe-4 text-neutral-700">{r.outgoingTechName}</td>
                  <td className="py-2 pe-4 text-neutral-500">
                    {r.incomingTechId ? r.incomingTechId : '—'}
                  </td>
                  <td className="py-2 pe-4">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2 pe-4 text-neutral-700">
                    {r.pendingSamples.stat + r.pendingSamples.routine}
                    {r.pendingSamples.stat > 0 && (
                      <span className="ms-1 text-xs font-medium text-red-600">
                        ({r.pendingSamples.stat} STAT)
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="text-blue-600 underline hover:text-blue-800"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HandoverDetail({
  report,
  onBack,
}: {
  report: HandoverReport
  onBack: () => void
}) {
  const t = useTranslations('shift')

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-blue-600 hover:text-blue-800"
      >
        ← Back to history
      </button>

      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">{t('handoverReport')}</h2>
        <StatusBadge status={report.status} />
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-neutral-500">Date</dt>
          <dd className="font-medium text-neutral-900">{report.shiftDate}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Time</dt>
          <dd className="font-medium text-neutral-900">
            {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Outgoing Tech</dt>
          <dd className="font-medium text-neutral-900">{report.outgoingTechName}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Acknowledged</dt>
          <dd className="font-medium text-neutral-900">
            {report.acknowledgedAt
              ? new Date(report.acknowledgedAt).toLocaleString()
              : '—'}
          </dd>
        </div>
      </dl>

      <div className="space-y-4">
        <section aria-labelledby="detail-samples">
          <h3 id="detail-samples" className="mb-2 text-sm font-medium text-neutral-700">
            {t('pendingSamples')}
          </h3>
          <p className="text-sm text-neutral-600">
            STAT: {report.pendingSamples.stat} | Routine: {report.pendingSamples.routine}
          </p>
          {report.pendingSamples.sampleIds.length > 0 && (
            <p className="mt-1 text-xs text-neutral-400">
              IDs: {report.pendingSamples.sampleIds.join(', ')}
            </p>
          )}
        </section>

        {report.equipmentAlerts.length > 0 && (
          <section aria-labelledby="detail-equipment">
            <h3 id="detail-equipment" className="mb-2 text-sm font-medium text-neutral-700">
              {t('equipmentAlerts')}
            </h3>
            <ul className="space-y-1">
              {report.equipmentAlerts.map((a) => (
                <li key={a.instrumentId} className="text-sm text-red-700">
                  {a.instrumentName} — {a.alertType}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="detail-orders">
          <h3 id="detail-orders" className="mb-2 text-sm font-medium text-neutral-700">
            {t('incompleteOrders')}
          </h3>
          <p className="text-sm text-neutral-600">
            {report.incompleteOrders.length === 0
              ? 'None'
              : `${report.incompleteOrders.length} orders`}
          </p>
        </section>

        {report.outgoingNotes && (
          <section aria-labelledby="detail-notes-out">
            <h3 id="detail-notes-out" className="mb-1 text-sm font-medium text-neutral-700">
              Outgoing Notes
            </h3>
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              {report.outgoingNotes}
            </p>
          </section>
        )}

        {report.incomingNotes && (
          <section aria-labelledby="detail-notes-in">
            <h3 id="detail-notes-in" className="mb-1 text-sm font-medium text-neutral-700">
              Incoming Notes
            </h3>
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              {report.incomingNotes}
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
