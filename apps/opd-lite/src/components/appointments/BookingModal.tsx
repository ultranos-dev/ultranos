'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@ultranos/ui-kit/components/ui/dialog'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import { CalendarPlus, X, Clock, CalendarDays, AlertTriangle, Plus, Trash2, CircleCheck } from '@ultranos/ui-kit/icons'
import {
  PatientSearchBar,
  type PatientSearchResult,
} from '@ultranos/patient-kit/components/search/patient-search-bar'
import { searchPatientsAdapter } from '@/lib/patient-search-adapter'
import { getPatientPhotoUrl } from '@/lib/patient-photo-api'
import { useAppointmentStore } from '@/stores/appointment-store'
import { useAppointments } from '@/hooks/useAppointments'
import { db } from '@/lib/db'
import type { AppointmentServiceType, FhirPatient, FhirAppointmentZod } from '@ultranos/shared-types'

const SLOT_DURATION_MINUTES = 30

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
  prefilledDate?: Date
  prefilledTime?: string
  /** When set, the modal opens in EDIT mode for this existing appointment. */
  appointment?: FhirAppointmentZod | null
}

const SERVICE_TYPES: { value: AppointmentServiceType; key: string }[] = [
  { value: 'new-consult', key: 'newConsult' },
  { value: 'follow-up', key: 'followUp' },
  { value: 'urgent', key: 'urgent' },
]

// Walk-ins use a different service-type set (they are a queue, not a scheduled visit).
const WALKIN_TYPES: { value: AppointmentServiceType; key: string }[] = [
  { value: 'walk-in', key: 'walkIn' },
  { value: 'urgent', key: 'urgent' },
]

const DURATION_OPTIONS = [15, 30, 45, 60] as const
type Duration = (typeof DURATION_OPTIONS)[number] | 'custom'

function formatDateInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** "HH:MM" + minutes → "HH:MM" (clamped to the same day). */
function addMinutes(hhmm: string, minutes: number): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function toMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function getDisplayName(p: FhirPatient): string {
  return p._ultranos?.nameLocal || p.name?.[0]?.text || 'Unknown'
}

function formatAge(p: FhirPatient): string {
  if (!p.birthDate) return ''
  const birth = new Date(p.birthDate)
  const now = new Date()
  if (p.birthYearOnly) return `~${now.getFullYear() - birth.getFullYear()}y`
  let age = now.getFullYear() - birth.getFullYear()
  const md = now.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--
  return `${age}y`
}

function timeFromIso(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function durationFromRange(startIso: string, endIso: string): Duration {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
  return (DURATION_OPTIONS as readonly number[]).includes(mins) ? (mins as Duration) : 'custom'
}

export function BookingModal({ isOpen, onClose, prefilledDate, prefilledTime, appointment }: BookingModalProps) {
  const t = useTranslations('appointments')
  const tCommon = useTranslations('common')
  const { selectedDate } = useAppointmentStore()
  const editing = !!appointment
  // Editing a walk-in: no scheduled slot (hide date/time), walk-in/urgent types,
  // and the description field is the chief complaint.
  const isWalkIn = editing && !!(appointment?._ultranos as { walkIn?: boolean } | undefined)?.walkIn
  const typeOptions = isWalkIn ? WALKIN_TYPES : SERVICE_TYPES

  const initialDate = prefilledDate ?? selectedDate
  const initialStart = prefilledTime || '09:00'

  const [bookingDate, setBookingDate] = useState(initialDate)
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime] = useState(addMinutes(initialStart, SLOT_DURATION_MINUTES))
  const [duration, setDuration] = useState<Duration>(SLOT_DURATION_MINUTES)
  const [serviceType, setServiceType] = useState<AppointmentServiceType>('new-consult')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [selectedPatient, setSelectedPatient] = useState<FhirPatient | null>(null)
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null)
  const [hasAllergies, setHasAllergies] = useState(false)

  const { slots, createAppointment, updateAppointment, cancelAppointment, checkIn } = useAppointments(bookingDate)

  // Load allergies + photo for the chosen patient (Rule #4: allergies surface in red).
  const handleSelectPatient = useCallback(async (result: PatientSearchResult) => {
    const patient = result.raw as FhirPatient
    setSelectedPatient(patient)
    setSelectedPhotoUrl(result.photoUrl ?? null)
    try {
      const allergy = await db.allergyIntolerances
        .filter((a) => (a as { patient?: { reference?: string } }).patient?.reference === `Patient/${patient.id}`)
        .first()
      setHasAllergies(!!allergy)
    } catch {
      setHasAllergies(false)
    }
    // Best-effort signed photo URL (opaque key) if the search result didn't carry one.
    if (!result.photoUrl) {
      try {
        const url = await getPatientPhotoUrl(patient.id)
        setSelectedPhotoUrl(url)
      } catch { /* initials fallback */ }
    }
  }, [])

  const clearPatient = useCallback(() => {
    setSelectedPatient(null)
    setSelectedPhotoUrl(null)
    setHasAllergies(false)
  }, [])

  // Duration chip → auto-set end from start. Editing a time directly = "custom".
  const applyDuration = useCallback((d: Duration) => {
    setDuration(d)
    if (d !== 'custom') setEndTime(addMinutes(startTime, d))
  }, [startTime])

  const handleStartChange = useCallback((value: string) => {
    setStartTime(value)
    if (duration !== 'custom') setEndTime(addMinutes(value, duration))
  }, [duration])

  const handleEndChange = useCallback((value: string) => {
    setEndTime(value)
    setDuration('custom')
  }, [])

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!val) return
    const [y = 0, m = 1, d = 1] = val.split('-').map(Number)
    setBookingDate(new Date(y, m - 1, d))
  }

  const reset = useCallback(() => {
    clearPatient()
    setStartTime(initialStart)
    setEndTime(addMinutes(initialStart, SLOT_DURATION_MINUTES))
    setDuration(SLOT_DURATION_MINUTES)
    setServiceType('new-consult')
    setNotes('')
    setError('')
  }, [clearPatient, initialStart])

  // Prefill on open: EDIT loads from the appointment; CREATE uses the free slot.
  useEffect(() => {
    if (!isOpen) return
    setError('')
    if (appointment) {
      const startIso = appointment.start
      const endIso = appointment.end
      setBookingDate(new Date(startIso))
      setStartTime(timeFromIso(startIso))
      setEndTime(timeFromIso(endIso))
      setDuration(durationFromRange(startIso, endIso))
      setServiceType((appointment.serviceType?.[0]?.code as AppointmentServiceType) ?? 'new-consult')
      setNotes(appointment.description ?? '')
      const pid = appointment.participant?.[0]?.actor?.reference?.replace(/^Patient\//, '') ?? ''
      const display = appointment.participant?.[0]?.actor?.display ?? ''
      void (async () => {
        let patient: FhirPatient | null = null
        try { patient = ((await db.patients.get(pid)) as FhirPatient | undefined) ?? null } catch { patient = null }
        // Fall back to a minimal patient built from the appointment participant.
        setSelectedPatient(
          patient ??
            ({ id: pid, resourceType: 'Patient', name: [{ text: display }], _ultranos: { nameLocal: display } } as unknown as FhirPatient),
        )
        try {
          const allergy = await db.allergyIntolerances
            .filter((a) => (a as { patient?: { reference?: string } }).patient?.reference === `Patient/${pid}`)
            .first()
          setHasAllergies(!!allergy)
        } catch { setHasAllergies(false) }
        try { setSelectedPhotoUrl(await getPatientPhotoUrl(pid)) } catch { setSelectedPhotoUrl(null) }
      })()
    } else {
      clearPatient()
      setBookingDate(prefilledDate ?? selectedDate)
      setStartTime(prefilledTime || '09:00')
      setEndTime(addMinutes(prefilledTime || '09:00', SLOT_DURATION_MINUTES))
      setDuration(SLOT_DURATION_MINUTES)
      setServiceType('new-consult')
      setNotes('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, appointment])

  const canSubmit = !!selectedPatient && !!startTime && !!endTime && !submitting

  const handleSubmit = async () => {
    if (!selectedPatient) return
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      setError(t('endBeforeStart'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const [sh = 0, sm = 0] = startTime.split(':').map(Number)
      const [eh = 0, em = 0] = endTime.split(':').map(Number)
      const start = new Date(bookingDate)
      start.setHours(sh, sm, 0, 0)
      const end = new Date(bookingDate)
      end.setHours(eh, em, 0, 0)

      const matchingSlot = slots.find((s) => {
        const st = new Date(s.start)
        return st.getHours() === sh && st.getMinutes() === sm && s.status === 'free'
      })

      const data = {
        patientRef: selectedPatient.id,
        patientName: getDisplayName(selectedPatient),
        slotId: matchingSlot?.id ?? crypto.randomUUID(),
        serviceType,
        start: start.toISOString(),
        end: end.toISOString(),
        description: notes.trim() || undefined,
      }

      if (appointment) {
        await updateAppointment(appointment.id, data)
      } else {
        await createAppointment(data)
      }

      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message === 'SLOT_BUSY' ? t('slotTaken') : t('schedulingConflict'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelAppointment = async () => {
    if (!appointment) return
    if (!window.confirm(t('cancelAppointmentConfirm'))) return
    setSubmitting(true)
    setError('')
    try {
      await cancelAppointment(appointment.id)
      reset()
      onClose()
    } catch {
      setError(t('schedulingConflict'))
    } finally {
      setSubmitting(false)
    }
  }

  // Check-in — booked patient has arrived; starts the wait counter (status → arrived).
  const isArrived = appointment?.status === 'arrived'
  const canCheckIn = editing && appointment?.status === 'booked'

  const handleCheckIn = async () => {
    if (!appointment) return
    setSubmitting(true)
    setError('')
    try {
      await checkIn(appointment.id)
      reset()
      onClose()
    } catch {
      setError(t('schedulingConflict'))
    } finally {
      setSubmitting(false)
    }
  }

  const patientMeta = useMemo(() => {
    if (!selectedPatient) return ''
    return [selectedPatient.gender ?? undefined, formatAge(selectedPatient) || undefined,
      selectedPatient.telecom?.find((c) => c.system === 'phone')?.value ?? undefined]
      .filter(Boolean).join(' · ')
  }, [selectedPatient])

  const ctlClass = 'flex h-[42px] items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-foreground'
  const chip = (active: boolean) =>
    `flex h-8 items-center rounded-full border px-3.5 text-xs font-semibold transition-colors ${
      active ? 'border-transparent bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
    }`

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        hideClose
        className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0"
      >
        {/* Header — icon chip + title + subtitle + close (matches the modal redesign) */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarPlus className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base font-bold text-foreground">
              {isWalkIn ? t('editWalkIn') : editing ? t('editAppointment') : t('bookAppointment')}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{editing ? t('editSubtitle') : t('subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon('cancel')}
            className="ms-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body (scrolls) */}
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 py-5">
          {/* Patient — working search → selected chip */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-foreground">
              {t('patient')}<span className="ms-0.5 text-destructive">*</span>
            </label>
            {selectedPatient ? (
              <div className="flex items-center gap-3 rounded-2xl border border-primary/35 bg-primary/[0.07] p-3">
                <Avatar src={selectedPhotoUrl} name={getDisplayName(selectedPatient)} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground" dir="auto">
                    {getDisplayName(selectedPatient)}
                  </p>
                  {patientMeta && (
                    <p className="truncate text-xs text-muted-foreground">{patientMeta}</p>
                  )}
                </div>
                {hasAllergies && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {t('allergies')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={clearPatient}
                  className="ms-auto shrink-0 text-sm font-semibold text-primary hover:underline"
                >
                  {t('change')}
                </button>
              </div>
            ) : (
              <PatientSearchBar
                search={searchPatientsAdapter}
                onSelect={handleSelectPatient}
                resolvePhotoUrl={getPatientPhotoUrl}
                placeholder={t('searchPatientPlaceholder')}
                searchingLabel={t('searching')}
                noResultsLabel={t('noResults')}
                allergyLabel={t('allergies')}
                inputClassName="h-[42px] rounded-full"
                registerNewThreshold={0}
              />
            )}
          </div>

          {/* Date + Time — hidden for walk-ins (a queue, not a scheduled slot) */}
          {!isWalkIn && (
          <>
          <div>
            <label className="mb-2 block text-xs font-semibold text-foreground">
              {t('dateLabel')}<span className="ms-0.5 text-destructive">*</span>
            </label>
            <div className={ctlClass}>
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                type="date"
                value={formatDateInput(bookingDate)}
                onChange={handleDateChange}
                aria-label={t('dateLabel')}
                className="w-full bg-transparent text-sm text-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Time — custom start + end + duration chips */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-foreground">
              {t('time')}<span className="ms-0.5 text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1.5 ms-0.5 text-[11px] font-medium text-muted-foreground">{t('startLabel')}</p>
                <div className={ctlClass}>
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => handleStartChange(e.target.value)}
                    aria-label={t('startLabel')}
                    className="w-full bg-transparent text-sm text-foreground focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <p className="mb-1.5 ms-0.5 text-[11px] font-medium text-muted-foreground">{t('endLabel')}</p>
                <div className={ctlClass}>
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => handleEndChange(e.target.value)}
                    aria-label={t('endLabel')}
                    className="w-full bg-transparent text-sm text-foreground focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button key={d} type="button" onClick={() => applyDuration(d)} className={chip(duration === d)}>
                  {t('durationMin', { minutes: d })}
                </button>
              ))}
              <button type="button" onClick={() => applyDuration('custom')} className={chip(duration === 'custom')}>
                {t('durationCustom')}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{t('timeHint')}</p>
          </div>
          </>
          )}

          {/* Appointment type — segmented control */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-foreground">{t('appointmentType')}</label>
            <div className="inline-flex gap-1 rounded-full bg-muted p-1">
              {typeOptions.map(({ value, key }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setServiceType(value)}
                  aria-pressed={serviceType === value}
                  className={`h-8 rounded-full px-4 text-sm font-semibold transition-colors ${
                    serviceType === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {/* Notes / chief complaint (walk-in) */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-foreground">
              {isWalkIn ? t('chiefComplaint') : t('notes')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={isWalkIn ? t('chiefComplaintPlaceholder') : t('notesPlaceholder')}
              className="min-h-[60px] w-full resize-y rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
              {error}
            </div>
          )}
        </div>

        {/* Footer — locked to the bottom. Edit adds a destructive "cancel appointment". */}
        <div className="flex shrink-0 items-center gap-3 border-t border-border px-5 py-4">
          {editing ? (
            <>
              <Button
                variant="outline"
                type="button"
                onClick={handleCancelAppointment}
                disabled={submitting}
                className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t('cancelAppointment')}
              </Button>
              <div className="ms-auto flex items-center gap-3">
                {canCheckIn && (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={handleCheckIn}
                    disabled={submitting}
                    className="gap-2 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                  >
                    <CircleCheck className="h-4 w-4" aria-hidden="true" />
                    {t('checkIn')}
                  </Button>
                )}
                {isArrived && (
                  <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('checkedIn')}
                  </span>
                )}
                <Button
                  variant="primary"
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                >
                  {submitting ? t('searching') : t('saveChanges')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="outline" type="button" onClick={onClose}>
                {tCommon('cancel')}
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 gap-2"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {submitting ? t('searching') : t('bookAppointment')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
