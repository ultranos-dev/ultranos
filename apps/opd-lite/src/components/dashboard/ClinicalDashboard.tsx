'use client'

import { useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { usePatientStore } from '@/stores/patient-store'
import { usePatientSearch } from '@/lib/use-patient-search'
import { SearchInput } from '@/components/search-input'
import { PatientResultList } from '@/components/patient-result-list'
import Link from 'next/link'
import { PillButton } from '@/components/pill-button'
import { TodayEncountersCard } from './TodayEncountersCard'
import { PendingLabResultsCard } from './PendingLabResultsCard'
import { UnresolvedConflictsCard } from './UnresolvedConflictsCard'
import { DuplicateReviewsCard } from './DuplicateReviewsCard'
import { RecentEncountersList } from './RecentEncountersList'
import type { FhirPatient } from '@ultranos/shared-types'

function formatRole(role: string): string {
  if (!role) return 'Clinician'
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

export function ClinicalDashboard() {
  const router = useRouter()
  const t = useTranslations('dashboard')
  const session = useAuthSessionStore((s) => s.session)
  const { query, results, isSearching, selectPatient } = usePatientStore()
  const { search } = usePatientSearch()
  const searchRef = useRef<HTMLDivElement>(null)

  const handleQueryChange = useCallback(
    (value: string) => {
      search(value)
    },
    [search]
  )

  const handleSelect = useCallback(
    (patient: FhirPatient) => {
      selectPatient(patient)
      router.push(`/encounter/${patient.id}`)
    },
    [selectPatient, router]
  )

  const handleStartEncounter = useCallback(() => {
    searchRef.current?.querySelector('input')?.focus()
  }, [])

  const displayName = session?.name || session?.email?.split('@')[0] || 'Clinician'
  const displayRole = formatRole(session?.role ?? '')

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* Welcome message */}
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-neutral-900">
          {t('welcome', { name: displayName })}
        </h1>
        <p className="mt-1 text-sm font-semibold text-neutral-500">
          {displayRole}
        </p>
      </div>

      {/* Primary CTAs */}
      <div className="mb-8 flex items-center gap-3">
        <PillButton onClick={handleStartEncounter}>
          {t('startEncounter')}
        </PillButton>
        <Link
          href="/register-patient"
          className="inline-flex items-center gap-2 rounded-pill bg-pill-green px-5 py-2 text-sm font-semibold text-pill-text transition-all duration-100 ease-out hover:brightness-[1.04] active:brightness-[0.88] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
        >
          {t('registerNew')}
        </Link>
      </div>

      {/* Inline patient search */}
      <section className="mb-8" ref={searchRef}>
        <SearchInput value={query} onChange={handleQueryChange} />
        {(results.length > 0 || isSearching || query.length > 0) && (
          <div className="mt-2">
            <PatientResultList
              results={results}
              isSearching={isSearching}
              onSelect={handleSelect}
              query={query}
            />
          </div>
        )}
      </section>

      {/* Summary cards grid */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TodayEncountersCard />
        <PendingLabResultsCard />
        <UnresolvedConflictsCard />
        <DuplicateReviewsCard />
      </section>

      {/* Recent encounters */}
      <section>
        <RecentEncountersList />
      </section>
    </main>
  )
}
