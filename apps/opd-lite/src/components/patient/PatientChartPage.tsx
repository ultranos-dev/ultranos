'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { buttonVariants } from '@ultranos/ui-kit/components/ui/button'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { FileText } from '@ultranos/ui-kit/icons'
import { useAllergyStore } from '@/stores/allergy-store'

// Composed sections
import { AllergyBanner } from '@/components/clinical/AllergyBanner'
import { PatientAvatar } from '@/components/patient/PatientAvatar'
import { PatientBannerStack } from '@/components/patient/PatientBannerStack'
import { PatientEditModal } from '@/components/patient/PatientEditModal'
import { ActiveMedicationsList } from '@/components/patient/ActiveMedicationsList'
import { EncounterHistoryList } from '@/components/patient/EncounterHistoryList'
import { PatientResultTimeline } from '@/components/clinical/PatientResultTimeline'
import { PatientTimeline } from '@/components/patient/PatientTimeline'

interface PatientChartPageProps {
  patientId: string
}

const LOINC_HEIGHT = '8302-2'
const LOINC_WEIGHT = '29463-7'

type ChartTab = 'timeline' | 'encounters' | 'results' | 'medications' | 'documents'

function computeAge(patient: FhirPatient): string {
  if (patient.birthDate) {
    const b = new Date(patient.birthDate)
    if (!Number.isNaN(b.getTime())) {
      const now = new Date()
      let age = now.getFullYear() - b.getFullYear()
      const m = now.getMonth() - b.getMonth()
      if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
      return `${age}y`
    }
  }
  if (patient._ultranos.birthYear) return `${new Date().getFullYear() - patient._ultranos.birthYear}y`
  return '--'
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
  const [activeTab, setActiveTab] = useState<ChartTab>('timeline')
  const [vitals, setVitals] = useState({ height: '--', weight: '--', bmi: '--' })
  const allergies = useAllergyStore((s) => s.allergies)

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

  // Baseline vitals (latest per LOINC) for the Details rail card.
  useEffect(() => {
    let cancelled = false
    async function loadVitals() {
      try {
        const obs = await db.observations
          .where('subject.reference')
          .equals(`Patient/${patientId}`)
          .toArray()
        const latest = (code: string) =>
          obs
            .filter((o) => o.code.coding?.some((c) => c.code === code))
            .sort((a, b) => (b.meta.lastUpdated ?? '').localeCompare(a.meta.lastUpdated ?? ''))[0]
            ?.valueQuantity
        const h = latest(LOINC_HEIGHT)
        const w = latest(LOINC_WEIGHT)
        let bmi = '--'
        if (h?.value && w?.value) {
          const m = h.value / 100
          if (m > 0) bmi = (w.value / (m * m)).toFixed(1)
        }
        if (!cancelled) {
          setVitals({
            height: h ? `${h.value} ${h.unit}` : '--',
            weight: w ? `${w.value} ${w.unit}` : '--',
            bmi,
          })
        }
      } catch {
        // No local vitals — leave as '--'
      }
    }
    loadVitals()
    return () => { cancelled = true }
  }, [patientId])

  const handlePatientUpdated = useCallback((updated: FhirPatient) => {
    setPatient(updated)
  }, [])

  // Mirror a header-avatar photo change into local state (Hub already persisted it).
  const handlePhotoUpdated = useCallback(
    async (photoKey: string | null, lastUpdated?: string) => {
      setPatient((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          _ultranos: { ...prev._ultranos, photoUrl: photoKey ?? undefined },
          meta: { ...prev.meta, lastUpdated: lastUpdated ?? new Date().toISOString() },
        }
      })
    },
    [],
  )

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  // Error states
  if (!patient) {
    return (
      <div className="flex flex-col gap-4">
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

  const u = patient._ultranos
  const nameSegments = [
    [u.nameGiven, u.nameFamily].filter(Boolean).join(' '),
    u.nameFather,
    u.nameGrandfather,
  ].filter((s): s is string => !!s && s.trim().length > 0)
  const displayName = nameSegments.length > 0 ? nameSegments.join(' · ') : (u.nameLocal ?? '--')
  const phone = patient.telecom?.find((tc) => tc.system === 'phone')?.value
  const meta = [
    patient.gender ?? undefined,
    computeAge(patient),
    phone,
    `ID …${patient.id.slice(0, 8)}`,
    u.bloodGroup ? `${tPatient('detailBlood')} ${u.bloodGroup}` : undefined,
  ].filter(Boolean).join(' · ')

  const tabs: { key: ChartTab; label: string }[] = [
    { key: 'timeline', label: tPatient('tabTimeline') },
    { key: 'encounters', label: tPatient('tabEncounters') },
    { key: 'results', label: tPatient('tabResults') },
    { key: 'medications', label: tPatient('tabMedications') },
    { key: 'documents', label: tPatient('tabDocuments') },
  ]

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Command island: allergy strip (Rule #4) + compact identity + tabs */}
      <section className="sticky top-[4.5rem] z-20 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_6px_24px_-12px_rgba(0,0,0,0.18)]">
        <AllergyBanner
          patientId={patientId}
          hubHasAllergies={u?.hasAllergies ?? false}
          className="!mb-0 !rounded-none !shadow-none !ring-0 border-b border-border"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <PatientAvatar
            patient={patient}
            patientId={patientId}
            size={44}
            onPhotoUpdated={handlePhotoUpdated}
          />
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-foreground" dir="auto">{displayName}</h2>
            <p className="truncate text-xs font-medium text-muted-foreground tabular-nums">{meta}</p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <Button variant="ghost" type="button" onClick={() => setEditModalOpen(true)} aria-label="Edit patient profile">
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
        </div>
        <div
          className="flex flex-wrap gap-2 border-t border-border px-3 py-2"
          role="tablist"
          aria-label={tPatient('timelineTitle')}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* Secondary safety banners — allergy is in the island; the low-priority
          biometric nudge is demoted here below it (Rule #4 kept). */}
      <PatientBannerStack patient={patient} patientId={patientId} omitAllergy />

      {/* Two-column: active tab panel + quick-reference rail */}
      <div className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          {activeTab === 'timeline' && <PatientTimeline patientId={patientId} />}
          {activeTab === 'encounters' && (
            <section aria-label={tPatient('encounterHistory')}>
              <EncounterHistoryList patientId={patientId} />
            </section>
          )}
          {activeTab === 'results' && (
            <section aria-label={tPatient('labResultsSection')}>
              <PatientResultTimeline patientId={patientId} />
            </section>
          )}
          {activeTab === 'medications' && <ActiveMedicationsList patientId={patientId} />}
          {activeTab === 'documents' && (
            <div className="flex min-h-[16rem] items-center justify-center rounded-2xl border border-border bg-card shadow-card">
              <EmptyState icon={FileText} title={tPatient('noDocuments')} />
            </div>
          )}
        </div>

        <aside
          className="mt-4 flex flex-col gap-4 lg:mt-0"
          aria-label={tPatient('contextRailLabel')}
        >
          {/* Allergies */}
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <h3 className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tPatient('railAllergies')}
            </h3>
            {allergies.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">{tPatient('railNoKnownAllergies')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {allergies.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-foreground" dir="auto">
                      {a.code?.text ?? a._ultranos?.substanceFreeText ?? '—'}
                    </span>
                    {a.criticality && (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        {String(a.criticality)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Active medications (reuses the shared list) */}
          <ActiveMedicationsList patientId={patientId} />

          {/* Details */}
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <h3 className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tPatient('railDetails')}
            </h3>
            <dl className="divide-y divide-border">
              {[
                { label: tPatient('detailHeight'), value: vitals.height },
                { label: tPatient('detailWeight'), value: vitals.weight },
                { label: tPatient('detailBmi'), value: vitals.bmi },
                { label: tPatient('detailBlood'), value: u.bloodGroup ?? '--' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-semibold text-foreground tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>

      <PatientEditModal
        open={editModalOpen}
        patient={patient}
        patientId={patientId}
        onClose={() => setEditModalOpen(false)}
        onSaved={handlePatientUpdated}
      />
    </div>
  )
}
