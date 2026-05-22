'use client'

import { useTranslations } from 'next-intl'
import type { FhirAppointmentZod, AppointmentStatus } from '@ultranos/shared-types'

interface AppointmentSlotProps {
  time: string // HH:MM formatted
  appointment?: FhirAppointmentZod
  onClick: () => void
}

const STATUS_COLORS: Record<string, string> = {
  free: 'bg-green-50 border-green-200 hover:bg-green-100',
  proposed: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
  pending: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
  booked: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
  arrived: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
  fulfilled: 'bg-neutral-100 border-neutral-300',
  cancelled: 'bg-red-50 border-red-200',
  noshow: 'bg-red-50 border-red-200',
  'entered-in-error': 'bg-neutral-100 border-neutral-300',
}

const STATUS_BADGE_COLORS: Record<string, string> = {
  booked: 'bg-blue-100 text-blue-800',
  arrived: 'bg-amber-100 text-amber-800',
  fulfilled: 'bg-neutral-200 text-neutral-700',
  cancelled: 'bg-red-100 text-red-800',
  noshow: 'bg-red-100 text-red-800',
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
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-start transition-colors ${colorClasses}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-neutral-700">
          {time}
        </span>

        <div className="flex items-center gap-2">
          {serviceCode && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                SERVICE_TYPE_BADGE_COLORS[serviceCode] ??
                'bg-neutral-100 text-neutral-700'
              }`}
            >
              {getServiceTypeLabel(serviceCode, t)}
            </span>
          )}

          {appointment && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                STATUS_BADGE_COLORS[status] ??
                'bg-neutral-100 text-neutral-700'
              }`}
            >
              {getStatusLabel(status, t)}
            </span>
          )}
        </div>
      </div>

      <p className="mt-1 text-sm text-neutral-900">
        {patientName ?? t('available')}
      </p>
    </button>
  )
}
