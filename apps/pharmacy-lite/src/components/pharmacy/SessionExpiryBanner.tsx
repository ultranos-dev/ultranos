'use client'

import { useSessionExpiryWarning } from '@/hooks/useSessionExpiryWarning'

export function SessionExpiryBanner() {
  const { remainingMs, showWarning } = useSessionExpiryWarning()

  if (!showWarning || remainingMs === null) return null

  const minutes = Math.ceil(remainingMs / 60_000)

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning"
      data-testid="session-expiry-banner"
    >
      <span className="font-semibold">Session expiring in {minutes} minute{minutes !== 1 ? 's' : ''}.</span>
      {' '}Save your work and re-authenticate to continue.
    </div>
  )
}
