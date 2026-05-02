'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SearchInput } from '@/components/search-input'
import { PatientResultList } from '@/components/patient-result-list'
import { usePatientStore } from '@/stores/patient-store'
import { usePatientSearch } from '@/lib/use-patient-search'
import { NotificationBell } from '@/components/NotificationPanel'
import { SyncPulse } from '@/components/SyncPulse'
import { SyncDashboard } from '@/components/SyncDashboard'
import type { FhirPatient } from '@ultranos/shared-types'

export default function PatientSearchPage() {
  const router = useRouter()
  const { query, results, isSearching, selectPatient } = usePatientStore()
  const { search } = usePatientSearch()

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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900">
            Patient Search
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Search by name or National ID to start an encounter
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncPulse />
          <NotificationBell />
        </div>
      </header>
      <SyncDashboard />

      <SearchInput value={query} onChange={handleQueryChange} />

      <section className="mt-4">
        <PatientResultList
          results={results}
          isSearching={isSearching}
          onSelect={handleSelect}
        />
      </section>
    </main>
  )
}
