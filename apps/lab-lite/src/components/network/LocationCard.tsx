'use client'

import { useTranslations } from 'next-intl'
import type { LabLocation, NetworkStatusSnapshot } from '@/types/lab-network'
import { Clock } from '@ultranos/ui-kit/icons'

interface LocationCardProps {
  location: LabLocation
  snapshot: NetworkStatusSnapshot
  /** Called when the user clicks the card to edit the location. */
  onEdit: (location: LabLocation) => void
}

function ConnectivityDot({ status }: { status: NetworkStatusSnapshot['connectivityStatus'] }) {
  const colorMap: Record<NetworkStatusSnapshot['connectivityStatus'], string> = {
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

export function LocationCard({ location, snapshot, onEdit }: LocationCardProps) {
  const t = useTranslations('network')

  // P3: i18n status label
  function statusLabel(): string {
    if (location.status !== 'active') return t('statusInactive')
    return location.mode === 'full' ? t('statusFull') : t('statusCollectionOnly')
  }

  // P3: i18n relative time — replaces standalone formatRelativeTime
  function relativeTime(): string {
    const ts = new Date(snapshot.lastSyncTimestamp).getTime()
    if (ts === 0) return t('neverSynced')
    const diffMs = Date.now() - ts
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 1) return t('justNow')
    if (diffMin < 60) return t('minutesAgo', { count: diffMin })
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return t('hoursAgo', { count: diffH })
    return t('daysAgo', { count: Math.floor(diffH / 24) })
  }

  const isActive = location.status === 'active'
  const isOnline = snapshot.connectivityStatus === 'online'
  const isStale =
    snapshot.connectivityStatus === 'offline' ||
    Date.now() - new Date(snapshot.lastSyncTimestamp).getTime() > 60 * 60 * 1000

  return (
    <button
      type="button"
      onClick={() => onEdit(location)}
      className="w-full rounded-lg border border-border bg-card p-4 text-start shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
            }`}
          >
            {statusLabel()}
          </span>
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
          {relativeTime()}
          {!isOnline && <span className="ms-1 font-medium">{t('staleDataWarning')}</span>}
        </span>
      </div>
    </button>
  )
}
