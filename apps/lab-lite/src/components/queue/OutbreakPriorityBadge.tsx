'use client'

/**
 * Outbreak Priority Badge — Story 54.5 (AC #3)
 *
 * Red badge with target icon displayed on queue entries that match the active
 * outbreak's target test codes. Not dismissible — visible as long as outbreak
 * mode is active for this sample.
 *
 * No PHI — sample ID is opaque.
 */

import { Target } from '@ultranos/ui-kit/icons'

export function OutbreakPriorityBadge() {
  return (
    <span
      data-testid="outbreak-priority-badge"
      aria-label="Outbreak Priority"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        backgroundColor: '#dc2626',
        color: '#fff',
        borderRadius: '4px',
        padding: '0.125rem 0.5rem',
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.025em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <Target size={12} aria-hidden="true" strokeWidth={2.5} />
      OUTBREAK PRIORITY
    </span>
  )
}
