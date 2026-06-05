'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getDb } from '@/lib/db'
import { getOverdueSendOuts } from '@/lib/sendout-tat'
import { StatusUpdateModal } from '@/components/sendout/StatusUpdateModal'
import { ResultImportModal } from '@/components/sendout/ResultImportModal'
import { AlertTriangle, Clock } from '@ultranos/ui-kit/icons'
import type { SendOut, ReferenceLab, SendOutStatus } from '@/types/reference-lab'

type FilterStatus = SendOutStatus | 'all'

const STATUS_LABELS: Record<SendOutStatus, string> = {
  sent: 'Sent',
  received: 'Received',
  processing: 'Processing',
  'results-available': 'Results Available',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<SendOutStatus, string> = {
  sent: 'bg-blue-100 text-blue-800',
  received: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-orange-100 text-orange-800',
  'results-available': 'bg-green-100 text-green-800',
  cancelled: 'bg-muted text-muted-foreground',
}

export default function SendOutsPage() {
  const session = useAuthSessionStore((s) => s.session)
  const [sendOuts, setSendOuts] = useState<SendOut[]>([])
  const [labs, setLabs] = useState<Map<string, ReferenceLab>>(new Map())
  const [overdueSendOuts, setOverdueSendOuts] = useState<SendOut[]>([])
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterLabId, setFilterLabId] = useState('')
  const [loading, setLoading] = useState(true)
  const [statusModal, setStatusModal] = useState<SendOut | null>(null)
  const [resultModal, setResultModal] = useState<SendOut | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const db = getDb()
      const [all, allLabs, overdue] = await Promise.all([
        db.send_outs.orderBy('sentAt').reverse().toArray(),
        db.reference_labs.toArray(),
        getOverdueSendOuts(),
      ])
      setSendOuts(all)
      setLabs(new Map(allLabs.map((l) => [l.id, l])))
      setOverdueSendOuts(overdue)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  if (!session) return null

  const filtered = sendOuts.filter((s) => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterLabId && s.referenceLabId !== filterLabId) return false
    return true
  })

  const elapsedDays = (sentAt: string) => {
    const ms = Date.now() - new Date(sentAt.includes('|') ? Number(sentAt.split('|')[0]) : sentAt).getTime()
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground">Send-Outs</h1>

      {/* Overdue alert banner */}
      {overdueSendOuts.length > 0 && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md bg-amber-50 border border-amber-200 px-4 py-3"
        >
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{overdueSendOuts.length} send-out{overdueSendOuts.length > 1 ? 's are' : ' is'} overdue.</strong>
            {' '}
            <button
              type="button"
              onClick={() => setFilterStatus('sent')}
              className="underline"
            >
              View pending send-outs
            </button>
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_LABELS) as SendOutStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={filterLabId}
          onChange={(e) => setFilterLabId(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
          aria-label="Filter by reference lab"
        >
          <option value="">All labs</option>
          {[...labs.values()].map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      {/* Send-outs table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">No send-outs found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-start font-medium">Tracking ID</th>
                <th className="px-4 py-3 text-start font-medium">Reference Lab</th>
                <th className="px-4 py-3 text-start font-medium">Test Requested</th>
                <th className="px-4 py-3 text-start font-medium">Date Sent</th>
                <th className="px-4 py-3 text-start font-medium">Status</th>
                <th className="px-4 py-3 text-start font-medium">Elapsed</th>
                <th className="px-4 py-3 text-start font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map((sendOut) => {
                const lab = labs.get(sendOut.referenceLabId)
                const elapsed = elapsedDays(sendOut.sentAt)
                const expected = lab?.averageTATDays[sendOut.testRequested.loincCode] ?? 7
                const isOverdue = elapsed > expected && !['results-available', 'cancelled'].includes(sendOut.status)
                return (
                  <tr key={sendOut.id} className={isOverdue ? 'bg-amber-50' : ''}>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[120px] truncate">
                      {sendOut.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-foreground">{lab?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-foreground">{sendOut.testRequested.loincDisplay}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(Number(sendOut.sentAt.split('|')[0]) || sendOut.sentAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[sendOut.status]}`}>
                        {STATUS_LABELS[sendOut.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-amber-700 font-semibold' : 'text-muted-foreground'}`}>
                        {isOverdue && <AlertTriangle size={12} />}
                        {elapsed}d / {expected}d
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {sendOut.status !== 'cancelled' && sendOut.status !== 'results-available' && (
                          <button
                            type="button"
                            onClick={() => setStatusModal(sendOut)}
                            className="text-xs text-blue-600 underline"
                          >
                            Update Status
                          </button>
                        )}
                        {sendOut.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => setResultModal(sendOut)}
                            className="text-xs text-green-600 underline"
                          >
                            Import Result
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {statusModal && (
        <StatusUpdateModal
          sendOut={statusModal}
          onClose={() => setStatusModal(null)}
          onSuccess={() => { setStatusModal(null); void loadData() }}
        />
      )}

      {resultModal && (
        <ResultImportModal
          sendOut={resultModal}
          onClose={() => setResultModal(null)}
          onSuccess={() => { setResultModal(null); void loadData() }}
        />
      )}
    </div>
  )
}
