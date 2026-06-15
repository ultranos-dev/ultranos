'use client'

/**
 * OrderStatusPipeline — Story 52.3 Task 5
 *
 * Visual pipeline showing a resupply request's progress through stages:
 *   Submitted → Received → Approved → Ordered → Shipped → Delivered
 *
 * - RTL mirrored via dir="auto" (logical flow)
 * - Cancelled/rejected shown as red X at point of cancellation with reason
 * - ETA display: "Arriving in X days" when estimatedDelivery is set
 * - Status history log below the pipeline
 */

import type { ResupplyRequest, ResupplyStatus, StatusUpdate } from '@/lib/db'
import { CheckCircle, Clock, XCircle, Truck, Package, ShoppingBag } from '@ultranos/ui-kit/icons'

// Ordered stages for the happy path
const PIPELINE_STAGES: ResupplyStatus[] = [
  'submitted',
  'received',
  'approved',
  'ordered',
  'shipped',
  'delivered',
]

const TERMINAL_FAILURE: ResupplyStatus[] = ['cancelled', 'rejected']

interface StageIconProps {
  stage: ResupplyStatus
  state: 'completed' | 'current' | 'future' | 'failed'
}

function StageIcon({ stage, state }: StageIconProps) {
  const base = 'flex items-center justify-center rounded-full w-8 h-8'

  if (state === 'failed') {
    return (
      <span className={`${base} bg-red-100`}>
        <XCircle className="text-red-600" size={20} />
      </span>
    )
  }
  if (state === 'completed') {
    return (
      <span className={`${base} bg-green-100`}>
        <CheckCircle className="text-green-600" size={20} />
      </span>
    )
  }
  if (state === 'current') {
    const icons: Partial<Record<ResupplyStatus, React.ReactNode>> = {
      submitted: <Clock className="text-blue-600" size={20} />,
      received: <Package className="text-blue-600" size={20} />,
      approved: <CheckCircle className="text-blue-600" size={20} />,
      ordered: <ShoppingBag className="text-blue-600" size={20} />,
      shipped: <Truck className="text-blue-600" size={20} />,
      delivered: <CheckCircle className="text-green-600" size={20} />,
    }
    return (
      <span className={`${base} bg-blue-100 ring-2 ring-blue-500`}>
        {icons[stage] ?? <Clock className="text-blue-600" size={20} />}
      </span>
    )
  }
  // future
  return (
    <span className={`${base} bg-gray-100`}>
      <span className="h-2 w-2 rounded-full bg-gray-300" />
    </span>
  )
}

function daysUntil(isoDate: string): number {
  const now = new Date()
  const target = new Date(isoDate)
  const ms = target.getTime() - now.getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(isoDate),
  )
}

function StatusHistoryEntry({ entry }: { entry: StatusUpdate }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gray-400" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{entry.status}</span>
          <span className="text-xs text-gray-400">{formatDate(entry.updatedAt)}</span>
        </div>
        {entry.note && <p className="text-xs text-gray-500">{entry.note}</p>}
        <p className="text-xs text-gray-400">by {entry.updatedBy}</p>
      </div>
    </li>
  )
}

interface OrderStatusPipelineProps {
  request: ResupplyRequest
}

export function OrderStatusPipeline({ request }: OrderStatusPipelineProps) {
  const currentStatus = request.status
  const isFailed = TERMINAL_FAILURE.includes(currentStatus)
  const currentStageIndex = PIPELINE_STAGES.indexOf(currentStatus)

  // ETA display
  let etaDisplay: string | null = null
  if (request.estimatedDelivery && currentStatus !== 'delivered') {
    const days = daysUntil(request.estimatedDelivery)
    etaDisplay = days > 0 ? `Arriving in ${days} day${days !== 1 ? 's' : ''}` : `Expected ${formatDate(request.estimatedDelivery)}`
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ETA banner */}
      {etaDisplay && (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <Truck size={16} />
          <span>{etaDisplay}</span>
        </div>
      )}

      {/* Pipeline stages */}
      <div
        role="list"
        aria-label="Order status pipeline"
        className="flex items-center gap-0 overflow-x-auto"
        dir="auto"
      >
        {PIPELINE_STAGES.map((stage, idx) => {
          let state: 'completed' | 'current' | 'future' | 'failed'

          if (isFailed && idx === currentStageIndex - 1) {
            state = 'failed'
          } else if (!isFailed && idx === currentStageIndex) {
            state = 'current'
          } else if (idx < currentStageIndex) {
            state = 'completed'
          } else {
            state = 'future'
          }

          const isLast = idx === PIPELINE_STAGES.length - 1

          return (
            <div key={stage} role="listitem" className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <StageIcon stage={stage} state={state} />
                <span
                  className={`text-xs capitalize ${
                    state === 'current'
                      ? 'font-semibold text-blue-700'
                      : state === 'completed'
                      ? 'text-green-700'
                      : state === 'failed'
                      ? 'text-red-600'
                      : 'text-gray-400'
                  }`}
                >
                  {stage}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`mx-1 h-0.5 w-6 shrink-0 ${
                    idx < currentStageIndex ? 'bg-green-400' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Cancelled/rejected banner */}
      {isFailed && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
          <XCircle className="mt-0.5 shrink-0 text-red-600" size={16} />
          <div>
            <p className="text-sm font-medium text-red-800 capitalize">{currentStatus}</p>
            {request.statusHistory.at(-1)?.note && (
              <p className="text-xs text-red-600">{request.statusHistory.at(-1)!.note}</p>
            )}
          </div>
        </div>
      )}

      {/* Status history log */}
      <details className="rounded-md border">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700">
          Status history ({request.statusHistory.length} events)
        </summary>
        <ul className="divide-y divide-gray-100 px-4">
          {[...request.statusHistory].reverse().map((entry, i) => (
            <StatusHistoryEntry key={i} entry={entry} />
          ))}
        </ul>
      </details>
    </div>
  )
}
