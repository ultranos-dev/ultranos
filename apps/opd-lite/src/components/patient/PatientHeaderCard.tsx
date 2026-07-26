'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { FhirPatient } from '@ultranos/shared-types'
import { formatRelativeTime } from '@ultranos/ui-kit'
import { buttonVariants } from '@ultranos/ui-kit/components/ui/button'
import { db } from '@/lib/db'
import { Card } from '@/components/Card'
import { PatientAvatar } from '@/components/patient/PatientAvatar'
import { Button } from '@/components/ui/Button'

interface PatientHeaderCardProps {
  patient: FhirPatient
  patientId: string
  onEditClick: () => void
  onPatientUpdated: (patient: FhirPatient) => void
}

/** LOINC codes for baseline vitals. */
const LOINC_HEIGHT = '8302-2'
const LOINC_WEIGHT = '29463-7'

/** Calculate age from birthDate (ISO) or birthYear. */
function computeAge(patient: FhirPatient): string {
  if (patient.birthDate) {
    const birth = new Date(patient.birthDate)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    return `${age}y`
  }
  if (patient._ultranos.birthYear) {
    const age = new Date().getFullYear() - patient._ultranos.birthYear
    return `${age}y`
  }
  return '--'
}

/** Get primary phone number. */
function getPhone(patient: FhirPatient): string {
  const phone = patient.telecom?.find((t) => t.system === 'phone')
  return phone?.value ?? '--'
}

interface BaselineVitals {
  height: string
  weight: string
  bmi: string
}

/**
 * Patient header card with avatar, patronymic chain, baseline vitals,
 * and action buttons (Edit Profile, Start New Encounter).
 */
export function PatientHeaderCard({
  patient,
  patientId,
  onEditClick,
  onPatientUpdated,
}: PatientHeaderCardProps) {
  const locale = useLocale()
  const t = useTranslations('patient')

  const [vitals, setVitals] = useState<BaselineVitals>({
    height: '--',
    weight: '--',
    bmi: '--',
  })
  // Load latest height & weight from Dexie observations
  useEffect(() => {
    let cancelled = false

    async function loadVitals() {
      try {
        const patientRef = `Patient/${patientId}`
        const allObs = await db.observations
          .where('subject.reference')
          .equals(patientRef)
          .toArray()

        // Find latest height observation (LOINC 8302-2)
        const heightObs = allObs
          .filter((o) => o.code.coding?.some((c) => c.code === LOINC_HEIGHT))
          .sort((a, b) => b.meta.lastUpdated.localeCompare(a.meta.lastUpdated))

        // Find latest weight observation (LOINC 29463-7)
        const weightObs = allObs
          .filter((o) => o.code.coding?.some((c) => c.code === LOINC_WEIGHT))
          .sort((a, b) => b.meta.lastUpdated.localeCompare(a.meta.lastUpdated))

        if (cancelled) return

        const h = heightObs[0]?.valueQuantity
        const w = weightObs[0]?.valueQuantity

        const heightStr = h ? `${h.value} ${h.unit}` : '--'
        const weightStr = w ? `${w.value} ${w.unit}` : '--'

        let bmiStr = '--'
        if (h?.value && w?.value) {
          // Assume height in cm, weight in kg
          const heightM = h.value / 100
          if (heightM > 0) {
            const bmi = w.value / (heightM * heightM)
            bmiStr = bmi.toFixed(1)
          }
        }

        setVitals({ height: heightStr, weight: weightStr, bmi: bmiStr })
      } catch {
        // Fail silently — show dashes
      }
    }

    loadVitals()
    return () => { cancelled = true }
  }, [patientId])

  // Handle photo update: the Hub route already persisted + audited; mirror locally.
  const handlePhotoUpdated = useCallback(
    async (photoKey: string | null, lastUpdated?: string) => {
      const updatedPatient: FhirPatient = {
        ...patient,
        _ultranos: { ...patient._ultranos, photoUrl: photoKey ?? undefined },
        meta: { ...patient.meta, lastUpdated: lastUpdated ?? new Date().toISOString() },
      }
      try {
        await db.patients.put(updatedPatient)
      } catch {
        // Local mirror failed — non-fatal; server is source of truth and will re-sync.
      }
      onPatientUpdated(updatedPatient)
    },
    [patient, onPatientUpdated],
  )

  const age = computeAge(patient)
  const phone = getPhone(patient)
  const bloodGroup = patient._ultranos.bloodGroup ?? '--'

  // Patronymic name chain in entry order: patient's name (given + family),
  // father, grandfather — rendered ring-separated to match the encounter header.
  const nameSegments = [
    [patient._ultranos.nameGiven, patient._ultranos.nameFamily].filter(Boolean).join(' '),
    patient._ultranos.nameFather,
    patient._ultranos.nameGrandfather,
  ].filter((s): s is string => !!s && s.trim().length > 0)

  return (
    <Card>
      <div className="flex items-start gap-5">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-1">
          <PatientAvatar
            patient={patient}
            patientId={patientId}
            size={80}
            onPhotoUpdated={handlePhotoUpdated}
          />
        </div>

        {/* Patient info */}
        <div className="min-w-0 flex-1">
          {/* Patronymic name chain — patient, father, grandfather, middot-separated */}
          <h2 className="text-xl font-semibold text-foreground leading-snug" dir="auto">
            {nameSegments.length > 0
              ? nameSegments.map((name, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <span
                        className="mx-1.5 text-muted-foreground"
                        aria-hidden="true"
                      >&middot;</span>
                    )}
                    {name}
                  </span>
                ))
              : patient._ultranos.nameLocal || '--'}
          </h2>

          {/* Latin transliteration */}
          {patient._ultranos.nameLatin && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {patient._ultranos.nameLatin}
            </p>
          )}

          {/* Demographics row */}
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {patient.gender ?? '--'}
            <span className="mx-1">&middot;</span>
            {age}
            <span className="mx-1">&middot;</span>
            {phone}
          </p>

          {/* Baseline vitals grid */}
          <dl className="mt-3 grid grid-cols-4 gap-x-3 gap-y-1">
            {[
              { label: 'Height', value: vitals.height },
              { label: 'Weight', value: vitals.weight },
              { label: 'BMI', value: vitals.bmi },
              { label: 'Blood', value: bloodGroup },
            ].map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate text-sm font-semibold text-foreground tabular-nums">
                  {value && value !== '--' ? value : <span className="font-normal text-muted-foreground">Not recorded</span>}
                </dd>
              </div>
            ))}
          </dl>

          {/* Last updated by */}
          {patient._ultranos.updatedByName ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('lastUpdatedBy', {
                name: patient._ultranos.updatedByName,
                role: patient._ultranos.updatedByRole ?? '',
                time: formatRelativeTime(patient.meta.lastUpdated, locale as 'en' | 'ar' | 'prs'),
              })}
            </p>
          ) : patient.meta.lastUpdated ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('lastUpdated', {
                time: formatRelativeTime(patient.meta.lastUpdated, locale as 'en' | 'ar' | 'prs'),
              })}
            </p>
          ) : null}
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          type="button"
          onClick={onEditClick}
          aria-label="Edit patient profile"
        >
          Edit Profile
        </Button>

        <Link
          href={`/encounter/${patientId}`}
          className={buttonVariants({ variant: 'default' })}
          aria-label="Start New Encounter"
        >
          Start New Encounter
        </Link>
      </div>
    </Card>
  )
}
