'use client'

export interface RecentDispenseItem {
  id: string
  patientRef: string
  medicationName: string
  whenHandedOver: string
  syncStatus: 'synced' | 'pending' | 'failed'
}

interface RecentDispensingListProps {
  items: RecentDispenseItem[]
}

function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '--:--'
  }
}

const syncBadgeClasses: Record<RecentDispenseItem['syncStatus'], string> = {
  synced: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
}

const syncLabels: Record<RecentDispenseItem['syncStatus'], string> = {
  synced: 'Synced',
  pending: 'Pending',
  failed: 'Failed',
}

export function RecentDispensingList({ items }: RecentDispensingListProps) {
  return (
    <div data-testid="recent-dispensing-list" className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-600">
        Recent Dispensing
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 py-4 text-center">
          No dispensing activity today
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white overflow-hidden">
          {items.map((item) => (
            <li
              key={item.id}
              data-testid={`dispense-row-${item.id}`}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-neutral-900 truncate">
                  {item.medicationName}
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  {item.patientRef} &middot; {formatTime(item.whenHandedOver)}
                </div>
              </div>
              <span
                data-testid={`sync-badge-${item.id}`}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ms-2 ${syncBadgeClasses[item.syncStatus]}`}
              >
                {syncLabels[item.syncStatus]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
