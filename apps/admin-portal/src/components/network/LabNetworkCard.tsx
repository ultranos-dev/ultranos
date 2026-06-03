'use client'

import { Badge } from '@/components/ui/badge'

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    ACTIVE: 'success',
    PENDING: 'warning',
    SUSPENDED: 'destructive',
  }

  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {status}
    </Badge>
  )
}

interface LabSummary {
  labId: string
  labName: string
  status: string
  pendingSamples: number
  stockAlertCount: number
  stockDataAvailable: boolean
  staffCount: number
  lastSyncAt: string | null
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function LabNetworkCard({ lab }: { lab: LabSummary }) {
  return (
    <div className="rounded-2xl border border-border bg-popover p-4 hover:shadow-card transition-shadow">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{lab.labName}</h3>
        <StatusBadge status={lab.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground">Pending Samples</p>
          <p className="font-medium text-foreground">{lab.pendingSamples}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Stock Alerts</p>
          <p className={`font-medium ${lab.stockAlertCount > 0 ? 'text-destructive' : 'text-foreground'}`}>
            {lab.stockDataAvailable ? lab.stockAlertCount : '—'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Staff</p>
          <p className="font-medium text-foreground">{lab.staffCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Last Sync</p>
          <p className="font-medium text-foreground">{formatRelativeTime(lab.lastSyncAt)}</p>
        </div>
      </div>
    </div>
  )
}
