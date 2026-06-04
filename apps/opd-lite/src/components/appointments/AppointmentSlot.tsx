'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import type { FhirAppointmentZod, AppointmentStatus } from '@ultranos/shared-types'

interface AppointmentSlotProps {
  time: string // HH:MM formatted
  appointment?: FhirAppointmentZod
  onClick: () => void
}

const STATUS_COLORS: Record<string, string> = {
  free: 'bg-success/10 border-success/20 hover:bg-success/20',
  proposed: 'bg-primary/10 border-primary/20 hover:bg-primary',
  pending: 'bg-primary/10 border-primary/20 hover:bg-primary',
  booked: 'bg-primary/10 border-primary/20 hover:bg-primary',
  arrived: 'bg-warning/10 border-warning/20 hover:bg-warning/20',
  fulfilled: 'bg-muted border-border',
  cancelled: 'bg-destructive/10 border-destructive/20',
  noshow: 'bg-destructive/10 border-destructive/20',
  'entered-in-error': 'bg-muted border-border',
}

const STATUS_BADGE_COLORS: Record<string, string> = {
  booked: 'bg-primary text-primary',
  arrived: 'bg-warning/20 text-warning',
  fulfilled: 'bg-secondary text-foreground',
  cancelled: 'bg-destructive/20 text-destructive',
  noshow: 'bg-destructive/20 text-destructive',
}

const SERVICE_TYPE_BADGE_COLORS: Record<string, string> = {
  'new-consult': 'bg-indigo-100 text-indigo-800',
  'follow-up': 'bg-teal-100 text-teal-800',
  urgent: 'bg-orange-100 text-orange-800',
  'walk-in': 'bg-purple-100 text-purple-800',
}

function getStatusLabel(
  status: AppointmentStatus | 'free',
  t: ReturnType<typeof useTranslations>,
): string {
  const labels: Record<string, string> = {
    free: t('available'),
    booked: t('booked'),
    arrived: t('checkedIn'),
    fulfilled: t('completed'),
    cancelled: t('cancelled'),
    noshow: t('noShow'),
  }
  return labels[status] ?? status
}

function getServiceTypeLabel(
  code: string,
  t: ReturnType<typeof useTranslations>,
): string {
  const labels: Record<string, string> = {
    'new-consult': t('newConsult'),
    'follow-up': t('followUp'),
    urgent: t('urgent'),
    'walk-in': t('walkIn'),
  }
  return labels[code] ?? code
}

export function AppointmentSlot({
  time,
  appointment,
  onClick,
}: AppointmentSlotProps) {
  const t = useTranslations('appointments')

  const status = appointment?.status ?? 'free'
  const colorClasses = STATUS_COLORS[status] ?? STATUS_COLORS.free
  const patientName =
    appointment?.participant?.[0]?.actor?.display ?? null
  const serviceCode =
    appointment?.serviceType?.[0]?.code ?? null

  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-start transition-colors ${colorClasses}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {time}
        </span>

        <div className="flex items-center gap-2">
          {serviceCode && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                SERVICE_TYPE_BADGE_COLORS[serviceCode] ??
                'bg-muted text-foreground'
              }`}
            >
              {getServiceTypeLabel(serviceCode, t)}
            </span>
          )}

          {appointment && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                STATUS_BADGE_COLORS[status] ??
                'bg-muted text-foreground'
              }`}
            >
              {getStatusLabel(status, t)}
            </span>
          )}
        </div>
      </div>

      <p className="mt-1 text-sm text-foreground">
        {patientName ?? t('available')}
      </p>
    </Button>
  )
}
