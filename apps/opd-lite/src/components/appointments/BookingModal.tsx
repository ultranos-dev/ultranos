'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { X } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { useAppointmentStore } from '@/stores/appointment-store'
import { useAppointments } from '@/hooks/useAppointments'
import { db } from '@/lib/db'
import { searchPatientsOnHub } from '@/lib/trpc'
import { hashNationalId } from '@/lib/hash-national-id'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import type { AppointmentServiceType, FhirPatient } from '@ultranos/shared-types'

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
  const [selectedTime, setSelectedTime] = useState(
    prefilledTime ?? '',
  )
  const [serviceType, setServiceType] =
    useState<AppointmentServiceType>('new-consult')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Patient search state (local to modal — avoids clashing with dashboard's global store)
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<FhirPatient[]>([])
  const [isSearchingPatient, setIsSearchingPatient] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<FhirPatient | null>(null)
  const [hasAllergies, setHasAllergies] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Debounced local + Hub patient search
  const handlePatientQueryChange = useCallback((value: string) => {
    setPatientQuery(value)
    // If user clears or edits after selecting, deselect
    setSelectedPatient(null)
    setHasAllergies(false)

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!value.trim()) {
      setPatientResults([])
      setIsSearchingPatient(false)
      return
    }

    setIsSearchingPatient(true)
    searchTimerRef.current = setTimeout(async () => {
      const trimmed = value.trim()
      // Phase 1: Local Dexie search (wrapped in try/catch — decryption
      // can fail if records were encrypted with a previous session key)
      const localResults: FhirPatient[] = []
      if (encryptionKeyStore.isReady()) {
        try {
          const seen = new Set<string>()
          const byName = await db.patients
            .where('_ultranos.nameLocal')
            .startsWithIgnoreCase(trimmed)
            .limit(20)
            .toArray()
          const byLatin = await db.patients
            .where('_ultranos.nameLatin')
            .startsWithIgnoreCase(trimmed)
            .limit(20)
            .toArray()
          const idHash = await hashNationalId(trimmed)
          const byId = await db.patients
            .where('_ultranos.nationalIdHash')
            .equals(idHash)
            .limit(20)
            .toArray()
          for (const p of [...byName, ...byLatin, ...byId]) {
            if (!seen.has(p.id)) {
              seen.add(p.id)
              localResults.push(p)
            }
          }
        } catch {
          // Decryption failed (key mismatch or corrupt data) — skip local results
        }
      }
      setPatientResults(localResults)
      setIsSearchingPatient(false)

      // Phase 2: Background Hub revalidation
      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()
      try {
        const hubResult = await searchPatientsOnHub(trimmed, abortRef.current.signal)
        if (hubResult.patients.length > 0) {
          await db.patients.bulkPut(hubResult.patients)
          // Re-search locally to merge
          const merged: FhirPatient[] = []
          const seen = new Set<string>()
          const all = await db.patients
            .where('_ultranos.nameLocal')
            .startsWithIgnoreCase(trimmed)
            .limit(20)
            .toArray()
          const allLatin = await db.patients
            .where('_ultranos.nameLatin')
            .startsWithIgnoreCase(trimmed)
            .limit(20)
            .toArray()
          for (const p of [...all, ...allLatin]) {
            if (!seen.has(p.id)) {
              seen.add(p.id)
              merged.push(p)
            }
          }
          setPatientResults(merged)
        }
      } catch {
        // Hub unavailable or decryption error — local results are sufficient
      }
    }, 250)
  }, [])

  // Handle patient selection — load allergies
  const handleSelectPatient = useCallback(async (patient: FhirPatient) => {
    setSelectedPatient(patient)
    setPatientQuery(patient._ultranos?.nameLocal || patient.name?.[0]?.text || '')
    setPatientResults([])

    // Check if this patient has allergies in local IndexedDB
    try {
      const allergies = await db.allergyIntolerances
        .filter((a) => {
          const ref = (a as { patient?: { reference?: string } }).patient?.reference
          return ref === `Patient/${patient.id}`
        })
        .first()
      setHasAllergies(!!allergies)
    } catch {
      // Decryption error — can't determine allergy status, default to safe display
      setHasAllergies(false)
    }
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

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
      const [y = 0, m = 1, d = 1] = val.split('-').map(Number)
      setBookingDate(new Date(y, m - 1, d))
      setSelectedTime('') // Reset time when date changes
    }
  }

  const handleSubmit = async () => {
    if (!selectedPatient || !selectedTime) return

    setSubmitting(true)
    setError('')

    try {
      // Build start/end ISO strings for the selected date + time
      const [hours = 0, minutes = 0] = selectedTime.split(':').map(Number)
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
        patientRef: selectedPatient.id,
        patientName: selectedPatient._ultranos?.nameLocal || selectedPatient.name?.[0]?.text || patientQuery.trim(),
        slotId: matchingSlot?.id ?? crypto.randomUUID(),
        serviceType,
        start: start.toISOString(),
        end: end.toISOString(),
        description: notes.trim() || undefined,
      })

      // Success — reset & close
      setPatientQuery('')
      setSelectedPatient(null)
      setPatientResults([])
      setHasAllergies(false)
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
      <div className="mx-4 w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">
            {t('bookAppointment')}
          </h2>
          <Button
            variant="icon"
            type="button"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Safety Rule 4: Allergy banner at highest prominence */}
        {hasAllergies && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">
            ⚠ Allergies present — review before booking
          </div>
        )}

        <div className="space-y-4">
          {/* Patient search with autocomplete */}
          <div className="relative">
            <label className="mb-1 block text-sm font-medium text-foreground">
              {t('patient')}
            </label>
            <input
              type="text"
              value={patientQuery}
              onChange={(e) => handlePatientQueryChange(e.target.value)}
              placeholder={t('selectPatient')}
              className={`w-full rounded-xl border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                selectedPatient
                  ? 'border-green-400 bg-green-50'
                  : 'border-neutral-300'
              }`}
            />
            {selectedPatient && (
              <span className="absolute end-3 top-[2.1rem] text-xs text-green-600">
                {selectedPatient.gender ?? ''} &middot; {selectedPatient.birthDate ? `${new Date().getFullYear() - new Date(selectedPatient.birthDate).getFullYear()}y` : ''}
              </span>
            )}
            {/* Dropdown results */}
            {patientResults.length > 0 && !selectedPatient && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-background shadow-lg">
                <ul className="divide-y divide-neutral-100" role="listbox" aria-label={t('selectPatient')}>
                  {patientResults.map((patient) => (
                    <li
                      key={patient.id}
                      role="option"
                      aria-selected={false}
                      onClick={() => handleSelectPatient(patient)}
                      className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-primary-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">
                          {patient._ultranos?.nameLocal || patient.name?.[0]?.text || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {patient.gender ?? ''} &middot; {patient.birthDate ? `${new Date().getFullYear() - new Date(patient.birthDate).getFullYear()}y` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {isSearchingPatient && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-neutral-200 bg-background px-3 py-3 text-center text-sm text-muted-foreground shadow-lg">
                Searching...
              </div>
            )}
            {patientQuery.trim() && patientResults.length === 0 && !isSearchingPatient && !selectedPatient && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-neutral-200 bg-background px-3 py-3 text-center text-sm text-muted-foreground shadow-lg">
                {t('noResults')}
              </div>
            )}
          </div>

          {/* Date picker */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              {t('selectDate')}
            </label>
            <input
              type="date"
              value={formatDateInput(bookingDate)}
              onChange={handleDateChange}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Available time slots */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              {t('selectTime')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TIME_SLOTS.map((time) => {
                const isBusy = busyTimes.has(time)
                const isSelected = selectedTime === time
                return (
                  <Button
                    key={time}
                    variant="ghost"
                    type="button"
                    disabled={isBusy}
                    onClick={() => setSelectedTime(time)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      isBusy
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : isSelected
                          ? 'bg-primary-600 text-white'
                          : 'bg-green-50 text-green-800 hover:bg-green-100 border border-green-200'
                    }`}
                  >
                    {time}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Appointment type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
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
            <label className="mb-1 block text-sm font-medium text-foreground">
              {t('notes')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
            <Button
              variant="primary"
              type="button"
              onClick={handleSubmit}
              disabled={
                !selectedPatient || !selectedTime || submitting
              }
              className="flex-1"
            >
              {t('confirmBooking')}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
            >
              {t('cancelAppointment')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
