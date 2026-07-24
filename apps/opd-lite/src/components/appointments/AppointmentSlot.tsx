'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import {
  STATUS_COLORS,
  STATUS_BADGE_COLORS,
  SERVICE_TYPE_BADGE_COLORS,
} from '@/lib/appointment-colors'
import type { FhirAppointmentZod, AppointmentStatus } from '@ultranos/shared-types'

interface AppointmentSlotProps {
  time: string // HH:MM formatted
  appointment?: FhirAppointmentZod
  onClick: () => void
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
