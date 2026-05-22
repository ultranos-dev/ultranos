'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAppointmentStore } from '@/stores/appointment-store'
import { useAppointments } from '@/hooks/useAppointments'
import { AppointmentSlot } from './AppointmentSlot'
import { PatientSummaryPopup } from './PatientSummaryPopup'
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
  const { appointments, loading, updateStatus, addWalkIn } =
    useAppointments(selectedDate)

  const [selectedAppointment, setSelectedAppointment] =
    useState<FhirAppointmentZod | null>(null)

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

  // Walk-in queue
  const walkIns = useMemo(
    () =>
      appointments
        .filter((a) => a._ultranos.walkIn)
        .sort(
          (a, b) =>
            (a._ultranos.queuePosition ?? 0) -
            (b._ultranos.queuePosition ?? 0),
        ),
    [appointments],
  )

  const handleSlotClick = (time: string) => {
    const apt = appointmentsByTime.get(time)
    if (apt) {
      setSelectedAppointment(apt)
    } else {
      // Placeholder — real booking modal in Task 5
      // eslint-disable-next-line no-console
      console.log('Open booking modal for slot:', time)
    }
  }

  const handleDateInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val) {
      // Parse as local date to avoid timezone shift
      const [y, m, d] = val.split('-').map(Number)
      setSelectedDate(new Date(y, m - 1, d))
    }
  }

  const handleAddWalkIn = () => {
    // Placeholder — real walk-in form in Task 5
    // eslint-disable-next-line no-console
    console.log('Open walk-in form')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Date navigation */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={prevDay}
          className="rounded-lg border border-neutral-300 p-2 text-neutral-600 hover:bg-neutral-50 transition-colors"
          aria-label={t('previousDay')}
        >
          <svg
            className="h-5 w-5 rtl:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-neutral-900">
            {formatDisplayDate(selectedDate)}
          </h2>
          <input
            type="date"
            value={formatDate(selectedDate)}
            onChange={handleDateInput}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
            aria-label={t('datePicker')}
          />
        </div>

        <button
          type="button"
          onClick={nextDay}
          className="rounded-lg border border-neutral-300 p-2 text-neutral-600 hover:bg-neutral-50 transition-colors"
          aria-label={t('nextDay')}
        >
          <svg
            className="h-5 w-5 rtl:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
        </button>
      </div>

      {/* Time grid */}
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

      {/* Walk-in queue section */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-neutral-900">
            {t('walkInQueue')}
          </h3>
          <button
            type="button"
            onClick={handleAddWalkIn}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            {t('addWalkIn')}
          </button>
        </div>

        {walkIns.length === 0 ? (
          <p className="text-sm text-neutral-500">{t('noWalkIns')}</p>
        ) : (
          <div className="space-y-2">
            {walkIns.map((walkIn) => (
              <button
                key={walkIn.id}
                type="button"
                onClick={() => setSelectedAppointment(walkIn)}
                className="w-full rounded-lg border border-purple-200 bg-purple-50 p-3 text-start hover:bg-purple-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-purple-800">
                    {t('queueNumber', {
                      number: walkIn._ultranos.queuePosition ?? 0,
                    })}
                  </span>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                    {t('walkIn')}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-900">
                  {walkIn.participant?.[0]?.actor?.display ?? '—'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Patient summary popup */}
      {selectedAppointment && (
        <PatientSummaryPopup
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onStatusChange={updateStatus}
        />
      )}
    </div>
  )
}
