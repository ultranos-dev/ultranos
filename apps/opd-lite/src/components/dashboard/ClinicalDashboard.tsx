'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { usePatientStore } from '@/stores/patient-store'
import { usePatientSearch } from '@/lib/use-patient-search'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { PatientResultList } from '@/components/patient-result-list'
import { Button } from '@/components/ui/Button'
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
  const tCommon = useTranslations('common')
  const session = useAuthSessionStore((s) => s.session)
  const { query, results, isSearching, selectPatient } = usePatientStore()
  const { search } = usePatientSearch()
  const searchRef = useRef<HTMLDivElement>(null)

  // Local immediate input value; the actual search (Dexie decrypt-and-filter) is
  // debounced 250ms so it does not run on every keystroke. Preserves the debounce
  // behaviour previously baked into the app-local SearchInput component.
  const [inputValue, setInputValue] = useState(query)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the input in sync when the store query is reset externally (e.g. after
  // selecting a patient clears the query).
  useEffect(() => {
    setInputValue(query)
  }, [query])

  const handleQueryChange = useCallback(
    (value: string) => {
      setInputValue(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        search(value)
      }, 250)
    },
    [search]
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

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
    <div className="flex flex-col gap-4">
      {/* Greeting (page title is the shell BreadcrumbHeader, not an h1 here) */}
      <div>
        <p className="text-base font-semibold text-foreground">
          {t('welcome', { name: displayName })}
        </p>
        <p className="text-sm text-muted-foreground">{displayRole}</p>
      </div>

      {/* Primary CTAs */}
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={handleStartEncounter}>
          {t('findPatient')}
        </Button>
        <Button variant="outline" onClick={() => router.push('/register-patient')}>
          {t('registerNew')}
        </Button>
      </div>

      {/* Inline patient search */}
      <section ref={searchRef}>
        <SearchInput
          type="search"
          value={inputValue}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAriaLabel')}
          searchLabel={tCommon('search')}
          inputClassName="h-9 rounded-full"
        />
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
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UnresolvedConflictsCard />
        <TodayEncountersCard />
        <PendingLabResultsCard />
        <DuplicateReviewsCard />
      </section>

      {/* Recent encounters */}
      <section>
        <RecentEncountersList />
      </section>
    </div>
  )
}
