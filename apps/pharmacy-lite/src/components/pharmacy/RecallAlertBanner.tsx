'use client'

import { AlertTriangle } from '@ultranos/ui-kit/icons'
import type { RecallAlert } from '@ultranos/shared-types'

/**
 * SAFETY: surfaces active drug recalls at dispense with high prominence
 * (red, not collapsed) — mirrors the AllergyBanner pattern (rule #4).
 */
export function RecallAlertBanner({ alerts }: { alerts: RecallAlert[] }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-xl bg-destructive/10 backdrop-blur-md p-5 shadow-card ring-[0.65px] ring-destructive/40"
      data-testid="recall-banner"
    >
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={20} className="text-destructive shrink-0" />
        <span className="text-sm font-bold text-destructive uppercase tracking-wide">
          Active recall{alerts.length > 1 ? 's' : ''}
        </span>
      </div>
      <ul className="space-y-1">
        {alerts.map((a) => (
          <li key={a.recallId} className="text-sm font-semibold text-destructive">
            &bull; {a.description}
          </li>
        ))}
      </ul>
    </div>
  )
}
