'use client'

import { useTranslations } from 'next-intl'
import {
  STATUS_BADGE_COLORS,
} from '@/lib/appointment-colors'
import { AlertTriangle } from '@ultranos/ui-kit/icons'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import type { FhirAppointmentZod, AppointmentStatus } from '@ultranos/shared-types'

interface AppointmentSlotProps {
  time: string // HH:MM formatted
  appointment?: FhirAppointmentZod
  onClick: () => void
  /** Whether the booked patient has recorded allergies (Rule #4 prominence). */
  hasAllergy?: boolean
  /** Short-lived signed photo URL for the booked patient (opaque key). */
  photoUrl?: string | null
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

/**
 * A single timetable row: time in the leading column, then the body — a muted
 * "Free" marker for open slots or a green-tinted patient block for booked ones.
 * Rows are separated by a hairline (the container renders them borderless-first).
 * Matches the appointments-island day-schedule mockup 1:1.
 */
export function AppointmentSlot({
  time,
  appointment,
  onClick,
  hasAllergy = false,
  photoUrl = null,
}: AppointmentSlotProps) {
  const t = useTranslations('appointments')

  const status = appointment?.status ?? 'free'
  const patientName = appointment?.participant?.[0]?.actor?.display ?? null
  const serviceCode = appointment?.serviceType?.[0]?.code ?? null
  // Wait counter — starts at check-in (arrivedAt) once the patient is marked arrived.
  const arrivedAt = (appointment?._ultranos as { arrivedAt?: string } | undefined)?.arrivedAt
  const waitMinutes =
    status === 'arrived' && arrivedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(arrivedAt).getTime()) / 60_000))
      : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="grid min-h-[40px] w-full grid-cols-[60px_1fr] items-start border-t border-border text-start transition-colors first:border-t-0 hover:bg-muted/40"
    >
      {/* Time column — right-aligned in its lane */}
      <span className="pe-2.5 pt-2 text-end text-xs tabular-nums text-muted-foreground">
        {time}
      </span>

      {/* Body — Free marker or the booked patient block */}
      <span className="min-w-0 py-1 pe-2">
        {!appointment ? (
          <span className="block px-0.5 py-1 text-xs text-muted-foreground/60">
            {t('free')}
          </span>
        ) : (
          <span className="my-0.5 flex items-center gap-2.5 rounded-[10px] border border-primary/25 bg-primary/10 px-3 py-2">
            <Avatar src={photoUrl} name={patientName ?? undefined} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground" dir="auto">
                {patientName ?? t('booked')}
              </span>
              {serviceCode && (
                <span className="block truncate text-xs text-muted-foreground">
                  {getServiceTypeLabel(serviceCode, t)}
                </span>
              )}
            </span>
            {hasAllergy && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {t('allergies')}
              </span>
            )}
            <span className="flex shrink-0 items-center gap-2">
              {waitMinutes !== null && (
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                  {t('waitMinutesShort', { minutes: waitMinutes })}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  STATUS_BADGE_COLORS[status] ?? 'bg-muted text-foreground'
                }`}
              >
                {getStatusLabel(status, t)}
              </span>
            </span>
          </span>
        )}
      </span>
    </button>
  )
}
