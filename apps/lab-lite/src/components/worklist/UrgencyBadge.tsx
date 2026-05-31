import type { SampleUrgency } from '@/lib/prioritization-engine'

interface UrgencyBadgeProps {
  urgency: SampleUrgency
}

const CONFIG: Record<SampleUrgency, { label: string; className: string }> = {
  stat: {
    label: 'STAT',
    className: 'bg-red-100 text-red-800 border border-red-300',
  },
  urgent: {
    label: 'Urgent',
    className: 'bg-amber-100 text-amber-800 border border-amber-300',
  },
  routine: {
    label: 'Routine',
    className: 'bg-neutral-100 text-neutral-600 border border-neutral-300',
  },
}

/**
 * Pill badge showing sample urgency level.
 * RTL-compatible — no directional layout assumptions.
 */
export function UrgencyBadge({ urgency }: UrgencyBadgeProps) {
  const { label, className } = CONFIG[urgency]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}
      aria-label={`Urgency: ${label}`}
    >
      {label}
    </span>
  )
}
