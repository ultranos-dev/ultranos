'use client'

const STALE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

export interface StaleDataBannerProps {
  lastSyncedAt: string | null
  failedCount: number
  onSyncNow: () => void
  /**
   * Live network connectivity. When `true`, the elapsed-time "data may be
   * outdated" warning is suppressed — an online app can refresh on demand, so
   * time since the last pull is not itself a staleness risk. Failed-item
   * warnings still show regardless. Defaults to `false` to preserve the
   * conservative offline-first warning for callers that don't pass connectivity.
   */
  isOnline?: boolean
}

function getMinutesAgo(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 60_000)
}

export function StaleDataBanner({ lastSyncedAt, failedCount, onSyncNow, isOnline = false }: StaleDataBannerProps) {
  const isStaleByTime =
    lastSyncedAt === null || Date.now() - new Date(lastSyncedAt).getTime() > STALE_THRESHOLD_MS
  // Elapsed-time staleness is only a real risk when OFFLINE. While connected the
  // app can pull on demand (opd-lite also runs a background freshness heartbeat),
  // so don't alarm merely because time passed with the app sitting idle.
  const showTimeWarning = !isOnline && isStaleByTime
  const isStaleByFailures = failedCount > 0

  if (!showTimeWarning && !isStaleByFailures) return null

  const minutesAgo = showTimeWarning && lastSyncedAt ? getMinutesAgo(lastSyncedAt) : null

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        padding: '0.5rem 1rem',
        backgroundColor: '#fef9c3',
        borderBottom: '1px solid #facc15',
        fontSize: '0.8125rem',
        color: '#854d0e',
      }}
    >
      <span>
        <strong>Data may be outdated</strong>
        {showTimeWarning && minutesAgo !== null && <> — last synced {minutesAgo} minutes ago</>}
        {showTimeWarning && minutesAgo === null && <> — never synced</>}
        {isStaleByFailures && <> ({failedCount} failed sync items)</>}
      </span>
      <button
        type="button"
        onClick={onSyncNow}
        style={{
          padding: '0.25rem 0.75rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#854d0e',
          backgroundColor: 'transparent',
          border: '1px solid #854d0e',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Sync Now
      </button>
    </div>
  )
}
