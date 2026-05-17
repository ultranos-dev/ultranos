'use client'

import type { QueueItem, FulfillmentPhaseBadge, SyncStatus } from '@/lib/queue-data'

interface QueueItemCardProps {
  item: QueueItem
  onSelect?: (item: QueueItem) => void
  showSyncBadge?: boolean
  onRetry?: (item: QueueItem) => void
  retrying?: boolean
  isPaperPrescription?: boolean
}

const phaseBadgeClasses: Record<FulfillmentPhaseBadge, string> = {
  loaded: 'bg-blue-100 text-blue-700',
  reviewing: 'bg-amber-100 text-amber-700',
  dispensing: 'bg-amber-100 text-amber-700 animate-pulse',
  completed: 'bg-green-100 text-green-700',
}

const phaseLabels: Record<FulfillmentPhaseBadge, string> = {
  loaded: 'Loaded',
  reviewing: 'Reviewing',
  dispensing: 'Dispensing',
  completed: 'Completed',
}

const syncBadgeClasses: Record<SyncStatus, string> = {
  synced: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
}

const syncLabels: Record<SyncStatus, string> = {
  synced: 'Synced',
  pending: 'Pending',
  failed: 'Failed',
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return '--:--'
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '--:--'
  }
}

export function QueueItemCard({
  item,
  onSelect,
  showSyncBadge,
  onRetry,
  retrying,
  isPaperPrescription,
}: QueueItemCardProps) {
  const isInteractive = !!onSelect

  return (
    <li
      data-testid={`queue-item-${item.id}`}
      className={`flex items-center justify-between px-4 py-3 transition-colors ${
        isInteractive ? 'cursor-pointer hover:bg-neutral-50' : ''
      }`}
      onClick={isInteractive ? () => onSelect(item) : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(item)
              }
            }
          : undefined
      }
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-neutral-900 truncate">
          {item.patientFirstName}
        </div>
        <div className="text-xs text-neutral-500 truncate">
          {item.medicationCount} meds &middot; {formatTime(item.timestamp)}
        </div>
      </div>

      <div className="flex items-center gap-2 ms-2">
        {isPaperPrescription && (
          <span
            data-testid={`paper-badge-${item.id}`}
            className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700"
          >
            PAPER
          </span>
        )}
        {isPaperPrescription && (
          <span
            data-testid={`manual-verify-flag-${item.id}`}
            className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
          >
            Manual Verification Required
          </span>
        )}
        <span
          data-testid={`phase-badge-${item.id}`}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${phaseBadgeClasses[item.phase]}`}
        >
          {phaseLabels[item.phase]}
        </span>

        {showSyncBadge && (
          <span
            data-testid={`sync-badge-${item.id}`}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${syncBadgeClasses[item.syncStatus]}`}
          >
            {syncLabels[item.syncStatus]}
          </span>
        )}

        {onRetry && item.syncStatus === 'failed' && (
          <button
            data-testid={`retry-btn-${item.id}`}
            className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation()
              onRetry(item)
            }}
            disabled={retrying}
          >
            {retrying ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-red-300 border-t-red-700 me-1" />
            ) : null}
            Retry Sync
          </button>
        )}
      </div>
    </li>
  )
}
