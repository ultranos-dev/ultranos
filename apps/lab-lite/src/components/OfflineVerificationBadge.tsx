'use client'

type VerificationSource = 'online' | 'offline' | 'cached'

interface OfflineVerificationBadgeProps {
  source: VerificationSource
}

const badgeConfig: Record<VerificationSource, { label: string; classes: string }> = {
  online: {
    label: 'Online Verified',
    classes: 'bg-green-100 text-green-800 border-green-200',
  },
  offline: {
    label: 'Offline Verified',
    classes: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  cached: {
    label: 'Verified from Cache',
    classes: 'bg-primary/10 text-primary border-primary',
  },
}

/**
 * Badge indicating the source of patient verification:
 * - online: server-verified (green)
 * - offline: Ed25519 signature verified locally (amber)
 * - cached: pulled from Dexie patient cache (blue)
 */
export function OfflineVerificationBadge({ source }: OfflineVerificationBadgeProps) {
  const config = badgeConfig[source]
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${config.classes}`}
    >
      {config.label}
    </span>
  )
}
