'use client'

import type { HistoryItem } from '@/lib/history-data'

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
  synced: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
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
        <div className="text-sm font-medium text-neutral-900 truncate">
          {item.medicationNames.join(', ')}
        </div>
        <div className="text-xs text-neutral-500 truncate">
          {item.patientFirstName} &middot; {item.pharmacistDisplay} &middot;{' '}
          {formatTimestamp(item.whenHandedOver)}
        </div>
      </div>
      <span
        data-testid={`sync-badge-${item.id}`}
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ms-2 ${syncBadgeClasses[item.syncStatus]}`}
      >
        {syncLabels[item.syncStatus]}
      </span>
    </li>
  )
}
