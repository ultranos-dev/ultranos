'use client'

/**
 * ResultColorIndicator — Story 45.4 Task 3
 *
 * Displays a color-coded dot + icon + label for a result interpretation.
 * Colors are paired with distinct shapes for colorblind accessibility (WCAG AA).
 *
 * Green  (#16A34A) + check circle  → normal
 * Yellow (#EAB308) + alert triangle → low / high (slightly abnormal)
 * Red    (#DC2626) + x octagon      → critical-low / critical-high
 */

import type { Interpretation } from '@/lib/result-interpretation'

// ---------------------------------------------------------------------------
// Icons (inline SVG — no external dependency, works offline)
// ---------------------------------------------------------------------------

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function TriangleAlertIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function OctagonXIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const INTERPRETATION_CONFIG = {
  normal: {
    label: 'Normal',
    colorClass: 'text-green-700 dark:text-green-400',
    dotClass: 'bg-green-600',
    Icon: CheckCircleIcon,
  },
  low: {
    label: 'Low',
    colorClass: 'text-yellow-700 dark:text-yellow-400',
    dotClass: 'bg-yellow-500',
    Icon: TriangleAlertIcon,
  },
  high: {
    label: 'High',
    colorClass: 'text-yellow-700 dark:text-yellow-400',
    dotClass: 'bg-yellow-500',
    Icon: TriangleAlertIcon,
  },
  'critical-low': {
    label: 'Critical — Low',
    colorClass: 'text-red-700 dark:text-red-400',
    dotClass: 'bg-red-600',
    Icon: OctagonXIcon,
  },
  'critical-high': {
    label: 'Critical — High',
    colorClass: 'text-red-700 dark:text-red-400',
    dotClass: 'bg-red-600',
    Icon: OctagonXIcon,
  },
} satisfies Record<Interpretation, { label: string; colorClass: string; dotClass: string; Icon: (p: { className?: string }) => JSX.Element }>

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ResultColorIndicatorProps {
  interpretation: Interpretation
  /** Override the displayed label (e.g. a localised string). Falls back to English default. */
  label?: string
  /** Additional CSS classes for the outer wrapper */
  className?: string
}

export function ResultColorIndicator({
  interpretation,
  label,
  className = '',
}: ResultColorIndicatorProps) {
  const config = INTERPRETATION_CONFIG[interpretation]
  const displayLabel = label ?? config.label
  const { Icon, colorClass, dotClass } = config

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${colorClass} ${className}`}
      aria-label={displayLabel}
      role="img"
    >
      {/* Colored dot (redundant visual with the icon — belt-and-suspenders for colorblind users) */}
      <span
        aria-hidden="true"
        className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotClass}`}
      />
      {/* Shape-coded icon */}
      <Icon className="flex-shrink-0" />
      {/* Text label */}
      <span className="text-sm font-medium">{displayLabel}</span>
    </span>
  )
}
