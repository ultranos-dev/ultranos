'use client'

import { useTranslations } from 'next-intl'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
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
        <SearchInput
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('placeholder')}
          className="w-full"
          data-testid="patient-search-input"
          autoComplete="off"
        />
        {isSearching && (
          <div className="absolute end-11 top-1/2 -translate-y-1/2">
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
