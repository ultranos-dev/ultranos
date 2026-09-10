'use client'

import { useTranslations } from 'next-intl'

/**
 * Renders the fulfilment status of a prescription so the ordering clinician can
 * see whether the pharmacy dispensed it. The status arrives from the Hub via
 * sync-pull (`_ultranos.prescriptionStatus`, updated by `medication.recordDispense`).
 *
 * ACTIVE (awaiting dispense) renders subtly; DISPENSED is success-green;
 * PARTIALLY_DISPENSED is warning; CANCELLED is destructive — matching the
 * project's semantic prominence for clinically meaningful states.
 */
const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-muted text-muted-foreground',
  DISPENSED: 'bg-success/10 text-success',
  PARTIALLY_DISPENSED: 'bg-warning/10 text-warning',
  EXPIRED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-destructive/10 text-destructive',
}

const STATUS_KEY: Record<string, string> = {
  ACTIVE: 'dispensePending',
  DISPENSED: 'dispenseDispensed',
  PARTIALLY_DISPENSED: 'dispensePartial',
  EXPIRED: 'dispenseExpired',
  CANCELLED: 'dispenseCancelled',
}

export function DispenseStatusBadge({ status }: { status?: string }) {
  const t = useTranslations('prescription')
  if (!status) return null
  const labelKey = STATUS_KEY[status]
  if (!labelKey) return null
  const style = STATUS_STYLE[status] ?? 'bg-muted text-muted-foreground'
  return (
    <span
      data-testid="dispense-status-badge"
      className={`ms-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}
    >
      {t(labelKey)}
    </span>
  )
}
