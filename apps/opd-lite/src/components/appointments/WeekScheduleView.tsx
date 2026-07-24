'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, CalendarDays } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { useAppointmentStore } from '@/stores/appointment-store'
import { db } from '@/lib/db'
import { BookingModal } from './BookingModal'
import { Button } from '@/components/ui/Button'
import { SERVICE_TYPE_COLORS } from '@/lib/appointment-colors'
import type { FhirAppointmentZod } from '@ultranos/shared-types'

/** Configurable week start day. Saturday (6) is default for MENA. */
const WEEK_START_DAY = parseInt(
  process.env.NEXT_PUBLIC_WEEK_START ?? '6',
  10,
)

/** Clinic hours: 08:00-17:00, 30-minute slots (matching DayScheduleView) */
const CLINIC_START_HOUR = 8
const CLINIC_END_HOUR = 17
const SLOT_DURATION_MINUTES = 30

function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = CLINIC_START_HOUR; h < CLINIC_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_DURATION_MINUTES) {
      slots.push(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      )
    }
  }
  return slots
}

const TIME_SLOTS = generateTimeSlots()

/** Get the start of the week containing `date`, based on configured start day */
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const dayOfWeek = d.getDay()
  const diff = (dayOfWeek - WEEK_START_DAY + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

/** Generate 7 consecutive days starting from weekStart */
function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    days.push(d)
  }
  return days
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  })
}

function formatWeekRange(start: Date, end: Date): string {
  return `${start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} \u2013 ${end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

interface CellData {
  total: number
  byType: Record<string, number>
}

export function WeekScheduleView() {
  const t = useTranslations('appointments')
  const {
    selectedDate,
    setSelectedDate,
    setViewMode,
    nextWeek,
    prevWeek,
  } = useAppointmentStore()

  const [weekAppointments, setWeekAppointments] = useState<
    FhirAppointmentZod[]
  >([])
  const [loading, setLoading] = useState(true)
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [bookingDate, setBookingDate] = useState<Date | undefined>()
  const [bookingTime, setBookingTime] = useState<string | undefined>()

  const weekStart = useMemo(
    () => getWeekStart(selectedDate),
    [selectedDate],
  )
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const weekEnd = weekDays[6]!

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Load all appointments for the week
  const loadWeek = useCallback(async () => {
    setLoading(true)
    try {
      const start = new Date(weekStart)
      start.setHours(0, 0, 0, 0)
      const end = new Date(weekEnd)
      end.setHours(23, 59, 59, 999)

      const apts = (await db.appointments
        .where('start')
        .between(start.toISOString(), end.toISOString(), true, true)
        .toArray()) as FhirAppointmentZod[]

      setWeekAppointments(apts)
    } catch {
      // Keep existing state on Dexie failure
    } finally {
      setLoading(false)
    }
  }, [weekStart, weekEnd])

  useEffect(() => {
    void loadWeek()
  }, [loadWeek])

  // Build a lookup: dayIndex -> timeSlot -> CellData
  const cellDataMap = useMemo(() => {
    const map = new Map<string, CellData>()
    for (const apt of weekAppointments) {
      if (
        apt.status === 'cancelled' ||
        apt.status === 'noshow' ||
        apt.status === 'entered-in-error'
      )
        continue

      const startDate = new Date(apt.start)
      const dayIndex = weekDays.findIndex((d) =>
        isSameDay(d, startDate),
      )
      if (dayIndex === -1) continue

      const timeKey = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
      const cellKey = `${dayIndex}-${timeKey}`
      const serviceCode =
        apt.serviceType?.[0]?.code ?? 'new-consult'

      const existing = map.get(cellKey) ?? {
        total: 0,
        byType: {},
      }
      existing.total++
      existing.byType[serviceCode] =
        (existing.byType[serviceCode] ?? 0) + 1
      map.set(cellKey, existing)
    }
    return map
  }, [weekAppointments, weekDays])

  const handleDayClick = (day: Date) => {
    setSelectedDate(day)
    setViewMode('day')
  }

  const handleCellClick = (day: Date, time: string) => {
    setBookingDate(day)
    setBookingTime(time)
    setBookingModalOpen(true)
  }

  // Responsive: track viewport width
  const [isMobile, setIsMobile] = useState(false)
  const [mobileDayOffset, setMobileDayOffset] = useState(0)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    )
  }

  // Mobile: single-day list view with prev/next
  if (isMobile) {
    const currentDay = weekDays[mobileDayOffset] ?? weekDays[0]!
    return (
      <div className="space-y-4">
        {/* Week range header */}
        <div className="flex items-center justify-between">
          <Button
            variant="icon"
            onClick={prevWeek}
            aria-label={t('previousWeek')}
          >
            <DirectionalIcon category="navigation">
              <ChevronLeft className="h-5 w-5" />
            </DirectionalIcon>
          </Button>
          <h2 className="text-base font-bold text-foreground">
            {formatWeekRange(weekStart, weekEnd)}
          </h2>
          <Button
            variant="icon"
            onClick={nextWeek}
            aria-label={t('nextWeek')}
          >
            <DirectionalIcon category="navigation">
              <ChevronRight className="h-5 w-5" />
            </DirectionalIcon>
          </Button>
        </div>

        {/* Day selector with prev/next */}
        <div className="flex items-center justify-between">
          <Button
            variant="icon"
            onClick={() =>
              setMobileDayOffset(Math.max(0, mobileDayOffset - 1))
            }
            disabled={mobileDayOffset === 0}
            aria-label={t('previousDay')}
          >
            <DirectionalIcon category="navigation">
              <ChevronLeft className="h-4 w-4" />
            </DirectionalIcon>
          </Button>

          <Button
            variant={isSameDay(currentDay, today) ? 'primary' : 'secondary'}
            type="button"
            onClick={() => handleDayClick(currentDay)}
            className="px-4 py-2 text-sm"
          >
            {currentDay.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </Button>

          <Button
            variant="icon"
            onClick={() =>
              setMobileDayOffset(Math.min(6, mobileDayOffset + 1))
            }
            disabled={mobileDayOffset === 6}
            aria-label={t('nextDay')}
          >
            <DirectionalIcon category="navigation">
              <ChevronRight className="h-4 w-4" />
            </DirectionalIcon>
          </Button>
        </div>

        {/* Time slots for selected day */}
        <div className="space-y-1">
          {cellDataMap.size === 0 && (
            <EmptyState size="sm" icon={CalendarDays} title={t('noAppointments')} />
          )}
          {TIME_SLOTS.map((time) => {
            const cellKey = `${mobileDayOffset}-${time}`
            const data = cellDataMap.get(cellKey)
            return (
              <Button
                key={time}
                variant="ghost"
                type="button"
                onClick={() => handleCellClick(currentDay, time)}
                className={`w-full rounded-lg border p-2.5 text-start ${
                  data
                    ? 'border-primary/20 bg-primary/10 hover:bg-primary'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {time}
                  </span>
                  {data && (
                    <div className="flex items-center gap-1">
                      {Object.entries(data.byType).map(
                        ([type, count]) => (
                          <span
                            key={type}
                            className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${
                              SERVICE_TYPE_COLORS[type] ??
                              'bg-muted'
                            }`}
                          >
                            {count}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </Button>
            )
          })}
        </div>

        <BookingModal
          isOpen={bookingModalOpen}
          onClose={() => {
            setBookingModalOpen(false)
            setBookingDate(undefined)
            setBookingTime(undefined)
          }}
          prefilledDate={bookingDate}
          prefilledTime={bookingTime}
        />
      </div>
    )
  }

  // Desktop: full 7-day grid
  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="icon"
          onClick={prevWeek}
          aria-label={t('previousWeek')}
        >
          <DirectionalIcon category="navigation">
            <ChevronLeft className="h-5 w-5" />
          </DirectionalIcon>
        </Button>

        <h2 className="text-lg font-bold text-foreground">
          {formatWeekRange(weekStart, weekEnd)}
        </h2>

        <Button
          variant="icon"
          onClick={nextWeek}
          aria-label={t('nextWeek')}
        >
          <DirectionalIcon category="navigation">
            <ChevronRight className="h-5 w-5" />
          </DirectionalIcon>
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { key: 'new-consult', label: t('newConsult') },
          { key: 'follow-up', label: t('followUp') },
          { key: 'urgent', label: t('urgent') },
          { key: 'walk-in', label: t('walkIn') },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-3 rounded-full ${SERVICE_TYPE_COLORS[key]}`}
            />
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl ring-[0.65px] ring-border/50">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {/* Time column header */}
              <th className="sticky start-0 z-10 border-b border-e border-border bg-muted px-2 py-2 text-start text-xs font-semibold text-muted-foreground">
                {t('time')}
              </th>
              {/* Day headers — flex-direction: row auto-reverses in RTL */}
              {weekDays.map((day, idx) => {
                const isToday = isSameDay(day, today)
                return (
                  <th
                    key={idx}
                    className={`border-b border-border px-1 py-2 text-center text-xs font-semibold ${
                      isToday
                        ? 'bg-primary-50 text-primary-800'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => handleDayClick(day)}
                      className="hover:underline"
                    >
                      {formatShortDate(day)}
                    </Button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {weekAppointments.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8">
                  <EmptyState size="sm" icon={CalendarDays} title={t('noAppointments')} />
                </td>
              </tr>
            )}
            {TIME_SLOTS.map((time) => (
              <tr key={time} className="group">
                {/* Time label */}
                <td className="sticky start-0 z-10 border-b border-e border-border bg-background px-2 py-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {time}
                </td>
                {/* Cells for each day */}
                {weekDays.map((day, dayIdx) => {
                  const cellKey = `${dayIdx}-${time}`
                  const data = cellDataMap.get(cellKey)
                  const isToday = isSameDay(day, today)

                  return (
                    <td
                      key={dayIdx}
                      className={`border-b border-border px-0.5 py-0.5 ${
                        isToday ? 'bg-primary-50/30' : ''
                      }`}
                    >
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => handleCellClick(day, time)}
                        className={`flex h-7 w-full items-center justify-center gap-0.5 rounded ${
                          data
                            ? 'hover:bg-primary'
                            : 'hover:bg-muted'
                        }`}
                      >
                        {data &&
                          Object.entries(data.byType).map(
                            ([type, count]) => (
                              <span
                                key={type}
                                className={`inline-flex h-5 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
                                  SERVICE_TYPE_COLORS[type] ??
                                  'bg-muted'
                                }`}
                              >
                                {count}
                              </span>
                            ),
                          )}
                      </Button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Booking modal */}
      <BookingModal
        isOpen={bookingModalOpen}
        onClose={() => {
          setBookingModalOpen(false)
          setBookingDate(undefined)
          setBookingTime(undefined)
        }}
        prefilledDate={bookingDate}
        prefilledTime={bookingTime}
      />
    </div>
  )
}
