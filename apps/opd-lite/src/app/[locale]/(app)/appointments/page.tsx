'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CalendarPlus, ChevronLeft, ChevronRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { useAppointmentStore } from '@/stores/appointment-store'
import { useAppointments } from '@/hooks/useAppointments'
import { DayScheduleView } from '@/components/appointments/DayScheduleView'
import { WeekScheduleView } from '@/components/appointments/WeekScheduleView'
import { BookingModal } from '@/components/appointments/BookingModal'
import { Button } from '@/components/ui/Button'

export default function AppointmentsPage() {
  const t = useTranslations('appointments')
  const tNav = useTranslations('sidebar')
  const locale = useLocale()
  const { viewMode, setViewMode, selectedDate, setSelectedDate, prevDay, nextDay } =
    useAppointmentStore()
  const { appointments } = useAppointments(selectedDate)
  const [bookOpen, setBookOpen] = useState(false)

  // Subtitle counts. Cancelled/errored appointments are excluded (they leave the
  // schedule + queue). "Waiting" = everyone physically present and not yet seen:
  // every walk-in in the queue PLUS any scheduled patient who has checked in
  // (status → arrived), since a checked-in patient is also waiting to be seen.
  const isActive = (a: (typeof appointments)[number]) =>
    a.status !== 'cancelled' && a.status !== 'entered-in-error'
  const bookedCount = appointments.filter((a) => !a._ultranos.walkIn && isActive(a)).length
  const waitingCount = appointments.filter(
    (a) => isActive(a) && (a._ultranos.walkIn || a.status === 'arrived'),
  ).length

  // "Monday, 29 September" — weekday + day + month (no year) for the island subtitle
  const subtitleDate = selectedDate.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  // "Mon · 29 Sep 2026" — compact pill label for the date navigator
  const navWeekday = selectedDate.toLocaleDateString(locale, { weekday: 'short' })
  const navRest = selectedDate.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Floating command island: title + subtitle + view toggle + date-nav + Book action */}
      <section className="sticky top-[4.5rem] z-20 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_6px_24px_-12px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-center gap-3 px-4 pt-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground">{tNav('appointments')}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground font-numeric">
              {t('islandSummary', {
                date: subtitleDate,
                booked: bookedCount,
                waiting: waitingCount,
              })}
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setBookOpen(true)}
            className="ms-auto h-9 gap-2"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            {t('bookAppointment')}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-3">
          {/* Day / Week segmented toggle */}
          <div className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                viewMode === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('dayView')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('weekView')}
            </button>
          </div>

          {/* Date navigator pill: ‹ Mon · 29 Sep 2026 › */}
          <div className="flex h-9 items-center gap-1 rounded-full border border-border bg-card px-1.5">
            <button
              type="button"
              onClick={prevDay}
              aria-label={t('previousDay')}
              className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <DirectionalIcon category="navigation">
                <ChevronLeft className="h-4 w-4" />
              </DirectionalIcon>
            </button>
            <span className="px-2 text-sm font-semibold text-foreground font-numeric whitespace-nowrap">
              {navWeekday} · {navRest}
            </span>
            <button
              type="button"
              onClick={nextDay}
              aria-label={t('nextDay')}
              className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <DirectionalIcon category="navigation">
                <ChevronRight className="h-4 w-4" />
              </DirectionalIcon>
            </button>
          </div>

          <Button
            variant="outline"
            type="button"
            onClick={() => {
              const now = new Date()
              setSelectedDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
            }}
            className="h-9 rounded-full"
          >
            {t('today')}
          </Button>
        </div>
      </section>

      {viewMode === 'day' ? <DayScheduleView /> : <WeekScheduleView />}

      <BookingModal isOpen={bookOpen} onClose={() => setBookOpen(false)} />
    </div>
  )
}
