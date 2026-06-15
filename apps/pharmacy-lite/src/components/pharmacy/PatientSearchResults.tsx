'use client'

import { Badge } from '@/components/ui/badge'
import type { LocalPatient } from '@/lib/db'

interface PatientSearchResultsProps {
  results: LocalPatient[]
  query: string
  onSelect: (patient: LocalPatient) => void
  onRegisterNew: () => void
}

export function PatientSearchResults({
  results,
  query,
  onSelect,
  onRegisterNew,
}: PatientSearchResultsProps) {
  if (results.length === 0) {
    return (
      <div
        className="mt-2 rounded-2xl border border-border bg-card p-4"
        data-testid="patient-no-results"
      >
        <p className="text-sm text-muted-foreground">
          No patients found for &ldquo;{query}&rdquo;
        </p>
        <button
          type="button"
          onClick={onRegisterNew}
          className="mt-2 text-sm font-semibold text-primary-700 hover:text-primary-800"
          data-testid="register-new-patient-link"
        >
          + Register new patient
        </button>
      </div>
    )
  }

  return (
    <ul
      className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="patient-search-results"
      role="listbox"
    >
      {results.map((patient) => (
        <li
          key={patient.id}
          role="option"
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent transition-colors"
          onClick={() => onSelect(patient)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(patient) } }}
          tabIndex={0}
          data-testid={`patient-result-${patient.id}`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {patient.nameGiven}
              {patient.nameFather ? ` ${patient.nameFather}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              {patient.gender}{patient.birthYear ? ` | ${new Date().getFullYear() - patient.birthYear} y/o` : ''}
              {patient.phone ? ` | ${patient.phone}` : ''}
            </p>
          </div>
          {patient.allergies && patient.allergies.length > 0 && (
            <Badge variant="outline" className="ms-2 bg-destructive/10 text-destructive border-destructive/20 font-bold">
              ALLERGIES
            </Badge>
          )}
        </li>
      ))}
      {results.length < 5 && (
        <li className="px-4 py-3 bg-muted">
          <button
            type="button"
            onClick={onRegisterNew}
            className="text-sm font-semibold text-primary-700 hover:text-primary-800"
            data-testid="register-new-from-results"
          >
            + Register new patient
          </button>
        </li>
      )}
    </ul>
  )
}
