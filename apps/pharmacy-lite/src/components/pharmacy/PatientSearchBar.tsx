'use client'

import { useTranslations } from 'next-intl'
import {
  PatientSearchBar as SharedPatientSearchBar,
  type PatientSearchResult,
} from '@ultranos/patient-kit/components/search/patient-search-bar'
import { searchPatientsAdapter } from '@/lib/patient-search-adapter'
import { getPatientPhotoUrl } from '@/lib/patient-photo-api'
import type { LocalPatient } from '@/lib/db'

interface PatientSearchBarProps {
  onSelectPatient: (patient: LocalPatient) => void
  onRegisterNew: (prefillName?: string) => void
}

/**
 * Pharmacy patient search — now the shared `PatientSearchBar` (identical to every
 * other app): as-you-type match highlighting, photos, and name / phone / patient-ID
 * search (National ID resolved via the Hub). Data comes from the pharmacy adapter.
 */
export function PatientSearchBar({ onSelectPatient, onRegisterNew }: PatientSearchBarProps) {
  const t = useTranslations('patientSearch')

  return (
    <div data-testid="patient-search-bar">
      <SharedPatientSearchBar
        search={searchPatientsAdapter}
        onSelect={(r: PatientSearchResult) => onSelectPatient(r.raw as LocalPatient)}
        onRegisterNew={(q) => onRegisterNew(q)}
        resolvePhotoUrl={getPatientPhotoUrl}
        placeholder={t('placeholder')}
        searchingLabel={t('searching')}
        noResultsLabel={t('noResults')}
        registerNewLabel={t('registerNew')}
        allergyLabel={t('allergies')}
        minChars={2}
        debounceMs={300}
        inputClassName="h-9 rounded-full"
        data-testid="patient-search-input"
      />
    </div>
  )
}
