import type { StabilityStatus } from '@/lib/sample-stability'

interface StabilityBadgeProps {
  status: StabilityStatus
  remainingMinutes: number
}

/** Format remaining minutes as hours:minutes (e.g. "2h 30m") or minutes (e.g. "45m"). */
function formatRemaining(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${minutes}m`
}

/**
 * Countdown badge showing sample stability status.
 *
 * Color coding:
 *   safe     (> 60 min)  — green, static
 *   warning  (15-60 min) — amber, static
 *   critical (< 15 min)  — red, pulsing animation
 *   expired  (0 min)     — dark red solid, "EXPIRED" label
 *
 * RTL-compatible via logical CSS only.
 */
export function StabilityBadge({ status, remainingMinutes }: StabilityBadgeProps) {
  if (status === 'expired') {
    return (
      <span
        className="inline-flex items-center rounded px-2 py-0.5 text-xs font-bold bg-destructive text-white"
        role="status"
        aria-label="Sample expired"
      >
        EXPIRED
      </span>
    )
  }

  const classMap: Record<Exclude<StabilityStatus, 'expired'>, string> = {
    safe: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    critical: 'bg-destructive/10 text-destructive animate-pulse',
  }

  const label = formatRemaining(remainingMinutes)

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${classMap[status as Exclude<StabilityStatus, 'expired'>]}`}
      role="status"
      aria-label={`Stability: ${label} remaining`}
    >
      {label}
    </span>
  )
}
