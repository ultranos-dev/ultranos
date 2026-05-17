'use client'

type HistoryStatus = 'pending' | 'uploading' | 'completed' | 'expired' | 'failed'

interface StatusBadgeProps {
  status: HistoryStatus
}

const STATUS_CONFIG: Record<HistoryStatus, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-green-50 text-green-700' },
  pending: { label: 'Pending', className: 'bg-yellow-50 text-yellow-700' },
  uploading: { label: 'Uploading', className: 'bg-orange-50 text-orange-700' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700' },
  expired: { label: 'Expired', className: 'bg-neutral-100 text-neutral-500' },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, className } = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      data-testid={`status-badge-${status}`}
    >
      {label}
    </span>
  )
}
