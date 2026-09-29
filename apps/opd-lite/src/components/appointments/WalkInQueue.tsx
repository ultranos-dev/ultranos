'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Users, AlertTriangle, Plus } from '@ultranos/ui-kit/icons'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import {
  PatientSearchBar,
  type PatientSearchResult,
} from '@ultranos/patient-kit/components/search/patient-search-bar'
import { Button } from '@/components/ui/Button'
import { useAppointments } from '@/hooks/useAppointments'
import { useAppointmentStore } from '@/stores/appointment-store'
import { searchPatientsAdapter } from '@/lib/patient-search-adapter'
import { getPatientPhotoUrl } from '@/lib/patient-photo-api'
import { db } from '@/lib/db'
import { PatientCreateModal } from '@/components/patient/PatientCreateModal'
import { BookingModal } from './BookingModal'
import type {
  FhirAppointmentZod,
  AppointmentServiceType,
  FhirPatient,
} from '@ultranos/shared-types'

function minutesElapsed(isoTimestamp: string): number {
  const created = new Date(isoTimestamp).getTime()
  const now = Date.now()
  return Math.max(0, Math.floor((now - created) / 60_000))
}

function getDisplayName(p: FhirPatient): string {
  return p._ultranos?.nameLocal || p.name?.[0]?.text || 'Unknown'
}

function ageLabel(p: FhirPatient): string {
  if (!p.birthDate) {
    const by = (p._ultranos as { birthYear?: number } | undefined)?.birthYear
    return by ? `${new Date().getFullYear() - by}y` : ''
  }
  const birth = new Date(p.birthDate)
  const now = new Date()
  if (p.birthYearOnly) return `~${now.getFullYear() - birth.getFullYear()}y`
  let age = now.getFullYear() - birth.getFullYear()
  const md = now.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--
  return `${age}y`
}

function patientIdOf(a: FhirAppointmentZod): string | null {
  const ref = a.participant?.[0]?.actor?.reference
  return ref ? ref.replace(/^Patient\//, '') : null
}

export function WalkInQueue() {
  const t = useTranslations('appointments')
  const tReg = useTranslations('registration')
  const { selectedDate } = useAppointmentStore()
  const { appointments, loadError, addWalkIn } = useAppointments(selectedDate)

  const [editingWalkIn, setEditingWalkIn] =
    useState<FhirAppointmentZod | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<FhirPatient | null>(null)
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null)
  const [complaint, setComplaint] = useState('')
  const [walkInType, setWalkInType] =
    useState<AppointmentServiceType>('walk-in')
  const [submitting, setSubmitting] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createPrefill, setCreatePrefill] = useState('')

  const walkIns = useMemo(
    () =>
      appointments
        .filter(
          (a) =>
            a._ultranos.walkIn &&
            a.status !== 'cancelled' &&
            a.status !== 'entered-in-error', // Cancelled walk-ins leave the queue
        )
        .sort(
          (a, b) =>
            (a._ultranos.queuePosition ?? 0) -
            (b._ultranos.queuePosition ?? 0),
        ),
    [appointments],
  )

  // Batch-resolve each walk-in patient's age + signed photo (opaque key) for the row.
  // Walk-ins reference real patients, so both come from the patient record; the photo
  // renders in the same default Avatar format as the day schedule (initials fallback).
  const [infoMap, setInfoMap] = useState<Map<string, { age?: string; photoUrl?: string | null }>>(new Map())
  useEffect(() => {
    const ids = Array.from(
      new Set(walkIns.map((w) => patientIdOf(w)).filter((id): id is string => !!id)),
    )
    // Avoid a spurious re-render (and a stale-state loop) when there's nothing to resolve.
    if (ids.length === 0) { setInfoMap((prev) => (prev.size === 0 ? prev : new Map())); return }
    let cancelled = false
    const controller = new AbortController()
    void (async () => {
      const map = new Map<string, { age?: string; photoUrl?: string | null }>()
      await Promise.all(ids.map(async (id) => {
        let age: string | undefined
        let photoUrl: string | null = null
        try {
          const p = (await db.patients.get(id)) as FhirPatient | undefined
          if (p) { const a = ageLabel(p); if (a) age = a }
        } catch { /* skip */ }
        try { photoUrl = await getPatientPhotoUrl(id, controller.signal) } catch { /* initials fallback */ }
        map.set(id, { age, photoUrl })
      }))
      if (!cancelled) setInfoMap(map)
    })()
    return () => { cancelled = true; controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkIns.map((w) => w.id).join(',')])

  const handleSelectPatient = useCallback(async (result: PatientSearchResult) => {
    const patient = result.raw as FhirPatient
    setSelectedPatient(patient)
    setSelectedPhotoUrl(result.photoUrl ?? null)
    if (!result.photoUrl) {
      try { setSelectedPhotoUrl(await getPatientPhotoUrl(patient.id)) } catch { /* initials */ }
    }
  }, [])

  const resetAddForm = () => {
    setSelectedPatient(null)
    setSelectedPhotoUrl(null)
    setComplaint('')
    setWalkInType('walk-in')
    setShowAddForm(false)
  }

  const handleAddWalkIn = async () => {
    if (!selectedPatient) return
    setSubmitting(true)
    try {
      await addWalkIn(selectedPatient.id, getDisplayName(selectedPatient), walkInType, complaint)
      resetAddForm()
    } finally {
      setSubmitting(false)
    }
  }

  function statusLabel(status: FhirAppointmentZod['status']): string {
    switch (status) {
      case 'arrived': return t('checkedIn')
      case 'fulfilled': return t('completed')
      case 'cancelled': return t('cancelled')
      case 'noshow': return t('noShow')
      default: return t('waiting')
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {/* Header — title + waiting count (matches the mockup board) */}
      <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
        {t('walkInQueue')}
        <span className="ms-auto text-xs font-medium text-muted-foreground">
          {t('waitingCount', { count: walkIns.length })}
        </span>
      </h3>

      {/* Queue rows / empty / error */}
      {loadError ? (
        <div className="flex min-h-[10rem] items-center justify-center" data-testid="walkin-queue-unavailable">
          <EmptyState icon={AlertTriangle} title={t('queueUnavailable')} />
        </div>
      ) : walkIns.length === 0 ? (
        <div className="flex min-h-[10rem] items-center justify-center">
          <EmptyState icon={Users} title={t('noWalkIns')} />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {walkIns.map((walkIn) => {
            const pid = patientIdOf(walkIn)
            const name = walkIn.participant?.[0]?.actor?.display ?? '—'
            const info = pid ? infoMap.get(pid) : undefined
            const subtitle = [walkIn.description, info?.age].filter(Boolean).join(' · ')
            const waitMinutes = minutesElapsed(walkIn._ultranos.createdAt)
            const isUrgent = walkIn.serviceType?.[0]?.code === 'urgent'
            return (
              <li key={walkIn.id}>
                <button
                  type="button"
                  onClick={() => setEditingWalkIn(walkIn)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start transition-colors hover:bg-muted/50"
                >
                  {/* Patient avatar — photo when available, else default initials
                      (same format as the day schedule). */}
                  <Avatar src={info?.photoUrl ?? null} name={name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground" dir="auto">
                        {name}
                      </span>
                      {isUrgent && (
                        <span className="shrink-0 rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                          {t('urgent')}
                        </span>
                      )}
                    </span>
                    {subtitle && (
                      <span className="block truncate text-[11.5px] text-muted-foreground" dir="auto">
                        {subtitle}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-end text-[11.5px] leading-tight text-muted-foreground">
                    <span className="block">{statusLabel(walkIn.status)}</span>
                    <span className="block">{t('waitMinutesShort', { minutes: waitMinutes })}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Add area — footer "+ Add walk-in" or the inline add form */}
      <div className="border-t border-border p-3.5">
        {showAddForm ? (
          <div className="space-y-3">
            {selectedPatient ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-primary/35 bg-primary/[0.07] p-2.5">
                <Avatar src={selectedPhotoUrl} name={getDisplayName(selectedPatient)} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" dir="auto">
                  {getDisplayName(selectedPatient)}
                </span>
                <button
                  type="button"
                  onClick={() => { setSelectedPatient(null); setSelectedPhotoUrl(null) }}
                  className="shrink-0 text-sm font-semibold text-primary hover:underline"
                >
                  {t('change')}
                </button>
              </div>
            ) : (
              <PatientSearchBar
                search={searchPatientsAdapter}
                onSelect={handleSelectPatient}
                onRegisterNew={(q) => { setCreatePrefill(q); setCreateModalOpen(true) }}
                resolvePhotoUrl={getPatientPhotoUrl}
                placeholder={t('searchPatientPlaceholder')}
                searchingLabel={t('searching')}
                noResultsLabel={t('noResults')}
                registerNewLabel={tReg('registerNew')}
                allergyLabel={t('allergies')}
                inputClassName="h-9 rounded-full"
              />
            )}

            {/* Chief complaint — surfaces as the row subtitle (e.g. "Fever") */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                {t('chiefComplaint')}
              </label>
              <input
                type="text"
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                placeholder={t('chiefComplaintPlaceholder')}
                dir="auto"
                className="h-9 w-full rounded-full border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="walkInType"
                  value="walk-in"
                  checked={walkInType === 'walk-in'}
                  onChange={() => setWalkInType('walk-in')}
                  className="text-primary"
                />
                {t('walkIn')}
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="walkInType"
                  value="urgent"
                  checked={walkInType === 'urgent'}
                  onChange={() => setWalkInType('urgent')}
                  className="text-destructive"
                />
                {t('urgent')}
              </label>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={resetAddForm} className="h-9">
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleAddWalkIn}
                disabled={!selectedPatient || submitting}
                className="h-9 flex-1 justify-center"
              >
                {t('addWalkIn')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            type="button"
            onClick={() => setShowAddForm(true)}
            className="w-full justify-center gap-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('addWalkIn')}
          </Button>
        )}
      </div>

      {/* Edit a walk-in — same modal as booked appointments, in walk-in edit mode */}
      <BookingModal
        isOpen={!!editingWalkIn}
        appointment={editingWalkIn}
        onClose={() => setEditingWalkIn(null)}
      />

      {/* Register-new-patient (from the walk-in search "not found" affordance) */}
      <PatientCreateModal
        open={createModalOpen}
        prefilledNameGiven={createPrefill}
        onClose={() => setCreateModalOpen(false)}
      />
    </div>
  )
}
