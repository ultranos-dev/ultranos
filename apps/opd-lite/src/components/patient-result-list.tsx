'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { FhirPatient } from '@ultranos/shared-types'
import { PillButton } from './pill-button'

interface PatientResultListProps {
  results: FhirPatient[]
  isSearching: boolean
  onSelect: (patient: FhirPatient) => void
  query?: string
}

function formatAge(birthDate?: string, birthYearOnly?: boolean): string {
  if (!birthDate) return 'Unknown age'
  const birth = new Date(birthDate)
  const now = new Date()
  if (birthYearOnly) {
    return `~${now.getFullYear() - birth.getFullYear()}y`
  }
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return `${age}y`
}

function getDisplayName(patient: FhirPatient): string {
  return patient._ultranos?.nameLocal || patient.name?.[0]?.text || 'Unknown'
}

function getIdentifier(patient: FhirPatient): string | null {
  const natId = patient.identifier?.find((id) => id.system === 'UAE_NATIONAL_ID' || id.system === 'PASSPORT')
  if (!natId) return null
  // Don't display hash fragments (length > 40) or expose short values fully
  if (natId.value.length > 40) return `${natId.system}: [hashed]`
  if (natId.value.length <= 4) return `${natId.system}: ****`
  return `${natId.system}: ***${natId.value.slice(-4)}`
}

export function PatientResultList({ results, isSearching, onSelect, query }: PatientResultListProps) {
  const t = useTranslations('patient')
  const tReg = useTranslations('registration')

  if (isSearching) {
    return (
      <div className="flex items-center justify-center gap-2 py-8" role="status">
        <svg className="h-4 w-4 animate-spin text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
        </svg>
        <span className="font-semibold text-muted-foreground">{t('loading')}</span>
      </div>
    )
  }

  if (results.length === 0) {
    if (!query) return null
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {t('noResults')}
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .result-item {
          animation: fadeInUp 200ms ease-out forwards;
          opacity: 0;
        }
      `}</style>
      <ul className="divide-y divide-border" role="list" aria-label={t('searchResults')}>
        {results.map((patient, index) => {
          const identifier = getIdentifier(patient)
          return (
            <li
              key={patient.id}
              className="result-item flex items-center justify-between gap-4 px-4 py-3"
              style={{ animationDelay: `${index * 40}ms` }}
            >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground">
                {getDisplayName(patient)}
              </p>
              <p className="text-sm font-semibold text-muted-foreground">
                {patient.gender ?? t('unknownGender')} &middot; {formatAge(patient.birthDate, patient.birthYearOnly)}
                {identifier && (
                  <span className="ms-2">{identifier}</span>
                )}
              </p>
            </div>
            <PillButton onClick={() => onSelect(patient)}>
              {t('select')}
            </PillButton>
          </li>
        )
        })}
      </ul>
      {results.length < 3 && (
        <Link
          href={`/register-patient${query ? `?nameGiven=${encodeURIComponent(query)}` : ''}`}
          className="mt-4 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors min-h-[44px]"
        >
          {tReg('registerNew')}
        </Link>
      )}
    </>
  )
}
