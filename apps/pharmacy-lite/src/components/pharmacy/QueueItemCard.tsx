'use client'

import type { QueueItem, FulfillmentPhaseBadge, SyncStatus } from '@/lib/queue-data'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface QueueItemCardProps {
  item: QueueItem
  onSelect?: (item: QueueItem) => void
  showSyncBadge?: boolean
  onRetry?: (item: QueueItem) => void
  retrying?: boolean
  isPaperPrescription?: boolean
}

const phaseBadgeClasses: Record<FulfillmentPhaseBadge, string> = {
  loaded: 'bg-primary/10 text-primary border-primary/20',
  reviewing: 'bg-warning/10 text-warning border-warning/20',
  dispensing: 'bg-warning/10 text-warning border-warning/20 animate-pulse motion-reduce:animate-none',
  completed: 'bg-success/10 text-success border-success/20',
}

const phaseLabels: Record<FulfillmentPhaseBadge, string> = {
  loaded: 'Loaded',
  reviewing: 'Reviewing',
  dispensing: 'Dispensing',
  completed: 'Completed',
}

const syncBadgeClasses: Record<SyncStatus, string> = {
  synced: 'bg-success/10 text-success border-success/20',
  pending: 'bg-warning/10 text-warning border-warning/20',
  failed: 'bg-destructive/10 text-destructive border-destructive/20',
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
        isInteractive ? 'cursor-pointer hover:bg-accent' : ''
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
        <div className="text-sm font-medium text-foreground truncate">
          {item.patientFirstName}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {item.medicationCount} meds &middot; {formatTime(item.timestamp)}
        </div>
      </div>

      <div className="flex items-center gap-2 ms-2">
        {isPaperPrescription && (
          <Badge
            variant="outline"
            data-testid={`paper-badge-${item.id}`}
            className="bg-warning/10 text-warning border-warning/20"
          >
            PAPER
          </Badge>
        )}
        {isPaperPrescription && (
          <Badge
            variant="outline"
            data-testid={`manual-verify-flag-${item.id}`}
            className="bg-destructive/10 text-destructive border-destructive/20"
          >
            Manual Verification Required
          </Badge>
        )}
        <Badge
          variant="outline"
          data-testid={`phase-badge-${item.id}`}
          className={phaseBadgeClasses[item.phase]}
        >
          {phaseLabels[item.phase]}
        </Badge>

        {showSyncBadge && (
          <Badge
            variant="outline"
            data-testid={`sync-badge-${item.id}`}
            className={syncBadgeClasses[item.syncStatus]}
          >
            {syncLabels[item.syncStatus]}
          </Badge>
        )}

        {onRetry && item.syncStatus === 'failed' && (
          <Button
            variant="destructive"
            data-testid={`retry-btn-${item.id}`}
            onClick={(e) => {
              e.stopPropagation()
              onRetry(item)
            }}
            disabled={retrying}
          >
            {retrying ? (
              <span className="inline-block h-3 w-3 animate-spin motion-reduce:animate-none rounded-full border-2 border-red-300 border-t-red-700 me-1" />
            ) : null}
            Retry Sync
          </Button>
        )}
      </div>
    </li>
  )
}
