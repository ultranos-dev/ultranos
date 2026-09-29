'use client'

import { useState, useMemo, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarDays } from '@ultranos/ui-kit/icons'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { useAppointmentStore } from '@/stores/appointment-store'
import { useAppointments } from '@/hooks/useAppointments'
import { db } from '@/lib/db'
import { AppointmentSlot } from './AppointmentSlot'
import { WalkInQueue } from './WalkInQueue'
import { BookingModal } from './BookingModal'
import { getPatientPhotoUrl } from '@/lib/patient-photo-api'
import type { FhirAppointmentZod } from '@ultranos/shared-types'

/** "Patient/<id>" → "<id>" (bare patient id from an appointment participant ref). */
function patientIdFromAppointment(apt: FhirAppointmentZod): string | null {
  const ref = apt.participant?.[0]?.actor?.reference
  return ref ? ref.replace(/^Patient\//, '') : null
}

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

export function DayScheduleView() {
  const t = useTranslations('appointments')
  const { selectedDate } = useAppointmentStore()
  const { appointments, loading } = useAppointments(selectedDate)

  const [editingAppointment, setEditingAppointment] =
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
      if (apt.status === 'cancelled' || apt.status === 'entered-in-error') continue // Removed from the schedule
      const startDate = new Date(apt.start)
      const timeKey = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
      map.set(timeKey, apt)
    }
    return map
  }, [appointments])

  // Rendered rows = the fixed clinic grid PLUS a row for any appointment that
  // falls outside it (e.g. an 18:00 booking after the 17:00 cutoff, or an
  // off-grid custom time). Auto-expands the schedule so no booking is hidden.
  const timeSlots = useMemo(() => {
    const set = new Set<string>(TIME_SLOTS)
    for (const timeKey of appointmentsByTime.keys()) set.add(timeKey)
    return Array.from(set).sort() // HH:MM zero-padded → lexical sort is chronological
  }, [appointmentsByTime])

  // Rule #4: flag booked patients who have recorded allergies. One batched read
  // over the day's booked patients (not per-row) — best-effort, never blocks render.
  const [allergyPatientIds, setAllergyPatientIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    let cancelled = false
    const refs = new Set<string>()
    for (const apt of appointments) {
      if (apt._ultranos.walkIn) continue
      const pid = patientIdFromAppointment(apt)
      if (pid) refs.add(`Patient/${pid}`)
    }
    if (refs.size === 0) {
      setAllergyPatientIds(new Set())
      return
    }
    async function loadAllergies() {
      try {
        const rows = await db.allergyIntolerances
          .filter((a) => {
            const ref = (a as { patient?: { reference?: string } }).patient?.reference
            return ref ? refs.has(ref) : false
          })
          .toArray()
        if (cancelled) return
        const withAllergy = new Set<string>()
        for (const a of rows) {
          const ref = (a as { patient?: { reference?: string } }).patient?.reference
          if (ref) withAllergy.add(ref.replace(/^Patient\//, ''))
        }
        setAllergyPatientIds(withAllergy)
      } catch {
        // Decryption/DB unavailable — omit allergy flags rather than guess
      }
    }
    void loadAllergies()
    return () => { cancelled = true }
  }, [appointments])

  // Signed patient photos for booked rows (opaque key). Batched per day; best-effort.
  const [photoUrlMap, setPhotoUrlMap] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const ids = Array.from(new Set(
      appointments
        .filter((a) => !a._ultranos.walkIn)
        .map((a) => patientIdFromAppointment(a))
        .filter((id): id is string => !!id),
    ))
    if (ids.length === 0) { setPhotoUrlMap(new Map()); return }
    let cancelled = false
    const controller = new AbortController()
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => [id, await getPatientPhotoUrl(id, controller.signal)] as const),
      )
      if (cancelled) return
      const map = new Map<string, string>()
      for (const [id, url] of entries) if (url) map.set(id, url)
      setPhotoUrlMap(map)
    })().catch(() => { /* best-effort — initials fallback */ })
    return () => { cancelled = true; controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments.map((a) => a.id).join(',')])

  const handleSlotClick = (time: string) => {
    const apt = appointmentsByTime.get(time)
    if (apt) {
      // Booked → open the booking modal in EDIT mode for this appointment.
      setEditingAppointment(apt)
      setBookingPrefilledTime(undefined)
      setBookingModalOpen(true)
    } else {
      setEditingAppointment(null)
      setBookingPrefilledTime(time)
      setBookingModalOpen(true)
    }
  }

  const bookedCount = appointmentsByTime.size
  const freeCount = timeSlots.length - bookedCount

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-card py-12 shadow-card ring-[0.65px] ring-border/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Two-column: day schedule + walk-in queue rail */}
      <div className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          {/* Board header — Day schedule · N booked · M slots free */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">{t('dayScheduleTitle')}</h2>
            <span className="ms-auto text-xs font-medium text-muted-foreground font-numeric">
              {t('scheduleSummary', { booked: bookedCount, free: freeCount })}
            </span>
          </div>
          {appointmentsByTime.size === 0 && (
            <div className="border-b border-border py-8">
              <EmptyState icon={CalendarDays} title={t('noAppointments')} />
            </div>
          )}
          {/* Timetable — hairline-separated rows, time in the leading lane */}
          <div className="px-3 py-1.5">
            {timeSlots.map((time) => {
              const apt = appointmentsByTime.get(time)
              const pid = apt ? patientIdFromAppointment(apt) : null
              return (
                <AppointmentSlot
                  key={time}
                  time={time}
                  appointment={apt}
                  hasAllergy={pid ? allergyPatientIds.has(pid) : false}
                  photoUrl={pid ? photoUrlMap.get(pid) ?? null : null}
                  onClick={() => handleSlotClick(time)}
                />
              )
            })}
          </div>
        </div>

        {/* Walk-in queue rail */}
        <aside className="mt-4 lg:mt-0">
          <WalkInQueue />
        </aside>
      </div>

      {/* Booking modal — create (free slot) or edit (clicked booked appointment) */}
      <BookingModal
        isOpen={bookingModalOpen}
        appointment={editingAppointment}
        onClose={() => {
          setBookingModalOpen(false)
          setBookingPrefilledTime(undefined)
          setEditingAppointment(null)
        }}
        prefilledDate={selectedDate}
        prefilledTime={bookingPrefilledTime}
      />
    </div>
  )
}
