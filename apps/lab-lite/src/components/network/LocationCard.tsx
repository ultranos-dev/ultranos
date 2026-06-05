'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useParams } from 'next/navigation'
import type { LabLocation, NetworkStatusSnapshot } from '@/types/lab-network'
import { Clock } from '@ultranos/ui-kit/icons'

interface LocationCardProps {
  location: LabLocation
  snapshot: NetworkStatusSnapshot
}

function ConnectivityDot({ status }: { status: NetworkStatusSnapshot['connectivityStatus'] }) {
  const colorMap = {
    online: 'bg-green-500',
    offline: 'bg-amber-500',
    degraded: 'bg-amber-400',
  }
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colorMap[status]}`}
      aria-label={status}
    />
  )
}

function StatusBadge({ status, mode }: { status: LabLocation['status']; mode: LabLocation['mode'] }) {
  const isActive = status === 'active'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
      }`}
    >
      {isActive ? (mode === 'full' ? 'Full' : 'Collection Only') : 'Inactive'}
    </span>
  )
}

/** Format ISO timestamp as a relative "X min ago" / "X h ago" string. */
function formatRelativeTime(isoTimestamp: string): string {
  const ts = new Date(isoTimestamp).getTime()
  if (ts === 0) return 'Never synced'
  const diffMs = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

export function LocationCard({ location, snapshot }: LocationCardProps) {
  const t = useTranslations('network')
  const router = useRouter()
  const params = useParams<{ locale: string }>()

  function handleClick() {
    router.push(`/${params.locale}/network/${location.id}`)
  }

  const isOnline = snapshot.connectivityStatus === 'online'
  const isStale =
    snapshot.connectivityStatus === 'offline' ||
    Date.now() - new Date(snapshot.lastSyncTimestamp).getTime() > 60 * 60 * 1000 // >1h

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-lg border border-border bg-card p-4 text-start shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      aria-label={`${location.name} — ${snapshot.connectivityStatus}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{location.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <ConnectivityDot status={snapshot.connectivityStatus} />
            <span className="text-xs text-muted-foreground capitalize">{snapshot.connectivityStatus}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground capitalize">
            {location.type}
          </span>
          <StatusBadge status={location.status} mode={location.mode} />
        </div>
      </div>

      {/* Metrics row */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-md bg-muted/30 p-2 text-center">
          <p className="text-lg font-semibold text-foreground">{snapshot.pendingSamples}</p>
          <p className="text-xs text-muted-foreground">{t('pendingSamples')}</p>
        </div>
        <div className="rounded-md bg-muted/30 p-2 text-center">
          <p className={`text-lg font-semibold ${snapshot.stockAlerts > 0 ? 'text-amber-600' : 'text-foreground'}`}>
            {snapshot.stockAlerts}
          </p>
          <p className="text-xs text-muted-foreground">{t('stockAlerts')}</p>
        </div>
        <div className="rounded-md bg-muted/30 p-2 text-center">
          <p className="text-lg font-semibold text-foreground">{snapshot.staffOnDuty}</p>
          <p className="text-xs text-muted-foreground">{t('staffOnDuty')}</p>
        </div>
      </div>

      {/* Last sync row */}
      <div className="mt-3 flex items-center gap-1.5">
        <Clock size={12} className={isStale ? 'text-amber-500' : 'text-muted-foreground'} aria-hidden="true" />
        <span className={`text-xs ${isStale ? 'text-amber-600' : 'text-muted-foreground'}`}>
          {formatRelativeTime(snapshot.lastSyncTimestamp)}
          {!isOnline && <span className="ms-1 font-medium">{t('staleDataWarning')}</span>}
        </span>
      </div>
    </button>
  )
}
