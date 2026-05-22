'use client'

import type { RecentUploadItem } from '@/hooks/useDashboardData'

interface RecentUploadsListProps {
  items: RecentUploadItem[]
}

const statusConfig: Record<RecentUploadItem['status'], { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-green-50 text-green-700' },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700' },
  uploading: { label: 'Uploading', className: 'bg-amber-50 text-amber-700' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700' },
  expired: { label: 'Expired', className: 'bg-neutral-100 text-neutral-400' },
}

function formatTimestamp(iso: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function RecentUploadsList({ items }: RecentUploadsListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-medium text-neutral-500">Recent Uploads</h2>
        <p className="mt-3 text-sm text-neutral-400">No uploads yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium text-neutral-500">Recent Uploads</h2>
      <ul className="mt-3 divide-y divide-neutral-100" role="list">
        {items.map((item) => {
          const cfg = statusConfig[item.status]
          return (
            <li key={item.id} className="flex items-center justify-between py-2.5 [@media(hover:hover)and(pointer:fine)]:hover:bg-neutral-50 transition-colors duration-150">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {item.loincDisplay}
                </p>
                <p className="text-xs text-neutral-400">{formatTimestamp(item.timestamp)}</p>
              </div>
              <span
                className={`ms-2 inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}
              >
                {cfg.label}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
