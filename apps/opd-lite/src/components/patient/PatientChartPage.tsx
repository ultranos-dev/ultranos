'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/db'
import type { FhirPatient } from '@ultranos/shared-types'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { usePatientSync } from '@/hooks/usePatientSync'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import {
  normalizeFhirPatient,
  fetchPatientFromHub,
  UUID_REGEX,
} from '@/lib/patient-loader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'

import { DetailLayout } from '@ultranos/ui-kit/components/ui/detail-layout'

// Composed sections
import { PatientBannerStack } from '@/components/patient/PatientBannerStack'
import { PatientEditModal } from '@/components/patient/PatientEditModal'
import { PatientContextRail } from '@/components/patient/PatientContextRail'
import { EncounterHistoryList } from '@/components/patient/EncounterHistoryList'
import { PatientResultTimeline } from '@/components/clinical/PatientResultTimeline'

interface PatientChartPageProps {
  patientId: string
}

export function PatientChartPage({ patientId }: PatientChartPageProps) {
  const tPatient = useTranslations('patient')
  const tNav = useTranslations('nav')
  const router = useRouter()
  const [patient, setPatient] = useState<FhirPatient | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsReauth, setNeedsReauth] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [userRole, setUserRole] = useState<string>('DOCTOR')

  useEffect(() => {
    async function loadRole() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        const role = (data.session?.user?.app_metadata?.role as string) ?? 'DOCTOR'
        setUserRole(role)
      } catch {
        // Default role is fine
      }
    }
    loadRole()
  }, [])

  usePatientSync(patientId)

  useEffect(() => {
    if (!UUID_REGEX.test(patientId)) {
      setLoading(false)
      return
    }
    let cancelled = false

    async function loadPatient() {
      // Step 1: Try local Dexie for instant display
      let hasLocalData = false
      try {
        const raw = await db.patients.get(patientId)
        if (!cancelled && raw) {
          const p = normalizeFhirPatient(raw as unknown as Record<string, unknown>)
          setPatient(p)
          setLoading(false)
          hasLocalData = true
          auditPhiAccess(
            AuditAction.READ,
            AuditResourceType.PATIENT,
            patientId,
            patientId,
            { phiAccess: 'patient_chart_view' },
          )
        }
      } catch (err) {
        if (!cancelled && err instanceof EncryptionKeyNotAvailableError) {
          setNeedsReauth(true)
          setLoading(false)
          return
        }
        // Other Dexie errors — fall through to Hub fetch
      }

      // Step 2: Always fetch the full record from Hub API.
      // Dexie may only have partial data from patient.list/search (missing
      // address_current, village, phone, blood_group, etc.). The Hub
      // patient.read endpoint returns the complete FHIR-aligned patient.
      if (!cancelled) {
        const hubPatient = await fetchPatientFromHub(patientId)
        if (!cancelled && hubPatient) {
          setPatient(hubPatient)
          if (!hasLocalData) {
            auditPhiAccess(
              AuditAction.READ,
              AuditResourceType.PATIENT,
              patientId,
              patientId,
              { phiAccess: 'patient_chart_view_hub_fallback' },
            )
          }
        }
      }

      if (!cancelled) setLoading(false)
    }

    loadPatient()
    return () => { cancelled = true }
  }, [patientId])

  const handlePatientUpdated = useCallback((updated: FhirPatient) => {
    setPatient(updated)
  }, [])

  // Loading state
  if (loading) {
    return (
      <div className="mx-auto max-w-2xl flex flex-col gap-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  // Error states
  if (!patient) {
    return (
      <div className="mx-auto max-w-2xl flex flex-col gap-4">
        {needsReauth ? (
          <>
            <p className="font-semibold text-muted-foreground">
              {tPatient('reauthRequired')}
            </p>
            <Button
              variant="primary"
              onClick={() => {
                const returnUrl = encodeURIComponent(window.location.pathname)
                window.location.href = `/login?returnUrl=${returnUrl}`
              }}
              className="mt-4"
            >
              {tPatient('signIn')}
            </Button>
          </>
        ) : (
          <>
            <p className="font-semibold text-muted-foreground">{tPatient('notFound')}</p>
            <Button variant="ghost" onClick={() => router.push('/')} className="mt-4">
              {tNav('returnToSearch')}
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <DetailLayout
      railLabel={tPatient('contextRailLabel')}
      banner={<PatientBannerStack patient={patient} patientId={patientId} />}
      rail={
        <PatientContextRail
          patient={patient}
          patientId={patientId}
          userRole={userRole}
          onEditClick={() => setEditModalOpen(true)}
          onPatientUpdated={handlePatientUpdated}
        />
      }
    >
      <section aria-label={tPatient('encounterHistory')}>
        <h2 className="mb-3 text-lg font-semibold text-foreground">{tPatient('encounterHistory')}</h2>
        <EncounterHistoryList patientId={patientId} />
      </section>

      <section aria-label={tPatient('labResultsSection')}>
        <PatientResultTimeline patientId={patientId} />
      </section>

      <PatientEditModal
        open={editModalOpen}
        patient={patient}
        patientId={patientId}
        onClose={() => setEditModalOpen(false)}
        onSaved={handlePatientUpdated}
      />
    </DetailLayout>
  )
}
