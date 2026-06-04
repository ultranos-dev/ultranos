'use client'

import type { HistoryItem } from '@/lib/history-data'
import { Badge } from '@/components/ui/badge'

interface HistoryItemRowProps {
  item: HistoryItem
}

function formatTimestamp(isoString: string): string {
  if (!isoString) return '--'
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return '--'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const syncBadgeClasses: Record<HistoryItem['syncStatus'], string> = {
  synced: 'bg-success/10 text-success border-success/20',
  pending: 'bg-warning/10 text-warning border-warning/20',
  failed: 'bg-destructive/10 text-destructive border-destructive/20',
}

const syncLabels: Record<HistoryItem['syncStatus'], string> = {
  synced: 'Synced',
  pending: 'Pending',
  failed: 'Failed',
}

export function HistoryItemRow({ item }: HistoryItemRowProps) {
  return (
    <li
      data-testid={`history-row-${item.id}`}
      className="flex items-center justify-between px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">
          {item.medicationNames.join(', ')}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {item.patientFirstName} &middot; {item.pharmacistDisplay} &middot;{' '}
          {formatTimestamp(item.whenHandedOver)}
        </div>
      </div>
      <Badge
        variant="outline"
        data-testid={`sync-badge-${item.id}`}
        className={`ms-2 ${syncBadgeClasses[item.syncStatus]}`}
      >
        {syncLabels[item.syncStatus]}
      </Badge>
    </li>
  )
}
