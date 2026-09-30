'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { usePatientStore } from '@/stores/patient-store'
import { PatientSearchBar, type PatientSearchResult } from '@ultranos/patient-kit/components/search/patient-search-bar'
import { searchPatientsAdapter } from '@/lib/patient-search-adapter'
import { getPatientPhotoUrl } from '@/lib/patient-photo-api'
import { PatientCreateModal } from '@/components/patient/PatientCreateModal'
import { PatientQrScannerModal } from '@/components/patient/PatientQrScannerModal'
import { Button } from '@/components/ui/Button'
import { QrCode } from '@ultranos/ui-kit/icons'
import { ResumeEncounterStrip } from './ResumeEncounterStrip'
import { AttentionStrip } from './AttentionStrip'
import type { FhirPatient } from '@ultranos/shared-types'

function formatRole(role: string): string {
  if (!role) return 'Clinician'
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

export function ClinicalDashboard() {
  const router = useRouter()
  const t = useTranslations('dashboard')
  const tCommon = useTranslations('common')
  const tPatient = useTranslations('patient')
  const tReg = useTranslations('registration')
  const locale = useLocale()
  const session = useAuthSessionStore((s) => s.session)
  const selectPatient = usePatientStore((s) => s.selectPatient)
  const searchRef = useRef<HTMLDivElement>(null)

  // Register-new-patient modal (opened in place; the /register-patient route also
  // hosts this same modal for the nav link / bookmarks / deep-links).
  const [createOpen, setCreateOpen] = useState(false)
  const [createPrefill, setCreatePrefill] = useState('')

  // Scan a patient's Health Passport QR (from the Patient Lite mobile app) →
  // route straight to that patient's encounter.
  const [scanOpen, setScanOpen] = useState(false)
  const handleScanned = useCallback(
    (patientId: string) => {
      setScanOpen(false)
      router.push(`/encounter/${patientId}`)
    },
    [router],
  )

  // ⌘K / Ctrl+K focuses the launcher search from anywhere on the dashboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        searchRef.current?.querySelector('input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSelect = useCallback(
    (result: PatientSearchResult) => {
      const patient = result.raw as FhirPatient
      selectPatient(patient)
      router.push(`/encounter/${patient.id}`)
    },
    [selectPatient, router]
  )

  const displayName = session?.name || session?.email?.split('@')[0] || 'Clinician'
  const displayRole = formatRole(session?.role ?? '')

  let dateLabel = ''
  try {
    dateLabel = new Date().toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  } catch {
    dateLabel = ''
  }

  return (
    // Full-width page root (never capped) — the calm-launcher hero is centered
    // *within* it, so the page still spans the shell, it is not a boxed page.
    <div className="flex flex-1 flex-col items-center">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 pt-10 text-center md:pt-16">
        {/* Greeting — the hero. Shell breadcrumb still shows "Dashboard". */}
        <div className="flex flex-col gap-1">
          {dateLabel && (
            <p className="text-sm font-medium text-muted-foreground font-numeric">{dateLabel}</p>
          )}
          <h1 className="text-2xl font-semibold text-foreground">
            {t('welcome', { name: displayName })}
          </h1>
          <p className="text-sm text-muted-foreground">{displayRole}</p>
        </div>

        {/* Command search — the primary focus of the calm launcher.
            Uses the shared PatientSearchBar (name / patient ID / National ID,
            with as-you-type highlighting) so search is identical app-wide. */}
        <section ref={searchRef} className="w-full text-start">
          <div className="relative">
            <PatientSearchBar
              search={searchPatientsAdapter}
              onSelect={handleSelect}
              onRegisterNew={(q) => { setCreatePrefill(q); setCreateOpen(true) }}
              resolvePhotoUrl={getPatientPhotoUrl}
              placeholder={t('searchPlaceholder')}
              searchLabel={tCommon('search')}
              searchingLabel={tPatient('loading')}
              noResultsLabel={tPatient('noResults')}
              registerNewLabel={tReg('registerNew')}
              allergyLabel={tPatient('allergies')}
              inputClassName="h-14 rounded-2xl text-base ps-4 pe-24"
            />
            <kbd
              className="pointer-events-none absolute end-14 top-7 hidden -translate-y-1/2 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground sm:inline-block"
              aria-hidden="true"
            >
              ⌘K
            </kbd>
          </div>
        </section>

        {/* Secondary actions */}
        <div className="flex items-center justify-center gap-3">
          <Button variant="primary" onClick={() => { setCreatePrefill(''); setCreateOpen(true) }}>
            {t('registerNew')}
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setScanOpen(true)}>
            <QrCode className="h-4 w-4" aria-hidden="true" />
            {t('scanQr')}
          </Button>
          <Button variant="outline" onClick={() => router.push('/appointments')}>
            {t('appointments')}
          </Button>
        </div>

        {/* Resume in-progress encounter (renders only when one exists) */}
        <div className="w-full text-start">
          <ResumeEncounterStrip />
        </div>

        {/* Compact attention line (replaces the four equal stat cards) */}
        <AttentionStrip />
      </div>

      <PatientCreateModal
        open={createOpen}
        prefilledNameGiven={createPrefill}
        onClose={() => setCreateOpen(false)}
      />

      <PatientQrScannerModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={handleScanned}
      />
    </div>
  )
}
