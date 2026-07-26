'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, CalendarDays } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Button } from '@/components/ui/Button'
import { useAppointmentStore } from '@/stores/appointment-store'
import { useAppointments } from '@/hooks/useAppointments'
import { AppointmentSlot } from './AppointmentSlot'
import { PatientSummaryPopup } from './PatientSummaryPopup'
import { WalkInQueue } from './WalkInQueue'
import { BookingModal } from './BookingModal'
import type { FhirAppointmentZod } from '@ultranos/shared-types'

/** Clinic hours: 08:00–17:00, 30-minute slots */
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

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function DayScheduleView() {
  const t = useTranslations('appointments')
  const { selectedDate, setSelectedDate, prevDay, nextDay } =
    useAppointmentStore()
  const { appointments, loading, updateStatus } =
    useAppointments(selectedDate)

  const [selectedAppointment, setSelectedAppointment] =
    useState<FhirAppointmentZod | null>(null)
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [bookingPrefilledTime, setBookingPrefilledTime] = useState<
    string | undefined
  >(undefined)

  // Map appointments to time slots by HH:MM
  const appointmentsByTime = useMemo(() => {
    const map = new Map<string, FhirAppointmentZod>()
    for (const apt of appointments) {
      if (apt._ultranos.walkIn) continue // Walk-ins shown separately
      const startDate = new Date(apt.start)
      const timeKey = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
      map.set(timeKey, apt)
    }
    return map
  }, [appointments])

  const handleSlotClick = (time: string) => {
    const apt = appointmentsByTime.get(time)
    if (apt) {
      setSelectedAppointment(apt)
    } else {
      setBookingPrefilledTime(time)
      setBookingModalOpen(true)
    }
  }

  const handleDateInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val) {
      // Parse as local date to avoid timezone shift
      const [y = 0, m = 1, d = 1] = val.split('-').map(Number)
      setSelectedDate(new Date(y, m - 1, d))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Date navigation */}
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          type="button"
          onClick={prevDay}
          aria-label={t('previousDay')}
        >
          <DirectionalIcon category="navigation">
            <ChevronLeft className="h-5 w-5" />
          </DirectionalIcon>
        </Button>

        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-foreground">
            {formatDisplayDate(selectedDate)}
          </h2>
          <input
            type="date"
            value={formatDate(selectedDate)}
            onChange={handleDateInput}
            className="rounded-xl border border-border px-2 py-1 text-sm"
            aria-label={t('datePicker')}
          />
        </div>

        <Button
          variant="outline"
          type="button"
          onClick={nextDay}
          aria-label={t('nextDay')}
        >
          <DirectionalIcon category="navigation">
            <ChevronRight className="h-5 w-5" />
          </DirectionalIcon>
        </Button>
      </div>

      {/* Time grid */}
      {appointmentsByTime.size === 0 && (
        <EmptyState size="sm" icon={CalendarDays} title={t('noAppointments')} />
      )}
      <div className="space-y-2">
        {TIME_SLOTS.map((time) => {
          const apt = appointmentsByTime.get(time)
          return (
            <AppointmentSlot
              key={time}
              time={time}
              appointment={apt}
              onClick={() => handleSlotClick(time)}
            />
          )
        })}
      </div>

      {/* Walk-in queue */}
      <WalkInQueue />

      {/* Patient summary popup */}
      {selectedAppointment && (
        <PatientSummaryPopup
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onStatusChange={updateStatus}
        />
      )}

      {/* Booking modal */}
      <BookingModal
        isOpen={bookingModalOpen}
        onClose={() => {
          setBookingModalOpen(false)
          setBookingPrefilledTime(undefined)
        }}
        prefilledDate={selectedDate}
        prefilledTime={bookingPrefilledTime}
      />
    </div>
  )
}
