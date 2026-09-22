'use client'

type HistoryStatus = 'pending' | 'uploading' | 'completed' | 'expired' | 'failed'

interface StatusBadgeProps {
  status: HistoryStatus
}

const STATUS_CONFIG: Record<HistoryStatus, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-success/10 text-success' },
  pending: { label: 'Pending', className: 'bg-warning/10 text-warning' },
  uploading: { label: 'Uploading', className: 'bg-warning/10 text-warning' },
  failed: { label: 'Failed', className: 'bg-destructive/10 text-destructive' },
  expired: { label: 'Expired', className: 'bg-muted text-muted-foreground' },
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
