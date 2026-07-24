'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { FhirPatient } from '@ultranos/shared-types'
import { formatRelativeTime } from '@ultranos/ui-kit'
import { db } from '@/lib/db'
import { PatientAvatar } from '@/components/patient/PatientAvatar'
import { Button } from '@/components/ui/Button'
import { getHubTrpcUrl } from '@/lib/hub-url'
import { getAuthHeaders } from '@/lib/hub-auth'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

interface PatientHeaderCardProps {
  patient: FhirPatient
  patientId: string
  onEditClick: () => void
  onPatientUpdated: (patient: FhirPatient) => void
}

/** LOINC codes for baseline vitals. */
const LOINC_HEIGHT = '8302-2'
const LOINC_WEIGHT = '29463-7'

const HUB_API_URL = getHubTrpcUrl()

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
  // True when a photo upload reached Storage but the Hub write was refused, so
  // the change isn't yet on the patient record. Non-blocking — surfaced as a notice.
  const [photoError, setPhotoError] = useState(false)

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

  // Handle photo update: persist to Hub and Dexie
  const handlePhotoUpdated = useCallback(
    async (photoUrl: string) => {
      try {
        // Update Hub API. patient.update is a protectedProcedure — without the
        // bearer token it 401s and the photo never persists to the Hub, so the
        // auth headers are mandatory (see @/lib/hub-auth).
        const headers = await getAuthHeaders()
        const res = await fetch(`${HUB_API_URL}/patient.update`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            json: {
              patientId,
              lastKnownUpdate: patient.meta.lastUpdated,
              photoUrl,
            },
          }),
        })

        // Surface a Hub rejection instead of swallowing it. Offline is expected
        // (the photo is in Storage + local Dexie and syncs later); an online
        // non-OK response means the Hub refused the write and the caller must know.
        if (!res.ok && navigator.onLine) {
          throw new Error(`patient.update failed: HTTP ${res.status}`)
        }

        // Audit the PHI write (CLAUDE.md rule 6 — every PHI access is audited).
        auditPhiAccess(
          AuditAction.UPDATE,
          AuditResourceType.PATIENT,
          patientId,
          patientId,
          { phiAccess: 'profile_photo' },
        )

        // Update Dexie locally
        const updatedPatient: FhirPatient = {
          ...patient,
          _ultranos: {
            ...patient._ultranos,
            photoUrl,
          },
          meta: {
            ...patient.meta,
            lastUpdated: new Date().toISOString(),
          },
        }

        await db.patients.put(updatedPatient)
        onPatientUpdated(updatedPatient)
        setPhotoError(false)
      } catch {
        // Hub refused the write (or we're offline). The image is already in
        // Storage; surface a non-blocking notice so the user knows it isn't yet
        // saved to the record rather than assuming success.
        setPhotoError(true)
      }
    },
    [patient, patientId, onPatientUpdated],
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
    <div className="rounded-xl bg-card p-5 shadow-sm ring-[0.65px] ring-border/50">
      <div className="flex items-start gap-5">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-1">
          <PatientAvatar
            patient={patient}
            patientId={patientId}
            size={80}
            onPhotoUpdated={handlePhotoUpdated}
          />
          {photoError && (
            <p role="status" className="max-w-[80px] text-center text-xs text-destructive">
              {t('photoNotSaved')}
            </p>
          )}
        </div>

        {/* Patient info */}
        <div className="min-w-0 flex-1">
          {/* Patronymic name chain — patient, father, grandfather, ring-separated */}
          <h2 className="text-xl font-bold text-foreground leading-snug" dir="auto">
            {nameSegments.length > 0
              ? nameSegments.map((name, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <span
                        className="mx-2.5 inline-block h-3 w-3 rounded-full border-2 border-muted-foreground/40 align-middle select-none"
                        aria-hidden="true"
                      />
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

          {/* Baseline vitals row */}
          <p className="mt-1 text-sm text-muted-foreground">
            Height: {vitals.height}
            <span className="mx-1">&middot;</span>
            Weight: {vitals.weight}
            <span className="mx-1">&middot;</span>
            BMI: {vitals.bmi}
            <span className="mx-1">&middot;</span>
            Blood: {bloodGroup}
          </p>

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
          className="inline-flex items-center justify-center rounded-pill bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Start New Encounter"
        >
          Start New Encounter
        </Link>
      </div>
    </div>
  )
}
