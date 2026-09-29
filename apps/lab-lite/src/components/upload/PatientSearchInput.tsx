'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  PatientSearchBar,
  type PatientSearchResult,
} from '@ultranos/patient-kit/components/search/patient-search-bar'
import { makePatientSearchAdapter } from '@/lib/patient-search-adapter'
import type { PatientSearchItem } from '@/hooks/usePatientSearch'

interface PatientSearchInputProps {
  token: string
  onSelect: (patient: PatientSearchItem) => void
}

/**
 * Lab patient search — the shared `PatientSearchBar` (identical bar app-wide):
 * as-you-type match highlighting + list-tier results (first name + age + photo,
 * Rule #7). Data + Hub-error surfacing come from the token-bound lab adapter.
 */
export function PatientSearchInput({ token, onSelect }: PatientSearchInputProps) {
  const t = useTranslations('verification')
  const search = useMemo(() => makePatientSearchAdapter(token), [token])

  return (
    <div>
      <label className="text-sm font-medium text-foreground">{t('searchPatients')}</label>
      <div className="mt-1">
        <PatientSearchBar
          search={search}
          onSelect={(r: PatientSearchResult) => onSelect(r.raw as PatientSearchItem)}
          placeholder={t('searchPatientsPlaceholder')}
          searchingLabel={t('searching')}
          noResultsLabel={t('noSearchResults')}
          hubUnavailableLabel={t('hubSearchUnavailable')}
          minChars={2}
          clearOnSelect
          registerNewThreshold={0}
        />
      </div>
    </div>
  )
}
