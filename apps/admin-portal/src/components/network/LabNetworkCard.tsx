'use client'

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-success-subtle text-success',
    PENDING: 'bg-warning-subtle text-warning',
    SUSPENDED: 'bg-danger-subtle text-danger',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
      {status}
    </span>
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
    <div className="rounded-2xl border border-border bg-surface-raised p-4 hover:shadow-card transition-shadow">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">{lab.labName}</h3>
        <StatusBadge status={lab.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-text-secondary">Pending Samples</p>
          <p className="font-medium text-text-primary">{lab.pendingSamples}</p>
        </div>
        <div>
          <p className="text-text-secondary">Stock Alerts</p>
          <p className={`font-medium ${lab.stockAlertCount > 0 ? 'text-danger' : 'text-text-primary'}`}>
            {lab.stockDataAvailable ? lab.stockAlertCount : '—'}
          </p>
        </div>
        <div>
          <p className="text-text-secondary">Staff</p>
          <p className="font-medium text-text-primary">{lab.staffCount}</p>
        </div>
        <div>
          <p className="text-text-secondary">Last Sync</p>
          <p className="font-medium text-text-primary">{formatRelativeTime(lab.lastSyncAt)}</p>
        </div>
      </div>
    </div>
  )
}
