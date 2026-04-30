'use client'

import type { FhirPatient } from '@ultranos/shared-types'
import { PillButton } from './pill-button'

interface PatientResultListProps {
  results: FhirPatient[]
  isSearching: boolean
  onSelect: (patient: FhirPatient) => void
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

export function PatientResultList({ results, isSearching, onSelect }: PatientResultListProps) {
  if (isSearching) {
    return (
      <div className="flex items-center justify-center py-8" role="status">
        <span className="font-semibold text-neutral-500">Searching...</span>
      </div>
    )
  }

  if (results.length === 0) {
    return null
  }

  return (
    <ul className="divide-y divide-neutral-100" role="list" aria-label="Patient search results">
      {results.map((patient) => {
        const identifier = getIdentifier(patient)
        return (
          <li
            key={patient.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-neutral-900">
                {getDisplayName(patient)}
              </p>
              <p className="text-sm font-semibold text-neutral-500">
                {patient.gender ?? 'Unknown'} &middot; {formatAge(patient.birthDate, patient.birthYearOnly)}
                {identifier && (
                  <span className="ms-2">{identifier}</span>
                )}
              </p>
            </div>
            <PillButton onClick={() => onSelect(patient)}>
              Select
            </PillButton>
          </li>
        )
      })}
    </ul>
  )
}
