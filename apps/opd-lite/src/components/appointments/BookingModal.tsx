'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAppointmentStore } from '@/stores/appointment-store'
import { useAppointments } from '@/hooks/useAppointments'
import type { AppointmentServiceType } from '@ultranos/shared-types'

/** Clinic hours: 08:00-17:00, 30-minute slots */
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

const ALL_TIME_SLOTS = generateTimeSlots()

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10)
}

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
  prefilledDate?: Date
  prefilledTime?: string
}

const SERVICE_TYPES: {
  value: AppointmentServiceType
  key: string
}[] = [
  { value: 'new-consult', key: 'newConsult' },
  { value: 'follow-up', key: 'followUp' },
  { value: 'urgent', key: 'urgent' },
]

export function BookingModal({
  isOpen,
  onClose,
  prefilledDate,
  prefilledTime,
}: BookingModalProps) {
  const t = useTranslations('appointments')
  const { selectedDate } = useAppointmentStore()

  const initialDate = prefilledDate ?? selectedDate
  const [bookingDate, setBookingDate] = useState(initialDate)
  const [patientName, setPatientName] = useState('')
  const [selectedTime, setSelectedTime] = useState(
    prefilledTime ?? '',
  )
  const [serviceType, setServiceType] =
    useState<AppointmentServiceType>('new-consult')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Simplified allergy indicator for offline-first
  const [hasAllergies] = useState(false)

  const { appointments, slots, createAppointment } =
    useAppointments(bookingDate)

  // Determine which time slots are free
  const busyTimes = useMemo(() => {
    const busy = new Set<string>()
    for (const apt of appointments) {
      if (apt._ultranos.walkIn) continue
      if (
        apt.status === 'cancelled' ||
        apt.status === 'noshow' ||
        apt.status === 'entered-in-error'
      )
        continue
      const start = new Date(apt.start)
      const key = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
      busy.add(key)
    }
    for (const slot of slots) {
      if (slot.status !== 'free') {
        const start = new Date(slot.start)
        const key = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
        busy.add(key)
      }
    }
    return busy
  }, [appointments, slots])

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val) {
      const [y, m, d] = val.split('-').map(Number)
      setBookingDate(new Date(y, m - 1, d))
      setSelectedTime('') // Reset time when date changes
    }
  }

  const handleSubmit = async () => {
    if (!patientName.trim() || !selectedTime) return

    setSubmitting(true)
    setError('')

    try {
      // Build start/end ISO strings for the selected date + time
      const [hours, minutes] = selectedTime.split(':').map(Number)
      const start = new Date(bookingDate)
      start.setHours(hours, minutes, 0, 0)
      const end = new Date(
        start.getTime() + SLOT_DURATION_MINUTES * 60_000,
      )

      // Find matching slot ID if it exists
      const matchingSlot = slots.find((s) => {
        const slotStart = new Date(s.start)
        return (
          slotStart.getHours() === hours &&
          slotStart.getMinutes() === minutes &&
          s.status === 'free'
        )
      })

      await createAppointment({
        patientRef: crypto.randomUUID(), // Offline-first: real patient lookup TBD
        patientName: patientName.trim(),
        slotId: matchingSlot?.id ?? crypto.randomUUID(),
        serviceType,
        start: start.toISOString(),
        end: end.toISOString(),
        description: notes.trim() || undefined,
      })

      // Success — reset & close
      setPatientName('')
      setSelectedTime('')
      setNotes('')
      setServiceType('new-consult')
      onClose()
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === 'SLOT_BUSY'
      ) {
        setError(t('slotTaken'))
      } else {
        setError(t('schedulingConflict'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">
            {t('bookAppointment')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Safety Rule 4: Allergy banner at highest prominence */}
        {hasAllergies && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">
            ⚠ Allergies present — review before booking
          </div>
        )}

        <div className="space-y-4">
          {/* Patient search */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {t('patient')}
            </label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder={t('selectPatient')}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Date picker */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {t('selectDate')}
            </label>
            <input
              type="date"
              value={formatDateInput(bookingDate)}
              onChange={handleDateChange}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Available time slots */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {t('selectTime')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TIME_SLOTS.map((time) => {
                const isBusy = busyTimes.has(time)
                const isSelected = selectedTime === time
                return (
                  <button
                    key={time}
                    type="button"
                    disabled={isBusy}
                    onClick={() => setSelectedTime(time)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      isBusy
                        ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                        : isSelected
                          ? 'bg-primary-600 text-white'
                          : 'bg-green-50 text-green-800 hover:bg-green-100 border border-green-200'
                    }`}
                  >
                    {time}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Appointment type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {t('appointmentType')}
            </label>
            <div className="flex gap-4">
              {SERVICE_TYPES.map(({ value, key }) => (
                <label
                  key={value}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <input
                    type="radio"
                    name="serviceType"
                    value={value}
                    checked={serviceType === value}
                    onChange={() => setServiceType(value)}
                    className="text-primary-600"
                  />
                  {t(key)}
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {t('notes')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                !patientName.trim() || !selectedTime || submitting
              }
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('confirmBooking')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              {t('cancelAppointment')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
