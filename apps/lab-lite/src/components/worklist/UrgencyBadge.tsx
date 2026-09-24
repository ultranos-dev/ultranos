import type { SampleUrgency } from '@/lib/prioritization-engine'

interface UrgencyBadgeProps {
  urgency: SampleUrgency
}

const CONFIG: Record<SampleUrgency, { label: string; className: string }> = {
  stat: {
    label: 'STAT',
    className: 'bg-destructive/10 text-destructive border border-destructive/30',
  },
  urgent: {
    label: 'Urgent',
    className: 'bg-warning/10 text-warning border border-warning/30',
  },
  routine: {
    label: 'Routine',
    className: 'bg-muted text-muted-foreground border border-border',
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
