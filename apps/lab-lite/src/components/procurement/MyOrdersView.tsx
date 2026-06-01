'use client'

/**
 * MyOrdersView — Story 52.3 Task 6
 *
 * Two-tab view: Active (in-progress) and History (delivered/cancelled/rejected).
 *
 * Active tab: list with reagent summary, urgency badge, current status, ETA.
 * History tab: delivered orders with lead time and total cost.
 * Tap a request to see full detail with OrderStatusPipeline.
 *
 * Filters: status, urgency, date range.
 * Sort: date (default), urgency, status.
 *
 * RTL-ready with logical CSS properties.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Clock, CheckCircle, XCircle, Package } from '@ultranos/ui-kit/icons'
import { getDb } from '@/lib/db'
import { formatAfn } from '@/lib/procurement/cost-tracker'
import { OrderStatusPipeline } from './OrderStatusPipeline'
import type { ResupplyRequest } from '@/lib/db'

type Tab = 'active' | 'history'
type SortField = 'date' | 'urgency' | 'status'

const URGENCY_BADGE: Record<string, string> = {
  routine: 'bg-green-100 text-green-800',
  urgent: 'bg-yellow-100 text-yellow-800',
  critical: 'bg-red-100 text-red-800',
}

const ACTIVE_STATUSES: ResupplyRequest['status'][] = [
  'submitted',
  'received',
  'approved',
  'ordered',
  'shipped',
]

const HISTORY_STATUSES: ResupplyRequest['status'][] = ['delivered', 'cancelled', 'rejected']

function StatusBadge({ status }: { status: ResupplyRequest['status'] }) {
  const colors: Record<string, string> = {
    submitted: 'bg-gray-100 text-gray-700',
    received: 'bg-blue-100 text-blue-700',
    approved: 'bg-indigo-100 text-indigo-700',
    ordered: 'bg-purple-100 text-purple-700',
    shipped: 'bg-orange-100 text-orange-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
    rejected: 'bg-red-100 text-red-700',
    draft: 'bg-gray-100 text-gray-400',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(isoDate))
}

function daysUntil(isoDate: string): number {
  const ms = new Date(isoDate).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

interface RequestCardProps {
  request: ResupplyRequest
  onClick: () => void
}

function ActiveRequestCard({ request, onClick }: RequestCardProps) {
  const reagentSummary = request.items.map((i) => i.reagentDisplay || i.reagentCode).join(', ')
  const etaDays = request.estimatedDelivery ? daysUntil(request.estimatedDelivery) : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border bg-white p-4 text-start hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="truncate font-medium text-sm">{reagentSummary}</p>
          <p className="text-xs text-gray-500 mt-0.5">{formatDate(request.requestedAt)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${URGENCY_BADGE[request.urgency]}`}>
            {request.urgency}
          </span>
          <StatusBadge status={request.status} />
        </div>
      </div>
      {etaDays !== null && (
        <p className="mt-2 flex items-center gap-1 text-xs text-blue-600">
          <Clock size={12} />
          {etaDays > 0 ? `Arriving in ${etaDays}d` : 'Expected today'}
        </p>
      )}
      {request.syncStatus === 'pending' && (
        <p className="mt-1 text-xs text-gray-400">Pending sync</p>
      )}
      {request.syncStatus === 'failed' && (
        <p className="mt-1 text-xs text-red-500">Sync failed — tap to retry</p>
      )}
    </button>
  )
}

function HistoryRequestCard({ request, onClick }: RequestCardProps) {
  const reagentSummary = request.items.map((i) => i.reagentDisplay || i.reagentCode).join(', ')
  const totalCost = request.items.reduce((sum, i) => sum + (i.totalPrice ?? 0), 0)
  const delivered = request.actualDelivery
  const leadDays = delivered
    ? Math.max(0, Math.floor((new Date(delivered).getTime() - new Date(request.requestedAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border bg-white p-4 text-start hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="truncate font-medium text-sm">{reagentSummary}</p>
          {delivered && <p className="text-xs text-gray-500 mt-0.5">Delivered {formatDate(delivered)}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={request.status} />
          {totalCost > 0 && (
            <span className="text-xs font-medium text-gray-700">{formatAfn(totalCost)}</span>
          )}
        </div>
      </div>
      {leadDays !== null && (
        <p className="mt-2 text-xs text-gray-500">Lead time: {leadDays} day{leadDays !== 1 ? 's' : ''}</p>
      )}
    </button>
  )
}

export function MyOrdersView() {
  const t = useTranslations('procurement')
  const [tab, setTab] = useState<Tab>('active')
  const [sortBy, setSortBy] = useState<SortField>('date')
  const [requests, setRequests] = useState<ResupplyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ResupplyRequest | null>(null)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const db = getDb()
      const all = await db.resupplyRequests.toArray()
      setRequests(all)
    } catch {
      // Dexie unavailable — show empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  const filtered = requests.filter((r) =>
    tab === 'active' ? ACTIVE_STATUSES.includes(r.status) : HISTORY_STATUSES.includes(r.status),
  )

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'urgency') {
      const order = { critical: 0, urgent: 1, routine: 2 }
      return (order[a.urgency] ?? 2) - (order[b.urgency] ?? 2)
    }
    if (sortBy === 'status') {
      return a.status.localeCompare(b.status)
    }
    // date — newest first
    return b.requestedAt.localeCompare(a.requestedAt)
  })

  // Detail view
  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-start text-sm text-blue-600"
        >
          ← {t('orders.back')}
        </button>
        <h2 className="font-semibold">{t('orders.detail')}</h2>
        <OrderStatusPipeline request={selected} />
        <div className="rounded-md border">
          <p className="px-4 py-2 text-sm font-medium border-b">{t('orders.items')}</p>
          <ul className="divide-y">
            {selected.items.map((item, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{item.reagentDisplay}</p>
                  <p className="text-xs text-gray-500">{item.reagentCode}</p>
                </div>
                <div className="text-end text-sm">
                  <p>{item.quantityRequested} {item.unitOfMeasure}</p>
                  {item.unitPrice !== null && (
                    <p className="text-xs text-gray-500">{formatAfn(item.unitPrice)}/unit</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex border-b" role="tablist">
        {(['active', 'history'] as const).map((t2) => (
          <button
            key={t2}
            role="tab"
            aria-selected={tab === t2}
            onClick={() => setTab(t2)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t2 ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t(`orders.tabs.${t2}`)}
            {t2 === 'active' && requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length > 0 && (
              <span className="ms-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                {requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600">{t('orders.sortBy')}</label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortField)}
          className="rounded border px-2 py-1 text-xs"
        >
          <option value="date">{t('orders.sortDate')}</option>
          <option value="urgency">{t('orders.sortUrgency')}</option>
          <option value="status">{t('orders.sortStatus')}</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-gray-500 py-4 text-center">{t('orders.loading')}</p>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
          <Package size={40} />
          <p className="text-sm">{t(`orders.empty.${tab}`)}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((req) => (
            <li key={req.requestId}>
              {tab === 'active' ? (
                <ActiveRequestCard request={req} onClick={() => setSelected(req)} />
              ) : (
                <HistoryRequestCard request={req} onClick={() => setSelected(req)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
