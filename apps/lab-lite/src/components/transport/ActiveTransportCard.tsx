'use client'

// ---------------------------------------------------------------------------
// Story 54.3 — Active Transport Card (Task 8)
// Displays a single in-transit transport session on the main lab dashboard.
// Shows courier ID, origin → destination, sample count, elapsed transit time,
// and a stability status indicator based on elapsed time and session status.
//
// PHI rules (CLAUDE.md):
//   Rule #1: No PHI in logs or displayed data — only opaque IDs.
//   Rule #7: Lab Portal sees only name + age — transport records must not carry demographics.
//
// Story 63.1: strings keyed under the transport.card namespace.
// ---------------------------------------------------------------------------

import { useTranslations } from 'next-intl'
import { Truck, Clock, Package } from '@ultranos/ui-kit/icons'
import type { TransportSession } from '@/types/transport'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute elapsed hours from pickupTimestamp to now. */
function getElapsedHours(pickupTimestamp: string): number {
  const pickup = new Date(pickupTimestamp).getTime()
  const now = Date.now()
  return (now - pickup) / (1000 * 60 * 60)
}

/** Format elapsed hours as a human-readable string, e.g. "2h 15m". */
function formatElapsed(elapsedHours: number): string {
  const totalMinutes = Math.floor(elapsedHours * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

/**
 * Determine the stability color based on elapsed hours and session status.
 *
 * P16: Thresholds are a conservative heuristic based on the blood stability window (6h).
 * Blood is the most common and most time-sensitive specimen type. The amber threshold
 * (4h) gives lab staff a 2-hour warning before the blood window closes.
 * Per-specimen stability checks run in recordDelivery() using DEFAULT_STABILITY_WINDOWS.
 */
function getStabilityColor(
  elapsedHours: number,
  status: TransportSession['status'],
): 'green' | 'amber' | 'red' {
  if (status === 'flagged') return 'red'
  if (elapsedHours > 6) return 'red'   // beyond blood window
  if (elapsedHours >= 4) return 'amber' // 2h warning before blood window closes
  return 'green'
}

const COLOR_CLASSES: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-success/10 text-success',
  amber: 'bg-warning/10 text-warning',
  red: 'bg-destructive/10 text-destructive',
}

const COLOR_DOT_CLASSES: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-destructive',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ActiveTransportCardProps {
  session: TransportSession
  onClick?: () => void
}

export function ActiveTransportCard({ session, onClick }: ActiveTransportCardProps) {
  const t = useTranslations('transport.card')

  const elapsedHours = getElapsedHours(session.pickupTimestamp)
  const color = getStabilityColor(elapsedHours, session.status)
  const badgeClasses = COLOR_CLASSES[color]
  const dotClass = COLOR_DOT_CLASSES[color]
  const isFlagged = session.status === 'flagged'

  return (
    <div
      data-testid="active-transport-card"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      className={[
        'rounded-lg border border-border bg-card p-4 shadow-sm',
        onClick ? 'cursor-pointer hover:border-border hover:shadow-md transition-shadow' : '',
      ].join(' ')}
    >
      {/* Header: courier ID + stability badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Truck size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-foreground">
            {t('courierLabel', { courierId: session.courierId })}
          </span>
        </div>

        {/* Stability indicator badge */}
        <span
          data-testid="stability-indicator"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClasses}`}
        >
          <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
          {isFlagged
            ? t('statusFlagged')
            : color === 'green'
              ? t('statusStable')
              : color === 'amber'
                ? t('statusWarning')
                : t('statusCritical')}
        </span>
      </div>

      {/* Origin → Destination — raw IDs replaced with resolved names when API provides them */}
      <div className="mt-2 text-sm text-muted-foreground">
        <span className="font-mono text-xs">{session.originLocationId}</span>
        {' → '}
        <span className="font-mono text-xs">{session.destinationLocationId}</span>
      </div>

      {/* Footer: sample count + elapsed time */}
      <div className="mt-3 flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Package size={15} className="shrink-0" aria-hidden="true" />
          <span data-testid="sample-count">{t('sampleCount', { count: session.sampleCount })}</span>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock size={15} className="shrink-0" aria-hidden="true" />
          <span data-testid="elapsed-time">{formatElapsed(elapsedHours)}</span>
        </div>
      </div>
    </div>
  )
}
