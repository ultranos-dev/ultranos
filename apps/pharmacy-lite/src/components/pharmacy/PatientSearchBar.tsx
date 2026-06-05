'use client'

import { useTranslations } from 'next-intl'
import { usePatientSearch } from '@/hooks/usePatientSearch'
import { PatientSearchResults } from './PatientSearchResults'
import type { LocalPatient } from '@/lib/db'

interface PatientSearchBarProps {
  onSelectPatient: (patient: LocalPatient) => void
  onRegisterNew: (prefillName?: string) => void
}

export function PatientSearchBar({ onSelectPatient, onRegisterNew }: PatientSearchBarProps) {
  const t = useTranslations('patientSearch')
  const { query, setQuery, results, isSearching, hasSearched } = usePatientSearch()

  return (
    <div className="relative" data-testid="patient-search-bar">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('placeholder')}
          className="w-full rounded-lg border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
          data-testid="patient-search-input"
          autoComplete="off"
        />
        {isSearching && (
          <div className="absolute end-3 top-1/2 -translate-y-1/2">
            <span className="inline-block h-4 w-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-primary-200 border-t-primary-600" />
          </div>
        )}
      </div>

      {hasSearched && (
        <PatientSearchResults
          results={results}
          query={query}
          onSelect={onSelectPatient}
          onRegisterNew={() => onRegisterNew(query)}
        />
      )}
    </div>
  )
}
